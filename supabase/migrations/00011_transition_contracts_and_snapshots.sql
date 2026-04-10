-- ============================================================================
-- 11. Transition Contract + Character Snapshot
-- ============================================================================

CREATE TABLE IF NOT EXISTS episode_transition_contracts (
  id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
  project_id UUID NOT NULL REFERENCES projects(id) ON DELETE CASCADE,
  source_episode_id UUID REFERENCES episodes(id) ON DELETE SET NULL,
  source_episode_number INT NOT NULL,
  target_episode_number INT NOT NULL,
  anchor_1 TEXT NOT NULL DEFAULT '',
  anchor_2 TEXT NOT NULL DEFAULT '',
  anchor_3 TEXT NOT NULL DEFAULT '',
  opening_guardrail TEXT,
  created_at TIMESTAMPTZ DEFAULT NOW(),
  updated_at TIMESTAMPTZ DEFAULT NOW(),
  UNIQUE(project_id, source_episode_number)
);

CREATE INDEX IF NOT EXISTS idx_transition_contracts_target
  ON episode_transition_contracts(project_id, target_episode_number DESC);

CREATE TABLE IF NOT EXISTS episode_character_snapshots (
  id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
  project_id UUID NOT NULL REFERENCES projects(id) ON DELETE CASCADE,
  episode_id UUID NOT NULL REFERENCES episodes(id) ON DELETE CASCADE,
  episode_number INT NOT NULL,
  snapshots JSONB NOT NULL DEFAULT '[]'::jsonb,
  created_at TIMESTAMPTZ DEFAULT NOW(),
  UNIQUE(project_id, episode_number)
);

CREATE INDEX IF NOT EXISTS idx_episode_character_snapshots_project_episode
  ON episode_character_snapshots(project_id, episode_number DESC);

-- story_hooks 단계형 상태 전이 지원: open -> hinted -> escalated -> resolved
ALTER TABLE story_hooks
  DROP CONSTRAINT IF EXISTS story_hooks_status_check;

ALTER TABLE story_hooks
  ADD CONSTRAINT story_hooks_status_check
  CHECK (status IN ('open', 'hinted', 'escalated', 'partially_resolved', 'resolved', 'abandoned'));

-- RLS
ALTER TABLE episode_transition_contracts ENABLE ROW LEVEL SECURITY;
ALTER TABLE episode_character_snapshots ENABLE ROW LEVEL SECURITY;

CREATE POLICY "Users can view own transition contracts"
  ON episode_transition_contracts FOR SELECT
  USING (
    EXISTS (
      SELECT 1 FROM projects
      WHERE projects.id = episode_transition_contracts.project_id
        AND projects.user_id = auth.uid()
    )
  );

CREATE POLICY "Users can insert own transition contracts"
  ON episode_transition_contracts FOR INSERT
  WITH CHECK (
    EXISTS (
      SELECT 1 FROM projects
      WHERE projects.id = episode_transition_contracts.project_id
        AND projects.user_id = auth.uid()
    )
  );

CREATE POLICY "Users can update own transition contracts"
  ON episode_transition_contracts FOR UPDATE
  USING (
    EXISTS (
      SELECT 1 FROM projects
      WHERE projects.id = episode_transition_contracts.project_id
        AND projects.user_id = auth.uid()
    )
  );

CREATE POLICY "Users can delete own transition contracts"
  ON episode_transition_contracts FOR DELETE
  USING (
    EXISTS (
      SELECT 1 FROM projects
      WHERE projects.id = episode_transition_contracts.project_id
        AND projects.user_id = auth.uid()
    )
  );

CREATE POLICY "Users can view own character snapshots"
  ON episode_character_snapshots FOR SELECT
  USING (
    EXISTS (
      SELECT 1 FROM projects
      WHERE projects.id = episode_character_snapshots.project_id
        AND projects.user_id = auth.uid()
    )
  );

CREATE POLICY "Users can insert own character snapshots"
  ON episode_character_snapshots FOR INSERT
  WITH CHECK (
    EXISTS (
      SELECT 1 FROM projects
      WHERE projects.id = episode_character_snapshots.project_id
        AND projects.user_id = auth.uid()
    )
  );

CREATE POLICY "Users can update own character snapshots"
  ON episode_character_snapshots FOR UPDATE
  USING (
    EXISTS (
      SELECT 1 FROM projects
      WHERE projects.id = episode_character_snapshots.project_id
        AND projects.user_id = auth.uid()
    )
  );

CREATE POLICY "Users can delete own character snapshots"
  ON episode_character_snapshots FOR DELETE
  USING (
    EXISTS (
      SELECT 1 FROM projects
      WHERE projects.id = episode_character_snapshots.project_id
        AND projects.user_id = auth.uid()
    )
  );
