import {
  PRIMARY_FOREIGN_SOURCE_KEYS,
  PRIMARY_KOREAN_SOURCE_KEYS,
} from "@/lib/article/sourceConstants";
import { sourceConfigs } from "@/lib/article/sourceConfigs";

/** 주로 미·국제 매체 (한국어판에서 위쪽 그룹) */
const internationalSourceKeys = new Set<string>(PRIMARY_FOREIGN_SOURCE_KEYS);

/** 주로 한국 매체 (영어판에서 위쪽 그룹) */
const koreanSourceKeys = new Set<string>(PRIMARY_KOREAN_SOURCE_KEYS);

function configOrderIndex(key: string): number {
  const i = sourceConfigs.findIndex((c) => c.key === key);
  return i === -1 ? 999 : i;
}

/**
 * 한국어 에디션: 국제(영문권) 출처 먼저, 한국 출처 나중.
 * 영어 에디션: 한국 출처 먼저, 국제 출처 나중.
 */
export function sortSourceLeadCards<T extends { key: string }>(
  items: T[],
  edition: "ko" | "en"
): T[] {
  const tier = (key: string) => {
    const intl = internationalSourceKeys.has(key);
    const kr = koreanSourceKeys.has(key);
    if (edition === "ko") {
      if (intl) return 0;
      if (kr) return 1;
      return 2;
    }
    if (kr) return 0;
    if (intl) return 1;
    return 2;
  };

  return [...items].sort((a, b) => {
    const ta = tier(a.key);
    const tb = tier(b.key);
    if (ta !== tb) return ta - tb;
    return configOrderIndex(a.key) - configOrderIndex(b.key);
  });
}
