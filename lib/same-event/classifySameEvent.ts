import {
  sameEventSourceTrust,
  isYonhapKrRadarSource,
} from "@/lib/same-event/sourceTrust";
import {
  entityStoryTokens,
  extractEventMarkers,
  extractSignificantNumbers,
  hoursBetween,
  jaccardFromSets,
  KR_ENTITY_KEEP,
  sharedCount,
  significantStoryTokens,
} from "@/lib/same-event/tokens";

export type StoryRelation =
  | "same_event"
  | "update"
  | "different_angle"
  | "unrelated"
  | "ambiguous";

export type StoryConfidence = "high" | "medium" | "low";

export type StoryDoc = {
  title: string;
  summary?: string | null;
  /** Alternate language title (e.g. title_original / rss_title_ko). */
  titleAlt?: string | null;
  summaryAlt?: string | null;
  source?: string | null;
  publishedAt?: string | null;
  hasThumbnail?: boolean;
  id?: string;
};

export type SameEventClassification = {
  relation: StoryRelation;
  confidence: StoryConfidence;
  titleShared: number;
  titleJaccard: number;
  entityShared: number;
  eventShared: number;
  numberShared: number;
  hoursApart: number | null;
  sharedTokens: string[];
  reason: string;
  /** True when match used only weak cross-script overlap. */
  crossLanguageWeak: boolean;
};

const UPDATE_PAIR_PATTERNS: Array<[RegExp, RegExp]> = [
  [/기소/, /판결|선고|유죄|무죄/],
  [/실종/, /구조|사망|발견/],
  [/협상\s*시작|협상\s*개막|협상중/, /결렬|합의|타결/],
  [/발표/, /후속|조치|이행|시행/],
  [/indict/, /verdict|sentenc|convict/i],
  [/missing|abduct/, /rescued|killed|found/i],
  [/\b(talks?\s+begin|negotiations?\s+begin|talks?\s+open)/i, /\b(collapse|deal|agreement|fail)/i],
];

function asymmetricUpdatePair(aText: string, bText: string): boolean {
  for (const [p1, p2] of UPDATE_PAIR_PATTERNS) {
    const a1 = p1.test(aText);
    const a2 = p2.test(aText);
    const b1 = p1.test(bText);
    const b2 = p2.test(bText);
    // Require progression: one side early-stage only, other late-stage
    if (a1 && !a2 && b2 && !b1) return true;
    if (b1 && !b2 && a2 && !a1) return true;
  }
  return false;
}

const ANGLE_A = [
  /경제|시장|투자|환율|관세|예산|주가|유가/,
  /\b(econom|market|tariff|trade\s+impact|stocks?|oil\s+price)/i,
];
const ANGLE_B = [
  /외교|한미|정상회담|외무|대사/,
  /\b(diplomat|embassy|summit|foreign\s+minister|state\s+department)/i,
];
const ANGLE_C = [
  /검거|수사|체포|경찰|방화/,
  /\b(arrest|police|suspect|investigat|arson)/i,
];
const ANGLE_D = [
  /정부\s*반응|대통령\s*지시|청와대|공식\s*입장/,
  /\b(government\s+response|white\s+house|official\s+response)/i,
];
const ANGLE_E = [
  /발생|화재|산불|폭발|지진/,
  /\b(breaks?\s+out|wildfire|earthquake|explosion|disaster)/i,
];
const ANGLE_F = [
  /피해자|현장|주민|대피/,
  /\b(victim|evacuat|resident|on\s+the\s+ground)/i,
];

function combinedPrimary(doc: StoryDoc): string {
  return `${doc.title || ""}\n${doc.summary || ""}`.trim();
}

function combinedAll(doc: StoryDoc): string {
  return [
    doc.title,
    doc.summary,
    doc.titleAlt,
    doc.summaryAlt,
  ]
    .filter(Boolean)
    .join("\n");
}

