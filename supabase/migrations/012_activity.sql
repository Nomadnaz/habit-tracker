-- ═══════════════════════════════════════════════════════════════════════════
-- 012_activity.sql  —  Activity domain: hike/run/walk (task 031)
--
-- Adds exactly the two tables task 031 scopes: activities, activity_stats_cumulative.
-- trail_database/trail_ratings/trail_collections are explicitly held back
-- (community feature, task 067-adjacent territory) — not created here.
-- No PostGIS needed yet: route_geojson is a plain jsonb GeoJSON LineString,
-- not a geography column — that upgrade arrives only with the trail database.
--
-- Every table: user_id + RLS `user_id = auth.uid()` (canonical rule, database.md).
-- Idempotent (CREATE ... IF NOT EXISTS / DROP POLICY IF EXISTS) — safe to re-run.
-- ═══════════════════════════════════════════════════════════════════════════

-- ── activities ───────────────────────────────────────────────────────────────
CREATE TABLE IF NOT EXISTS activities (
  id                 TEXT        PRIMARY KEY,
  user_id            UUID        NOT NULL REFERENCES auth.users(id) ON DELETE CASCADE,
  type               TEXT        NOT NULL,  -- 'hike' | 'run' | 'walk'
  start_time         TIMESTAMPTZ NOT NULL,
  end_time           TIMESTAMPTZ NOT NULL,
  duration_secs      INT         NOT NULL DEFAULT 0,
  distance_m         NUMERIC     NOT NULL DEFAULT 0,
  avg_pace_per_km    NUMERIC,                 -- seconds per km
  elevation_gain_m   NUMERIC     NOT NULL DEFAULT 0,
  route_geojson      JSONB,                   -- GeoJSON LineString, [lng, lat] pairs
  notes              TEXT,
  created_at         TIMESTAMPTZ NOT NULL DEFAULT NOW()
);
ALTER TABLE activities ENABLE ROW LEVEL SECURITY;
DROP POLICY IF EXISTS "own activities" ON activities;
CREATE POLICY "own activities" ON activities FOR ALL
  USING (auth.uid() = user_id) WITH CHECK (auth.uid() = user_id);
CREATE INDEX IF NOT EXISTS idx_activities_user_start ON activities (user_id, start_time DESC);

-- ── activity_stats_cumulative ────────────────────────────────────────────────
-- One row per user. Incremented after each saved activity (lib/activity-data.ts).
CREATE TABLE IF NOT EXISTS activity_stats_cumulative (
  user_id                   UUID        PRIMARY KEY REFERENCES auth.users(id) ON DELETE CASCADE,
  total_hike_distance_m     NUMERIC     NOT NULL DEFAULT 0,
  total_run_distance_m      NUMERIC     NOT NULL DEFAULT 0,
  total_walk_distance_m     NUMERIC     NOT NULL DEFAULT 0,
  total_elevation_gain_m    NUMERIC     NOT NULL DEFAULT 0,
  total_activity_time_secs  INT         NOT NULL DEFAULT 0,
  last_updated              TIMESTAMPTZ NOT NULL DEFAULT NOW()
);
ALTER TABLE activity_stats_cumulative ENABLE ROW LEVEL SECURITY;
DROP POLICY IF EXISTS "own activity stats" ON activity_stats_cumulative;
CREATE POLICY "own activity stats" ON activity_stats_cumulative FOR ALL
  USING (auth.uid() = user_id) WITH CHECK (auth.uid() = user_id);
