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

- [x] **프롬프트 주입기 v7.0** (`src/core/engine/prompt-injector.ts`)
  - 📜 **3대 절대 규칙 (STORY PLAUSIBILITY CONSTITUTION)** 신규 추가
    - 제1조: 정보 전달의 법칙 (엑스트라 '설명충' 화법 금지)
      - 상인/행인이 핵심 기밀 술술 설명하는 작위적 전개 차단
      - 정보는 탐색전/관찰/문서발견/엿듣기 등 개연성 있는 방식으로만
    - 제2조: 공간과 배경의 물리적 연속성 유지
      - 장면 도중 배경 환각 방지 (목조전각→동굴 갑자기 바뀌기 금지)
      - 날씨/시간대/인물위치/환경상태 연속성 강제
    - 제3조: 캐릭터 본질(페르소나) 상시 유지
      - 메인 캐릭터 무미건조 묘사 금지
      - 평범한 연기 중에도 본질적 성향 암시 (미세한 표정/동작/독백)
  - 🚨 최종 점검 체크리스트 강화
    - 이어쓰기/연속성 카테고리 추가
    - 정보 전달의 개연성 카테고리 추가
    - 캐릭터 매력 포인트 유지 체크 추가

### 2026-03-09 구현 완료

- [x] **프롬프트 주입기 v8.0 → v8.1** (`src/core/engine/prompt-injector.ts`)
  - 📚 **호흡 조절 3원칙 (LONG SERIAL PACING CONSTITUTION)** 신규 추가
    - 100화 이상 장기 연재를 위한 Slow-burn 규칙
    - 제1원칙: 양파 껍질의 법칙 (사건과 정보의 파편화)
      - 거대한 비밀을 한 에피소드에서 통째로 밝히기 금지
      - 단서의 파편만 던지고 독자/주인공이 추리하게 유도
    - 제2원칙: 미시적 갈등과 빌드업에 집중 (Micro-Conflicts)
      - 초반 보스급 적 등장/거대 세력 전면전 금지
      - 정보 수집/함정 대응/조력자 포섭/신경전 등 중간 과정 밀도있게 묘사
    - 제3원칙: 긴장과 이완의 템포 조절
      - 매 화 극강 액션만 반복 금지 (독자 피로 방지)
      - 전투 후 이완 구간 필수 배치 (일상 씬, 세계관 묘사, 관계 심화)
  - ✍️ **문체 및 호흡 통제 헌법 (PROSE STYLE CONSTITUTION)** v8.1 신규 추가
    - 제1조: 스타카토 문체 남발 엄격 금지
      - "움직였다. 피했다. 빨랐다." 식 분량 늘리기 꼼수 금지
      - 극단적으로 짧은 단문 연속 나열 금지
    - 제2조: 호흡이 길고 밀도 높은 문장 작성
      - 두세 개의 행동/감각을 수려하게 연결
      - 문장과 문장 사이 연결을 부드럽고 가독성 있게
    - 제3조: 하드보일드 톤 유지 + 부드러운 연결
      - 감정 배제한 건조하고 차가운 톤 유지
      - 건조함 ≠ 끊김, 서술은 물 흐르듯 이어져야 함

### 2026-03-10 구현 완료

