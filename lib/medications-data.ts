// ─────────────────────────────────────────────────────────────────────────
// MEDICATIONS & SUPPLEMENTS — LOCAL DATA LAYER
// ─────────────────────────────────────────────────────────────────────────
// Same local-first pattern as lib/habits-data.ts (which mirrors
// lib/meals-data.ts): everything lives in AsyncStorage for instant/offline
// reads, mutations fire-and-forget to Supabase and run postWrite(). Streak +
// heatmap reuse the exact same shape as habits (computeStreak/HeatmapCell)
// so the Habits screen's MEDS toggle can reuse HeatmapCalendar directly.
// Adherence % and course progress are the two things habits don't need.
// ─────────────────────────────────────────────────────────────────────────

import AsyncStorage from '@react-native-async-storage/async-storage';
import { supabase } from './supabase';
import { toDateKey } from './dateKey';
import { postWrite } from './postWrite';
import { computeStreak, type StreakInfo, type HeatmapCell } from './habits-data';

function genId() { return Math.random().toString(36).slice(2) + Date.now().toString(36); }
async function getUid(): Promise<string | null> {
  const { data } = await supabase.auth.getUser();
  return data.user?.id ?? null;
}
function bg(fn: () => Promise<unknown>) { fn().catch(() => {}); }

const MEDS_KEY = '@medications';
const LOGS_KEY = '@medication_logs'; // Record<medicationId, MedicationLog[]>

export type MedType = 'medication' | 'supplement';

export type Medication = {
  id: string;
  name: string;
  type: MedType;
  doseAmount?: number;
  doseUnit?: string;
  courseStart?: string;   // canonical YYYY-MM-DD
  courseLength?: number;  // total days
  active: boolean;
  createdAt: string;
};

export type MedicationLog = {
  id: string;
  medicationId: string;
  date: string; // canonical YYYY-MM-DD
  taken: boolean;
  createdAt: string;
};

// ── Medications: load / mutate ───────────────────────────────────────────────

async function loadMeds(): Promise<Medication[]> {
  try {
    const raw = await AsyncStorage.getItem(MEDS_KEY);
    if (raw) return JSON.parse(raw) as Medication[];
  } catch { /* fall through */ }
  return [];
}

async function saveMeds(meds: Medication[]): Promise<void> {
  await AsyncStorage.setItem(MEDS_KEY, JSON.stringify(meds));
}

export async function getActiveMedications(): Promise<Medication[]> {
  const meds = await loadMeds();
  return meds.filter(m => m.active);
}

export async function addMedication(input: {
  name: string; type: MedType; doseAmount?: number; doseUnit?: string; courseLength?: number;
}): Promise<Medication> {
  const now = new Date();
  const med: Medication = {
    id: genId(),
    name: input.name,
    type: input.type,
    doseAmount: input.doseAmount,
    doseUnit: input.doseUnit,
    courseStart: input.courseLength ? toDateKey(now) : undefined,
    courseLength: input.courseLength,
    active: true,
    createdAt: now.toISOString(),
  };
  const meds = await loadMeds();
  await saveMeds([...meds, med]);

  bg(async () => {
    const userId = await getUid();
    if (!userId) return;
    await supabase.from('medications').insert({
      id: med.id, user_id: userId, name: med.name, type: med.type,
      dose_amount: med.doseAmount ?? null, dose_unit: med.doseUnit ?? null,
      course_start: med.courseStart ?? null, course_length: med.courseLength ?? null,
      active: true,
    });
  });
  return med;
}

export async function deleteMedication(medicationId: string): Promise<void> {
  const meds = await loadMeds();
  await saveMeds(meds.filter(m => m.id !== medicationId));

  const logMap = await loadLogMap();
  delete logMap[medicationId];
  await saveLogMap(logMap);

  bg(async () => { await supabase.from('medications').delete().eq('id', medicationId); });
}

// ── Medication logs: load / mutate ───────────────────────────────────────────

type LogMap = Record<string, MedicationLog[]>;

