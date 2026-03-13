-- ============================================================================
-- V9.0 시놉시스 필드 추가 마이그레이션
-- emotion_curve, ending_image, forbidden, scene_beats 추가
-- ============================================================================

-- V9.0 연출 대본 필드 추가
ALTER TABLE episode_synopses
ADD COLUMN IF NOT EXISTS emotion_curve VARCHAR(200);

ALTER TABLE episode_synopses
ADD COLUMN IF NOT EXISTS ending_image TEXT;

ALTER TABLE episode_synopses
ADD COLUMN IF NOT EXISTS forbidden TEXT;

ALTER TABLE episode_synopses
ADD COLUMN IF NOT EXISTS scene_beats TEXT;

-- 코멘트 추가
COMMENT ON COLUMN episode_synopses.emotion_curve IS 'V9.0: 감정 곡선 (예: "긴장→공포→분노→각성")';
COMMENT ON COLUMN episode_synopses.ending_image IS 'V9.0: 마지막 장면 이미지/문장';
COMMENT ON COLUMN episode_synopses.forbidden IS 'V9.0: 이번 화 금지사항';
COMMENT ON COLUMN episode_synopses.scene_beats IS 'V9.0: PD가 직접 짜는 씬별 대본';

-- get_synopsis_context 함수 업데이트 (V9.0 필드 포함)
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
    callbacks TEXT[],
    is_current BOOLEAN,
    -- V9.0 필드
    emotion_curve VARCHAR(200),
    ending_image TEXT,
    forbidden TEXT,
    scene_beats TEXT
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
        es.callbacks,
        (es.episode_number = p_current_episode) as is_current,
        -- V9.0 필드
        es.emotion_curve,
        es.ending_image,
        es.forbidden,
        es.scene_beats
    FROM episode_synopses es
    WHERE es.project_id = p_project_id
      AND es.episode_number >= (p_current_episode - p_before_count)
      AND es.episode_number <= (p_current_episode + p_after_count)
    ORDER BY es.episode_number;
END;
$$ LANGUAGE plpgsql;
