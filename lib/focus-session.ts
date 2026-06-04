import AsyncStorage from '@react-native-async-storage/async-storage';

export const FOCUS_SESSION_KEY = '@focus_session';
export { FOCUS_SETTINGS_KEY } from '@/lib/focus-settings';

export type FocusPhase = 'focus' | 'break';

export type PersistedFocusSession = {
  secsLeft: number;
  phase: FocusPhase;
  running: boolean;
  strikes: number;
  round: number;
  started: boolean;
  savedAt: number;
  workSecs: number;
  breakSecs: number;
  focusName: string;
};

export function hasPersistedFocusSession(raw: string | null): boolean {
  if (!raw) return false;
  try {
    const s = JSON.parse(raw) as PersistedFocusSession;
    return s.started === true;
  } catch {
    return false;
  }
}

export function parseFocusNameFromSettings(raw: string | null): string {
  if (!raw) return '';
  try {
    const parsed = JSON.parse(raw) as { name?: unknown };
    return typeof parsed.name === 'string' ? parsed.name.trim() : '';
  } catch {
    return '';
  }
}

/** Keep an in-progress session label in sync with TODAY's focus name. */
export function getEffectiveSecsLeft(session: PersistedFocusSession): number {
  if (!session.running) return Math.max(0, session.secsLeft);
  const elapsed = Math.floor((Date.now() - session.savedAt) / 1000);
  return Math.max(0, session.secsLeft - elapsed);
}

export function formatSessionRemainingLabel(secs: number, phase: FocusPhase): string {
  const m = Math.floor(secs / 60);
  const s = secs % 60;
  const mm = String(m).padStart(2, '0');
  const ss = String(s).padStart(2, '0');
  return phase === 'break' ? `${mm}:${ss} BREAK LEFT` : `${mm}:${ss} FOCUS LEFT`;
}

export async function loadActiveFocusSession(): Promise<PersistedFocusSession | null> {
  const raw = await AsyncStorage.getItem(FOCUS_SESSION_KEY);
  if (!hasPersistedFocusSession(raw)) return null;
  try {
    return JSON.parse(raw!) as PersistedFocusSession;
  } catch {
    return null;
  }
}

export async function patchPersistedSessionFocusName(name: string): Promise<void> {
  const trimmed = name.trim();
  if (!trimmed) return;

  const raw = await AsyncStorage.getItem(FOCUS_SESSION_KEY);
  if (!hasPersistedFocusSession(raw)) return;

  const s = JSON.parse(raw!) as PersistedFocusSession;
  const next = trimmed.toUpperCase();
  if (s.focusName === next) return;

  s.focusName = next;
  await AsyncStorage.setItem(FOCUS_SESSION_KEY, JSON.stringify(s));
}
