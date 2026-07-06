// ─────────────────────────────────────────────────────────────────────────
// _shared/localDate.ts — timezone-aware date keys for Edge Functions.
// ─────────────────────────────────────────────────────────────────────────
// An audit (2026-07-06) found buildContext.ts and actionExecutor.ts computed
// "today"/"tomorrow" via `new Date().toISOString().slice(0, 10)` — UTC. A
// JWT carries no timezone, so from roughly evening onward local time (any
// timezone west of UTC), this reported the WRONG calendar day: the calorie
// companion's "tomorrow is leg day" line would name the wrong day, and
// voice-created tasks via resolveDateKey landed on the wrong date. The
// client already resolves dates in local time via lib/dateKey.ts; this is
// the server-side equivalent, driven by a `tzOffsetMinutes` the client sends
// in the request body (standard JS convention: `new Date().getTimezoneOffset()`,
// positive when local is BEHIND UTC). Defaults to 0 (UTC) for callers that
// don't send it yet, preserving old (imperfect but not broken) behavior
// rather than throwing.
// ─────────────────────────────────────────────────────────────────────────

function shiftedNow(tzOffsetMinutes: number): Date {
  return new Date(Date.now() - tzOffsetMinutes * 60000);
}

function dateKeyFromShifted(d: Date): string {
  const y = d.getUTCFullYear();
  const m = String(d.getUTCMonth() + 1).padStart(2, '0');
  const day = String(d.getUTCDate()).padStart(2, '0');
  return `${y}-${m}-${day}`;
}

/** Today's date key in the caller's local time (per tzOffsetMinutes). */
export function localDateKey(tzOffsetMinutes = 0): string {
  return dateKeyFromShifted(shiftedNow(tzOffsetMinutes));
}

/** Today's date key shifted by `days` calendar days (negative to go back). */
export function localDateKeyPlusDays(days: number, tzOffsetMinutes = 0): string {
  const d = shiftedNow(tzOffsetMinutes);
  d.setUTCDate(d.getUTCDate() + days);
  return dateKeyFromShifted(d);
}

/** 0 = Sunday..6 = Saturday, for the caller's local "today". */
export function localWeekday(tzOffsetMinutes = 0): number {
  return shiftedNow(tzOffsetMinutes).getUTCDay();
}
