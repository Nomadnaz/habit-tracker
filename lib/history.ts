// HISTORY: training grouped by day, newest first — what was done, named after
// the day's ticked template(s), and how hard each muscle was worked (0–1,
// relative to that day's most-worked muscle) for the little body.

import { musclesFor, baseOf, type Session } from './muscle-recovery';
import type { DoneEntry, WorkoutTemplate } from './workout-data';

export type DayLog = {
  date: string;
  title: string;
  lifts: { id: string; name: string; sets: number; weightKg: number; reps: number | null }[];
  load: Record<string, number>;
};

const CARDIO = new Set(['RUN', 'WALKING']);
const MONTHS = ['JAN', 'FEB', 'MAR', 'APR', 'MAY', 'JUN', 'JUL', 'AUG', 'SEP', 'OCT', 'NOV', 'DEC'];
const DAYS = ['SUN', 'MON', 'TUE', 'WED', 'THU', 'FRI', 'SAT'];

/** '2026-10-21' → '21 OCT'. */
export const shortDate = (key: string) => { const [, m, d] = key.split('-').map(Number); return `${d} ${MONTHS[(m || 1) - 1]}`; };
/** '2026-10-21' → 'WED'. */
export const dayName = (key: string) => { const [y, m, d] = key.split('-').map(Number); return DAYS[new Date(y, m - 1, d).getDay()]; };

export function buildHistory(sessions: Session[], done: DoneEntry[], templates: WorkoutTemplate[]): DayLog[] {
  const nameOf = Object.fromEntries(templates.map(t => [t.id, t.name]));
  const byDate = new Map<string, Session[]>();
  for (const s of sessions) {
    if (CARDIO.has(s.name)) continue;
    byDate.set(s.date, [...(byDate.get(s.date) ?? []), s]);
  }
  return [...byDate.entries()].sort((a, b) => b[0].localeCompare(a[0])).map(([date, list]) => {
    const raw: Record<string, number> = {};
    for (const s of list) {
      for (const [m, share] of Object.entries(musclesFor(s.name, s.muscleGroups))) {
        const id = baseOf(m);
        raw[id] = (raw[id] ?? 0) + share * Math.max(1, s.sets);
      }
    }
    const top = Math.max(0, ...Object.values(raw));
    const load = Object.fromEntries(Object.entries(raw).map(([m, v]) => [m, top ? v / top : 0]));
    const names = [...new Set(done.filter(d => d.date === date).map(d => nameOf[d.templateId]).filter(Boolean))];
    return {
      date,
      title: names.length ? names.join(' + ') : 'TRAINING',
      lifts: list.map(s => ({ id: s.exerciseId, name: s.name, sets: Math.round(s.sets), weightKg: s.weightKg, reps: s.reps })),
      load,
    };
  });
}
