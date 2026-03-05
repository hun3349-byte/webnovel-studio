-- ============================================================================
-- 완전한 RLS 정책 (2024-03)
-- 모든 테이블에 대해 인증된 사용자가 자신의 데이터만 CRUD 가능하도록 설정
-- ============================================================================

-- ============================================================================
-- 1. 기존 정책 모두 삭제 (충돌 방지)
-- ============================================================================

-- projects
DROP POLICY IF EXISTS "Users can only access their own projects" ON projects;
DROP POLICY IF EXISTS "Users can view own projects" ON projects;
DROP POLICY IF EXISTS "Users can insert own projects" ON projects;
DROP POLICY IF EXISTS "Users can update own projects" ON projects;
DROP POLICY IF EXISTS "Users can delete own projects" ON projects;

-- world_bibles
DROP POLICY IF EXISTS "Users can access world_bibles of their projects" ON world_bibles;
DROP POLICY IF EXISTS "Users can view own world_bibles" ON world_bibles;
DROP POLICY IF EXISTS "Users can insert own world_bibles" ON world_bibles;
DROP POLICY IF EXISTS "Users can update own world_bibles" ON world_bibles;
DROP POLICY IF EXISTS "Users can delete own world_bibles" ON world_bibles;

-- characters
DROP POLICY IF EXISTS "Users can access characters of their projects" ON characters;
DROP POLICY IF EXISTS "Users can view own characters" ON characters;
DROP POLICY IF EXISTS "Users can insert own characters" ON characters;
DROP POLICY IF EXISTS "Users can update own characters" ON characters;
DROP POLICY IF EXISTS "Users can delete own characters" ON characters;

-- character_memories
DROP POLICY IF EXISTS "Users can access character_memories of their projects" ON character_memories;
DROP POLICY IF EXISTS "Users can view own character_memories" ON character_memories;
DROP POLICY IF EXISTS "Users can insert own character_memories" ON character_memories;
DROP POLICY IF EXISTS "Users can update own character_memories" ON character_memories;
DROP POLICY IF EXISTS "Users can delete own character_memories" ON character_memories;

-- character_relationships
DROP POLICY IF EXISTS "Users can access character_relationships of their projects" ON character_relationships;
DROP POLICY IF EXISTS "Users can view own character_relationships" ON character_relationships;
DROP POLICY IF EXISTS "Users can insert own character_relationships" ON character_relationships;
DROP POLICY IF EXISTS "Users can update own character_relationships" ON character_relationships;
DROP POLICY IF EXISTS "Users can delete own character_relationships" ON character_relationships;

-- episodes
DROP POLICY IF EXISTS "Users can access episodes of their projects" ON episodes;
DROP POLICY IF EXISTS "Users can view own episodes" ON episodes;
DROP POLICY IF EXISTS "Users can insert own episodes" ON episodes;
DROP POLICY IF EXISTS "Users can update own episodes" ON episodes;
DROP POLICY IF EXISTS "Users can delete own episodes" ON episodes;

-- episode_logs
DROP POLICY IF EXISTS "Users can access episode_logs of their projects" ON episode_logs;
DROP POLICY IF EXISTS "Users can view own episode_logs" ON episode_logs;
DROP POLICY IF EXISTS "Users can insert own episode_logs" ON episode_logs;
DROP POLICY IF EXISTS "Users can update own episode_logs" ON episode_logs;
DROP POLICY IF EXISTS "Users can delete own episode_logs" ON episode_logs;

-- episode_log_queue
DROP POLICY IF EXISTS "Users can view own episode_log_queue" ON episode_log_queue;
DROP POLICY IF EXISTS "Users can insert own episode_log_queue" ON episode_log_queue;
DROP POLICY IF EXISTS "Users can update own episode_log_queue" ON episode_log_queue;
DROP POLICY IF EXISTS "Users can delete own episode_log_queue" ON episode_log_queue;

-- story_hooks
DROP POLICY IF EXISTS "Users can access story_hooks of their projects" ON story_hooks;
DROP POLICY IF EXISTS "Users can view own story_hooks" ON story_hooks;
DROP POLICY IF EXISTS "Users can insert own story_hooks" ON story_hooks;
DROP POLICY IF EXISTS "Users can update own story_hooks" ON story_hooks;
DROP POLICY IF EXISTS "Users can delete own story_hooks" ON story_hooks;

