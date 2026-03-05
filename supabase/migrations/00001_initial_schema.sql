-- ============================================================================
-- Narrative Studio - Initial Schema
-- 보완점 반영:
-- 1. 트랜잭션/롤백: episode_log_queue 테이블, log_status 필드 추가
-- 2. 장기 기억 확장성: JSONB 원자화, 별도 테이블로 분리하여 검색 최적화
-- ============================================================================

-- Enable UUID extension
CREATE EXTENSION IF NOT EXISTS "uuid-ossp";

-- ============================================================================
-- 1. 프로젝트 (소설 단위)
-- ============================================================================
CREATE TABLE projects (
    id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
    user_id UUID NOT NULL,
    title VARCHAR(200) NOT NULL,
    genre VARCHAR(50),
    target_platform VARCHAR(50) DEFAULT 'naver',
    status VARCHAR(20) DEFAULT 'draft' CHECK (status IN ('draft', 'ongoing', 'completed', 'archived')),
    total_episodes INT DEFAULT 0,
    created_at TIMESTAMPTZ DEFAULT NOW(),
    updated_at TIMESTAMPTZ DEFAULT NOW()
);

-- ============================================================================
-- 2. 월드 바이블 (세계관 절대 규칙)
-- ============================================================================
CREATE TABLE world_bibles (
    id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
    project_id UUID NOT NULL REFERENCES projects(id) ON DELETE CASCADE,

    -- 세계관 기본 설정 (구조화)
    world_name VARCHAR(200),
    time_period VARCHAR(100),
    geography TEXT,

    -- 힘의 체계 (마법/무공 등) - 검색 가능하도록 구조화
    power_system_name VARCHAR(100),
    power_system_ranks JSONB DEFAULT '[]',
    power_system_rules TEXT,

    -- 절대 규칙들 (배열로 분리하여 개별 검색 가능)
    absolute_rules JSONB DEFAULT '[]',

    -- 금기 사항 (TEXT 배열로 Full-text search 대비)
    forbidden_elements TEXT[] DEFAULT '{}',

    -- 기타 세계관 설정 (확장용)
    additional_settings JSONB DEFAULT '{}',

    version INT DEFAULT 1,
    created_at TIMESTAMPTZ DEFAULT NOW(),
    updated_at TIMESTAMPTZ DEFAULT NOW(),

    UNIQUE(project_id)
);

-- ============================================================================
-- 3. 캐릭터 (인물 데이터) - 장기 기억 확장성 반영
-- ============================================================================
CREATE TABLE characters (
    id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
    project_id UUID NOT NULL REFERENCES projects(id) ON DELETE CASCADE,

    -- 기본 정보 (검색 가능하도록 컬럼 분리)
    name VARCHAR(100) NOT NULL,
    role VARCHAR(50) CHECK (role IN ('protagonist', 'antagonist', 'supporting', 'extra')),
    age VARCHAR(50),
    gender VARCHAR(20),
    appearance TEXT,
    personality TEXT,
    speech_pattern TEXT,

    -- 과거사 (긴 텍스트, Full-text search 대상)
    backstory TEXT,

    -- 목표/욕망 (배열로 분리)
    goals TEXT[] DEFAULT '{}',

    -- 현재 상태 (슬라이딩 윈도우용, 매 회차 업데이트)
    is_alive BOOLEAN DEFAULT true,
    current_location VARCHAR(200),
    emotional_state VARCHAR(100) DEFAULT 'neutral',

    -- 소지품 (별도 검색 가능)
    possessed_items TEXT[] DEFAULT '{}',

    -- 부상/상태이상 (별도 검색 가능)
    injuries TEXT[] DEFAULT '{}',
    status_effects TEXT[] DEFAULT '{}',

    -- 확장 데이터
    additional_data JSONB DEFAULT '{}',

    first_appearance_episode INT,
    last_appearance_episode INT,

    created_at TIMESTAMPTZ DEFAULT NOW(),
    updated_at TIMESTAMPTZ DEFAULT NOW()
);

-- 캐릭터 이름 검색 인덱스
CREATE INDEX idx_characters_name ON characters USING gin(to_tsvector('simple', name));

