-- ============================================================================
-- RLS (Row Level Security) Policies
-- 사용자별 데이터 격리 정책
-- ============================================================================

-- Enable RLS on all tables
ALTER TABLE projects ENABLE ROW LEVEL SECURITY;
ALTER TABLE world_bibles ENABLE ROW LEVEL SECURITY;
ALTER TABLE characters ENABLE ROW LEVEL SECURITY;
ALTER TABLE character_memories ENABLE ROW LEVEL SECURITY;
ALTER TABLE character_relationships ENABLE ROW LEVEL SECURITY;
ALTER TABLE episodes ENABLE ROW LEVEL SECURITY;
ALTER TABLE episode_logs ENABLE ROW LEVEL SECURITY;
ALTER TABLE episode_log_queue ENABLE ROW LEVEL SECURITY;
ALTER TABLE story_hooks ENABLE ROW LEVEL SECURITY;
ALTER TABLE writing_memories ENABLE ROW LEVEL SECURITY;

-- ============================================================================
-- Projects: 본인 프로젝트만 접근
-- ============================================================================
CREATE POLICY "Users can view own projects"
  ON projects FOR SELECT
  USING (auth.uid() = user_id);

CREATE POLICY "Users can insert own projects"
  ON projects FOR INSERT
  WITH CHECK (auth.uid() = user_id);

CREATE POLICY "Users can update own projects"
  ON projects FOR UPDATE
  USING (auth.uid() = user_id);

CREATE POLICY "Users can delete own projects"
  ON projects FOR DELETE
  USING (auth.uid() = user_id);

-- ============================================================================
-- World Bibles: 프로젝트 소유자만 접근
-- ============================================================================
CREATE POLICY "Users can view own world_bibles"
  ON world_bibles FOR SELECT
  USING (EXISTS (
    SELECT 1 FROM projects WHERE projects.id = world_bibles.project_id AND projects.user_id = auth.uid()
  ));

CREATE POLICY "Users can insert own world_bibles"
  ON world_bibles FOR INSERT
  WITH CHECK (EXISTS (
    SELECT 1 FROM projects WHERE projects.id = world_bibles.project_id AND projects.user_id = auth.uid()
  ));

CREATE POLICY "Users can update own world_bibles"
  ON world_bibles FOR UPDATE
  USING (EXISTS (
    SELECT 1 FROM projects WHERE projects.id = world_bibles.project_id AND projects.user_id = auth.uid()
  ));

CREATE POLICY "Users can delete own world_bibles"
  ON world_bibles FOR DELETE
  USING (EXISTS (
    SELECT 1 FROM projects WHERE projects.id = world_bibles.project_id AND projects.user_id = auth.uid()
  ));

-- ============================================================================
-- Characters: 프로젝트 소유자만 접근
-- ============================================================================
CREATE POLICY "Users can view own characters"
  ON characters FOR SELECT
  USING (EXISTS (
    SELECT 1 FROM projects WHERE projects.id = characters.project_id AND projects.user_id = auth.uid()
  ));

CREATE POLICY "Users can insert own characters"
  ON characters FOR INSERT
  WITH CHECK (EXISTS (
    SELECT 1 FROM projects WHERE projects.id = characters.project_id AND projects.user_id = auth.uid()
  ));

CREATE POLICY "Users can update own characters"
  ON characters FOR UPDATE
  USING (EXISTS (
    SELECT 1 FROM projects WHERE projects.id = characters.project_id AND projects.user_id = auth.uid()
  ));

CREATE POLICY "Users can delete own characters"
  ON characters FOR DELETE
  USING (EXISTS (
    SELECT 1 FROM projects WHERE projects.id = characters.project_id AND projects.user_id = auth.uid()
  ));

-- ============================================================================
-- Character Memories: 프로젝트 소유자만 접근
-- ============================================================================
CREATE POLICY "Users can view own character_memories"
  ON character_memories FOR SELECT
  USING (EXISTS (
    SELECT 1 FROM projects WHERE projects.id = character_memories.project_id AND projects.user_id = auth.uid()
  ));

CREATE POLICY "Users can insert own character_memories"
  ON character_memories FOR INSERT
  WITH CHECK (EXISTS (
    SELECT 1 FROM projects WHERE projects.id = character_memories.project_id AND projects.user_id = auth.uid()
  ));

CREATE POLICY "Users can update own character_memories"
  ON character_memories FOR UPDATE
  USING (EXISTS (
    SELECT 1 FROM projects WHERE projects.id = character_memories.project_id AND projects.user_id = auth.uid()
  ));

CREATE POLICY "Users can delete own character_memories"
  ON character_memories FOR DELETE
  USING (EXISTS (
    SELECT 1 FROM projects WHERE projects.id = character_memories.project_id AND projects.user_id = auth.uid()
  ));

-- ============================================================================
-- Character Relationships: 프로젝트 소유자만 접근
-- ============================================================================
CREATE POLICY "Users can view own character_relationships"
  ON character_relationships FOR SELECT
  USING (EXISTS (
    SELECT 1 FROM projects WHERE projects.id = character_relationships.project_id AND projects.user_id = auth.uid()
  ));

CREATE POLICY "Users can insert own character_relationships"
  ON character_relationships FOR INSERT
  WITH CHECK (EXISTS (
    SELECT 1 FROM projects WHERE projects.id = character_relationships.project_id AND projects.user_id = auth.uid()
  ));

CREATE POLICY "Users can update own character_relationships"
  ON character_relationships FOR UPDATE
  USING (EXISTS (
    SELECT 1 FROM projects WHERE projects.id = character_relationships.project_id AND projects.user_id = auth.uid()
  ));