function bestTitlePair(a: StoryDoc, b: StoryDoc): {
  shared: number;
  jaccard: number;
  sharedTokens: string[];
  usedAlt: boolean;
} {
  const pairs: Array<[string, string, boolean]> = [
    [a.title, b.title, false],
    [a.title, b.titleAlt || "", true],
    [a.titleAlt || "", b.title, true],
    [a.titleAlt || "", b.titleAlt || "", true],
  ];

  let best = { shared: 0, jaccard: 0, sharedTokens: [] as string[], usedAlt: false };
  for (const [ta, tb, usedAlt] of pairs) {
    if (!ta.trim() || !tb.trim()) continue;
    const setA = new Set(significantStoryTokens(ta));
    const setB = new Set(significantStoryTokens(tb));
    if (setA.size === 0 || setB.size === 0) continue;
    let shared = 0;
    const sharedTokens: string[] = [];
    for (const t of setA) {
      if (setB.has(t)) {
        shared += 1;
        sharedTokens.push(t);
      }
    }
    const jaccard = jaccardFromSets(setA, setB);
    if (
      shared > best.shared ||
      (shared === best.shared && jaccard > best.jaccard)
    ) {
      best = { shared, jaccard, sharedTokens, usedAlt };
    }
  }
  return best;
}

function hasAngleFrame(text: string, patterns: RegExp[]): boolean {
  return patterns.some((p) => p.test(text));
}

function angleBuckets(text: string): Set<string> {
  const buckets = new Set<string>();
  if (hasAngleFrame(text, ANGLE_A)) buckets.add("economy");
  if (hasAngleFrame(text, ANGLE_B)) buckets.add("diplomacy");
  if (hasAngleFrame(text, ANGLE_C)) buckets.add("investigation");
  if (hasAngleFrame(text, ANGLE_D)) buckets.add("gov_response");
  if (hasAngleFrame(text, ANGLE_E)) buckets.add("incident");
  if (hasAngleFrame(text, ANGLE_F)) buckets.add("human_impact");
  return buckets;
}

function isDifferentAngle(aText: string, bText: string, titleShared: number, entityShared: number): boolean {
  const ba = angleBuckets(aText);
  const bb = angleBuckets(bText);
  if (ba.size === 0 || bb.size === 0) return false;
  // Need some topical link
  if (titleShared < 1 && entityShared < 2) return false;
  let overlap = 0;
  for (const x of ba) {
    if (bb.has(x)) overlap += 1;
  }
  if (overlap === 0 && (titleShared >= 1 || entityShared >= 2)) return true;
  if (
    (ba.has("incident") && bb.has("investigation")) ||
    (bb.has("incident") && ba.has("investigation"))
  ) {
    return true;
  }
  if (
    (ba.has("incident") && bb.has("gov_response")) ||
    (bb.has("incident") && ba.has("gov_response"))
  ) {
    return true;
  }
  return false;
}

function isUpdatePair(aText: string, bText: string, numsA: Set<string>, numsB: Set<string>): boolean {
  if (asymmetricUpdatePair(aText, bText)) return true;

  // Poll / death-toll style: shared topic words + different numbers
  const tollLike =
    /지지율|approval|death toll|killed|사망|부상자|casualt|earthquake|지진/i.test(
      aText
    ) &&
    /지지율|approval|death toll|killed|사망|부상자|casualt|earthquake|지진/i.test(
      bText
    );
  if (tollLike) {
    const onlyA = [...numsA].filter((n) => !numsB.has(n));
    const onlyB = [...numsB].filter((n) => !numsA.has(n));
    if (onlyA.length > 0 && onlyB.length > 0) return true;
  }

  return false;
}

function looksCrossScriptOnly(a: StoryDoc, b: StoryDoc, titleShared: number): boolean {
  const aHangul = /[가-힣]/.test(a.title);
  const bHangul = /[가-힣]/.test(b.title);
  if (aHangul === bHangul) return false;
  // No usable alt title on the other language side
  const aHasAltLatin = a.titleAlt && /[a-z]/i.test(a.titleAlt) && !/[가-힣]/.test(a.titleAlt);
  const bHasAltLatin = b.titleAlt && /[a-z]/i.test(b.titleAlt) && !/[가-힣]/.test(b.titleAlt);
  const aHasAltKr = a.titleAlt && /[가-힣]/.test(a.titleAlt);
  const bHasAltKr = b.titleAlt && /[가-힣]/.test(b.titleAlt);
  if (aHangul && bHasAltKr) return false;
  if (bHangul && aHasAltKr) return false;
  if (!aHangul && bHasAltLatin) return false;
  if (!bHangul && aHasAltLatin) return false;
  return titleShared <= 1;
}

