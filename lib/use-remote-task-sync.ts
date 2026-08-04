// ─────────────────────────────────────────────────────────────────────────
// lib/use-remote-task-sync.ts — pull server-side task changes into the app live
//
// The app is LOCAL-FIRST, so tasks created OUTSIDE it (e.g. by the voice device
// → ai-chat with execute:true) only exist in Supabase. This hook makes those
// appear in the app + Apple Calendar/Reminders the instant they're written —
// the same finishing steps the in-app AI chat performs.
//
//   • Subscribes to Supabase Realtime on `tasks` (filtered to this user).
//   • On INSERT/UPDATE: merges the row into on-device @tasks; for genuinely new
//     tasks (not already local) it also creates the Apple Reminder/Event.
//   • On DELETE: removes it locally + from Apple.
//   • On launch / app-foreground: a "catch-up" pull that also creates the Apple
//     Reminder/Event for anything created while the app was shut, same dedup
//     guard as the live path so it can't re-duplicate.
//   • Emits a 'tasks:changed' event so any open task screen reloads instantly.
//
// Mounted once, globally, in app/_layout.tsx. Writes flow through @tasks (the
// single on-device source of truth); screens re-read it on the event.
// ─────────────────────────────────────────────────────────────────────────

import { useEffect } from 'react';
import { AppState, DeviceEventEmitter, Platform } from 'react-native';
import AsyncStorage from '@react-native-async-storage/async-storage';
import { supabase } from '@/lib/supabase';
import { taskFromDbRow, TASK_SELECT_COLUMNS } from '@/lib/task-supabase';
import {
  deleteDuplicateAppleEntries,
  findExistingAppleReminder,
  mergeAppleIdsIntoTaskMap,
  syncNewTaskToApple,
  syncTaskDoneToApple,
  syncTaskRemovedFromApple,
} from '@/lib/apple-sync';
import { sortActiveTasks, type Task, type TaskMap } from '@/lib/tasks-core';
import { findTaskDateKey } from '@/lib/task-schedule';
import { withTaskSyncLock } from '@/lib/task-sync-lock';

export const TASKS_CHANGED_EVENT = 'tasks:changed';
// Fired only for genuinely-new tasks arriving LIVE from outside the app (e.g.
// the voice device). Carries the task label/date so the UI can announce it.
export const TASKS_REMOTE_ADDED_EVENT = 'tasks:remote-added';
export interface RemoteTaskAdded {
  id: string;
  label: string;
  dateKey: string;
}
const TASKS_KEY = '@tasks';

// Apple entries we've created this session, so repeated realtime events for the
// same task id can never create duplicate reminders/events.
const appleCreatedIds = new Set<string>();

// Serialize all map mutations so concurrent realtime events / pulls can't race
// on the read-modify-write of @tasks.
function serialize(fn: () => Promise<void>): Promise<void> {
  return withTaskSyncLock(fn);
}

function hasLabelOnDay(map: TaskMap, dateKey: string, label: string): boolean {
  const norm = label.trim().toLowerCase();
  return (map[dateKey] ?? []).some(t => !t.archived && t.label.trim().toLowerCase() === norm);
}

async function readMap(): Promise<TaskMap> {
  const raw = await AsyncStorage.getItem(TASKS_KEY);
  return raw ? (JSON.parse(raw) as TaskMap) : {};
}

async function writeMap(map: TaskMap): Promise<void> {
  await AsyncStorage.setItem(TASKS_KEY, JSON.stringify(map));
  DeviceEventEmitter.emit(TASKS_CHANGED_EVENT);
}

function taskEquals(a: Task, b: Task): boolean {
  return (
    a.label === b.label &&
    a.done === b.done &&
    (a.hour ?? null) === (b.hour ?? null) &&
    (a.minute ?? null) === (b.minute ?? null) &&
    (a.priority ?? null) === (b.priority ?? null) &&
    (a.location ?? null) === (b.location ?? null) &&
    (a.durationMins ?? null) === (b.durationMins ?? null) &&
    !!a.archived === !!b.archived
  );
}

function putInDay(map: TaskMap, dateKey: string, task: Task): TaskMap {
  const day = map[dateKey] ?? [];
  const active = day.filter(t => !t.archived && t.id !== task.id);
  const archived = day.filter(t => t.archived && t.id !== task.id);
  if (task.archived) return { ...map, [dateKey]: [...sortActiveTasks(active), ...archived, task] };
  return { ...map, [dateKey]: [...sortActiveTasks([...active, task]), ...archived] };
}

/**
 * Apply one DB row (insert/update). When `notify` is true and the row is a
 * genuinely-new task (not already local), announces it so the UI can buzz +
 * show a banner. `notify` is true only for LIVE realtime events, not the
 * launch catch-up pull (which would otherwise spam banners on every open).
 */