-- ============================================================================
-- 4. 캐릭터 기억 (memories 분리 - 장기 기억 검색용) ★
-- ============================================================================
CREATE TABLE character_memories (
    id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
    character_id UUID NOT NULL REFERENCES characters(id) ON DELETE CASCADE,
    project_id UUID NOT NULL REFERENCES projects(id) ON DELETE CASCADE,

    -- 기억 내용 (개별 검색 가능하도록 분리)
    memory_type VARCHAR(50) CHECK (memory_type IN ('event', 'trauma', 'relationship', 'knowledge', 'secret')),
    summary VARCHAR(500) NOT NULL,
    detail TEXT,
    emotional_impact VARCHAR(50),

    -- 연관 에피소드 (어느 화에서 발생했는지)
    source_episode_id UUID,
    source_episode_number INT,

    -- 연관 캐릭터들
    related_character_ids UUID[] DEFAULT '{}',

    -- 중요도 (검색 우선순위용)
    importance INT DEFAULT 5 CHECK (importance BETWEEN 1 AND 10),

    -- 검색 키워드 (Full-text search 최적화)
    keywords TEXT[] DEFAULT '{}',

    created_at TIMESTAMPTZ DEFAULT NOW()
);

-- 기억 검색 인덱스 (장기 기억 조회용)
CREATE INDEX idx_character_memories_type ON character_memories(character_id, memory_type);
CREATE INDEX idx_character_memories_importance ON character_memories(importance DESC);
CREATE INDEX idx_character_memories_keywords ON character_memories USING gin(keywords);

-- ============================================================================
-- 5. 캐릭터 관계도
-- ============================================================================
CREATE TABLE character_relationships (
    id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
    project_id UUID NOT NULL REFERENCES projects(id) ON DELETE CASCADE,
    character_a_id UUID NOT NULL REFERENCES characters(id) ON DELETE CASCADE,
    character_b_id UUID NOT NULL REFERENCES characters(id) ON DELETE CASCADE,

    relationship_type VARCHAR(50) CHECK (relationship_type IN (
        'ally', 'enemy', 'neutral', 'family', 'romantic', 'mentor', 'rival', 'unknown'
    )),
    description TEXT,
    intensity INT DEFAULT 5 CHECK (intensity BETWEEN 1 AND 10),

    -- A가 B를 어떻게 인식하는지 (비대칭 관계 지원)
    a_perception_of_b TEXT,
    b_perception_of_a TEXT,

    created_at TIMESTAMPTZ DEFAULT NOW(),
    updated_at TIMESTAMPTZ DEFAULT NOW(),

    UNIQUE(character_a_id, character_b_id)
);

-- ============================================================================
-- 6. 관계 변화 히스토리 (별도 테이블로 분리 - 장기 추적용)
-- ============================================================================
CREATE TABLE relationship_history (
    id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
    relationship_id UUID NOT NULL REFERENCES character_relationships(id) ON DELETE CASCADE,
    episode_id UUID,
    episode_number INT,

    previous_type VARCHAR(50),
    new_type VARCHAR(50),
    previous_intensity INT,
    new_intensity INT,
    change_description TEXT,

    created_at TIMESTAMPTZ DEFAULT NOW()
);

-- ============================================================================
-- 7. 에피소드 (회차)
-- ============================================================================
CREATE TABLE episodes (
    id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
    project_id UUID NOT NULL REFERENCES projects(id) ON DELETE CASCADE,

    episode_number INT NOT NULL,
    title VARCHAR(200),

    -- 본문
    content TEXT NOT NULL,
    char_count INT DEFAULT 0,

    -- 메타데이터
    status VARCHAR(20) DEFAULT 'draft' CHECK (status IN ('draft', 'generating', 'review', 'published')),

    -- AI 평가 점수
    cliffhanger_score INT CHECK (cliffhanger_score BETWEEN 1 AND 10),
    show_dont_tell_score INT CHECK (show_dont_tell_score BETWEEN 1 AND 10),

    -- ★ 로그 상태 (트랜잭션 보장용)
    log_status VARCHAR(20) DEFAULT 'pending' CHECK (log_status IN (
        'pending',      -- 로그 생성 대기
        'processing',   -- 로그 생성 중
        'completed',    -- 로그 생성 완료
        'failed',       -- 로그 생성 실패 (재시도 필요)
        'fallback'      -- Fallback 로그 사용 중
    )),
    log_retry_count INT DEFAULT 0,
    log_last_error TEXT,

    created_at TIMESTAMPTZ DEFAULT NOW(),
    updated_at TIMESTAMPTZ DEFAULT NOW(),
    published_at TIMESTAMPTZ,

    UNIQUE(project_id, episode_number)
);

