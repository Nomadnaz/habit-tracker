// ─────────────────────────────────────────────────────────────────────────
// Assistant — the app's half of the puck's hold-to-talk + a saved chat log.
//
// One pipeline for typed and spoken turns, the same contract ChatScreen.tsx
// uses: ai-chat WITHOUT execute, then 'auto' actions run locally through
// executeAction() so they land in the local-first stores and show at once
// (server-side execute would need a down-sync pull before the app saw it —
// see the habit-tracker-local-first notes). 'preview' actions become
// confirm cards; 'clarify' becomes the reply.
//
// UI state lives in a tiny external store (useSyncExternalStore) so the
// tab-bar dot, the REC overlay and the chat sheet can all drive it without
// a provider. Threads persist to AsyncStorage under @assistant_threads.
// ─────────────────────────────────────────────────────────────────────────

import { useSyncExternalStore } from 'react';
import { DeviceEventEmitter } from 'react-native';
import AsyncStorage from '@react-native-async-storage/async-storage';
import { supabase } from '@/lib/supabase';
import { executeAction, type ProcessedAction } from '@/lib/actionExecutor';
import { TASKS_CHANGED_EVENT } from '@/lib/use-remote-task-sync';

const THREADS_KEY = '@assistant_threads';

export interface Stat { value: string; unit: string }

export interface Msg {
  id: string;
  role: 'user' | 'assistant';
  text: string;
  at: number;
  voice?: boolean;
  stats?: Stat[];       // big-number chips, like the puck's confirm screen
  logged?: boolean;     // something was actually written
  error?: boolean;      // the turn failed (network / limit) — nothing happened
  pending?: ProcessedAction[]; // preview actions awaiting a tap
}

export interface Thread {
  id: string;
  title: string;
  createdAt: number;
  updatedAt: number;
  pinned?: boolean;
  messages: Msg[];
}

// IDLE → REC → TRANSCRIBE → THINK → DONE (or FAIL), mirroring screen_ask.c.
export type Phase = 'idle' | 'rec' | 'transcribe' | 'think' | 'done' | 'fail';

interface State {
  threads: Thread[];
  activeId: string | null;
  sheet: 'closed' | 'chat' | 'list';
  phase: Phase;
  transcript: string;
  reply: Msg | null;
  busy: boolean;
}

let state: State = {
  threads: [], activeId: null, sheet: 'closed',
  phase: 'idle', transcript: '', reply: null, busy: false,
};
const listeners = new Set<() => void>();
const set = (patch: Partial<State>) => {
  state = { ...state, ...patch };
  listeners.forEach(l => l());
};

export function useAssistant(): State {
  return useSyncExternalStore(
    (l) => { listeners.add(l); return () => listeners.delete(l); },
    () => state,
  );
}

const uid = () => `${Date.now().toString(36)}${Math.random().toString(36).slice(2, 7)}`;

// ── threads ──────────────────────────────────────────────────────────────

let loaded = false;
export async function loadThreads() {
  if (loaded) return;
  loaded = true;
  try {
    const raw = await AsyncStorage.getItem(THREADS_KEY);
    if (raw) set({ threads: JSON.parse(raw) });
  } catch { /* first run / corrupt → start empty */ }
}

function persist(threads: Thread[]) {
  set({ threads });
  AsyncStorage.setItem(THREADS_KEY, JSON.stringify(threads)).catch(() => {});
}

const sortThreads = (t: Thread[]) =>
  [...t].sort((a, b) => Number(!!b.pinned) - Number(!!a.pinned) || b.updatedAt - a.updatedAt);

export const activeThread = (): Thread | null =>
  state.threads.find(t => t.id === state.activeId) ?? null;

function ensureThread(firstText: string): Thread {
  const cur = activeThread();
  if (cur) return cur;
  const now = Date.now();
  const t: Thread = { id: uid(), title: titleFrom(firstText), createdAt: now, updatedAt: now, messages: [] };
  persist(sortThreads([t, ...state.threads]));
  set({ activeId: t.id });
  return t;
}

