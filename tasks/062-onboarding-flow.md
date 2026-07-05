# Task 062: Onboarding flow

**Phase:** 8 — Polish
**Status:** implemented (2026-07-05) — pending live migration run + on-device verify
**Depends on:** 020,023

## Goal
app/(onboarding)/ — 10 screens per the spec: welcome, basics, goals, targets, first-habit, skills, book, connect, account, briefing-builder. Account creation deliberately late (screen 9).

## Key files
app/(onboarding)/*.tsx, components/OnboardingShell.tsx (new), lib/onboarding-data.ts (new), lib/featureFlags.ts (new), migration 013_user_profiles.sql (new), app/_layout.tsx (extended)

## Acceptance criteria
- [x] Account wall is screen 9, not earlier — screens 1-8 collect everything into a local AsyncStorage blob (`lib/onboarding-data.ts`); no Supabase write happens before `account.tsx` calls `signUp()`.
- [x] Completing onboarding sets user_profiles.onboarding_complete = true and routes to (tabs)/ — `flushOnboardingIfNeeded()` upserts `user_profiles` (+ `nutrition_targets`, first habit, `briefing_preferences`) once a session exists, called from `briefing-builder.tsx`'s finish button, which then explicitly `router.replace('/(tabs)')`.
- [x] Connect screen ships with only Apple Health live, others behind featureFlags — new `lib/featureFlags.ts` (didn't exist before; one of system-model.md's 5 governors), `healthKitConnect: true`, everything else `false` and rendered as disabled "COMING SOON" rows rather than omitted.

## Notes (2026-07-05) — task 020 dependency, and design decisions
- **Task 020 (Settings: API key + companion setup) is still pending** — onboarding does not block on it; nothing in the 10 screens needs per-companion persona setup or an API-key toggle, so the dependency didn't turn out to be load-bearing for this build.
- **`user_profiles` didn't exist yet** — database.md scoped it under task 006, but `006_ai_companions.sql` never created it (only the companion/AI plumbing tables). Added it now as `013_user_profiles.sql`, with only the columns onboarding actually collects (not the full database.md list — photo_url/badges/subscription_tier/etc. are FUTURE and unused; additive migrations are cheap, no need to pre-build columns nothing writes).
- **Interpretation calls** (the master spec isn't in this repo to check verbatim — see CLAUDE.md): "skills" (screen 6) is built as a lightweight preference for the still-stub TREE tab's future RPG skill system, stored locally only, nothing reads it yet. "book" (screen 7) is built as a short feature-tour ("what's inside the app"), not the Library domain (which doesn't exist and isn't part of the lean MVP spine) — noted in `book.tsx`'s header comment.
- **Root auth-flow change, the risky part**: `app/_layout.tsx` now checks a local `@onboarding_complete` AsyncStorage flag (via `lib/onboarding-data.ts`'s `isOnboardingComplete()`) independent of login state. A logged-out user with the flag unset goes to `/(onboarding)/welcome`; a logged-out user with it set goes to `/(auth)/login` exactly as before. This means **on first launch after this update, any currently logged-out tester will see onboarding instead of the login screen** — there was no way to distinguish "existing tester, logged out" from "brand-new install" other than this flag, which starts unset for both. The welcome screen's "I already have an account" link calls `skipOnboarding()` (sets the flag, no wizard) and jumps straight to login. Matches how the earlier date-key migration was accepted as fine pre-launch (CLAUDE.md/current-state.md: "no production users yet").
- **A real ordering bug caught before commit**: `supabase.auth.signUp()` can make `session` truthy immediately (if email confirmation is off for this Supabase project), which happens on screen 9 — one screen before the flow actually ends. The root layout's session-based redirect deliberately does NOT fire while `segments[0] === '(onboarding)'` (only from `(auth)`), so the user still reaches screen 10 (briefing-builder) instead of being yanked into `(tabs)` mid-flow; that screen calls `router.replace('/(tabs)')` itself once `flushOnboardingIfNeeded()` finishes.
- **Email-confirmation-required path** (if this Supabase project has confirmation on): `account.tsx` shows a "check your email, then log in" alert and routes to `/(auth)/login`, leaving the answers cached. `flushOnboardingIfNeeded()` runs from `app/_layout.tsx`'s session effect on the next successful login (whichever launch that happens to be), so nothing is lost — but the user never sees the briefing-builder screen in that case; `daily-briefing`'s own `['tasks','habit_logs']` default covers the gap gracefully.
- tsc clean for every new/changed file (same 52 pre-existing, unrelated errors as before this session — daily-briefing's Deno pattern accounts for +7 over the earlier 45). Not verified on-device — this is the highest-risk change of the session (auth-flow routing) and genuinely needs a real run-through: fresh install → full 10-screen flow → confirm it lands in `(tabs)` with a habit, targets, and briefing preferences all present; then force-quit and relaunch to confirm it doesn't re-onboard.

## Read first
system-model.md, database.md, current-state.md — in that order. Update current-state.md when this task is verified done, then commit and push.
