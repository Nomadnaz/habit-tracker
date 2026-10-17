// ─────────────────────────────────────────────────────────────────────────
// The weekly climb on STEPS. Each week (Monday 00:00 on) your steps carry
// you up the mountain: flags at 10K, 20K, 50K and the summit at 100K. For
// each flag, how long into the week you got there — and your best ever.
//
// Steps come in hourly buckets from Apple Health (BodyData.stepsHourly); a
// day with only a daily total is spread evenly over 7am–11pm.
// Pure — no storage here; app/steps.tsx keeps the bests.
// ─────────────────────────────────────────────────────────────────────────

import { toDateKey } from './dateKey';

export const CHECKPOINTS = [10_000, 20_000, 50_000, 100_000] as const;
export const SUMMIT = CHECKPOINTS[CHECKPOINTS.length - 1];
const H = 3_600_000;

/** Local hour key, 'YYYY-MM-DDTHH'. */
export const hourKey = (d: Date) => `${toDateKey(d)}T${String(d.getHours()).padStart(2, '0')}`;

export function weekStart(d: Date): Date {
  const m = new Date(d.getFullYear(), d.getMonth(), d.getDate());
  m.setDate(m.getDate() - ((m.getDay() + 6) % 7));
  return m;
}

/** Steps in each hour of the week starting `start` (168 numbers), up to `now`. */
export function weekHours(start: Date, daily: Record<string, number>, hourly: Record<string, number>, now: Date): number[] {
  const out: number[] = [];
  for (let d = 0; d < 7; d++) {
    const day = new Date(start.getFullYear(), start.getMonth(), start.getDate() + d);
    const key = toDateKey(day);
    const hrs = Array.from({ length: 24 }, (_, h) => hourly[`${key}T${String(h).padStart(2, '0')}`] ?? 0);
    const sum = hrs.reduce((a, b) => a + b, 0);
    const total = daily[key] ?? 0;
    if (sum === 0 && total > 0) {
      // Only a daily total: spread it across waking hours (so far, if today).
      const last = key === toDateKey(now) ? Math.max(7, Math.min(22, now.getHours())) : 22;
      for (let h = 7; h <= last; h++) hrs[h] = total / (last - 6);
    } else if (total > sum) {
      // Health's daily total can run ahead of the hourly buckets; top up the last active hour.
      const lastActive = hrs.reduce((a, v, h) => (v > 0 ? h : a), 12);
      hrs[lastActive] += total - sum;
    }
    out.push(...hrs);
  }
  return out;
}

export type Climb = {
  start: number;              // ms, Monday 00:00
  total: number;              // steps this week
  /** Per checkpoint: ms from the week's start to reaching it, or null. */
  reached: (number | null)[];
};

export function climb(start: Date, hours: number[]): Climb {
  const reached: (number | null)[] = CHECKPOINTS.map(() => null);
  let cum = 0;
  hours.forEach((n, h) => {
    if (n <= 0) return;
    CHECKPOINTS.forEach((cp, i) => {
      if (reached[i] == null && cum < cp && cum + n >= cp) reached[i] = (h + (cp - cum) / n) * H;
    });
    cum += n;
  });
  return { start: start.getTime(), total: Math.round(cum), reached };
}

/** This week and the `n - 1` before it, newest first. */
export function recentClimbs(daily: Record<string, number>, hourly: Record<string, number>, now: Date, n = 8): Climb[] {
  const out: Climb[] = [];
  const first = weekStart(now);
  for (let w = 0; w < n; w++) {
    const start = new Date(first.getFullYear(), first.getMonth(), first.getDate() - 7 * w);
    out.push(climb(start, weekHours(start, daily, hourly, now)));
  }
  return out;
}

export type Best = { ms: number; week: number } | null;

/** Fastest time to each checkpoint across these climbs, merged with bests kept from before. */
export function bests(climbs: Climb[], kept: Best[] = []): Best[] {
  return CHECKPOINTS.map((_, i) => {
    let b: Best = kept[i] ?? null;
    for (const c of climbs) {
      const ms = c.reached[i];
      if (ms != null && (!b || ms < b.ms)) b = { ms, week: c.start };
    }
    return b;
  });
}

/** How far up the route, 0–1, for a step count. */
export const progressOf = (steps: number) => Math.max(0, Math.min(1, steps / SUMMIT));

/** '2D 14H', '9H 05M', '42M'. */
export function fmtElapsed(ms: number): string {
  const m = Math.round(ms / 60_000);
  const d = Math.floor(m / 1440), h = Math.floor((m % 1440) / 60), mm = m % 60;
  if (d) return `${d}D ${String(h).padStart(2, '0')}H`;
  if (h) return `${h}H ${String(mm).padStart(2, '0')}M`;
  return `${mm}M`;
}

export const cpLabel = (cp: number) => (cp === SUMMIT ? 'SUMMIT' : `${cp / 1000}K`);
