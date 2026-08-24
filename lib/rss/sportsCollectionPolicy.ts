/**
 * Sports RSS collection policy for 한눈.
 * Title / summary / URL rule filter only — no OpenAI, no retroactive deletes.
 */

export type SportsFilterInput = {
  title: string;
  summary?: string | null;
  url: string;
};

export type SportsCollectionSkipReason = {
  code: "general_sports" | "routine_sports";
  detail: string;
  summary: string;
};

function combinedText(input: SportsFilterInput): string {
  return `${input.title || ""}\n${input.summary || ""}`.trim();
}

function urlPath(input: SportsFilterInput): string {
  try {
    return new URL(input.url).pathname.toLowerCase();
  } catch {
    return "";
  }
}

function hasAny(text: string, patterns: RegExp[]): boolean {
  return patterns.some((p) => p.test(text));
}

/** URL path segments that indicate a sports desk / league feed. */
const SPORTS_PATH_KEYWORDS = [
  "sports",
  "sport",
  "nfl",
  "nba",
  "mlb",
  "nhl",
  "mls",
  "soccer",
  "football",
  "basketball",
  "baseball",
  "hockey",
  "tennis",
  "golf",
  "cricket",
  "rugby",
  "olympics",
  "olympic",
  "paralympics",
  "paralympic",
  "world-cup",
  "worldcup",
  "super-bowl",
  "superbowl",
  "f1",
  "formula-1",
  "formula-one",
  "ncaa",
  "wimbledon",
  "uefa",
  "fifa",
  "premier-league",
  "march-madness",
] as const;

function pathSegmentMatches(segment: string, keyword: string): boolean {
  if (segment === keyword || segment === `${keyword}s`) return true;
  if (segment.startsWith(`${keyword}-`) || segment.endsWith(`-${keyword}`)) {
    return true;
  }
  return segment.includes(`-${keyword}-`);
}

function pathLooksSports(pathname: string): string | null {
  const segments = pathname.split("/").filter(Boolean);
  for (const keyword of SPORTS_PATH_KEYWORDS) {
    if (segments.some((seg) => pathSegmentMatches(seg, keyword))) {
      return keyword;
    }
    if (
      pathname.includes(`/${keyword}/`) ||
      pathname.includes(`/${keyword}`) ||
      pathname.includes(`-${keyword}-`)
    ) {
      return keyword;
    }
  }
  return null;
}

/** Text signals that the item belongs to routine sports coverage. */
const SPORTS_TOPIC_PATTERNS: RegExp[] = [
  /\b(nfl|nba|mlb|nhl|mls|ncaa|wimbledon|uefa|fifa|premier\s+league|champions\s+league|la\s+liga|serie\s+a|bundesliga)\b/i,
  /\b(soccer|football|basketball|baseball|hockey|tennis|golf|cricket|rugby|volleyball|softball|lacrosse)\b/i,
  /\b(quarterback|pitcher|striker|goalkeeper|linebacker|point\s+guard|shortstop|designated\s+hitter)\b/i,
  /\b(touchdown|home\s+run|slam\s+dunk|hat\s+trick|penalty\s+kick|free\s+throw|field\s+goal)\b/i,
  /\b(playoffs?|postseason|regular\s+season|matchday|game\s+day)\b/i,
  /\b(sports?\s+(news|desk|brief|roundup|update|highlights))\b/i,
  /^(sports|sport)\s*[|:\-–—]/i,
  /(스포츠|프로야구|프로축구|KBO|K리그|올림픽|월드컵|슈퍼볼| EPL | NBA | MLB )/,
];

/** Mega global sports events — context only; not a blanket allow. */
const MEGA_EVENT_PATTERNS: RegExp[] = [
  /\b(winter\s+olympics?|summer\s+olympics?|olympic\s+games?|olympics?)\b/i,
  /\b(paralympics?|paralympic\s+games?)\b/i,
  /\b(fifa\s+world\s+cup|world\s+cup\s+(final|opening|host|draw|qualifying\s+controversy))\b/i,
  /\b(super\s+bowl|superbowl)\b/i,
  /(올림픽|패럴림픽|월드컵|슈퍼\s*볼)/,
];

/** Routine sports stories — excluded even during mega events. */
const ROUTINE_SPORTS_PATTERNS: RegExp[] = [
  /\b(transfer|transferred|traded|trade\s+to|signs?\s+(with|deal|contract)|free\s+agent|contract\s+extension)\b/i,
  /\b(injury|injured|injuries|out\s+for\s+(the\s+)?season|sidelined|torn\s+(acl|mcl|meniscus)|surgery)\b/i,
  /\b(head\s+coach|manager|coaching\s+staff|coach\s+(fired|hired|resigns?)|team\s+owner)\b/i,
  /\b(season\s+preview|preseason|playoff\s+picture|power\s+rankings|week\s+\d+\s+preview)\b/i,
  /\b(standings|leaderboard|league\s+table|top\s+\d+\s+(teams|seeds)|clinched\s+playoff\s+spot)\b/i,
  /\b(player\s+interview|postgame\s+interview|speaks\s+to\s+reporters|media\s+availability)\b/i,
  /\b(game\s+recap|match\s+recap|recap\s*:|highlights\s+from|daily\s+recap|day\s+\d+\s+recap)\b/i,
  /\b(box[\s-]?score|scoreboard|final\s+scores?)\b/i,
  /\b(draft\s+pick|roster\s+move|waived|released\s+by|optioned\s+to)\b/i,
  /\b(betting\s+odds|point\s+spread|moneyline|over\/under)\b/i,
  /\b(will\s+face|set\s+to\s+play|looks\s+ahead\s+to|preview\s*:|matchup\s+preview)\b/i,
  /\b(beats?|defeats?|tops?|downs?|routs?|edges?)\b.{0,40}\b\d{1,3}\s*[-–]\s*\d{1,3}\b/i,
  /\b\d{1,3}\s*[-–]\s*\d{1,3}\b.{0,24}\b(win|loss|victory|defeat|final)\b/i,
  /\b(wins?|claims?|captures?|takes?)\s+(the\s+)?(group\s+stage|heat|qualifying|round\s+of\s+\d+|semifinal|quarterfinal)\b/i,
  /\b(qualifying\s+round|heats?\s+results?|group\s+stage\s+results?)\b/i,
  /\b(super\s+bowl\s+ads?|commercials?\s+roundup|best\s+super\s+bowl\s+ads?)\b/i,
  /(이적|부상|감독|전력\s*분석|순위|스코어|경기\s*결과|하이라이트|인터뷰|프리뷰|계약)/,
];

