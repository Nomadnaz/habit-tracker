import { useCallback, useEffect, useRef } from 'react';
import { AppState, Platform } from 'react-native';
import { useFocusEffect } from 'expo-router';
import AsyncStorage from '@react-native-async-storage/async-storage';
import { supabase } from '@/lib/supabase';
import {
  syncTaskMapFromAppleReminders,
  type ReminderImportChange,
  type ReminderPullChange,
} from '@/lib/apple-sync';
import type { TaskMap } from '@/lib/tasks-core';

const POLL_MS = 12_000;

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
      const { map, changes, imports, removals } = await syncTaskMapFromAppleReminders(
        taskMapRef.current,
      );
      if (changes.length === 0 && imports.length === 0 && removals.length === 0) return;

      setTaskMap(map);
      taskMapRef.current = map;
      void AsyncStorage.setItem('@tasks', JSON.stringify(map));

      if (userId) {
        await Promise.all([
          ...changes.map(c =>
            supabase.from('tasks').update({ done: c.done }).eq('id', c.taskId),
          ),
          ...imports.map(c =>
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
      }

      if (changes.length > 0) onPulledChanges?.(changes);
      if (imports.length > 0) onImported?.(imports);
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
