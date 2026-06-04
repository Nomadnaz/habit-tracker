import AsyncStorage from '@react-native-async-storage/async-storage';
import { supabase } from '@/lib/supabase';

export const FOCUS_SETTINGS_KEY = '@focus';

export const FOCUS_BLOCKS = [
  { minutes: 25, label: '25 MIN BLOCK', breakMins: 5 },
  { minutes: 45, label: '45 MIN BLOCK', breakMins: 10 },
  { minutes: 60, label: '60 MIN BLOCK', breakMins: 15 },
  { minutes: 90, label: '90 MIN BLOCK', breakMins: 20 },
] as const;

export const DEFAULT_BLOCK_IDX = 3;
export const DEFAULT_WORK_MINS = FOCUS_BLOCKS[DEFAULT_BLOCK_IDX].minutes;
export const DEFAULT_BREAK_MINS = FOCUS_BLOCKS[DEFAULT_BLOCK_IDX].breakMins;

export type FocusSettings = {
  name: string;
  blockIdx: number;
  workMins: number;
  breakMins: number;
};

export function durationsForBlockIdx(blockIdx: number): { workMins: number; breakMins: number } {
  const block = FOCUS_BLOCKS[blockIdx] ?? FOCUS_BLOCKS[DEFAULT_BLOCK_IDX];
  return { workMins: block.minutes, breakMins: block.breakMins };
}

export function inferBlockIdx(workMins: number, breakMins: number, fallback = DEFAULT_BLOCK_IDX): number {
  const exact = FOCUS_BLOCKS.findIndex(b => b.minutes === workMins && b.breakMins === breakMins);
  return exact >= 0 ? exact : fallback;
}

export function focusBlockDisplayLabel(workMins: number, breakMins: number, blockIdx: number): string {
  const preset = FOCUS_BLOCKS.find(b => b.minutes === workMins && b.breakMins === breakMins);
  if (preset) return preset.label;
  return `${workMins} MIN · ${breakMins} MIN BREAK`;
}

export function parseFocusSettings(raw: string | null): FocusSettings | null {
  if (!raw) return null;
  try {
    const parsed = JSON.parse(raw) as Partial<FocusSettings>;
    if (typeof parsed.name !== 'string') return null;
    const blockIdx =
      typeof parsed.blockIdx === 'number' &&
      parsed.blockIdx >= 0 &&
      parsed.blockIdx < FOCUS_BLOCKS.length
        ? parsed.blockIdx
        : DEFAULT_BLOCK_IDX;
    const fromBlock = durationsForBlockIdx(blockIdx);
    const workMins =
      typeof parsed.workMins === 'number' && parsed.workMins > 0
        ? Math.round(parsed.workMins)
        : fromBlock.workMins;
    const breakMins =
      typeof parsed.breakMins === 'number' && parsed.breakMins > 0
        ? Math.round(parsed.breakMins)
        : fromBlock.breakMins;
    return {
      name: parsed.name,
      blockIdx: inferBlockIdx(workMins, breakMins, blockIdx),
      workMins,
      breakMins,
    };
  } catch {
    return null;
  }
}

export async function readFocusSettingsLocal(): Promise<FocusSettings | null> {
  const raw = await AsyncStorage.getItem(FOCUS_SETTINGS_KEY);
  return parseFocusSettings(raw);
}

export async function writeFocusSettingsLocal(settings: FocusSettings): Promise<void> {
  await AsyncStorage.setItem(FOCUS_SETTINGS_KEY, JSON.stringify(settings));
}

export async function readFocusSettingsFromSupabase(
  userId: string,
): Promise<FocusSettings | null> {
  const { data: row, error } = await supabase
    .from('user_focus')
    .select('name, block_idx, work_mins, break_mins')
    .eq('user_id', userId)
    .maybeSingle();

  if (error) {
    console.warn('[focus] Supabase load failed:', error.message);
    return null;
  }
  if (!row) return null;

  const blockIdx =
    typeof row.block_idx === 'number' &&
    row.block_idx >= 0 &&
    row.block_idx < FOCUS_BLOCKS.length
      ? row.block_idx
      : DEFAULT_BLOCK_IDX;
  const fromBlock = durationsForBlockIdx(blockIdx);
  const workMins =
    typeof row.work_mins === 'number' && row.work_mins > 0
      ? Math.round(row.work_mins)
      : fromBlock.workMins;
  const breakMins =
    typeof row.break_mins === 'number' && row.break_mins > 0
      ? Math.round(row.break_mins)
      : fromBlock.breakMins;

  return {
    name: row.name ?? '',
    blockIdx: inferBlockIdx(workMins, breakMins, blockIdx),
    workMins,
    breakMins,
  };
}

export async function writeFocusSettingsSupabase(
  userId: string,
  settings: FocusSettings,
): Promise<void> {
  const { error } = await supabase.from('user_focus').upsert(
    {
      user_id: userId,
      name: settings.name,
      block_idx: settings.blockIdx,
      work_mins: settings.workMins,
      break_mins: settings.breakMins,
      updated_at: new Date().toISOString(),
    },
    { onConflict: 'user_id' },
  );
  if (error) console.warn('[focus] Supabase save failed:', error.message);
}

/** Merge partial updates, persist locally, and sync to Supabase when logged in. */
export async function saveFocusSettings(
  patch: Partial<FocusSettings> & { name?: string },
  userId?: string | null,
): Promise<FocusSettings> {
  const current = (await readFocusSettingsLocal()) ?? {
    name: '',
    blockIdx: DEFAULT_BLOCK_IDX,
    workMins: DEFAULT_WORK_MINS,
    breakMins: DEFAULT_BREAK_MINS,
  };

  const blockIdx = patch.blockIdx ?? current.blockIdx;
  const fromBlock = durationsForBlockIdx(blockIdx);
  const workMins = patch.workMins ?? current.workMins ?? fromBlock.workMins;
  const breakMins = patch.breakMins ?? current.breakMins ?? fromBlock.breakMins;

  const next: FocusSettings = {
    name: patch.name !== undefined ? patch.name : current.name,
    blockIdx: inferBlockIdx(workMins, breakMins, blockIdx),
    workMins,
    breakMins,
  };

  await writeFocusSettingsLocal(next);
  if (userId) await writeFocusSettingsSupabase(userId, next);
  return next;
}

export async function persistTimerDurations(
  workMins: number,
  breakMins: number,
  userId?: string | null,
): Promise<void> {
  const current = await readFocusSettingsLocal();
  await saveFocusSettings(
    {
      name: current?.name ?? '',
      blockIdx: current?.blockIdx ?? DEFAULT_BLOCK_IDX,
      workMins,
      breakMins,
    },
    userId,
  );
}