/**
 * Classify relationship between two stories.
 * Prefer UPDATE / ANGLE over SAME when signals conflict.
 * Ambiguous / low-confidence → do not auto-suppress.
 */
export function classifySameEvent(
  a: StoryDoc,
  b: StoryDoc
): SameEventClassification {
  const titlePair = bestTitlePair(a, b);
  const textA = combinedAll(a);
  const textB = combinedAll(b);
  const primaryA = combinedPrimary(a);
  const primaryB = combinedPrimary(b);

  const entA = new Set(entityStoryTokens(textA));
  const entB = new Set(entityStoryTokens(textB));
  const entityShared = sharedCount(entA, entB);

  const eventsA = extractEventMarkers(textA);
  const eventsB = extractEventMarkers(textB);
  let eventShared = 0;
  for (const e of eventsA) {
    if (eventsB.has(e)) eventShared += 1;
  }

  const numsA = extractSignificantNumbers(textA);
  const numsB = extractSignificantNumbers(textB);
  let numberShared = 0;
  for (const n of numsA) {
    if (numsB.has(n)) numberShared += 1;
  }

  const hours = hoursBetween(a.publishedAt, b.publishedAt);
  const crossLanguageWeak = looksCrossScriptOnly(a, b, titlePair.shared);

  const base = {
    titleShared: titlePair.shared,
    titleJaccard: Number(titlePair.jaccard.toFixed(3)),
    entityShared,
    eventShared,
    numberShared,
    hoursApart: hours,
    sharedTokens: titlePair.sharedTokens.slice(0, 12),
    crossLanguageWeak,
  };

  if (titlePair.shared === 0 && entityShared < 2) {
    return {
      ...base,
      relation: "unrelated",
      confidence: "high",
      reason: "no shared title/entity tokens",
    };
  }

  // UPDATE before SAME
  if (
    (titlePair.shared >= 1 || entityShared >= 2) &&
    isUpdatePair(textA, textB, numsA, numsB)
  ) {
    return {
      ...base,
      relation: "update",
      confidence: titlePair.shared >= 2 ? "high" : "medium",
      reason: "new facts/numbers/status change vs prior story",
    };
  }

  // DIFFERENT ANGLE
  if (
    (entityShared >= 2 || titlePair.shared >= 1) &&
    isDifferentAngle(primaryA, primaryB, titlePair.shared, entityShared)
  ) {
    return {
      ...base,
      relation: "different_angle",
      confidence: "high",
      reason: "shared topic but distinct editorial angle",
    };
  }

  // Clear SAME EVENT
  const strongTitle =
    titlePair.shared >= 3 && titlePair.jaccard >= 0.22;
  const mediumTitle =
    titlePair.shared >= 2 &&
    titlePair.jaccard >= 0.25 &&
    (entityShared >= 2 || eventShared >= 1);
  const entityEvent =
    entityShared >= 2 &&
    eventShared >= 1 &&
    titlePair.shared >= 1;
  const tightJaccard =
    titlePair.shared >= 4 ||
    (titlePair.jaccard >= 0.35 && titlePair.shared >= 2);
  // Named entity keep-list hit (이준석/개혁신당) + shared event verb
  const namedEntityHit =
    titlePair.sharedTokens.some((t) => KR_ENTITY_KEEP.has(t)) ||
    [...entA].some((t) => KR_ENTITY_KEEP.has(t) && entB.has(t));
  const namedEventSame =
    namedEntityHit && eventShared >= 1 && (titlePair.shared >= 1 || entityShared >= 2);

  const sameSignal =
    strongTitle || mediumTitle || entityEvent || tightJaccard || namedEventSame;

  if (sameSignal) {
    // Time window soft: very far apart + no event markers → ambiguous
    if (hours != null && hours > 72 && eventShared === 0 && titlePair.shared < 4) {
      return {
        ...base,
        relation: "ambiguous",
        confidence: "low",
        reason: "token overlap but >72h apart without shared event markers",
      };
    }

    if (crossLanguageWeak && !titlePair.usedAlt && titlePair.shared < 3) {
      return {
        ...base,
        relation: "ambiguous",
        confidence: "low",
        reason: "weak cross-language overlap without bilingual fields",
      };
    }

    const confidence: StoryConfidence =
      titlePair.shared >= 3 ||
      titlePair.jaccard >= 0.35 ||
      tightJaccard ||
      namedEventSame
        ? "high"
        : "medium";

    return {
      ...base,
      relation: "same_event",
      confidence,
      reason: `shared title tokens [${titlePair.sharedTokens.slice(0, 6).join(", ")}]`,
    };
  }

  if (titlePair.shared >= 2 || entityShared >= 3) {
    return {
      ...base,
      relation: "ambiguous",
      confidence: "low",
      reason: "partial overlap — allow rather than suppress",
    };
  }

  return {
    ...base,
    relation: "unrelated",
    confidence: "medium",
    reason: "insufficient overlap",
  };
}

