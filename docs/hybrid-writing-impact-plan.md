# 영향도 분석 및 구현 계획

## 목표

기존 `Claude Scene Plan -> Prose` 경로를 유지하면서, 아래 3단계 하이브리드 집필 아키텍처를 공존시킨다.

1. GPT planner
   - opening hook
   - scene plan
   - micro-conflict
   - ending hook
   - dialogue punch
2. Claude prose writer
   - 4,000~6,000자 본문 생성
   - 기존 continuity / synopsis / style DNA / validator 재사용
3. GPT optional punch-up
   - opening / ending / dialogue만 국소 보강

## 현재 구조 분석

### 유지 가능한 자산

- `src/core/memory/sliding-window-builder.ts`
  - 세계관, 최근 로그, 캐릭터 상태, unresolved hooks, writing preferences, timeline events, story bible 시놉시스를 이미 한 번에 조립한다.
  - planner와 prose writer가 공통으로 재사용하기 좋다.
- `src/core/engine/prompt-injector.ts`
  - 현재 Claude 중심 프롬프트 생성기다.
  - 직접 수정 리스크가 커서, 새 하이브리드 레이어는 이 파일을 감싸는 방식으로 설계하는 편이 안전하다.
- `src/core/engine/prompt-augmentation.ts`
  - Writing Memory, 네이버 연재형 문단 규칙, 1화 전용 지시문을 후처리 레이어로 주입한다.
- `src/core/style/style-dna-manager.ts`
  - 병합된 Style DNA를 읽을 수 있다.
- `src/core/engine/commercial-validator.ts`
  - 모델과 무관하게 최종 본문 검증에 재사용 가능하다.
- `src/app/api/ai/generate-episode/route.ts`
  - 실서비스 생성 경로다.
- `src/app/api/ai/test-generate/route.ts`
  - 실험용 생성 경로다.
- `src/lib/ai/claude-client.ts`
  - SSE 스트리밍과 completion 호출이 이미 정리돼 있다.

### 현재 구조의 한계

- 생성 책임이 라우트에 많이 몰려 있다.
- planner / prose / punch-up 단계가 분리되어 있지 않다.
- intermediate artifact를 저장할 trace 레이어가 없다.
- 모델 선택 로직이 없다.
- test 경로는 mock 여부만 나누고, 아키텍처 비교를 위한 UI/메타데이터가 없다.

## 변경 영향도

### 1. API

- `generate-episode`
  - 기존 legacy Claude 경로 유지
  - `generationMode` 기반 하이브리드 경로 추가
- `test-generate`
  - `generationMode` 지원
  - `compareModes` 지원
  - 비교용 메타데이터 반환

### 2. 프롬프트 계층

- planner / prose / punch-up 프롬프트 빌더를 분리
- 기존 `prompt-injector.ts`는 legacy prose base builder로 계속 활용
- 새 프롬프트 빌더는 `prompt-injector.ts`를 감싸거나 추가 지시를 얹는 식으로 구성

### 3. 오케스트레이션 계층

- `model-router`
  - 요청 모드, 환경변수, fallback 규칙을 바탕으로 실제 사용 모드 결정
- `writing-orchestrator`
  - legacy Claude
  - hybrid GPT planner + Claude prose
  - hybrid + GPT punch-up
  - 세 경로를 하나의 인터페이스로 통합

### 4. DB

- `episode_generation_traces` 테이블 추가
  - planner / prose / punch-up 단계별 trace 저장
  - intermediate output은 UI에 노출하지 않고 내부 보관
- `projects.generation_mode`
  - 프로젝트 기본 집필 모드 저장
- `projects.generation_config`
  - planner/punch-up on/off, 비교 실험 플래그 등 저장

### 5. UI

- 에피소드 집필 패널에 generation mode 선택 추가
- test/comparison 메타데이터 패널 추가
- intermediate output 본문 노출은 금지
- 사용자는 최종 본문과 trace 요약만 본다

