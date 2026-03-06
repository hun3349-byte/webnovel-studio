# AI 기반 상업 웹소설 집필 스튜디오 (Webnovel Studio)

## 프로젝트 개요

**목표**: '상업적으로 흥행할 수 있는 웹소설'을 AI와 인간(PD)이 협업하여 창작하는 통합 스튜디오 시스템

**최우선 가치**: 회차 간의 완벽한 스토리 연속성과 개연성 유지

**핵심 특징**:
- Memory Chaining: 에피소드 로그 자동 압축 및 슬라이딩 윈도우 컨텍스트
- 자가진화 시스템: 사용자 피드백 학습으로 필력 우상향
- 상업적 집필 엔진: 4,000~6,000자 분량, 절단신공 의무화, Show Don't Tell

---

## 기술 스택

- **Frontend**: Next.js 16 (App Router), React 19, Tailwind CSS 4
- **Backend**: Next.js API Routes, Supabase (PostgreSQL)
- **AI**: Claude API (Anthropic)
- **Language**: TypeScript 5

---

## 폴더 구조

```
webnovel-studio/
├── src/
│   ├── app/                          # Next.js App Router
│   │   ├── (auth)/                   # 인증 관련
│   │   │   ├── login/
│   │   │   └── register/
│   │   ├── (studio)/                 # 메인 스튜디오
│   │   │   └── projects/
│   │   │       ├── page.tsx              # 프로젝트 목록
│   │   │       └── [projectId]/
│   │   │           ├── page.tsx          # 대시보드
│   │   │           ├── world-bible/      # 세계관 설정
│   │   │           ├── characters/       # 캐릭터 관리
│   │   │           ├── episodes/         # 에피소드 집필
│   │   │           ├── timeline/         # 스토리 타임라인
│   │   │           └── export/           # 내보내기
│   │   └── api/
│   │       ├── ai/
│   │       │   ├── generate-episode/     # 에피소드 생성
│   │       │   ├── compress-log/         # 로그 압축
│   │       │   ├── retry-log/            # 로그 재시도
│   │       │   └── analyze-feedback/     # 피드백 분석
│   │       ├── episodes/
│   │       ├── characters/
│   │       └── world-bible/
│   │
│   ├── core/                         # 핵심 비즈니스 로직
│   │   ├── memory/
│   │   │   ├── sliding-window-builder.ts    # ★ 슬라이딩 윈도우 컨텍스트 빌더
│   │   │   ├── episode-log-compressor.ts    # 에피소드 로그 압축기
│   │   │   └── writing-memory-learner.ts    # 문체 학습기
│   │   ├── engine/
│   │   │   ├── prompt-injector.ts           # ★ 프롬프트 동적 주입기
│   │   │   ├── commercial-validator.ts      # 분량/절단신공 검증기
│   │   │   └── writing-persona.ts           # AI 페르소나
│   │   ├── queue/
│   │   │   └── log-queue-processor.ts       # ★ 로그 재시도 큐 처리기
│   │   └── simulation/
│   │       ├── character-simulator.ts
│   │       └── relationship-graph.ts
│   │
│   ├── lib/
│   │   ├── supabase/
│   │   │   ├── client.ts                    # 브라우저 클라이언트
│   │   │   └── server.ts                    # 서버 클라이언트
│   │   ├── ai/
│   │   │   ├── claude-client.ts             # Claude API 클라이언트
│   │   │   └── prompts/
│   │   │       ├── base-persona.ts
│   │   │       ├── episode-generation.ts
│   │   │       └── log-compression.ts
│   │   └── export/
│   │       ├── naver-formatter.ts
│   │       └── munpia-formatter.ts
│   │
│   ├── components/
│   │   ├── editor/
│   │   ├── world-bible/
│   │   ├── timeline/
│   │   └── ui/
│   │
│   └── types/
│       ├── database.ts                      # Supabase 타입
│       └── memory.ts                        # 메모리 시스템 타입
│
├── supabase/
│   ├── migrations/
│   │   └── 00001_initial_schema.sql         # ★ 초기 스키마
│   ├── seed/
│   └── config.toml
│
└── docs/
```

---

## 데이터베이스 스키마

### 핵심 테이블

