# database.md — habit-tracker
> Canonical schema reference. Authority: system-model.md > architecture.md (not yet written) > this file > habit-tracker-master-spec.md (not in this repo — kept in Downloads as human reference).
> All tables: `user_id uuid references auth.users` + RLS policy `user_id = auth.uid()`, unless noted otherwise.
> Edge Functions run with the service-role key and BYPASS RLS — `journal_entries` and `therapy_notes` are client-side encrypted as a result (see Mental Health domain below). RLS alone is not a privacy guarantee for those two tables.

---

## EXISTING SCHEMA — WHAT'S ALREADY LIVE (reconcile, don't duplicate)

These tables exist today in `supabase/` (loose `.sql` files, no migrations folder yet — see `tasks/002`).
Resolve overlaps with the proposed schema below in `tasks/005` before writing new gym/body tables.

```
tasks (id, user_id, date, label, done, created_at)             -- AsyncStorage-primary, date format mid-migration (tasks/003-004)
user_focus (user_id, name, block_idx)
exercises (id, user_id, name, muscle_groups[], created_at)     -- matches proposed schema already
workout_templates (...)                                         -- proposed schema has no direct equivalent — reconcile
workout_exercises (...)                                          -- likely maps to workouts.exercises[] jsonb
workout_done_log (...)                                           -- likely maps to workouts (one row per completed session)
pb_log (...)                                                     -- maps to proposed personal_bests
body_weight_logs (...)                                           -- maps to proposed body_logs.weight_kg
water_logs (...)                                                 -- maps to proposed body_logs.water_ml
```

**Decision (tasks/005): extend the existing tables additively. Do not introduce parallel spec-named tables (`workouts`, `personal_bests`, `body_logs`).**

Rationale:
1. The existing schema is already wired to working screens (`gym.tsx`, `workouts.tsx`, `workout-detail.tsx`, the body screens). Replacing it would be pure churn with no user-facing benefit.
2. The existing relational design is, in places, *better* than the spec's flattened version — `workout_exercises` (a real junction table) and `workout_done_log`/`pb_log` (one row per logged event) preserve queryability that the spec's `workouts.exercises[]` jsonb blob would lose. Granular `water_logs`/`body_weight_logs` (multiple entries/day) also fit the spec's own UI description ("tap to log cups/ml") better than a single `body_logs` row per day would.
3. Where the spec needs fields the existing tables lack, add them as new columns — never replace the table.

Concrete mapping (see `supabase/migrations/003_gym_body_reconcile.sql`, drafted by tasks/005):
| Spec concept | Lives in (after 003) |
|---|---|
| `workouts` (session log: duration, GPS check-in, HR, calories, notes) | `workout_done_log`, extended with those columns — name unchanged, code unchanged |
| `personal_bests` (weight_kg + reps) | `pb_log`, extended with `reps` |
| `gym_plan` (PPL day planner) | new table, no existing equivalent — added as-is |
| `body_logs` (weight/water/steps/vitamins/notes, one row/day) | **not introduced** — stays split across `body_weight_logs`/`water_logs`; steps/vitamins/notes deferred to tasks/034 (Body page hub) as new columns on those tables if/when a screen needs them |
| `exercises` | already matches, used as-is |

---

## PROPOSED SCHEMA — BY DOMAIN

### Core user / AI plumbing (tasks/006)
```sql
user_profiles (user_id, username, bio, photo_url, name, age, sex, height_cm, weight_kg,
               goal_weight_kg, profile_visibility, joined_at, display_cards[], featured_badges[],
               ranking_opted_in, dietary_preferences[], allergies[], subscription_tier,
               onboarding_complete, gym_lat, gym_lng)
briefing_preferences (user_id, selected_modules[], notification_time)
companion_messages (id, user_id, companion_type, role, content, actions_json,
                    model_used, tokens_in, tokens_out, created_at)
api_usage (user_id, date, message_count, tokens_in, tokens_out, last_message_at)
oauth_tokens (id, user_id, provider, access_token, refresh_token, scope,
              expires_at, connected_at, last_used_at)   -- THE ONLY home for any integration's tokens
companions (id, user_id, type, name, photo_url, created_at)
companion_personas (user_id, companion_type, name, photo_url, personality_preset,
                    communication_style, custom_tone_example, backstory,
                    relationship_dynamic, user_nickname, language, created_at)
user_context_summary (user_id pk, profile_md, assistant_notes_md,
                      profile_updated_at, notes_updated_at, updated_at)   -- one row/user, hot path
```

### Habits + Medication (tasks/022, 024)
```sql
habits (id, user_id, name, frequency, reminder_time, created_at, active)
habit_logs (id, user_id, habit_id, date, completed, notes, created_at)
streak_data (user_id, habit_id, current_streak, longest_streak, last_completed_date,
             freezes_used_this_month, repairs_used_this_year, holiday_mode_active,
             holiday_start, holiday_end)
streak_events (user_id, habit_id, date, type, created_at)
medications (id, user_id, name, type, dose_amount, dose_unit, frequency,
             course_start, course_end, course_length, reminder_time,
             cycle_linked, notes, created_at)
medication_logs (id, user_id, medication_id, date, taken, dose_taken, cycle_day, notes, logged_at)
```

