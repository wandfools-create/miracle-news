# Miracle News Editorial Policy

**Version:** politics-economy-v1  
**Branch:** `feature/editorial-policy-politics-economy-v1` (Draft PR — Preview 전 / Production 미배포)  
**Base main:** `39d9b8886ed594cdb856a9644d34d951b0b2bd29` (PR #8 editorial ranking Production merge 포함)

This document is the canonical editorial priority for Miracle News. Code should follow it; prompts and post-process must not invent facts.

---

## Implementation status (accurate scope)

### Done on this branch

- Official politics/economy-first editorial policy (this file)
- Candidate AI recommend prompt + post-process weights
- Homepage policy points (on top of PR #8 ranking / design)
- Discord Brief beat ordering + tentative viewpoint line
- Category display-stage repair (`repairHomeCategory`)
- Shorts selection advice + 「한눈 균형 브리핑」 types / public contract

### Not done (follow-up — do not call these complete)

- Expanding dedicated politics/business/world collection feeds
- Achieving ~55% politics/economy **collection** share in Production
- Wiring Shorts PR #5 package generator to balance types
- Live OpenAI balance-script generation validation
- Admin balance-briefing review UI
- Video production / upload

**Note:** A READ-ONLY 7-day estimate showed sparse stored categories (~20% PE by stored `category`, ~23% under a planning bias simulation). That simulation is **not** “goal achieved” and **not** “collection improvement complete.”

---

## 1. Official beat priority

1. **US politics & economy**
2. **Korea politics & economy**
3. **International affairs · diplomacy · security**
4. **Science / society with large public impact**
5. **Lifestyle · culture · royalty · entertainment soft news**

### Exception — may outrank the ladder

- Major natural disasters
- War outbreak / escalation
- Financial-market shocks
- Mass casualties
- Events that impair state function or security
- International events with **direct impact on Koreans**

Politics/economy labels alone do **not** justify `best` for trivial remarks. Corporate press releases and thin ticker moves must not auto-`best`.

---

## 2. US news for Korean readers (priority topics)

Prefer: White House/Congress, elections, Fed/rates/inflation/jobs, tariffs/trade, markets when policy-relevant, diplomacy/security/North Korea, Korea spillover.

Deprioritize: local incidents, royalty/celebrity, soft features, simple day-to-day stock ticks / company promo copy.

---

## 3. SAME EVENT · UPDATE · DIFFERENT ANGLE

Allow DIFFERENT ANGLE for material new facts, gov vs opposition, US vs Korea framing, policy vs market, domestic vs international impact, cause vs outcome, new figures/rulings.

Suppress SAME EVENT for headline-only rewrites, wire rehash, quote loops, recycled numbers.

Do **not** weaken the publish SAME EVENT hard guard.

---

## 4. Viewpoint diversity

- No mechanical 1:1 left/right quotas.
- Verified facts as shared base; label source and role.
- Separate news report · analysis · editorial · advocacy · official statement.
- Never infer ideology from outlet brand alone.
- Discord viewpoint lines stay tentative; thin evidence → `관점 구분 필요`.

---

## 5. AI importance evaluation

Signals: politics/economy weight, US→KR relevance, Korea impact, foreign/security, market/household, magnitude, novelty, viewpoint value, source reliability, duplicate penalty, soft-news penalty, promo/thin-ticker penalty.

Mega-events may exceed beat weights. Soft/low must not pad empty homepage spotlight slots.

---

## 6. Collection (this branch: no RSS source churn)

Keep existing RSS/HTML/Radar. Do not treat planning simulations as completed collection work.

### Follow-up (document only)

1. Survey politics/business/world dedicated feeds per source  
2. Measure PE candidate ratio per source  
3. Title-based pre-classification right after collect  
4. ~55% PE share as **recommendation**, not a hard quota that drops disasters/war/society  
5. Preserve viewpoint range across outlets  
6. No paid sources  

---

## 7. Discord Brief

US politics/economy first; Korea band distinct; tentative viewpoint line; no auto-publish.

---

## 8. Homepage

Preserve PR #8 ranking + newspaper design; add policy points, mega override, family max 2, `other` repair.

---

## 9. Shorts + PR #5 public contract

Majority PE **recommended, not forced**. Human review required; no auto-publish/upload.

Public contract (`lib/editorialPolicy/publicContract.ts`):

- `adviseShortsSelection`
- `buildBalanceBriefing`
- `HannoonBalanceBriefing`
- `MISSING_VIEWPOINT_LABEL` (`다른 주요 관점 확인 필요`)
- `humanReviewRequired: true`

Merge order: policy branch → main → merge latest main into PR #5 (prefer full main merge over cherry-pick). Do not edit PR #5 UI here.

---

## 10. 「한눈 균형 브리핑」

Fields: `factualCore`, `verifiedFacts[]`, `claims[]`, `perspectives[]` (`actor`, `position`, `supportingBasis`, `sourceArticleIds[]`, `contentType`), `keyDisagreement`, `verifiedVsClaimed`, `missingPerspectives[]`, `whatToWatch`, `balanceNotes`, `humanReviewRequired=true`, `status`/`warning`.

One-sided or unsourced opposing views → warning `다른 주요 관점 확인 필요`. Never invent counter-arguments. Official-record conflicts never become verified facts. Balance is evidence-weighted, not 1:1 word count.

---

## 11. Safety rails

No Production DB writes, live RSS, OpenAI, Discord sends, migration apply, main merge, or Production deploy from this branch alone unless explicitly approved.
