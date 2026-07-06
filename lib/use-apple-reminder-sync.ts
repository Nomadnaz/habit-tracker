import { useCallback, useEffect, useRef } from 'react';
import { AppState, DeviceEventEmitter, Platform } from 'react-native';
import { useFocusEffect } from 'expo-router';
import AsyncStorage from '@react-native-async-storage/async-storage';
import { supabase } from '@/lib/supabase';
import {
  syncTaskMapFromAppleReminders,
  type ReminderImportChange,
  type ReminderPullChange,
} from '@/lib/apple-sync';
import { TASKS_CHANGED_EVENT } from '@/lib/use-remote-task-sync';
import { withTaskSyncLock } from '@/lib/task-sync-lock';
import type { TaskMap } from '@/lib/tasks-core';

const POLL_MS = 12_000;
const TASKS_KEY = '@tasks';

function labelExistsOnDay(map: TaskMap, dateKey: string, label: string): boolean {
  const norm = label.trim().toLowerCase();
  return (map[dateKey] ?? []).some(t => !t.archived && t.label.trim().toLowerCase() === norm);
}

/**
 * Syncs tasks with iOS Reminders (in/out) and imports new items from Reminders + Calendar.
 */
export function useAppleReminderSync(
  taskMap: TaskMap,
  setTaskMap: (map: TaskMap) => void,
  userId: string | null,
  onPulledChanges?: (changes: ReminderPullChange[]) => void,
  onImported?: (imports: ReminderImportChange[]) => void,
) {
  const taskMapRef = useRef(taskMap);
  const pullingRef = useRef(false);
  taskMapRef.current = taskMap;

  const pull = useCallback(async () => {
    if (Platform.OS !== 'ios' || pullingRef.current) return;
    pullingRef.current = true;
    try {
      await withTaskSyncLock(async () => {
        const raw = await AsyncStorage.getItem(TASKS_KEY);
        const currentMap: TaskMap = raw
          ? (JSON.parse(raw) as TaskMap)
          : taskMapRef.current;

        const { map, changes, imports, removals } =
          await syncTaskMapFromAppleReminders(currentMap);

        const mapChanged = JSON.stringify(map) !== JSON.stringify(currentMap);
        if (!mapChanged && changes.length === 0 && imports.length === 0 && removals.length === 0) {
          return;
        }

        setTaskMap(map);
        taskMapRef.current = map;
        await AsyncStorage.setItem(TASKS_KEY, JSON.stringify(map));
        DeviceEventEmitter.emit(TASKS_CHANGED_EVENT);

        if (userId) {
          const safeImports = imports.filter(
            c => !labelExistsOnDay(currentMap, c.dateKey, c.label),
          );
          await Promise.all([
            ...changes.map(c =>
              supabase.from('tasks').update({ done: c.done }).eq('id', c.taskId),
            ),
            ...safeImports.map(c =>
              supabase.from('tasks').insert({
                id: c.taskId,
                user_id: userId,
                date: c.dateKey,
                label: c.label,
                done: c.done,
                priority: c.priority ?? null,
              }),
            ),
            ...removals.map(r => supabase.from('tasks').delete().eq('id', r.taskId)),
          ]);
          if (safeImports.length > 0) onImported?.(safeImports);
        } else if (imports.length > 0) {
          onImported?.(imports);
        }

        if (changes.length > 0) onPulledChanges?.(changes);
      });
    } finally {
      pullingRef.current = false;
    }
  }, [setTaskMap, userId, onPulledChanges, onImported]);

  useFocusEffect(
    useCallback(() => {
      void pull();
      return undefined;
    }, [pull]),
  );

  useEffect(() => {
    if (Platform.OS !== 'ios') return;
    const sub = AppState.addEventListener('change', state => {
      if (state === 'active') void pull();
    });
    return () => sub.remove();
  }, [pull]);

  useEffect(() => {
    if (Platform.OS !== 'ios') return;
    const id = setInterval(() => {
      if (AppState.currentState === 'active') void pull();
    }, POLL_MS);
    return () => clearInterval(id);
  }, [pull]);
}
