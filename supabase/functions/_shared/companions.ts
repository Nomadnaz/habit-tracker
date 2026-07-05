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

When the user asks you to change something, emit the intended change as a single JSON
action block, but DO NOT assume it was executed:
<action>{"type": "<action_name>", "data": { ... }, "confidence": 0.0-1.0}</action>

Today's context:
{context}`;

export const companions: Record<string, CompanionConfig> = {
  habitCoach: {
    defaultName: 'Coach',
    contextSources: ['tasks', 'user_focus', 'habit_logs', 'user_context_summary'],
    model: 'haiku',
    systemPromptTemplate: BASE_PERSONA.replace('{domain}', 'habit & task'),
    actions: ['create_task', 'reschedule_task', 'complete_task'],
  },
  life: {
    defaultName: 'Assistant',
    contextSources: ['tasks', 'user_focus', 'user_context_summary'],
    model: 'haiku',
    systemPromptTemplate: BASE_PERSONA.replace('{domain}', 'schedule & tasks'),
    // Calendar/email actions are future + always-preview; none auto-run in v1.
    actions: ['create_task', 'reschedule_task'],
  },
  gym: {
    defaultName: 'Coach',
    contextSources: ['workout_done_log', 'pb_log', 'body_weight_logs', 'user_context_summary'],
    model: 'haiku',
    systemPromptTemplate: BASE_PERSONA.replace('{domain}', 'gym'),
    actions: ['log_pb'],
  },
  focus: {
    defaultName: 'Focus',
    contextSources: ['user_focus', 'tasks', 'user_context_summary'],
    model: 'haiku',
    systemPromptTemplate: BASE_PERSONA.replace('{domain}', 'deep-work & focus'),
    actions: [],
  },
  calorie: {
    defaultName: 'Fuel',
    contextSources: ['meals', 'user_context_summary'],
    model: 'haiku',
    systemPromptTemplate: BASE_PERSONA.replace('{domain}', 'nutrition'),
    // log_meal isn't wired to a real write yet (tasks/039) — declared here so
    // the model can emit it; actionExecutor.ts returns 'unsupported' for now.
    actions: ['log_meal'],
  },
  activity: {
    defaultName: 'Trail',
    contextSources: ['activities', 'user_context_summary'],
    model: 'haiku',
    systemPromptTemplate: BASE_PERSONA.replace('{domain}', 'hike/run/walk'),
    actions: [],
  },
  sleep: {
    defaultName: 'Rest',
    contextSources: ['sleep_logs', 'sleep_phone_logs', 'user_context_summary'],
    model: 'haiku',
    systemPromptTemplate: BASE_PERSONA.replace('{domain}', 'sleep'),
    actions: [],
  },
};

export type CompanionType = keyof typeof companions;

/** Safe default for the voice device when no companion is specified. */
export const DEFAULT_COMPANION: CompanionType = 'habitCoach';