-- writing_memories
DROP POLICY IF EXISTS "Users can access writing_memories of their projects" ON writing_memories;
DROP POLICY IF EXISTS "Users can view own writing_memories" ON writing_memories;
DROP POLICY IF EXISTS "Users can insert own writing_memories" ON writing_memories;
DROP POLICY IF EXISTS "Users can update own writing_memories" ON writing_memories;
DROP POLICY IF EXISTS "Users can delete own writing_memories" ON writing_memories;

-- relationship_history
DROP POLICY IF EXISTS "Users can view own relationship_history" ON relationship_history;
DROP POLICY IF EXISTS "Users can insert own relationship_history" ON relationship_history;
DROP POLICY IF EXISTS "Users can update own relationship_history" ON relationship_history;
DROP POLICY IF EXISTS "Users can delete own relationship_history" ON relationship_history;

-- episode_character_states
DROP POLICY IF EXISTS "Users can view own episode_character_states" ON episode_character_states;
DROP POLICY IF EXISTS "Users can insert own episode_character_states" ON episode_character_states;
DROP POLICY IF EXISTS "Users can update own episode_character_states" ON episode_character_states;
DROP POLICY IF EXISTS "Users can delete own episode_character_states" ON episode_character_states;

-- episode_item_changes
DROP POLICY IF EXISTS "Users can view own episode_item_changes" ON episode_item_changes;
DROP POLICY IF EXISTS "Users can insert own episode_item_changes" ON episode_item_changes;
DROP POLICY IF EXISTS "Users can update own episode_item_changes" ON episode_item_changes;
DROP POLICY IF EXISTS "Users can delete own episode_item_changes" ON episode_item_changes;

-- ============================================================================
-- 2. RLS 활성화 (모든 테이블)
-- ============================================================================
ALTER TABLE projects ENABLE ROW LEVEL SECURITY;
ALTER TABLE world_bibles ENABLE ROW LEVEL SECURITY;
ALTER TABLE characters ENABLE ROW LEVEL SECURITY;
ALTER TABLE character_memories ENABLE ROW LEVEL SECURITY;
ALTER TABLE character_relationships ENABLE ROW LEVEL SECURITY;
ALTER TABLE relationship_history ENABLE ROW LEVEL SECURITY;
ALTER TABLE episodes ENABLE ROW LEVEL SECURITY;
ALTER TABLE episode_logs ENABLE ROW LEVEL SECURITY;
ALTER TABLE episode_log_queue ENABLE ROW LEVEL SECURITY;
ALTER TABLE episode_character_states ENABLE ROW LEVEL SECURITY;
ALTER TABLE episode_item_changes ENABLE ROW LEVEL SECURITY;
ALTER TABLE story_hooks ENABLE ROW LEVEL SECURITY;
ALTER TABLE writing_memories ENABLE ROW LEVEL SECURITY;

-- ============================================================================
-- 3. PROJECTS: 직접 user_id 비교
-- ============================================================================
CREATE POLICY "projects_select" ON projects
  FOR SELECT USING (auth.uid() = user_id);

CREATE POLICY "projects_insert" ON projects
  FOR INSERT WITH CHECK (auth.uid() = user_id);

CREATE POLICY "projects_update" ON projects
  FOR UPDATE USING (auth.uid() = user_id);

CREATE POLICY "projects_delete" ON projects
  FOR DELETE USING (auth.uid() = user_id);

-- ============================================================================
-- 4. WORLD_BIBLES: 프로젝트 소유자만 접근
-- ============================================================================
CREATE POLICY "world_bibles_select" ON world_bibles
  FOR SELECT USING (
    EXISTS (SELECT 1 FROM projects WHERE projects.id = world_bibles.project_id AND projects.user_id = auth.uid())
  );

CREATE POLICY "world_bibles_insert" ON world_bibles
  FOR INSERT WITH CHECK (
    EXISTS (SELECT 1 FROM projects WHERE projects.id = world_bibles.project_id AND projects.user_id = auth.uid())
  );

CREATE POLICY "world_bibles_update" ON world_bibles
  FOR UPDATE USING (
    EXISTS (SELECT 1 FROM projects WHERE projects.id = world_bibles.project_id AND projects.user_id = auth.uid())
  );

CREATE POLICY "world_bibles_delete" ON world_bibles
  FOR DELETE USING (
    EXISTS (SELECT 1 FROM projects WHERE projects.id = world_bibles.project_id AND projects.user_id = auth.uid())
  );

