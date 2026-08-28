/**
 * Shared editorial policy signals (no OpenAI / no DB).
 * Canonical rules: /EDITORIAL_POLICY.md
 */

export type EditorialBeat =
  | "mega_event"
  | "us_politics_economy"
  | "kr_politics_economy"
  | "foreign_security"
  | "science_society_impact"
  | "soft_news"
  | "general";

export type EditorialSignalInput = {
  title?: string | null;
  summary?: string | null;
  source?: string | null;
  category?: string | null;
  source_country?: string | null;
};

function textOf(input: EditorialSignalInput): string {
  return `${input.title || ""}\n${input.summary || ""}\n${input.category || ""}`.trim();
}

function hasAny(text: string, patterns: RegExp[]): boolean {
  return patterns.some((p) => p.test(text));
}

/** Exception ladder — may outrank ordinary politics/economy. */
export const MEGA_EVENT_PATTERNS: RegExp[] = [
  /\b(earthquake|hurricane|typhoon|wildfire|flood|tsunami|volcano|landslide)\b/i,
  /\b(war\s+breaks|invasion|airstrike|missile\s+strike|martial\s+law|mass\s+casualt|genocide)\b/i,
  /\b(market\s+crash|bank\s+run|circuit\s+breaker|flash\s+crash|default\s+crisis|financial\s+shock)\b/i,
  /\b(plane\s+crash|ferry\s+sink|mine\s+collapse|explosion\s+kills|hundreds\s+dead|thousands\s+dead)\b/i,
  /(지진|태풍|산불|홍수|쓰나미|화산|전쟁\s*발발|침공|공습|계엄|대량\s*사상|증시\s*폭락|금융\s*충격|대형\s*참사)/,
];

const US_POLITICS_ECONOMY: RegExp[] = [
  /\b(white\s+house|congress|senate|house\s+of\s+representatives|capitol|president\s+trump|biden|harris|gop|democrat|republican|midterm|primar(y|ies)|electoral)\b/i,
  /\b(federal\s+reserve|the\s+fed\b|fomc|interest\s+rate|inflation|cpi\b|payrolls|nonfarm|tariff|section\s+301|trade\s+war|chip\s+act|ira\b)\b/i,
  /\b(wall\s+street|nasdaq|s&p|dow\s+jones|treasury\s+yield|dollar\s+index|crude\s+oil|opec)\b/i,
  /\b(north\s+korea|pyongyang|pentagon|state\s+department|sanctions)\b/i,
  /(백악관|미\s*의회|연준|금리|인플레|관세|미\s*대선|민주당|공화당|월가|달러|북한\s*정책|대북)/,
];

const KR_POLITICS_ECONOMY: RegExp[] = [
  /\b(national\s+assembly|yoon|lee\s+jae-?myung|seoul\s+politics|bank\s+of\s+korea|kospi|won\b)\b/i,
  /(국회|대통령실|여야|총선|대선|한국은행|기준금리|코스피|원\/달러|재정|예산안|검찰|특검)/,
];

const FOREIGN_SECURITY: RegExp[] = [
  /\b(nato|united\s+nations|\bun\b|geopolitics|embassy|diplomat|ceasefire|ukraine|gaza|taiwan\s+strait|south\s+china\s+sea)\b/i,
  /(외교|안보|나토|유엔|우크라이나|가자|대만|남중국해|한반도\s*안보)/,
];

const SCIENCE_SOCIETY_IMPACT: RegExp[] = [
  /\b(pandemic|vaccine\s+mandate|climate\s+policy|ai\s+regulation|cyberattack|data\s+breach|hospital\s+fire|school\s+shooting)\b/i,
  /(팬데믹|백신\s*정책|기후\s*정책|인공지능\s*규제|랜섬웨어|대규모\s*개인정보|병원\s*화재|총기\s*난사)/,
];

