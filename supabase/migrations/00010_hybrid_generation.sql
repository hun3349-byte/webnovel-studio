-- ============================================================================
-- Hybrid GPT + Claude Writing Architecture
-- 00010_hybrid_generation.sql
-- ============================================================================

ALTER TABLE projects
ADD COLUMN IF NOT EXISTS generation_mode VARCHAR(50)
DEFAULT 'claude_legacy'
CHECK (
  generation_mode IN (
    'claude_legacy',
    'hybrid_gpt_claude',
    'hybrid_gpt_claude_punchup'
  )
);

ALTER TABLE projects
ADD COLUMN IF NOT EXISTS generation_config JSONB DEFAULT '{}'::jsonb;

COMMENT ON COLUMN projects.generation_mode IS 'Default writing architecture mode for episode generation';
COMMENT ON COLUMN projects.generation_config IS 'Project-level hybrid writing configuration';

CREATE TABLE IF NOT EXISTS episode_generation_traces (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  project_id UUID NOT NULL REFERENCES projects(id) ON DELETE CASCADE,
  episode_id UUID NULL REFERENCES episodes(id) ON DELETE SET NULL,
  target_episode_number INT NOT NULL,
  generation_mode VARCHAR(50) NOT NULL
    CHECK (
      generation_mode IN (
        'claude_legacy',
        'hybrid_gpt_claude',
        'hybrid_gpt_claude_punchup'
      )
    ),
  resolved_mode VARCHAR(50) NOT NULL
    CHECK (
      resolved_mode IN (
        'claude_legacy',
        'hybrid_gpt_claude',
        'hybrid_gpt_claude_punchup'
      )
    ),
  planner_model VARCHAR(100),
  prose_model VARCHAR(100) NOT NULL,
  punchup_model VARCHAR(100),
  status VARCHAR(20) NOT NULL DEFAULT 'completed'
    CHECK (status IN ('pending', 'completed', 'failed', 'fallback')),
  request_instruction TEXT,
  planner_output JSONB DEFAULT '{}'::jsonb,
  prose_output TEXT,
  punchup_output JSONB DEFAULT '{}'::jsonb,
  final_content TEXT,
  validation_summary JSONB DEFAULT '{}'::jsonb,
  trace_payload JSONB DEFAULT '{}'::jsonb,
  created_at TIMESTAMPTZ DEFAULT NOW(),
  updated_at TIMESTAMPTZ DEFAULT NOW()
);

CREATE INDEX IF NOT EXISTS idx_episode_generation_traces_project
  ON episode_generation_traces(project_id, created_at DESC);

CREATE INDEX IF NOT EXISTS idx_episode_generation_traces_episode
  ON episode_generation_traces(episode_id);

CREATE INDEX IF NOT EXISTS idx_episode_generation_traces_mode
  ON episode_generation_traces(generation_mode, resolved_mode);

ALTER TABLE episode_generation_traces ENABLE ROW LEVEL SECURITY;

CREATE POLICY "episode_generation_traces_select_policy" ON episode_generation_traces FOR SELECT
  USING (true);

CREATE POLICY "episode_generation_traces_insert_policy" ON episode_generation_traces FOR INSERT
  WITH CHECK (true);

CREATE POLICY "episode_generation_traces_update_policy" ON episode_generation_traces FOR UPDATE
  USING (true);

CREATE POLICY "episode_generation_traces_delete_policy" ON episode_generation_traces FOR DELETE
  USING (true);

GRANT ALL ON episode_generation_traces TO anon, authenticated, service_role;

DROP TRIGGER IF EXISTS update_episode_generation_traces_updated_at ON episode_generation_traces;
CREATE TRIGGER update_episode_generation_traces_updated_at
  BEFORE UPDATE ON episode_generation_traces
  FOR EACH ROW
  EXECUTE FUNCTION update_updated_at_column();