- [x] **프롬프트 주입기 v8.2 → v8.3** (`src/core/engine/prompt-injector.ts`)
  - ✍️ **문체 통제 강화** (PROSE STYLE CONSTITUTION v8.2)
    - 최소 2~3개의 행동/감각/배경 묘사를 하나의 문장에 연결 필수
    - 수려한 수식어와 자연스러운 접속사 활용 명시
    - 복문 구조 활용 권장 (~하고, ~하며, ~하자)
    - 나쁜 예/좋은 예 추가 ("검을 뽑았다. 달려들었다. 베었다." 금지)
  - 🏛️ **공간/시간 이동 원칙 강화** (STORY PLAUSIBILITY v8.2)
    - 시간/장소 이동 시 '물리적 관찰을 통한 추론 과정' 삽입 필수
    - 회귀/시간여행 시 복장, 언어, 시대상, 날씨, 냄새, 풍경 관찰 묘사
    - 순간이동식 서술 금지 ("눈을 떴다. 100년 전이었다." 금지)
    - 나쁜 예/좋은 예 추가
  - ⚔️ **무공 묘사 통제 헌법 (MARTIAL ARTS REALISM CONSTITUTION)** 신규 추가
    - 제1조: 판타지 무공 용어 전면 금지
      - 검기, 검강, 단전의 불꽃, 진기, 장풍, 권강 등 사용 금지
      - 오색찬란한 빛, 기운 발사 등 초능력 묘사 금지
    - 제2조: 현실적/해부학적 전투 묘사 의무
      - 인체 해부학 기반 (관절, 급소, 호흡, 근육)
      - 물리 법칙 기반 (지렛대, 체중 이동, 관성, 각도)
      - 치명적 최단 거리 타격 (효율성 > 화려함)
    - 제3조: 긴장감은 기술이 아닌 상황으로 생성
      - 수적 열세, 지형 불리, 부상 핸디캡 등 활용
      - 파워 인플레이션/데우스 엑스 마키나 금지
  - 📋 **최종 점검 체크리스트 확장**
    - 문체/호흡 카테고리 추가 (스타카토 금지, 밀도 높은 문장)
    - 무공/전투 묘사 카테고리 추가 (판타지 요소 배제, 해부학적 전투)
    - 시간/장소 이동 시 물리적 관찰 과정 체크 추가
  - 🎭 **v8.3 거장 페르소나 및 4대 절대 규칙 강화**
    - 페르소나: "삼류 양산형 작가가 아닌 정통 대하 역사/무협 스릴러 거장"
    - 이어쓰기 헌법: "직전 회차 마지막 3개 문단(엔딩 씬) 완벽 숙지" 명시
    - 감정선/시간대/물리적 위치 1초 오차 없이 이어받기 강조
    - Show Don't Tell: 상황 인식 시 "관찰→추론 과정" 묘사 필수
      - "그는 100년 전으로 돌아왔음을 알았다" 직접 서술 금지
      - 옷차림/연호/억양/건물 형태 관찰 → 이성적 추론 과정 묘사
    - 무공 묘사: "관절의 비명, 심장 박동, 혈관의 팽창, 아드레날린 분출" 추가

- [x] **채택 완료 원고 사후 수정 기능 (Unlock Editor)**
  - 발행(published) 상태의 에피소드에 [🔓 수정하기] 버튼 추가
  - 잠금해제 시 isUnlocked 상태로 전환, 텍스트 편집 가능
  - 수정 후 [재발행] 버튼으로 재채택 가능
  - 에디터 UI: 수정 중 상태 표시 (노란색 "수정 중" 뱃지)

- [x] **AI 부분 수정 기능 (Partial Edit / Rewrite)**
  - 텍스트 드래그(선택) 시 선택된 텍스트 표시 (보라색 바)
  - [✨ AI 부분 수정] 버튼 표시
  - 부분 수정 모달: 선택 텍스트 확인 + 수정 지시사항 입력
  - API: `/api/ai/partial-rewrite`
    - 앞뒤 문맥 500자씩 전달
    - 스타카토 금지, Show Don't Tell, 판타지 배제 규칙 적용
    - 선택 영역만 AI로 재생성하여 교체

- [x] **글로벌 타임라인 (Story Bible) 주입 시스템**
  - DB 마이그레이션 (`supabase/migrations/00006_episode_synopses.sql`)
    - `episode_synopses` 테이블
    - 에피소드별 시놉시스, 목표, 핵심 사건, 복선, 등장인물 등 저장
    - `get_synopsis_context()` RPC 함수
  - API:
    - `GET/POST /api/projects/[projectId]/story-bible` - 목록 조회/생성
    - `PUT /api/projects/[projectId]/story-bible` - 일괄 Upsert
    - `GET/PATCH/DELETE /api/projects/[projectId]/story-bible/[episodeNumber]` - 개별 CRUD
  - UI: `/projects/[id]/story-bible` 페이지
    - 리스트/타임라인 2가지 뷰 모드
    - 아크별 필터링
    - 시놉시스 CRUD 모달 (목표, 복선, 회수할 복선 등)
  - 슬라이딩 윈도우 빌더 연동 (`includeSynopses` 옵션)
    - 현재 회차 기준 앞 3화/뒤 5화 시놉시스 로드
  - 프롬프트 주입기 연동 (`serializeContextToPrompt`)
    - 【스토리 바이블】 섹션 추가
    - 현재 에피소드 시놉시스 핵심 지시 (목표, 핵심 사건, 복선 등)
    - 이전/이후 에피소드 방향 참고용 표시
  - 사이드바에 📚 스토리 바이블 링크 추가

