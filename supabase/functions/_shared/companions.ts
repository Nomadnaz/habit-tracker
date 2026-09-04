// ─────────────────────────────────────────────────────────────────────────
// lib/companions.ts — AI companion configuration (task 007)
//
// Canonical per system-model.md: the companions are CONFIG OBJECTS over one
// ai-chat function + one buildContext. Adding a companion = one entry here,
// zero new code. Each entry declares the tables buildContext reads
// (contextSources), a system-prompt template, the model, and the actions the
// companion is allowed to emit.
//
// v1 shipped only the companions whose contextSources were LIVE at the time
// (tasks/user_focus/workout/body domains); calorie/activity/sleep were added
// once their domains landed (tasks 028-030, 031-032, 035-036 — task 037).
// The rest of the 14 land as their domains do. Models per system-model.md:
// Haiku 4.5 default, Sonnet 4.6 for complex routes.
// ─────────────────────────────────────────────────────────────────────────

export type CompanionModel = 'haiku' | 'sonnet';

export interface CompanionConfig {
  /** Default display name if the user hasn't set a persona name. */
  defaultName: string;
  /** Tables buildContext queries for this companion (must exist live). */
  contextSources: string[];
  /** Default model; classifier may upgrade simple→complex at call time. */
  model: CompanionModel;
  /** Template; {name}/{user_nickname}/{context} are filled by buildSystemPrompt. */
  systemPromptTemplate: string;
  /** Action names this companion may emit (gated; not auto-executed in v1). */
  actions: string[];
}

// Map the 'haiku'|'sonnet' tier to the current canonical model IDs.
// (Verified against the claude-api skill: Haiku 4.5 / Sonnet 4.6 — NOT the
// retired claude-3-5-* IDs an earlier draft used.)
export const MODEL_IDS: Record<CompanionModel, string> = {
  haiku: 'claude-haiku-4-5',
  sonnet: 'claude-sonnet-4-6',
};

const BASE_PERSONA = `You are {name}, the user's {domain} companion in their habit-tracking app.
User nickname: {user_nickname}.
Answer concisely and specifically, grounded ONLY in the context below — never invent
tasks, workouts, or numbers that aren't present. If the context doesn't contain the
answer, say so briefly rather than guessing.

If the context includes a FLAGS line (task 040), factor each flag into your tone and
suggestions: OVERREACHING = 6+ workouts in the last 7 days, suggest a rest day rather
than pushing harder. SLEEP_DEBT = 3+ nights under 7h this week, be gentler and suggest
prioritizing sleep. UNDERFUELLING / LOW_PROTEIN = trailing-3-day average calories/protein
more than 30% under the user's target, mention it if relevant to what they asked.
STRESS_SLEEP = elevated stress alongside sleep debt, treat these as compounding, not
separate issues. Never invent a flag that isn't listed.

When the user asks you to change something, emit the intended change as a single JSON
action block, but DO NOT assume it was executed:
<action>{"type": "<action_name>", "data": { ... }, "confidence": 0.0-1.0}</action>

Today's context:
{context}`;

