/** Korean-aware + English tokenization for same-event matching. No OpenAI. */

const EN_STOPWORDS = new Set([
  "a",
  "an",
  "the",
  "of",
  "in",
  "on",
  "to",
  "for",
  "and",
  "or",
  "with",
  "as",
  "at",
  "by",
  "from",
  "after",
  "over",
  "under",
  "into",
  "about",
  "new",
  "says",
  "said",
  "say",
  "report",
  "reports",
  "latest",
  "update",
  "updates",
  "breaking",
  "watch",
  "here",
  "how",
  "why",
  "what",
  "who",
  "his",
  "her",
  "its",
  "their",
  "this",
  "that",
  "will",
  "has",
  "have",
  "been",
  "are",
  "was",
  "were",
  "may",
  "make",
  "your",
  "body",
  "years",
  "just",
  "into",
  "against",
  "being",
]);

/** Particles / boilerplate — drop. Keep 대통령·정부·국회·법원 as entities. */
const KR_STOPWORDS = new Set([
  "기자",
  "속보",
  "단독",
  "종합",
  "오늘",
  "내일",
  "지난",
  "관련",
  "대해",
  "위한",
  "통해",
  "것으로",
  "있다",
  "한다",
  "했다",
  "밝혔다",
  "보도",
  "전했다",
  "이라며",
  "등에",
  "및",
  "또",
  "등",
  "이번",
  "이날",
  "가운데",
  "따르면",
  "이라고",
  "하는",
  "된",
  "한",
  "그",
  "이",
  "저",
  "것",
  "수",
  "등",
  "더",
  "못",
  "안",
  "와",
  "과",
  "을",
  "를",
  "은",
  "는",
  "가",
  "도",
  "만",
  "까지",
  "부터",
  "에서",
  "으로",
  "로",
  "의",
]);

/** Always keep even if short/common. */
export const KR_ENTITY_KEEP = new Set([
  "대통령",
  "정부",
  "국회",
  "법원",
  "경찰",
  "검찰",
  "국방부",
  "외교부",
  "청와대",
  "백악관",
  "트럼프",
  "이준석",
  "오세훈",
  "한동훈",
  "장동혁",
  "유시민",
  "김민석",
  "개혁신당",
  "민주당",
  "국민의힘",
]);

const EVENT_VERBS_EN = [
  "resign",
  "resignation",
  "collapse",
  "sanctions",
  "sanction",
  "arrest",
  "arrests",
  "wildfire",
  "wildfires",
  "storm",
  "tariff",
  "tariffs",
  "verdict",
  "indict",
  "killed",
  "death",
  "evacuate",
  "negotiat",
  "warn",
  "warning",
];

const EVENT_VERBS_KR = [
  "사퇴",
  "총사퇴",
  "결렬",
  "제재",
  "검거",
  "체포",
  "산불",
  "화재",
  "판결",
  "기소",
  "사망",
  "실종",
  "구조",
  "지지율",
  "발표",
  "경고",
  "직격",
  "비판",
  "사임",
  "수용",
];

function normalizeToken(token: string): string {
  let t = token.toLowerCase().normalize("NFKC");
  // Light English plural fold (fires↔fire, indonesians↔indonesian)
  if (!isHangul(t) && t.length > 4 && t.endsWith("s") && !t.endsWith("ss")) {
    t = t.slice(0, -1);
  }
  // Korean event verb family
  if (t === "총사퇴") t = "사퇴";
  if (t === "사임") t = "사퇴";
  if (t === "wildfire") t = "fire";
  if (t === "forest") t = "fire"; // weak; still helps wildfire/forest fires
  return t;
}

function isHangul(token: string): boolean {
  return /[가-힣]/.test(token);
}

function isStopword(token: string): boolean {
  if (KR_ENTITY_KEEP.has(token)) return false;
  if (isHangul(token)) return KR_STOPWORDS.has(token);
  return EN_STOPWORDS.has(token);
}

function minTokenLength(token: string): number {
  if (KR_ENTITY_KEEP.has(token)) return 2;
  if (isHangul(token)) return 2;
  return 4;
}

/** Significant content tokens (KR 2+, EN 4+, entities kept). */
export function significantStoryTokens(text: string): string[] {
  const normalized = text
    .toLowerCase()
    .normalize("NFKC")
    .replace(/['’]/g, "");
  const raw = normalized.split(/[^a-z0-9가-힣]+/i).map((t) => t.trim());
  const out: string[] = [];
  for (const token of raw) {
    if (!token) continue;
    const normalized = normalizeToken(token);
    if (isStopword(normalized) || isStopword(token)) continue;
    if (normalized.length < minTokenLength(normalized)) continue;
    out.push(normalized);
  }
  return [...new Set(out)];
}

/** Looser tokens for entity overlap (EN 3+). */
export function entityStoryTokens(text: string): string[] {
  const normalized = text
    .toLowerCase()
    .normalize("NFKC")
    .replace(/['’]/g, "");
  const raw = normalized.split(/[^a-z0-9가-힣]+/i).map((t) => t.trim());
  const out: string[] = [];
  for (const token of raw) {
    if (!token) continue;
    const n = normalizeToken(token);
    if (isStopword(n) || isStopword(token)) continue;
    if (/^\d+$/.test(n)) continue;
    const min = isHangul(n) || KR_ENTITY_KEEP.has(n) ? 2 : 3;
    if (n.length < min) continue;
    out.push(n);
  }
  return [...new Set(out)];
}

export function extractSignificantNumbers(text: string): Set<string> {
  const nums = text.match(/\d{1,4}/g) ?? [];
  return new Set(nums.filter((n) => Number(n) >= 2));
}

export function extractEventMarkers(text: string): Set<string> {
  const lower = text.toLowerCase().normalize("NFKC");
  const markers = new Set<string>();
  for (const v of EVENT_VERBS_EN) {
    if (lower.includes(v)) markers.add(v);
  }
  for (const v of EVENT_VERBS_KR) {
    if (lower.includes(v)) markers.add(v);
  }
  return markers;
}

export function jaccardFromSets(a: Set<string>, b: Set<string>): number {
  if (a.size === 0 || b.size === 0) return 0;
  let shared = 0;
  for (const t of a) {
    if (b.has(t)) shared += 1;
  }
  const union = a.size + b.size - shared;
  return union === 0 ? 0 : shared / union;
}

export function sharedCount(a: Iterable<string>, b: Set<string>): number {
  let n = 0;
  for (const t of a) {
    if (b.has(t)) n += 1;
  }
  return n;
}

export function hoursBetween(a?: string | null, b?: string | null): number | null {
  if (!a?.trim() || !b?.trim()) return null;
  const ta = Date.parse(a);
  const tb = Date.parse(b);
  if (!Number.isFinite(ta) || !Number.isFinite(tb)) return null;
  return Math.abs(ta - tb) / 3_600_000;
}