- [x] **프롬프트 주입기 v8.4** (`src/core/engine/prompt-injector.ts`)
  - ✨ **Positive Prompting & Few-Shot 헌법 (POSITIVE PROMPTING CONSTITUTION)** 신규 추가
    - LLM의 부정어 집착 문제 해결 (부정형 → 긍정형 전환)
    - 각 규칙에 구체적인 Few-Shot 모범 예시 제공
    - 제1조: 감정은 신체 반응으로 보여줘라 (분노/긴장/두려움/슬픔 예시)
    - 제2조: 문장은 호흡이 길고 밀도 있게 작성해라 (액션/감각/심리 예시)
    - 제3조: 캐릭터는 DB 설정 그대로만 사용해라 (엑스트라 활용법 예시)
    - 제4조: 전투는 물리학과 해부학에 기반해 묘사해라 (검술/맨손/급소 예시)
    - 제5조: 주인공의 대사는 능구렁이처럼 유들유들하게 (시비/추궁/위협 상황 예시)
    - 제6조: 시간/장소 이동은 관찰과 추론 과정으로 묘사해라 (회귀/장소이동 예시)
  - 🧠 **Hidden Chain of Thought 헌법 (HIDDEN COT CONSTITUTION)** 신규 추가
    - AI가 본문 작성 전 자체 검증 수행 (<logic_check> 블록)
    - 이어쓰기 검증, 캐릭터 검증, 플롯 검증, 설정 검증
    - 시스템에서 자동 파싱 후 사용자에게는 숨김 처리
    - `parseAndRemoveLogicCheck()` 함수: logic_check 블록 파싱 및 제거
  - 📊 **캐릭터 상태 추적 시스템 (Character Status Tracker)** 신규 추가
    - `CharacterStatusTracker` 인터페이스: 부상, 소지품, 위치, 관계 등 포괄 추적
    - `updateCharacterStatusFromLog()` 함수: 로그 압축 결과에서 상태 변화 자동 추출
    - `serializeCharacterStatusForPrompt()` 함수: 프롬프트에 상태 주입

- [x] **다이내믹 컨텍스트 최적화** (`src/core/memory/sliding-window-builder.ts`)
  - `DynamicContextSummary` 인터페이스: 압축 컨텍스트 구조
  - `buildDynamicContext()` 함수: 토큰 절감을 위한 3요소 압축
    - ① 전체 시놉시스 3줄 요약
    - ② 직전 1~2화 엔딩 (마지막 500자)
    - ③ 핵심 캐릭터 상태 (주인공/빌런/조연 최소 정보)
  - `serializeDynamicContext()` 함수: 압축 컨텍스트 직렬화
  - 토큰 절감 효과 추정 로깅

- [x] **Hidden CoT 통합** (`/api/ai/generate-episode`)
  - 에피소드 생성 후 `<logic_check>` 블록 자동 파싱
  - 사용자에게 보여주는 콘텐츠에서 제거
  - DB 저장 시 정제된 버전 사용
  - 메타데이터에 로직 체크 결과 포함

- [x] **Story Bible API 버그 수정** (`/api/projects/[projectId]/story-bible`)
  - `episode_number: 0` → `episode_number: 1` 수정 (validation 에러 방지)
  - PUT API에 `episode_number < 1` 검증 추가
  - GET API `projectId` 파라미터 검증 강화
  - 테이블 미존재 시 빈 배열 반환 (500 에러 대신)
  - 상세 에러 로깅 추가 (code, details, hint)
  - content-type 체크 추가 (JSON 파싱 전)

