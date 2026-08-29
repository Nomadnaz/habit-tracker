// ─────────────────────────────────────────────────────────────────────────
// supabase/functions/_shared/exercises.ts — spoken/typed name -> exercise_id
//
// Neither device-log (LLM structured extraction, no buildContext step) nor
// device-state (firmware sends a plain name string, no ID concept at all)
// ever sees a user's exercise IDs. Both need the same match: exact first,
// then unambiguous substring containment either direction. Ambiguous or
// unmatched returns null -- never guessed, same rule as everything else
// these two endpoints do with uncertain input.
//
// A null return means different things to each caller: device-log's voice
// path treats it as a hard failure (an LLM could have misheard a DIFFERENT
// real exercise, so guessing is unsafe). device-state's log_set case instead
// auto-creates the exercise on null -- a firmware-sourced name carries no
// "wrong exercise" risk, only "new exercise". That branch lives in
// device-state/index.ts, not here; this module only ever returns a match or
// null, never creates anything itself.
// ─────────────────────────────────────────────────────────────────────────

// deno-lint-ignore no-explicit-any
type SupabaseClient = any;

export type ExerciseRow = { id: string; name: string };

const norm = (s: string): string => s.toLowerCase().replace(/[^a-z0-9 ]/g, '').trim();

export function matchExerciseName(spokenName: string, exercises: ExerciseRow[]): string | null {
  const target = norm(spokenName);
  if (!target) return null;
  const exact = exercises.filter((e) => norm(e.name) === target);
  if (exact.length === 1) return exact[0].id;
  if (exact.length > 1) return null; // ambiguous -- don't guess
  const contains = exercises.filter((e) => {
    const n = norm(e.name);
    return n.includes(target) || target.includes(n);
  });
  return contains.length === 1 ? contains[0].id : null;
}

export async function resolveExerciseId(
  supabase: SupabaseClient,
  userId: string,
  spokenName: string,
): Promise<string | null> {
  const { data } = await supabase.from('exercises').select('id, name').eq('user_id', userId);
  return matchExerciseName(spokenName, data ?? []);
}
