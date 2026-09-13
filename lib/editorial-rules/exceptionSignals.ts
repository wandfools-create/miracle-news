/** Important-exception signals that override auto-exclude. */

import { normalizeEditorialText } from "./matchKeywords";
import { detectStrongPublicHealthSignal } from "./publicHealthSignals";

const CASUALTY_SIGNAL =
  /(?:\b\d{1,6}\s*(?:dead|killed|injured|missing|casualt(?:y|ies)|evacuat(?:ed|ion))\b|(?:사망|숨져|부상|실종|희생자|대피)\s*\d{1,6}|\d{1,6}\s*(?:명|명이)\s*(?:사망|숨져|부상|실종|대피)|대형\s*재난|비상사태|state of emergency|mass casualt)/iu;

const GOVERNMENT_SIGNAL =
  /\b(?:government|president|prime minister|congress|parliament|supreme court|white house|federal|legislation|executive order)\b|(?:정부|대통령|총리|국회|대법원|헌법재판소|중앙정부|백악관|행정부|법률\s*개정)/iu;

const SECURITY_TRADE_SIGNAL =
  /\b(?:war|invasion|missile|nuclear|sanction|treaty|diplomatic|national security|tariff|trade war|embargo)\b|(?:전쟁|침공|미사일|핵무기|제재|조약|외교|국가\s*안보|안보|관세|무역\s*전쟁)/iu;

const RIGHTS_SIGNAL =
  /\b(?:human rights|religious freedom|refugee|asylum|minorit(?:y|ies))\b|(?:인권|종교\s*자유|난민|망명|소수민족)/iu;

const MULTI_JURISDICTION_SIGNAL =
  /\b(?:multiple states|across states|nationwide|multi-nation|international impact|several countries)\b|(?:여러\s*주|전국적|다수\s*국가|국제적\s*영향)/iu;

export function detectEditorialExceptionSignals(textInput: string): string[] {
  const text = normalizeEditorialText(textInput);
  const signals: string[] = [];
  if (CASUALTY_SIGNAL.test(text)) signals.push("casualty-disaster");
  if (GOVERNMENT_SIGNAL.test(text)) signals.push("central-government");
  if (SECURITY_TRADE_SIGNAL.test(text)) signals.push("security-trade");
  // Strong combo only — lone virus/health/research must not rescue soft desks.
  if (detectStrongPublicHealthSignal(text)) signals.push("public-health");
  if (RIGHTS_SIGNAL.test(text)) signals.push("rights-refugees");
  if (MULTI_JURISDICTION_SIGNAL.test(text)) signals.push("multi-jurisdiction");
  return signals;
}
