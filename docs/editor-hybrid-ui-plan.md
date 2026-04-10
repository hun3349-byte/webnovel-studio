# 에피소드 에디터 UI 영향도 분석 및 컴포넌트 분리 설계

## 현재 구조 분석

### 상태 흐름

- `src/app/(studio)/projects/[projectId]/episodes/[episodeId]/page.tsx`가 에디터 상태를 대부분 직접 관리한다.
- 주요 상태는 아래와 같다.
  - 본문/제목/저장/채택
  - 우측 패널 탭 전환
  - AI 생성 요청과 SSE 스트리밍
  - 퀄리티 검증
  - 부분 수정
  - 컨텍스트 로딩
- 하이브리드 관련 상태는 현재 최소 수준으로만 붙어 있다.
  - `generationMode`
  - `compareModes`
  - `generationInfo`
  - `comparisonSummary`
  - `traceId`

### 렌더 구조

- 상단 헤더
  - 회차 번호
  - 제목
  - 저장/채택
- 메인 2열 구조
  - 좌측: 본문 텍스트 영역
  - 우측: `context / story-bible / generate / quality` 탭
- 현재 생성 제어는 우측 `generate` 탭 안에만 있다.

### 문제점

- 하이브리드 집필 제어가 우측 패널에 묻혀 있어 “이번 실행 파이프라인”을 명확히 결정하기 어렵다.
- 생성 단계(planner / prose / punch-up / quality)가 실시간으로 보이지 않는다.
- 비교 UI가 메타데이터 수준에 머물러 있고, 판단용 excerpt 비교 구조가 없다.
- 비용/속도/모델/trace가 여러 군데 흩어져 있거나 아직 구조화되지 않았다.
- `page.tsx` 비대화가 계속 진행되고 있어 유지보수성이 떨어진다.

## 설계 원칙

- 기존 Story Bible / Context / Quality 경험은 유지한다.
- legacy mode는 기본 동작을 그대로 유지한다.
- 하이브리드 기능은 “확장”으로 붙인다.
- 내부 intermediate output은 절대 본문에 섞지 않는다.
- 복잡한 제어는 상단 작업대와 우측 파이프라인 탭으로 분산한다.

## 제안 컴포넌트

### 1. `GenerationControlBar`

- 위치: 상단 헤더 아래
- 역할:
  - generation mode 드롭다운
  - planner / punch-up 토글
  - 비교 생성 버튼
  - 예상 비용/모델/속도 요약
  - 현재 단계 표시

### 2. `WritingPipelinePanel`

- 위치: 우측 패널 신규 탭 `pipeline`
- 역할:
  - planner / prose / punch-up / quality 단계 표시
  - 단계별 모델/provider/status/latency/요약
  - trace 요약 리스트

### 3. `GenerationStepCard`

- 역할:
  - 개별 단계 카드
  - status badge
  - provider/model/latency
  - 짧은 summary 표시

### 4. `CompareSummaryCards`

- 역할:
  - A / B / C 버전 카드
  - blind mode 지원
  - validator score / opening score / ending score / latency / cost
  - 선호 버전 선택

### 5. `CompareExcerptViewer`

- 역할:
  - opening excerpt
  - ending excerpt
  - 대표 대사 excerpt
  - 버전별 비교

### 6. `GenerationTraceDrawer`

- 역할:
  - 생성 시각
  - mode
  - trace id
  - fallback
  - 단계별 status / latency

### 7. `CostAndLatencyBadge`

- 역할:
  - 제어 바 / 단계 카드 / 비교 카드 공용 메타 배지

## page.tsx 역할 축소

`page.tsx`는 아래만 유지한다.

- 데이터 fetch
- SSE 이벤트 수신
- 본문/저장/채택/부분수정 이벤트
- 하이브리드 UI용 상위 상태 관리
- 각 컴포넌트에 필요한 props 전달

## 추가 백엔드 연결 포인트

### 1. stage 이벤트

- 생성 중 실시간 단계 표시를 위해 SSE에 `stage` 타입을 추가한다.
- 최소 필드:
  - stage
  - status
  - provider
  - model
  - startedAt
  - completedAt
  - summary

### 2. trace summary 메타데이터

- 기존 `generationInfo` 외에 `pipeline` 요약을 metadata로 전달한다.

### 3. compare route

- excerpt 중심 비교를 위해 실제 비교 결과 JSON을 반환하는 route를 추가한다.
- 각 후보는 전체 본문 대신 summary + excerpts 중심으로 내려준다.

### 4. project defaults

- `/api/projects/[projectId]` 응답에서 `generation_mode`, `generation_config`를 읽어 editor 기본값에 반영한다.

## 파일별 수정 계획

### 신규 파일

- `src/components/editor/GenerationControlBar.tsx`
- `src/components/editor/WritingPipelinePanel.tsx`
- `src/components/editor/GenerationStepCard.tsx`
- `src/components/editor/CompareSummaryCards.tsx`
- `src/components/editor/CompareExcerptViewer.tsx`
- `src/components/editor/GenerationTraceDrawer.tsx`
- `src/components/editor/CostAndLatencyBadge.tsx`
- `src/app/api/ai/compare-generate/route.ts`

### 수정 파일

- `src/components/editor/index.ts`
  - 신규 컴포넌트 export
- `src/types/generation.ts`
  - stage summary / compare result / cost metadata 타입 추가
- `src/app/api/ai/generate-episode/route.ts`
  - stage 이벤트 / pipeline summary metadata 추가
- `src/app/api/ai/test-generate/route.ts`
  - compare 결과 구조화
- `src/core/engine/writing-orchestrator.ts`
  - stage callback / summary / cost/latency 집계 추가
- `src/app/(studio)/projects/[projectId]/episodes/[episodeId]/page.tsx`
  - 상단 제어 바 삽입
  - pipeline 탭 추가
  - compare UI 연결
  - project default 연동

## 구현 우선순위

1. 타입 확장 + SSE stage 이벤트
2. 상단 제어 바 + 프로젝트 기본값 반영
3. 우측 `집필 파이프라인` 탭 추가
4. 비교 생성 route + 비교 카드/발췌 뷰어
5. trace drawer + 비용/속도/출처 힌트
