# system-model.md — habit-tracker
# CANONICAL SYSTEM MODEL. When this file conflicts with master-spec.md or architecture.md, THIS FILE WINS.
# Authority order: system-model.md > architecture.md > habit-tracker-master-spec.md
# Last updated: June 2026
# Purpose: the one short file Claude Code should read every session. The big spec is human reference;
#          this is the agent's source of truth. Keep it under ~200 lines on purpose.

---

## WHAT THIS APP ACTUALLY IS (one paragraph)

A local-first React Native (Expo SDK 54 / TypeScript / Expo Router) wellness app backed by Supabase,
with a single config-driven AI layer. It looks like 38 features; structurally it is ~90 tables in ~16
domains, ONE Edge Function (`ai-chat`) running ONE pipeline, and a set of thin CRUD screens. The
"companions" are not agents — they are configuration objects. Cross-domain intelligence is not
AI-to-AI reasoning — it is shared context plus precomputed flags assembled before any model call.
Everything else (feature flags, tiers, confidence gates, notification caps, privacy tiers) is a
governor wrapped around that core.

---

## CANONICAL DECISIONS (conflict resolutions — these override both other docs)

| Topic | Decision |
|---|---|
| Date keys | Zero-padded ISO `YYYY-MM-DD`, 1-indexed months, user's LOCAL timezone, never UTC. Generate with date-fns `format(date, 'yyyy-MM-dd')`. Applies to AsyncStorage keys, Supabase `date` columns, and Obsidian filenames. Any `YYYY-M-D` / 0-indexed mention anywhere is superseded. |
| Design tokens | architecture.md APPENDIX dark system (`#0A0A0A` bg, `#FF4D00` accent, PressStart2P/SpaceMono). Single source of truth — no colours defined anywhere else. Brand v2 (Michroma/Chakra Petch, cyan/amber) is NOT yet tokenised — pending an explicit decision; do not half-apply it. |
| Navigation | 5 tabs: Today / Habits / Health / Fitness / Life-hub. Profile via header icon. The master spec's flat ~11-tab list is superseded (file paths in it remain valid; tab membership does not). |
| Companions | 14 types: life, gym, calorie, activity, habitCoach, sleep, library, cycle, medication, finance, mood, travel, focus, goals. (Investment and Relationship companions are cut from current scope; re-add later as config entries.) Adding another = one config entry in `companions.ts`, zero new code. |
| Model + pricing | Haiku 4.5 default ($1 in / $5 out per MTok); Sonnet 4.6 for complex routes ($3 / $15). Prompt caching is MANDATORY from the first `ai-chat` deploy — the system prompt + context block repeat every turn and cached input is ~90% cheaper. Without caching the free tier loses money. |
| buildContext | The Deno version (`supabase/functions/_shared/buildContext.ts`) is canonical. The `lib/` copy is a thin re-export for client-side preview only. Edit `_shared/` only; never let the two diverge. |
| Monetisation | Apple IAP via RevenueCat for ALL subscription tiers (Pro/Premium unlock digital goods → Apple requires IAP; Stripe subscriptions for tiers = rejection). Stripe is kept ONLY for accountability/commitment charges (real-world service, IAP-exempt — the Beeminder/StickK precedent). Gate NOTHING until you have real users. |
| OAuth tokens | One canonical home: the `oauth_tokens` table. Tokens must NOT live in `wearable_connections` or any per-integration table. Every integration (Gmail, Calendar, LinkedIn, Garmin/Whoop/Fitbit, banking) reads/writes here. |
| Privacy (journal/therapy) | Client-side encrypted: encrypt on device, key in `expo-secure-store`, store ciphertext only. Edge Functions use the service-role key which BYPASSES RLS, so "the AI can't read therapy notes" is only a convention until the data is encrypted. RLS alone is not a privacy guarantee. |
| Offline AI | If a message is sent offline, respond on next app open. Do NOT build the "respond via push notification" queue — payload limits + complexity for no real gain. |

---

## THE THREE LAYERS

**1. Data layer.** ~90 Supabase tables across ~16 domains. Every table: `user_id` + RLS
`user_id = auth.uid()`, mirrored locally in AsyncStorage. Domains have almost no cross-domain foreign
keys — that is deliberate. Cross-domain awareness happens at READ time, not schema time.

**2. Intelligence layer.** ONE Edge Function (`ai-chat`), ONE pipeline:

```
classify → buildContext → persona → buildSystemPrompt → model call
        → extractActions → confidence gate → execute / PreviewCard / clarify
```

The 14 companions are config objects in `companions.ts` (`contextSources[]`, a prompt template, an
allowed `actions[]` list). New companion = new config entry, zero new code. This is the single best
decision in the whole design — protect it.

**3. Surface layer.** Tabs and modals are thin CRUD over their domain tables plus an entry into
companion-chat with a `companionType` param. No screen contains intelligence.

---

## THE FOUR DATA FLOWS (every feature reduces to one of these)

1. **Local-first write:** UI → AsyncStorage (instant) → Supabase fire-and-forget → sync queue on
   failure → replay on reconnect. The universal logging path.
