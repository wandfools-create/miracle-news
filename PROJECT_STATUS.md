# Miracle News — PROJECT STATUS

> **Single Source of Truth:** GitHub `wandfools-create/miracle-news`의 `main` 브랜치와 이 문서.
>
> 모든 AI/개발 작업은 먼저 최신 `main`과 이 문서를 읽고 시작한다. 이 문서는 비밀값을 저장하지 않는다.

## 0. Production 반영 (승인 완료 공개 · SAME EVENT 조기 검토)

| 항목 | 상태 |
|---|---|
| **Production Application Baseline** | `1c9831b4c85446711b0ecbe6d5bfbe22243d19e6` — Merge PR #12 |
| PR #12 | **MERGED** — 승인 완료 명시적 사람 공개·일괄 공개·수집 후보 관련 기사 |
| 승인 완료 명시적 사람 공개 | SAME EVENT hard block 없이 진행 (`publishApprovedArticleToLive()`) |
| 개별·일괄 공개 | **Production 적용 완료** |
| 일괄 공개 | 기사별 결과 처리; 첫 실패에서 중단되지 않음 |
| 수집 후보 관련 기사 | **Production 적용** (classifier 재사용, 14일·400건 pool) |
| Discord quick_review | 유지 — 자동 공개 없음 |
| AI 자동 공개 | 금지 유지 |
| 실제 Production 일괄 공개 운영 검증 | **아직 미실행** |
| Operational Validation | **IN PROGRESS** |

## 0A. Production 반영 (RSS coverage/fairness · PR #14)

| 항목 | 상태 |
|---|---|
| PR #14 | **MERGED** — Improve RSS source coverage and publisher fairness |
| Production merge SHA | `f1b00accd5389eacd00e1376922b3ffcb77ae31e` |
| RSS publisher seed | **적용 완료** (Pass 0: main publisher당 최소 1건 기회) |
| category rotation | **적용 완료** (least-saved feed 우선; publisher cap 공유) |
| PBS politics feed | **적용 완료** (`pbs-newshour` · politics · us-intl) |
| 관리자 수집망 표시 | **적용 완료** — config-only는 「설정됨」(실제 fetch 성공 아님) |
| Operational Validation | **IN PROGRESS** |
| PBS/Fox parser failure | **원인 확정** — `pickRssCategories`가 null-prototype `{_,$}`에 `String(c)` 호출 → feed 전체 실패. 영향 기간 **2026-08-25~** (checked=0). 기존 후보·기사 데이터 손상 **없음**. 누락 후보는 **자동 복원되지 않음**. |
| PBS/Fox parser hotfix | **PR #16 MERGED** — Production 적용 완료 (`7828c70`) |
| Bulk candidate enrich isolation | **PR #17 MERGED** — Production 적용 완료 (`0a218f9`) |
| 중앙일보 수집 | **미구현** (`joongang` key 예약만) — 후속 |
| AP·Fox 정치/경제 전용 feed | **후속** |
| 관점 보존형 SAME EVENT 정책 | **후속** |

**Current Priority**

1. Today Edition KO 시간 polish (`fix/today-edition-ko-time-and-status`)
2. 다음 승인 기사 일괄 공개 실제 운영 확인
3. Shorts PR #5에 최신 main 통합
4. 균형 브리핑 패키지 연결

## 0B. Today Edition v1 (Production 적용 · Operational Validation)

| 항목 | 상태 |
|---|---|
| PR #18 | **MERGED** — Today Edition v1 |
| Production application SHA | `c8e29d48be2c9051616ad1626e158d9d43c82380` |
| 오늘 판정 | `published_at` · America/New_York 달력일 (`source_published_at` 미사용) |
| 오늘 0건 | 준비 중 UI — 어제 featured 승격 없음 |
| 오늘 1건 | 대표 1건 |
| 오늘 2건 이상 | 대표 + 보조 |
| 지금 주목 | 오늘 우선 · **24h** site publish 한도 |
| 진행 중 이슈 | 오늘 우선 · **48h** · 「계속되는 이슈」 표시 |
| 지난 주요뉴스 | NY **1–7일** 전 · 최대 5건 · 상단 surface 중복 제외 |
| 오늘의 주요 기사 더보기 | featured/related 제외 **오늘** 기사만 KR/US 2열 |
| Production 기본 화면 확인 | todayCount **28** · status **ready** (2026-08-28) |
| KO 시간 중복 polish | **진행 중** — `fix/today-edition-ko-time-and-status` (`오전 오전` → Intl dayPeriod 단일 책임) |
| Operational Validation | **IN PROGRESS** |

