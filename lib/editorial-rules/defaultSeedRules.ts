/**
 * Built-in seed rule definitions (mirrored in migration SQL).
 * Seeds are system rules: deactivate instead of delete.
 */

import type { EditorialCollectionRule } from "./types";

type SeedRule = Omit<
  EditorialCollectionRule,
  "id" | "isActive" | "isSystem" | "adminNote"
> & {
  id: string;
  adminNote: string;
};

const PUBLIC_HEALTH_KO = [
  "코로나",
  "신종 감염병",
  "신종 바이러스",
  "변이 바이러스",
  "집단감염",
  "확진자 급증",
  "감염 확산",
  "입원 증가",
  "사망자 증가",
  "공중보건 비상사태",
  "보건당국",
  "CDC",
  "WHO",
];

const PUBLIC_HEALTH_EN = [
  "COVID",
  "coronavirus",
  "outbreak",
  "epidemic",
  "pandemic",
  "new variant",
  "cases surge",
  "hospitalization",
  "public health emergency",
  "respiratory virus",
  "infectious disease",
  "CDC",
  "WHO",
];

const PRIORITY_POLICY = [
  "diplomacy",
  "diplomatic",
  "sanctions",
  "national security",
  "terrorism",
  "missile",
  "nuclear",
  "election",
  "congress",
  "supreme court",
  "tariff",
  "trade war",
  "central bank",
  "federal reserve",
  "외교",
  "제재",
  "국가 안보",
  "테러",
  "미사일",
  "핵",
  "선거",
  "국회",
  "대법원",
  "관세",
  "무역전쟁",
  "중앙은행",
];

const EXCLUDE_LIFESTYLE = [
  "horoscope",
  "astrology",
  "tarot",
  "recipe",
  "fashion tip",
  "beauty tip",
  "parenting tip",
  "wellness tip",
  "celebrity dating",
  "box score",
  "fantasy football",
  "community calendar",
  "local events",
  "store opening",
  "product launch sale",
  "운세",
  "타로",
  "점성술",
  "맛집",
  "패션",
  "뷰티",
  "육아 팁",
  "건강 상식",
  "열애설",
  "경기 결과",
  "이적설",
  "할인 행사",
  "지역 축제",
];

const EXCLUDE_SCIENCE_SOFT = [
  "archaeology dig",
  "dinosaur fossil",
  "astronomy photo",
  "cute animal",
  "space selfie",
  "고고학 발굴",
  "공룡 화석",
  "우주 사진",
  "귀여운 동물",
];

/** Fixed UUIDs — must match migration seed rows. */
export const EDITORIAL_SEED_RULES: SeedRule[] = [
  {
    id: "a1000001-0001-4000-8000-000000000001",
    name: "기본 우선: 공중보건·감염병",
    kind: "keyword",
    action: "prioritize",
    keywords: [...PUBLIC_HEALTH_KO, ...PUBLIC_HEALTH_EN],
    category: null,
    sourceKey: null,
    region: "all",
    priority: 90,
    adminNote: "시스템 seed — 감염병·공중보건 우선 검토",
  },
  {
    id: "a1000001-0001-4000-8000-000000000002",
    name: "기본 우선: 정치·안보·경제",
    kind: "keyword",
    action: "prioritize",
    keywords: PRIORITY_POLICY,
    category: null,
    sourceKey: null,
    region: "all",
    priority: 85,
    adminNote: "시스템 seed — 외교·안보·중앙정부·무역",
  },
  {
    id: "a1000001-0001-4000-8000-000000000010",
    name: "기본 제외: ScienceDaily 출처",
    kind: "source",
    action: "exclude",
    keywords: [],
    category: null,
    sourceKey: "sciencedaily",
    region: "us-intl",
    priority: 70,
    adminNote: "시스템 seed — 출처 key sciencedaily (피드 삭제가 아님)",
  },
  {
    id: "a1000001-0001-4000-8000-000000000011",
    name: "기본 제외: 가벼운·생활·홍보",
    kind: "keyword",
    action: "exclude",
    keywords: EXCLUDE_LIFESTYLE,
    category: null,
    sourceKey: null,
    region: "all",
    priority: 40,
    adminNote: "시스템 seed — 운세·연예·맛집·스포츠 잡담 등",
  },
  {
    id: "a1000001-0001-4000-8000-000000000012",
    name: "기본 제외: 소프트 과학·호기심",
    kind: "keyword",
    action: "exclude",
    keywords: EXCLUDE_SCIENCE_SOFT,
    category: null,
    sourceKey: null,
    region: "all",
    priority: 35,
    adminNote: "시스템 seed — 일반 호기심 과학 (감염병 예외는 별도 우선 규칙)",
  },
];

export function editorialSeedRulesAsCollectionRules(
  active = true
): EditorialCollectionRule[] {
  return EDITORIAL_SEED_RULES.map((r) => ({
    ...r,
    isActive: active,
    isSystem: true,
  }));
}
