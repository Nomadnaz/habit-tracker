// ─────────────────────────────────────────────────────────────────────────
// Active days — the year-of-dots on TODAY, the same dots as the puck's lög
// home screen. A day is "active" when anything was done on it.
//
// Two sources, merged (OR):
//   1. local stores (@tasks done, @habit_logs completed, @meals) — instant,
//      works offline, but blind to rows the puck wrote server-side until a
//      pull runs;
//   2. device-state's `active_days` bitmap — exactly what the puck renders
//      (tasks/habits/meals/focus/water/workouts/activities), fetched after.
// ─────────────────────────────────────────────────────────────────────────

import { useCallback, useState } from 'react';
import { useFocusEffect } from 'expo-router';
import AsyncStorage from '@react-native-async-storage/async-storage';
import { supabase, SUPABASE_URL, SUPABASE_ANON_KEY } from '@/lib/supabase';

export const dayOfYear = (d: Date) =>
  Math.round((Date.UTC(d.getFullYear(), d.getMonth(), d.getDate()) - Date.UTC(d.getFullYear(), 0, 1)) / 86400000);

export const daysInYear = (y: number) => (new Date(y, 1, 29).getMonth() === 1 ? 366 : 365);

function markKey(set: Set<number>, year: number, key: string) {
  const [y, m, d] = key.slice(0, 10).split('-').map(Number);
  if (y !== year || !m || !d) return;
  set.add(Math.round((Date.UTC(y, m - 1, d) - Date.UTC(y, 0, 1)) / 86400000));
}

async function readJson<T>(key: string): Promise<T | null> {
  try { const raw = await AsyncStorage.getItem(key); return raw ? (JSON.parse(raw) as T) : null; } catch { return null; }
}

export async function localActiveDays(year: number): Promise<Set<number>> {
  const set = new Set<number>();
  const tasks = await readJson<Record<string, { done?: boolean; archived?: boolean }[]>>('@tasks');
  for (const [k, list] of Object.entries(tasks ?? {})) if (list?.some(t => t.done)) markKey(set, year, k);
  const logs = await readJson<Record<string, { date: string; completed: boolean }[]>>('@habit_logs');
  for (const list of Object.values(logs ?? {})) for (const l of list ?? []) if (l.completed) markKey(set, year, l.date);
  const meals = await readJson<Record<string, unknown[]>>('@meals');
  for (const [k, list] of Object.entries(meals ?? {})) if (list?.length) markKey(set, year, k);
  return set;
}

export async function remoteActiveDays(year: number): Promise<Set<number> | null> {
  try {
    const { data: { session } } = await supabase.auth.getSession();
    if (!session) return null;
    const res = await fetch(`${SUPABASE_URL}/functions/v1/device-state?tz=${new Date().getTimezoneOffset()}`, {
      headers: { apikey: SUPABASE_ANON_KEY, Authorization: `Bearer ${session.access_token}` },
    });
    if (!res.ok) return null;
    const ad = (await res.json())?.active_days as { year: number; bits: string } | null;
    if (!ad || ad.year !== year) return null;
    const set = new Set<number>();
    for (let i = 0; i < ad.bits.length / 2; i++) {
      const b = parseInt(ad.bits.slice(i * 2, i * 2 + 2), 16);
      for (let j = 0; j < 8; j++) if (b & (1 << j)) set.add(i * 8 + j);
    }
    return set;
  } catch { return null; }
}

export interface ActiveDays { year: number; today: number; total: number; active: Set<number>; count: number; streak: number }

export function streakFrom(active: Set<number>, today: number) {
  let d = active.has(today) ? today : today - 1; // today isn't over yet
  let n = 0;
  while (d >= 0 && active.has(d)) { n++; d--; }
  return n;
}

export function useActiveDays(): ActiveDays {
  const now = new Date();
  const year = now.getFullYear();
  const today = dayOfYear(now);
  const [active, setActive] = useState<Set<number>>(new Set());

  useFocusEffect(useCallback(() => {
    let live = true;
    localActiveDays(year).then(local => {
      if (!live) return;
      setActive(local);
      remoteActiveDays(year).then(remote => {
        if (live && remote) setActive(new Set([...local, ...remote]));
      });
    });
    return () => { live = false; };
  }, [year]));

  return { year, today, total: daysInYear(year), active, count: active.size, streak: streakFrom(active, today) };
}