- [x] **Timeline Events API 버그 수정** (`/api/projects/[projectId]/timeline-events`)
  - 인증 의존성 제거 (Service Role 클라이언트 사용)
  - `projectId` 파라미터 검증 강화
  - RPC 함수 미존재 시 빈 배열 반환
  - 상세 에러 로깅 추가

- [x] **DB 권한 마이그레이션** (`supabase/migrations/00007_fix_episode_synopses_permissions.sql`)
  - `episode_synopses` 테이블 RLS 정책 수정
    - `USING (true)` → 개별 정책 분리 (SELECT/INSERT/UPDATE/DELETE)
    - `WITH CHECK (true)` 추가 (INSERT/UPDATE 허용)
  - `timeline_events` 테이블 동일 적용
  - `GRANT ALL` 권한 부여 (anon, authenticated, service_role)
  - RPC 함수 실행 권한 부여

- [x] **Vercel 스트리밍 타임아웃 해결**
  - `partial-rewrite` API에 Edge Runtime 설정 추가
    - `export const runtime = 'edge'`
    - `export const maxDuration = 60`
  - 기존 설정 확인 완료: `generate-episode`, `test-generate`

- [x] **프론트엔드 Hidden CoT 실시간 필터링** (`src/app/(studio)/projects/[projectId]/episodes/[episodeId]/page.tsx`)
  - `filterLogicCheckFromStream()` 함수 추가
    - 완전한 `<logic_check>...</logic_check>` 블록 제거
    - 스트리밍 중 미완료 블록 숨김 처리
    - 부분 태그 처리 (`<logic_c`, `<logi`, etc.)
  - 스트리밍 핸들러 수정
    - `text` 청크 수신 시 즉시 필터링
    - `complete` 메시지 수신 시 최종 필터링

- [x] **캐릭터 상태 자동 갱신 강화** (`/api/ai/compress-log`)
  - `CharacterStatusTracker` 연동
  - 감정 상태, 부상, 위치, 소지품 포괄 업데이트
  - 변경 로그를 `character_memories` 테이블에 기록
  - 에피소드별 상태 변화 자동 추적

- [x] **v8.4 프론트엔드 컴포넌트** (`src/components/editor/`)
  - **CharacterStatusBoard** (`CharacterStatusBoard.tsx`)
    - 캐릭터 상태 실시간 표시 (역할별 정렬, 감정/위치/부상/소지품)
    - 인라인 편집 기능 (위치, 감정 상태, 부상, 소지품)
    - 컴팩트/풀 2가지 뷰 모드
    - 캐릭터 티어 뱃지 표시
    - API 연동: `PATCH /api/projects/[projectId]/characters/[characterId]`
  - **StoryBiblePanel** (`StoryBiblePanel.tsx`)
    - 시놉시스/타임라인/컨텍스트 3탭 구성
    - 현재 에피소드 시놉시스 입력/편집 (목표, 핵심 이벤트, 장소, 시간대, 메모)
    - 타임라인 이벤트 표시 (현재 에피소드 범위)
    - Dynamic Context 구성 상태 표시
    - 자동 저장 및 변경 감지
  - **FloatingEditTooltip** (`FloatingEditTooltip.tsx`)
    - 텍스트 선택 시 플로팅 팝업 표시
    - 빠른 수정 옵션: 긴장감+, 묘사 강화, 문장 다듬기, 대사 개선
    - 커스텀 지시사항 입력 모드
    - 로딩 상태 및 에러 핸들링
    - CSS 애니메이션 (`animate-fadeIn`)
  - **에피소드 에디터 통합** (`page.tsx`)
    - 우측 패널에 시놉시스 탭 추가 (4탭 구성: 컨텍스트/시놉시스/AI 생성/퀄리티)
    - 컨텍스트 패널 내 CharacterStatusBoard 컴팩트 모드 통합
    - FloatingEditTooltip 통합 (기존 모달과 병행)
    - 캐릭터 상태 업데이트 콜백

### 2026-03-12 구현 완료

