// ─────────────────────────────────────────────────────────────────────────
// _shared/trends.ts — pure trend computations for daily-briefing's profile_md
// (task 061). Zero Deno/Supabase imports so this is vitest-testable directly,
// same reasoning as lib/*Formulas.ts on the client side (RN's Flow syntax —
// or here, Deno globals — breaks vitest's parser if pulled in transitively).
// ─────────────────────────────────────────────────────────────────────────

export interface SleepLogEntry {
  date: string;
  total_hours: number | null | undefined;
}

// Below this, call it "steady" rather than manufacturing a direction out of
// night-to-night noise.
const STABLE_THRESHOLD_HOURS = 0.5;
const WINDOW_SIZE = 7;
const MIN_NIGHTS_PER_WINDOW = 4;

/**
 * Compares avg sleep over the most recent ~7 nights against the ~7 before
 * that. Returns null (never a fabricated trend) when either window has too
 * few real nights logged to mean anything.
 */
export function computeSleepTrend(logs: SleepLogEntry[]): string | null {
  const valid = logs
    .filter((l): l is { date: string; total_hours: number } => typeof l.total_hours === 'number' && l.total_hours > 0)
    .sort((a, b) => (a.date < b.date ? 1 : a.date > b.date ? -1 : 0)); // most recent first

  const recent = valid.slice(0, WINDOW_SIZE);
  const prior = valid.slice(WINDOW_SIZE, WINDOW_SIZE * 2);
  if (recent.length < MIN_NIGHTS_PER_WINDOW || prior.length < MIN_NIGHTS_PER_WINDOW) return null;

  const avg = (entries: { total_hours: number }[]) =>
    entries.reduce((s, e) => s + e.total_hours, 0) / entries.length;
  const recentAvg = avg(recent);
  const priorAvg = avg(prior);
  const delta = recentAvg - priorAvg;

  if (Math.abs(delta) < STABLE_THRESHOLD_HOURS) {
    return `Sleep steady around ${recentAvg.toFixed(1)}h/night over the last 2 weeks.`;
  }
  const direction = delta > 0 ? 'up' : 'down';
  return `Sleep trending ${direction} — ${recentAvg.toFixed(1)}h/night this week vs ${priorAvg.toFixed(1)}h the week before.`;
}