## 1. 프로젝트 기본 정보

| 항목 | 현재 값 |
|---|---|
| 프로젝트명 | Miracle News |
| 공식 코드 기준 | GitHub `main` |
| GitHub repository | https://github.com/wandfools-create/miracle-news |
| 로컬 개발 폴더 | `/Users/WithMo/Documents/News/miracle-news` (특정 Mac의 작업 폴더이며 다른 AI 환경에서 접근 가능하다고 전제하지 않음) |
| Branch | `main` |
| Production URL | https://www.hannoon.co |
| Vercel project name | 확인 필요 |
| Supabase project name / ref | 저장소에 비밀값 없는 식별자가 없어 확인 필요 |
| Stack | Next.js 16.1.7, React 19.2.3, TypeScript 5, Tailwind CSS 4, Supabase JS/SSR, Vercel, OpenAI, Discord, RSS Parser, Playwright |
| **Production Application Baseline** | `1c9831b4c85446711b0ecbe6d5bfbe22243d19e6` — Merge PR #12 (approved publishing + related-story review) |
| Production main commit | `1c9831b4c85446711b0ecbe6d5bfbe22243d19e6` |
| Vercel Production | 배포 성공 (`https://www.hannoon.co`) — PR #12 반영 |

비밀번호, API key, bot token, service-role key, webhook secret 등은 이 문서에 기록하지 않는다.

## 2. 현재 Production 구조

```text
GitHub main
   │ Vercel 연결/빌드
   ▼
Vercel Production ── https://www.hannoon.co
   ├─ 공개 사이트 /ko, /en
   ├─ 관리자 /admin/* (Shorts 제작실 `/admin/shorts` 포함)
   ├─ API/Discord interactions
   └─ Vercel Cron: /api/cron/desk-us, /api/cron/desk-kr
            │
            ├─ 뉴스 source 수집
            ├─ Supabase collection_candidates/articles
            ├─ OpenAI 중요도 평가·명시적 기사 생성/수정
            └─ Discord Brief/버튼/system alerts
```