async function applyRow(row: Record<string, unknown>, notify = false): Promise<void> {
  await serialize(async () => {
    const id = String(row.id);
    const dateKey = String(row.date);
    const incoming = taskFromDbRow(row);

    let map = await readMap();
    const existingKey = findTaskDateKey(map, id);

    if (existingKey) {
      const existing = (map[existingKey] ?? []).find(t => t.id === id);
      // Preserve any Apple links the local copy already has.
      const merged: Task = {
        ...incoming,
        appleReminderId: existing?.appleReminderId,
        appleEventId: existing?.appleEventId,
      };
      if (existing && existingKey === dateKey && taskEquals(existing, merged)) return; // no-op echo
      if (existingKey !== dateKey) {
        map = { ...map, [existingKey]: (map[existingKey] ?? []).filter(t => t.id !== id) };
      }
      await writeMap(putInDay(map, dateKey, merged));

      // Device/AI marked complete via Supabase — mirror the checkbox in Reminders.
      if (existing && existing.done !== merged.done) {
        const reminderId = await syncTaskDoneToApple(merged, merged.done, {
          dateKey,
          hour: merged.hour,
          minute: merged.minute,
        });
        if (reminderId && reminderId !== merged.appleReminderId) {
          await writeMap(
            mergeAppleIdsIntoTaskMap(await readMap(), dateKey, id, { appleReminderId: reminderId }),
          );
        }
      }
      return;
    }

    // Add to the app's on-device store first (so it shows in the app).
    await writeMap(putInDay(map, dateKey, incoming));

    // Below this point is the "announce it" step (banner/buzz) — only the LIVE
    // realtime path does that; reconcile()'s bulk catch-up (notify=false)
    // already did its own Apple write above, dedup-guarded the same way.
    if (!notify) return;

    DeviceEventEmitter.emit(TASKS_REMOTE_ADDED_EVENT, {
      id,
      label: incoming.label,
      dateKey,
    } satisfies RemoteTaskAdded);

    if (
      Platform.OS === 'ios' &&
      !incoming.appleReminderId &&
      !incoming.appleEventId &&
      !appleCreatedIds.has(id)
    ) {
      appleCreatedIds.add(id);

      // App may have already created the Apple row before @tasks was flushed (race).
      const existingReminder = await findExistingAppleReminder(incoming.label, dateKey);
      if (existingReminder) {
        await writeMap(
          mergeAppleIdsIntoTaskMap(await readMap(), dateKey, id, {
            appleReminderId: existingReminder,
          }),
        );
        return;
      }

      const ids = await syncNewTaskToApple({
        label: incoming.label,
        dateKey,
        mode: 'reminders-and-calendar',
        hour: incoming.hour,
        minute: incoming.minute,
        durationMins: incoming.durationMins,
        location: incoming.location,
        priority: incoming.priority,
      });
      if (ids.appleReminderId || ids.appleEventId) {
        await writeMap(mergeAppleIdsIntoTaskMap(await readMap(), dateKey, id, ids));
      }
    }
  });
}

async function removeRow(id: string): Promise<void> {
  await serialize(async () => {
    const map = await readMap();
    const key = findTaskDateKey(map, id);
    if (!key) return;
    const task = (map[key] ?? []).find(t => t.id === id);
    await writeMap({ ...map, [key]: (map[key] ?? []).filter(t => t.id !== id) });
    if (task) void syncTaskRemovedFromApple(task);
  });
}

/**
 * Reconcile the on-device store with ALL the user's active (non-archived) tasks
 * on the server, in one batched pass. This is the reliable path (plain
 * authenticated REST, so RLS just works) that pulls in tasks created outside the
 * app — e.g. by the voice device. The app's "delete" is actually archive=true,
 * so filtering archived=false means we NEVER resurrect a task the user deleted.
 */
async function reconcile(userId: string): Promise<void> {
  const { data } = await supabase
    .from('tasks')
    .select(TASK_SELECT_COLUMNS)
    .eq('user_id', userId)
    .eq('archived', false)
    .limit(1000);
  if (!data?.length) return;

  await serialize(async () => {
    let map = await readMap();
    let added = 0;

    for (const row of data) {
      const id = String((row as Record<string, unknown>).id);
      const dateKey = String((row as Record<string, unknown>).date);
      if (findTaskDateKey(map, id)) continue;
      const incoming = taskFromDbRow(row as Record<string, unknown>);
      // Orphan duplicate row on the server (same label already local) — drop it.
      if (hasLabelOnDay(map, dateKey, incoming.label)) {
        void supabase.from('tasks').delete().eq('id', id).eq('user_id', userId);
        continue;
      }

      // Genuinely new task, created outside the app (e.g. the voice device)
      // while this device was shut. The live path (applyRow, notify=true)
      // creates the Apple entry on the spot; this catch-up path used to skip
      // it entirely, so device-created tasks never made it into Apple Calendar/
      // Reminders unless the app happened to be open at creation time. Same
      // dedup guard as the live path (findExistingAppleReminder first) so this
      // can't reintroduce the mass-duplication bug that disabled it originally.
      if (
        Platform.OS === 'ios' &&
        !incoming.appleReminderId &&
        !incoming.appleEventId &&
        !appleCreatedIds.has(id)
      ) {
        appleCreatedIds.add(id);
        const existingReminder = await findExistingAppleReminder(incoming.label, dateKey);
        if (existingReminder) {
          incoming.appleReminderId = existingReminder;
        } else {
          const ids = await syncNewTaskToApple({
            label: incoming.label,
            dateKey,
            mode: 'reminders-and-calendar',
            hour: incoming.hour,
            minute: incoming.minute,
            durationMins: incoming.durationMins,
            location: incoming.location,
            priority: incoming.priority,
          });
          incoming.appleReminderId = ids.appleReminderId;
          incoming.appleEventId = ids.appleEventId;
        }
      }

      map = putInDay(map, dateKey, incoming);
      added++;
    }

    // Collapse any label dupes that slipped through, then persist once.
    const { map: deduped, removedIds } = dedupeTaskMap(map);
    if (removedIds.length > 0) {
      map = deduped;
      for (const orphanId of removedIds) {
        void supabase.from('tasks').delete().eq('id', orphanId).eq('user_id', userId);
      }
    }

    if (added === 0 && removedIds.length === 0) return;
    // App-store only — no Apple writes here (single-owner rule, see applyRow).
    await writeMap(map);
  });
}