-- ============================================================================
-- 5. CHARACTERS: 프로젝트 소유자만 접근
-- ============================================================================
CREATE POLICY "characters_select" ON characters
  FOR SELECT USING (
    EXISTS (SELECT 1 FROM projects WHERE projects.id = characters.project_id AND projects.user_id = auth.uid())
  );

CREATE POLICY "characters_insert" ON characters
  FOR INSERT WITH CHECK (
    EXISTS (SELECT 1 FROM projects WHERE projects.id = characters.project_id AND projects.user_id = auth.uid())
  );

CREATE POLICY "characters_update" ON characters
  FOR UPDATE USING (
    EXISTS (SELECT 1 FROM projects WHERE projects.id = characters.project_id AND projects.user_id = auth.uid())
  );

CREATE POLICY "characters_delete" ON characters
  FOR DELETE USING (
    EXISTS (SELECT 1 FROM projects WHERE projects.id = characters.project_id AND projects.user_id = auth.uid())
  );

-- ============================================================================
-- 6. CHARACTER_MEMORIES: 프로젝트 소유자만 접근
-- ============================================================================
CREATE POLICY "character_memories_select" ON character_memories
  FOR SELECT USING (
    EXISTS (SELECT 1 FROM projects WHERE projects.id = character_memories.project_id AND projects.user_id = auth.uid())
  );

CREATE POLICY "character_memories_insert" ON character_memories
  FOR INSERT WITH CHECK (
    EXISTS (SELECT 1 FROM projects WHERE projects.id = character_memories.project_id AND projects.user_id = auth.uid())
  );

CREATE POLICY "character_memories_update" ON character_memories
  FOR UPDATE USING (
    EXISTS (SELECT 1 FROM projects WHERE projects.id = character_memories.project_id AND projects.user_id = auth.uid())
  );

CREATE POLICY "character_memories_delete" ON character_memories
  FOR DELETE USING (
    EXISTS (SELECT 1 FROM projects WHERE projects.id = character_memories.project_id AND projects.user_id = auth.uid())
  );

-- ============================================================================
-- 7. CHARACTER_RELATIONSHIPS: 프로젝트 소유자만 접근
-- ============================================================================
CREATE POLICY "character_relationships_select" ON character_relationships
  FOR SELECT USING (
    EXISTS (SELECT 1 FROM projects WHERE projects.id = character_relationships.project_id AND projects.user_id = auth.uid())
  );

CREATE POLICY "character_relationships_insert" ON character_relationships
  FOR INSERT WITH CHECK (
    EXISTS (SELECT 1 FROM projects WHERE projects.id = character_relationships.project_id AND projects.user_id = auth.uid())
  );

CREATE POLICY "character_relationships_update" ON character_relationships
  FOR UPDATE USING (
    EXISTS (SELECT 1 FROM projects WHERE projects.id = character_relationships.project_id AND projects.user_id = auth.uid())
  );

CREATE POLICY "character_relationships_delete" ON character_relationships
  FOR DELETE USING (
    EXISTS (SELECT 1 FROM projects WHERE projects.id = character_relationships.project_id AND projects.user_id = auth.uid())
  );

-- ============================================================================
-- 8. RELATIONSHIP_HISTORY: 관계 소유자만 접근
-- ============================================================================
CREATE POLICY "relationship_history_select" ON relationship_history
  FOR SELECT USING (
    EXISTS (
      SELECT 1 FROM character_relationships cr
      JOIN projects p ON p.id = cr.project_id
      WHERE cr.id = relationship_history.relationship_id AND p.user_id = auth.uid()
    )
  );

CREATE POLICY "relationship_history_insert" ON relationship_history
  FOR INSERT WITH CHECK (
    EXISTS (
      SELECT 1 FROM character_relationships cr
      JOIN projects p ON p.id = cr.project_id
      WHERE cr.id = relationship_history.relationship_id AND p.user_id = auth.uid()
    )
  );

CREATE POLICY "relationship_history_update" ON relationship_history
  FOR UPDATE USING (
    EXISTS (
      SELECT 1 FROM character_relationships cr
      JOIN projects p ON p.id = cr.project_id
      WHERE cr.id = relationship_history.relationship_id AND p.user_id = auth.uid()
    )
  );

