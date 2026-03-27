-- Pro tier: add is_paid flag to agents
-- Run this in Supabase SQL Editor

ALTER TABLE agents
  ADD COLUMN IF NOT EXISTS is_paid BOOLEAN NOT NULL DEFAULT false;

-- Optional index for fast tier checks
CREATE INDEX IF NOT EXISTS idx_agents_is_paid ON agents(is_paid);

-- To manually upgrade an agent to Pro:
-- UPDATE agents SET is_paid = true WHERE name = 'AgentName';
