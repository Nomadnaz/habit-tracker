// ─────────────────────────────────────────────────────────────────────────
// supabase/functions/_shared/actionExecutor.ts — action gating + execution
// (tasks 012 + 039)
//
// The model emits intents as <action>{ "type", "data", "confidence" }</action>
// blocks (parsed by ai-chat/index.ts). This module decides what to DO with each
// one, per the canonical confidence gate (system-model.md):
//
//   confidence > 0.85  → 'auto'   (act now, no confirmation needed)
//   0.6 – 0.85         → 'preview' (user confirms first)
//   < 0.6              → 'clarify' (ask the user what they meant)
//
// HARD RULE: every external/irreversible action (email, LinkedIn, Stripe,
// external calendar, …) ALWAYS gates to 'preview' — a high confidence score can
// never bypass it. Unwired action types return 'unsupported'.
//
// IMPORTANT — who executes:
//   The habit-tracker app is LOCAL-FIRST: tasks live in on-device storage and
//   every write fans out to on-device storage + Supabase + Apple Calendar. So
//   the APP must perform task writes itself (lib/actionExecutor.ts), or they'd
//   never appear in the UI or Apple. Therefore this function GATES BY DEFAULT
//   and does NOT write — it returns each action's gate decision and lets the
//   app act. Server-side execution stays available (opts.execute) for clients
//   with no local store (e.g. a future device path once Supabase→local sync
//   exists), but is OFF by default.
// ─────────────────────────────────────────────────────────────────────────

import { localDateKey, localDateKeyPlusDays } from './localDate.ts';

// deno-lint-ignore no-explicit-any
type SupabaseClient = any;

export const EXECUTE_THRESHOLD = 0.85;
export const PREVIEW_THRESHOLD = 0.6;

export type ActionStatus =
  | 'auto' // high confidence — the client should act now, no confirmation
  | 'preview' // needs user confirmation (medium confidence OR external)
  | 'clarify' // too uncertain — ask the user
  | 'unsupported' // known-but-not-wired or unknown action type
  | 'executed' // server executed it (opts.execute path) successfully
  | 'failed'; // server tried to execute, the write errored

export interface CompanionAction {
  type: string;
  data?: Record<string, unknown>;
  confidence?: number;
}

export interface ProcessedAction extends CompanionAction {
  status: ActionStatus;
  /** Human-readable note for the UI / device. */
  message?: string;
  /** The created/updated record id when an internal write executed. */
  result?: Record<string, unknown>;
}

// External / irreversible actions — ALWAYS preview, regardless of confidence.
const EXTERNAL_ACTIONS = new Set<string>([
  'send_email',
  'send_message',
  'post_linkedin',
  'charge_stripe',
  'create_payment',
  'add_to_external_calendar',
  'book_event',
]);

// Internal actions we actually know how to write today. Anything not here (but
// referenced by a companion config) returns 'unsupported' until it's wired.
type InternalExecutor = (
  supabase: SupabaseClient,
  userId: string,
  data: Record<string, unknown>,
  tzOffsetMinutes: number,
) => Promise<Record<string, unknown>>;

const str = (v: unknown): string | undefined =>
  typeof v === 'string' && v.trim() ? v.trim() : undefined;
const num = (v: unknown): number | undefined =>
  typeof v === 'number' && Number.isFinite(v) ? v : undefined;

// Resolve a model-supplied date into a YYYY-MM-DD key (handles today/tomorrow),
// in the CALLER's local time via tzOffsetMinutes — see _shared/localDate.ts
// for why this exists (audit 2026-07-06: this used to be UTC-only, resolving
// to the wrong calendar day for anyone west of UTC from evening onward).
const resolveDateKey = (v: unknown, tzOffsetMinutes = 0): string => {
  const s = str(v)?.toLowerCase();
  if (!s || s === 'today') return localDateKey(tzOffsetMinutes);
  if (s === 'tomorrow') return localDateKeyPlusDays(1, tzOffsetMinutes);
  if (/^\d{4}-\d{2}-\d{2}$/.test(s)) return s;
  return localDateKey(tzOffsetMinutes);
};