CREATE INDEX idx_episodes_project ON episodes(project_id, episode_number);
CREATE INDEX idx_episodes_log_status ON episodes(log_status) WHERE log_status IN ('pending', 'failed');

-- ============================================================================
-- 8. 에피소드 로그 (Memory Chaining) - 원자화된 구조 ★★★
-- ============================================================================
CREATE TABLE episode_logs (
    id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
    episode_id UUID NOT NULL REFERENCES episodes(id) ON DELETE CASCADE,
    project_id UUID NOT NULL REFERENCES projects(id) ON DELETE CASCADE,
    episode_number INT NOT NULL,

    -- 요약 (Full-text search 대상)
    summary TEXT NOT NULL,

    -- 마지막 500자 (문맥 연결용)
    last_500_chars TEXT NOT NULL,

    -- Fallback 여부 (임시 로그인지)
    is_fallback BOOLEAN DEFAULT false,

    -- AI 원본 응답 (디버깅용)
    raw_ai_response JSONB,

    created_at TIMESTAMPTZ DEFAULT NOW(),

    UNIQUE(episode_id)
);

-- 에피소드 로그 검색 인덱스
CREATE INDEX idx_episode_logs_project ON episode_logs(project_id, episode_number DESC);
CREATE INDEX idx_episode_logs_summary ON episode_logs USING gin(to_tsvector('simple', summary));

-- ============================================================================
-- 9. 에피소드별 캐릭터 상태 변화 (원자화) ★
-- ============================================================================
CREATE TABLE episode_character_states (
    id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
    episode_log_id UUID NOT NULL REFERENCES episode_logs(id) ON DELETE CASCADE,
    character_id UUID NOT NULL REFERENCES characters(id) ON DELETE CASCADE,

    -- 상태 변화 (개별 필드로 분리)
    location_before VARCHAR(200),
    location_after VARCHAR(200),
    emotional_before VARCHAR(100),
    emotional_after VARCHAR(100),

    -- 변화 내용 (검색 가능한 텍스트)
    changes TEXT[] DEFAULT '{}',
    injuries_gained TEXT[] DEFAULT '{}',
    injuries_healed TEXT[] DEFAULT '{}',

    created_at TIMESTAMPTZ DEFAULT NOW()
);

CREATE INDEX idx_episode_char_states ON episode_character_states(episode_log_id);

-- ============================================================================
-- 10. 에피소드별 아이템 변화 (원자화) ★
-- ============================================================================
CREATE TABLE episode_item_changes (
    id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
    episode_log_id UUID NOT NULL REFERENCES episode_logs(id) ON DELETE CASCADE,
    character_id UUID REFERENCES characters(id) ON DELETE SET NULL,

    change_type VARCHAR(20) CHECK (change_type IN ('gained', 'lost', 'transferred', 'destroyed')),
    item_name VARCHAR(200) NOT NULL,
    item_description TEXT,

    -- 이전 방향 (transferred인 경우)
    transferred_to_character_id UUID REFERENCES characters(id),

    created_at TIMESTAMPTZ DEFAULT NOW()
);

CREATE INDEX idx_episode_item_changes ON episode_item_changes(episode_log_id);
CREATE INDEX idx_item_name_search ON episode_item_changes USING gin(to_tsvector('simple', item_name));

