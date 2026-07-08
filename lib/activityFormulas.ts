// ─────────────────────────────────────────────────────────────────────────
// activityFormulas.ts — pure geometry extracted from lib/activity-data.ts
// ─────────────────────────────────────────────────────────────────────────
// Zero React Native / Supabase imports on purpose — see lib/bodyFormulas.ts's
// header for why (RN's own source uses Flow syntax vitest/rolldown can't
// parse, so anything importing it breaks the whole test file).
// ─────────────────────────────────────────────────────────────────────────

export type Waypoint = { lat: number; lng: number; altitude?: number | null; timestamp: number };

const EARTH_RADIUS_M = 6371000;

function haversineM(a: Waypoint, b: Waypoint): number {
  const toRad = (d: number) => (d * Math.PI) / 180;
  const dLat = toRad(b.lat - a.lat);
  const dLng = toRad(b.lng - a.lng);
  const s = Math.sin(dLat / 2) ** 2 + Math.cos(toRad(a.lat)) * Math.cos(toRad(b.lat)) * Math.sin(dLng / 2) ** 2;
  return 2 * EARTH_RADIUS_M * Math.asin(Math.sqrt(s));
}

export function computeDistanceM(waypoints: Waypoint[]): number {
  let total = 0;
  for (let i = 1; i < waypoints.length; i++) total += haversineM(waypoints[i - 1], waypoints[i]);
  return Math.round(total);
}

export function computeElevationGainM(waypoints: Waypoint[]): number {
  let gain = 0;
  for (let i = 1; i < waypoints.length; i++) {
    const a = waypoints[i - 1].altitude, b = waypoints[i].altitude;
    if (a != null && b != null && b > a) gain += b - a;
  }
  return Math.round(gain);
}

/** Seconds per km, or undefined if distance is negligible. */
export function computePacePerKm(distanceM: number, durationSecs: number): number | undefined {
  if (distanceM < 10) return undefined;
  return Math.round(durationSecs / (distanceM / 1000));
}

/** Per-segment pace (secs/km) between consecutive waypoints, for pace-coloured route drawing. */
export function segmentPaces(waypoints: Waypoint[]): number[] {
  const paces: number[] = [];
  for (let i = 1; i < waypoints.length; i++) {
    const dist = haversineM(waypoints[i - 1], waypoints[i]);
    const secs = (waypoints[i].timestamp - waypoints[i - 1].timestamp) / 1000;
    paces.push(dist > 0.5 && secs > 0 ? secs / (dist / 1000) : paces[paces.length - 1] ?? 0);
  }
  return paces;
}

export function toGeoJSON(waypoints: Waypoint[]): { type: 'LineString'; coordinates: [number, number][] } {
  return { type: 'LineString', coordinates: waypoints.map(w => [w.lng, w.lat]) };
}

export type Split = { km: number; paceSecPerKm: number };

/**
 * Real per-kilometre splits from the actual recorded waypoints — walks the
 * route cumulatively and cuts a split every time 1000m of real distance has
 * accumulated, using each waypoint's real timestamp for the elapsed time.
 * The final partial kilometre (if any) is reported as a fractional km with
 * its own pace, not silently dropped.
 */
export function computeSplits(waypoints: Waypoint[]): Split[] {
  if (waypoints.length < 2) return [];
  const splits: Split[] = [];
  let splitDistM = 0;
  let splitStartTs = waypoints[0].timestamp;
  let splitStartDistM = 0;
  let cumDistM = 0;

  for (let i = 1; i < waypoints.length; i++) {
    const segM = haversineM(waypoints[i - 1], waypoints[i]);
    cumDistM += segM;
    splitDistM += segM;

    if (splitDistM >= 1000) {
      const elapsedSec = (waypoints[i].timestamp - splitStartTs) / 1000;
      splits.push({ km: splits.length + 1, paceSecPerKm: Math.round(elapsedSec / (splitDistM / 1000)) });
      splitStartTs = waypoints[i].timestamp;
      splitStartDistM = cumDistM;
      splitDistM = 0;
    }
  }

  // Final partial km, if any real distance remains.
  if (splitDistM > 10) {
    const last = waypoints[waypoints.length - 1];
    const elapsedSec = (last.timestamp - splitStartTs) / 1000;
    const partialKm = splitDistM / 1000;
    splits.push({ km: Math.round((splitStartDistM / 1000 + partialKm) * 100) / 100, paceSecPerKm: Math.round(elapsedSec / partialKm) });
  }

  return splits;
}
