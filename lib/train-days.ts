// TRAIN's calendar: one mark per day — lifted, ran, logged anything at all,
// marked missed, and (from today on) what the routine has planned. Pure, so
// it's tested; app/(tabs)/gym.tsx reads the stores and hands them in.
import { addDaysToKey, fromDateKey } from './dateKey';
import type { GymPlan, PlanDayValue } from './workout-data';

export type DayMark = {
  date: string;
  lifted: boolean;
  ran: boolean;
  /** Anything logged that day: food, water, a weigh-in, a lift or a run. */
  logged: boolean;
  missed: boolean;
  /** The routine's plan for the day (shown from today on). */
  plan: PlanDayValue;
};

const WEEKDAY: (keyof GymPlan)[] = ['sunday', 'monday', 'tuesday', 'wednesday', 'thursday', 'friday', 'saturday'];

export function dayMarks(input: {
  today: string; back: number; ahead: number;
  liftDays: string[]; runDays: string[]; loggedDays: string[]; missed: string[];
  plan: GymPlan | null;
}): DayMark[] {
  const lift = new Set(input.liftDays), run = new Set(input.runDays), missed = new Set(input.missed);
  const logged = new Set([...input.loggedDays, ...input.liftDays, ...input.runDays]);
  const out: DayMark[] = [];
  for (let i = -input.back; i <= input.ahead; i++) {
    const date = addDaysToKey(input.today, i);
    const wd = WEEKDAY[fromDateKey(date)!.getDay()];
    out.push({
      date, lifted: lift.has(date), ran: run.has(date), logged: logged.has(date), missed: missed.has(date),
      plan: i >= 0 && input.plan ? input.plan[wd] : null,
    });
  }
  return out;
}

/** Past days with nothing logged and not yet marked missed, since the first day
 *  anything was logged (days before you used the app aren't "missed"). */
export function blankDays(marks: DayMark[], today: string, within = 14): string[] {
  const first = marks.find(m => m.logged)?.date;
  if (!first) return [];
  const from = addDaysToKey(today, -within);
  return marks.filter(m => m.date < today && m.date >= from && m.date > first && !m.logged && !m.missed).map(m => m.date);
}