const DEDUPE_FLAG = '@dedupe_v2_done';

/** Collapse local @tasks entries that share a label on the same day (keep one). */
function dedupeTaskMap(map: TaskMap): { map: TaskMap; removed: number; removedIds: string[] } {
  let removed = 0;
  const removedIds: string[] = [];
  const out: TaskMap = {};
  for (const dateKey of Object.keys(map)) {
    const day = map[dateKey] ?? [];
    const keptByLabel = new Map<string, Task>();
    const order: Task[] = [];
    for (const t of day) {
      const key = t.label.trim().toLowerCase();
      const existing = keptByLabel.get(key);
      if (!existing) {
        const copy = { ...t };
        keptByLabel.set(key, copy);
        order.push(copy);
        continue;
      }
      removed++;
      removedIds.push(t.id);
      if (!existing.appleReminderId && t.appleReminderId) existing.appleReminderId = t.appleReminderId;
      if (!existing.appleEventId && t.appleEventId) existing.appleEventId = t.appleEventId;
      if (t.done) existing.done = true;
    }
    const active = order.filter(t => !t.archived);
    const archived = order.filter(t => t.archived);
    out[dateKey] = [...sortActiveTasks(active), ...archived];
  }
  return { map: out, removed, removedIds };
}

/**
 * One-time cleanup of the duplicates created by the earlier device-sync bug:
 * delete duplicate Apple reminders/events, then collapse duplicate local tasks.
 * Guarded by a flag so it only ever runs once per device.
 */
async function runOneTimeDedupe(): Promise<void> {
  try {
    if (await AsyncStorage.getItem(DEDUPE_FLAG)) return;

    // Apple first — removing the duplicate reminders/events stops them being
    // re-imported as duplicate tasks.
    await deleteDuplicateAppleEntries();

    // Then collapse any duplicate local tasks, sharing the sync write-lock.
    await serialize(async () => {
      const map = await readMap();
      const { map: deduped, removed, removedIds } = dedupeTaskMap(map);
      if (removed > 0) {
        await writeMap(deduped);
        // Best-effort: drop orphan duplicate rows from Supabase too.
        const { data: { session } } = await supabase.auth.getSession();
        const uid = session?.user?.id;
        if (uid) {
          for (const orphanId of removedIds) {
            void supabase.from('tasks').delete().eq('id', orphanId).eq('user_id', uid);
          }
        }
      }
    });

    await AsyncStorage.setItem(DEDUPE_FLAG, '1');
  } catch (e) {
    console.warn('[dedupe] one-time cleanup failed:', e);
  }
}

/**
 * Mount once (in app/_layout.tsx). Keeps the on-device task store in sync with
 * Supabase task changes that originate outside the app, in real time + on open.
 */
export function useRemoteTaskSync(userId: string | null): void {
  useEffect(() => {
    if (!userId) return;
    let channel: ReturnType<typeof supabase.channel> | null = null;

    (async () => {
      // Reliable catch-up first (covers anything created while the app was shut).
      await reconcile(userId);

      // One-time cleanup of the duplicates from the earlier sync bug.
      await runOneTimeDedupe();

      // Then live updates. Hand the realtime socket the user's JWT so RLS lets
      // it stream this user's task rows (otherwise changes are silently filtered).
      const { data: { session } } = await supabase.auth.getSession();
      if (session?.access_token) supabase.realtime.setAuth(session.access_token);

      channel = supabase
        .channel(`tasks-sync-${userId}`)
        .on(
          'postgres_changes',
          { event: '*', schema: 'public', table: 'tasks', filter: `user_id=eq.${userId}` },
          payload => {
            if (payload.eventType === 'DELETE') {
              const oldId = (payload.old as { id?: string } | null)?.id;
              if (oldId) void removeRow(String(oldId));
            } else if (payload.new) {
              void applyRow(payload.new as Record<string, unknown>, true);
            }
          },
        )
        .subscribe();
    })();

    const appStateSub = AppState.addEventListener('change', state => {
      if (state === 'active') void reconcile(userId);
    });

    return () => {
      if (channel) void supabase.removeChannel(channel);
      appStateSub.remove();
    };
  }, [userId]);
}