| 테이블 | 설명 |
|--------|------|
| `projects` | 소설 프로젝트 |
| `world_bibles` | 세계관 절대 규칙 |
| `characters` | 캐릭터 기본 정보 + 현재 상태 |
| `character_memories` | ★ 캐릭터 장기 기억 (원자화) |
| `character_relationships` | 캐릭터 관계도 |
| `episodes` | 에피소드 본문 + 로그 상태 |
| `episode_logs` | ★ 에피소드 압축 로그 (Memory Chaining) |
| `episode_log_queue` | ★ 로그 생성 재시도 큐 |
| `story_hooks` | ★ 떡밥 관리 (미해결/해결) |
| `writing_memories` | 사용자 문체 학습 데이터 |
| `timeline_events` | ★ 매크로 스토리 연표 (아크, 충돌, 마일스톤) |

### 보완점 반영 사항

1. **트랜잭션/롤백 보장**
   - `episodes.log_status`: pending → processing → completed/failed/fallback
   - `episode_log_queue`: 재시도 큐 (max 3회)
   - `create_fallback_episode_log()`: AI 실패 시 임시 로그 생성

2. **장기 기억 확장성**
   - `character_memories`: JSONB가 아닌 별도 테이블로 분리 (Full-text search 가능)
   - `story_hooks`: 떡밥 별도 테이블 (1화 떡밥을 100화에서 검색)
   - `search_character_memories()`: 장기 기억 검색 함수

### PostgreSQL 함수

```sql
-- 슬라이딩 윈도우 컨텍스트 조회
get_sliding_window_context(project_id, target_episode, window_size)

-- 미해결 떡밥 조회
get_unresolved_hooks(project_id, limit)

-- 캐릭터 장기 기억 검색
search_character_memories(project_id, search_query, limit)

-- Fallback 로그 생성 (AI 실패 시)
create_fallback_episode_log(episode_id, project_id, episode_number, content)

-- 특정 에피소드에 활성화된 타임라인 이벤트 조회
get_active_timeline_events(p_project_id, p_episode_number)
```

---

## 핵심 파이프라인

### 에피소드 생성 플로우

```
1. 슬라이딩 윈도우 컨텍스트 빌드
   └─ World Bible + 직전 3~5개 로그 + 마지막 500자 + 캐릭터 상태 + 미해결 떡밥 + 문체 선호도

2. 프롬프트 동적 주입
   └─ 페르소나 + 컨텍스트 + 사용자 지시사항 조립

3. AI 에피소드 생성 (Claude API)

4. 상업성 검증
   └─ 분량 체크 (4,000~6,000자) + 절단신공 점수 + Show/Tell 비율

5. 에피소드 저장 → 자동 로그 큐 등록 (DB 트리거)

6. 로그 압축 (별도 AI 호출)
   └─ 성공 시: episode_logs 저장
   └─ 실패 시: 재시도 큐 등록 or Fallback 로그 생성
```

### 슬라이딩 윈도우 컨텍스트

```typescript
interface SlidingWindowContext {
  worldBible: WorldBible;              // 세계관 절대 규칙
  recentLogs: EpisodeLogSummary[];     // 직전 N개 회차 요약
  lastSceneAnchor: string;             // 직전 회차 마지막 500자
  activeCharacters: CharacterCurrentState[];  // 캐릭터 현재 상태
  unresolvedHooks: UnresolvedHook[];   // 미해결 떡밥
  writingPreferences: WritingPreference[];    // 학습된 문체
  longTermMemories?: LongTermMemoryResult[];  // 장기 기억 검색 결과
}
```

---

## 상업적 집필 규칙 (v5.1 - 4대 헌법)

### 제0장. 자가진화 피드백 루프 (최우선 규칙)
- PD가 이전 화에서 수정한 텍스트의 문체 패턴은 **그 어떤 규칙보다 우선**
- PD가 지적한 이전 화의 실수를 **절대 반복 금지**
- 소설을 쓸수록 PD의 취향을 흡수하여 **필력 우상향 진화**

### 제1장. 텐션과 서사 (어그로와 절단신공)
1. **첫 문장 어그로**: 느슨한 시작 금지, 감각적 충격으로 시작
2. **Show, Don't Tell**: 감정 직접 서술 금지 → 신체 반응으로 번역
3. **클리프행어 의무화**: 위기/발견/반전/선언으로 끝낼 것

