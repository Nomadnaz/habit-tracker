-- ═══════════════════════════════════════════════════════════════════════════
-- 021_library.sql  —  Library domain (task 064), manual entry only
--
-- books, movies, saved_links, ideas. reading_stats/movie_stats (aggregate
-- rollups) are NOT created here — no screen needs them yet and they'd be
-- derivable client-side from the base tables when something does.
-- google_books_id/tmdb_id columns exist per database.md's schema but are
-- never populated by this session's build (no API keys — see tasks/064 notes).
--
-- Every table: user_id + RLS `user_id = auth.uid()` (canonical rule, database.md).
-- Idempotent — safe to re-run.
-- ═══════════════════════════════════════════════════════════════════════════

CREATE TABLE IF NOT EXISTS books (
  id              TEXT        PRIMARY KEY,
  user_id         UUID        NOT NULL REFERENCES auth.users(id) ON DELETE CASCADE,
  google_books_id TEXT,
  title           TEXT        NOT NULL,
  author          TEXT,
  cover_url       TEXT,
  total_pages     INT,
  current_page    INT         NOT NULL DEFAULT 0,
  status          TEXT        NOT NULL DEFAULT 'to_read',  -- 'to_read' | 'reading' | 'finished'
  started_at      TIMESTAMPTZ,
  finished_at     TIMESTAMPTZ,
  created_at      TIMESTAMPTZ NOT NULL DEFAULT NOW()
);
ALTER TABLE books ENABLE ROW LEVEL SECURITY;
DROP POLICY IF EXISTS "own books" ON books;
CREATE POLICY "own books" ON books FOR ALL
  USING (auth.uid() = user_id) WITH CHECK (auth.uid() = user_id);

CREATE TABLE IF NOT EXISTS movies (
  id            TEXT        PRIMARY KEY,
  user_id       UUID        NOT NULL REFERENCES auth.users(id) ON DELETE CASCADE,
  tmdb_id       TEXT,
  title         TEXT        NOT NULL,
  director      TEXT,
  year          INT,
  status        TEXT        NOT NULL DEFAULT 'to_watch',  -- 'to_watch' | 'watched'
  rating        INT,        -- 1-5, optional
  date_watched  TEXT,
  notes         TEXT,
  created_at    TIMESTAMPTZ NOT NULL DEFAULT NOW()
);
ALTER TABLE movies ENABLE ROW LEVEL SECURITY;
DROP POLICY IF EXISTS "own movies" ON movies;
CREATE POLICY "own movies" ON movies FOR ALL
  USING (auth.uid() = user_id) WITH CHECK (auth.uid() = user_id);

CREATE TABLE IF NOT EXISTS saved_links (
  id          TEXT        PRIMARY KEY,
  user_id     UUID        NOT NULL REFERENCES auth.users(id) ON DELETE CASCADE,
  url         TEXT        NOT NULL,
  title       TEXT,
  domain      TEXT,
  tags        TEXT[]      NOT NULL DEFAULT '{}',
  notes       TEXT,
  created_at  TIMESTAMPTZ NOT NULL DEFAULT NOW()
);
ALTER TABLE saved_links ENABLE ROW LEVEL SECURITY;
DROP POLICY IF EXISTS "own saved links" ON saved_links;
CREATE POLICY "own saved links" ON saved_links FOR ALL
  USING (auth.uid() = user_id) WITH CHECK (auth.uid() = user_id);

CREATE TABLE IF NOT EXISTS ideas (
  id          TEXT        PRIMARY KEY,
  user_id     UUID        NOT NULL REFERENCES auth.users(id) ON DELETE CASCADE,
  content     TEXT        NOT NULL,
  tags        TEXT[]      NOT NULL DEFAULT '{}',
  created_at  TIMESTAMPTZ NOT NULL DEFAULT NOW()
);
ALTER TABLE ideas ENABLE ROW LEVEL SECURITY;
DROP POLICY IF EXISTS "own ideas" ON ideas;
CREATE POLICY "own ideas" ON ideas FOR ALL
  USING (auth.uid() = user_id) WITH CHECK (auth.uid() = user_id);
