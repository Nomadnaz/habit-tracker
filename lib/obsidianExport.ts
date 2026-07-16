// ─────────────────────────────────────────────────────────────────────────
// lib/obsidianExport.ts — "Export to Obsidian" (Code Audit v2 fix plan P5,
// phase 2)
//
// One-click SNAPSHOT export of everything lib/obsidian.ts has written into
// vault_files, as a real .zip of real .md files — no Obsidian Sync
// subscription, no iCloud entitlement, works on any platform. The user
// unzips it and either opens the folder as a new Obsidian vault or drags
// the files into an existing one.
//
// This is a one-shot export, not live sync: re-run it whenever you want an
// updated copy. A real live round-trip (iCloud + lib/vaultSync.ts, task 059)
// remains a possible future phase 3, deliberately not needed to make the
// second brain usable and free for every user today.
// ─────────────────────────────────────────────────────────────────────────

import { File, Paths } from 'expo-file-system';
import * as Sharing from 'expo-sharing';
import JSZip from 'jszip';
import { supabase } from './supabase';

const ZIP_ROOT = 'Second Brain';

export async function exportToObsidian(): Promise<void> {
  const { data: { session } } = await supabase.auth.getSession();
  const userId = session?.user?.id;
  if (!userId) throw new Error('Not signed in.');

  const { data: rows, error } = await supabase
    .from('vault_files')
    .select('path, content')
    .eq('user_id', userId)
    .is('deleted_at', null);
  if (error) throw new Error(error.message);
  if (!rows?.length) throw new Error("Nothing to export yet — use the app a bit first, then try again.");

  const zip = new JSZip();
  for (const row of rows) {
    if (!row.path) continue;
    zip.file(`${ZIP_ROOT}/${row.path}`, row.content ?? '');
  }

  const bytes = await zip.generateAsync({ type: 'uint8array' });
  const file = new File(Paths.cache, `second-brain-${Date.now()}.zip`);
  file.write(bytes);

  const available = await Sharing.isAvailableAsync();
  if (!available) throw new Error('Sharing is not available on this device.');
  await Sharing.shareAsync(file.uri, {
    mimeType: 'application/zip',
    dialogTitle: 'Export to Obsidian',
  });
}