### 제2장. 문체와 호흡 (리듬감)
1. **단짠단짠 리듬**: 짧은 문장 3~5개 + 긴 서술 1~2개
2. **공감각 묘사 의무**: 한 장면에 2가지 이상 감각 묘사
3. **자연스러운 화면 전환**: 구분선(---) 금지, 오버랩 전환
4. **소설 포맷 강제**: 마크다운 전면 금지, 순수 텍스트만

### 제3장. 대사와 캐릭터 (70/30 법칙)
1. **절제된 대사**: 짧고 뼈있게 + 전후 동작 묘사
2. **핑퐁 대화 금지**: 티키타카 나열 금지
3. **주인공의 여유 (능구렁이 톤앤매너)**: 유들유들하고 뻔뻔한 말장난, 너스레로 상황 넘기기

### 제4장. 절대 금기 사항
1. **현대 외래어 금지**: 팁, 오케이, 마스터, 레벨 등
2. **자기표절 금지**: 같은 단어/구조 반복 금지
3. **엑스트라 해설 금지**: "고수다!" 대사 금지, 상황 묘사로 증명
4. **과거/신분 직접 노출 금지**: 시각적 떡밥으로만 제시
5. **최종 보스 낭비 금지**: 초반 적은 삼류 흑도/왈패로 설정

### 분량 규칙
- 에피소드당 공백 포함 **4,000~6,000자** 엄수

---

## 환경 설정

### .env.local

```env
NEXT_PUBLIC_SUPABASE_URL=your_supabase_url
NEXT_PUBLIC_SUPABASE_ANON_KEY=your_anon_key
SUPABASE_SERVICE_ROLE_KEY=your_service_role_key
ANTHROPIC_API_KEY=your_claude_api_key
NEXT_PUBLIC_APP_URL=http://localhost:3000
```

---

## Claude API 스트리밍 (SSE)

### TTFB 방어 메커니즘

서버리스 환경(Vercel, Railway)에서 긴 컨텍스트 처리 시 타임아웃 방지:

```typescript
// 스트림 연결 직후 Heartbeat 즉시 전송
onHeartbeat: () => {
  enqueue(createHeartbeatMessage('작가 AI가 이전 회차를 읽고 있습니다...'));
}
```

### SSE 메시지 타입

| 타입 | 설명 |
|------|------|
| `heartbeat` | TTFB 방어용 더미 메시지 (연결 직후 즉시 전송) |
| `text` | AI가 생성한 텍스트 청크 |
| `complete` | 생성 완료 (글자 수, 토큰 사용량 포함) |
| `error` | 에러 발생 |

### 테스트 페이지

- **URL**: `/test`
- **기능**: 스트리밍 테스트, TTFB 확인, 글자 수 실시간 카운트
- **테스트 컨텍스트**: 무협 세계관 (검황전설), 주인공 이청운

---

## 개발 현황

### 완료

- [x] 프로젝트 스켈레톤 (Next.js 16 + Tailwind 4 + Supabase)
- [x] DB 스키마 설계 및 마이그레이션 파일
- [x] 슬라이딩 윈도우 빌더 (`src/core/memory/sliding-window-builder.ts`)
- [x] 프롬프트 주입기 (`src/core/engine/prompt-injector.ts`)
- [x] 로그 큐 처리기 (`src/core/queue/log-queue-processor.ts`)
- [x] TypeScript 타입 정의 (`src/types/`)
- [x] 기본 레이아웃 및 페이지 컴포넌트
- [x] **Claude API 클라이언트** (`src/lib/ai/claude-client.ts`) - SSE 스트리밍 + TTFB 방어
- [x] **상업 웹소설 페르소나** - 분량/절단신공/Show Don't Tell 강제
- [x] **테스트 API** (`/api/ai/test-generate`) - 스트리밍 테스트
- [x] **테스트 UI** (`/test`) - 실시간 생성 확인
- [x] **에피소드 에디터 UI** - SSE 스트리밍, 컨텍스트 패널, 채택 기능
- [x] **세계관 설정 페이지** - World Bible CRUD
- [x] **캐릭터 관리 페이지** - 캐릭터 CRUD, 메모리 표시
- [x] **로그 압축 API** (`/api/ai/compress-log`) - AI 기반 에피소드 요약 생성
- [x] **큐 처리 API** (`/api/ai/process-queue`) - 백그라운드 로그 생성 처리
- [x] **로그 상태 UI** - 에디터 내 로그 상태 표시 및 재시도 기능
- [x] **프롬프트 컨텍스트 주입 버그 수정** - DB에서 World Bible/Character 정상 로드
- [x] **시스템 프롬프트 v5.1** - 4대 헌법 + 자가진화 피드백 루프
- [x] **캐릭터 상세 정보 주입** - 성격/배경/말투 프롬프트 포함
- [x] **테스트 API projectId 지원** - 실제 DB 컨텍스트 사용 가능
- [x] **테스트 UI projectId 입력** - 실제 프로젝트 테스트 지원

