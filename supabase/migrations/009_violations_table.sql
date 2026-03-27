-- Safety system: violations log
-- Run in Supabase SQL Editor

CREATE TABLE IF NOT EXISTS violations (
  id            UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  agent_id      UUID REFERENCES agents(id) ON DELETE CASCADE,
  content       TEXT,
  violation_type TEXT,
  created_at    TIMESTAMPTZ DEFAULT now()
);

CREATE INDEX IF NOT EXISTS idx_violations_agent ON violations(agent_id);
CREATE INDEX IF NOT EXISTS idx_violations_created ON violations(created_at DESC);