export const companions: Record<string, CompanionConfig> = {
  habitCoach: {
    defaultName: 'Coach',
    // daily_steps added 2026-09-05: this is DEFAULT_COMPANION (see below) --
    // it's what answers "how many steps have I done today" from the
    // device's HUB page (no companionType routing applies there), and
    // without it in contextSources the model correctly says it has no
    // access, which reads as broken from a user asking a plain question.
    contextSources: ['tasks', 'user_focus', 'habit_logs', 'daily_steps', 'user_context_summary', 'vault'],
    model: 'haiku',
    systemPromptTemplate: BASE_PERSONA.replace('{domain}', 'habit & task'),
    // habitCoach is DEFAULT_COMPANION -- what the voice device gets when no
    // companionType is sent. It could create tasks but not log anything, so
    // "log a coffee" came back as "I can't add that to your app" while "add a
    // task" worked (reported on hardware 2026-08-28). Logging verbs belong on
    // the device's default companion.
    //
    // device-log is still the better path for this (it writes several items
    // from one sentence; ai-chat emits at most one action per turn). These
    // exist so a client that hasn't shipped the device-log routing yet can
    // still log a single item instead of being told to do it by hand.
    actions: [
      'create_task', 'reschedule_task', 'complete_task', 'remember_about_user',
      'log_meal', 'log_water', 'log_weight', 'toggle_habit',
    ],
  },
  life: {
    defaultName: 'Assistant',
    contextSources: ['tasks', 'user_focus', 'user_context_summary', 'vault'],
    model: 'haiku',
    systemPromptTemplate: BASE_PERSONA.replace('{domain}', 'schedule & tasks'),
    // Calendar/email actions are future + always-preview; none auto-run in v1.
    actions: ['create_task', 'reschedule_task', 'complete_task', 'remember_about_user'],
  },
  gym: {
    defaultName: 'Coach',
    contextSources: ['workout_done_log', 'pb_log', 'body_weight_logs', 'user_context_summary'],
    model: 'haiku',
    systemPromptTemplate: BASE_PERSONA.replace('{domain}', 'gym'),
    actions: ['log_pb', 'log_set', 'gym_checkin', 'set_gym_plan'],
  },
  focus: {
    defaultName: 'Focus',
    contextSources: ['user_focus', 'tasks', 'focus_sessions', 'user_context_summary'],
    model: 'haiku',
    systemPromptTemplate: BASE_PERSONA.replace('{domain}', 'deep-work & focus'),
    actions: ['log_focus_session'],
  },
  calorie: {
    defaultName: 'Fuel',
    // gym_plan added (task 041): lets Calorie AI factor in tomorrow's planned
    // session when asked e.g. "what's my protein target today".
    contextSources: ['meals', 'gym_plan', 'user_context_summary'],
    model: 'haiku',
    systemPromptTemplate: BASE_PERSONA.replace('{domain}', 'nutrition'),
    // log_water added 2026-09-01 (Code Audit v3): this, not habitCoach, is
    // the domain-relevant companion for "log a glass of water".
    actions: ['log_meal', 'log_water'],
  },
  activity: {
    defaultName: 'Trail',
    contextSources: ['activities', 'daily_steps', 'user_context_summary'],
    model: 'haiku',
    systemPromptTemplate: BASE_PERSONA.replace('{domain}', 'hike/run/walk'),
    actions: ['log_activity'],
  },
  sleep: {
    defaultName: 'Rest',
    // mood_logs added (task 041): stress/sleep correlation. Real HR context
    // is a stub until a wearable integration exists (task 048) — mood_logs'
    // stress_score is the closest live proxy today.
    contextSources: ['sleep_logs', 'sleep_phone_logs', 'mood_logs', 'user_context_summary'],
    model: 'haiku',
    systemPromptTemplate: BASE_PERSONA.replace('{domain}', 'sleep'),
    // log_sleep added 2026-09-01 (Code Audit v3): the executor + spec had
    // existed since day one, but no companion was ever allowed to call it —
    // "log 7 hours of sleep" to this companion went nowhere.
    actions: ['log_sleep'],
  },
  goals: {
    defaultName: 'Compass',
    // task 068's own acceptance criterion: goals AI references real habit/
    // workout data when discussing progress, not just the goals table itself.
    contextSources: ['goals', 'habit_logs', 'workout_done_log', 'user_context_summary'],
    model: 'haiku',
    systemPromptTemplate: BASE_PERSONA.replace('{domain}', 'goals'),
    actions: ['create_goal'],
  },
  mood: {
    defaultName: 'Anchor',
    // Deliberately mood_logs ONLY — never journal_entries/therapy_notes
    // (task 066's privacy acceptance criterion; those tables aren't even
    // written to yet, see supabase/migrations/019_mental_health.sql).
    contextSources: ['mood_logs', 'user_context_summary'],
    model: 'haiku',
    systemPromptTemplate: BASE_PERSONA.replace('{domain}', 'mood & wellbeing'),
    // log_mood added 2026-09-01 (Code Audit v3) — same dead-end gap as sleep.
    actions: ['log_mood'],
  },
  // The following 3 (Code Audit v2 fix plan P3): screens/tables have existed
  // since tasks 024/065/064, but had no companion config until now — config-
  // only, same pattern as the 9 above.
  medication: {
    defaultName: 'Vital',
    contextSources: ['medications', 'user_context_summary'],
    model: 'haiku',
    systemPromptTemplate: BASE_PERSONA.replace('{domain}', 'medication & supplement'),
    actions: ['log_medication'],
  },
  finance: {
    defaultName: 'Ledger',
    contextSources: ['expenses', 'bills', 'user_context_summary'],
    model: 'haiku',
    systemPromptTemplate: BASE_PERSONA.replace('{domain}', 'finance'),
    actions: ['log_expense'],
  },
  library: {
    defaultName: 'Stacks',
    contextSources: ['books', 'movies', 'saved_links', 'ideas', 'user_context_summary'],
    model: 'haiku',
    systemPromptTemplate: BASE_PERSONA.replace('{domain}', 'reading, watching & saved ideas'),
    // save_idea only -- books/movies/links need a real external lookup or
    // URL this action system doesn't have; a bare voice "save this idea"
    // has nowhere else it could honestly go wrong.
    actions: ['save_idea'],
  },
};

export type CompanionType = keyof typeof companions;

/** Safe default for the voice device when no companion is specified. */
export const DEFAULT_COMPANION: CompanionType = 'habitCoach';
