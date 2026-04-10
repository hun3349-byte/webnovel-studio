# 2026-04-08 진행현황 (내일 이어서 작업용)

## 1) 스티어링(핵심 방향)
- 기본 시놉시스/세계관/캐릭터는 절대 유지.
- 기존 본문을 지우지 않고, 이어쓰기 확장 모드가 기본.
- 압축 전개(A→C 점프), 반복, 미완결 엔딩을 줄이는 규칙을 프롬프트/검수 모두에 반영.
- 자동작성은 사람 게이트(최종 퇴고/채택) 이후 다음 회차로 이어지도록 설계.

## 2) 오늘 반영된 주요 변경

### A. 집필/검수 규칙 강화
- `src/core/engine/prompt-injector.ts`
  - 단계별 서사 확장 규칙 추가:
    - 사건 원자화(발단/심화/결과)
    - 트리거 기반 인과
    - 캐릭터 반작용(Reaction)
    - Showing 우선
- `src/app/api/ai/validate-prose/route.ts`
  - 파일 재정리(인코딩 문제 해소)
  - 검수 컨텍스트 강화:
    - Transition Contract
    - 직전 캐릭터 스냅샷 포함

### B. 이어쓰기 안정화
- `src/app/(studio)/projects/[projectId]/episodes/[episodeId]/page.tsx`
  - 생성 요청 시 기존 본문이 있으면 `continueFromExisting`, `existingContent` 전달
  - 본문 초기화(지우기) 문제를 줄이는 방향으로 반영

### C. 자동작성 기능(신규)
- `src/core/engine/auto-writing.ts`
  - 자동작성 설정 정규화
  - 다음 실행 시각 계산
  - 1회 자동작성 실행 코어
  - GPT 1차 검수 + Gemini 1차 검수(키 없으면 스킵 메시지)
- `src/app/api/projects/[projectId]/auto-writing/route.ts`
  - GET: 자동작성 설정 조회
  - PATCH: 자동작성 시작/중지/시간설정 저장
  - POST: `run_now` (지금 1회 실행)
- `src/app/api/ai/auto-writing/dispatch/route.ts`
  - 스케줄 기반 자동작성 디스패치 엔드포인트
- `src/components/editor/EpisodeEditorV2.tsx`
  - UI 추가:
    - 자동작성 시작/중지 버튼
    - 시간설정(시작 시간/일일 횟수/타임존)
    - “지금 1회 실행” 버튼
- `vercel.json`
  - 크론 추가: 매시 정각 `/api/ai/auto-writing/dispatch`

## 3) 현재 동작 상태
- `npm run build` 통과.
- 자동작성 1회 실행 시:
  - 최신 회차가 `published`가 아니면 보류(사람 최종 퇴고 게이트 유지)
  - 조건 충족 시 다음 화 초안 생성 + 1차 검수 결과 생성

## 4) 내일 바로 할 일 체크리스트
1. 최신 코드 프로덕션 배포
2. V2 에디터에서 자동작성 UI 노출 확인
3. 시간설정 저장 → 자동작성 시작/중지 동작 확인
4. “지금 1회 실행”으로 다음 화 초안 생성 확인
5. 수동 퇴고/채택 후 다음 회차 연속성 확인
6. `/api/ai/auto-writing/dispatch` 로그/결과 확인

## 5) 환경변수 점검(내일)
- `OPENAI_API_KEY` (GPT 1차 검수)
- `GEMINI_API_KEY` (Gemini 1차 검수, 미설정 시 스킵)
- `AUTO_WRITING_CRON_SECRET` (수동/외부 호출 보호용)

---

## 6) 중지 시점 메모 (2026-04-08, 방금 중단)

### 사용자 요청 배경
- “다시 써” 사용 시 맥락이 흔들리고 내용이 왔다갔다/중복되는 문제.
- 목표: 기존 흐름 유지하면서 국소 수정 중심으로 안정화.

### 방금 반영한 변경(미완료 검증 상태)
- 파일: `src/components/editor/EpisodeEditorV2.tsx`
  - `inferFeedbackRange()`에 선행 매칭 규칙 추가:
    - 엔딩/오프닝/연속성 키워드(한/영) 우선 인식
  - `rewriteWithFeedback()` 변경:
    - 기존: 범위 추론 실패 시 `generate()`로 전체 재작성
    - 변경: 범위 추론 실패 시에도 **엔딩 중심 fallback 범위만 partial rewrite**
    - 목적: “다시 써” 클릭 시 전체 리스타트/중복 전개 방지
  - `withRewriteGuardrails(feedback)` 추가:
    - 연대기/장면 순서 유지
    - 시작부터 재기동 금지(선택 범위 제외)
    - 연속성/설정 보존
    - 중복 문단 억제

### 현재 상태
- 사용자가 “중지” 요청하여 여기서 작업 스톱.
- 위 변경은 저장되었으나 **최종 빌드/배포 전** 상태.

### 내일 첫 작업 순서
1. `npm run build`로 타입/컴파일 확인
2. V2 에디터에서 “다시 써” 시나리오 재현 테스트
   - 케이스 A: “마지막 장면 설정오류”
   - 케이스 B: “맥락 연결 보강”
3. 중복/리스타트가 사라졌는지 확인
4. 통과 시 프로덕션 배포
5. 필요 시 `rewriteWithFeedback`에서 키워드→범위 매핑 추가 튜닝