- [x] **프롬프트 주입기 v8.6** (`src/core/engine/prompt-injector.ts`)
  - 🎯 **Show, Don't Tell 극강화** (시스템 프롬프트 최상단 하드코딩)
    - "너는 대한민국 최고의 상업 웹소설 작가다" 페르소나 명시
    - 구구절절 설명(Tell) 금지 → 대화/행동/감각 묘사로 보여주기(Show) 강제
    - 철학적 독백 배제, 속도감 있는 전개 집중

- [x] **Claude API 파라미터 최적화** (`src/lib/ai/claude-client.ts`)
  - temperature: 0.8 → 0.82로 상향 (문장의 다양성과 자연스러움 향상)
  - 권장 범위: 0.75~0.85
  - 참고: Claude API는 `frequency_penalty` 미지원 (OpenAI 전용)

- [x] **에디터 UI 가독성 CSS 최적화** (`src/app/globals.css`, `page.tsx`)
  - `line-height: 1.8` (줄간격 확보)
  - `letter-spacing: -0.03em` (자간 최적화)
  - `word-break: keep-all` (단어 단위 줄바꿈)
  - `.webnovel-content p { margin-bottom: 1.5rem }` (문단 간격)
  - 에디터 textarea에 `webnovel-editor` 클래스 적용

- [x] **프롬프트 주입기 v8.5** (`src/core/engine/prompt-injector.ts`)
  - 📱 **웹소설 가독성 포매팅 헌법 (READABILITY FORMATTING CONSTITUTION)** 신규 추가
    - 모바일 환경 최적화, '벽돌(Block of text)' 현상 방지
    - 제1조: 문단 길이 제한 (최대 2~3문장, 빈 줄 필수)
    - 제2조: 대사(Dialogue) 독립의 원칙 (앞뒤 빈 줄 삽입)
    - 제3조: 시점/장면 전환 시 구분선 강제 (빈 줄 3개 또는 ***)
    - 제4조: 하이라이트 문장 띄우기 (핵심 문장 단독 배치)
  - 최종 점검 체크리스트 확장 (【가독성/포매팅】 카테고리 추가)
  - 시스템 프롬프트 조립 순서 업데이트

---

## 상업적 집필 규칙 (v8.6 - Show Don't Tell 극강화)

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

### 3대 절대 규칙 (STORY PLAUSIBILITY LAW) - v7.0 신규

```
╔═══════════════════════════════════════════════════════════════════════════════╗
║  📜📜📜 [전역 시스템 헌법] 3대 절대 규칙 📜📜📜                                 ║
╠═══════════════════════════════════════════════════════════════════════════════╣
║                                                                               ║
║  📖 제1조. 정보 전달의 법칙 (엑스트라의 '설명충' 화법 절대 금지)               ║
║     ❌ 상인/행인/엑스트라가 핵심 기밀이나 흑막 정체를 술술 설명 금지           ║
║     ✅ 정보는 탐색전/관찰/문서발견/엿듣기 등 개연성 있는 방식으로만 드러내라   ║
║                                                                               ║
║  🏛️ 제2조. 공간과 배경의 물리적 연속성 유지                                   ║
║     ❌ 씬 도중 명시적 이동 없이 배경 형태 바꾸기 금지 (환각 현상)              ║
║     ✅ 날씨, 시간대, 인물 위치, 환경 상태를 일관되게 유지하라                  ║
║                                                                               ║
║  🎭 제3조. 캐릭터 본질(페르소나)의 상시 유지                                   ║
║     ❌ 메인 캐릭터가 무미건조한 일반인처럼 묘사되는 것 금지                    ║
║     ✅ 평범한 연기 중에도 본질적 성향을 미세한 동작/표정/독백으로 암시하라     ║
║                                                                               ║
╚═══════════════════════════════════════════════════════════════════════════════╝
```

### 호흡 조절 3원칙 (LONG SERIAL PACING LAW) - v8.0 신규

