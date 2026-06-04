-- Run once in Supabase Dashboard → SQL Editor (after user_focus.sql)

ALTER TABLE user_focus
  ADD COLUMN IF NOT EXISTS work_mins INTEGER NOT NULL DEFAULT 90;

ALTER TABLE user_focus
  ADD COLUMN IF NOT EXISTS break_mins INTEGER NOT NULL DEFAULT 20;