2. **Context read:** `buildContext` runs parallel queries (companion `contextSources` + the
   SharedContext block + precomputed flags: OVERREACHING, SLEEP_DEBT, UNDERFUELLING, LOW_PROTEIN,
   STRESS_SLEEP) and hands one object to the model. "Calorie AI knows tomorrow is leg day" is just
   `gym_plan` being in its `contextSources` — deterministic and cheap.
3. **Action loop:** AI emits `<action>` JSON. Gates: >0.85 execute (INTERNAL Supabase writes only),
   0.6–0.85 show PreviewCard, <0.6 clarify. ALL external/irreversible writes (email, LinkedIn,
   Stripe, calendar) ALWAYS require a PreviewCard regardless of confidence — model confidence scores
   are not calibrated, so don't trust them for anything that leaves the app.
4. **Scheduled jobs:** pg_cron → Edge Functions (daily-briefing, email-scan, rankings, stripe-charge).
   The daily briefing is just flow 2 on a timer, filtered by `briefing_preferences`.

---

## POST-WRITE FAN-OUT (the hidden coupling — read before building any screen)

A single domain write (log a workout, finish a book, complete a habit, save an activity) fans out to
up to six side effects. These MUST go through one shared function — `lib/postWrite.ts` — and be
reimplemented in ZERO screens. Run the effects with `Promise.allSettled` so one failing side effect
never blocks the others or the user's write.

```
postWrite(entity, record):
  1. cumulative_stats increment        (MVP)
  2. streak update via lib/streaks.ts  (MVP)
  3. badge check                       (FUTURE — flagged no-op until built)
  4. friend_feed_events insert         (FUTURE — flagged no-op)
  5. Obsidian .md write                (FUTURE — flagged no-op)
  6. (implicit) record becomes visible to the next buildContext call
```

MVP ships `postWrite.ts` with steps 1–2 live and 3–5 as flagged no-ops. Screens call `postWrite()`
and nothing else. This is the one piece of structure that, if skipped, guarantees drift — some
screens updating cumulative_stats, others silently forgetting, and streaks slowly going wrong.

---

## MISSING FROM THE ORIGINAL SCHEMA (add to migration 007)

```sql
companion_messages (id, user_id, companion_type, role, content,
                    actions_json, created_at)
-- Chat history was never specified. Without it, conversationHistory[] only lives
-- in component state and dies on app close. Required for any real companion memory.

api_usage (user_id, date, message_count, tokens_in, tokens_out)
-- Server-side rate limiting + cost visibility. The ai-chat function proxies the
-- app's Anthropic key; without per-user daily caps ENFORCED in the Edge Function,
-- a scripted client can drain the key. Enforce here, not in the app.

oauth_tokens (id, user_id, provider, access_token, refresh_token,
              scope, expires_at, created_at, updated_at)
-- Single canonical home for every integration's tokens. Remove token columns from
-- wearable_connections and any per-integration table — they all point here.
```

---

## GOVERNORS (five independent gating systems wrap everything)

1. `featureFlags.ts` — what's visible. Everything non-MVP defaults to false.
2. Subscription tier — usage limits, checked SERVER-SIDE in Edge Functions (never trust the client).
3. Confidence gates — what the AI may execute (internal writes only; external always confirmed).
4. Notification caps — 8/day total, 2/companion, quiet hours respected.
5. Privacy tiers — RLS → opt-in per data type (cycle, mood) → client-encrypted (journal, therapy).

---

## BUILD DEPENDENCY GRAPH

```
migrations 001–008 ──┬─→ shared components (HeatmapCalendar, ProgressRing,
                     │    ChatScreen, BriefingCard, PreviewCard)
                     │         │
companions.ts ───────┴─→ ai-chat Edge Fn + daily-briefing + lib/postWrite.ts
                               │
                     screens (parallel, independent of each other):
                     habits → gym → calorie → activity → body/sleep
                               │
                     buildContext full wiring (needs real data to read)
                               │
                     integrations → native modules → polish
```

Rule: a screen ships when it can **log, display, and chat**. Cross-section intelligence only becomes
real once several domains hold actual data.

---

## LEAN MVP (the honest scope)

Spine first (weeks 1–3): migrations 001/002/007 → ChatScreen + ai-chat (caching + rate limits) +
`habitCoach` companion + BriefingCard + Habits screen with HeatmapCalendar → TestFlight it.
Then one domain per week: gym → calorie (manual first, photo vision later) → body/sleep → activity.
Everything else (social, trails, rankings, cycle, finance, travel, Obsidian, app-blocking,
accountability payments, all OAuth) stays behind a feature flag set to false.
HealthKit steps is the only integration worth doing early — it's permission-based, not OAuth.

---

## SLOW EXTERNAL CLOCKS — START THESE NOW, IN PARALLEL (zero build effort, weeks of lead time)

- Apple **FamilyControls** entitlement application (app-blocking is FUTURE, but approval is
  calendar-bound, not effort-bound — get in the queue).
- Apple **IAP products** defined in App Store Connect + RevenueCat wired (needed before any paywall).
- **Google restricted-scope verification + CASA security assessment** for Gmail content access —
  this is the single thing gating all Life-AI email features; it costs money and takes weeks-to-months.
- **TMDB / Mapbox** API keys (library + maps), so they're ready when those screens land.
