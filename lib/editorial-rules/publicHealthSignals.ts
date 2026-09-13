/**
 * Strong public-health / infectious-disease signals for pre-AI intake.
 * Soft lifestyle health and lone weak tokens must not pass.
 */

import { normalizeEditorialText } from "./matchKeywords";

/** Soft noise that must never count as public-health news. */
const SOFT_PUBLIC_HEALTH_NOISE =
  /(?:computer\s+virus|malware|ransomware|trojan\s+horse|phishing|cyber\s*attack|antivirus|컴퓨터\s*바이러스|랜섬웨어|악성코드|연예인\s*건강|셀럽\s*건강|celebrity\s+health|red\s+carpet|다이어트|diet\s+tip|weight\s+loss|wellness\s+hack|health\s+tips?|lifestyle\s+wellness|yoga\s+routine|skincare|영양\s*제|건강\s*팁|생활\s*건강|feel[\s-]?good\s+health)/iu;

const AUTHORITY_SIGNAL =
  /\b(?:cdc|centers for disease control|who\b|world health organization|public health (?:agency|authority|department)|hhs|nih|질병관리청|질병관리본부|보건당국|보건복지부|세계보건기구)\b/iu;

const DISEASE_SIGNAL =
  /\b(?:measles|mpox|monkeypox|ebola|cholera|avian\s+flu|bird\s+flu|covid-?19|sars-cov-2|influenza|tuberculosis|malaria|dengue|zika|polio|mers|sars\b|norovirus|rsv\b|marburg|lassa|감염병|신종\s*감염병|전염병|홍역|콜레라|에볼라|조류\s*독감|독감\s*유행|결핵|말라리아|뎅기|지카|소아마비)\b/iu;

const SPREAD_IMPACT_SIGNAL =
  /\b(?:outbreak|epidemic|pandemic|public health emergency|pheic|case(?:s)?\s+(?:surge|spike|rise|climb)|surge in (?:cases|infections)|hospitalizations?|icu\s+admission|death\s+toll|fatalities|community\s+spread|확진(?:자)?|집단감염|발병|확산|감염자\s*증가|입원|사망(?:자)?|공중보건\s*비상|비상사태|팬데믹|유행|감염\s*확산)\b/iu;

const HARD_COMBO_SIGNAL =
  /(?:공중보건\s*비상|public health emergency|pheic|infectious disease outbreak|disease outbreak news)/iu;

/**
 * True only for strong infectious / public-health hard-news cues.
 * Lone "virus" / "health" / "research" is never enough.
 * Soft noise alone is rejected; soft noise co-mentioned with hard cues still passes.
 */
export function detectStrongPublicHealthSignal(textInput: string): boolean {
  const text = normalizeEditorialText(textInput);
  if (!text) return false;

  const hasAuthority = AUTHORITY_SIGNAL.test(text);
  const hasDisease = DISEASE_SIGNAL.test(text);
  const hasSpread = SPREAD_IMPACT_SIGNAL.test(text);
  const hardCombo = HARD_COMBO_SIGNAL.test(text);
  const strong =
    hardCombo ||
    ((hasAuthority || hasDisease) && hasSpread) ||
    (hasAuthority && hasDisease);

  if (!strong) return false;
  // Pure soft framing without authority/disease+spread already failed above.
  return true;
}

export function isSoftPublicHealthNoise(textInput: string): boolean {
  return SOFT_PUBLIC_HEALTH_NOISE.test(normalizeEditorialText(textInput));
}

export function isScienceOrLifestyleFieldId(fieldId: string): boolean {
  return (
    fieldId.startsWith("science.") || fieldId.startsWith("lifestyle.")
  );
}