### 2024-03 구현 완료

- [x] **Supabase 프로젝트 연동** (project-ref: `bllgudzcmfzrdjusdnrv`)
  - 마이그레이션 실행 완료 (15개 테이블 + 4개 함수)
  - TypeScript 타입 자동 생성 (`src/types/database.ts`)

- [x] **타임라인 페이지** (`/projects/[id]/timeline`)
  - Timeline API (`/api/projects/[projectId]/timeline`)
  - 3가지 뷰 모드: 타임라인, 떡밥 추적, 캐릭터
  - 에피소드별 세로 타임라인 시각화
  - 떡밥 생성/해결 시점 추적
  - 캐릭터 역할별 그룹화

- [x] **Writing Memory 시스템** (`/projects/[id]/writing-memory`)
  - Writing Memory API (`/api/projects/[projectId]/writing-memories`)
  - 피드백 분석 AI API (`/api/ai/analyze-feedback`)
  - Writing Memory Learner (`src/core/memory/writing-memory-learner.ts`)
  - 카테고리별 필터 (문체/어휘/호흡/대사/묘사/구조)
  - 수동 규칙 추가 + AI 텍스트 비교 분석
  - 활성화/비활성화 토글, 신뢰도 시스템

- [x] **플랫폼별 내보내기** (`/projects/[id]/export`)
  - 네이버 시리즈 포맷터 (`src/lib/export/naver-formatter.ts`)
    - HTML/텍스트 출력, 문단 스타일, 대사 강조, 장면 전환
  - 문피아 포맷터 (`src/lib/export/munpia-formatter.ts`)
    - 순수 텍스트, 들여쓰기, 대사 따옴표 스타일, 에피소드 합본
  - 내보내기 API (`/api/projects/[projectId]/export`)
  - 에피소드 다중 선택, 복사/다운로드 기능

- [x] **퀄리티 검증 시스템** (`/projects/[id]/quality`)
  - 상업성 검증기 (`src/core/engine/commercial-validator.ts`)
  - 검증 API (`/api/ai/validate-quality`)
  - 검증 항목:
    - 분량 (4,000~6,000자) - 20%
    - 절단신공 (위기/발견/반전/선언) - 25%
    - Show Don't Tell (감정 직접 서술 감지) - 20%
    - 대사 비율 (70/30 법칙) - 10%
    - 문장 리듬 (단짠단짠) - 10%
    - 금기어 (현대 외래어) - 15%
  - 1화 특화 검증 (강렬한 시작, 주인공 소개, 세계관 힌트, 떡밥)
  - 개선 제안 및 경고 자동 생성

- [x] **Studio UI/UX 개편** - IDE/Cockpit 스타일
  - **Persistent Sidebar** (`src/app/(studio)/projects/[projectId]/layout.tsx`)
    - 좌측 고정 네비게이션 (접기/펴기 지원)
    - 대시보드, 에피소드, 세계관, 캐릭터, 타임라인, Writing Memory, 퀄리티 검증, 내보내기
    - Memory Pipeline 상태 표시
  - **에피소드 에디터 멀티패널**
    - 컨텍스트 / AI 생성 / 퀄리티 3탭 구성
    - 빠른 퀄리티 검증 (100자 이상 즉시 검증)
    - 실시간 글자 수/대사 비율 표시
  - **Quality Validation 400 버그 수정**
    - 빈 콘텐츠 체크 (프론트엔드 + 백엔드)
    - 상세 에러 메시지 표시

### 2026-03-05 구현 완료

