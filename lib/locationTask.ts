// ─────────────────────────────────────────────────────────────────────────
// BACKGROUND LOCATION TASK — task 032's deferred follow-up.
// ─────────────────────────────────────────────────────────────────────────
// IMPLEMENTED BUT UNVERIFIED THIS SESSION — no physical device, no EAS dev
// build, no real outdoor walk. Specifically NOT checked: battery drain over
// a long recording, iOS background-refresh throttling behavior (the OS can
// reduce delivery frequency after backgrounding), and whether the
// foreground-service/background-location indicator config below is
// correct for both platforms. Foreground recording (the previously
// verified, working path) is left completely untouched and is always the
// fallback if background permission is denied or this task fails to start.
//
// TaskManager.defineTask() MUST run once at module scope (not inside a
// component) — Expo's background task registration reads this at JS
// bundle load, before any screen mounts. Imported once from app/_layout.tsx
// so the task is registered from cold start even if the Activity screen
// was never opened this session.
//
// The task callback can run with the JS engine backgrounded/the app not
// visible, so it writes straight to AsyncStorage rather than touching React
// state — app/(tabs)/activity.tsx drains this buffer in stop().
// ─────────────────────────────────────────────────────────────────────────

import AsyncStorage from '@react-native-async-storage/async-storage';
import * as TaskManager from 'expo-task-manager';
import * as Location from 'expo-location';
import type { Waypoint } from './activityFormulas';

export const LOCATION_TASK_NAME = 'activity-background-location';
const BUFFER_KEY = '@activity_bg_waypoints';

TaskManager.defineTask(LOCATION_TASK_NAME, async ({ data, error }) => {
  if (error) return;
  const locations = (data as { locations?: Location.LocationObject[] } | undefined)?.locations;
  if (!locations?.length) return;

  const newPoints: Waypoint[] = locations.map(loc => ({
    lat: loc.coords.latitude, lng: loc.coords.longitude,
    altitude: loc.coords.altitude, timestamp: loc.timestamp,
  }));

  try {
    const raw = await AsyncStorage.getItem(BUFFER_KEY);
    const existing: Waypoint[] = raw ? JSON.parse(raw) : [];
    await AsyncStorage.setItem(BUFFER_KEY, JSON.stringify([...existing, ...newPoints]));
  } catch {
    // Best-effort buffer — a write failure here just means those points are
    // lost, not a crash; the foreground watchPositionAsync subscription
    // (when active) still has its own in-memory copy.
  }
});

/** Drain + clear the background buffer — called once from stop(). */
export async function drainBackgroundWaypoints(): Promise<Waypoint[]> {
  try {
    const raw = await AsyncStorage.getItem(BUFFER_KEY);
    await AsyncStorage.removeItem(BUFFER_KEY);
    return raw ? JSON.parse(raw) : [];
  } catch {
    return [];
  }
}

/** Dedup (by timestamp) + sort chronologically — foreground and background points merged. */
export function mergeWaypoints(a: Waypoint[], b: Waypoint[]): Waypoint[] {
  const byTimestamp = new Map<number, Waypoint>();
  for (const p of [...a, ...b]) byTimestamp.set(p.timestamp, p);
  return [...byTimestamp.values()].sort((x, y) => x.timestamp - y.timestamp);
}

export async function startBackgroundLocation(): Promise<boolean> {
  try {
    const { status } = await Location.requestBackgroundPermissionsAsync();
    if (status !== 'granted') return false;
    await Location.startLocationUpdatesAsync(LOCATION_TASK_NAME, {
      accuracy: Location.Accuracy.Balanced,
      timeInterval: 5000,
      distanceInterval: 10,
      showsBackgroundLocationIndicator: true, // iOS: the blue status-bar pill while tracking in background
      foregroundService: {
        notificationTitle: 'Recording activity',
        notificationBody: 'Tracking your route in the background.',
      },
    });
    return true;
  } catch {
    return false;
  }
}

export async function stopBackgroundLocation(): Promise<void> {
  try {
    const running = await TaskManager.isTaskRegisteredAsync(LOCATION_TASK_NAME);
    if (running) await Location.stopLocationUpdatesAsync(LOCATION_TASK_NAME);
  } catch {
    // Nothing to stop, or the OS already tore it down — not an error case.
  }
}
