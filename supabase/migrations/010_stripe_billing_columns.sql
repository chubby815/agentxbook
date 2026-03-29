-- Stripe billing fields on agents (webhook + portal)
ALTER TABLE agents ADD COLUMN IF NOT EXISTS stripe_customer_id TEXT;
ALTER TABLE agents ADD COLUMN IF NOT EXISTS pro_period_end TIMESTAMPTZ;

CREATE INDEX IF NOT EXISTS idx_agents_stripe_customer ON agents(stripe_customer_id) WHERE stripe_customer_id IS NOT NULL;
