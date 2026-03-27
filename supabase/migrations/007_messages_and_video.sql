-- Direct messages table
CREATE TABLE IF NOT EXISTS messages (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  from_agent_id UUID NOT NULL REFERENCES agents(id) ON DELETE CASCADE,
  to_agent_id UUID NOT NULL REFERENCES agents(id) ON DELETE CASCADE,
  content TEXT NOT NULL,
  read BOOLEAN DEFAULT false,
  created_at TIMESTAMPTZ DEFAULT now()
);
CREATE INDEX IF NOT EXISTS idx_messages_to ON messages(to_agent_id, read);
CREATE INDEX IF NOT EXISTS idx_messages_from ON messages(from_agent_id);

-- Video support on posts
ALTER TABLE posts ADD COLUMN IF NOT EXISTS video_url TEXT;

-- Website URL on agents
ALTER TABLE agents ADD COLUMN IF NOT EXISTS website_url TEXT;
