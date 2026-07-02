-- ============================================================
-- Prodify: User Isolation Migration
-- ============================================================
-- Run this in your Supabase SQL Editor (Dashboard > SQL Editor)
-- ============================================================

-- ============================================================
-- PART 1: Add user_id columns as UUID references to auth.users
-- ============================================================

-- Workspaces table
ALTER TABLE workspaces
  ADD COLUMN IF NOT EXISTS auth_user_id UUID REFERENCES auth.users(id) ON DELETE CASCADE;

-- Sessions table
ALTER TABLE sessions
  ADD COLUMN IF NOT EXISTS auth_user_id UUID REFERENCES auth.users(id) ON DELETE CASCADE;

-- Telemetry logs table
ALTER TABLE telemetry_logs
  ADD COLUMN IF NOT EXISTS auth_user_id UUID REFERENCES auth.users(id) ON DELETE CASCADE;

-- ============================================================
-- PART 2: Backfill existing rows with a default (optional)
-- For existing production data, assign to first Supabase user
-- ============================================================
-- Uncomment and adjust if you have existing data to migrate:
-- UPDATE workspaces SET auth_user_id = (SELECT id FROM auth.users LIMIT 1) WHERE auth_user_id IS NULL;
-- UPDATE sessions SET auth_user_id = (SELECT id FROM auth.users LIMIT 1) WHERE auth_user_id IS NULL;
-- UPDATE telemetry_logs SET auth_user_id = (SELECT id FROM auth.users LIMIT 1) WHERE auth_user_id IS NULL;

-- ============================================================
-- PART 3: Make auth_user_id NOT NULL after backfill
-- ============================================================
ALTER TABLE workspaces
  ALTER COLUMN auth_user_id SET NOT NULL;

ALTER TABLE sessions
  ALTER COLUMN auth_user_id SET NOT NULL;

ALTER TABLE telemetry_logs
  ALTER COLUMN auth_user_id SET NOT NULL;

-- ============================================================
-- PART 4: Create indexes for performance
-- ============================================================
CREATE INDEX IF NOT EXISTS idx_workspaces_auth_user_id ON workspaces(auth_user_id);
CREATE INDEX IF NOT EXISTS idx_sessions_auth_user_id ON sessions(auth_user_id);
CREATE INDEX IF NOT EXISTS idx_telemetry_logs_auth_user_id ON telemetry_logs(auth_user_id);

-- ============================================================
-- PART 5: Enable Row Level Security (RLS)
-- ============================================================
ALTER TABLE workspaces ENABLE ROW LEVEL SECURITY;
ALTER TABLE sessions ENABLE ROW LEVEL SECURITY;
ALTER TABLE telemetry_logs ENABLE ROW LEVEL SECURITY;

-- ============================================================
-- PART 6: Create RLS policies
-- Users can only SELECT, INSERT, UPDATE, DELETE their own rows
-- ============================================================

-- --- Workspaces ---
CREATE POLICY "Users can view their own workspaces"
  ON workspaces FOR SELECT
  USING (auth_user_id = auth.uid());

CREATE POLICY "Users can create their own workspaces"
  ON workspaces FOR INSERT
  WITH CHECK (auth_user_id = auth.uid());

CREATE POLICY "Users can update their own workspaces"
  ON workspaces FOR UPDATE
  USING (auth_user_id = auth.uid())
  WITH CHECK (auth_user_id = auth.uid());

CREATE POLICY "Users can delete their own workspaces"
  ON workspaces FOR DELETE
  USING (auth_user_id = auth.uid());

-- --- Sessions ---
CREATE POLICY "Users can view their own sessions"
  ON sessions FOR SELECT
  USING (auth_user_id = auth.uid());

CREATE POLICY "Users can create their own sessions"
  ON sessions FOR INSERT
  WITH CHECK (auth_user_id = auth.uid());

CREATE POLICY "Users can update their own sessions"
  ON sessions FOR UPDATE
  USING (auth_user_id = auth.uid())
  WITH CHECK (auth_user_id = auth.uid());

CREATE POLICY "Users can delete their own sessions"
  ON sessions FOR DELETE
  USING (auth_user_id = auth.uid());

-- --- Telemetry Logs ---
CREATE POLICY "Users can view their own telemetry logs"
  ON telemetry_logs FOR SELECT
  USING (auth_user_id = auth.uid());

CREATE POLICY "Users can create their own telemetry logs"
  ON telemetry_logs FOR INSERT
  WITH CHECK (auth_user_id = auth.uid());

CREATE POLICY "Users can update their own telemetry logs"
  ON telemetry_logs FOR UPDATE
  USING (auth_user_id = auth.uid())
  WITH CHECK (auth_user_id = auth.uid());

CREATE POLICY "Users can delete their own telemetry logs"
  ON telemetry_logs FOR DELETE
  USING (auth_user_id = auth.uid());

-- ============================================================
-- PART 7: Revoke default public access (defense in depth)
-- ============================================================
-- By default, Supabase anon key has no table access; these
-- policies explicitly lock down to auth.uid() only.
-- 
-- Verify with: SELECT * FROM pg_policies WHERE tablename IN ('workspaces', 'sessions', 'telemetry_logs');