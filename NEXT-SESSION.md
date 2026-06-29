# NEXT-SESSION.md — start here to continue the habit-tracker build

> Hand-off file. The previous chat ran out of token budget. Read this, then the three canonical
> docs, then act. Last updated: 2026-06-29.

## ⏱️ 30-second orientation
- This is a **React Native + Expo SDK 54** app at `~/esp/habit-tracker`.
- It looks like 38 features; structurally it's ~90 Supabase tables, one AI pipeline, thin CRUD
  screens. The full picture is in `system-model.md`.
- Work is split across **two parallel chats**:
  - **Chat A (AI / device):** the `ai-chat` Edge Function ("AI ask") + the ESP32 [[Companion HUD]]
    firmware in `~/esp/projects/companion-hud`. Owns `lib/companions.ts`, `lib/streaks.ts`,
    `components/ChatScreen.tsx`, `supabase/functions/ai-chat/`, `_shared/buildContext.ts`,
    `006_ai_companions.sql` (all currently **untracked**).
  - **Chat B (this one — app features):** Phase 0 foundation + the **calorie tracker** (committed).
- **Don't edit the other chat's files** unless coordinating. The calorie work deliberately avoided
  `ai-chat` by using a separate `food-vision` function.

## 📖 Read these first, in order
1. `system-model.md` — canonical architecture + conflict rules (wins over everything).
2. `database.md` — schema, incl. existing-vs-proposed reconciliation.
3. `current-state.md` — what's actually built + the progress log + ⚠️ ACTION NEEDED section.
4. Then the **one** `tasks/NNN-*.md` you're about to work on. Never load the full master spec.

## ✅ What's DONE (committed)
- **Phase 0 foundation** (tasks/001–005): canonical docs, 77-task plan, `migrations/001_baseline.sql`,
  the [[Date Key Format]] migration (`lib/dateKey.ts` + `002_date_key_format.sql` + boot migration),
  gym/body schema reconciliation (`003_gym_body_reconcile.sql`).
- **Calorie tracker + snap-a-picture** (tasks/028–030, commit `12cb50c`): `app/calorie.tsx`,
  `lib/meals-data.ts`, `lib/foodVision.ts`, `supabase/functions/food-vision/`, `007_nutrition.sql`.
  Reachable from the Today header 🍎 icon. Manual logging works offline now; the snap flow shows a
  labeled *mock* estimate until `food-vision` is deployed.

## 🚧 In progress (Chat A — do not duplicate)
Phase-1 companion infra is partly built but **uncommitted and has known issues** (flagged, not fixed):
`ai-chat` is a **mock** (no real Claude call / rate-limit / caching), `lib/streaks.ts` uses **UTC not
local timezone** (breaks the canonical streak rule — should use `lib/dateKey.ts`), and
`postWrite.ts`/`buildContext.ts` reference a `context_json` column that doesn't exist (the migration
has `profile_md`/`assistant_notes_md`). If you touch the AI pipeline, fix these and coordinate.

## ⚠️ ACTION NEEDED (a human / privileged session — cannot be done from a background chat)
1. **`git push`** — local is **9 commits ahead of `origin/main`**; these chats have no GitHub creds.
2. **Run migrations** in the Supabase SQL editor (project `dnbdjjrjudrzugxkpeeh`):
   `002_date_key_format.sql` (⚠️ run ONCE — not re-runnable), `003_gym_body_reconcile.sql`,
   `006_ai_companions.sql`, `007_nutrition.sql`.
3. **Deploy the vision function:** `supabase functions deploy food-vision` and
   `supabase secrets set ANTHROPIC_API_KEY=sk-ant-…` (key stays server-side — never in the bundle).
4. **Restart Metro with a clean cache** so the new camera deps resolve: `npx expo start -c --tunnel`.
   (Camera works in Expo Go; a custom dev build needs a native rebuild for the new native modules.)
5. **On device:** verify Today → 🍎 Calories → log a meal manually, then SNAP A MEAL.
6. **Phone install (optional):** EAS path — needs a free Expo account + a paid Apple Developer
   account ($99/yr). `eas.json` is committed.

## ▶️ Suggested next build tasks (Chat B / app features)
Pick the next pending one from `current-state.md`. Logical candidates per the [[Build Order]]:
- **tasks/023 — Habits screen** (+ `HeatmapCalendar`) — high value, MVP spine, pairs with streaks.
- **tasks/024 — Medication & Supplements** sub-section of habits.
- **tasks/034 — Body page hub** — unifies the existing steps/water/weight screens.
- Or harden the calorie tracker: Supabase Storage photo upload, edit-from-quick-add, water tracking.

## 🧭 Working rules (from CLAUDE.md)
- One task per session; enrich → implement → verify (tsc) → update `current-state.md` → commit.
- Migration numbers in task files are **hints** — run `ls supabase/migrations/` and use the next free
  number (next is `008`).
- Match existing screens: light theme (`#FF4D00` accent), **PixeloidSans** fonts (NOT PressStart2P —
  CLAUDE.md is stale on this). Dark theme is task 077, deliberately last.
- Every domain write goes through `lib/postWrite.ts` — never touch cumulative_stats/badges/Obsidian
  directly.

## 📒 Second brain
Full navigable docs: `~/esp/SecondBrain/Projects/Habit Tracker/` (open `Habit Tracker.md`). This
session's log: `~/esp/SecondBrain/Conversations/2026-06-29-habit-tracker-foundation-and-calorie-tracker.md`.

---

### Copy-paste prompt to start the next chat
```
Read NEXT-SESSION.md, then system-model.md, database.md, and current-state.md in the
habit-tracker repo (~/esp/habit-tracker). I'm continuing the app-features track (Chat B).
Don't touch the other session's AI/ai-chat files. Confirm the current state back to me,
then let's start tasks/023 (Habits screen) — or tell me if something needs me first.
```