const titleFrom = (s: string) => {
  const clean = s.replace(/\s+/g, ' ').trim();
  return (clean.length > 32 ? clean.slice(0, 31) + '…' : clean).toUpperCase() || 'NEW CHAT';
};

function appendMsg(threadId: string, msg: Msg) {
  persist(sortThreads(state.threads.map(t =>
    t.id === threadId ? { ...t, updatedAt: msg.at, messages: [...t.messages, msg] } : t,
  )));
}

function patchMsg(threadId: string, msgId: string, patch: Partial<Msg>) {
  persist(state.threads.map(t =>
    t.id === threadId ? { ...t, messages: t.messages.map(m => (m.id === msgId ? { ...m, ...patch } : m)) } : t,
  ));
}

export const openChat = (id?: string | null) => set({ sheet: 'chat', activeId: id === undefined ? state.activeId : id });
export const openList = () => set({ sheet: 'list' });
/** The PUCK dot: carry on the conversation you just had, else start fresh. */
export const openFromDot = () => {
  const recent = [...state.threads].sort((a, b) => b.updatedAt - a.updatedAt)[0];
  const fresh = recent && Date.now() - recent.updatedAt < 30 * 60 * 1000;
  set({ sheet: 'chat', activeId: fresh ? recent!.id : null });
};
export const closeSheet = () => set({ sheet: 'closed' });
export const newChat = () => set({ sheet: 'chat', activeId: null });
export const togglePin = (id: string) =>
  persist(sortThreads(state.threads.map(t => (t.id === id ? { ...t, pinned: !t.pinned } : t))));
export const deleteThread = (id: string) => {
  persist(state.threads.filter(t => t.id !== id));
  if (state.activeId === id) set({ activeId: null });
};
export const renameThread = (id: string, title: string) =>
  persist(state.threads.map(t => (t.id === id ? { ...t, title: titleFrom(title) } : t)));

// ── the REC overlay's state machine ──────────────────────────────────────

export const recStart = () => set({ phase: 'rec', transcript: '', reply: null });
export const recCancel = () => set({ phase: 'idle', transcript: '', reply: null });
export const recTranscribing = () => set({ phase: 'transcribe' });
export const recFail = (text: string) =>
  set({ phase: 'fail', reply: { id: uid(), role: 'assistant', text, at: Date.now() } });
export const recDismiss = () => set({ phase: 'idle' });

// ── turn pipeline ────────────────────────────────────────────────────────

/** Big-number chips derived from what was actually written — never from the
 *  model's prose (same rule ai-chat's deviceActionSpeech() follows). */
function statsFor(a: ProcessedAction): Stat[] {
  const d = a.data ?? {};
  const n = (v: unknown) => (typeof v === 'number' && Number.isFinite(v) && v > 0 ? v : null);
  switch (a.type) {
    case 'log_meal': {
      const out: Stat[] = [];
      const kcal = n(d.calories); if (kcal) out.push({ value: String(Math.round(kcal)), unit: 'KCAL' });
      const p = n(d.proteinG ?? d.protein_g); if (p) out.push({ value: `${Math.round(p)}G`, unit: 'PROTEIN' });
      const c = n(d.carbsG ?? d.carbs_g); if (c) out.push({ value: `${Math.round(c)}G`, unit: 'CARBS' });
      const f = n(d.fatG ?? d.fat_g); if (f) out.push({ value: `${Math.round(f)}G`, unit: 'FAT' });
      return out.slice(0, 4);
    }
    case 'log_water': { const ml = n(d.amountMl ?? d.amount_ml); return ml ? [{ value: String(ml), unit: 'ML' }] : []; }
    case 'log_weight': { const kg = n(d.weightKg ?? d.weight_kg); return kg ? [{ value: String(kg), unit: 'KG' }] : []; }
    case 'log_set': {
      const out: Stat[] = [];
      const kg = n(d.weightKg ?? d.weight_kg); if (kg) out.push({ value: String(kg), unit: 'KG' });
      const r = n(d.reps); if (r) out.push({ value: String(r), unit: 'REPS' });
      return out;
    }
    case 'log_sleep': { const h = n(d.hours ?? d.durationHours); return h ? [{ value: String(h), unit: 'HRS' }] : []; }
    default: return [];
  }
}

