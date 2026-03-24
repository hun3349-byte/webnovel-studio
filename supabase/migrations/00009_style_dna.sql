-- ============================================================================
-- Style Evolution Engine - DB Migration
-- 00009_style_dna.sql
-- ============================================================================

-- ============================================================================
-- 1. style_dna 테이블: 개별 StyleDNA (레퍼런스/PD피드백/수동)
-- ============================================================================
CREATE TABLE IF NOT EXISTS style_dna (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  project_id UUID NOT NULL REFERENCES projects(id) ON DELETE CASCADE,

  -- 소스 정보
  source_name VARCHAR(200) NOT NULL,  -- "화산귀환", "PD_피드백_12화"
  source_type VARCHAR(20) NOT NULL CHECK (source_type IN ('reference', 'pd_feedback', 'manual')),

  -- DNA 요소 (각 200자 권장)
  prose_style TEXT,           -- 문체 특성 요약
  rhythm_pattern TEXT,        -- 리듬 패턴
  dialogue_style TEXT,        -- 대화체 스타일
  emotion_expression TEXT,    -- 감정 표현 방식
  scene_transition TEXT,      -- 장면 전환 기법
  action_description TEXT,    -- 액션/전투 묘사 방식

  -- 모범 예시 (JSON 배열)
  best_samples JSONB DEFAULT '[]',  -- [{category, bad_example, good_example, explanation}]

  -- 금지/권장 패턴
  avoid_patterns TEXT[] DEFAULT '{}',
  favor_patterns TEXT[] DEFAULT '{}',

  -- 메타데이터
  confidence FLOAT DEFAULT 0.7 CHECK (confidence >= 0 AND confidence <= 1),
  weight FLOAT DEFAULT 1.0,   -- 합성 시 가중치 (pd_feedback은 2.0 권장)
  version INT DEFAULT 1,
  is_active BOOLEAN DEFAULT true,

  created_at TIMESTAMPTZ DEFAULT NOW(),
  updated_at TIMESTAMPTZ DEFAULT NOW()
);

-- ============================================================================
-- 2. style_dna_merged 테이블: 프로젝트별 합성 DNA (1개)
-- ============================================================================
CREATE TABLE IF NOT EXISTS style_dna_merged (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  project_id UUID UNIQUE NOT NULL REFERENCES projects(id) ON DELETE CASCADE,

  -- 합성된 DNA 요소
  merged_prose_style TEXT,
  merged_rhythm_pattern TEXT,
  merged_dialogue_style TEXT,
  merged_emotion_expression TEXT,
  merged_scene_transition TEXT,
  merged_action_description TEXT,
  merged_best_samples JSONB DEFAULT '[]',
  merged_avoid_patterns TEXT[] DEFAULT '{}',
  merged_favor_patterns TEXT[] DEFAULT '{}',

  -- 메타데이터
  source_count INT DEFAULT 0,           -- 합성에 사용된 DNA 수
  reference_count INT DEFAULT 0,        -- 레퍼런스 DNA 수
  pd_feedback_count INT DEFAULT 0,      -- PD 피드백 DNA 수
  average_confidence FLOAT DEFAULT 0.5,

  version INT DEFAULT 1,
  last_merged_at TIMESTAMPTZ DEFAULT NOW(),
  created_at TIMESTAMPTZ DEFAULT NOW(),
  updated_at TIMESTAMPTZ DEFAULT NOW()
);

-- ============================================================================
-- 3. episodes 테이블에 original_content 컬럼 추가
-- ============================================================================
ALTER TABLE episodes ADD COLUMN IF NOT EXISTS original_content TEXT;

COMMENT ON COLUMN episodes.original_content IS 'AI 생성 원본 콘텐츠 (PD 피드백 학습용)';

-- ============================================================================
-- 4. 인덱스
-- ============================================================================
CREATE INDEX IF NOT EXISTS idx_style_dna_project ON style_dna(project_id, is_active);
CREATE INDEX IF NOT EXISTS idx_style_dna_source_type ON style_dna(source_type, confidence DESC);
CREATE INDEX IF NOT EXISTS idx_style_dna_merged_project ON style_dna_merged(project_id);

-- ============================================================================
-- 5. RLS 정책
-- ============================================================================
ALTER TABLE style_dna ENABLE ROW LEVEL SECURITY;
ALTER TABLE style_dna_merged ENABLE ROW LEVEL SECURITY;

-- style_dna 정책
CREATE POLICY "style_dna_select_policy" ON style_dna FOR SELECT
  USING (true);

CREATE POLICY "style_dna_insert_policy" ON style_dna FOR INSERT
  WITH CHECK (true);

CREATE POLICY "style_dna_update_policy" ON style_dna FOR UPDATE
  USING (true);

CREATE POLICY "style_dna_delete_policy" ON style_dna FOR DELETE
  USING (true);

-- style_dna_merged 정책
CREATE POLICY "style_dna_merged_select_policy" ON style_dna_merged FOR SELECT
  USING (true);

CREATE POLICY "style_dna_merged_insert_policy" ON style_dna_merged FOR INSERT
  WITH CHECK (true);

CREATE POLICY "style_dna_merged_update_policy" ON style_dna_merged FOR UPDATE
  USING (true);

CREATE POLICY "style_dna_merged_delete_policy" ON style_dna_merged FOR DELETE
  USING (true);

-- ============================================================================
-- 6. 권한 부여
-- ============================================================================
GRANT ALL ON style_dna TO anon, authenticated, service_role;
GRANT ALL ON style_dna_merged TO anon, authenticated, service_role;

-- ============================================================================
-- 7. updated_at 트리거 함수 (없으면 생성)
-- ============================================================================
CREATE OR REPLACE FUNCTION update_updated_at_column()
RETURNS TRIGGER AS $$
BEGIN
  NEW.updated_at = NOW();
  RETURN NEW;
END;
$$ LANGUAGE plpgsql;

-- style_dna 트리거
DROP TRIGGER IF EXISTS update_style_dna_updated_at ON style_dna;
CREATE TRIGGER update_style_dna_updated_at
  BEFORE UPDATE ON style_dna
  FOR EACH ROW
  EXECUTE FUNCTION update_updated_at_column();

-- style_dna_merged 트리거
DROP TRIGGER IF EXISTS update_style_dna_merged_updated_at ON style_dna_merged;
CREATE TRIGGER update_style_dna_merged_updated_at
  BEFORE UPDATE ON style_dna_merged
  FOR EACH ROW
  EXECUTE FUNCTION update_updated_at_column();
