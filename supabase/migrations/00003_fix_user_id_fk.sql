-- ============================================================================
-- Fix user_id Foreign Key & RLS Policy Conflicts
-- 2024-03: Auth 연동 후 프로젝트 생성 500 에러 수정
-- ============================================================================

-- 1. 기존 중복 RLS 정책 제거 (00001에서 생성된 것들)
DROP POLICY IF EXISTS "Users can only access their own projects" ON projects;
DROP POLICY IF EXISTS "Users can access world_bibles of their projects" ON world_bibles;
DROP POLICY IF EXISTS "Users can access characters of their projects" ON characters;
DROP POLICY IF EXISTS "Users can access episodes of their projects" ON episodes;
DROP POLICY IF EXISTS "Users can access episode_logs of their projects" ON episode_logs;
DROP POLICY IF EXISTS "Users can access story_hooks of their projects" ON story_hooks;
DROP POLICY IF EXISTS "Users can access writing_memories of their projects" ON writing_memories;
DROP POLICY IF EXISTS "Users can access character_memories of their projects" ON character_memories;
DROP POLICY IF EXISTS "Users can access character_relationships of their projects" ON character_relationships;

-- 2. projects.user_id에 Foreign Key 추가 (auth.users 참조)
-- 주의: 기존 데이터가 있으면 FK 추가 실패할 수 있음
DO $$
BEGIN
    -- FK가 없으면 추가
    IF NOT EXISTS (
        SELECT 1 FROM information_schema.table_constraints
        WHERE constraint_name = 'projects_user_id_fkey'
        AND table_name = 'projects'
    ) THEN
        -- 기존 orphan 데이터 정리 (auth.users에 없는 user_id를 가진 프로젝트 삭제)
        DELETE FROM projects
        WHERE user_id NOT IN (SELECT id FROM auth.users);

        -- FK 추가
        ALTER TABLE projects
        ADD CONSTRAINT projects_user_id_fkey
        FOREIGN KEY (user_id) REFERENCES auth.users(id) ON DELETE CASCADE;

        RAISE NOTICE 'Added FK constraint: projects_user_id_fkey';
    ELSE
        RAISE NOTICE 'FK constraint already exists: projects_user_id_fkey';
    END IF;
END $$;

-- 3. writing_memories.user_id에도 FK 추가
DO $$
BEGIN
    IF NOT EXISTS (
        SELECT 1 FROM information_schema.table_constraints
        WHERE constraint_name = 'writing_memories_user_id_fkey'
        AND table_name = 'writing_memories'
    ) THEN
        DELETE FROM writing_memories
        WHERE user_id NOT IN (SELECT id FROM auth.users);

        ALTER TABLE writing_memories
        ADD CONSTRAINT writing_memories_user_id_fkey
        FOREIGN KEY (user_id) REFERENCES auth.users(id) ON DELETE CASCADE;

        RAISE NOTICE 'Added FK constraint: writing_memories_user_id_fkey';
    ELSE
        RAISE NOTICE 'FK constraint already exists: writing_memories_user_id_fkey';
    END IF;
END $$;

-- 4. user_id 컬럼에 인덱스 추가 (조회 성능 향상)
CREATE INDEX IF NOT EXISTS idx_projects_user_id ON projects(user_id);
CREATE INDEX IF NOT EXISTS idx_writing_memories_user_id ON writing_memories(user_id);

-- 5. RLS 정책이 제대로 적용되어 있는지 확인 (00002에서 생성된 정책 유지)
-- Service Role은 RLS를 우회하므로 INSERT 정책만 확인

-- projects INSERT 정책 확인/재생성
DROP POLICY IF EXISTS "Users can insert own projects" ON projects;
CREATE POLICY "Users can insert own projects"
  ON projects FOR INSERT
  WITH CHECK (auth.uid() = user_id);

-- SELECT/UPDATE/DELETE 정책도 재확인
DROP POLICY IF EXISTS "Users can view own projects" ON projects;
CREATE POLICY "Users can view own projects"
  ON projects FOR SELECT
  USING (auth.uid() = user_id);

DROP POLICY IF EXISTS "Users can update own projects" ON projects;
CREATE POLICY "Users can update own projects"
  ON projects FOR UPDATE
  USING (auth.uid() = user_id);

DROP POLICY IF EXISTS "Users can delete own projects" ON projects;
CREATE POLICY "Users can delete own projects"
  ON projects FOR DELETE
  USING (auth.uid() = user_id);

-- 6. Service Role이 RLS를 우회할 수 있는지 확인
-- (기본적으로 service_role은 RLS를 우회하므로 별도 설정 불필요)

COMMENT ON TABLE projects IS 'User projects - Auth 연동 완료 (2024-03)';