### Gym (tasks/025, reconciled with existing tables — see top of file)
```sql
workouts (id, user_id, date, session_type, exercises[], duration_mins,
          gym_checkin_lat, gym_checkin_lng, hr_avg, hr_max, calories_est, notes, created_at)
gym_plan (user_id, monday, tuesday, wednesday, thursday, friday, saturday, sunday)
personal_bests (id, user_id, exercise_name, muscle_groups[], weight_kg, reps, date, created_at)
exercises (id, user_id, name, muscle_groups[], created_at)   -- already exists
```

### Nutrition (tasks/028) — manual logging only; meal_plans/recipes/grocery_lists/fridge_contents are FUTURE (task 064-adjacent)
```sql
meals (id, user_id, date, meal_type, name, calories, protein_g, carbs_g, fat_g,
       photo_url, logged_via, created_at)
nutrition_targets (user_id, calories, protein_g, carbs_g, fat_g, water_ml, last_updated)
```

### Activity — hike/run/walk (tasks/031) — trail_database deferred, no PostGIS needed yet
```sql
activities (id, user_id, type, start_time, end_time, duration_secs, distance_m,
            avg_pace_per_km, calories_est, elevation_gain_m, elevation_loss_m,
            max_elevation_m, route_geojson, photos[], waypoints[], weather_conditions,
            trail_id, hr_avg, hr_max, hr_zones{}, created_at)
activity_stats_cumulative (user_id, total_hike_distance_m, total_run_distance_m,
                           total_walk_distance_m, total_elevation_gain_m,
                           total_activity_time_secs, trails_completed,
                           trails_submitted, photos_taken, last_updated)
```

### Body (tasks/034) — reconcile with existing body_weight_logs/water_logs, don't duplicate
```sql
body_logs (id, user_id, date, weight_kg, water_ml, steps, vitamins_taken[], notes, created_at)
```

### Sleep (tasks/035) — sleep_stages/sleep_movement_logs/sleep_correlations wait for a wearable (task 048)
```sql
sleep_logs (id, user_id, date, bedtime, wake_time, total_hours, quality_score, notes, source_device)
sleep_phone_logs (user_id, date, phone_down_time, first_morning_unlock,
                  total_phone_free_mins, sleep_focus_activated, challenge_result, streak_count)
winddown_logs (user_id, date, routine_items[], completion_percent, streak_count)
-- FUTURE (wearable-gated): sleep_stages, sleep_scores, sleep_movement_logs, sleep_correlations
```

### Cycle (task 067 — FUTURE, opt-in only, stricter RLS, never in shared AI context by default)
```sql
cycle_logs (id, user_id, date, type, flow_intensity, symptoms[], notes, created_at)
cycle_settings (user_id, average_cycle_length, average_period_length, last_period_start,
                trying_to_conceive, notifications_enabled, face_id_lock_enabled)
```

### Library (task 064 — FUTURE)
```sql
books (id, user_id, google_books_id, title, author, cover_url, total_pages, current_page,
       status, started_at, finished_at, created_at)
movies (id, user_id, tmdb_id, title, director, year, runtime_mins, genres[], poster_url,
        status, rating, date_watched, rewatch_count, notes, created_at)
saved_links (id, user_id, url, title, domain, category, tags[], notes, created_at)
ideas (id, user_id, content, tags[], created_at)
reading_stats (user_id, total_books_finished, total_pages_read, avg_daily_pages,
               current_streak, last_calculated)
movie_stats (user_id, total_watched, total_runtime_hours, average_rating,
             favourite_genres[], last_calculated)
```

### Finance (task 065 — FUTURE; bank_connections / open banking is FUTURE-within-FUTURE, task 051, FCA-gated for production)
```sql
expenses (id, user_id, amount, currency, category, note, date, created_at)
bills (id, user_id, name, amount, due_date, frequency, last_paid, auto_renews, active)
budgets (user_id, category, monthly_target_amount)
savings_goals (id, user_id, name, target_amount, current_amount, deadline, created_at)
bank_connections (user_id, provider, access_token, last_synced)
```

### Mental health (task 066) — content fields are CIPHERTEXT, never plaintext
```sql
mood_logs (id, user_id, date, mood_score, stress_score, triggers[], note, created_at)
journal_entries (id, user_id, date, content_encrypted, created_at, updated_at)
therapy_notes (id, user_id, date, content_encrypted, therapist_name, next_session, created_at)
```

