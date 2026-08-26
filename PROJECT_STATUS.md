# Miracle News — PROJECT STATUS

> **Single Source of Truth:** GitHub `wandfools-create/miracle-news`의 `main` 브랜치와 이 문서.
>
> 모든 AI/개발 작업은 먼저 최신 `main`과 이 문서를 읽고 시작한다. 이 문서는 비밀값을 저장하지 않는다.

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
| Production main commit | `292bc216fd352d5fa9e7fa8904045e3f159c0e41` — `Merge pull request #3 from wandfools-create/fix/restore-discord-quick-review` |
| Vercel Production | 배포 성공 (`https://www.hannoon.co`) |

비밀번호, API key, bot token, service-role key, webhook secret 등은 이 문서에 기록하지 않는다.

## 2. 현재 Production 구조

```text
GitHub main
   │ Vercel 연결/빌드
   ▼
Vercel Production ── https://www.hannoon.co
   ├─ 공개 사이트 /ko, /en
   ├─ 관리자 /admin/*
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
- **Production SHA:** `292bc216fd352d5fa9e7fa8904045e3f159c0e41` — Vercel Production 배포 성공.
- **Discord workflow:** `기사 만들기 → quick_review → 사람 확인 → 공개`
- **직접 공개 workflow:** 비활성/제거 완료 (PR #3 병합·배포 반영)

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
- Discord quick_review Production 복구 완료 (PR #3, `292bc21`)
- 알려진 인계 결과: `npm test` 191 tests 통과, build 성공 (현재 GitHub 환경에서 재실행하지 않음)

## 9. 현재 미해결 문제

### Critical

- 현재 코드 조사에서 확정된 Critical 문제 없음.
- 단, 아래 운영 검증이 완료되기 전 Production 안정성을 확정하지 않는다.

### Needs monitoring

- 승인 후「공개」시 SAME EVENT 차단이 Application error로 보이던 UX: 로컬에서 `/admin/approved` 안내·override로 수정 중(배포 전). 판정 로직 자체는 정상
- Discord `기사 만들기 → quick_review → 사람 확인 → 공개` 실제 운영 경로
- 2~3일 지역별 Desk 실제 실행 안정성
- Korea source별 실제 유입량과 HTML/Radar parser 안정성
- SAME EVENT가 중복은 억제하면서 UPDATE / DIFFERENT ANGLE을 과도하게 차단하지 않는지
- Discord Brief·interaction·system alerts 전달
- 관리자 성능과 모바일 16:10 렌더링
- Vercel Production 배포 SHA와 GitHub `main` 일치 여부

### Planned

- 운영 안정성 확인 후 Miracle News Shorts AI 1단계
- Vercel project name, Supabase project ref를 비밀값 없이 문서에 확정

### Legacy / no longer applicable

- Discord `기사 만들기` 직접 공개 workflow: PR #3로 제거·비활성 완료 (`292bc21` Production 배포)
- 수정 대기 진입 시 OpenAI 자동 실행 문제: 해결됨
- 기사 hard delete 전제: 현재 soft archive로 대체됨
- 단일/옛 자동화와 Make 경로: 현행 regional Desk 핵심 코드에서 확인되지 않음; 실제 외부 Make scenario 활성 여부 확인 필요
- Yonhap English 자동 수집: 비활성

## 10. Operational Validation

**Status: IN PROGRESS**

현재 Miracle News는 2~3일 실제 운영하면서 안정성을 확인하는 단계다. 완료 증거가 기록되기 전에는 **검증 완료**로 변경하지 않는다. Discord quick_review workflow는 Production에 복구 완료됐으며, 이후 실제 운영 결과 확인이 남아 있다.

검증 항목:

- 오전 US/International Desk
- 오후 Korea Desk
- Discord Brief
- 한국 source 유입
- Insight 수집
- SAME EVENT 중복 억제
- 시스템 장애 알림
- 빠른 기사 생성/검토/공개
- 관리자 속도
- 모바일 화면

| 날짜 | Desk/항목 | 결과 | 발견 문제 | 조치/다음 확인 | 확인자 |
|---|---|---|---|---|---|
| YYYY-MM-DD | US/International | 미기록 |  |  |  |
| YYYY-MM-DD | Korea | 미기록 |  |  |  |
| YYYY-MM-DD | Discord/관리자/모바일 | 미기록 |  |  |  |

## 11. Git / Deployment

| 항목 | 값 |
|---|---|
| Branch | `main` |
| Production main commit | `292bc216fd352d5fa9e7fa8904045e3f159c0e41` |
| Vercel Production | 배포 성공 |
| Production URL | https://www.hannoon.co |
| Discord workflow | 기사 만들기 → `quick_review` → 사람 확인 → 공개 |
| 직접 공개 workflow | 비활성/제거 완료 |
| Restore PR | #3 — merged |
| Production = main | 예 — `292bc21` 배포 성공 |

## 12. 다음 최우선 작업

1. 2~3일 Operational Validation을 진행하고 날짜별 결과를 이 문서에 기록한다.
2. Discord `기사 만들기 → quick_review → 사람 확인 → 공개` 실제 운영 결과를 확인한다.
3. 승인 후 server-side exception 재발 여부를 계속 모니터링한다.
4. 안정성 확인 후 신규 하위 작업 **Miracle News Shorts AI** 1단계를 시작한다.

Shorts 1단계:

`published 기사 → 중요 뉴스 3~5개 선정 → 오전/저녁 Shorts 대본 → 나레이션 → 자막 → 화면 구성안 → 사람 검토`

- 오전: 미국·국제 중심 **한눈 아침뉴스**
- 오후/저녁: 한국 중심 **한눈 저녁뉴스**
- 초기에는 영상 자동 생성·자동 게시까지 진행하지 않는다.
- 기존 Miracle News source/DB를 이동·복제하지 않고 `published` 기사만 사용한다.

## 13. 문서 관리 규칙

- 모든 Miracle News 작업은 최신 GitHub `main`과 이 문서를 먼저 확인한다.
- 기능·운영·자동화·source·배포 상태가 바뀌면 같은 작업에서 이 문서도 함께 갱신한다.
- 해결된 문제를 미해결 항목에 남기지 않는다.
- 확인할 수 없는 값은 추측하지 않고 **확인 필요**로 기록한다.
- secret/API key/password/token 값은 절대 기록하지 않는다.
- 로컬 Mac 경로를 다른 AI 환경의 접근 가능한 위치로 전제하지 않는다.

---

- **Last Updated:** 2026-08-26 UTC
- **Production main commit:** `292bc216fd352d5fa9e7fa8904045e3f159c0e41`
- **Vercel Production:** 배포 성공 (`https://www.hannoon.co`)
- **Discord workflow:** 기사 만들기 → quick_review → 사람 확인 → 공개
- **직접 공개 workflow:** 비활성/제거 완료
- **Operational Validation:** IN PROGRESS
- **Current Priority:** 2~3일 운영 안정성 검증
- **Next Review:** Discord 기사 생성 → quick_review → 사람 확인 → 공개 실제 운영 결과 확인 후
