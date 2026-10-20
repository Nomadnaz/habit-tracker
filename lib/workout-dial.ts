// ─────────────────────────────────────────────────────────────────────────
// The SELECT dial's order (app/workout-select.tsx): the coach's next session
// first, then the rest of the rotation as it comes round — each on the
// training day it falls on — then the other foci, then your own days.
// Pure, so it's tested (lib/workout-dial.test.ts).
// ─────────────────────────────────────────────────────────────────────────

import { dayWord, FOCI, FOCUS_LINEUP, FOCUS_TITLE, focusOfName, rotation, WEEK, type Routine, type Today } from './coach';
import type { Focus, WorkoutTemplate } from './workout-data';

export type DialSel = { focus: Focus } | { templateId: string };

export type DialItem = {
  key: string;
  title: string;
  sel: DialSel;
  /** TODAY / TOMORROW / WED for a session on the plan, DONE once ticked today; else null. */
  when: string | null;
  /** The coach's pick — lit green. */
  next: boolean;
  /** How recovered the focus's muscles are, 0–100 (null for your own days). */
  ready: number | null;
  lifts: number;
};

/** The training days after the one `at` falls on, as 5pm timestamps, for `n` sessions. */
function upcomingDays(routine: Routine, at: number, n: number): number[] {
  const out: number[] = [];
  if (!routine.days.length) return out;
  const d = new Date(at);
  for (let i = 1; out.length < n && i <= 7 * n; i++) {
    const day = new Date(d.getFullYear(), d.getMonth(), d.getDate() + i, 17);
    if (routine.days.includes(WEEK[(day.getDay() + 6) % 7])) out.push(day.getTime());
  }
  return out;
}

export function dialOrder(input: {
  today: Today;
  routine: Routine | null;
  templates: WorkoutTemplate[];
  /** Exercises in a template. */
  liftsOf: (templateId: string) => number;
  now: Date;
}): DialItem[] {
  const { today, routine, liftsOf, now } = input;
  const live = input.templates.filter(t => !t.isArchived);
  const ofFocus = (f: Focus) => live.find(t => focusOfName(t.name) === f);
  const item = (f: Focus, when: string | null, next = false): DialItem => {
    const t = ofFocus(f);
    return {
      key: `focus:${f}`, title: t?.name ?? FOCUS_TITLE[f], sel: { focus: f }, when, next,
      ready: today.freshBy[f] ?? null, lifts: t ? liftsOf(t.id) : FOCUS_LINEUP[f].length,
    };
  };

  const out: DialItem[] = [item(today.focus, today.done ? 'DONE' : today.when, true)];
  const seen = new Set<Focus>([today.focus]);

  if (routine?.days.length) {
    const rot = rotation(routine);
    const start = rot.indexOf(today.focus);
    const after = rot.map((_, k) => rot[(Math.max(0, start) + 1 + k) % rot.length]).filter(f => !seen.has(f));
    const order = [...new Set(after)];
    const days = upcomingDays(routine, today.at, order.length);
    order.forEach((f, i) => {
      seen.add(f);
      out.push(item(f, days[i] != null ? dayWord(days[i], now) : null));
    });
  }
  for (const f of FOCI) if (!seen.has(f)) out.push(item(f, null));
  for (const t of live) {
    if (focusOfName(t.name) != null) continue;
    out.push({ key: `t:${t.id}`, title: t.name, sel: { templateId: t.id }, when: null, next: false, ready: null, lifts: liftsOf(t.id) });
  }
  return out;
}
