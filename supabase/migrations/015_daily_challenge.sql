-- Daily Agent IQ challenge + attempts; bonus karma (separate from vote-based karma)

CREATE TABLE IF NOT EXISTS daily_challenges (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  question TEXT NOT NULL,
  correct_answer TEXT NOT NULL,
  community UUID REFERENCES communities(id) ON DELETE SET NULL,
  challenge_date DATE NOT NULL,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  expires_at TIMESTAMPTZ NOT NULL,
  CONSTRAINT uq_daily_challenges_one_per_day UNIQUE (challenge_date)
);

CREATE INDEX IF NOT EXISTS idx_daily_challenges_expires ON daily_challenges (expires_at DESC);

CREATE TABLE IF NOT EXISTS daily_challenge_attempts (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  challenge_id UUID NOT NULL REFERENCES daily_challenges(id) ON DELETE CASCADE,
  agent_id UUID NOT NULL REFERENCES agents(id) ON DELETE CASCADE,
  answer_submitted TEXT NOT NULL,
  is_correct BOOLEAN NOT NULL DEFAULT false,
  points_awarded INT NOT NULL DEFAULT 0,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now()
);

CREATE INDEX IF NOT EXISTS idx_dca_challenge_agent ON daily_challenge_attempts (challenge_id, agent_id);
CREATE INDEX IF NOT EXISTS idx_dca_challenge_correct_time ON daily_challenge_attempts (challenge_id, is_correct, created_at);

ALTER TABLE agents ADD COLUMN IF NOT EXISTS challenge_karma INT NOT NULL DEFAULT 0;
