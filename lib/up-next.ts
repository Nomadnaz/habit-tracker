// UP NEXT — the next training day, for the BODY tab's UP NEXT lens: its name
// ("PUSH DAY"), when, and the exercises it will hold.
//
// With a weekly plan (TRAIN's day planner), it's the next planned day from
// today — today included until it's ticked off. Its exercises are the
// template named for that day ("PUSH DAY"), else every exercise tagged with
// that movement. Without a plan, it's whichever template was done longest
// ago (or never): the next one in the rotation.

import type { DoneEntry, Exercise, GymPlan, WorkoutTemplate } from './workout-data';
import { toDateKey } from './dateKey';

export type UpNext = { title: string; when: string; exercises: Exercise[] };

const DOW: (keyof GymPlan)[] = ['sunday', 'monday', 'tuesday', 'wednesday', 'thursday', 'friday', 'saturday'];
const SHORT = ['SUN', 'MON', 'TUE', 'WED', 'THU', 'FRI', 'SAT'];
const MOVES: Record<string, Exercise['movementType'][]> = {
  push: ['push'], pull: ['pull'], legs: ['legs', 'lower'], upper: ['upper', 'push', 'pull'], lower: ['lower', 'legs'],
};

export function upNext(
  plan: GymPlan, templates: WorkoutTemplate[], templateExercises: Record<string, Exercise[]>,
  library: Exercise[], done: DoneEntry[], today: Date,
): UpNext | null {
  const live = templates.filter(t => !t.isArchived);
  const todayKey = toDateKey(today);
  const doneToday = done.some(d => d.date === todayKey);

  for (let i = doneToday ? 1 : 0; i < 8; i++) {
    const day = new Date(today.getFullYear(), today.getMonth(), today.getDate() + i);
    const move = plan[DOW[day.getDay()]];
    if (!move || move === 'rest' || move === 'cheat') continue;
    const when = i === 0 ? 'TODAY' : i === 1 ? 'TOMORROW' : SHORT[day.getDay()];
    const named = live.find(t => t.name.toUpperCase().includes(move.toUpperCase()));
    const exercises = named?.id && templateExercises[named.id]?.length
      ? templateExercises[named.id]
      : library.filter(e => MOVES[move]?.includes(e.movementType));
    return { title: `${move.toUpperCase()} DAY`, when, exercises };
  }

  // No plan: the template done longest ago, or never.
  const last = (id: string) => done.filter(d => d.templateId === id).reduce((a, d) => (d.date > a ? d.date : a), '');
  const next = live.filter(t => templateExercises[t.id]?.length).sort((a, b) => last(a.id).localeCompare(last(b.id)))[0];
  if (!next) return null;
  return { title: next.name.toUpperCase(), when: 'NEXT UP', exercises: templateExercises[next.id] };
}