async function loadLogMap(): Promise<LogMap> {
  try {
    const raw = await AsyncStorage.getItem(LOGS_KEY);
    if (raw) return JSON.parse(raw) as LogMap;
  } catch { /* fall through */ }
  return {};
}

async function saveLogMap(map: LogMap): Promise<void> {
  await AsyncStorage.setItem(LOGS_KEY, JSON.stringify(map));
}

export async function getLogsForMedication(medicationId: string): Promise<MedicationLog[]> {
  const map = await loadLogMap();
  return map[medicationId] ?? [];
}

export function isDoseTakenOnDate(logs: MedicationLog[], dateKey: string): boolean {
  return logs.some(l => l.date === dateKey && l.taken);
}

/** Toggle today's dose for a medication. Returns the new taken state. */
export async function toggleTodayDose(med: Medication): Promise<boolean> {
  const today = toDateKey(new Date());
  const map = await loadLogMap();
  const logs = map[med.id] ?? [];
  const existing = logs.find(l => l.date === today);

  let nextTaken: boolean;
  let record: MedicationLog;
  if (existing) {
    nextTaken = !existing.taken;
    record = { ...existing, taken: nextTaken };
    map[med.id] = logs.map(l => (l.id === existing.id ? record : l));
  } else {
    nextTaken = true;
    record = { id: genId(), medicationId: med.id, date: today, taken: true, createdAt: new Date().toISOString() };
    map[med.id] = [...logs, record];
  }
  await saveLogMap(map);

  bg(async () => {
    const userId = await getUid();
    if (!userId) return;
    await supabase.from('medication_logs').upsert(
      { id: record.id, user_id: userId, medication_id: med.id, date: today, taken: nextTaken, dose_taken: nextTaken ? (med.doseAmount ?? null) : null },
      { onConflict: 'medication_id,date' },
    );
  });

  postWrite('medication', { medication_id: med.id, date: today, taken: nextTaken }, existing ? 'update' : 'create');

  return nextTaken;
}

// ── Adherence + course progress ──────────────────────────────────────────────

export type { StreakInfo, HeatmapCell };

export function computeMedStreak(logs: MedicationLog[]): StreakInfo {
  return computeStreak(logs.map(l => ({ date: l.date, completed: l.taken })));
}

/** % of the trailing 30 days (or fewer, if the medication is younger) taken. */
export function computeAdherence30d(med: Medication, logs: MedicationLog[]): number {
  const takenDates = new Set(logs.filter(l => l.taken).map(l => l.date));
  const createdKey = toDateKey(new Date(med.createdAt));
  const now = new Date();

  let windowDays = 0;
  let takenCount = 0;
  for (let i = 0; i < 30; i++) {
    const key = toDateKey(new Date(now.getTime() - i * 86400000));
    if (key < createdKey) break; // don't count days before the medication existed
    windowDays += 1;
    if (takenDates.has(key)) takenCount += 1;
  }
  if (windowDays === 0) return 0;
  return Math.round((takenCount / windowDays) * 100);
}

/** 'Day X of Y' when a course length is set, else null (ongoing/no course). */
export function courseProgress(med: Medication): { day: number; total: number } | null {
  if (!med.courseLength || !med.courseStart) return null;
  const start = new Date(med.courseStart);
  const elapsed = Math.floor((Date.now() - start.getTime()) / 86400000) + 1;
  return { day: Math.min(Math.max(elapsed, 1), med.courseLength), total: med.courseLength };
}

/** Reuses habits-data's heatmap shape so HeatmapCalendar works unmodified. */
export function buildMedHeatmap(med: Medication, logs: MedicationLog[], days = 35): HeatmapCell[] {
  const takenDates = new Set(logs.filter(l => l.taken).map(l => l.date));
  const createdKey = toDateKey(new Date(med.createdAt));
  const cells: HeatmapCell[] = [];
  const now = new Date();
  for (let i = days - 1; i >= 0; i--) {
    const key = toDateKey(new Date(now.getTime() - i * 86400000));
    const state: HeatmapCell['state'] = key < createdKey ? 'before' : takenDates.has(key) ? 'done' : 'missed';
    cells.push({ date: key, state });
  }
  return cells;
}