const INTERNAL_EXECUTORS: Record<string, InternalExecutor> = {
  // "add gym tomorrow at 6" → a real row in `tasks`.
  create_task: async (supabase, userId, data, tzOffsetMinutes) => {
    const label = str(data.label) ?? str(data.title) ?? str(data.name);
    if (!label) throw new Error('create_task needs a label');
    const row = {
      id: crypto.randomUUID(),
      user_id: userId,
      date: resolveDateKey(data.date, tzOffsetMinutes),
      label,
      done: false,
      archived: false,
      priority: str(data.priority) ?? null,
      hour: num(data.hour) ?? null,
      minute: num(data.minute) ?? null,
      duration_mins: num(data.durationMins) ?? num(data.duration_mins) ?? null,
      location: str(data.location) ?? null,
    };
    const { error } = await supabase.from('tasks').insert(row);
    if (error) throw new Error(error.message);
    return { id: row.id, table: 'tasks', date: row.date, label: row.label };
  },

  reschedule_task: async (supabase, userId, data, tzOffsetMinutes) => {
    const taskId = str(data.taskId) ?? str(data.id);
    if (!taskId) throw new Error('reschedule_task needs a taskId');
    const patch: Record<string, unknown> = {};
    if (str(data.date)) patch.date = resolveDateKey(data.date, tzOffsetMinutes);
    if (num(data.hour) !== undefined) patch.hour = num(data.hour);
    if (num(data.minute) !== undefined) patch.minute = num(data.minute);
    if (str(data.priority)) patch.priority = str(data.priority);
    if (Object.keys(patch).length === 0) throw new Error('reschedule_task needs a new date, time, or priority');
    // The model reads taskId out of TASKS in its own context, but nothing
    // stops it hallucinating one — the .eq('user_id', ...) filter already
    // makes a wrong id a no-op rather than a cross-user write, but a plain
    // update() returns no error for 0-rows-affected, so a hallucinated id
    // silently "succeeded" with nothing changed (audit 2026-07-06). Selecting
    // the updated row back turns that into a real failure the caller sees.
    const { data: updated, error } = await supabase
      .from('tasks')
      .update(patch)
      .eq('id', taskId)
      .eq('user_id', userId)
      .select('id')
      .maybeSingle();
    if (error) throw new Error(error.message);
    if (!updated) throw new Error(`reschedule_task: no task found with id ${taskId}`);
    return { id: taskId, table: 'tasks', ...patch };
  },

  complete_task: async (supabase, userId, data, _tzOffsetMinutes) => {
    const taskId = str(data.taskId) ?? str(data.id);
    if (!taskId) throw new Error('complete_task needs a taskId');
    const { data: updated, error } = await supabase
      .from('tasks')
      .update({ done: true })
      .eq('id', taskId)
      .eq('user_id', userId)
      .select('id')
      .maybeSingle();
    if (error) throw new Error(error.message);
    if (!updated) throw new Error(`complete_task: no task found with id ${taskId}`);
    return { id: taskId, table: 'tasks', done: true };
  },

  log_pb: async (supabase, userId, data, tzOffsetMinutes) => {
    const exerciseId = str(data.exerciseId) ?? str(data.exercise_id);
    const weightKg = num(data.weightKg) ?? num(data.weight_kg);
    if (!exerciseId || weightKg === undefined) throw new Error('log_pb needs exerciseId + weightKg');
    const row = {
      user_id: userId,
      exercise_id: exerciseId,
      weight_kg: weightKg,
      reps: num(data.reps) ?? null,
      date: resolveDateKey(data.date, tzOffsetMinutes),
    };
    const { error } = await supabase.from('pb_log').insert(row);
    if (error) throw new Error(error.message);
    return { table: 'pb_log', exercise_id: exerciseId, weight_kg: weightKg };
  },

  // Code Audit v2 fix plan B4: buildContext.ts renders "NOTES YOU'VE SAVED"
  // from user_context_summary.assistant_notes_md, but nothing ever wrote that
  // column — the AI could not remember anything a user told it to remember.
  // Appends one bullet, deduping exact repeats and capping growth so the
  // notes block can't unboundedly inflate every future prompt.
  remember_about_user: async (supabase, userId, data, _tzOffsetMinutes) => {
    const note = str(data.note) ?? str(data.fact) ?? str(data.text);
    if (!note) throw new Error('remember_about_user needs a note');
    const { data: existing } = await supabase
      .from('user_context_summary')
      .select('assistant_notes_md')
      .eq('user_id', userId)
      .maybeSingle();
    const bullet = `- ${note}`;
    const lines = (existing?.assistant_notes_md ?? '').split('\n').filter((l: string) => l.trim());
    if (lines.includes(bullet)) return { table: 'user_context_summary', note, deduped: true };
    const MAX_NOTES = 30; // bound prompt growth — oldest notes roll off
    const nextMd = [...lines, bullet].slice(-MAX_NOTES).join('\n');
    const { error } = await supabase
      .from('user_context_summary')
      .upsert({ user_id: userId, assistant_notes_md: nextMd, notes_updated_at: new Date().toISOString() }, { onConflict: 'user_id' });
    if (error) throw new Error(error.message);
    return { table: 'user_context_summary', note };
  },

  // Calorie companion's only declared action (used to return 'unsupported'
  // unconditionally — audit 2026-07-06 found it was never wired).
  log_meal: async (supabase, userId, data, tzOffsetMinutes) => {
    const name = str(data.name) ?? str(data.label) ?? 'Meal';
    const calories = num(data.calories) ?? 0;
    const row = {
      id: crypto.randomUUID(),
      user_id: userId,
      date: resolveDateKey(data.date, tzOffsetMinutes),
      meal_type: str(data.mealType) ?? str(data.meal_type) ?? 'snack',
      name,
      calories,
      protein_g: num(data.proteinG) ?? num(data.protein_g) ?? 0,
      carbs_g: num(data.carbsG) ?? num(data.carbs_g) ?? 0,
      fat_g: num(data.fatG) ?? num(data.fat_g) ?? 0,
      logged_via: 'manual',
    };
    const { error } = await supabase.from('meals').insert(row);
    if (error) throw new Error(error.message);
    return { id: row.id, table: 'meals', date: row.date, name: row.name, calories: row.calories };
  },
};

