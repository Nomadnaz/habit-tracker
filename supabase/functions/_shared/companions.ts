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

// One AI, overarching access (2026-09-21): every companion below is a VOICE
// (name/tone/model), not a permissions boundary. Scoping contextSources/
// actions per companion was the direct cause of a recurring bug class --
// habitCoach (2026-08-28), gym/calorie/sleep/mood (2026-09-01/09), and life
// (2026-09-21, see companion_messages) each independently got "I can't do
// that" or a hallucinated confirmation for a perfectly normal request,
// purely because whichever tab/screen the request came from happened to map
// to a companion whose config hadn't been given that verb yet. The real
// safety boundary is Supabase RLS + buildContext/actionExecutor scoping
// every query and write to the authenticated userId -- a config object
// restricting which of the user's OWN data their OWN assistant can see or
// touch added confusion, not protection. Every companion now gets the full
// context and the full action set; classification of "what did they mean"
// is left entirely to the model reading the one merged system prompt.
// journal_entries/therapy_notes remain excluded (task 066's privacy
// criterion) simply by never appearing in ALL_CONTEXT_SOURCES at all -- no
// per-companion carve-out needed to keep that guarantee.
const ALL_CONTEXT_SOURCES = [
  'tasks', 'user_focus', 'habit_logs', 'daily_steps', 'meals', 'user_context_summary', 'vault',
  'workout_done_log', 'pb_log', 'body_weight_logs', 'focus_sessions', 'gym_plan', 'activities',
  'sleep_logs', 'sleep_phone_logs', 'mood_logs', 'goals', 'medications', 'expenses', 'bills',
  'books', 'movies', 'saved_links', 'ideas',
];

const ALL_ACTIONS = [
  'create_task', 'reschedule_task', 'complete_task', 'remember_about_user',
  'log_pb', 'log_set', 'log_meal', 'update_meal', 'delete_meal',
  'log_water', 'log_weight', 'toggle_habit',
  'log_sleep', 'log_mood', 'gym_checkin', 'log_focus_session', 'log_activity',
  'log_expense', 'log_medication', 'create_goal', 'save_idea', 'set_gym_plan',
];

export const companions: Record<string, CompanionConfig> = {
  habitCoach: {
    defaultName: 'Coach',
    contextSources: ALL_CONTEXT_SOURCES,
    model: 'haiku',
    systemPromptTemplate: BASE_PERSONA.replace('{domain}', 'habit & task'),
    actions: ALL_ACTIONS,
  },
  life: {
    defaultName: 'Assistant',
    contextSources: ALL_CONTEXT_SOURCES,
    model: 'haiku',
    systemPromptTemplate: BASE_PERSONA.replace('{domain}', 'schedule & tasks'),
    actions: ALL_ACTIONS,
  },
  gym: {
    defaultName: 'Coach',
    contextSources: ALL_CONTEXT_SOURCES,
    model: 'haiku',
    systemPromptTemplate: BASE_PERSONA.replace('{domain}', 'gym'),
    actions: ALL_ACTIONS,
  },
  focus: {
    defaultName: 'Focus',
    contextSources: ALL_CONTEXT_SOURCES,
    model: 'haiku',
    systemPromptTemplate: BASE_PERSONA.replace('{domain}', 'deep-work & focus'),
    actions: ALL_ACTIONS,
  },
  calorie: {
    defaultName: 'Fuel',
    contextSources: ALL_CONTEXT_SOURCES,
    model: 'haiku',
    systemPromptTemplate: BASE_PERSONA.replace('{domain}', 'nutrition'),
    actions: ALL_ACTIONS,
  },
  activity: {
    defaultName: 'Trail',
    contextSources: ALL_CONTEXT_SOURCES,
    model: 'haiku',
    systemPromptTemplate: BASE_PERSONA.replace('{domain}', 'hike/run/walk'),
    actions: ALL_ACTIONS,
  },
  sleep: {
    defaultName: 'Rest',
    contextSources: ALL_CONTEXT_SOURCES,
    model: 'haiku',
    systemPromptTemplate: BASE_PERSONA.replace('{domain}', 'sleep'),
    actions: ALL_ACTIONS,
  },
  goals: {
    defaultName: 'Compass',
    contextSources: ALL_CONTEXT_SOURCES,
    model: 'haiku',
    systemPromptTemplate: BASE_PERSONA.replace('{domain}', 'goals'),
    actions: ALL_ACTIONS,
  },
  mood: {
    defaultName: 'Anchor',
    contextSources: ALL_CONTEXT_SOURCES,
    model: 'haiku',
    systemPromptTemplate: BASE_PERSONA.replace('{domain}', 'mood & wellbeing'),
    actions: ALL_ACTIONS,
  },
  medication: {
    defaultName: 'Vital',
    contextSources: ALL_CONTEXT_SOURCES,
    model: 'haiku',
    systemPromptTemplate: BASE_PERSONA.replace('{domain}', 'medication & supplement'),
    actions: ALL_ACTIONS,
  },
  finance: {
    defaultName: 'Ledger',
    contextSources: ALL_CONTEXT_SOURCES,
    model: 'haiku',
    systemPromptTemplate: BASE_PERSONA.replace('{domain}', 'finance'),
    actions: ALL_ACTIONS,
  },
  library: {
    defaultName: 'Stacks',
    contextSources: ALL_CONTEXT_SOURCES,
    model: 'haiku',
    systemPromptTemplate: BASE_PERSONA.replace('{domain}', 'reading, watching & saved ideas'),
    actions: ALL_ACTIONS,
  },
};

export type CompanionType = keyof typeof companions;

/** Safe default for the voice device when no companion is specified. */
export const DEFAULT_COMPANION: CompanionType = 'habitCoach';
