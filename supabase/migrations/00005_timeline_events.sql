-- ============================================================================
-- 00005_timeline_events.sql
-- 매크로 스토리 타임라인 이벤트 (연표 관리)
-- ============================================================================

-- timeline_events 테이블: 거시적 스토리 아크/연표 관리
CREATE TABLE timeline_events (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    project_id UUID NOT NULL REFERENCES projects(id) ON DELETE CASCADE,

    -- 이벤트 기본 정보
    event_name VARCHAR(200) NOT NULL,
    event_type VARCHAR(50) NOT NULL CHECK (event_type IN (
        'arc_start',        -- 스토리 아크 시작
        'arc_climax',       -- 아크 클라이맥스
        'arc_end',          -- 아크 종료
        'major_conflict',   -- 주요 충돌/갈등
        'milestone',        -- 마일스톤 (성장, 획득 등)
        'turning_point',    -- 전환점
        'setup',            -- 설정/복선 구간
        'cooldown'          -- 휴식/정리 구간
    )),

    -- 적용 에피소드 범위
    episode_start INT NOT NULL,
    episode_end INT NOT NULL,

    -- 이벤트 상세 정보
    location VARCHAR(200),
    main_conflict TEXT,
    objectives TEXT[] DEFAULT '{}',
    constraints TEXT[] DEFAULT '{}',

    -- 후속 떡밥/복선
    foreshadowing_seeds TEXT[] DEFAULT '{}',

    -- 캐릭터 관련
    key_characters UUID[] DEFAULT '{}',
    character_focus TEXT,

    -- 톤앤무드
    tone VARCHAR(100),
    pacing VARCHAR(50) CHECK (pacing IN ('slow', 'moderate', 'fast', 'climactic')),

    -- 메타 정보
    importance INT DEFAULT 5 CHECK (importance BETWEEN 1 AND 10),
    notes TEXT,

    -- 상태 관리
    status VARCHAR(20) DEFAULT 'planned' CHECK (status IN (
        'planned',
        'in_progress',
        'completed',
        'modified'
    )),

    created_at TIMESTAMPTZ DEFAULT NOW(),
    updated_at TIMESTAMPTZ DEFAULT NOW(),

    -- 에피소드 범위 유효성 검증
    CONSTRAINT valid_episode_range CHECK (episode_start <= episode_end)
);

-- 인덱스
CREATE INDEX idx_timeline_events_project ON timeline_events(project_id);
CREATE INDEX idx_timeline_events_range ON timeline_events(project_id, episode_start, episode_end);
CREATE INDEX idx_timeline_events_status ON timeline_events(project_id, status);
CREATE INDEX idx_timeline_events_type ON timeline_events(project_id, event_type);

-- updated_at 자동 갱신 함수 (없으면 생성)
CREATE OR REPLACE FUNCTION update_timeline_events_updated_at()
RETURNS TRIGGER AS $$
BEGIN
    NEW.updated_at = NOW();
    RETURN NEW;
END;
$$ LANGUAGE plpgsql;

-- updated_at 자동 갱신 트리거
CREATE TRIGGER trigger_timeline_events_updated_at
    BEFORE UPDATE ON timeline_events
    FOR EACH ROW
    EXECUTE FUNCTION update_timeline_events_updated_at();

-- ============================================================================
-- 함수: 특정 에피소드에 해당하는 활성 타임라인 이벤트 조회
-- ============================================================================
CREATE OR REPLACE FUNCTION get_active_timeline_events(
    p_project_id UUID,
    p_episode_number INT
)
RETURNS TABLE (
    id UUID,
    event_name VARCHAR(200),
    event_type VARCHAR(50),
    episode_start INT,
    episode_end INT,
    location VARCHAR(200),
    main_conflict TEXT,
    objectives TEXT[],
    constraints TEXT[],
    foreshadowing_seeds TEXT[],
    key_characters UUID[],
    character_focus TEXT,
    tone VARCHAR(100),
    pacing VARCHAR(50),
    importance INT,
    status VARCHAR(20)
) AS $$
BEGIN
    RETURN QUERY
    SELECT
        te.id,
        te.event_name,
        te.event_type,
        te.episode_start,
        te.episode_end,
        te.location,
        te.main_conflict,
        te.objectives,
        te.constraints,
        te.foreshadowing_seeds,
        te.key_characters,
        te.character_focus,
        te.tone,
        te.pacing,
        te.importance,
        te.status
    FROM timeline_events te
    WHERE te.project_id = p_project_id
      AND te.status IN ('planned', 'in_progress')
      AND p_episode_number >= te.episode_start
      AND p_episode_number <= te.episode_end
    ORDER BY te.importance DESC, te.episode_start ASC;
END;
$$ LANGUAGE plpgsql;

-- ============================================================================
-- RLS 정책
-- ============================================================================
ALTER TABLE timeline_events ENABLE ROW LEVEL SECURITY;

-- 프로젝트 소유자만 접근 가능
CREATE POLICY "Users can view timeline_events of their projects"
    ON timeline_events FOR SELECT
    USING (project_id IN (SELECT id FROM projects WHERE user_id = auth.uid()));

CREATE POLICY "Users can insert timeline_events to their projects"
    ON timeline_events FOR INSERT
    WITH CHECK (project_id IN (SELECT id FROM projects WHERE user_id = auth.uid()));

CREATE POLICY "Users can update timeline_events of their projects"
    ON timeline_events FOR UPDATE
    USING (project_id IN (SELECT id FROM projects WHERE user_id = auth.uid()));

CREATE POLICY "Users can delete timeline_events of their projects"
    ON timeline_events FOR DELETE
    USING (project_id IN (SELECT id FROM projects WHERE user_id = auth.uid()));