CREATE POLICY "relationship_history_delete" ON relationship_history
  FOR DELETE USING (
    EXISTS (
      SELECT 1 FROM character_relationships cr
      JOIN projects p ON p.id = cr.project_id
      WHERE cr.id = relationship_history.relationship_id AND p.user_id = auth.uid()
    )
  );

-- ============================================================================
-- 9. EPISODES: 프로젝트 소유자만 접근
-- ============================================================================
CREATE POLICY "episodes_select" ON episodes
  FOR SELECT USING (
    EXISTS (SELECT 1 FROM projects WHERE projects.id = episodes.project_id AND projects.user_id = auth.uid())
  );

CREATE POLICY "episodes_insert" ON episodes
  FOR INSERT WITH CHECK (
    EXISTS (SELECT 1 FROM projects WHERE projects.id = episodes.project_id AND projects.user_id = auth.uid())
  );

CREATE POLICY "episodes_update" ON episodes
  FOR UPDATE USING (
    EXISTS (SELECT 1 FROM projects WHERE projects.id = episodes.project_id AND projects.user_id = auth.uid())
  );

CREATE POLICY "episodes_delete" ON episodes
  FOR DELETE USING (
    EXISTS (SELECT 1 FROM projects WHERE projects.id = episodes.project_id AND projects.user_id = auth.uid())
  );

-- ============================================================================
-- 10. EPISODE_LOGS: 프로젝트 소유자만 접근
-- ============================================================================
CREATE POLICY "episode_logs_select" ON episode_logs
  FOR SELECT USING (
    EXISTS (SELECT 1 FROM projects WHERE projects.id = episode_logs.project_id AND projects.user_id = auth.uid())
  );

CREATE POLICY "episode_logs_insert" ON episode_logs
  FOR INSERT WITH CHECK (
    EXISTS (SELECT 1 FROM projects WHERE projects.id = episode_logs.project_id AND projects.user_id = auth.uid())
  );

CREATE POLICY "episode_logs_update" ON episode_logs
  FOR UPDATE USING (
    EXISTS (SELECT 1 FROM projects WHERE projects.id = episode_logs.project_id AND projects.user_id = auth.uid())
  );

CREATE POLICY "episode_logs_delete" ON episode_logs
  FOR DELETE USING (
    EXISTS (SELECT 1 FROM projects WHERE projects.id = episode_logs.project_id AND projects.user_id = auth.uid())
  );

-- ============================================================================
-- 11. EPISODE_LOG_QUEUE: 프로젝트 소유자만 접근
-- ============================================================================
CREATE POLICY "episode_log_queue_select" ON episode_log_queue
  FOR SELECT USING (
    EXISTS (SELECT 1 FROM projects WHERE projects.id = episode_log_queue.project_id AND projects.user_id = auth.uid())
  );

CREATE POLICY "episode_log_queue_insert" ON episode_log_queue
  FOR INSERT WITH CHECK (
    EXISTS (SELECT 1 FROM projects WHERE projects.id = episode_log_queue.project_id AND projects.user_id = auth.uid())
  );

CREATE POLICY "episode_log_queue_update" ON episode_log_queue
  FOR UPDATE USING (
    EXISTS (SELECT 1 FROM projects WHERE projects.id = episode_log_queue.project_id AND projects.user_id = auth.uid())
  );

CREATE POLICY "episode_log_queue_delete" ON episode_log_queue
  FOR DELETE USING (
    EXISTS (SELECT 1 FROM projects WHERE projects.id = episode_log_queue.project_id AND projects.user_id = auth.uid())
  );

-- ============================================================================
-- 12. EPISODE_CHARACTER_STATES: 에피소드 로그 소유자만 접근
-- ============================================================================
CREATE POLICY "episode_character_states_select" ON episode_character_states
  FOR SELECT USING (
    EXISTS (
      SELECT 1 FROM episode_logs el
      JOIN projects p ON p.id = el.project_id
      WHERE el.id = episode_character_states.episode_log_id AND p.user_id = auth.uid()
    )
  );

CREATE POLICY "episode_character_states_insert" ON episode_character_states
  FOR INSERT WITH CHECK (
    EXISTS (
      SELECT 1 FROM episode_logs el
      JOIN projects p ON p.id = el.project_id
      WHERE el.id = episode_character_states.episode_log_id AND p.user_id = auth.uid()
    )
  );

