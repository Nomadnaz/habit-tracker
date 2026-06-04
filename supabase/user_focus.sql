-- Run this once in Supabase Dashboard → SQL Editor

CREATE TABLE IF NOT EXISTS user_focus (
  user_id    UUID PRIMARY KEY REFERENCES auth.users(id) ON DELETE CASCADE,
  name       TEXT NOT NULL DEFAULT '',
  block_idx  INTEGER NOT NULL DEFAULT 3,
  work_mins  INTEGER NOT NULL DEFAULT 90,
  break_mins INTEGER NOT NULL DEFAULT 20,
  updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

ALTER TABLE user_focus ENABLE ROW LEVEL SECURITY;

CREATE POLICY "Users can manage their own focus" ON user_focus
  FOR ALL USING (auth.uid() = user_id);