async function runActions(actions: ProcessedAction[]) {
  const done: string[] = [];
  const stats: Stat[] = [];
  for (const a of actions.filter(x => x.status === 'auto')) {
    try {
      const { summary } = await executeAction(a);
      done.push(summary);
      stats.push(...statsFor(a));
    } catch (e: any) {
      done.push(e?.message || `Couldn't ${a.type.replace(/_/g, ' ')}.`);
    }
  }
  if (done.length) DeviceEventEmitter.emit(TASKS_CHANGED_EVENT);
  return { done, stats: stats.slice(0, 4) };
}

/** Send one turn. Resolves to the assistant message that was appended. */
export async function send(text: string, opts: { voice?: boolean } = {}): Promise<Msg> {
  const clean = text.trim();
  const thread = ensureThread(clean);
  const history = thread.messages.slice(-10).map(m => ({ role: m.role, content: m.text }));
  appendMsg(thread.id, { id: uid(), role: 'user', text: clean, at: Date.now(), voice: opts.voice });
  set({ busy: true });
  if (opts.voice) set({ phase: 'think', transcript: clean });

  let reply: Msg;
  try {
    const { data, error } = await supabase.functions.invoke('ai-chat', {
      body: {
        message: clean,
        conversationHistory: history,
        tzOffsetMinutes: new Date().getTimezoneOffset(),
      },
    });
    if (error) throw error;
    const actions: ProcessedAction[] = Array.isArray(data?.actions) ? data.actions : [];
    const { done, stats } = await runActions(actions);
    const clarify = actions.filter(a => a.status === 'clarify').map(a => a.message).filter(Boolean);
    const pending = actions.filter(a => a.status === 'preview');
    const prose = String(data?.response ?? '').trim();
    reply = {
      id: uid(), role: 'assistant', at: Date.now(),
      text: [prose, ...clarify].filter(Boolean).join('\n') || (done.length ? done.join(' · ') : 'Done.'),
      stats: stats.length ? stats : undefined,
      logged: done.length > 0,
      pending: pending.length ? pending : undefined,
    };
    if (done.length && !stats.length) reply.text = done.map(d => `✓ ${d}`).join('\n') + (prose ? `\n${prose}` : '');
  } catch (e: any) {
    const status = e?.context?.status ?? e?.status;
    reply = {
      id: uid(), role: 'assistant', at: Date.now(),
      text: status === 429 ? "Hit today's AI limit." : "Couldn't reach the AI — try again.",
      error: true,
    };
  }
  appendMsg(thread.id, reply);
  set({ busy: false, reply });
  if (opts.voice) set({ phase: reply.error ? 'fail' : 'done' });
  return reply;
}

/** Confirm a preview card inside a saved message. */
export async function confirmPending(threadId: string, msgId: string, action: ProcessedAction) {
  const t = state.threads.find(x => x.id === threadId);
  const m = t?.messages.find(x => x.id === msgId);
  if (!m) return;
  try {
    const { summary } = await executeAction({ ...action, status: 'auto' });
    DeviceEventEmitter.emit(TASKS_CHANGED_EVENT);
    patchMsg(threadId, msgId, { pending: m.pending?.filter(a => a !== action && a.type + JSON.stringify(a.data) !== action.type + JSON.stringify(action.data)) });
    appendMsg(threadId, { id: uid(), role: 'assistant', text: `✓ ${summary}`, at: Date.now(), logged: true, stats: statsFor(action) });
  } catch (e: any) {
    appendMsg(threadId, { id: uid(), role: 'assistant', text: e?.message || "Couldn't complete that.", at: Date.now() });
  }
}

export async function transcribe(base64Wav: string): Promise<string> {
  const { data, error } = await supabase.functions.invoke('transcribe', { body: { audio: base64Wav, lang: 'en' } });
  if (error) return '';
  return String(data?.transcript ?? '').trim();
}