const SOFT_NEWS: RegExp[] = [
  /\b(royal\s+family|prince\s+harry|meghan|celebrity|red\s+carpet|box\s+office|k-pop|idol|gossip|lifestyle\s+tips|recipe|horoscope)\b/i,
  /(왕실|해리\s*왕자|메건|연예|가십|아이돌|예능|라이프스타일|맛집|운세)/,
];

/** Hard policy substance — soft gossip does not override these. */
const HARD_POLICY_SUBSTANCE: RegExp[] = [
  /\b(interest\s+rate|inflation|cpi\b|tariff|trade\s+war|sanctions|executive\s+order|bill\s+pass|fomc|payrolls|nonfarm|defense|troop|election\s+result|impeach)\b/i,
  /(금리|인플레|관세|제재|행정명령|법안\s*통과|고용\s*지표|방위비|선거\s*결과|탄핵)/,
];

const US_FOR_KR_RELEVANCE: RegExp[] = [
  /\b(korea|korean|seoul|busan|samsung|hyundai|sk\s+hynix|north\s+korea|pyongyang|us[- ]korea|washington[- ]seoul)\b/i,
  /\b(chip|semiconductor|tariff|auto\s+tariff|ira\b|defense\s+cost|troop|thaad|extended\s+deterrence)\b/i,
  /(한국|서울|삼성|현대|하이닉스|주한미군|방위비|반도체\s*수출|대미\s*관세|한미)/,
];

const TRIVIAL_POLITICS: RegExp[] = [
  /\b(says\s+he\s+is\s+watching|hints\s+at|may\s+consider|rumor|speculation|unnamed\s+source\s+says)\b/i,
  /(여야\s*설전|네\s*탓|공방만|단순\s*발언|의미\s*없는\s*설)/,
];

/** Corporate PR / thin ticker moves — never auto-best. */
const CORPORATE_PROMO_OR_THIN_MARKET: RegExp[] = [
  /\b(press\s+release|proud\s+to\s+announce|launches?\s+new\s+product|our\s+company|brand\s+campaign|sponsored)\b/i,
  /\b(shares?\s+(edge|tick)\s+(up|down)|stock\s+inches|minor\s+gain|closes?\s+flat)\b/i,
  /(보도자료|신제품\s*출시|홍보\s*자료|광고성|소폭\s*상승|소폭\s*하락|보합\s*마감)/,
];

export const VIEWPOINT_NEEDS_LABEL = "관점 구분 필요";

export function isMegaEvent(input: EditorialSignalInput): boolean {
  return hasAny(textOf(input), MEGA_EVENT_PATTERNS);
}

export function isCorporatePromoOrThinMarket(
  input: EditorialSignalInput
): boolean {
  const text = textOf(input);
  if (isMegaEvent(input)) return false;
  if (hasAny(text, HARD_POLICY_SUBSTANCE)) return false;
  return hasAny(text, CORPORATE_PROMO_OR_THIN_MARKET);
}

/**
 * Soft news wins even if a politics keyword appears incidentally
 * (e.g. celebrity at a White House dinner) unless hard policy substance exists.
 */
export function isSoftNews(input: EditorialSignalInput): boolean {
  const text = textOf(input);
  if (isMegaEvent(input)) return false;
  if (!hasAny(text, SOFT_NEWS)) return false;
  if (hasAny(text, HARD_POLICY_SUBSTANCE)) return false;
  return true;
}

export function isUsPolicyRelevantForKorea(input: EditorialSignalInput): boolean {
  const text = textOf(input);
  if (
    !hasAny(text, US_POLITICS_ECONOMY) &&
    !/\b(us|u\.s\.|america|washington)\b/i.test(text) &&
    !/미국|미\s/.test(text)
  ) {
    return false;
  }
  return hasAny(text, US_FOR_KR_RELEVANCE);
}

