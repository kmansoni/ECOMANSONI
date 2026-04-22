-- ============================================================
-- ARIA Memory & Feedback System
-- Enables long-term memory, orchestrator intent tracking,
-- and user feedback collection for learning loop.
-- ============================================================

-- Enable pgvector extension (idempotent)
CREATE EXTENSION IF NOT EXISTS vector;

-- ─────────────────────────────────────────────────────────────
-- Table: aria_memories
-- Stores semantic memories about each user, extracted from
-- conversations. Embeddings enable similarity-based retrieval.
-- ─────────────────────────────────────────────────────────────
CREATE TABLE IF NOT EXISTS aria_memories (
  id              UUID        DEFAULT gen_random_uuid() PRIMARY KEY,
  user_id         UUID        NOT NULL REFERENCES auth.users(id) ON DELETE CASCADE,
  content         TEXT        NOT NULL,        -- The memory fact ("User prefers TypeScript")
  embedding       vector(1536),                -- text-embedding-3-small dimensions
  topic           TEXT,                        -- 'code'|'security'|'data'|'writing'|'personal'|'preference'
  importance      FLOAT       DEFAULT 0.5,     -- 0.0-1.0; boosted by positive feedback
  access_count    INT         DEFAULT 0,       -- how many times this memory was retrieved
  last_accessed_at TIMESTAMPTZ,
  created_at      TIMESTAMPTZ DEFAULT NOW(),
  metadata        JSONB       DEFAULT '{}'     -- reserved for future tags/source info
);

ALTER TABLE aria_memories ENABLE ROW LEVEL SECURITY;

-- ALLOW_NON_IDEMPOTENT_POLICY_DDL: new table, policy cannot exist before this migration
DROP POLICY IF EXISTS "aria_memories_own" ON aria_memories;
CREATE POLICY "aria_memories_own"
  ON aria_memories FOR ALL TO authenticated
  USING (user_id = auth.uid());

-- User lookup index
CREATE INDEX IF NOT EXISTS aria_memories_user_idx
  ON aria_memories(user_id);

-- Timestamp index for recency queries
CREATE INDEX IF NOT EXISTS aria_memories_created_idx
  ON aria_memories(user_id, created_at DESC);

-- IVFFlat vector index for fast approximate nearest-neighbour search.
-- lists=100 is suitable for up to ~1M rows; raise to 200 for larger sets.
CREATE INDEX IF NOT EXISTS aria_memories_embedding_idx
  ON aria_memories USING ivfflat (embedding vector_cosine_ops)
  WITH (lists = 100);

-- ─────────────────────────────────────────────────────────────
-- Table: ai_feedback
-- Stores thumbs-up / thumbs-down ratings on ARIA responses.
-- Used to boost memory importance and for future RLHF batches.
-- ─────────────────────────────────────────────────────────────
CREATE TABLE IF NOT EXISTS ai_feedback (
  id               UUID        DEFAULT gen_random_uuid() PRIMARY KEY,
  user_id          UUID        NOT NULL REFERENCES auth.users(id) ON DELETE CASCADE,
  conversation_id  TEXT,                         -- groups messages in a session
  assistant_msg_id TEXT        NOT NULL,          -- client-side message UUID
  rating           SMALLINT    NOT NULL CHECK (rating IN (-1, 1)),  -- 1=helpful, -1=not
  intent           TEXT,                          -- orchestrator intent at time of response
  model_used       TEXT,                          -- which model generated the response
  created_at       TIMESTAMPTZ DEFAULT NOW()
);

ALTER TABLE ai_feedback ENABLE ROW LEVEL SECURITY;

-- ALLOW_NON_IDEMPOTENT_POLICY_DDL: new table, policy cannot exist before this migration
DROP POLICY IF EXISTS "ai_feedback_own" ON ai_feedback;
CREATE POLICY "ai_feedback_own"
  ON ai_feedback FOR ALL TO authenticated
  USING (user_id = auth.uid());

CREATE INDEX IF NOT EXISTS ai_feedback_user_idx
  ON ai_feedback(user_id, created_at DESC);

CREATE INDEX IF NOT EXISTS ai_feedback_conversation_idx
  ON ai_feedback(conversation_id) WHERE conversation_id IS NOT NULL;

-- ─────────────────────────────────────────────────────────────
-- RPC: search_aria_memories
-- Similarity search for memories using cosine distance.
-- importance weight * similarity = final ranking score.
-- ─────────────────────────────────────────────────────────────
CREATE OR REPLACE FUNCTION search_aria_memories(
  p_user_id   UUID,
  p_embedding vector(1536),
  p_limit     INT   DEFAULT 5,
  p_threshold FLOAT DEFAULT 0.65
)
RETURNS TABLE (
  id          UUID,
  content     TEXT,
  topic       TEXT,
  importance  FLOAT,
  similarity  FLOAT
)
LANGUAGE SQL
STABLE
SECURITY DEFINER
SET search_path = public
AS $$
  SELECT
    m.id,
    m.content,
    m.topic,
    m.importance,
    1 - (m.embedding <=> p_embedding) AS similarity
  FROM aria_memories m
  WHERE
    m.user_id = p_user_id
    AND m.embedding IS NOT NULL
    AND 1 - (m.embedding <=> p_embedding) >= p_threshold
  ORDER BY
    (m.importance * (1 - (m.embedding <=> p_embedding))) DESC
  LIMIT p_limit;
$$;

-- ─────────────────────────────────────────────────────────────
-- RPC: boost_memory_importance
-- Called when user gives thumbs-up on a response that used
-- a memory — increases its importance for future retrieval.
-- ─────────────────────────────────────────────────────────────
CREATE OR REPLACE FUNCTION boost_memory_importance(
  p_memory_ids UUID[],
  p_delta      FLOAT DEFAULT 0.1
)
RETURNS VOID
LANGUAGE SQL
SECURITY DEFINER
SET search_path = public
AS $$
  UPDATE aria_memories
  SET
    importance       = LEAST(1.0, importance + p_delta),
    access_count     = access_count + 1,
    last_accessed_at = NOW()
  WHERE
    id = ANY(p_memory_ids)
    AND user_id = auth.uid();
$$;

-- ─────────────────────────────────────────────────────────────
-- Extend ai_chat_messages with orchestrator metadata
-- (idempotent — safe to run multiple times)
-- ─────────────────────────────────────────────────────────────
ALTER TABLE ai_chat_messages
  ADD COLUMN IF NOT EXISTS intent           TEXT,        -- 'code'|'security'|'data_analysis'|'writing'|'general'
  ADD COLUMN IF NOT EXISTS backend_used     TEXT,        -- 'external'|'python'|'builtin'
  ADD COLUMN IF NOT EXISTS conversation_id_v2 TEXT;      -- client-side UUID grouping messages

CREATE INDEX IF NOT EXISTS ai_chat_messages_conv_v2_idx
  ON ai_chat_messages(conversation_id_v2) WHERE conversation_id_v2 IS NOT NULL;