## 제안 아키텍처

## 1. 라우트 계층

- route는 인증, 요청 파싱, SSE 생성, 저장/검증/응답만 담당
- 실제 집필 순서는 orchestrator에 위임

## 2. model-router

- 입력
  - requested mode
  - `OPENAI_API_KEY` 유무
  - `ANTHROPIC_API_KEY` 유무
  - feature flag
- 출력
  - resolved mode
  - planner/prose/punch-up 모델명
  - fallback 여부 및 사유

## 3. writing-orchestrator

- 공통 입력
  - projectId
  - targetEpisodeNumber
  - userInstruction
  - sliding window context
  - generation mode
- 처리
  1. route mode 결정
  2. planner 실행 여부 결정
  3. prose prompt 생성 및 Claude SSE 스트리밍
  4. optional punch-up 수행
  5. trace 저장
  6. 최종 본문과 메타데이터 반환

## 4. trace 정책

- planner 원문
- planner parsed JSON
- prose prompt 메타
- prose raw output
- optional punch-up input/output
- routing decision
- validation summary

위 정보는 DB에 저장하되, 기본 UI에는 stage summary와 사용 모델 정도만 노출한다.

## 구현 순서

### Phase 1

- generation type 정의
- `model-router` 추가
- `writing-orchestrator` 골격 추가
- DB migration 초안 작성

### Phase 2

- GPT planner prompt builder
- Claude prose prompt builder
- GPT punch-up prompt builder
- OpenAI client 추가

### Phase 3

- `generate-episode` 하이브리드 연결
- trace 저장 연결
- validator/continuity 유지 검증

### Phase 4

- `test-generate` 비교 메타데이터 추가
- 에피소드 에디터에 mode selector / comparison UI 추가

## 파일별 수정안

### 신규 파일

- `src/types/generation.ts`
  - generation mode, routing, trace 타입
- `src/lib/ai/openai-client.ts`
  - GPT planner / punch-up 호출 클라이언트
- `src/core/engine/model-router.ts`
  - 모드 결정 및 fallback
- `src/core/engine/writing-orchestrator.ts`
  - 단계별 실행 흐름 통합
- `src/core/engine/generation-trace-store.ts`
  - trace DB 저장
- `src/core/engine/prompts/gpt-planner.ts`
  - planner prompt builder
- `src/core/engine/prompts/claude-prose.ts`
  - prose prompt builder
- `src/core/engine/prompts/gpt-punchup.ts`
  - punch-up prompt builder
- `supabase/migrations/00010_hybrid_generation.sql`
  - trace 및 generation mode 컬럼

### 수정 파일

- `src/types/memory.ts`
  - 요청 타입에 `generationMode`, `compareModes` 추가
- `src/types/database.ts`
  - migration 반영 타입 추가
- `src/app/api/ai/generate-episode/route.ts`
  - orchestrator 연결
  - metadata 확장
- `src/app/api/ai/test-generate/route.ts`
  - test mode / compare summary 지원
- `src/app/(studio)/projects/[projectId]/episodes/[episodeId]/page.tsx`
  - generation mode selector
  - comparison summary UI

## 리스크와 대응

### prompt-injector 인코딩 리스크

- 직접 대수술하지 않는다.
- 새 프롬프트 계층에서 wrapping 방식으로 확장한다.

### 하이브리드 호출 실패

- router에서 legacy Claude fallback 허용
- fallback 여부를 trace에 남긴다

### intermediate output 노출 위험

- planner / punch-up 원문은 metadata로 보내지 않는다
- UI에는 mode, stage status, trace id, 적용 여부만 보낸다

### 품질 역전 위험

- validator는 최종 본문에 동일하게 적용
- test route에서 legacy vs hybrid 비교 요약을 제공해 실험 가능하게 한다

## PR 분할 권장안

1. schema + types + router
2. prompt builders + OpenAI client
3. orchestrator + generate route 연결
4. test route + UI comparison