CREATE POLICY "episode_character_states_update" ON episode_character_states
  FOR UPDATE USING (
    EXISTS (
      SELECT 1 FROM episode_logs el
      JOIN projects p ON p.id = el.project_id
      WHERE el.id = episode_character_states.episode_log_id AND p.user_id = auth.uid()
    )
  );

CREATE POLICY "episode_character_states_delete" ON episode_character_states
  FOR DELETE USING (
    EXISTS (
      SELECT 1 FROM episode_logs el
      JOIN projects p ON p.id = el.project_id
      WHERE el.id = episode_character_states.episode_log_id AND p.user_id = auth.uid()
    )
  );

-- ============================================================================
-- 13. EPISODE_ITEM_CHANGES: 에피소드 로그 소유자만 접근
-- ============================================================================
CREATE POLICY "episode_item_changes_select" ON episode_item_changes
  FOR SELECT USING (
    EXISTS (
      SELECT 1 FROM episode_logs el
      JOIN projects p ON p.id = el.project_id
      WHERE el.id = episode_item_changes.episode_log_id AND p.user_id = auth.uid()
    )
  );

CREATE POLICY "episode_item_changes_insert" ON episode_item_changes
  FOR INSERT WITH CHECK (
    EXISTS (
      SELECT 1 FROM episode_logs el
      JOIN projects p ON p.id = el.project_id
      WHERE el.id = episode_item_changes.episode_log_id AND p.user_id = auth.uid()
    )
  );

CREATE POLICY "episode_item_changes_update" ON episode_item_changes
  FOR UPDATE USING (
    EXISTS (
      SELECT 1 FROM episode_logs el
      JOIN projects p ON p.id = el.project_id
      WHERE el.id = episode_item_changes.episode_log_id AND p.user_id = auth.uid()
    )
  );

CREATE POLICY "episode_item_changes_delete" ON episode_item_changes
  FOR DELETE USING (
    EXISTS (
      SELECT 1 FROM episode_logs el
      JOIN projects p ON p.id = el.project_id
      WHERE el.id = episode_item_changes.episode_log_id AND p.user_id = auth.uid()
    )
  );

-- ============================================================================
-- 14. STORY_HOOKS: 프로젝트 소유자만 접근
-- ============================================================================
CREATE POLICY "story_hooks_select" ON story_hooks
  FOR SELECT USING (
    EXISTS (SELECT 1 FROM projects WHERE projects.id = story_hooks.project_id AND projects.user_id = auth.uid())
  );

CREATE POLICY "story_hooks_insert" ON story_hooks
  FOR INSERT WITH CHECK (
    EXISTS (SELECT 1 FROM projects WHERE projects.id = story_hooks.project_id AND projects.user_id = auth.uid())
  );

CREATE POLICY "story_hooks_update" ON story_hooks
  FOR UPDATE USING (
    EXISTS (SELECT 1 FROM projects WHERE projects.id = story_hooks.project_id AND projects.user_id = auth.uid())
  );

CREATE POLICY "story_hooks_delete" ON story_hooks
  FOR DELETE USING (
    EXISTS (SELECT 1 FROM projects WHERE projects.id = story_hooks.project_id AND projects.user_id = auth.uid())
  );

-- ============================================================================
-- 15. WRITING_MEMORIES: 프로젝트 소유자만 접근
-- ============================================================================
CREATE POLICY "writing_memories_select" ON writing_memories
  FOR SELECT USING (
    EXISTS (SELECT 1 FROM projects WHERE projects.id = writing_memories.project_id AND projects.user_id = auth.uid())
  );

CREATE POLICY "writing_memories_insert" ON writing_memories
  FOR INSERT WITH CHECK (
    EXISTS (SELECT 1 FROM projects WHERE projects.id = writing_memories.project_id AND projects.user_id = auth.uid())
  );

CREATE POLICY "writing_memories_update" ON writing_memories
  FOR UPDATE USING (
    EXISTS (SELECT 1 FROM projects WHERE projects.id = writing_memories.project_id AND projects.user_id = auth.uid())
  );

CREATE POLICY "writing_memories_delete" ON writing_memories
  FOR DELETE USING (
    EXISTS (SELECT 1 FROM projects WHERE projects.id = writing_memories.project_id AND projects.user_id = auth.uid())
  );

-- ============================================================================
-- 완료
-- ============================================================================
COMMENT ON SCHEMA public IS '완전한 RLS 정책 적용 완료 (2024-03)';