```
╔═══════════════════════════════════════════════════════════════════════════════╗
║  📚📚📚 [전역 시스템 헌법] 100화 장기 연재용 호흡 조절 3원칙 📚📚📚            ║
╠═══════════════════════════════════════════════════════════════════════════════╣
║                                                                               ║
║  ⚠️ 너는 단편 소설이 아닌 100화 이상의 장기 연재 웹소설을 집필하는 작가다.    ║
║  ⚠️ 스토리를 성급하게 전개하여 초반에 서사적 자원을 고갈시키는 것을 금지한다.  ║
║                                                                               ║
╠═══════════════════════════════════════════════════════════════════════════════╣
║  🧅 제1원칙. 양파 껍질의 법칙 (사건과 정보의 파편화)                           ║
║     ❌ 한 에피소드 안에서 거대한 비밀을 통째로 밝히지 마라                     ║
║     ✅ '단서의 파편'만 던지고 독자가 추리하게 만들어라                         ║
║        (암살자의 문양, 불태우다 만 서신, 목격자의 불완전한 증언 등)            ║
║                                                                               ║
╠═══════════════════════════════════════════════════════════════════════════════╣
║  ⚔️ 제2원칙. 미시적 갈등과 빌드업에 집중 (Micro-Conflicts)                    ║
║     ❌ 초반부터 보스급 적 등장/거대 세력과 전면전 금지                         ║
║     ✅ 중간 과정을 밀도 있게 묘사 (정보 수집, 함정 대응, 조력자 포섭, 신경전)   ║
║                                                                               ║
╠═══════════════════════════════════════════════════════════════════════════════╣
║  🌅 제3원칙. 긴장과 이완의 템포 조절                                          ║
║     ❌ 매 화 극강의 액션만 반복하면 독자 피로도 증가                           ║
║     ✅ 전투 후 이완 구간 배치 (일상 씬, 세계관 묘사, 관계 심화, 유머)           ║
║        긴장 → 이완 → 긴장의 템포를 유지하라                                   ║
║                                                                               ║
╚═══════════════════════════════════════════════════════════════════════════════╝
```

### 문체 및 호흡 통제 헌법 (PROSE STYLE LAW) - v8.2 강화

```
╔═══════════════════════════════════════════════════════════════════════════════╗
║  ✍️✍️✍️ [전역 시스템 헌법] 문체 및 호흡 통제 (PROSE STYLE LAW) ✍️✍️✍️          ║
╠═══════════════════════════════════════════════════════════════════════════════╣
║                                                                               ║
║  ❌ 제1조. 스타카토 문체 남발 엄격 금지 (단문 썰기 차단)                        ║
║     ❌ "움직였다. 피했다. 빨랐다." 식의 분량 늘리기 꼼수 절대 금지              ║
║     ❌ "검을 뽑았다. 달려들었다. 베었다." 1~3어절 문장 연속 나열 금지           ║
║                                                                               ║
║  ✅ 제2조. 호흡이 길고 밀도 높은 문장 작성 (수려한 연결 필수)                   ║
║     ✅ 최소 2~3개의 행동/감각/배경 묘사를 하나의 문장에 연결하라                ║
║     ✅ 수려한 수식어와 자연스러운 접속사로 문장을 완성하라                      ║
║     ✅ 복문 구조를 활용 (~하고, ~하며, ~하자)                                   ║
║                                                                               ║
║  🎭 제3조. 하드보일드 톤 유지 + 부드러운 연결                                  ║
║     ✅ 감정 배제한 건조하고 차가운 하드보일드 톤 유지                          ║
║     ✅ 건조함 ≠ 끊김. 서술은 물 흐르듯 이어져야 한다                          ║
║                                                                               ║
╚═══════════════════════════════════════════════════════════════════════════════╝
```

### 무공 묘사 통제 헌법 (MARTIAL ARTS REALISM LAW) - v8.2 신규

