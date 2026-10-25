// Stale-while-revalidate for the local-first screens. They draw from
// AsyncStorage at once and pull from Supabase when they come into view;
// useRevalidate(pull) also re-runs `pull` while the screen is in view when
// the app comes back to the foreground, and when the connection to Supabase
// comes back after a drop (the realtime link re-subscribing, reported by
// lib/use-remote-task-sync.ts). The first load on focus stays the screen's own.
import { useCallback, useRef } from 'react';
import { AppState } from 'react-native';
import { useFocusEffect } from 'expo-router';

const online = new Set<() => void>();

/** The connection is back after a drop: every screen in view re-pulls. */
export const emitOnline = () => online.forEach(l => l());

export function useRevalidate(pull: () => void) {
  const ref = useRef(pull);
  ref.current = pull;
  useFocusEffect(useCallback(() => {
    let away = false;
    const run = () => ref.current();
    const app = AppState.addEventListener('change', s => {
      if (s === 'background') away = true;
      else if (s === 'active' && away) { away = false; run(); }
    });
    online.add(run);
    return () => { app.remove(); online.delete(run); };
  }, []));
}