/** True for action types the app/device can run as internal Supabase writes. */
export const isInternalAction = (type: string): boolean => type in INTERNAL_EXECUTORS;
export const isExternalAction = (type: string): boolean => EXTERNAL_ACTIONS.has(type);

// Human/model-readable schema for each action, injected into the system prompt
// so the model emits the EXACT type + data fields the executor understands.
export const ACTION_SPECS: Record<string, string> = {
  create_task:
    'create_task — add a new task. data: { "label": string, "date": "YYYY-MM-DD" | "today" | "tomorrow", "hour"?: 0-23, "minute"?: 0-59, "priority"?: "LOW"|"MEDIUM"|"HIGH" }',
  reschedule_task:
    'reschedule_task — change an existing task\'s date/time/priority. data: { "taskId": string (the id shown in TASKS), "date"?: "YYYY-MM-DD"|"today"|"tomorrow", "hour"?: 0-23, "minute"?: 0-59, "priority"?: "LOW"|"MEDIUM"|"HIGH" }',
  complete_task:
    'complete_task — mark a task done. data: { "taskId": string (the id shown in TASKS) }',
  log_pb:
    'log_pb — record a personal best. data: { "exerciseId": string, "weightKg": number, "reps"?: number, "date"?: "YYYY-MM-DD" }',
  log_meal:
    'log_meal — log a meal. data: { "name": string, "calories": number, "proteinG"?: number, "carbsG"?: number, "fatG"?: number, "mealType"?: "breakfast"|"lunch"|"dinner"|"snack", "date"?: "YYYY-MM-DD"|"today" }',
  remember_about_user:
    'remember_about_user — save a fact the user wants remembered for future conversations. data: { "note": string }',
};

/** Pure gate: the action's decision BEFORE anyone writes anything. */
export function gateAction(action: CompanionAction): 'auto' | 'preview' | 'clarify' | 'unsupported' {
  const confidence = num(action.confidence) ?? 0;
  // External/irreversible: never auto, never silently drop — always preview.
  if (isExternalAction(action.type)) return 'preview';
  if (!isInternalAction(action.type)) return 'unsupported';
  if (confidence > EXECUTE_THRESHOLD) return 'auto';
  if (confidence >= PREVIEW_THRESHOLD) return 'preview';
  return 'clarify';
}

/**
 * Gate every action. By default (opts.execute !== true) this performs NO writes
 * — it just returns each action's gate decision so a local-first client can act
 * on it. When opts.execute is true, high-confidence INTERNAL actions are written
 * server-side (for clients with no local store); those come back 'executed' /
 * 'failed'.
 */
export async function processActions(
  supabase: SupabaseClient,
  userId: string,
  actions: CompanionAction[],
  opts: { execute?: boolean; tzOffsetMinutes?: number } = {},
): Promise<ProcessedAction[]> {
  const out: ProcessedAction[] = [];
  for (const action of actions) {
    const gate = gateAction(action);
    if (gate !== 'auto' || !opts.execute) {
      out.push({ ...action, status: gate, message: statusMessage(gate, action) });
      continue;
    }
    // opts.execute && high-confidence internal → run it server-side now.
    try {
      const result = await INTERNAL_EXECUTORS[action.type](supabase, userId, action.data ?? {}, opts.tzOffsetMinutes ?? 0);
      out.push({ ...action, status: 'executed', result, message: `Done: ${action.type}` });
    } catch (err) {
      out.push({
        ...action,
        status: 'failed',
        message: err instanceof Error ? err.message : 'action failed',
      });
    }
  }
  return out;
}

function statusMessage(status: 'auto' | 'preview' | 'clarify' | 'unsupported', action: CompanionAction): string {
  switch (status) {
    case 'auto':
      return `${action.type}`;
    case 'preview':
      return isExternalAction(action.type)
        ? `${action.type} needs your confirmation (external action).`
        : `Confirm to ${action.type}.`;
    case 'clarify':
      return `Not sure what you meant by "${action.type}" — can you clarify?`;
    case 'unsupported':
      return `"${action.type}" is not yet supported.`;
  }
}
