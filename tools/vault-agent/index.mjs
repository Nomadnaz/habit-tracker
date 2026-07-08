/**
 * vault-agent — one-directional Obsidian ⇄ Supabase bridge (vault canon:
 * the AI reads vault_files, never the filesystem; the vault folder stays
 * canonical for user-owned notes and this agent is vault_files' only writer).
 *
 *   disk → cloud: watch VAULT_PATH/**\/*.md, upsert (path, content, hash)
 *                 into vault_files; soft-delete rows when files vanish.
 *   cloud → disk: poll vault_inbox for unsynced device voice captures and
 *                 write each as VAULT_PATH/Inbox/YYYY-MM-DD-HHmm-<slug>.md
 *                 with the vault's standard frontmatter, then stamp synced_at.
 *
 * Env: HABIT_USER_EMAIL, HABIT_USER_PASSWORD (password grant, same pattern
 * as the firmware repo's tools/phone_sim.py), optional VAULT_PATH
 * (default ~/esp/SecondBrain), optional SUPABASE_URL / SUPABASE_ANON_KEY.
 *
 * Run: cd tools/vault-agent && npm install && npm start
 */

import { createClient } from '@supabase/supabase-js';
import chokidar from 'chokidar';
import { createHash, randomUUID } from 'node:crypto';
import { readFile, writeFile, mkdir } from 'node:fs/promises';
import { homedir } from 'node:os';
import path from 'node:path';

const SUPABASE_URL = process.env.SUPABASE_URL ?? 'https://dnbdjjrjudrzugxkpeeh.supabase.co';
const SUPABASE_ANON_KEY = process.env.SUPABASE_ANON_KEY ??
  'eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJpc3MiOiJzdXBhYmFzZSIsInJlZiI6ImRuYmRqanJqdWRyenVneGtwZWVoIiwicm9sZSI6ImFub24iLCJpYXQiOjE3ODAwMzQ2NjAsImV4cCI6MjA5NTYxMDY2MH0.w-s4KT7vKH_yUkpAV8wc47o4EjrdFhPfDiCxqDcvj1Q';
const VAULT_PATH = process.env.VAULT_PATH ?? path.join(homedir(), 'esp', 'SecondBrain');
const INBOX_DIR = path.join(VAULT_PATH, 'Inbox');
const INBOX_POLL_MS = 30_000;
const DEBOUNCE_MS = 2_000; // Obsidian Sync / editors write in bursts
const MAX_FILE_BYTES = 512 * 1024;

const email = process.env.HABIT_USER_EMAIL;
const password = process.env.HABIT_USER_PASSWORD;
if (!email || !password) {
  console.error('Set HABIT_USER_EMAIL and HABIT_USER_PASSWORD.');
  process.exit(1);
}

const supabase = createClient(SUPABASE_URL, SUPABASE_ANON_KEY, {
  auth: { persistSession: false, autoRefreshToken: true },
});

const { data: authData, error: authError } =
  await supabase.auth.signInWithPassword({ email, password });
if (authError || !authData.user) {
  console.error('Login failed:', authError?.message);
  process.exit(1);
}
const userId = authData.user.id;
console.log(`[vault-agent] signed in as ${email}`);
console.log(`[vault-agent] vault: ${VAULT_PATH}`);

const sha1 = (s) => createHash('sha1').update(s).digest('hex');
const relPath = (abs) => path.relative(VAULT_PATH, abs).split(path.sep).join('/');

// ── disk → cloud ─────────────────────────────────────────────────────────────

const pending = new Map(); // abs path -> debounce timer