CREATE POLICY "Users can delete own character_relationships"
  ON character_relationships FOR DELETE
  USING (EXISTS (
    SELECT 1 FROM projects WHERE projects.id = character_relationships.project_id AND projects.user_id = auth.uid()
  ));

-- ============================================================================
-- Episodes: 프로젝트 소유자만 접근
-- ============================================================================
CREATE POLICY "Users can view own episodes"
  ON episodes FOR SELECT
  USING (EXISTS (
    SELECT 1 FROM projects WHERE projects.id = episodes.project_id AND projects.user_id = auth.uid()
  ));

CREATE POLICY "Users can insert own episodes"
  ON episodes FOR INSERT
  WITH CHECK (EXISTS (
    SELECT 1 FROM projects WHERE projects.id = episodes.project_id AND projects.user_id = auth.uid()
  ));

CREATE POLICY "Users can update own episodes"
  ON episodes FOR UPDATE
  USING (EXISTS (
    SELECT 1 FROM projects WHERE projects.id = episodes.project_id AND projects.user_id = auth.uid()
  ));

CREATE POLICY "Users can delete own episodes"
  ON episodes FOR DELETE
  USING (EXISTS (
    SELECT 1 FROM projects WHERE projects.id = episodes.project_id AND projects.user_id = auth.uid()
  ));

-- ============================================================================
-- Episode Logs: 프로젝트 소유자만 접근
-- ============================================================================
CREATE POLICY "Users can view own episode_logs"
  ON episode_logs FOR SELECT
  USING (EXISTS (
    SELECT 1 FROM projects WHERE projects.id = episode_logs.project_id AND projects.user_id = auth.uid()
  ));

CREATE POLICY "Users can insert own episode_logs"
  ON episode_logs FOR INSERT
  WITH CHECK (EXISTS (
    SELECT 1 FROM projects WHERE projects.id = episode_logs.project_id AND projects.user_id = auth.uid()
  ));

CREATE POLICY "Users can update own episode_logs"
  ON episode_logs FOR UPDATE
  USING (EXISTS (
    SELECT 1 FROM projects WHERE projects.id = episode_logs.project_id AND projects.user_id = auth.uid()
  ));

CREATE POLICY "Users can delete own episode_logs"
  ON episode_logs FOR DELETE
  USING (EXISTS (
    SELECT 1 FROM projects WHERE projects.id = episode_logs.project_id AND projects.user_id = auth.uid()
  ));

-- ============================================================================
-- Episode Log Queue: 프로젝트 소유자만 접근
-- ============================================================================
CREATE POLICY "Users can view own episode_log_queue"
  ON episode_log_queue FOR SELECT
  USING (EXISTS (
    SELECT 1 FROM projects WHERE projects.id = episode_log_queue.project_id AND projects.user_id = auth.uid()
  ));

CREATE POLICY "Users can insert own episode_log_queue"
  ON episode_log_queue FOR INSERT
  WITH CHECK (EXISTS (
    SELECT 1 FROM projects WHERE projects.id = episode_log_queue.project_id AND projects.user_id = auth.uid()
  ));

CREATE POLICY "Users can update own episode_log_queue"
  ON episode_log_queue FOR UPDATE
  USING (EXISTS (
    SELECT 1 FROM projects WHERE projects.id = episode_log_queue.project_id AND projects.user_id = auth.uid()
  ));

CREATE POLICY "Users can delete own episode_log_queue"
  ON episode_log_queue FOR DELETE
  USING (EXISTS (
    SELECT 1 FROM projects WHERE projects.id = episode_log_queue.project_id AND projects.user_id = auth.uid()
  ));

-- ============================================================================
-- Story Hooks: 프로젝트 소유자만 접근
-- ============================================================================
CREATE POLICY "Users can view own story_hooks"
  ON story_hooks FOR SELECT
  USING (EXISTS (
    SELECT 1 FROM projects WHERE projects.id = story_hooks.project_id AND projects.user_id = auth.uid()
  ));

CREATE POLICY "Users can insert own story_hooks"
  ON story_hooks FOR INSERT
  WITH CHECK (EXISTS (
    SELECT 1 FROM projects WHERE projects.id = story_hooks.project_id AND projects.user_id = auth.uid()
  ));

CREATE POLICY "Users can update own story_hooks"
  ON story_hooks FOR UPDATE
  USING (EXISTS (
    SELECT 1 FROM projects WHERE projects.id = story_hooks.project_id AND projects.user_id = auth.uid()
  ));

CREATE POLICY "Users can delete own story_hooks"
  ON story_hooks FOR DELETE
  USING (EXISTS (
    SELECT 1 FROM projects WHERE projects.id = story_hooks.project_id AND projects.user_id = auth.uid()
  ));

-- ============================================================================
-- Writing Memories: 프로젝트 소유자만 접근
-- ============================================================================
CREATE POLICY "Users can view own writing_memories"
  ON writing_memories FOR SELECT
  USING (EXISTS (
    SELECT 1 FROM projects WHERE projects.id = writing_memories.project_id AND projects.user_id = auth.uid()
  ));

CREATE POLICY "Users can insert own writing_memories"
  ON writing_memories FOR INSERT
  WITH CHECK (EXISTS (
    SELECT 1 FROM projects WHERE projects.id = writing_memories.project_id AND projects.user_id = auth.uid()
  ));

CREATE POLICY "Users can update own writing_memories"
  ON writing_memories FOR UPDATE
  USING (EXISTS (
    SELECT 1 FROM projects WHERE projects.id = writing_memories.project_id AND projects.user_id = auth.uid()
  ));

CREATE POLICY "Users can delete own writing_memories"
  ON writing_memories FOR DELETE
  USING (EXISTS (
    SELECT 1 FROM projects WHERE projects.id = writing_memories.project_id AND projects.user_id = auth.uid()
  ));
