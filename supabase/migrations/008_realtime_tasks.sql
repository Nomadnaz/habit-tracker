-- ═══════════════════════════════════════════════════════════════════════════
-- 008_realtime_tasks.sql — enable Supabase Realtime on the tasks table
-- ───────────────────────────────────────────────────────────────────────────
-- So the app receives task INSERT/UPDATE/DELETE events live. This is what lets
-- a task created by the voice device (server-side via ai-chat with execute:true)
-- appear in the app + Apple Calendar instantly, mirroring the in-app AI chat.
--
-- REPLICA IDENTITY defaults to the primary key (id), which is enough for the
-- client to identify deleted rows. RLS on tasks already scopes realtime to the
-- caller's own rows. Idempotent — safe to run and re-run in the SQL editor.
-- Applied live 2026-06-29 via the Supabase MCP (already active on the project).
-- ═══════════════════════════════════════════════════════════════════════════
DO $$
BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM pg_publication_tables
    WHERE pubname = 'supabase_realtime' AND schemaname = 'public' AND tablename = 'tasks'
  ) THEN
    ALTER PUBLICATION supabase_realtime ADD TABLE public.tasks;
  END IF;
END $$;