export function isTrivialPoliticalRemark(input: EditorialSignalInput): boolean {
  const text = textOf(input);
  if (!hasAny(text, US_POLITICS_ECONOMY) && !hasAny(text, KR_POLITICS_ECONOMY)) {
    return false;
  }
  if (isMegaEvent(input)) return false;
  if (isUsPolicyRelevantForKorea(input)) return false;
  if (isSoftNews(input)) return false;
  return (
    hasAny(text, TRIVIAL_POLITICS) && !hasAny(text, HARD_POLICY_SUBSTANCE)
  );
}

export function detectEditorialBeat(input: EditorialSignalInput): EditorialBeat {
  const text = textOf(input);
  const cat = (input.category || "").toLowerCase();

  if (isMegaEvent(input)) return "mega_event";
  if (isSoftNews(input)) return "soft_news";

  if (cat === "politics" || cat === "economy") {
    if (
      hasAny(text, US_POLITICS_ECONOMY) ||
      input.source_country?.toUpperCase() === "US" ||
      /ap|reuters|bloomberg|cnn|fox|npr|csmonitor|korea-herald/i.test(input.source || "")
    ) {
      if (hasAny(text, KR_POLITICS_ECONOMY) && !hasAny(text, US_POLITICS_ECONOMY)) {
        return "kr_politics_economy";
      }
      return "us_politics_economy";
    }
    if (
      hasAny(text, KR_POLITICS_ECONOMY) ||
      input.source_country?.toUpperCase() === "KR"
    ) {
      return "kr_politics_economy";
    }
  }

  if (hasAny(text, US_POLITICS_ECONOMY)) return "us_politics_economy";
  if (hasAny(text, KR_POLITICS_ECONOMY)) return "kr_politics_economy";
  if (hasAny(text, FOREIGN_SECURITY) || cat === "world" || cat === "major_issue") {
    return "foreign_security";
  }
  if (hasAny(text, SCIENCE_SOCIETY_IMPACT) || cat === "science_tech" || cat === "society") {
    return "science_society_impact";
  }
  return "general";
}

/** Additive points for home editorial score (below AI grade bands). */
export const HOME_BEAT_POINTS: Record<EditorialBeat, number> = {
  mega_event: 8_000,
  us_politics_economy: 3_500,
  kr_politics_economy: 3_000,
  foreign_security: 2_200,
  science_society_impact: 800,
  general: 0,
  soft_news: -2_500,
};

/** Score delta applied in AI recommend post-process (0–100 scale). */
export function policyScoreDelta(input: EditorialSignalInput): number {
  const beat = detectEditorialBeat(input);
  let delta = 0;

  switch (beat) {
    case "mega_event":
      delta += 18;
      break;
    case "us_politics_economy":
      delta += 10;
      break;
    case "kr_politics_economy":
      delta += 9;
      break;
    case "foreign_security":
      delta += 7;
      break;
    case "science_society_impact":
      delta += 3;
      break;
    case "soft_news":
      delta -= 20;
      break;
    default:
      break;
  }

  if (isUsPolicyRelevantForKorea(input)) delta += 6;
  if (isTrivialPoliticalRemark(input)) delta -= 12;
  if (isCorporatePromoOrThinMarket(input)) delta -= 15;

  return delta;
}

/**
 * Optional grade nudge after AI — never invents best from thin politics.
 * Mega-events may rise to priority; soft news demotes.
 */