async function upsertFile(abs) {
  const rel = relPath(abs);
  try {
    const content = await readFile(abs, 'utf8');
    if (Buffer.byteLength(content) > MAX_FILE_BYTES) {
      console.warn(`[skip] ${rel}: over ${MAX_FILE_BYTES} bytes`);
      return;
    }
    const hash = sha1(content);

    const { data: existing } = await supabase
      .from('vault_files')
      .select('id, content_hash')
      .eq('user_id', userId)
      .eq('path', rel)
      .maybeSingle();
    if (existing?.content_hash === hash) return; // no-op save

    const row = {
      id: existing?.id ?? randomUUID(),
      user_id: userId,
      path: rel,
      content,
      content_hash: hash,
      source: 'user',
      deleted_at: null,
      updated_at: new Date().toISOString(),
      synced_at: new Date().toISOString(),
    };
    const { error } = await supabase.from('vault_files').upsert(row, { onConflict: 'user_id,path' });
    if (error) console.warn(`[upsert] ${rel}: ${error.message}`);
    else console.log(`[synced] ${rel}`);
  } catch (e) {
    console.warn(`[read] ${rel}: ${e.message}`);
  }
}

async function softDelete(abs) {
  const rel = relPath(abs);
  const { error } = await supabase
    .from('vault_files')
    .update({ deleted_at: new Date().toISOString(), updated_at: new Date().toISOString() })
    .eq('user_id', userId)
    .eq('path', rel);
  if (!error) console.log(`[deleted] ${rel}`);
}

function schedule(abs, fn) {
  clearTimeout(pending.get(abs));
  pending.set(abs, setTimeout(() => {
    pending.delete(abs);
    fn(abs);
  }, DEBOUNCE_MS));
}

chokidar
  .watch(path.join(VAULT_PATH, '**/*.md'), {
    ignored: /(^|[/\\])\../, // .obsidian, .trash, dotfiles
    ignoreInitial: false,     // initial pass = full reconcile on start
    awaitWriteFinish: { stabilityThreshold: DEBOUNCE_MS, pollInterval: 400 },
  })
  .on('add', (p) => schedule(p, upsertFile))
  .on('change', (p) => schedule(p, upsertFile))
  .on('unlink', (p) => schedule(p, softDelete))
  .on('error', (e) => console.warn('[watch]', e.message));

// ── cloud → disk (device voice captures) ────────────────────────────────────

function slugify(text) {
  return text.toLowerCase().replace(/[^a-z0-9]+/g, '-').replace(/^-+|-+$/g, '').slice(0, 40) || 'note';
}

async function drainInbox() {
  const { data: rows, error } = await supabase
    .from('vault_inbox')
    .select('id, text, source, created_at')
    .eq('user_id', userId)
    .is('synced_at', null)
    .order('created_at', { ascending: true })
    .limit(20);
  if (error || !rows?.length) return;

  await mkdir(INBOX_DIR, { recursive: true });
  for (const row of rows) {
    const created = new Date(row.created_at);
    const pad = (n) => String(n).padStart(2, '0');
    const dateKey = `${created.getFullYear()}-${pad(created.getMonth() + 1)}-${pad(created.getDate())}`;
    const stamp = `${dateKey}-${pad(created.getHours())}${pad(created.getMinutes())}`;
    const file = path.join(INBOX_DIR, `${stamp}-${slugify(row.text)}.md`);

    // Vault frontmatter convention (date, tags) — see Conversations/ notes.
    const md = `---
date: ${dateKey}
tags: [inbox, voice-capture, ${row.source}]
---

${row.text}
`;
    try {
      await writeFile(file, md, { flag: 'wx' }); // never overwrite
    } catch (e) {
      if (e.code !== 'EEXIST') { console.warn(`[inbox] write failed: ${e.message}`); continue; }
    }
    const { error: markErr } = await supabase
      .from('vault_inbox')
      .update({ synced_at: new Date().toISOString() })
      .eq('id', row.id);
    if (!markErr) console.log(`[inbox] ${path.basename(file)}`);
  }
}

setInterval(() => drainInbox().catch((e) => console.warn('[inbox]', e.message)), INBOX_POLL_MS);
drainInbox().catch(() => {});

console.log('[vault-agent] watching…');