/** True when collect/publish should treat as blocking SAME EVENT. */
export function isClearSameEvent(c: SameEventClassification): boolean {
  return c.relation === "same_event" && c.confidence === "high";
}

/** Soft publish warning (allow publish) — weak cross-lang or medium same. */
export function isSoftSameEventWarning(c: SameEventClassification): boolean {
  if (c.relation === "same_event" && c.confidence === "medium") return true;
  if (c.relation === "ambiguous" && c.crossLanguageWeak && c.entityShared >= 2) {
    return true;
  }
  return false;
}

export type RepresentativeScoreInput = StoryDoc & {
  title: string;
  summary?: string | null;
};

export function representativeScore(doc: RepresentativeScoreInput): number {
  const trust = sameEventSourceTrust(doc.source);
  // Radar never wins ties on trust alone
  const trustAdj = isYonhapKrRadarSource(doc.source) ? Math.min(trust, 35) : trust;
  const stamp = doc.publishedAt?.trim() || "";
  const time = Date.parse(stamp) || 0;
  const specificity =
    (doc.title?.trim().length ?? 0) + (doc.summary?.trim().length ?? 0);
  const thumb = doc.hasThumbnail ? 50_000 : 0;
  return trustAdj * 1_000_000 + time / 1000 + specificity * 10 + thumb;
}

/**
 * Return true if incoming should be suppressed because a better/equal
 * SAME EVENT story already exists.
 */
export function shouldSuppressIncomingSameEvent(
  incoming: StoryDoc,
  existing: StoryDoc,
  classification: SameEventClassification
): boolean {
  if (!isClearSameEvent(classification)) return false;
  // Prefer saving higher-trust / more specific incoming (e.g. Chosun over Radar)
  return representativeScore(incoming) <= representativeScore(existing);
}

export function findBestSameEventMatch<T extends StoryDoc>(
  incoming: StoryDoc,
  existing: T[]
): { match: T; classification: SameEventClassification } | null {
  let bestClear: { match: T; classification: SameEventClassification } | null =
    null;
  for (const row of existing) {
    const classification = classifySameEvent(incoming, row);
    if (!isClearSameEvent(classification)) continue;
    if (
      !bestClear ||
      classification.titleShared > bestClear.classification.titleShared ||
      (classification.titleShared === bestClear.classification.titleShared &&
        classification.titleJaccard > bestClear.classification.titleJaccard)
    ) {
      bestClear = { match: row, classification };
    }
  }
  return bestClear;
}

export function findSoftSameEventWarningMatch<T extends StoryDoc>(
  incoming: StoryDoc,
  existing: T[]
): { match: T; classification: SameEventClassification } | null {
  let best: { match: T; classification: SameEventClassification } | null = null;
  for (const row of existing) {
    const classification = classifySameEvent(incoming, row);
    if (!isSoftSameEventWarning(classification)) continue;
    if (
      !best ||
      classification.entityShared > best.classification.entityShared
    ) {
      best = { match: row, classification };
    }
  }
  return best;
}