- [x] **Legacy JSON Import 시스템** (`/api/projects/import-create`, `/api/projects/[projectId]/import-legacy`)
  - 프로젝트 생성 시 JSON 불러오기 통합 (2탭 모달)
  - Narrative Simulator JSON 데이터 파싱 및 DB 매핑
  - World Bible, Characters, Story Hooks 일괄 삽입
  - 실패 시 롤백 처리

- [x] **World Bible JSON 파싱 버그 수정**
  - VARCHAR 길이 제한 적용 (world_name: 200, time_period: 100, power_system_name: 100)
  - JSONB/TEXT[] 배열 필드 기본값 보장
  - cities, landmarks, factions 배열 텍스트 변환
  - World Bible 페이지 에러 핸들링 강화 (404 → 빈 폼 표시)
  - POST 핸들러 추가 (새 World Bible 생성 지원)

- [x] **캐릭터 상세 데이터 매핑 수정**
  - age (number → "22세" 변환)
  - origin, faction, coreNarrative → backstory 통합
  - abilities, strengths → goals/personality 통합
  - ultimateGoal, surfaceGoal, motivation → goals 통합
  - fatalWeakness, anxietyConditions 추출

- [x] **Story Hooks 상세 파싱**
  - surface (표면적 미스터리) 추출
  - truth (진실/핵심 미스터리) 추출
  - hints[] → foreshadowing으로 저장
  - middleTwists[] → setup으로 저장
  - revealTiming 추출

- [x] **프롬프트 주입기 v6.0** (`src/core/engine/prompt-injector.ts`)
  - 🚨 **환각 차단 헌법 (ANTI-HALLUCINATION CONSTITUTION)**
    - 임의 인물 창조 금지 (사형, 동문, 스승의 다른 제자 등)
    - 임의 문파/세력 창조 금지
    - 빌런 정체 조기 노출 금지 (삼류 악당식 고백 차단)
  - 🔒 **절대 설정 앵커링**
    - 주인공 핵심 설정 앵커 (배경/출신 위반 방지)
    - 빌런 정체 보호 앵커 (선량한 척 연기 강제)
    - 궁극의 떡밥 보호 (중요도 9+ 조기 노출 금지)
  - 📊 **컨텍스트 로딩 검증**
    - World Bible/Character 로드 상태 로깅
    - 경고 메시지로 누락 데이터 추적
  - ✅ **최종 점검 체크리스트** (유저 프롬프트 말미)

### 2026-03-06 구현 완료

- [x] **동적 캐릭터 관리 시스템**
  - 캐릭터 자동 추출기 (`src/core/memory/character-extractor.ts`)
    - 에피소드 채택 시 AI가 새 인물 자동 감지
    - 이름, 외형, 소속, 행동, 관계성 추출
    - Fallback 규칙 기반 추출 (AI 실패 시)
  - 캐릭터 티어 시스템
    - Tier 1: 서브 주인공 (메인 플롯 깊이 개입)
    - Tier 2: 주요 조연 (서브플롯 담당)
    - Tier 3: 엑스트라 (배경 인물)
  - 티어 기반 프롬프트 주입 (`buildTierBasedCharacterEmphasis`)
  - 캐릭터 API (`/api/ai/extract-characters`, `/api/.../upgrade`)
  - 캐릭터 UI 업데이트 (티어 뱃지, 자동 추출 표시, 등급 업그레이드)

- [x] **매크로 스토리 타임라인(연표) 시스템**
  - DB 마이그레이션 (`00005_timeline_events.sql`)
    - `timeline_events` 테이블 (아크, 충돌, 마일스톤 등)
    - `get_active_timeline_events()` RPC 함수
  - Timeline Events API
    - `GET/POST /api/projects/[projectId]/timeline-events`
    - `GET/PATCH/DELETE /api/projects/[projectId]/timeline-events/[eventId]`
  - 슬라이딩 윈도우 빌더 연동
    - `includeTimelineEvents` 옵션
    - 타임라인 이벤트 자동 로드
  - 프롬프트 주입기 강화 (`buildMainPlotDirective`)
    - 현재 아크 위치 표시 (arcName, position, progressPercentage)
    - 목표/제약/복선 지시문 생성
    - 거시적 흐름 이탈 방지 규칙
  - 연표 관리 UI (`/projects/[id]/timeline` → 연표 관리 탭)
    - 이벤트 목록 시각화 (에피소드 범위별 정렬)
    - 이벤트 CRUD 모달
    - 타입별 색상 구분 (arc=파랑, conflict=주황, climax=빨강)

