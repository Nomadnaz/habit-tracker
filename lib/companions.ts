// lib/companions.ts — client-side re-export only.
//
// The canonical companion config lives in the Deno copy at
// supabase/functions/_shared/companions.ts (so the ai-chat Edge Function
// bundles it without reaching outside supabase/). This mirrors the
// buildContext "_shared is authoritative, lib/ is a thin re-export" rule from
// system-model.md. Edit _shared/companions.ts only; never let the two diverge.
//
// The file has no runtime imports (pure config + types), so React Native /
// Metro resolves this relative path fine for any client-side UI that needs it.
export * from '../supabase/functions/_shared/companions.ts';
