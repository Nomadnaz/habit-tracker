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

// deno-lint-ignore no-explicit-any
type SupabaseClient = any;

export interface ContextResult {
  /** Compact text block injected into the system prompt. */
  text: string;
  /** Raw per-source data, for callers that want structured access. */
  raw: Record<string, unknown>;
}

const todayKey = (): string => {
  // Canonical zero-padded YYYY-MM-DD (system-model.md). UTC is acceptable here
  // for a coarse "recent" filter; per-user local-day precision is a later refinement.
  return new Date().toISOString().slice(0, 10);
};

export async function buildContext(
  supabase: SupabaseClient,
  userId: string,
  contextSources: string[],
): Promise<ContextResult> {
  const raw: Record<string, unknown> = {};
  const lines: string[] = [];
  const want = (s: string) => contextSources.includes(s);

  const today = todayKey();
  const lookbackKey = new Date(Date.now() - 14 * 86400000).toISOString().slice(0, 10);
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
        .gte('logged_at', `${todayKey()}T00:00:00`)
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
      const { data } = await supabase
        .from('meals')
        .select('date, meal_type, name, calories')
        .eq('user_id', userId)
        .gte('date', new Date(Date.now() - 3 * 86400000).toISOString().slice(0, 10))
        .order('date', { ascending: false })
        .limit(30);
      raw.meals = data ?? [];
      if (data?.length) {
        const todayTotal = data.filter((m: { date: string }) => m.date === todayKey())
          .reduce((s: number, m: { calories?: number }) => s + (m.calories ?? 0), 0);
        lines.push(`MEALS TODAY: ${todayTotal} cal logged so far.`);
        lines.push('RECENT MEALS (last 3 days):');
        for (const m of data.slice(0, 10)) lines.push(`- ${m.date} ${m.meal_type}: ${m.name} (${m.calories} cal)`);
      } else {
        lines.push('MEALS: none logged in the last 3 days.');
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
          .gte('date', new Date(Date.now() - 7 * 86400000).toISOString().slice(0, 10))
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

  return { text: lines.join('\n') || 'No data yet.', raw };
}