-- ============================================================================
-- 11. 떡밥 (Foreshadowing/Hooks) - 별도 테이블로 분리 ★★
-- 장기 기억: 1화의 떡밥을 100화에서 검색할 수 있어야 함
-- ============================================================================
CREATE TABLE story_hooks (
    id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
    project_id UUID NOT NULL REFERENCES projects(id) ON DELETE CASCADE,

    -- 떡밥 내용
    hook_type VARCHAR(50) CHECK (hook_type IN ('foreshadowing', 'mystery', 'promise', 'setup', 'chekhov_gun')),
    summary VARCHAR(500) NOT NULL,
    detail TEXT,

    -- 검색 키워드
    keywords TEXT[] DEFAULT '{}',

    -- 연관 캐릭터들
    related_character_ids UUID[] DEFAULT '{}',

    -- 생성 에피소드
    created_in_episode_id UUID REFERENCES episodes(id),
    created_in_episode_number INT NOT NULL,

    -- 회수 상태
    status VARCHAR(20) DEFAULT 'open' CHECK (status IN ('open', 'partially_resolved', 'resolved', 'abandoned')),
    resolved_in_episode_id UUID REFERENCES episodes(id),
    resolved_in_episode_number INT,
    resolution_summary TEXT,

    -- 중요도 (높을수록 빨리 회수 필요)
    importance INT DEFAULT 5 CHECK (importance BETWEEN 1 AND 10),

    created_at TIMESTAMPTZ DEFAULT NOW(),
    updated_at TIMESTAMPTZ DEFAULT NOW()
);

CREATE INDEX idx_story_hooks_status ON story_hooks(project_id, status);
CREATE INDEX idx_story_hooks_keywords ON story_hooks USING gin(keywords);
CREATE INDEX idx_story_hooks_episode ON story_hooks(created_in_episode_number);

-- ============================================================================
-- 12. 에피소드 로그 재시도 큐 (트랜잭션 보장) ★
-- ============================================================================
CREATE TABLE episode_log_queue (
    id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
    episode_id UUID NOT NULL REFERENCES episodes(id) ON DELETE CASCADE,
    project_id UUID NOT NULL REFERENCES projects(id) ON DELETE CASCADE,

    -- 큐 상태
    queue_status VARCHAR(20) DEFAULT 'pending' CHECK (queue_status IN (
        'pending',      -- 대기 중
        'processing',   -- 처리 중
        'completed',    -- 완료
        'failed'        -- 최종 실패
    )),

    -- 재시도 정보
    retry_count INT DEFAULT 0,
    max_retries INT DEFAULT 3,
    last_error TEXT,

    -- 처리 시간
    scheduled_at TIMESTAMPTZ DEFAULT NOW(),
    started_at TIMESTAMPTZ,
    completed_at TIMESTAMPTZ,

    -- 처리 워커 ID (동시성 제어)
    worker_id VARCHAR(100),

    created_at TIMESTAMPTZ DEFAULT NOW()
);

CREATE INDEX idx_log_queue_pending ON episode_log_queue(queue_status, scheduled_at)
    WHERE queue_status IN ('pending', 'failed');

-- ============================================================================
-- 13. 사용자 피드백 & 문체 학습 메모리
-- ============================================================================
CREATE TABLE writing_memories (
    id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
    project_id UUID NOT NULL REFERENCES projects(id) ON DELETE CASCADE,
    user_id UUID NOT NULL,

    -- 피드백 유형
    feedback_type VARCHAR(50) NOT NULL CHECK (feedback_type IN (
        'style', 'vocabulary', 'pacing', 'dialogue', 'description', 'structure'
    )),

    -- 학습 데이터
    original_text TEXT,
    edited_text TEXT,

    -- 추출된 패턴 (원자화)
    preference_summary VARCHAR(500),
    avoid_patterns TEXT[] DEFAULT '{}',
    favor_patterns TEXT[] DEFAULT '{}',

    -- 신뢰도
    confidence FLOAT DEFAULT 0.5 CHECK (confidence BETWEEN 0 AND 1),
    applied_count INT DEFAULT 0,

    -- 활성 상태
    is_active BOOLEAN DEFAULT true,

    created_at TIMESTAMPTZ DEFAULT NOW(),
    updated_at TIMESTAMPTZ DEFAULT NOW()
);

CREATE INDEX idx_writing_memories_active ON writing_memories(project_id, is_active, confidence DESC);

