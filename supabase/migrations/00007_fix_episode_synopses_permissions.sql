-- ============================================================================
-- episode_synopses 테이블 권한 수정
-- RLS 정책 강화 + 테이블 권한 부여
-- ============================================================================

-- 기존 정책 삭제 후 재생성
DROP POLICY IF EXISTS "episode_synopses_all" ON episode_synopses;

-- 모든 작업 허용 정책 (WITH CHECK 포함)
CREATE POLICY "episode_synopses_select" ON episode_synopses
    FOR SELECT USING (true);

CREATE POLICY "episode_synopses_insert" ON episode_synopses
    FOR INSERT WITH CHECK (true);

CREATE POLICY "episode_synopses_update" ON episode_synopses
    FOR UPDATE USING (true) WITH CHECK (true);

CREATE POLICY "episode_synopses_delete" ON episode_synopses
    FOR DELETE USING (true);

-- 테이블 권한 부여 (anon, authenticated, service_role)
GRANT ALL ON episode_synopses TO anon;
GRANT ALL ON episode_synopses TO authenticated;
GRANT ALL ON episode_synopses TO service_role;

-- 함수 실행 권한
GRANT EXECUTE ON FUNCTION get_synopsis_context TO anon;
GRANT EXECUTE ON FUNCTION get_synopsis_context TO authenticated;
GRANT EXECUTE ON FUNCTION get_synopsis_context TO service_role;

-- ============================================================================
-- timeline_events 테이블 권한도 동일하게 수정
-- ============================================================================

-- 기존 정책 삭제 후 재생성
DROP POLICY IF EXISTS "timeline_events_select" ON timeline_events;
DROP POLICY IF EXISTS "timeline_events_insert" ON timeline_events;
DROP POLICY IF EXISTS "timeline_events_update" ON timeline_events;
DROP POLICY IF EXISTS "timeline_events_delete" ON timeline_events;
DROP POLICY IF EXISTS "timeline_events_all" ON timeline_events;

-- 모든 작업 허용 정책
CREATE POLICY "timeline_events_select" ON timeline_events
    FOR SELECT USING (true);

CREATE POLICY "timeline_events_insert" ON timeline_events
    FOR INSERT WITH CHECK (true);

CREATE POLICY "timeline_events_update" ON timeline_events
    FOR UPDATE USING (true) WITH CHECK (true);

CREATE POLICY "timeline_events_delete" ON timeline_events
    FOR DELETE USING (true);

-- 테이블 권한 부여
GRANT ALL ON timeline_events TO anon;
GRANT ALL ON timeline_events TO authenticated;
GRANT ALL ON timeline_events TO service_role;

-- 함수 실행 권한
GRANT EXECUTE ON FUNCTION get_active_timeline_events TO anon;
GRANT EXECUTE ON FUNCTION get_active_timeline_events TO authenticated;
GRANT EXECUTE ON FUNCTION get_active_timeline_events TO service_role;