export function policyGradeNudge(
  grade: "best" | "priority" | "normal" | "low",
  score: number,
  input: EditorialSignalInput
): { grade: "best" | "priority" | "normal" | "low"; note?: string } {
  const beat = detectEditorialBeat(input);

  if (beat === "soft_news" && (grade === "best" || grade === "priority")) {
    return {
      grade: grade === "best" ? "normal" : "low",
      note: "정책: 소프트뉴스 강등",
    };
  }

  if (isCorporatePromoOrThinMarket(input) && grade === "best") {
    return { grade: "normal", note: "정책: 홍보·단순 증시 best 금지" };
  }

  if (isTrivialPoliticalRemark(input) && grade === "best") {
    return { grade: "priority", note: "정책: 사소한 정치 발언 best 제한" };
  }

  if (beat === "mega_event" && grade === "normal" && score + policyScoreDelta(input) >= 70) {
    return { grade: "priority", note: "정책: 대형 사건 우선" };
  }

  if (
    (beat === "us_politics_economy" || beat === "kr_politics_economy") &&
    grade === "normal" &&
    !isTrivialPoliticalRemark(input) &&
    !isCorporatePromoOrThinMarket(input) &&
    !isSoftNews(input) &&
    score + policyScoreDelta(input) >= 78
  ) {
    return { grade: "priority", note: "정책: 정치·경제 우선" };
  }

  return { grade };
}

export function isPoliticsOrEconomyBeat(beat: EditorialBeat): boolean {
  return (
    beat === "us_politics_economy" ||
    beat === "kr_politics_economy" ||
    beat === "mega_event"
  );
}

/**
 * Discord DIFFERENT ANGLE hint from title/summary/actor language only.
 * Never infers ideology from outlet brand. Insufficient evidence → 관점 구분 필요.
 * Phrasing is tentative (not asserted as verified fact).
 */
export function describeViewpointAngle(
  input: EditorialSignalInput & { actor?: string | null }
): string {
  const text = textOf(input);
  const actor = (input.actor || "").trim();
  const blob = `${actor}\n${text}`;

  // Require explicit actor/role language in title/summary — not source name alone.
  if (
    /\b(opposition|criticiz|rebuked|condemned)\b/i.test(blob) ||
    /(야당|비판했|반발했|규탄)/.test(blob)
  ) {
    return "요약상 야당·비판 측 반응으로 읽힘 (확정 아님)";
  }
  if (
    /\b(white\s+house\s+said|administration\s+said|ministry\s+said|officials?\s+said|press\s+secretary)\b/i.test(
      blob
    ) ||
    /(정부가\s*밝혔|당국이\s*설명|공식\s*발표에\s*따르면)/.test(blob)
  ) {
    return "요약상 정부·당국 설명으로 읽힘 (확정 아님)";
  }
  if (
    /\b(markets?\s+react|investors?\s+react|stocks?\s+fell|stocks?\s+rose|yields?\s+jump)\b/i.test(
      blob
    ) ||
    /(시장\s*반응|투자자\s*반응|증시가\s*(급등|급락|하락|상승))/.test(blob)
  ) {
    return "요약상 시장 반응으로 읽힘 (확정 아님)";
  }
  if (
    (/\b(korea|seoul|korean)\b/i.test(blob) || /한국|서울/.test(blob)) &&
    (/\b(us\s+policy|washington|fed\b|tariff)\b/i.test(blob) ||
      /(미국\s*정책|연준|관세)/.test(blob)) &&
    (/\b(impact|affect|spillover)\b/i.test(blob) || /(영향|파급)/.test(blob))
  ) {
    return "요약상 한국 영향 분석으로 읽힘 (확정 아님)";
  }
  if (
    /\b(analysts?\s+say|according\s+to\s+economists?)\b/i.test(blob) ||
    /(분석가들?에\s*따르면|경제학자들?은)/.test(blob)
  ) {
    return "요약상 분석·전망으로 읽힘 (확정 아님)";
  }

  return VIEWPOINT_NEEDS_LABEL;
}

export function homePolicyPoints(input: EditorialSignalInput): number {
  const beat = detectEditorialBeat(input);
  let points = HOME_BEAT_POINTS[beat];
  if (isUsPolicyRelevantForKorea(input)) points += 1_200;
  if (isTrivialPoliticalRemark(input)) points -= 2_000;
  if (isCorporatePromoOrThinMarket(input)) points -= 2_500;
  return points;
}
