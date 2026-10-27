// LOG's feed: everything logged in the last week, newest first, grouped by
// day — meals, lifts, water, weigh-ins, sleep and mood — however it got in
// (typed, scanned, said to the puck or to the chat). Pure, so it's tested;
// app/(tabs)/log.tsx reads the stores and hands them in.

import { toDateKey } from './dateKey';
import type { HudModule } from './body-hud';

export type FeedItem = { key: string; at: number; kind: HudModule; text: string; value: string; via?: string };
export type FeedDay = { date: string; word: string; items: FeedItem[] };

export type FeedInput = {
  meals: { id: string; name: string; calories: number; createdAt: string; loggedVia: string; date?: string }[];
  sessions: { exerciseId: string; name: string; date: string; at: number; sets: number; weightKg: number; reps: number | null; measured: boolean }[];
  water: { amountMl: number; at: string }[];
  weight: { weightKg: number; at: string }[];
  sleep: { id: string; date: string; wakeTime?: string; totalHours?: number; createdAt: string }[];
  mood: { id: string; moodScore: number; createdAt: string }[];
};

const VIA: Record<string, string> = { photo: 'PHOTO', barcode: 'SCAN', ai_text: 'AI', quick_add: 'AGAIN' };
const DOW = ['SUN', 'MON', 'TUE', 'WED', 'THU', 'FRI', 'SAT'];
const MON = ['JAN', 'FEB', 'MAR', 'APR', 'MAY', 'JUN', 'JUL', 'AUG', 'SEP', 'OCT', 'NOV', 'DEC'];

/** Wake-up time on the wake-up day, else when the log was made. */
function sleepAt(s: FeedInput['sleep'][number]) {
  if (s.wakeTime && /^\d{1,2}:\d{2}$/.test(s.wakeTime)) {
    const [y, m, d] = s.date.split('-').map(Number);
    const [h, mi] = s.wakeTime.split(':').map(Number);
    return new Date(y, m - 1, d, h, mi).getTime();
  }
  return Date.parse(s.createdAt);
}

/** A meal sits on the day it was eaten (`date`), at the time it was logged:
 *  one added to yesterday from FUEL today belongs to yesterday. */
function mealAt(m: FeedInput['meals'][number]) {
  const t = new Date(m.createdAt);
  if (!m.date || !Number.isFinite(t.getTime()) || toDateKey(t) === m.date) return t.getTime();
  const [y, mo, d] = m.date.split('-').map(Number);
  t.setFullYear(y, mo - 1, d);
  return t.getTime();
}

const kg = (n: number) => (Number.isInteger(n) ? String(n) : n.toFixed(1));

export function buildFeed(input: FeedInput, now = new Date(), days = 7): FeedDay[] {
  const from = new Date(now.getFullYear(), now.getMonth(), now.getDate() - (days - 1)).getTime();
  const items: FeedItem[] = [
    ...input.meals.map(m => ({ key: `meal:${m.id}`, at: mealAt(m), kind: 'fuel' as const, text: m.name, value: `${Math.round(m.calories)} KCAL`, via: VIA[m.loggedVia] })),
    ...input.sessions.map(s => ({
      key: `lift:${s.exerciseId}:${s.date}`, at: s.at, kind: 'train' as const, text: s.name,
      value: `${s.sets}×${s.reps ?? '?'}${s.weightKg > 0 ? ` · ${kg(s.weightKg)} KG` : ''}`, via: s.measured ? 'PUCK' : undefined,
    })),
    ...input.water.map((w, i) => ({ key: `water:${w.at}:${i}`, at: Date.parse(w.at), kind: 'water' as const, text: 'Water', value: `+${Math.round(w.amountMl)} ML` })),
    ...input.weight.map((w, i) => ({ key: `weight:${w.at}:${i}`, at: Date.parse(w.at), kind: 'weight' as const, text: 'Weigh-in', value: `${kg(w.weightKg)} KG` })),
    ...input.sleep.filter(s => s.totalHours != null).map(s => ({ key: `sleep:${s.id}`, at: sleepAt(s), kind: 'sleep' as const, text: 'Slept', value: `${kg(Math.round(s.totalHours! * 10) / 10)} H` })),
    ...input.mood.map(m => ({ key: `mood:${m.id}`, at: Date.parse(m.createdAt), kind: 'mood' as const, text: 'Mood', value: `${m.moodScore}/10` })),
  ].filter(x => Number.isFinite(x.at) && x.at >= from && x.at <= now.getTime() + 60_000);

  items.sort((a, b) => b.at - a.at);
  const today = toDateKey(now);
  const yesterday = toDateKey(new Date(now.getFullYear(), now.getMonth(), now.getDate() - 1));
  const out: FeedDay[] = [];
  for (const it of items) {
    const d = new Date(it.at);
    const date = toDateKey(d);
    let day = out[out.length - 1];
    if (!day || day.date !== date) {
      const word = date === today ? 'TODAY' : date === yesterday ? 'YESTERDAY' : `${DOW[d.getDay()]} ${String(d.getDate()).padStart(2, '0')} ${MON[d.getMonth()]}`;
      day = { date, word, items: [] };
      out.push(day);
    }
    day.items.push(it);
  }
  return out;
}