-- ============================================================================
-- 14. 프롬프트 템플릿 관리
-- ============================================================================
CREATE TABLE prompt_templates (
    id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
    name VARCHAR(100) NOT NULL,
    purpose VARCHAR(50) CHECK (purpose IN (
        'episode_generation', 'log_compression', 'feedback_analysis',
        'character_simulation', 'hook_detection'
    )),
    template TEXT NOT NULL,
    variables TEXT[] DEFAULT '{}',
    version INT DEFAULT 1,
    is_active BOOLEAN DEFAULT true,
    created_at TIMESTAMPTZ DEFAULT NOW()
);

-- ============================================================================
-- 15. 시스템 설정
-- ============================================================================
CREATE TABLE system_settings (
    id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
    project_id UUID REFERENCES projects(id) ON DELETE CASCADE,

    setting_key VARCHAR(100) NOT NULL,
    setting_value JSONB NOT NULL,

    created_at TIMESTAMPTZ DEFAULT NOW(),
    updated_at TIMESTAMPTZ DEFAULT NOW(),

    UNIQUE(project_id, setting_key)
);

-- ============================================================================
-- 함수: 에피소드 저장 후 자동 로그 큐 등록
-- ============================================================================
CREATE OR REPLACE FUNCTION queue_episode_log_generation()
RETURNS TRIGGER AS $$
BEGIN
    -- 새 에피소드가 생성되면 로그 생성 큐에 등록
    IF TG_OP = 'INSERT' THEN
        INSERT INTO episode_log_queue (episode_id, project_id)
        VALUES (NEW.id, NEW.project_id);
    END IF;
    RETURN NEW;
END;
$$ LANGUAGE plpgsql;

CREATE TRIGGER trigger_queue_episode_log
    AFTER INSERT ON episodes
    FOR EACH ROW
    EXECUTE FUNCTION queue_episode_log_generation();

-- ============================================================================
-- 함수: Fallback 로그 생성 (AI 실패 시 최소한의 로그 생성)
-- ============================================================================
CREATE OR REPLACE FUNCTION create_fallback_episode_log(
    p_episode_id UUID,
    p_project_id UUID,
    p_episode_number INT,
    p_content TEXT
)
RETURNS UUID AS $$
DECLARE
    v_log_id UUID;
    v_last_500 TEXT;
    v_fallback_summary TEXT;
BEGIN
    -- 마지막 500자 추출
    v_last_500 := RIGHT(p_content, 500);

    -- 간단한 Fallback 요약 생성 (첫 200자 + "...")
    v_fallback_summary := LEFT(p_content, 200) || '... [자동 요약 실패 - Fallback 로그]';

    -- Fallback 로그 삽입
    INSERT INTO episode_logs (
        episode_id, project_id, episode_number,
        summary, last_500_chars, is_fallback
    )
    VALUES (
        p_episode_id, p_project_id, p_episode_number,
        v_fallback_summary, v_last_500, true
    )
    RETURNING id INTO v_log_id;

    -- 에피소드 로그 상태 업데이트
    UPDATE episodes
    SET log_status = 'fallback'
    WHERE id = p_episode_id;

    RETURN v_log_id;
END;
$$ LANGUAGE plpgsql;

-- ============================================================================
-- 함수: 슬라이딩 윈도우 컨텍스트 조회
-- ============================================================================
CREATE OR REPLACE FUNCTION get_sliding_window_context(
    p_project_id UUID,
    p_target_episode_number INT,
    p_window_size INT DEFAULT 3
)
RETURNS TABLE (
    episode_number INT,
    summary TEXT,
    last_500_chars TEXT,
    is_fallback BOOLEAN
) AS $$
BEGIN
    RETURN QUERY
    SELECT
        el.episode_number,
        el.summary,
        el.last_500_chars,
        el.is_fallback
    FROM episode_logs el
    WHERE el.project_id = p_project_id
      AND el.episode_number < p_target_episode_number
    ORDER BY el.episode_number DESC
    LIMIT p_window_size;
END;
$$ LANGUAGE plpgsql;

