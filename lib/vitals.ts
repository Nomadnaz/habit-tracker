// Raw Apple Health samples → the coach's daily Vitals (lib/coach.ts). Pure,
// so it's testable without HealthKit; lib/apple-health.ts does the fetching.
//
// One source per metric: the connected wearable's samples if it wrote any,
// else whichever source wrote the most. Mixing sources would blend
// different measurements (a ring's overnight HRV vs a watch's spot checks)
// and double-count sleep that two devices both recorded.

import { toDateKey } from './dateKey';
import type { Night, Vitals } from './coach';
import type { Metric } from './wearables';

export type Sample = { value: number; startDate: string; endDate: string; sourceName?: string };
export type SleepSample = { value: string; startDate: string; endDate: string; sourceName?: string };

/** Who wrote what, newest sample per source and metric — the connector's check. */
export type Seen = { source: string; metric: Metric; last: string }[];

function pickSource<T extends { sourceName?: string }>(xs: T[], prefer: RegExp | null, weight: (x: T) => number = () => 1): string | null {
  const by = new Map<string, number>();
  for (const x of xs) by.set(x.sourceName ?? '', (by.get(x.sourceName ?? '') ?? 0) + weight(x));
  const names = [...by.keys()];
  const mine = prefer ? names.filter(n => prefer.test(n)) : [];
  const pool = mine.length ? mine : names;
  return pool.sort((a, b) => (by.get(b) ?? 0) - (by.get(a) ?? 0))[0] ?? null;
}

function daily(xs: Sample[], k = 1): Record<string, number> {
  const sum: Record<string, [number, number]> = {};
  for (const x of xs) {
    const key = toDateKey(new Date(x.startDate));
    const cur = sum[key] ?? [0, 0];
    sum[key] = [cur[0] + x.value * k, cur[1] + 1];
  }
  return Object.fromEntries(Object.entries(sum).map(([d, [s, n]]) => [d, Math.round((s / n) * 10) / 10]));
}

const ASLEEP = new Set(['ASLEEP', 'CORE', 'DEEP', 'REM']);
const mins = (s: { startDate: string; endDate: string }) => (Date.parse(s.endDate) - Date.parse(s.startDate)) / 60_000;
/** The morning a sleep sample belongs to: anything ending before 6pm counts toward that day. */
const nightOf = (end: string) => toDateKey(new Date(Date.parse(end) + 6 * 3_600_000));

export function buildVitals(input: {
  hrv: Sample[]; rhr: Sample[]; resp: Sample[]; spo2: Sample[]; sleep: SleepSample[];
  prefer: RegExp | null;
}): { vitals: Vitals; seen: Seen } {
  const { prefer } = input;
  const sources: Vitals['sources'] = {};
  const seen: Seen = [];
  const note = (metric: Metric, xs: { sourceName?: string; endDate: string }[]) => {
    const last = new Map<string, string>();
    for (const x of xs) if (!last.has(x.sourceName ?? '') || x.endDate > last.get(x.sourceName ?? '')!) last.set(x.sourceName ?? '', x.endDate);
    for (const [source, at] of last) seen.push({ source, metric, last: at });
  };

  const one = (metric: 'hrv' | 'rhr' | 'resp', xs: Sample[], k = 1) => {
    note(metric, xs);
    const src = pickSource(xs, prefer);
    if (src == null) return {};
    if (src) sources[metric] = src;
    return daily(xs.filter(x => (x.sourceName ?? '') === src), k);
  };

  // HealthKit hands HRV over in seconds.
  const hrv = one('hrv', input.hrv, 1000);
  const rhr = one('rhr', input.rhr);
  const resp = one('resp', input.resp);

  note('sleep', input.sleep);
  const sleep: Record<string, Night> = {};
  const byNight = new Map<string, SleepSample[]>();
  for (const s of input.sleep) {
    const key = nightOf(s.endDate);
    byNight.set(key, [...(byNight.get(key) ?? []), s]);
  }
  for (const [night, xs] of byNight) {
    const src = pickSource(xs, prefer, x => (ASLEEP.has(x.value) ? mins(x) : 0));
    const mine = xs.filter(x => (x.sourceName ?? '') === src);
    const n: Night = { asleep: 0, deep: 0, rem: 0, awake: 0 };
    for (const x of mine) {
      const m = mins(x);
      if (ASLEEP.has(x.value)) n.asleep += m;
      if (x.value === 'DEEP') n.deep += m;
      if (x.value === 'REM') n.rem += m;
      if (x.value === 'AWAKE') n.awake += m;
    }
    if (n.asleep > 0) {
      sleep[night] = { asleep: Math.round(n.asleep), deep: Math.round(n.deep), rem: Math.round(n.rem), awake: Math.round(n.awake) };
      if (src) sources.sleep = src;
    }
  }

  const ox = [...input.spo2].sort((a, b) => b.endDate.localeCompare(a.endDate))[0];
  const spo2 = ox ? Math.round((ox.value <= 1 ? ox.value * 100 : ox.value) * 10) / 10 : null;

  return { vitals: { hrv, rhr, resp, sleep, spo2, sources }, seen };
}
