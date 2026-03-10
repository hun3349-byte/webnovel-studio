-- ============================================================================
-- 에피소드별 시놉시스 테이블 (Story Bible)
-- 전체 스토리의 타임라인과 에피소드별 계획을 사전 저장
-- ============================================================================

-- 에피소드 시놉시스 테이블
CREATE TABLE IF NOT EXISTS episode_synopses (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    project_id UUID NOT NULL REFERENCES projects(id) ON DELETE CASCADE,
    episode_number INTEGER NOT NULL,

    -- 시놉시스 핵심 정보
    title VARCHAR(200),                    -- 에피소드 제목 (계획)
    synopsis TEXT NOT NULL,                -- 에피소드 시놉시스 (주요 사건, 전개)
    goals TEXT[],                          -- 이 에피소드의 목표 (달성해야 할 것들)
    key_events TEXT[],                     -- 핵심 사건들

    -- 캐릭터/설정 관련
    featured_characters TEXT[],            -- 주요 등장 캐릭터
    location VARCHAR(200),                 -- 주요 배경/장소
    time_context VARCHAR(200),             -- 시간적 배경 (예: "입궁 3일차 오후")

    -- 스토리 구조
    arc_name VARCHAR(100),                 -- 소속 아크명 (예: "입궁편", "복수편")
    arc_position VARCHAR(20),              -- 아크 내 위치 (beginning/middle/climax/resolution)

    -- 떡밥/복선
    foreshadowing TEXT[],                  -- 이 에피소드에서 깔아야 할 복선
    callbacks TEXT[],                      -- 이전 복선 회수할 것

    -- 메타
    notes TEXT,                            -- PD 메모
    is_written BOOLEAN DEFAULT false,      -- 실제 에피소드 작성 완료 여부

    -- 타임스탬프
    created_at TIMESTAMPTZ DEFAULT NOW(),
    updated_at TIMESTAMPTZ DEFAULT NOW(),

    -- 유니크 제약: 프로젝트 내 에피소드 번호 중복 방지
    UNIQUE(project_id, episode_number)
);

-- 인덱스
CREATE INDEX IF NOT EXISTS idx_episode_synopses_project ON episode_synopses(project_id);
CREATE INDEX IF NOT EXISTS idx_episode_synopses_arc ON episode_synopses(project_id, arc_name);
CREATE INDEX IF NOT EXISTS idx_episode_synopses_episode ON episode_synopses(project_id, episode_number);

-- RLS
ALTER TABLE episode_synopses ENABLE ROW LEVEL SECURITY;

-- 정책
CREATE POLICY "episode_synopses_all" ON episode_synopses FOR ALL USING (true);

-- updated_at 트리거
CREATE OR REPLACE FUNCTION update_episode_synopses_updated_at()
RETURNS TRIGGER AS $$
BEGIN
    NEW.updated_at = NOW();
    RETURN NEW;
END;
$$ LANGUAGE plpgsql;

CREATE TRIGGER trigger_update_episode_synopses_updated_at
    BEFORE UPDATE ON episode_synopses
    FOR EACH ROW
    EXECUTE FUNCTION update_episode_synopses_updated_at();

-- ============================================================================
-- 시놉시스 조회 함수 (슬라이딩 윈도우용)
-- 현재 에피소드 기준 앞뒤 시놉시스 조회
-- ============================================================================
CREATE OR REPLACE FUNCTION get_synopsis_context(
    p_project_id UUID,
    p_current_episode INTEGER,
    p_before_count INTEGER DEFAULT 3,
    p_after_count INTEGER DEFAULT 5
)
RETURNS TABLE (
    episode_number INTEGER,
    title VARCHAR(200),
    synopsis TEXT,
    goals TEXT[],
    key_events TEXT[],
    arc_name VARCHAR(100),
    arc_position VARCHAR(20),
    foreshadowing TEXT[],
    is_current BOOLEAN
) AS $$
BEGIN
    RETURN QUERY
    SELECT
        es.episode_number,
        es.title,
        es.synopsis,
        es.goals,
        es.key_events,
        es.arc_name,
        es.arc_position,
        es.foreshadowing,
        (es.episode_number = p_current_episode) as is_current
    FROM episode_synopses es
    WHERE es.project_id = p_project_id
      AND es.episode_number >= (p_current_episode - p_before_count)
      AND es.episode_number <= (p_current_episode + p_after_count)
    ORDER BY es.episode_number;
END;
$$ LANGUAGE plpgsql;

-- ============================================================================
-- 코멘트
-- ============================================================================
COMMENT ON TABLE episode_synopses IS '에피소드별 사전 시놉시스 (Story Bible)';
COMMENT ON COLUMN episode_synopses.synopsis IS '에피소드의 주요 사건과 전개 계획';
COMMENT ON COLUMN episode_synopses.goals IS '이 에피소드에서 달성해야 할 목표들';
COMMENT ON COLUMN episode_synopses.foreshadowing IS '이 에피소드에서 깔아야 할 복선들';
COMMENT ON COLUMN episode_synopses.callbacks IS '이전 에피소드의 복선 중 회수할 것들';
