// ─────────────────────────────────────────────────────────────────────────
// supabase/functions/_shared/buildContext.ts — canonical context builder (task 010)
//
// Given a userId + the companion's contextSources, runs parallel queries over
// the LIVE tables and returns a compact, model-ready context string. This is
// "the AI parsing the user's information": grounding happens here, at read
// time, before any model call.
//
// Runs with the SERVICE-ROLE client (bypasses RLS) but every query is scoped
// by user_id, so it only ever reads the calling user's own rows.
// ─────────────────────────────────────────────────────────────────────────

import { localDateKey, localDateKeyPlusDays, localWeekday } from './localDate.ts';

// deno-lint-ignore no-explicit-any
type SupabaseClient = any;

export interface ContextResult {
  /** Compact text block injected into the system prompt. */
  text: string;
  /** Raw per-source data, for callers that want structured access. */
  raw: Record<string, unknown>;
}

export async function buildContext(
  supabase: SupabaseClient,
  userId: string,
  contextSources: string[],
  tzOffsetMinutes = 0,
  // The user's message, for relevance-ranked sources (currently only
  // 'vault' FTS). Optional so existing callers (daily-briefing) are
  // untouched; without it the vault source is skipped.
  userMessage = '',
): Promise<ContextResult> {
  const raw: Record<string, unknown> = {};
  const lines: string[] = [];
  const want = (s: string) => contextSources.includes(s);

  // tzOffsetMinutes is the client's `new Date().getTimezoneOffset()` (JS
  // convention: positive when local is behind UTC). An audit (2026-07-06)
  // found TODAY/the gym_plan "tomorrow" line/the flag windows below all used
  // UTC, reporting the wrong calendar day for anyone west of UTC from
  // roughly evening onward — the exact bug that would make "tomorrow is leg
  // day" name the wrong day. See _shared/localDate.ts. Defaults to 0 (UTC)
  // for callers that don't send it yet (daily-briefing, the voice device).
  const today = localDateKey(tzOffsetMinutes);
  const lookbackKey = localDateKeyPlusDays(-14, tzOffsetMinutes);
  // The model has no clock — tell it today's date so it can judge
  // today / upcoming / overdue. Without this it can't answer "what's due today".
  lines.push(`TODAY: ${today} (use this to decide what is due today vs upcoming vs overdue).`);

  const jobs: Promise<void>[] = [];

  if (want('tasks')) {
    jobs.push((async () => {
      const { data } = await supabase
        .from('tasks')
        .select('id, label, date, hour, minute, done, priority, location')
        .eq('user_id', userId)
        .eq('archived', false)
        .gte('date', lookbackKey)
        .order('date', { ascending: true })
        .limit(40);
      raw.tasks = data ?? [];
      if (data?.length) {
        lines.push('TASKS (last 2 weeks + upcoming):');
        for (const t of data) {
          const time = t.hour != null ? ` @ ${String(t.hour).padStart(2, '0')}:${String(t.minute ?? 0).padStart(2, '0')}` : '';
          // Include the id so reschedule_task / complete_task can reference it.
          lines.push(`- [${t.done ? 'x' : ' '}] (id:${t.id}) ${t.date}${time} ${t.label}`);
        }
      } else {
        lines.push('TASKS: none upcoming.');
      }
    })());
  }

  if (want('user_focus')) {
    jobs.push((async () => {
      const { data } = await supabase
        .from('user_focus')
        .select('name, work_mins, break_mins, block_idx')
        .eq('user_id', userId)
        .maybeSingle();
      raw.user_focus = data ?? null;
      if (data) {
        lines.push(`FOCUS: "${data.name ?? 'session'}" — ${data.work_mins ?? '?'}m work / ${data.break_mins ?? '?'}m break.`);
      }
    })());
  }

  if (want('workout_done_log')) {
    jobs.push((async () => {
      const { data } = await supabase
        .from('workout_done_log')
        .select('workout_template_id, date, duration_mins')
        .eq('user_id', userId)
        .order('date', { ascending: false })
        .limit(8);
      raw.workout_done_log = data ?? [];
      if (data?.length) {
        lines.push(`RECENT WORKOUTS: ${data.length} in the last sessions (latest ${data[0].date}).`);
      } else {
        lines.push('RECENT WORKOUTS: none logged.');
      }
    })());
  }

  if (want('pb_log')) {
    jobs.push((async () => {
      const { data } = await supabase
        .from('pb_log')
        .select('exercise_id, weight_kg, reps, date')
        .eq('user_id', userId)
        .order('date', { ascending: false })
        .limit(10);
      raw.pb_log = data ?? [];
      if (data?.length) {
        lines.push('PERSONAL BESTS (recent):');
        for (const p of data.slice(0, 5)) {
          lines.push(`- ${p.exercise_id}: ${p.weight_kg}kg${p.reps ? ` x${p.reps}` : ''} (${p.date})`);
        }
      }
    })());
  }

  if (want('body_weight_logs')) {
    jobs.push((async () => {
      const { data } = await supabase
        .from('body_weight_logs')
        .select('weight_kg, logged_at')
        .eq('user_id', userId)
        .order('logged_at', { ascending: false })
        .limit(1);
      raw.body_weight_logs = data ?? [];
      if (data?.length) lines.push(`BODY WEIGHT: ${data[0].weight_kg}kg (latest).`);
    })());
  }

  if (want('water_logs')) {
    jobs.push((async () => {
      const { data } = await supabase
        .from('water_logs')
        .select('amount_ml, logged_at')
        .eq('user_id', userId)
        .gte('logged_at', `${today}T00:00:00`)
        .limit(50);
      raw.water_logs = data ?? [];
      const total = (data ?? []).reduce((s: number, r: { amount_ml?: number }) => s + (r.amount_ml ?? 0), 0);
      if (total > 0) lines.push(`WATER TODAY: ${total}ml.`);
    })());
  }

  if (want('user_context_summary')) {
    jobs.push((async () => {
      // Canonical shape: profile_md / assistant_notes_md (task 057), NOT a
      // generic context_json. Regenerated daily by the briefing job.
      const { data } = await supabase
        .from('user_context_summary')
        .select('profile_md, assistant_notes_md')
        .eq('user_id', userId)
        .maybeSingle();
      raw.user_context_summary = data ?? null;
      if (data?.profile_md) lines.push(`PROFILE:\n${data.profile_md}`);
      if (data?.assistant_notes_md) lines.push(`NOTES YOU'VE SAVED:\n${data.assistant_notes_md}`);
    })());
  }

  if (want('habit_logs')) {
    jobs.push((async () => {
      const { data: habits } = await supabase
        .from('habits')
        .select('id, name')
        .eq('user_id', userId)
        .eq('active', true)
        .limit(20);
      if (!habits?.length) { raw.habit_logs = []; lines.push('HABITS: none tracked yet.'); return; }

      const { data: logs } = await supabase
        .from('habit_logs')
        .select('habit_id, date, completed')
        .in('habit_id', habits.map((h: { id: string }) => h.id))
        .gte('date', lookbackKey)
        .eq('completed', true);
      raw.habit_logs = logs ?? [];

      lines.push('HABITS (completions, last 2 weeks):');
      for (const h of habits) {
        const count = (logs ?? []).filter((l: { habit_id: string }) => l.habit_id === h.id).length;
        lines.push(`- ${h.name}: ${count}/14 days`);
      }
    })());
  }

  if (want('meals')) {
    jobs.push((async () => {
      const [{ data }, { data: targets }] = await Promise.all([
        supabase
          .from('meals')
          .select('date, meal_type, name, calories, protein_g')
          .eq('user_id', userId)
          .gte('date', localDateKeyPlusDays(-3, tzOffsetMinutes))
          .order('date', { ascending: false })
          .limit(30),
        supabase.from('nutrition_targets').select('calories, protein_g').eq('user_id', userId).maybeSingle(),
      ]);
      raw.meals = data ?? [];
      raw.nutrition_targets = targets ?? null;
      if (data?.length) {
        const todayTotal = data.filter((m: { date: string }) => m.date === today)
          .reduce((s: number, m: { calories?: number }) => s + (m.calories ?? 0), 0);
        lines.push(`MEALS TODAY: ${todayTotal} cal logged so far.`);
        if (targets?.calories) lines.push(`CALORIE TARGET: ${targets.calories}/day, protein target ${targets.protein_g ?? '?'}g/day.`);
        lines.push('RECENT MEALS (last 3 days):');
        for (const m of data.slice(0, 10)) lines.push(`- ${m.date} ${m.meal_type}: ${m.name} (${m.calories} cal, ${m.protein_g ?? 0}g protein)`);
      } else {
        lines.push('MEALS: none logged in the last 3 days.');
      }
    })());
  }

  if (want('gym_plan')) {
    jobs.push((async () => {
      // Task 041: Calorie AI factoring in tomorrow's gym session (e.g. to
      // answer "what's my protein target today" with tomorrow's leg day in mind).
      const { data } = await supabase.from('gym_plan').select('*').eq('user_id', userId).maybeSingle();
      raw.gym_plan = data ?? null;
      if (data) {
        const days = ['sunday', 'monday', 'tuesday', 'wednesday', 'thursday', 'friday', 'saturday'];
        const todayIdx = localWeekday(tzOffsetMinutes);
        const tomorrow = days[(todayIdx + 1) % 7];
        const tomorrowPlan = data[tomorrow];
        lines.push(`GYM PLAN: tomorrow (${tomorrow}) is ${tomorrowPlan || 'a rest day'}.`);
      }
    })());
  }

  if (want('activities')) {
    jobs.push((async () => {
      const { data } = await supabase
        .from('activities')
        .select('type, start_time, distance_m, duration_secs')
        .eq('user_id', userId)
        .gte('start_time', new Date(Date.now() - 14 * 86400000).toISOString())
        .order('start_time', { ascending: false })
        .limit(10);
      raw.activities = data ?? [];
      if (data?.length) {
        lines.push('RECENT ACTIVITY (last 2 weeks):');
        for (const a of data) {
          const km = ((a.distance_m ?? 0) / 1000).toFixed(1);
          const mins = Math.round((a.duration_secs ?? 0) / 60);
          lines.push(`- ${a.type} ${km}km in ${mins}min (${String(a.start_time).slice(0, 10)})`);
        }
      } else {
        lines.push('RECENT ACTIVITY: none logged in the last 2 weeks.');
      }
    })());
  }

  if (want('sleep_logs') || want('sleep_phone_logs')) {
    jobs.push((async () => {
      if (want('sleep_logs')) {
        const { data } = await supabase
          .from('sleep_logs')
          .select('date, total_hours, quality_score')
          .eq('user_id', userId)
          .gte('date', localDateKeyPlusDays(-7, tzOffsetMinutes))
          .order('date', { ascending: false })
          .limit(7);
        raw.sleep_logs = data ?? [];
        if (data?.length) {
          const avg = data.reduce((s: number, d: { total_hours?: number }) => s + (d.total_hours ?? 0), 0) / data.length;
          lines.push(`SLEEP (last ${data.length} nights): avg ${avg.toFixed(1)}h, latest ${data[0].total_hours ?? '?'}h.`);
        } else {
          lines.push('SLEEP: no nights logged this week.');
        }
      }
      if (want('sleep_phone_logs')) {
        const { data } = await supabase
          .from('sleep_phone_logs')
          .select('date, challenge_result, streak_count')
          .eq('user_id', userId)
          .order('date', { ascending: false })
          .limit(1);
        raw.sleep_phone_logs = data ?? [];
        if (data?.length) {
          lines.push(`PHONE DOWN CHALLENGE: ${data[0].challenge_result} on ${data[0].date}, streak ${data[0].streak_count}.`);
        }
      }
    })());
  }

  if (want('daily_steps')) {
    jobs.push((async () => {
      // Code Audit v2 fix plan B2: steps previously lived ONLY in the app's
      // local AsyncStorage blob — no server-side context could ever contain
      // a step count. lib/body-data.ts now upserts today's count here.
      const { data } = await supabase
        .from('daily_steps')
        .select('date, steps')
        .eq('user_id', userId)
        .gte('date', localDateKeyPlusDays(-7, tzOffsetMinutes))
        .order('date', { ascending: false })
        .limit(7);
      raw.daily_steps = data ?? [];
      if (data?.length) {
        lines.push(`STEPS (last 7 days): today ${data[0].date === today ? data[0].steps : 0}, avg ${Math.round(data.reduce((s: number, d: { steps?: number }) => s + (d.steps ?? 0), 0) / data.length)}/day.`);
      } else {
        lines.push('STEPS: none synced yet.');
      }
    })());
  }

  if (want('focus_sessions')) {
    jobs.push((async () => {
      // Code Audit v2 fix plan B3: the focus companion previously only ever
      // read user_focus (the timer's SETTINGS), never its history — it could
      // not answer "how much did I focus this week?". app/focus-timer.tsx
      // now writes focus_sessions on completion (lib/focus-data.ts); the
      // device already did (migration 026).
      const { data } = await supabase
        .from('focus_sessions')
        .select('duration_mins, date')
        .eq('user_id', userId)
        .gte('date', localDateKeyPlusDays(-7, tzOffsetMinutes))
        .order('date', { ascending: false })
        .limit(60);
      raw.focus_sessions = data ?? [];
      if (data?.length) {
        const totalMins = data.reduce((s: number, r: { duration_mins?: number }) => s + (r.duration_mins ?? 0), 0);
        lines.push(`FOCUS SESSIONS (last 7 days): ${data.length} sessions, ${totalMins} total minutes.`);
      } else {
        lines.push('FOCUS SESSIONS: none logged in the last 7 days.');
      }
    })());
  }

  if (want('mood_logs')) {
    jobs.push((async () => {
      // Only mood_score/stress_score/triggers — journal_entries/therapy_notes
      // are never queried by buildContext at all (task 066's acceptance
      // criterion: the AI never sees journal/therapy content unless the user
      // pastes it into the conversation themselves).
      const { data } = await supabase
        .from('mood_logs')
        .select('date, mood_score, stress_score')
        .eq('user_id', userId)
        .gte('date', localDateKeyPlusDays(-14, tzOffsetMinutes))
        .order('date', { ascending: false })
        .limit(14);
      raw.mood_logs = data ?? [];
      if (data?.length) {
        const avg = data.reduce((s: number, d: { mood_score: number }) => s + d.mood_score, 0) / data.length;
        lines.push(`MOOD (last ${data.length} days): avg ${avg.toFixed(1)}/10, latest ${data[0].mood_score}/10.`);
      } else {
        lines.push('MOOD: none logged in the last 2 weeks.');
      }
    })());
  }

  if (want('goals')) {
    jobs.push((async () => {
      const { data: goals } = await supabase
        .from('goals')
        .select('id, title, target_date')
        .eq('user_id', userId)
        .eq('status', 'active')
        .limit(15);
      if (!goals?.length) { raw.goals = []; lines.push('GOALS: none active.'); return; }

      const { data: milestones } = await supabase
        .from('milestones')
        .select('goal_id, completed')
        .in('goal_id', goals.map((g: { id: string }) => g.id));
      raw.goals = goals;

      lines.push('GOALS (active):');
      for (const g of goals) {
        const own = (milestones ?? []).filter((m: { goal_id: string }) => m.goal_id === g.id);
        const pct = own.length ? Math.round((own.filter((m: { completed: boolean }) => m.completed).length / own.length) * 100) : null;
        lines.push(`- ${g.title}${g.target_date ? ` (by ${g.target_date})` : ''}${pct !== null ? `: ${pct}% of milestones done` : ''}`);
      }
    })());
  }

  // Code Audit v2 fix plan P3: medication/finance/library companions added to
  // companions.ts with no matching buildContext block would just always see
  // "No data yet." — these mirror the habit_logs/meals blocks above.

  if (want('medications')) {
    jobs.push((async () => {
      const { data: meds } = await supabase
        .from('medications')
        .select('id, name, type')
        .eq('user_id', userId)
        .eq('active', true)
        .limit(20);
      if (!meds?.length) { raw.medications = []; lines.push('MEDICATIONS: none active.'); return; }

      const { data: logs } = await supabase
        .from('medication_logs')
        .select('medication_id, date, taken')
        .in('medication_id', meds.map((m: { id: string }) => m.id))
        .gte('date', lookbackKey);
      raw.medications = meds;
      raw.medication_logs = logs ?? [];

      lines.push('MEDICATIONS (adherence, last 2 weeks):');
      for (const m of meds) {
        const own = (logs ?? []).filter((l: { medication_id: string }) => l.medication_id === m.id);
        const taken = own.filter((l: { taken: boolean }) => l.taken).length;
        lines.push(`- ${m.name} (${m.type}): ${taken}/14 days taken`);
      }
    })());
  }

  if (want('expenses')) {
    jobs.push((async () => {
      const monthStart = `${today.slice(0, 7)}-01`;
      const [{ data: expenses }, { data: budgets }] = await Promise.all([
        supabase.from('expenses').select('amount, category, date').eq('user_id', userId).gte('date', monthStart).limit(200),
        supabase.from('budgets').select('category, monthly_target_amount').eq('user_id', userId),
      ]);
      raw.expenses = expenses ?? [];
      raw.budgets = budgets ?? [];
      if (expenses?.length) {
        const total = expenses.reduce((s: number, e: { amount: number }) => s + e.amount, 0);
        lines.push(`SPENDING (this month): ${total.toFixed(2)} total.`);
        const byCategory = new Map<string, number>();
        for (const e of expenses) byCategory.set(e.category, (byCategory.get(e.category) ?? 0) + e.amount);
        for (const b of budgets ?? []) {
          const spent = byCategory.get(b.category) ?? 0;
          if (spent > b.monthly_target_amount) {
            lines.push(`- OVER BUDGET: ${b.category} ${spent.toFixed(2)}/${b.monthly_target_amount}`);
          }
        }
      } else {
        lines.push('SPENDING: none logged this month.');
      }
    })());
  }

  if (want('bills')) {
    jobs.push((async () => {
      const { data } = await supabase
        .from('bills')
        .select('name, amount, due_date')
        .eq('user_id', userId)
        .eq('active', true)
        .order('due_date', { ascending: true })
        .limit(10);
      raw.bills = data ?? [];
      if (data?.length) {
        lines.push('UPCOMING BILLS:');
        for (const b of data) lines.push(`- ${b.name}: ${b.amount} due ${b.due_date}`);
      } else {
        lines.push('BILLS: none active.');
      }
    })());
  }

  if (want('books')) {
    jobs.push((async () => {
      const { data } = await supabase
        .from('books')
        .select('title, author, status, current_page, total_pages')
        .eq('user_id', userId)
        .neq('status', 'finished')
        .limit(10);
      raw.books = data ?? [];
      if (data?.length) {
        lines.push('BOOKS (reading / to-read):');
        for (const b of data) {
          const progress = b.status === 'reading' && b.total_pages ? `, p.${b.current_page}/${b.total_pages}` : '';
          lines.push(`- ${b.title}${b.author ? ` by ${b.author}` : ''} (${b.status}${progress})`);
        }
      } else {
        lines.push('BOOKS: none tracked.');
      }
    })());
  }

  if (want('movies')) {
    jobs.push((async () => {
      const { data } = await supabase
        .from('movies')
        .select('title, year')
        .eq('user_id', userId)
        .eq('status', 'to_watch')
        .limit(10);
      raw.movies = data ?? [];
      if (data?.length) {
        lines.push('MOVIES (watchlist):');
        for (const m of data) lines.push(`- ${m.title}${m.year ? ` (${m.year})` : ''}`);
      } else {
        lines.push('MOVIES: watchlist empty.');
      }
    })());
  }

  if (want('saved_links')) {
    jobs.push((async () => {
      const { data } = await supabase
        .from('saved_links')
        .select('title, url')
        .eq('user_id', userId)
        .order('created_at', { ascending: false })
        .limit(5);
      raw.saved_links = data ?? [];
      if (data?.length) {
        lines.push('RECENTLY SAVED LINKS:');
        for (const l of data) lines.push(`- ${l.title || l.url}`);
      }
    })());
  }

  if (want('ideas')) {
    jobs.push((async () => {
      const { data } = await supabase
        .from('ideas')
        .select('content')
        .eq('user_id', userId)
        .order('created_at', { ascending: false })
        .limit(5);
      raw.ideas = data ?? [];
      if (data?.length) {
        lines.push('RECENT IDEAS:');
        for (const i of data) lines.push(`- ${i.content}`);
      }
    })());
  }

  if (want('vault') && userMessage) {
    jobs.push((async () => {
      // FTS over the Obsidian-synced notes (tools/vault-agent populates
      // vault_files; GIN index from migration 023). Top 3 matches, trimmed
      // -- enough to ground an answer without blowing the prompt budget.
      const { data } = await supabase
        .from('vault_files')
        .select('path, content')
        .eq('user_id', userId)
        .is('deleted_at', null)
        .textSearch('content', userMessage, { type: 'websearch', config: 'english' })
        .limit(3);
      raw.vault = data ?? [];
      if (data?.length) {
        lines.push('YOUR NOTES (second brain, most relevant to this message):');
        for (const f of data) {
          const title = String(f.path).split('/').pop()?.replace(/\.md$/, '') ?? f.path;
          const body = String(f.content).replace(/^---[\s\S]*?---\s*/, ''); // drop frontmatter
          lines.push(`- ${title}: ${body.slice(0, 300).replace(/\s+/g, ' ').trim()}`);
        }
      }
    })());
  }

  await Promise.all(jobs);

  // ── SharedContext (Code Audit v2 fix plan, P2/B1) ──────────────────────────
  // The structural gap the audit named as the root cause of "the AI can't see
  // other sections": buildContext previously only had per-companion
  // contextSources plus the precomputed boolean FLAGS below — flags cross
  // domains, numbers didn't. Ask the gym or activity companion "how many
  // calories today?" and its context had zero meal rows. This block runs for
  // EVERY companion, unconditionally, reusing raw.* when a companion's own
  // contextSources already fetched the same data (zero extra queries for
  // calorie/sleep/focus themselves) and running one small extra query
  // otherwise — same cost/value trade the flags below already made.
  {
    const sevenDaysAgoShared = localDateKeyPlusDays(-7, tzOffsetMinutes);
    const [mealsShared, targetsShared, sleepShared, gymPlanShared, stepsShared, focusShared, waterShared] = await Promise.all([
      Array.isArray(raw.meals)
        ? Promise.resolve(raw.meals as Array<{ date: string; calories?: number; protein_g?: number }>)
        : supabase.from('meals').select('date, calories, protein_g').eq('user_id', userId).eq('date', today)
            .then((r: { data: unknown }) => (r.data as Array<{ date: string; calories?: number; protein_g?: number }>) ?? []),
      raw.nutrition_targets !== undefined
        ? Promise.resolve(raw.nutrition_targets as { calories?: number; protein_g?: number } | null)
        : supabase.from('nutrition_targets').select('calories, protein_g').eq('user_id', userId)
            .maybeSingle().then((r: { data: unknown }) => (r.data as { calories?: number; protein_g?: number } | null) ?? null),
      Array.isArray(raw.sleep_logs)
        ? Promise.resolve(raw.sleep_logs as Array<{ total_hours?: number }>)
        : supabase.from('sleep_logs').select('total_hours').eq('user_id', userId)
            .order('date', { ascending: false }).limit(1).then((r: { data: unknown }) => (r.data as Array<{ total_hours?: number }>) ?? []),
      raw.gym_plan !== undefined
        ? Promise.resolve(raw.gym_plan as Record<string, string | null> | null)
        : supabase.from('gym_plan').select('*').eq('user_id', userId)
            .maybeSingle().then((r: { data: unknown }) => (r.data as Record<string, string | null> | null) ?? null),
      Array.isArray(raw.daily_steps)
        ? Promise.resolve((raw.daily_steps as Array<{ date: string; steps?: number }>).find(d => d.date === today) ?? null)
        : supabase.from('daily_steps').select('steps').eq('user_id', userId).eq('date', today)
            .maybeSingle().then((r: { data: unknown }) => (r.data as { steps?: number } | null) ?? null),
      Array.isArray(raw.focus_sessions)
        ? Promise.resolve(raw.focus_sessions as Array<{ duration_mins?: number }>)
        : supabase.from('focus_sessions').select('duration_mins').eq('user_id', userId)
            .gte('date', sevenDaysAgoShared).limit(60).then((r: { data: unknown }) => (r.data as Array<{ duration_mins?: number }>) ?? []),
      Array.isArray(raw.water_logs)
        ? Promise.resolve(raw.water_logs as Array<{ amount_ml?: number }>)
        : supabase.from('water_logs').select('amount_ml').eq('user_id', userId)
            .gte('logged_at', `${today}T00:00:00`).limit(50).then((r: { data: unknown }) => (r.data as Array<{ amount_ml?: number }>) ?? []),
    ]);

    const sharedParts: string[] = [];

    const caloriesToday = mealsShared.filter(m => m.date === today).reduce((s, m) => s + (m.calories ?? 0), 0);
    const proteinToday = mealsShared.filter(m => m.date === today).reduce((s, m) => s + (m.protein_g ?? 0), 0);
    if (targetsShared?.calories) sharedParts.push(`calories ${caloriesToday}/${targetsShared.calories}`);
    if (targetsShared?.protein_g) sharedParts.push(`protein ${proteinToday}/${targetsShared.protein_g}g`);

    if (sleepShared.length) sharedParts.push(`sleep ${(sleepShared[0].total_hours ?? 0).toFixed(1)}h`);

    if (gymPlanShared) {
      const days = ['sunday', 'monday', 'tuesday', 'wednesday', 'thursday', 'friday', 'saturday'];
      const tomorrow = days[(localWeekday(tzOffsetMinutes) + 1) % 7];
      const tomorrowPlan = gymPlanShared[tomorrow];
      sharedParts.push(`tomorrow: ${tomorrowPlan || 'rest day'}`);
    }

    if (stepsShared) sharedParts.push(`steps ${stepsShared.steps ?? 0}`);

    if (focusShared.length) {
      const totalFocusMins = focusShared.reduce((s, f) => s + (f.duration_mins ?? 0), 0);
      sharedParts.push(`focus ${totalFocusMins}m this week`);
    }

    const waterTodayMl = waterShared.reduce((s, w) => s + (w.amount_ml ?? 0), 0);
    if (waterTodayMl > 0) sharedParts.push(`water ${(waterTodayMl / 1000).toFixed(1)}L`);

    if (sharedParts.length) lines.push(`SHARED (today): ${sharedParts.join(' · ')}`);
  }

  // ── Precomputed flags (task 040/041) ───────────────────────────────────────
  // Each flag has its own fixed, tiny query — independent of contextSources —
  // so e.g. SLEEP_DEBT can reach the gym companion and OVERREACHING can reach
  // the calorie companion, not just whichever companion happens to already
  // read that domain. The original version only computed a flag from raw.*
  // that a companion's own contextSources had already populated, which meant
  // "cross-domain" flags could almost never actually cross domains — an
  // audit (2026-07-06) found e.g. OVERREACHING needs workout_done_log, which
  // only the gym/goals companions read, so the calorie companion (the one
  // that should say "you're overreaching AND underfuelling") could never see
  // it. Reuses raw.* when the companion already fetched the same window
  // (zero extra cost); otherwise runs one small windowed query per input —
  // a deliberate, cheap trade documented here rather than silently dropped.
  const sevenDaysAgo = localDateKeyPlusDays(-7, tzOffsetMinutes);
  const threeDaysAgo = localDateKeyPlusDays(-3, tzOffsetMinutes);
  const fourteenDaysAgo = localDateKeyPlusDays(-14, tzOffsetMinutes);

  const [workoutsForFlags, sleepForFlags, mealsForFlags, targetsForFlags, moodForFlags]: [
    Array<{ date: string }>,
    Array<{ total_hours?: number }>,
    Array<{ date: string; calories?: number; protein_g?: number }>,
    { calories?: number; protein_g?: number } | null,
    Array<{ stress_score?: number }>,
  ] = await Promise.all([
    Array.isArray(raw.workout_done_log)
      ? Promise.resolve(raw.workout_done_log as Array<{ date: string }>)
      : supabase.from('workout_done_log').select('date').eq('user_id', userId)
          .gte('date', sevenDaysAgo).limit(20).then((r: { data: unknown }) => (r.data as Array<{ date: string }>) ?? []),
    Array.isArray(raw.sleep_logs)
      ? Promise.resolve(raw.sleep_logs as Array<{ total_hours?: number }>)
      : supabase.from('sleep_logs').select('total_hours').eq('user_id', userId)
          .gte('date', sevenDaysAgo).limit(7).then((r: { data: unknown }) => (r.data as Array<{ total_hours?: number }>) ?? []),
    Array.isArray(raw.meals)
      ? Promise.resolve(raw.meals as Array<{ date: string; calories?: number; protein_g?: number }>)
      : supabase.from('meals').select('date, calories, protein_g').eq('user_id', userId)
          .gte('date', threeDaysAgo).limit(30).then((r: { data: unknown }) => (r.data as Array<{ date: string; calories?: number; protein_g?: number }>) ?? []),
    raw.nutrition_targets !== undefined
      ? Promise.resolve(raw.nutrition_targets as { calories?: number; protein_g?: number } | null)
      : supabase.from('nutrition_targets').select('calories, protein_g').eq('user_id', userId)
          .maybeSingle().then((r: { data: unknown }) => (r.data as { calories?: number; protein_g?: number } | null) ?? null),
    Array.isArray(raw.mood_logs)
      ? Promise.resolve(raw.mood_logs as Array<{ stress_score?: number }>)
      : supabase.from('mood_logs').select('stress_score').eq('user_id', userId)
          .gte('date', fourteenDaysAgo).limit(14).then((r: { data: unknown }) => (r.data as Array<{ stress_score?: number }>) ?? []),
  ]);

  const flags: string[] = [];

  // OVERREACHING: 6+ workouts logged in the trailing 7 days (no rest day).
  if (workoutsForFlags.length) {
    const recentCount = workoutsForFlags.filter(w => w.date >= sevenDaysAgo).length;
    if (recentCount >= 6) flags.push('OVERREACHING');
  }

  // SLEEP_DEBT: 3+ nights under 7h in the fetched window.
  if (sleepForFlags.length) {
    const underTarget = sleepForFlags.filter(s => (s.total_hours ?? 8) < 7).length;
    if (underTarget >= 3) flags.push('SLEEP_DEBT');
  }

  // UNDERFUELLING / LOW_PROTEIN: trailing-3-day average vs nutrition_targets.
  if (mealsForFlags.length && targetsForFlags) {
    const byDate = new Map<string, { cal: number; protein: number }>();
    for (const m of mealsForFlags) {
      const cur = byDate.get(m.date) ?? { cal: 0, protein: 0 };
      cur.cal += m.calories ?? 0;
      cur.protein += m.protein_g ?? 0;
      byDate.set(m.date, cur);
    }
    const days = [...byDate.values()];
    if (days.length && targetsForFlags.calories) {
      const avgCal = days.reduce((s, d) => s + d.cal, 0) / days.length;
      if (avgCal < targetsForFlags.calories * 0.7) flags.push('UNDERFUELLING');
    }
    if (days.length && targetsForFlags.protein_g) {
      const avgProtein = days.reduce((s, d) => s + d.protein, 0) / days.length;
      if (avgProtein < targetsForFlags.protein_g * 0.7) flags.push('LOW_PROTEIN');
    }
  }

  // STRESS_SLEEP (cross-domain): elevated stress AND sleep debt together.
  if (moodForFlags.length && flags.includes('SLEEP_DEBT')) {
    const withStress = moodForFlags.filter(m => typeof m.stress_score === 'number');
    if (withStress.length) {
      const avgStress = withStress.reduce((s, m) => s + (m.stress_score ?? 0), 0) / withStress.length;
      if (avgStress >= 7) flags.push('STRESS_SLEEP');
    }
  }

  if (flags.length) {
    raw.flags = flags;
    lines.push(`FLAGS: ${flags.join(', ')} — factor these into your tone and suggestions (see system prompt for what each means).`);
  }

  return { text: lines.join('\n') || 'No data yet.', raw };
}