---

## 상업적 집필 규칙 (v6.0 - 환각 차단 헌법 추가)

### 환각 차단 헌법 (ANTI-HALLUCINATION LAW)

```
╔═══════════════════════════════════════════════════════════════════════════════╗
║  🚨🚨🚨 [절대 위반 불가] 환각 차단 헌법 🚨🚨🚨                                  ║
╠═══════════════════════════════════════════════════════════════════════════════╣
║  ❌ 1. 임의 인물 창조 금지                                                     ║
║     - 제공된 【등장인물 데이터베이스】에 없는 인물을 절대 창조하지 마라         ║
║     - "사형", "동문", "옛 친구" 등 존재하지 않는 관계 날조 금지                ║
║                                                                               ║
║  ❌ 2. 임의 문파/세력 창조 금지                                                ║
║     - 제공된 【세계관 설정】에 없는 문파, 조직, 세력을 만들지 마라            ║
║     - "1인 전승"이면 동문은 존재하지 않는다                                    ║
║                                                                               ║
║  ❌ 3. 궁극의 떡밥 조기 붕괴 금지                                              ║
║     - 빌런이 "내가 죽였다" 같은 직접 고백은 삼류 전개로 금지                   ║
║     - 빌런은 표면적으로 선량하고 정의로운 인물인 척 연기해야 함               ║
║                                                                               ║
║  ❌ 4. 설정 위반 시 작성 중단                                                  ║
║     - 캐릭터의 소속, 관계, 배경 설정을 위반하면 에피소드 작성 중단            ║
╚═══════════════════════════════════════════════════════════════════════════════╝
```

---

## 전체 페이지 구조

| 경로 | 설명 |
|------|------|
| `/projects` | 프로젝트 목록 |
| `/projects/[id]` | 프로젝트 대시보드 |
| `/projects/[id]/world-bible` | 세계관 설정 |
| `/projects/[id]/characters` | 캐릭터 관리 |
| `/projects/[id]/episodes` | 에피소드 목록 |
| `/projects/[id]/episodes/[episodeId]` | 에피소드 에디터 |
| `/projects/[id]/timeline` | 스토리 타임라인 |
| `/projects/[id]/writing-memory` | Writing Memory 관리 |
| `/projects/[id]/export` | 플랫폼 내보내기 |
| `/projects/[id]/quality` | 퀄리티 검증 |
| `/test` | AI 스트리밍 테스트 |

---

## 참고 사항

- **한글 경로 이슈**: Next.js 16 Turbopack이 한글 경로에서 버그 발생. 영문 경로 사용 권장.
- **타입 오류**: 현재 타입 오류는 Supabase 연동 후 `supabase gen types` 실행 시 해결됨.

---

## 배포 정보

### Vercel 배포 완료 (2026-03-05)

- **Production URL**: https://webnovel-studio.vercel.app
- **GitHub Repository**: https://github.com/hun3349-byte/webnovel-studio

### 환경 변수 (Vercel Settings)

```
NEXT_PUBLIC_SUPABASE_URL=https://bllgudzcmfzrdjusdnrv.supabase.co
NEXT_PUBLIC_SUPABASE_ANON_KEY=eyJ... (anon key)
SUPABASE_SERVICE_ROLE_KEY=eyJ... (service role key)
ANTHROPIC_API_KEY=sk-ant-...
```

### 배포 상태

| URL | 상태 | 설명 |
|-----|------|------|
| `/` | ✅ | 메인 페이지 |
| `/test` | ✅ | Claude API 스트리밍 테스트 |
| `/projects` | ✅ | 프로젝트 목록 |
| `/projects/[id]` | ✅ | 프로젝트 대시보드 (사이드바 포함) |
| `/api/projects` | ✅ | API 정상 응답 |

---

## 명령어

```bash
# 개발 서버
npm run dev

# 빌드 (Webpack 모드)
npm run build

# Supabase 타입 생성
npx supabase gen types typescript --local > src/types/database.ts

# 마이그레이션 실행
npx supabase db push

# GitHub 푸시
git add . && git commit -m "message" && git push origin main
```
