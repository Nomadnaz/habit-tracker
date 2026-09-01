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

import { localDateKey, localDateKeyPlusDays, localWeekday } from './localDate.ts';

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

// Epley formula — the standard estimate for what a lifter could do for one
// rep, given any weight x reps pair. Needed because raw weight is the wrong
// PB test once reps vary: 20kg x 10 (~26.7kg e1RM) beats 25kg x 3 (~27.5kg is
// actually still higher — the point is it's not simply "biggest weight_kg
// ever entered", which is what pb_log used to test).
const estimated1RM = (weightKg: number, reps: number): number =>
  weightKg * (1 + Math.max(0, reps) / 30);

// The best estimated-1RM this user has ever posted for an exercise, across
// both pb_log (manually-declared PBs) and exercise_sets (every logged set) —
// a set that was never explicitly called a "PB" can still be the true best.
async function bestEstimated1RM(
  supabase: SupabaseClient,
  userId: string,
  exerciseId: string,
): Promise<number> {
  const [pbRes, setsRes] = await Promise.all([
    supabase.from('pb_log').select('weight_kg, reps').eq('user_id', userId).eq('exercise_id', exerciseId),
    supabase.from('exercise_sets').select('estimated_1rm_kg').eq('user_id', userId).eq('exercise_id', exerciseId),
  ]);
  const fromPbs = (pbRes.data ?? []).map((r: { weight_kg: number; reps: number | null }) =>
    estimated1RM(r.weight_kg, r.reps ?? 1));
  const fromSets = (setsRes.data ?? []).map((r: { estimated_1rm_kg: number }) => r.estimated_1rm_kg);
  return Math.max(0, ...fromPbs, ...fromSets);
}

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
    const done = data.done === undefined ? true : data.done === true;
    const { data: updated, error } = await supabase
      .from('tasks')
      .update({ done })
      .eq('id', taskId)
      .eq('user_id', userId)
      .select('id')
      .maybeSingle();
    if (error) throw new Error(error.message);
    if (!updated) throw new Error(`complete_task: no task found with id ${taskId}`);
    return { id: taskId, table: 'tasks', done };
  },

  // "went to the gym today" -- a plain check-in, no template concept (that's
  // what workout_done_log's own template_id is for; this device/voice path
  // has no template, so it reuses the same 'device-checkin' sentinel id
  // device-state's button op already established, keeping repeat check-ins
  // the same day idempotent either way).
  gym_checkin: async (supabase, userId, data, tzOffsetMinutes) => {
    const date = resolveDateKey(data.date, tzOffsetMinutes);
    const { data: existing } = await supabase
      .from('workout_done_log').select('id').eq('user_id', userId).eq('date', date)
      .eq('workout_template_id', 'device-checkin').maybeSingle();
    if (existing) return { table: 'workout_done_log', date, already_logged: true };
    const { error } = await supabase.from('workout_done_log').insert({
      id: crypto.randomUUID(), user_id: userId, workout_template_id: 'device-checkin', date,
      duration_mins: num(data.durationMins) ?? num(data.duration_mins) ?? null,
    });
    if (error) throw new Error(error.message);
    return { table: 'workout_done_log', date };
  },

  log_focus_session: async (supabase, userId, data, tzOffsetMinutes) => {
    const mins = num(data.durationMins) ?? num(data.duration_mins);
    if (!mins || mins <= 0 || mins > 24 * 60) throw new Error('log_focus_session needs durationMins (1-1440)');
    const date = resolveDateKey(data.date, tzOffsetMinutes);
    const { error } = await supabase.from('focus_sessions').insert({
      id: crypto.randomUUID(), user_id: userId, date,
      duration_mins: Math.round(mins), source: 'device',
    });
    if (error) throw new Error(error.message);
    return { table: 'focus_sessions', date, duration_mins: Math.round(mins) };
  },

  // Retrospective ("I just ran 5k in 25 minutes") rather than live-tracked --
  // there's no route/GPS from a voice log, so start_time/end_time are backed
  // out from durationMins ending now. Matches activities' NOT NULL columns
  // without inventing a live-tracking concept that doesn't apply here.
  log_activity: async (supabase, userId, data, _tzOffsetMinutes) => {
    const type = str(data.type);
    if (!type || !['hike', 'run', 'walk'].includes(type)) {
      throw new Error('log_activity needs type: "hike" | "run" | "walk"');
    }
    const durationMins = num(data.durationMins) ?? num(data.duration_mins);
    if (!durationMins || durationMins <= 0) throw new Error('log_activity needs durationMins');
    const durationSecs = Math.round(durationMins * 60);
    const end = new Date();
    const start = new Date(end.getTime() - durationSecs * 1000);
    const distanceM = num(data.distanceM) ?? num(data.distance_m) ?? 0;
    const { error } = await supabase.from('activities').insert({
      id: crypto.randomUUID(), user_id: userId, type,
      start_time: start.toISOString(), end_time: end.toISOString(),
      duration_secs: durationSecs, distance_m: distanceM,
      notes: str(data.notes) ?? null,
    });
    if (error) throw new Error(error.message);
    return { table: 'activities', type, duration_secs: durationSecs, distance_m: distanceM };
  },

  log_expense: async (supabase, userId, data, tzOffsetMinutes) => {
    const amount = num(data.amount);
    if (amount === undefined) throw new Error('log_expense needs an amount');
    const date = resolveDateKey(data.date, tzOffsetMinutes);
    const { error } = await supabase.from('expenses').insert({
      id: crypto.randomUUID(), user_id: userId, amount,
      currency: str(data.currency) ?? 'USD',
      category: str(data.category) ?? 'other',
      note: str(data.note) ?? null, date,
    });
    if (error) throw new Error(error.message);
    return { table: 'expenses', amount, date };
  },

  // "I took my vitamin D" -- resolves by name against the user's own
  // `medications`, same inline exact-then-substring pattern toggle_habit
  // uses below (not worth extracting a shared matcher for a single caller).
  log_medication: async (supabase, userId, data, tzOffsetMinutes) => {
    const name = str(data.name) ?? str(data.medication);
    if (!name) throw new Error('log_medication needs a medication name');
    const { data: meds, error: mErr } = await supabase
      .from('medications').select('id, name').eq('user_id', userId);
    if (mErr) throw new Error(mErr.message);
    const want = name.toLowerCase().trim();
    const match = (meds ?? []).find((m: { name: string }) => m.name.toLowerCase().trim() === want)
      ?? (meds ?? []).find((m: { name: string }) => m.name.toLowerCase().includes(want));
    if (!match) {
      const known = (meds ?? []).map((m: { name: string }) => m.name).join(', ') || 'none';
      throw new Error(`no medication matching "${name}" (you have: ${known})`);
    }
    const date = resolveDateKey(data.date, tzOffsetMinutes);
    const taken = data.taken === undefined ? true : data.taken === true;
    const { error } = await supabase.from('medication_logs').upsert(
      {
        id: crypto.randomUUID(), user_id: userId, medication_id: match.id, date, taken,
        dose_taken: num(data.doseTaken) ?? num(data.dose_taken) ?? null,
      },
      { onConflict: 'medication_id,date' },
    );
    if (error) throw new Error(error.message);
    return { table: 'medication_logs', medication_id: match.id, name: match.name, date, taken };
  },

  // A new goal, not progress on an existing one -- matches create_task's
  // "voice creates a new thing" shape. Editing/completing a goal by voice is
  // deliberately not wired: "which goal, and to what?" is exactly the kind
  // of ambiguity this whole action system is built to avoid guessing at.
  create_goal: async (supabase, userId, data, tzOffsetMinutes) => {
    const title = str(data.title) ?? str(data.name);
    if (!title) throw new Error('create_goal needs a title');
    const { error } = await supabase.from('goals').insert({
      id: crypto.randomUUID(), user_id: userId, title,
      category: str(data.category) ?? null,
      target_date: data.targetDate ? resolveDateKey(data.targetDate, tzOffsetMinutes) : null,
      status: 'active',
    });
    if (error) throw new Error(error.message);
    return { table: 'goals', title };
  },

  // A quick capture, not a structured book/movie/link entry -- those need an
  // external lookup (Google Books/TMDB) or a real URL, neither of which a
  // spoken sentence reliably has. "Save this idea: ..." is the one library
  // shape a bare voice log can honestly serve.
  save_idea: async (supabase, userId, data, _tzOffsetMinutes) => {
    const content = str(data.content) ?? str(data.note) ?? str(data.name);
    if (!content) throw new Error('save_idea needs content');
    const { error } = await supabase.from('ideas').insert({
      id: crypto.randomUUID(), user_id: userId, content, tags: [],
    });
    if (error) throw new Error(error.message);
    return { table: 'ideas', content };
  },

  // gym_plan is one row per user (columns monday..sunday, each a free-text
  // session_type or null) -- a weekly SCHEDULE, not an event log, so unlike
  // every other action here this sets a slot forward in time rather than
  // recording something that already happened. Upserting only the touched
  // day column (PostgREST upsert only SETs the columns present in the
  // payload on conflict) leaves every other day untouched.
  set_gym_plan: async (supabase, userId, data, tzOffsetMinutes) => {
    const WEEKDAYS = ['sunday', 'monday', 'tuesday', 'wednesday', 'thursday', 'friday', 'saturday'];
    const sessionType = str(data.sessionType) ?? str(data.session) ?? str(data.type);
    if (!sessionType) throw new Error('set_gym_plan needs a sessionType');
    const raw = str(data.day)?.toLowerCase();
    let day: string;
    if (!raw || raw === 'today') day = WEEKDAYS[localWeekday(tzOffsetMinutes)];
    else if (raw === 'tomorrow') day = WEEKDAYS[(localWeekday(tzOffsetMinutes) + 1) % 7];
    else if (WEEKDAYS.includes(raw)) day = raw;
    else throw new Error(`set_gym_plan: unrecognized day "${raw}" (want a weekday, "today", or "tomorrow")`);

    const { error } = await supabase.from('gym_plan').upsert(
      { user_id: userId, [day]: sessionType, updated_at: new Date().toISOString() },
      { onConflict: 'user_id' },
    );
    if (error) throw new Error(error.message);
    return { table: 'gym_plan', day, sessionType };
  },

  log_pb: async (supabase, userId, data, tzOffsetMinutes) => {
    const exerciseId = str(data.exerciseId) ?? str(data.exercise_id);
    const weightKg = num(data.weightKg) ?? num(data.weight_kg);
    if (!exerciseId || weightKg === undefined) throw new Error('log_pb needs exerciseId + weightKg');
    const reps = num(data.reps) ?? 1;
    const e1rm = estimated1RM(weightKg, reps);
    const prevBest = await bestEstimated1RM(supabase, userId, exerciseId);
    if (e1rm <= prevBest) {
      throw new Error(`Not a PB — best estimated 1RM for this exercise is already ${prevBest.toFixed(1)}kg.`);
    }
    const row = {
      user_id: userId,
      exercise_id: exerciseId,
      weight_kg: weightKg,
      reps: num(data.reps) ?? null,
      date: resolveDateKey(data.date, tzOffsetMinutes),
    };
    const { error } = await supabase.from('pb_log').upsert(row, { onConflict: 'user_id,exercise_id,date' });
    if (error) throw new Error(error.message);
    return { table: 'pb_log', exercise_id: exerciseId, weight_kg: weightKg, estimated_1rm_kg: e1rm };
  },

  // A single set — weight/reps always spoken, rom/velocity/tempo measured by
  // the rep-sensor firmware when source is 'device' (that wiring doesn't
  // exist yet on the firmware/bridge side — see handover-8 — so today every
  // caller passes source: 'manual' or omits it). Also the real PB check: any
  // set can be the user's best estimated-1RM even if they never said "PB",
  // so this upserts pb_log too when it is one.
  log_set: async (supabase, userId, data, tzOffsetMinutes) => {
    const exerciseId = str(data.exerciseId) ?? str(data.exercise_id);
    const weightKg = num(data.weightKg) ?? num(data.weight_kg);
    const reps = num(data.reps);
    if (!exerciseId || weightKg === undefined || reps === undefined) {
      throw new Error('log_set needs exerciseId + weightKg + reps');
    }
    const date = resolveDateKey(data.date, tzOffsetMinutes);
    const e1rm = estimated1RM(weightKg, reps);
    const source = str(data.source) === 'device' ? 'device' : 'manual';
    const setRow = {
      id: crypto.randomUUID(),
      user_id: userId,
      exercise_id: exerciseId,
      date,
      weight_kg: weightKg,
      reps,
      estimated_1rm_kg: e1rm,
      rom_cm: num(data.romCm) ?? num(data.rom_cm) ?? null,
      peak_velocity_mps: num(data.peakVelocityMps) ?? num(data.peak_velocity_mps) ?? null,
      tempo_seconds: num(data.tempoSeconds) ?? num(data.tempo_seconds) ?? null,
      source,
    };
    const { error } = await supabase.from('exercise_sets').insert(setRow);
    if (error) throw new Error(error.message);

    const prevBest = await bestEstimated1RM(supabase, userId, exerciseId);
    let newPb = false;
    if (e1rm > prevBest) {
      const { error: pbError } = await supabase.from('pb_log').upsert(
        { user_id: userId, exercise_id: exerciseId, weight_kg: weightKg, reps, date },
        { onConflict: 'user_id,exercise_id,date' },
      );
      if (!pbError) newPb = true;
    }
    return { table: 'exercise_sets', exercise_id: exerciseId, weight_kg: weightKg, reps, estimated_1rm_kg: e1rm, new_pb: newPb };
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

  // ── Device voice-logging actions (task: device-log) ──────────────────────
  // These exist because the device has no local store to confirm into: it
  // speaks, the server writes, the screen shows what landed. Every one is a
  // plain append — nothing here can overwrite a value the user didn't just say.

  log_water: async (supabase, userId, data, _tz) => {
    const ml = num(data.amountMl) ?? num(data.amount_ml) ?? num(data.ml);
    if (ml === undefined || ml <= 0) throw new Error('log_water needs a positive amountMl');
    // Sanity bound: a single spoken drink above 3L is a mis-transcription
    // ("two litres" heard as "twenty"), and water_logs has no upper guard.
    if (ml > 3000) throw new Error(`log_water: ${ml}ml in one go is implausible — say it again?`);
    const row = { id: crypto.randomUUID(), user_id: userId, amount_ml: Math.round(ml) };
    const { error } = await supabase.from('water_logs').insert(row);
    if (error) throw new Error(error.message);
    return { id: row.id, table: 'water_logs', amount_ml: row.amount_ml };
  },

  log_weight: async (supabase, userId, data, _tz) => {
    const kg = num(data.weightKg) ?? num(data.weight_kg) ?? num(data.kg);
    if (kg === undefined) throw new Error('log_weight needs a weightKg');
    // Guards a spoken-unit mix-up (pounds read as kg) as much as a typo.
    if (kg < 20 || kg > 400) throw new Error(`log_weight: ${kg}kg is out of range — pounds by mistake?`);
    const row = { id: crypto.randomUUID(), user_id: userId, weight_kg: kg };
    const { error } = await supabase.from('body_weight_logs').insert(row);
    if (error) throw new Error(error.message);
    return { id: row.id, table: 'body_weight_logs', weight_kg: kg };
  },

  // Resolves either a direct habitId (device-state's button-tap path, which
  // already has one from the snapshot it just rendered) or a spoken habit
  // NAME (voice/chat, which never has an id and must not invent one).
  // Previously these were two separately-implemented dispatchers (one here
  // by name, one hand-rolled in device-state/index.ts by id) that could
  // silently drift; unified 2026-09-01 so both transports share one write.
  toggle_habit: async (supabase, userId, data, tzOffsetMinutes) => {
    const habitId = str(data.habitId) ?? str(data.id);
    let match: { id: string; name: string };
    if (habitId) {
      const { data: row, error } = await supabase
        .from('habits').select('id, name').eq('user_id', userId).eq('id', habitId).maybeSingle();
      if (error) throw new Error(error.message);
      if (!row) throw new Error(`no habit with id ${habitId}`);
      match = row;
    } else {
      const name = str(data.name) ?? str(data.habit) ?? str(data.label);
      if (!name) throw new Error('toggle_habit needs a habitId or a habit name');
      const { data: habits, error: hErr } = await supabase
        .from('habits').select('id, name').eq('user_id', userId).eq('active', true);
      if (hErr) throw new Error(hErr.message);

      const want = name.toLowerCase().trim();
      const found = (habits ?? []).find((h: { name: string }) => h.name.toLowerCase().trim() === want)
        ?? (habits ?? []).find((h: { name: string }) => h.name.toLowerCase().includes(want));
      if (!found) {
        const known = (habits ?? []).map((h: { name: string }) => h.name).join(', ') || 'none';
        throw new Error(`no habit matching "${name}" (you have: ${known})`);
      }
      match = found;
    }

    const date = resolveDateKey(data.date, tzOffsetMinutes);
    const completed = data.completed === undefined ? true : data.completed === true;
    // uq_habit_logs_habit_date makes saying it twice idempotent rather than a
    // duplicate-key error the user would hear as a failure.
    const { error } = await supabase
      .from('habit_logs')
      .upsert({ id: crypto.randomUUID(), user_id: userId, habit_id: match.id, date, completed },
              { onConflict: 'habit_id,date' });
    if (error) throw new Error(error.message);
    return { table: 'habit_logs', habit_id: match.id, name: match.name, date, completed };
  },

  log_sleep: async (supabase, userId, data, tzOffsetMinutes) => {
    const hours = num(data.totalHours) ?? num(data.total_hours) ?? num(data.hours);
    if (hours === undefined || hours <= 0 || hours > 24) throw new Error('log_sleep needs totalHours between 0 and 24');
    const date = resolveDateKey(data.date, tzOffsetMinutes);
    const quality = num(data.qualityScore) ?? num(data.quality_score);
    const { error } = await supabase.from('sleep_logs').upsert({
      id: crypto.randomUUID(), user_id: userId, date,
      total_hours: hours,
      quality_score: quality !== undefined ? Math.max(1, Math.min(5, Math.round(quality))) : null,
      source_device: 'manual',
    }, { onConflict: 'user_id,date' });
    if (error) throw new Error(error.message);
    return { table: 'sleep_logs', date, total_hours: hours };
  },

  log_mood: async (supabase, userId, data, tzOffsetMinutes) => {
    const score = num(data.moodScore) ?? num(data.mood_score) ?? num(data.score);
    if (score === undefined) throw new Error('log_mood needs a moodScore 1-10');
    const date = resolveDateKey(data.date, tzOffsetMinutes);
    const { error } = await supabase.from('mood_logs').upsert({
      id: crypto.randomUUID(), user_id: userId, date,
      mood_score: Math.max(1, Math.min(10, Math.round(score))),
      note: str(data.note) ?? null,
    }, { onConflict: 'user_id,date' });
    if (error) throw new Error(error.message);
    return { table: 'mood_logs', date, mood_score: Math.round(score) };
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
    'complete_task — mark a task done (or not done). data: { "taskId": string (the id shown in TASKS), "done"?: boolean (default true) }',
  log_pb:
    'log_pb — record a personal best. Rejected (throws) if it is not actually a new best estimated-1RM for that exercise. data: { "exerciseId": string, "weightKg": number, "reps"?: number, "date"?: "YYYY-MM-DD" }',
  log_set:
    'log_set — log one set (weight x reps). Always logs to exercise_sets; also updates pb_log if this set beats the exercise\'s best estimated-1RM. data: { "exerciseId": string, "weightKg": number, "reps": number, "date"?: "YYYY-MM-DD" }',
  log_meal:
    'log_meal — log a meal. data: { "name": string, "calories": number, "proteinG"?: number, "carbsG"?: number, "fatG"?: number, "mealType"?: "breakfast"|"lunch"|"dinner"|"snack", "date"?: "YYYY-MM-DD"|"today" }',
  remember_about_user:
    'remember_about_user — save a fact the user wants remembered for future conversations. data: { "note": string }',
  log_water:
    'log_water — log drinking water. data: { "amountMl": number }',
  log_weight:
    'log_weight — log a body-weight reading. data: { "weightKg": number }',
  toggle_habit:
    'toggle_habit — mark a habit done for a day. data: { "name": string (the habit\'s name as the user says it), "date"?: "YYYY-MM-DD"|"today", "completed"?: boolean }',
  log_sleep:
    'log_sleep — log a night\'s sleep. data: { "totalHours": number, "qualityScore"?: 1-5, "date"?: "YYYY-MM-DD"|"today" }',
  log_mood:
    'log_mood — log how the user feels. data: { "moodScore": 1-10, "note"?: string, "date"?: "YYYY-MM-DD"|"today" }',
  gym_checkin:
    'gym_checkin — mark a gym session as done today, no template. data: { "durationMins"?: number, "date"?: "YYYY-MM-DD"|"today" }',
  log_focus_session:
    'log_focus_session — log a completed focus/deep-work block. data: { "durationMins": number, "date"?: "YYYY-MM-DD"|"today" }',
  log_activity:
    'log_activity — log a run/hike/walk after the fact (no live GPS track). data: { "type": "run"|"hike"|"walk", "durationMins": number, "distanceM"?: number, "notes"?: string }',
  log_expense:
    'log_expense — log a spend. data: { "amount": number, "currency"?: string (default "USD"), "category"?: string, "note"?: string, "date"?: "YYYY-MM-DD"|"today" }',
  log_medication:
    'log_medication — mark a dose taken (or missed). data: { "name": string (medication name as the user says it), "taken"?: boolean (default true), "doseTaken"?: number, "date"?: "YYYY-MM-DD"|"today" }',
  create_goal:
    'create_goal — add a new goal. data: { "title": string, "category"?: string, "targetDate"?: "YYYY-MM-DD" }',
  save_idea:
    'save_idea — capture a quick idea (not a book/movie/link — those need a real lookup this action doesn\'t do). data: { "content": string }',
  set_gym_plan:
    'set_gym_plan — set the weekly gym plan for one day. data: { "day": "monday".."sunday"|"today"|"tomorrow", "sessionType": string (e.g. "push", "pull", "legs", "rest") }',
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