-- ============================================================================
-- 함수: 미해결 떡밥 조회
-- ============================================================================
CREATE OR REPLACE FUNCTION get_unresolved_hooks(
    p_project_id UUID,
    p_limit INT DEFAULT 10
)
RETURNS TABLE (
    id UUID,
    hook_type VARCHAR(50),
    summary VARCHAR(500),
    importance INT,
    created_in_episode_number INT,
    keywords TEXT[]
) AS $$
BEGIN
    RETURN QUERY
    SELECT
        sh.id,
        sh.hook_type,
        sh.summary,
        sh.importance,
        sh.created_in_episode_number,
        sh.keywords
    FROM story_hooks sh
    WHERE sh.project_id = p_project_id
      AND sh.status = 'open'
    ORDER BY sh.importance DESC, sh.created_in_episode_number ASC
    LIMIT p_limit;
END;
$$ LANGUAGE plpgsql;

-- ============================================================================
-- 함수: 캐릭터 장기 기억 검색 (100화에서 1화 조연 검색용)
-- ============================================================================
CREATE OR REPLACE FUNCTION search_character_memories(
    p_project_id UUID,
    p_search_query TEXT,
    p_limit INT DEFAULT 5
)
RETURNS TABLE (
    character_id UUID,
    character_name VARCHAR(100),
    memory_type VARCHAR(50),
    memory_summary VARCHAR(500),
    source_episode_number INT,
    importance INT
) AS $$
BEGIN
    RETURN QUERY
    SELECT
        c.id AS character_id,
        c.name AS character_name,
        cm.memory_type,
        cm.summary AS memory_summary,
        cm.source_episode_number,
        cm.importance
    FROM character_memories cm
    JOIN characters c ON cm.character_id = c.id
    WHERE cm.project_id = p_project_id
      AND (
          cm.summary ILIKE '%' || p_search_query || '%'
          OR p_search_query = ANY(cm.keywords)
          OR c.name ILIKE '%' || p_search_query || '%'
      )
    ORDER BY cm.importance DESC
    LIMIT p_limit;
END;
$$ LANGUAGE plpgsql;

-- ============================================================================
-- Row Level Security (RLS) 기본 설정
-- ============================================================================
ALTER TABLE projects ENABLE ROW LEVEL SECURITY;
ALTER TABLE world_bibles ENABLE ROW LEVEL SECURITY;
ALTER TABLE characters ENABLE ROW LEVEL SECURITY;
ALTER TABLE character_memories ENABLE ROW LEVEL SECURITY;
ALTER TABLE character_relationships ENABLE ROW LEVEL SECURITY;
ALTER TABLE episodes ENABLE ROW LEVEL SECURITY;
ALTER TABLE episode_logs ENABLE ROW LEVEL SECURITY;
ALTER TABLE story_hooks ENABLE ROW LEVEL SECURITY;
ALTER TABLE writing_memories ENABLE ROW LEVEL SECURITY;

-- 프로젝트 소유자만 접근 가능
CREATE POLICY "Users can only access their own projects"
    ON projects FOR ALL
    USING (user_id = auth.uid());

CREATE POLICY "Users can access world_bibles of their projects"
    ON world_bibles FOR ALL
    USING (project_id IN (SELECT id FROM projects WHERE user_id = auth.uid()));

CREATE POLICY "Users can access characters of their projects"
    ON characters FOR ALL
    USING (project_id IN (SELECT id FROM projects WHERE user_id = auth.uid()));

CREATE POLICY "Users can access episodes of their projects"
    ON episodes FOR ALL
    USING (project_id IN (SELECT id FROM projects WHERE user_id = auth.uid()));

CREATE POLICY "Users can access episode_logs of their projects"
    ON episode_logs FOR ALL
    USING (project_id IN (SELECT id FROM projects WHERE user_id = auth.uid()));

CREATE POLICY "Users can access story_hooks of their projects"
    ON story_hooks FOR ALL
    USING (project_id IN (SELECT id FROM projects WHERE user_id = auth.uid()));

CREATE POLICY "Users can access writing_memories of their projects"
    ON writing_memories FOR ALL
    USING (project_id IN (SELECT id FROM projects WHERE user_id = auth.uid()));

CREATE POLICY "Users can access character_memories of their projects"
    ON character_memories FOR ALL
    USING (project_id IN (SELECT id FROM projects WHERE user_id = auth.uid()));

CREATE POLICY "Users can access character_relationships of their projects"
    ON character_relationships FOR ALL
    USING (project_id IN (SELECT id FROM projects WHERE user_id = auth.uid()));