```
╔═══════════════════════════════════════════════════════════════════════════════╗
║  ⚔️⚔️⚔️ [전역 시스템 헌법] 무공 묘사 통제 (MARTIAL ARTS REALISM LAW) ⚔️⚔️⚔️    ║
╠═══════════════════════════════════════════════════════════════════════════════╣
║                                                                               ║
║  이 소설은 '현실적 무협'이다. 판타지적 초능력 묘사를 전면 금지한다.            ║
║                                                                               ║
╠═══════════════════════════════════════════════════════════════════════════════╣
║  ❌ 제1조. 판타지 무공 용어 전면 금지                                          ║
║     ❌ 검기, 검강, 도기, 장풍, 권강, 기파 등 무형의 기운 발사                   ║
║     ❌ 단전의 불꽃, 내공의 폭발, 진기의 흐름                                   ║
║     ❌ 오색찬란한 빛, 금빛/푸른빛 검기, 번쩍이는 기운                          ║
║     ❌ 경공으로 하늘을 나는 묘사, 내력으로 상처 치유                           ║
║                                                                               ║
╠═══════════════════════════════════════════════════════════════════════════════╣
║  ✅ 제2조. 현실적/해부학적 전투 묘사 의무                                      ║
║     ✅ 인체 해부학: 관절 가동범위, 급소 위치, 호흡-근육 연동                   ║
║     ✅ 물리 법칙: 지렛대 원리, 체중 이동, 관성, 각도/궤적                      ║
║     ✅ 치명적 최단 거리 타격: 효율성 > 화려함, 살인 기술로서의 무술            ║
║                                                                               ║
╠═══════════════════════════════════════════════════════════════════════════════╣
║  🎯 제3조. 긴장감은 '기술'이 아닌 '상황'으로 만들어라                          ║
║     ✅ 수적 열세, 지형 불리, 부상 핸디캡, 시야 제한                            ║
║     ❌ "더 강한 기운을 끌어올렸다" 식 파워 인플레이션 금지                      ║
║     ❌ "숨겨둔 비기를 펼쳤다" 식 데우스 엑스 마키나 금지                        ║
║                                                                               ║
╚═══════════════════════════════════════════════════════════════════════════════╝
```

### 웹소설 가독성 포매팅 헌법 (READABILITY FORMATTING LAW) - v8.5 신규

```
╔═══════════════════════════════════════════════════════════════════════════════╗
║  📱📱📱 [필수 적용] 웹소설 가독성 포매팅 헌법 (READABILITY LAW) 📱📱📱          ║
╠═══════════════════════════════════════════════════════════════════════════════╣
║                                                                               ║
║  ⚠️ 이 소설은 모바일 환경에서 읽힌다. '벽돌(Block of text)' 현상을 방지하라.    ║
║                                                                               ║
╠═══════════════════════════════════════════════════════════════════════════════╣
║  📝 제1조. 문단 길이 제한 (Paragraph Limit)                                    ║
║     ✅ 하나의 문단은 최대 2~3개의 문장으로 구성하라                             ║
║     ✅ 문단이 끝나면 반드시 빈 줄(빈 공간)을 삽입하라                           ║
║     ❌ 4개 이상의 문장을 하나의 문단으로 몰아넣지 마라                          ║
║                                                                               ║
╠═══════════════════════════════════════════════════════════════════════════════╣
║  💬 제2조. 대사(Dialogue) 독립의 원칙                                          ║
║     ✅ 모든 대사(큰따옴표 " ")는 앞뒤로 빈 줄을 삽입하여 시각적으로 독립시켜라  ║
║     ❌ 대사 바로 옆에 긴 지문을 이어 붙이지 마라                                ║
║                                                                               ║
╠═══════════════════════════════════════════════════════════════════════════════╣
║  🔀 제3조. 시점/장면 전환 시 구분선 강제                                        ║
║     ✅ 시간/장소 도약 시 빈 줄 3개 또는 '***' 구분자를 사용하라                 ║
║     ❌ 텍스트만으로 갑작스럽게 장면을 전환하지 마라                             ║
║                                                                               ║
╠═══════════════════════════════════════════════════════════════════════════════╣
║  ⭐ 제4조. 하이라이트 문장 띄우기                                               ║
║     ✅ 핵심 문장(깨달음, 반전)은 짧게 단독으로 배치하여 시각적 임팩트 극대화     ║
║     ✅ 해당 문장 앞뒤로 충분한 빈 줄을 두어라                                   ║
║                                                                               ║
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
| `/projects/[id]/story-bible` | 스토리 바이블 (에피소드별 시놉시스) |
| `/projects/[id]/episodes` | 에피소드 목록 |
| `/projects/[id]/episodes/[episodeId]` | 에피소드 에디터 (채택 후 수정, AI 부분 수정) |
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
