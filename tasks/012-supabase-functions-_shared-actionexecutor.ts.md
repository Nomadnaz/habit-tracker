# Task 012: supabase/functions/_shared/actionExecutor.ts

**Phase:** 1 — Companion Infra
**Status:** implemented (2026-06-29) — pending live deploy + on-device verify
**Depends on:** 006

## Goal
Shared action parsing + execution. Confidence gates: >0.85 execute (internal Supabase writes only), 0.6-0.85 PreviewCard, <0.6 clarify. All external/irreversible writes (email, LinkedIn, Stripe, calendar) always require PreviewCard regardless of confidence.

## Key files
supabase/functions/_shared/actionExecutor.ts, lib/actionExecutor.ts

## Acceptance criteria
- [x] Confidence gate implemented exactly as specified (>0.85 execute internal / 0.6–0.85 preview / <0.6 clarify) — `gateAction()` in `supabase/functions/_shared/actionExecutor.ts`.
- [x] External-write actions hard-coded to always require preview, never bypassable by a high confidence score (`EXTERNAL_ACTIONS` set → always `preview`).
- [x] Unwired actions (no companion screens yet) simply return 'not yet supported' (`status: 'unsupported'`).

## Notes (2026-06-29)
- Server executor `supabase/functions/_shared/actionExecutor.ts` (`gateAction`, `processActions`, internal writers for `create_task`/`reschedule_task`/`complete_task`/`log_pb`) wired into `ai-chat/index.ts` after `extractActions`; the function now returns each action annotated with `status`/`message`/`result`.
- Client twin `lib/actionExecutor.ts`: `fanOutExecuted()` runs `postWrite` for server-executed actions; `executeConfirmedAction()` performs PreviewCard confirmations through `postWrite` (not raw inserts).
- `components/ChatScreen.tsx` consumes the annotated actions (executed → fan-out + refresh; preview → cards; clarify → inline prompt).
- tsc clean for all four files. STILL TO DO: redeploy `ai-chat` (`supabase functions deploy ai-chat`) with the rotated key, then verify on device that "add gym tomorrow at 6" creates a real `tasks` row.

## Read first
system-model.md, database.md, current-state.md — in that order. Update current-state.md when this task is verified done, then commit and push.
