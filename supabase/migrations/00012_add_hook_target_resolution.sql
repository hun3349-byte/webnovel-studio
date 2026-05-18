-- Phase 2: 장기 복선 맵 주입을 위한 스키마 변경
-- story_hooks 테이블에 예상 회수 회차 컬럼 추가

-- target_resolution_episode 컬럼 추가
ALTER TABLE story_hooks
ADD COLUMN IF NOT EXISTS target_resolution_episode integer DEFAULT NULL;

-- 컬럼 코멘트 추가
COMMENT ON COLUMN story_hooks.target_resolution_episode IS '예상 회수 회차 (null이면 미정)';

-- 인덱스 추가 (회수 필요한 훅 빠르게 조회)
CREATE INDEX IF NOT EXISTS idx_story_hooks_target_resolution
ON story_hooks(project_id, target_resolution_episode)
WHERE status = 'open' AND target_resolution_episode IS NOT NULL;