### Focus (task 052, gated on FamilyControls entitlement for the blocking parts)
```sql
focus_sessions (id, user_id, start_time, end_time, duration_secs, project_id,
                distractions_count, block_list_id, overrides_count, notes, created_at)
projects (id, user_id, name, colour, total_time_secs, created_at)
focus_scores (user_id, date, score, sessions_count, total_focus_secs)
block_lists (id, user_id, name, app_tokens[], category_tokens[], created_at)
block_sessions (id, user_id, block_list_id, start_time, end_time, type,
                overrides_count, compliance_score)
scheduled_blocks (id, user_id, block_list_id, name, days_of_week[], start_time, end_time, active)
block_stats (user_id, week_start, total_blocked_mins, sessions_count, override_count,
             compliance_percent, most_attempted_app, estimated_time_saved_mins)
```

### Goals (task 068 — FUTURE)
```sql
goals (id, user_id, title, category, why, target_date, status, created_at)
milestones (id, goal_id, title, deadline, completed, completed_at)
goal_logs (id, goal_id, date, note, progress_percent, created_at)
affirmations (id, user_id, text, active, display_on_today_screen)
vision_board_items (id, user_id, type, content, image_url, position, created_at)
```

### Travel (task 069 — FUTURE, blocked on Gmail/task 046)
```sql
trips (id, user_id, name, destination, start_date, end_date, purpose, created_at)
itinerary_items (id, trip_id, day, time, type, title, location, booking_ref, notes, source_email_id)
packing_lists (id, trip_id, items[], packed_items[])
trip_documents (id, trip_id, type, content, file_url)
```

### Social / Profile (task 070 — FUTURE surface; cumulative_stats plumbing built earlier since postWrite needs it)
```sql
friendships (user_id, friend_id, status, accountability_partner, connected_at)
challenges (id, creator_id, target_id, metric_type, start_date, end_date,
            creator_score, target_score, winner_id, status)
badges_earned (user_id, badge_id, earned_at, displayed_on_profile)
world_rankings (user_id, category, percentile, rank_tier, calculated_at)
cumulative_stats (user_id, total_steps, total_distance_walked_m, total_distance_run_m,
                  total_gym_sessions, total_focus_secs, total_habits_completed,
                  total_books_finished, total_movies_watched, longest_streak_ever, last_updated)
friend_feed_events (id, user_id, event_type, data, visible_to_friends, created_at)
```

### Wearables (task 048) — tokens live in oauth_tokens, never here
```sql
wearable_connections (user_id, device_type, primary_for[], last_synced, sync_preferences, connected_at)
heart_rate_logs (id, user_id, timestamp, bpm, context, source_device)
hrv_logs (id, user_id, date, hrv_ms, source_device)
recovery_scores (id, user_id, date, score, source, components, recommendation)
body_battery_logs (id, user_id, timestamp, level, charged, drained, source)
vo2max_logs (id, user_id, date, value, source_device)
running_dynamics_logs (id, user_id, activity_id, cadence, ground_contact_time_ms,
                       vertical_oscillation_cm, vertical_ratio_pct, stride_length_m, left_right_balance)
stress_logs (id, user_id, date, avg_stress, stress_timeline[], source_device)
```

### Accountability (task 050) — Stripe tokens only, never raw card data
```sql
accountability_contracts (id, user_id, habit_id, penalty_amount, penalty_destination,
                          grace_period_days, stripe_payment_method_id, active, created_at)
accountability_charges (id, contract_id, user_id, amount, destination, stripe_charge_id,
                        fired_at, cancelled, cancelled_at)
```

### Personal context layer (task 057) — vault_files only; user_context_summary already in core (above)
```sql
vault_files (id, user_id, path, content, content_hash, source check (source in ('app','user')),
             deleted_at, updated_at, synced_at)   -- + GIN FTS index on content
```

### Badges (task 063) — launch with ~10, not the full 100+ catalogue
```sql
-- badges_earned already listed under Social/Profile. The badge catalogue itself can be a
-- static config (lib/badges.ts) rather than a table — no need for a `badges` table unless
-- the catalogue needs to be editable without a redeploy.
```

### Notifications (task 071)
```sql
notification_log (id, user_id, companion_type, type, message, fired_at, tapped, dismissed)
notification_preferences (user_id, companion_type, enabled, max_per_day,
                          quiet_hours_start, quiet_hours_end, critical_override)
```

---

## CANONICAL RULES THAT APPLY ACROSS EVERY TABLE
- Date columns: zero-padded ISO `YYYY-MM-DD`, 1-indexed months, user's local timezone — see system-model.md.
- Every table: `user_id` + RLS `user_id = auth.uid()`, except where a stricter policy is explicitly noted (cycle, mood, journal, therapy).
- `journal_entries.content` and `therapy_notes.content` are the two fields requiring client-side encryption — RLS does not protect them from a service-role Edge Function.
- Migrations live in `supabase/migrations/`, numbered sequentially (see tasks/002 onward). Never edit a shipped migration — add a new one.
