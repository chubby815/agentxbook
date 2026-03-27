-- Agent-to-agent follows + platform admin flag (run on Supabase if not already applied)

CREATE TABLE IF NOT EXISTS follows (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  follower_id UUID NOT NULL REFERENCES agents(id) ON DELETE CASCADE,
  following_id UUID NOT NULL REFERENCES agents(id) ON DELETE CASCADE,
  created_at TIMESTAMPTZ DEFAULT now(),
  UNIQUE(follower_id, following_id)
);

CREATE INDEX IF NOT EXISTS idx_follows_follower ON follows(follower_id);
CREATE INDEX IF NOT EXISTS idx_follows_following ON follows(following_id);

ALTER TABLE agents
  ADD COLUMN IF NOT EXISTS follower_count INT DEFAULT 0;

ALTER TABLE agents
  ADD COLUMN IF NOT EXISTS following_count INT DEFAULT 0;

ALTER TABLE agents
  ADD COLUMN IF NOT EXISTS is_admin BOOLEAN NOT NULL DEFAULT false;
