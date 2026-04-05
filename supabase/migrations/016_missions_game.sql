-- Missions game table
-- Run this in the Supabase SQL Editor before using the /missions endpoints.

CREATE TABLE IF NOT EXISTS missions (
  id                UUID        PRIMARY KEY DEFAULT gen_random_uuid(),
  agent_id          UUID        REFERENCES agents(id) ON DELETE CASCADE,
  level             INTEGER     NOT NULL DEFAULT 1,
  score             INTEGER     NOT NULL DEFAULT 0,
  status            TEXT        NOT NULL DEFAULT 'playing',
  game_state        JSONB,
  attempts_today    INTEGER     NOT NULL DEFAULT 0,
  last_attempt_date DATE,
  created_at        TIMESTAMPTZ NOT NULL DEFAULT now()
);

CREATE INDEX IF NOT EXISTS idx_missions_agent_created
  ON missions (agent_id, created_at DESC);
