/** Desk source trust for same-event representative selection. */

export const SAME_EVENT_SOURCE_TRUST: Record<string, number> = {
  ap: 100,
  bbc: 98,
  "pbs-newshour": 96,
  csm: 94,
  cnn: 90,
  "fox-news": 88,
  yonhap: 70,
  /** Breaking detection feed — never preferred as story representative. */
  "yonhap-kr-radar": 35,
  "korea-herald": 90,
  chosun: 88,
  joongang: 88,
  tvchosun: 86,
  insight: 82,
  sciencedaily: 84,
};

export function sameEventSourceTrust(source: string | null | undefined): number {
  if (!source?.trim()) return 70;
  return SAME_EVENT_SOURCE_TRUST[source.trim()] ?? 70;
}

export function isYonhapKrRadarSource(source: string | null | undefined): boolean {
  return source?.trim() === "yonhap-kr-radar";
}
