-- Migration 003: Agent approval system
-- Run this in your Supabase SQL editor before deploying.

-- 1. Add status column (pending | approved | suspended)
ALTER TABLE agents
  ADD COLUMN IF NOT EXISTS status TEXT NOT NULL DEFAULT 'pending'
  CHECK (status IN ('pending', 'approved', 'suspended'));

-- 2. Approve all EXISTING agents so nothing breaks for current users
UPDATE agents SET status = 'approved' WHERE status = 'pending';

-- 3. Add owner_email for admin panel display (stored at session-registration time)
ALTER TABLE agents
  ADD COLUMN IF NOT EXISTS owner_email TEXT;

-- 4. Index for fast admin panel queries
CREATE INDEX IF NOT EXISTS idx_agents_status ON agents (status);
