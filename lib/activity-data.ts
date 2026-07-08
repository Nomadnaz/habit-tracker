// ─────────────────────────────────────────────────────────────────────────
// ACTIVITY (hike/run/walk) — LOCAL DATA LAYER
// ─────────────────────────────────────────────────────────────────────────
// Same local-first pattern as the rest of this app's domains: finished
// activities are cached in AsyncStorage for instant/offline reads, then
// fire-and-forget to Supabase + postWrite(). Live GPS recording itself
// (expo-location watchPositionAsync) lives in the screen, not here — this
// module only turns a finished list of waypoints into distance/pace/
// elevation numbers and persists the result.
// ─────────────────────────────────────────────────────────────────────────

import AsyncStorage from '@react-native-async-storage/async-storage';
import { supabase } from './supabase';
import { postWrite } from './postWrite';
import { withStorageLock } from './storageLock';
import {
  computeDistanceM, computeElevationGainM, computePacePerKm, segmentPaces,
  toGeoJSON, computeSplits, type Waypoint, type Split,
} from './activityFormulas';
export {
  computeDistanceM, computeElevationGainM, computePacePerKm, segmentPaces,
  toGeoJSON, computeSplits, type Waypoint, type Split,
};

function genId() { return Math.random().toString(36).slice(2) + Date.now().toString(36); }
async function getUid(): Promise<string | null> {
  const { data } = await supabase.auth.getUser();
  return data.user?.id ?? null;
}
function bg(fn: () => Promise<unknown>) { fn().catch(() => {}); }

const ACTIVITIES_KEY = '@activities';

export type ActivityType = 'hike' | 'run' | 'walk';

export type Activity = {
  id: string;
  type: ActivityType;
  startTime: string; // ISO
  endTime: string;   // ISO
  durationSecs: number;
  distanceM: number;
  avgPacePerKm?: number; // seconds per km
  elevationGainM: number;
  waypoints: Waypoint[];
  createdAt: string;
};

// ── Load / save ───────────────────────────────────────────────────────────────

async function loadActivities(): Promise<Activity[]> {
  try {
    const raw = await AsyncStorage.getItem(ACTIVITIES_KEY);
    if (raw) return JSON.parse(raw) as Activity[];
  } catch { /* fall through */ }
  return [];
}

async function saveActivities(list: Activity[]): Promise<void> {
  await AsyncStorage.setItem(ACTIVITIES_KEY, JSON.stringify(list));
}

/** All activities with startTime within [fromIso, toIso) — for real weekly/monthly rollups. */
export async function getActivitiesInRange(fromIso: string, toIso: string): Promise<Activity[]> {
  const list = await loadActivities();
  return list.filter(a => a.startTime >= fromIso && a.startTime < toIso);
}

export async function getActivityById(id: string): Promise<Activity | null> {
  const list = await loadActivities();
  return list.find(a => a.id === id) ?? null;
}

export async function getRecentActivities(limit = 10): Promise<Activity[]> {
  const list = await loadActivities();
  return [...list].sort((a, b) => b.startTime.localeCompare(a.startTime)).slice(0, limit);
}

/** Finalize + persist a recorded activity from its raw waypoints. */
export async function saveActivity(input: {
  type: ActivityType; startTime: string; endTime: string; waypoints: Waypoint[];
}): Promise<Activity> {
  const durationSecs = Math.max(1, Math.round((new Date(input.endTime).getTime() - new Date(input.startTime).getTime()) / 1000));
  const distanceM = computeDistanceM(input.waypoints);
  const activity: Activity = {
    id: genId(), type: input.type, startTime: input.startTime, endTime: input.endTime,
    durationSecs, distanceM, avgPacePerKm: computePacePerKm(distanceM, durationSecs),
    elevationGainM: computeElevationGainM(input.waypoints), waypoints: input.waypoints,
    createdAt: new Date().toISOString(),
  };

  await withStorageLock(ACTIVITIES_KEY, async () => saveActivities([...(await loadActivities()), activity]));

  bg(async () => {
    const userId = await getUid();
    if (!userId) return;
    await supabase.from('activities').insert({
      id: activity.id, user_id: userId, type: activity.type,
      start_time: activity.startTime, end_time: activity.endTime,
      duration_secs: activity.durationSecs, distance_m: activity.distanceM,
      avg_pace_per_km: activity.avgPacePerKm ?? null, elevation_gain_m: activity.elevationGainM,
      route_geojson: toGeoJSON(activity.waypoints),
    });
    await bumpCumulativeStats(userId, activity);
  });

  postWrite('activity', { type: activity.type, distanceM: activity.distanceM, durationSecs }, 'create');

  return activity;
}

async function bumpCumulativeStats(userId: string, activity: Activity): Promise<void> {
  const { data: existing } = await supabase
    .from('activity_stats_cumulative')
    .select('*')
    .eq('user_id', userId)
    .maybeSingle();

  const col = activity.type === 'hike' ? 'total_hike_distance_m' : activity.type === 'run' ? 'total_run_distance_m' : 'total_walk_distance_m';
  const base = existing ?? {
    total_hike_distance_m: 0, total_run_distance_m: 0, total_walk_distance_m: 0,
    total_elevation_gain_m: 0, total_activity_time_secs: 0,
  };

  await supabase.from('activity_stats_cumulative').upsert({
    user_id: userId,
    ...base,
    [col]: (base[col] ?? 0) + activity.distanceM,
    total_elevation_gain_m: (base.total_elevation_gain_m ?? 0) + activity.elevationGainM,
    total_activity_time_secs: (base.total_activity_time_secs ?? 0) + activity.durationSecs,
    last_updated: new Date().toISOString(),
  });
}

// ── Display helpers ───────────────────────────────────────────────────────────

export function formatDuration(secs: number): string {
  const h = Math.floor(secs / 3600), m = Math.floor((secs % 3600) / 60), s = secs % 60;
  return h > 0 ? `${h}:${String(m).padStart(2, '0')}:${String(s).padStart(2, '0')}` : `${m}:${String(s).padStart(2, '0')}`;
}

export function formatPace(secsPerKm?: number): string {
  if (!secsPerKm) return '--:--';
  const m = Math.floor(secsPerKm / 60), s = Math.round(secsPerKm % 60);
  return `${m}:${String(s).padStart(2, '0')}/km`;
}

export function formatDistance(meters: number): string {
  return meters >= 1000 ? `${(meters / 1000).toFixed(2)}km` : `${Math.round(meters)}m`;
}
