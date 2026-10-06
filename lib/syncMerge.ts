// ─────────────────────────────────────────────────────────────────────────
// syncMerge.ts — pull-on-focus merge that can see remote edits and deletes
// ─────────────────────────────────────────────────────────────────────────
// The original pulls (pullRemoteMeals/pullRemoteBody) only ever ADDED rows:
// local always won on collision and a local row missing from the server was
// always kept, because it was far likelier to be an unsynced offline write
// than a real deletion. That made corrections from the voice device
// (update_meal / delete_water / ...) invisible in the app forever.
//
// `synced` resolves the ambiguity: it is set only when a pull has seen the
// server agree with the local copy. So:
//   - synced + server differs  → a remote edit: take the server's values
//   - synced + server missing  → a remote delete: drop it
//   - not synced               → a local write in flight: never touched
// Local mutations must produce objects WITHOUT `synced` (spread carefully).
// Pure, so it's unit-tested without AsyncStorage/Supabase.
// ─────────────────────────────────────────────────────────────────────────

export type Syncable = { synced?: boolean };

export function mergeRemote<T extends Syncable>(
  local: T[],
  remote: T[],
  key: (x: T) => string | number,
  sameValues: (a: T, b: T) => boolean,
  /** Local rows outside the pulled window can't be judged deleted. */
  inWindow: (x: T) => boolean = () => true,
  /** How a remote edit lands on the local copy; override to keep local-only fields. */
  applyRemote: (l: T, r: T) => T = (l, r) => ({ ...l, ...r }),
): { merged: T[]; changed: boolean } {
  const remoteByKey = new Map(remote.map((r) => [key(r), r] as const));
  const seen = new Set<string | number>();
  let changed = false;
  const merged: T[] = [];

  for (const l of local) {
    const k = key(l);
    seen.add(k);
    const r = remoteByKey.get(k);
    if (!r) {
      if (l.synced && inWindow(l)) { changed = true; continue; } // deleted remotely
      merged.push(l);
    } else if (sameValues(l, r)) {
      if (!l.synced) changed = true;
      merged.push(l.synced ? l : { ...l, synced: true });
    } else if (l.synced) {
      merged.push({ ...applyRemote(l, r), synced: true }); // edited remotely
      changed = true;
    } else {
      merged.push(l); // unsynced local edit still on its way up
    }
  }

  for (const r of remote) {
    if (seen.has(key(r))) continue;
    merged.push({ ...r, synced: true });
    changed = true;
  }
  return { merged, changed };
}
