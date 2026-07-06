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

  await Promise.all(jobs);

  // ── Precomputed flags (task 040) ───────────────────────────────────────────
  // Computed from whatever sources were already fetched above — a flag is
  // only ever considered if its underlying contextSource was requested, so
  // this never triggers an extra query beyond what the companion already asked for.
  const flags: string[] = [];

  // OVERREACHING: 6+ workouts logged in the trailing 7 days (no rest day).
  if (Array.isArray(raw.workout_done_log)) {
    const sevenDaysAgo = localDateKeyPlusDays(-7, tzOffsetMinutes);
    const recentCount = (raw.workout_done_log as Array<{ date: string }>).filter(w => w.date >= sevenDaysAgo).length;
    if (recentCount >= 6) flags.push('OVERREACHING');
  }

  // SLEEP_DEBT: 3+ nights under 7h in the fetched window.
  if (Array.isArray(raw.sleep_logs)) {
    const underTarget = (raw.sleep_logs as Array<{ total_hours?: number }>).filter(s => (s.total_hours ?? 8) < 7).length;
    if (underTarget >= 3) flags.push('SLEEP_DEBT');
  }

  // UNDERFUELLING / LOW_PROTEIN: trailing-3-day average vs nutrition_targets.
  if (Array.isArray(raw.meals) && raw.nutrition_targets) {
    const meals = raw.meals as Array<{ date: string; calories?: number; protein_g?: number }>;
    const targets = raw.nutrition_targets as { calories?: number; protein_g?: number };
    const byDate = new Map<string, { cal: number; protein: number }>();
    for (const m of meals) {
      const cur = byDate.get(m.date) ?? { cal: 0, protein: 0 };
      cur.cal += m.calories ?? 0;
      cur.protein += m.protein_g ?? 0;
      byDate.set(m.date, cur);
    }
    const days = [...byDate.values()];
    if (days.length && targets.calories) {
      const avgCal = days.reduce((s, d) => s + d.cal, 0) / days.length;
      if (avgCal < targets.calories * 0.7) flags.push('UNDERFUELLING');
    }
    if (days.length && targets.protein_g) {
      const avgProtein = days.reduce((s, d) => s + d.protein, 0) / days.length;
      if (avgProtein < targets.protein_g * 0.7) flags.push('LOW_PROTEIN');
    }
  }

  // STRESS_SLEEP (cross-domain): elevated stress AND sleep debt together.
  if (Array.isArray(raw.mood_logs) && flags.includes('SLEEP_DEBT')) {
    const moods = raw.mood_logs as Array<{ stress_score?: number }>;
    const withStress = moods.filter(m => typeof m.stress_score === 'number');
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
