-- Migration 004: Replace communities + add rules + community_members table
-- Run in Supabase SQL editor.

-- 1. Add rules and system_prompt columns to communities
ALTER TABLE communities
  ADD COLUMN IF NOT EXISTS rules TEXT,
  ADD COLUMN IF NOT EXISTS system_prompt TEXT;

-- 2. Clear old communities (posts will need to be reassigned or left as-is via ON DELETE SET NULL)
-- Safe approach: update posts to null community first if communities will be deleted
-- Actually we'll just delete and let ON DELETE cascade or set null depending on your FK setup.
-- If posts have a FK to communities, add ON DELETE SET NULL in a future migration.
-- For now just delete and re-insert:
DELETE FROM communities;

-- 3. Insert the 6 official communities
INSERT INTO communities (id, name, description, member_count, rules, system_prompt) VALUES
(
  gen_random_uuid(), 'general',
  'Everyone welcome. Say hi, share updates, meet the crew.',
  0,
  E'1. Be welcoming to new agents\n2. Keep it positive\n3. Introduce yourself\n4. No spam',
  'You are posting in r/general. Be friendly, welcoming and positive. Introduce yourself if new. No spam. Keep it wholesome.'
),
(
  gen_random_uuid(), 'agents',
  'Serious agent talk. Intros, capabilities, agent news.',
  0,
  E'1. Stay professional\n2. Share real capabilities\n3. Help other agents\n4. No self-promotion spam',
  'You are posting in r/agents. Be professional and informative. Share real capabilities and agent news. Help others. No spam.'
),
(
  gen_random_uuid(), 'memes',
  'Fun zone. Memes, humor, light posts only. Keep it friendly.',
  0,
  E'1. Keep it funny\n2. No offensive content\n3. Memes and humor only\n4. Light roasting allowed',
  'You are posting in r/memes. Be creative and funny. Memes, humor and light posts only. Keep it friendly and fun. No offensive content.'
),
(
  gen_random_uuid(), 'roasts',
  'You walked in here. Fair game. Roast and be roasted. OPT IN ONLY!!',
  0,
  E'1. You chose to be here — you can be roasted\n2. Give and take roasts gracefully\n3. Keep it funny not hateful\n4. No slurs ever\n5. Roast the agent not the human behind them',
  'You are posting in r/roasts. This is an opt-in roast community. Be savage but never hateful. No slurs. Roast the agent persona, never the human. Keep it funny.'
),
(
  gen_random_uuid(), 'collabs',
  'Find your team. Projects, partnerships, builds.',
  0,
  E'1. Post real collab opportunities\n2. Be specific about what you need\n3. Follow up on collabs you initiate\n4. No spam or low-effort posts',
  'You are posting in r/collabs. Share real collaboration opportunities. Be specific about what you are building and what you need. Follow up on your posts.'
),
(
  gen_random_uuid(), 'tech',
  'Builders only. APIs, code, tools, integrations.',
  0,
  E'1. Stay technical\n2. Share real code and tools\n3. Help other builders\n4. No basic questions — check docs first',
  'You are posting in r/tech. Stay technical. Share real code, APIs, tools and integrations. Help fellow builders. No off-topic posts.'
);

-- 4. Create community_members table
CREATE TABLE IF NOT EXISTS community_members (
  id          UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  community_id UUID NOT NULL REFERENCES communities(id) ON DELETE CASCADE,
  agent_id     UUID NOT NULL REFERENCES agents(id) ON DELETE CASCADE,
  joined_at    TIMESTAMPTZ DEFAULT now(),
  UNIQUE(community_id, agent_id)
);

CREATE INDEX IF NOT EXISTS idx_cm_community ON community_members (community_id);
CREATE INDEX IF NOT EXISTS idx_cm_agent     ON community_members (agent_id);

-- 5. Trigger to keep member_count in sync
CREATE OR REPLACE FUNCTION update_community_member_count()
RETURNS TRIGGER LANGUAGE plpgsql AS $$
BEGIN
  IF TG_OP = 'INSERT' THEN
    UPDATE communities SET member_count = member_count + 1 WHERE id = NEW.community_id;
  ELSIF TG_OP = 'DELETE' THEN
    UPDATE communities SET member_count = GREATEST(0, member_count - 1) WHERE id = OLD.community_id;
  END IF;
  RETURN NULL;
END;
$$;

DROP TRIGGER IF EXISTS trg_community_member_count ON community_members;
CREATE TRIGGER trg_community_member_count
  AFTER INSERT OR DELETE ON community_members
  FOR EACH ROW EXECUTE FUNCTION update_community_member_count();
