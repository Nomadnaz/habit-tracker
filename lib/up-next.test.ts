import { describe, it, expect } from 'vitest';
import { upNext } from './up-next';
import type { Exercise, GymPlan } from './workout-data';

const ex = (id: string, movementType: Exercise['movementType']): Exercise =>
  ({ id, name: id.toUpperCase(), muscleGroups: [], movementType, sets: 3, reps: '8', weightKg: 50 });
const empty: GymPlan = { monday: null, tuesday: null, wednesday: null, thursday: null, friday: null, saturday: null, sunday: null };
const tpl = (id: string, name: string) => ({ id, name, colour: '#fff', isArchived: false });
const THU = new Date(2026, 9, 15); // a Thursday

describe('upNext', () => {
  const lib = [ex('bench', 'push'), ex('row', 'pull'), ex('squat', 'legs')];
  it('takes the next planned day and its template', () => {
    const plan = { ...empty, thursday: 'rest' as const, friday: 'push' as const };
    const n = upNext(plan, [tpl('t1', 'Push Day')], { t1: [lib[0]] }, lib, [], THU)!;
    expect(n).toMatchObject({ title: 'PUSH DAY', when: 'TOMORROW' });
    expect(n.exercises.map(e => e.id)).toEqual(['bench']);
  });
  it('counts today until it is done, and falls back to tagged exercises', () => {
    const plan = { ...empty, thursday: 'legs' as const, saturday: 'pull' as const };
    expect(upNext(plan, [], {}, lib, [], THU)).toMatchObject({ title: 'LEGS DAY', when: 'TODAY' });
    const after = upNext(plan, [], {}, lib, [{ date: '2026-10-15', templateId: 'x' }], THU)!;
    expect(after).toMatchObject({ title: 'PULL DAY', when: 'SAT' });
    expect(after.exercises.map(e => e.id)).toEqual(['row']);
  });
  it('without a plan, rotates to the template done longest ago', () => {
    const t = [tpl('a', 'Upper'), tpl('b', 'Lower')];
    const n = upNext(empty, t, { a: [lib[0]], b: [lib[2]] }, lib, [{ date: '2026-10-14', templateId: 'a' }], THU)!;
    expect(n.title).toBe('LOWER');
  });
});