- **공개 사이트:** Supabase의 공개 완료 기사만 한국어·영어 화면에 표시한다.
- **관리자:** Supabase Auth 기반으로 후보·검토·수정·공개 workflow를 관리한다.
- **Supabase:** 기사, 수집 후보, 상태, 검토 및 운영 로그의 데이터 계층이다.
- **Vercel:** Next.js Production과 두 지역 Desk cron을 실행한다.
- **GitHub:** `main`이 배포 및 기술 상태의 공식 코드 기준이다.
- **Production Application Baseline:** `1c9831b4c85446711b0ecbe6d5bfbe22243d19e6` — Vercel Production 배포 성공 (PR #7 UI + PR #8 ranking + PR #9 editorial policy + PR #12 approved publishing).
- **Revision restore:** 수정 대기 50건 → 이전 공개 상태 복구 완료 (AI 재작성 없음; `published_at`/localization/slug 보존).
- **Discord workflow:** `기사 만들기 → quick_review → 사람 확인 → 공개` (PR #3 복구 완료)
- **SAME EVENT:** 수집·검토 단계 경고 유지. 승인 완료 큐의 명시적 사람 공개는 SAME EVENT hard block 없음 (PR #12). quick_review 등 비승인 경로는 기존 차단·override 유지.
- **직접 공개 workflow:** 비활성/제거 완료 (PR #3)

## 3. 현재 자동화 구조

### 전체 흐름

`뉴스 수집 → AI 중요도 평가 → Discord Brief → 명시적 기사 만들기 → 사람 검토 → 공개`

1. Vercel Cron이 지역별 Desk endpoint를 호출한다.
2. RSS/HTML/Radar/AP GraphQL source에서 후보를 수집해 `collection_candidates`에 저장한다.
3. OpenAI가 아직 평가되지 않은 후보의 중요도를 평가한다.
4. BEST/priority 후보를 Discord Brief로 보낸다.
5. Discord의 **기사 만들기** 또는 관리자 조작으로만 from-link/OpenAI 기사 생성이 실행된다.
6. 생성 기사는 `quick_review` 또는 일반 검토 대기에 들어간다.
7. 사람이 확인한 뒤에만 승인·공개한다.

각 Desk의 collect/recommend/Discord 단계는 독립적으로 예외 처리된다. 앞 단계의 성공은 뒤 단계 실패로 rollback되지 않는다. system alert 실패도 Desk 실행 결과를 실패시키지 않는다.

### 구성요소별 책임

| 구성요소 | 책임 | 현재 상태 |
|---|---|---|
| US / International Desk | 미국·국제 source 수집, AI 평가, Discord Brief | 활성 |
| Korea Desk | 한국 source 수집, AI 평가, Discord Brief | 활성 |
| Discord | Morning Brief, 후보 제외/선정, 기사 만들기, system alerts | 활성 |
| OpenAI | 후보 중요도 평가, 명시적 기사 생성, 명시적 AI 수정 | 활성; 자동 공개 금지 |
| Supabase | 후보·기사·workflow·로그 저장 | 활성 |
| Vercel Cron | `desk-us`, `desk-kr` 지역별 orchestration | 활성 |
| Make | 현재 `main`의 Desk 핵심 경로에서 참조 확인 안 됨 | 현재 비활성/legacy 여부 확인 필요 |
| 옛 단일 RSS/자동화 경로 | 지역별 Desk로 대체된 경로 | legacy로 취급; 실제 호출 여부 별도 확인 필요 |

### Vercel Cron

| Endpoint | UTC schedule | 역할 |
|---|---:|---|
| `/api/cron/desk-us` | `0 12 * * *` | US/International Desk |
| `/api/cron/desk-kr` | `0 0 * * *` | Korea Desk |

코드 주석상 ET 기준 약 오전 8시/오후 8시이며 DST 기간에는 ±1시간 차이를 허용한다.

## 4. 현재 뉴스 수집 Source

### US / International Desk

기본 run cap: 20개 (`RSS_MAX_CANDIDATES_US`, 최대 200).

| source key | 표시 이름 | 방식 | 상태 | 특수 규칙 |
|---|---|---|---|---|
| `ap` | AP | AP GraphQL | 활성 | legacy RSS host 대신 GraphQL |
| `pbs-newshour` | PBS NewsHour | RSS | 활성 | 일반 feed quota |
| `fox-news` | Fox News | RSS | 활성 | 일반 feed quota |
| `csm` | The Christian Science Monitor | RSS | 활성 | World feed |
| `bbc` | BBC World | RSS | 활성 | World feed |
| `sciencedaily` | ScienceDaily | RSS | 활성 | 일반 feed quota |
| `korea-herald` | The Korea Herald | RSS | 활성 | 영문 한국 매체지만 US/International Desk 소속 |

### Korea Desk

기본 run cap: 15개 (`RSS_MAX_CANDIDATES_KR`, 최대 200).

| source key | 표시 이름 | 방식 | 상태 | 특수 규칙 |
|---|---|---|---|---|
| `chosun` | 조선일보 | RSS | 활성 | 정치/경제/사회/국제 category feeds, publisher 단위 공정 quota |
| `tvchosun` | TV조선 | RSS | 활성 | 정치/경제/사회/국제 category feeds, publisher 단위 공정 quota |
| `yonhap-kr-radar` | 연합뉴스 속보 | YNA sitemap Radar | 활성 | main publisher 처리 후 실행, run당 최대 3; 대표 우선순위 낮음 |
| `insight` | 인사이트 | HTML section list | 활성 | RSS 미사용; 정치/경제/사회/국제만, 연예·라이프·트렌드 제외 |
| `joongang` | 중앙일보 | 예약 key | 비활성/미수집 | region 목록에는 있으나 feed source 미등록 |
| `yonhap` | Yonhap News Agency (English) | RSS | 비활성 | 영문 우회·중복 품질 문제; 기존 후보/기사 유지 |

수집 단계 자체는 OpenAI를 호출하거나 기사를 자동 생성하지 않는다. 저장은 `RSS_COLLECT_SAVE`가 활성일 때만 후보 DB에 반영한다.

## 5. 변경하면 안 되는 운영 원칙

- AI만으로 기사를 자동 공개하지 않는다.
- 최종 공개는 반드시 사람 확인을 거친다.
- 수정 대기 진입만으로 OpenAI를 실행하지 않는다.
- AI 수정은 사용자가 **AI로 수정**을 명시적으로 눌렀을 때만 실행한다.
- 수동 원문 입력을 허용한다.
- 관리자 강제 기사화를 허용한다.
- SAME EVENT 중복 방지를 유지한다.
- SAME EVENT는 차단하되 UPDATE / DIFFERENT ANGLE은 허용한다.
- Yonhap Radar는 일반 언론보다 낮은 대표 우선순위와 작은 quota를 유지한다.
- 폐기는 hard DELETE가 아니라 `archived` 상태의 soft archive다.
- archive 복구는 자동 공개가 아닌 안전한 검토 대기로 이동한다.
- system alert 전송 실패가 Desk 실행을 실패시키면 안 된다.
- secret/token/key/password의 값 또는 원문을 로그에 출력하지 않는다.
- 수집·추천·Discord 실패는 단계별로 격리하고 이전 단계 성공을 rollback하지 않는다.
- Discord **기사 만들기**는 OpenAI를 한 번 호출할 수 있으나 `quick_review`에만 두고 자동 공개하지 않는다.
- `/admin/approved` 승인 완료 명시적 공개는 SAME EVENT hard block 없이 진행한다 (PR #12). quick_review 등은 기존 SAME EVENT 차단·override 유지.
- 공개 목록에서 수정 대기로 보낼 때 개별/일괄 confirm을 요구한다.
- 수정 대기에서 **수정 없이 다시 공개**는 이전 `published_at`·localization·slug·본문을 보존하는 상태 복구만 허용한다.

## 6. Discord 구조

- **Morning Brief:** 지역별 BEST/priority 후보를 지정 채널에 전송한다.
- **기사 만들기:** 허용 사용자 버튼 조작으로 후보를 기사화하고 `quick_review`에 둔다.
- **빠른 검토 연결:** 사람의 최종 확인 한 번 전까지 공개되지 않는다.
- **System alerts:** Desk 이상을 별도 alerts 채널로 보내며 전송 실패는 무시된다.
- **Channel fallback:** `DISCORD_SYSTEM_ALERTS_CHANNEL_ID`가 없으면 Morning Brief 채널을 사용한다.
- **보안:** interaction signature를 검증하고 guild/user allowlist를 적용한다.

환경변수 이름(값 기록 금지):

- `DISCORD_APPLICATION_ID`
- `DISCORD_PUBLIC_KEY`
- `DISCORD_BOT_TOKEN`
- `DISCORD_GUILD_ID`
- `DISCORD_MORNING_BRIEF_CHANNEL_ID`
- `DISCORD_SYSTEM_ALERTS_CHANNEL_ID`
- `DISCORD_ALLOWED_USER_IDS`
- `DISCORD_MORNING_BRIEF_MAX_ITEMS`

관련 공통 환경변수:

- `CRON_SECRET`
- `OPENAI_API_KEY`
- `NEXT_PUBLIC_SUPABASE_URL`
- `NEXT_PUBLIC_SUPABASE_ANON_KEY`
- `SUPABASE_SERVICE_ROLE_KEY`
- `RSS_COLLECT_SAVE`
- `RSS_COLLECT_TEST`
- `RSS_MAX_CANDIDATES_US`
- `RSS_MAX_CANDIDATES_KR`
- `RSS_MAX_CANDIDATES_PER_RUN` (legacy/general)
- `RSS_MAX_SAVES_PER_DAY`
- `RSS_AUTO_ENRICH` / `RSS_MAX_ENRICH_PER_RUN` (현재 regional collect에서는 enrich 0)

## 7. 관리자 Workflow

| 단계 | 역할 / 이동 조건 |
|---|---|
| 수집 후보 | source 수집 결과. AI 평가 후 shortlist/제외/기사 만들기 가능 |
| 빠른 검토 | Discord 또는 관리자의 빠른 기사 생성 결과. `ready_for_human_review + quick_review` |
| 검토 대기 | 일반 기사 초안. `ready_for_human_review + pending` |
| 보류 | 당장 처리하지 않는 기사. 사람 조작으로 이동 |
| 수정 대기 | `needs_revision`; 진입 시 내용 보존, OpenAI 자동 실행 없음 |
| 반려 | `rejected`; 공개되지 않음 |
| 승인 | `approved`; 아직 공개되지 않음 |
| 공개 | `published + approved + is_published=true`; 사람 확인 필요 |
| 폐기·보관 | `archived` soft archive. 보류/수정 대기/반려에서 가능 |
| 복구 | archive에서 검토 대기로 복귀; 승인·공개하지 않음 |
| 수정 대기 → 재공개 | 이전에 공개됐던 기사만 AI 수정 없이 기존 공개 콘텐츠 그대로 복구 (PR #6) |

## 8. 최근 완료 작업

Git history와 현재 코드에서 확인:

- 관리자 성능 1차 최적화
- Admin navigation exact count 다중 호출을 45초 cache로 개선
- Supabase Auth `getUser()` 중복 제거
- 관리자 목록 heavy body 조회 제거
- 공개 Header의 관리자 링크 제거
- 모바일 주요 뉴스 이미지 16:10 통일
- 보류/수정 대기/반려 soft archive 및 복구
- 수정 대기 진입 시 OpenAI 자동 실행 제거
- 수동 원문 입력 + 관리자 강제 기사화
- SAME EVENT 중복 방지
- Discord system alerts 및 fallback
- Insight 한국 뉴스 수집
- US/International Desk와 Korea Desk 분리
- Discord 빠른 기사 생성/검토 workflow
- Discord quick_review Production 복구 완료 (PR #3)
- `/admin/approved` SAME EVENT 공개 차단 UX 배포 완료 (PR #4) — Digest `272674686` 원인(throw 처리) 해소
- Miracle News Shorts Studio Phase 1 Production 배포 완료 (PR #1) — `/admin/shorts`
- 수정 대기 → 이전 공개 상태 복구 Production 배포 및 50건 실제 복구 완료 (PR #6) — AI 재작성 없음; `published_at`/localization/slug 보존; 공개→수정 대기 confirm 추가
- 홈페이지 신문형 3열·카테고리 내비 Production 반영 완료 (PR #7) — 왼쪽 지금 주목 · 중앙 본문 · 오른쪽 지금 뜨는 이슈
- 홈 editorial ranking Phase 1: **Production 적용 완료** (PR #8 merged → `39d9b8886ed594cdb856a9644d34d951b0b2bd29`) — pin 72h·7일 핵심·event family 다양성
  - featured + 「지금 주목」: 동일 event family 최대 2건 (두 번째는 UPDATE/DIFFERENT ANGLE만)
  - snapshot 컬럼 write는 `ARTICLES_AI_RECOMMEND_SNAPSHOT=1`일 때만 (기본 OFF) — **migration 미적용**
  - 홈 ranking은 `collection_candidates.article_id` 조인 fallback 유지
  - stale top-story `54ca435f…`는 코드에서 홈 핵심 미노출; DB `is_top_story`는 별도 승인 후 정리
- 정치·경제 편집 정책: **Production 적용 완료** (PR #9 merged → `e0b41ddaa8b06657c824f9df147e48314262fdf7`)
  - **적용 완료:** `EDITORIAL_POLICY.md` · AI prompt/post-process 가중 · 홈 policy points · Discord beat·관점 표시 · 카테고리 표시 repair(display-only) · Shorts 선택·**한눈 균형 브리핑** 정책 및 `publicContract` export · event-family meaningful **UPDATE leadership**
  - **UPDATE leadership:** 동일 event family 내 상태 변화 UPDATE가 과거 AI `best`보다 우선; sibling grade 상속; 역할 분리 — **update** / **background** / **different_angle**
  - **Production 검증 (2026-08-28):** 네팔 최신 이송 UPDATE(`고립 10명 중 9명 안전 이송`)가 featured 대표; 이전 실종·고립 기사는 background(관련); 빙하·온난화는 DIFFERENT ANGLE; 정치·경제 우선순위 반영; soft/왕실/연예 핵심 영역 억제; event family 최대 2 · source 독점 방지 · 7일 freshness 유지
  - **운영 원칙 유지:** 자동 공개·자동 업로드 금지 · `humanReviewRequired=true` · 사람 검토 필수
  - **미완료 (정확히 미구현/미달성):**
    - 정치·경제 전용 RSS/feed 확대 **미구현**
    - 실제 수집 정치·경제 비율 약 **20%** (READ-ONLY 추정)
    - 55%는 **권장 목표**이며 **달성 전**
    - Shorts PR #5 패키지 생성기와 균형 브리핑 **미연결** (PR #5 OPEN · 미병합)
    - OpenAI 균형 대본 **실호출 미검증**
    - 관리자 균형 검토 UI **미구현**
    - 영상 생성·SNS 업로드 **미구현**
    - articles AI recommend snapshot migration **미적용** (`20260827_articles_ai_recommend_snapshot.sql`)
    - `ARTICLES_AI_RECOMMEND_SNAPSHOT` **미설정** (기본 OFF)
  - 홈 ranking은 `collection_candidates.article_id` 조인 fallback 유지
  - stale top-story `54ca435f…`는 코드에서 홈 핵심 미노출; DB `is_top_story`는 별도 승인 후 정리
- 알려진 인계 결과: PR #9 merge 시점 `npm test` 277 pass · `npm run build` SUCCESS
- 승인 완료 공개·SAME EVENT 조기 검토: **Production 적용 완료** (PR #12 merged → `1c9831b4c85446711b0ecbe6d5bfbe22243d19e6`)
  - 승인 완료 명시적 사람 공개: SAME EVENT hard block 없음 (`publishApprovedArticleToLive()`)
  - 개별·일괄 공개 모두 적용; 일괄은 기사별 결과 처리 후 한 번만 결과 이동 (첫 실패에서 중단 없음)
  - 수집 후보 관련 기사 패널 (SAME EVENT / UPDATE / DIFFERENT ANGLE 라벨, 14일·400건 pool)
  - Discord `quick_review`·AI 자동 공개 금지 유지
  - **미완료:** 실제 Production 승인 기사 일괄 공개 운영 검증은 아직 미실행

## 9. 현재 미해결 문제

### Critical

- 현재 코드 조사에서 확정된 Critical 문제 없음.
- 단, 아래 운영 검증이 완료되기 전 Production 안정성을 확정하지 않는다.

### Needs monitoring

- 홈 stale `is_top_story`: `54ca435f-100e-4393-bc44-53100738eb0a` (카카오 파업 예고, published_at=2026-05-28, is_top_story=true). PR #8 코드는 홈 핵심 영역에서 만료 처리하나 **DB 플래그는 미정리** — 별도 승인 후 `is_top_story=false` 정리 검토
- 승인→공개 (PR #12): 승인 완료 명시적 공개·일괄 결과 UI — **코드 Production 반영 완료**; 실제 일괄 공개 운영 검증은 미실행
- Discord `기사 만들기 → quick_review → 사람 확인 → 공개` 실제 운영 경로
- 2~3일 지역별 Desk 실제 실행 안정성
- Korea source별 실제 유입량과 HTML/Radar parser 안정성
- SAME EVENT가 중복은 억제하면서 UPDATE / DIFFERENT ANGLE을 과도하게 차단하지 않는지
- Discord Brief·interaction·system alerts 전달
- 관리자 성능과 모바일 16:10 렌더링
- Vercel Production 배포 SHA와 GitHub `main` 일치 여부

### Planned

- Shorts Studio AI 제작 패키지 2단계 (Hook·대본·나레이션·자막·화면 구성안)
- Vercel project name, Supabase project ref를 비밀값 없이 문서에 확정

### Legacy / no longer applicable

- Discord `기사 만들기` 직접 공개 workflow: PR #3로 제거·비활성 완료
- `/admin/approved` SAME EVENT 차단 Application error (Digest `272674686`): PR #4로 redirect 안내·override UX 배포 완료. 정상 차단을 throw로 처리하던 UX 문제였으며 데이터 손상 없음
- 수정 대기 진입 시 OpenAI 자동 실행 문제: 해결됨
- 기사 hard delete 전제: 현재 soft archive로 대체됨
- 단일/옛 자동화와 Make 경로: 현행 regional Desk 핵심 코드에서 확인되지 않음; 실제 외부 Make scenario 활성 여부 확인 필요
- 수정 대기 50건 일괄 복구 긴급 대응: **완료** (2026-08-27)
- Yonhap English 자동 수집: 비활성

## 10. Operational Validation

**Status: IN PROGRESS**

현재 Miracle News는 2~3일 실제 운영하면서 안정성을 확인하는 단계다. 수정 대기 50건 복구 긴급 대응은 완료됐으며, Shorts Phase 2 재개 전 Production 안정성 확인이 남아 있다.

**PR #12 Production 배포:** 완료 (2026-08-28) — Production Application Baseline `1c9831b…` · Vercel Production SUCCESS · `/ko`·`/en`·관리자 login redirect 기본 확인. **전체 Operational Validation을 완료로 간주하지 않음** — 실제 승인 기사 일괄 공개 운영 검증·신규 기사 순위·UPDATE·관점 다양성은 계속 monitoring.

**PR #9 Production 배포 및 기본 회귀 검증:** 완료 (2026-08-28) — Production Application Baseline `e0b41dd…` (PR #12 이전) · 네팔 UPDATE 대표·background/DIFFERENT ANGLE·정치·경제 우선·soft 억제·event family cap·source 다양성·7일 freshness·신문형 UI/tablist 기본 회귀 확인.

검증 항목:

- 오전 US/International Desk
- 오후 Korea Desk
- Discord Brief
- 한국 source 유입
- Insight 수집
- SAME EVENT 중복 억제
- 시스템 장애 알림
- 빠른 기사 생성/검토/공개
- 승인→공개 및 SAME EVENT 차단 안내·override
- 수정 대기 → 이전 공개 복구 (50건)
- 관리자 속도
- 모바일 화면

| 날짜 | Desk/항목 | 결과 | 발견 문제 | 조치/다음 확인 | 확인자 |
|---|---|---|---|---|---|
| 2026-08-28 | PR #12 approved publishing Production | **배포 성공** | 승인 완료 명시적 공개·일괄 결과 UI·수집 후보 관련 기사 Production 반영. 실제 일괄 공개 운영 검증 미실행. | 다음 승인 기사 일괄 공개 실제 운영 확인 | 관리자 |
| 2026-08-28 | PR #9 editorial policy Production | **배포·기본 회귀 성공** | 네팔 UPDATE 대표·background/DIFFERENT ANGLE·PE 우선·soft 억제·family cap·7d·UI/tablist 확인. 수집 55%·Shorts 균형 브리핑·OpenAI 실호출은 미완. | 신규 기사 순위·UPDATE·관점 다양성 monitoring | 관리자 |
| 2026-08-27 | 수정 대기 50건 복구 | **성공 50건** | 수정 대기 잔여 0건. `status=published`, `review_status=approved`, `revision_status=none`, `is_published=true`, `published_at` 보존, ko/en slug 존재. 표본 `/ko`·`/en` article 200. OpenAI 호출·본문 변경 흔적 없음. | Shorts Phase 2 재개 전 2~3일 운영 안정성 확인 | 관리자 |
| YYYY-MM-DD | US/International | 미기록 |  |  |  |
| YYYY-MM-DD | Korea | 미기록 |  |  |  |
| YYYY-MM-DD | Discord/관리자/모바일 | 미기록 |  |  |  |

## 11. Git / Deployment

| 항목 | 값 |
|---|---|
| Branch | `main` |
| **Production Application Baseline** | `1c9831b4c85446711b0ecbe6d5bfbe22243d19e6` |
| Production main commit | `1c9831b4c85446711b0ecbe6d5bfbe22243d19e6` |
| Vercel Production | 배포 성공 (SHA = Application Baseline 일치) |
| Production URL | https://www.hannoon.co |
| Discord workflow | 기사 만들기 → `quick_review` → 사람 확인 → 공개 |
| SAME EVENT | 수집·검토 경고 유지; 승인 완료 명시적 공개는 hard block 없음 (PR #12); quick_review 등은 기존 차단·override |
| Approved publishing | **PR #12 merged — Production 적용 완료** (`1c9831b…`) |
| Revision restore | PR #6 merged — 50건 복구 완료 |
| 직접 공개 workflow | 비활성/제거 완료 |
| Restore PRs | #3 Discord quick_review · #4 approved SAME EVENT UX · #6 revision restore — merged |
| Home UI | PR #7 merged — Production 반영 완료 |
| Home editorial ranking | PR #8 merged — Production 적용 완료 (`39d9b88…`) |
| Editorial policy (politics/economy) | **PR #9 merged — Production 적용 완료** (`e0b41dd…`) |
| Shorts Studio | PR #1 merged (Phase 1) · **PR #5 OPEN** (Phase 2 package, 미병합) |
| articles AI snapshot migration | **미적용** (`20260827_articles_ai_recommend_snapshot.sql`) |
| `ARTICLES_AI_RECOMMEND_SNAPSHOT` | **미설정** (기본 OFF) |
| Shorts package migration | 기존 적용 상태 보존 |
| Production = main | 예 — `1c9831b` (PR #12 approved publishing 포함) |

## 12. 다음 최우선 작업

1. 다음 승인 기사 일괄 공개 실제 운영 확인.
2. Shorts PR #5에 최신 main 일반 merge.
3. 균형 브리핑 패키지 연결.
4. Preview에서 OpenAI 1회 smoke test.
5. 이후 정치·경제 수집 feed 확대.

## 12A. Miracle News Shorts Studio Phase 1

- **상태:** **Production 반영 완료** (PR #1 merged, Vercel Production SUCCESS)
- **Production URL:** https://www.hannoon.co/admin/shorts (비로그인 시 `/admin/login?next=/admin/shorts` redirect — 정상)
- **Production commit:** `6c185cfebffc8e9745cac544e8e54d6c19e8a62f` (PR #6 revision restore; Shorts Phase 1 코드 포함)
- **검증:** `npm test` 199/199 PASS · `npm run build` SUCCESS

**현재 가능한 기능**

- `published + approved + is_published=true` 공개 기사 조회
- America/New_York 날짜 기준 선택 (DST 포함)
- 오전 US/International · 저녁 Korea Desk 분류 (`lib/rss/collectRegions.ts` source key)
- 기사 3~5개 선택 (클라이언트 UI)

**아직 미구현**

- 선택 저장 (서버 persist 없음)
- AI Hook·대본·나레이션·자막·화면 구성안 생성
- 영상 제작·YouTube/Instagram/Facebook 업로드

- **Desk 분류:** Korea Herald(`korea-herald`)는 US/International(아침), Korea Desk는 `chosun`·`tvchosun`·`yonhap-kr-radar`·`insight`·`joongang`(예약)
- **운영 원칙:** 사람 검토 원칙 유지, 자동 공개·Production DB write·schema 변경 없음

## 13. 문서 관리 규칙

- 모든 Miracle News 작업은 최신 GitHub `main`과 이 문서를 먼저 확인한다.
- 기능·운영·자동화·source·배포 상태가 바뀌면 같은 작업에서 이 문서도 함께 갱신한다.
- 해결된 문제를 미해결 항목에 남기지 않는다.
- 확인할 수 없는 값은 추측하지 않고 **확인 필요**로 기록한다.
- secret/API key/password/token 값은 절대 기록하지 않는다.
- 로컬 Mac 경로를 다른 AI 환경의 접근 가능한 위치로 전제하지 않는다.

---

- **Digest 272674686:** 정상 SAME EVENT 차단을 throw로 처리하던 UX 문제 — PR #4로 해소, 데이터 손상 없음
- **Last Updated:** 2026-08-28 UTC
- **Production Application Baseline:** `1c9831b4c85446711b0ecbe6d5bfbe22243d19e6` — Merge PR #12 approved publishing
- **Production main commit:** `1c9831b4c85446711b0ecbe6d5bfbe22243d19e6`
- **Vercel Production:** 배포 성공 (`https://www.hannoon.co`) — PR #12 approved publishing 반영
- **Discord workflow:** 기사 만들기 → quick_review → 사람 확인 → 공개
- **SAME EVENT:** 수집·검토 경고 유지; 승인 완료 명시적 공개는 hard block 없음 (PR #12)
- **Approved publishing (PR #12):** Production 적용 완료 — 개별·일괄 공개; 실제 일괄 공개 운영 검증 미실행
- **Revision restore (PR #6):** Production 배포 완료; 수정 대기 50건 복구 완료
- **Operational Validation:** IN PROGRESS — PR #12 Production 배포 완료; 실제 일괄 공개 운영 검증·신규 기사 순위·UPDATE·관점 다양성 monitoring
- **Shorts Studio Phase 1:** Production 반영 완료 (`/admin/shorts`, PR #1)
- **Shorts PR #5:** OPEN — Phase 2 package 보존 (미병합)
- **articles AI snapshot migration:** 미적용
- **`ARTICLES_AI_RECOMMEND_SNAPSHOT`:** 미설정
- **Home PR #7 / #8 / #9:** Production 반영 완료
- **Editorial policy (politics/economy):** PR #9 Production 적용 완료 — UPDATE leadership · 한눈 균형 브리핑 정책 · public contract
- **Current Priority:** (1) 다음 승인 기사 일괄 공개 실제 운영 확인 → (2) Shorts PR #5 main merge → (3) 균형 브리핑 패키지 연결
- **Next Review:** 승인 일괄 공개 운영 확인 · Shorts PR #5 merge · Preview OpenAI smoke test