/** Major mega-event angles worth general-news readers. */
const MEGA_EVENT_MAJOR_NEWS_PATTERNS: RegExp[] = [
  /\b(opening\s+ceremony|closing\s+ceremony|torch\s+relay|cauldron)\b/i,
  /\b(boycott|diplomatic\s+boycott|protests?\s+(at|during|against)\s+(the\s+)?(games?|olympics?|world\s+cup))\b/i,
  /\b(doping\s+(scandal|ban|violation)|banned\s+from\s+(the\s+)?(games?|olympics?))\b/i,
  /\b(host\s+(city|country|nation)|organizing\s+committee)\b.{0,80}\b(controversy|scandal|cost|human\s+rights|corruption|protest)\b/i,
  /\b(terror(ist)?|security\s+breach|evacuat(ed|ion)|stampede)\b/i,
  /\b(first\s+(ever|time)|historic|history[- ]making|world\s+record)\b/i,
  /\b(refugee\s+olympic\s+team|independent\s+athletes)\b/i,
  /\b(war|invasion|sanctions)\b.{0,60}\b(olympics?|world\s+cup|paralympics?)\b/i,
  /\b(south\s+korea|korean|대한민국|한국)\b.{0,60}\b(gold\s+medal|wins?\s+gold|금메달|우승)\b/i,
  /\b(united\s+states|u\.s\.|usa|american)\b.{0,60}\b(gold\s+medal|wins?\s+gold)\b/i,
  /\b(gold\s+medal|wins?\s+gold)\b.{0,40}\b(first|historic|record|youngest|oldest)\b/i,
  /\b(super\s+bowl)\b.{0,80}\b(security|terror|threat|controversy|political|human\s+rights|labor|strike)\b/i,
  /(개막|폐막|보이콧|도핑|인권|테러|역사적|금메달|우승)/,
];

/** Sports stories with broader news value (non-sports desk interest). */
const TRANSCENDS_SPORTS_PATTERNS: RegExp[] = [
  /\b(president|prime\s+minister|congress|parliament|senate|diplomat|embassy|sanctions|white\s+house|pentagon)\b/i,
  /\b(war|invasion|military|missile|ceasefire|hostage|geopolitic)\b/i,
  /\b(religion|religious|pope|church|mosque|synagogue|human\s+rights|discrimination|racism\s+scandal)\b/i,
  /\b(arrested|indicted|convicted|trial|lawsuit|court\s+(rules|orders)|murder|homicide)\b/i,
  /\b(stadium\s+collapse|fan\s+death|mass\s+casualty|earthquake|disaster|tragedy)\b/i,
  /\b(national\s+debate|political\s+firestorm|government\s+investigation|lawmakers)\b/i,
  /(대통령|국회|외교|전쟁|종교|인권|재판|기소|참사|재난|논란|정치)/,
];

function looksSportsRelated(input: SportsFilterInput): boolean {
  const text = combinedText(input);
  const path = urlPath(input);
  if (pathLooksSports(path)) return true;
  if (!text) return false;
  return hasAny(text, SPORTS_TOPIC_PATTERNS) || hasAny(text, MEGA_EVENT_PATTERNS);
}

function isMegaEventContext(text: string): boolean {
  return hasAny(text, MEGA_EVENT_PATTERNS);
}

function isRoutineSportsStory(text: string): boolean {
  return hasAny(text, ROUTINE_SPORTS_PATTERNS);
}

function isMegaEventMajorNews(text: string): boolean {
  if (!isMegaEventContext(text)) return false;
  if (isRoutineSportsStory(text)) return false;
  return hasAny(text, MEGA_EVENT_MAJOR_NEWS_PATTERNS);
}

function transcendsSports(text: string): boolean {
  return hasAny(text, TRANSCENDS_SPORTS_PATTERNS);
}

/**
 * Returns a skip reason when a sports-related RSS item should not be collected.
 * Non-sports items return null (allow).
 */
export function getSportsCollectionSkipReason(
  input: SportsFilterInput
): SportsCollectionSkipReason | null {
  if (!looksSportsRelated(input)) return null;

  const text = combinedText(input);

  if (transcendsSports(text)) return null;
  if (isMegaEventMajorNews(text)) return null;

  if (isRoutineSportsStory(text)) {
    return {
      code: "routine_sports",
      detail: "routine_sports_story",
      summary:
        "Routine sports story (scores, transfers, injuries, previews, etc.)",
    };
  }

  if (isMegaEventContext(text)) {
    return {
      code: "routine_sports",
      detail: "mega_event_minor",
      summary:
        "Mega-event sports item without major general-news angle",
    };
  }

  const pathHit = pathLooksSports(urlPath(input));
  return {
    code: "general_sports",
    detail: pathHit ? `path:${pathHit}` : "sports_topic",
    summary: "General sports coverage excluded by collection policy",
  };
}
