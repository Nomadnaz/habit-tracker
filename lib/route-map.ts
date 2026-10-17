// ─────────────────────────────────────────────────────────────────────────
// Our own basemap for routes: streets, paths, rail, water and parks around a
// run, decoded from OpenFreeMap's vector tiles (OpenStreetMap data — free,
// no key, served from a CDN) and drawn by components/RouteMap.tsx in black
// and white. No raster tiles, no map provider styling. Decoded features are
// simplified and cached per area on the phone, so a route's map loads once.
// Data © OpenStreetMap contributors (ODbL) — the map shows the credit.
//
// Also the pace classes the route line is coloured by.
// ─────────────────────────────────────────────────────────────────────────

import AsyncStorage from '@react-native-async-storage/async-storage';
import { VectorTile } from '@mapbox/vector-tile';
import Pbf from 'pbf';
import type { Waypoint } from './activityFormulas';

export type FeatureKind = 'major' | 'minor' | 'path' | 'rail' | 'water' | 'waterway' | 'park';
export type Feature = { kind: FeatureKind; pts: [number, number][]; closed: boolean };
export type Bbox = { s: number; w: number; n: number; e: number };

const TILEJSON = 'https://tiles.openfreemap.org/planet';
const memo = new Map<string, Feature[]>();
let template: string | null = null;

/** The route's box, padded (at least ~400 m each way) so streets run off the edges. */
export function routeBbox(pts: { lat: number; lng: number }[], pad = 0.25): Bbox {
  const lats = pts.map(p => p.lat), lngs = pts.map(p => p.lng);
  const [s, n, w, e] = [Math.min(...lats), Math.max(...lats), Math.min(...lngs), Math.max(...lngs)];
  const dLat = Math.max((n - s) * pad, 0.0036), dLng = Math.max((e - w) * pad, 0.0036 / Math.cos((s * Math.PI) / 180));
  return { s: s - dLat, n: n + dLat, w: w - dLng, e: e + dLng };
}

const keyOf = (b: Bbox) => `@osm2:${[b.s, b.w, b.n, b.e].map(v => v.toFixed(3)).join(',')}`;

/** OpenMapTiles layer + class → our map layer. */
export function classify(layer: string, cls: string | undefined): FeatureKind | null {
  if (layer === 'transportation') {
    if (/^(motorway|trunk|primary|secondary)$/.test(cls ?? '')) return 'major';
    if (/^(tertiary|minor|service|raceway|busway)$/.test(cls ?? '')) return 'minor';
    if (/^(path|track|bridge|pier)$/.test(cls ?? '')) return 'path';
    if (/^(rail|transit)$/.test(cls ?? '')) return 'rail';
    return null;
  }
  if (layer === 'water') return 'water';
  if (layer === 'waterway') return 'waterway';
  if (layer === 'park') return 'park';
  if (layer === 'landcover' && /^(grass|wood|farmland)$/.test(cls ?? '')) return 'park';
  return null;
}

const tileX = (lng: number, z: number) => Math.floor(((lng + 180) / 360) * 2 ** z);
const tileY = (lat: number, z: number) => {
  const r = (lat * Math.PI) / 180;
  return Math.floor(((1 - Math.log(Math.tan(r) + 1 / Math.cos(r)) / Math.PI) / 2) * 2 ** z);
};
const toLng = (x: number, z: number) => (x / 2 ** z) * 360 - 180;
const toLat = (y: number, z: number) => (Math.atan(Math.sinh(Math.PI * (1 - (2 * y) / 2 ** z))) * 180) / Math.PI;

/** Decode one tile's features we draw, in lat/lng. */
export function decodeTile(buf: ArrayBuffer, z: number, x: number, y: number): Feature[] {
  const vt = new VectorTile(new Pbf(new Uint8Array(buf)));
  const out: Feature[] = [];
  for (const name of ['landcover', 'park', 'water', 'waterway', 'transportation']) {
    const layer = vt.layers[name];
    if (!layer) continue;
    for (let i = 0; i < layer.length; i++) {
      const f = layer.feature(i);
      const kind = classify(name, f.properties.class as string | undefined);
      if (!kind || f.type === 1) continue;
      const ext = f.extent;
      for (const ring of f.loadGeometry()) {
        if (ring.length < 2) continue;
        const pts = simplify(ring.map(p => [+toLat(y + p.y / ext, z).toFixed(5), +toLng(x + p.x / ext, z).toFixed(5)] as [number, number]));
        out.push({ kind, pts, closed: f.type === 3 });
      }
    }
  }
  return out;
}

/** Douglas–Peucker at ~2 m: streets keep their shape, the cache stays small. */
function simplify(pts: [number, number][], eps = 0.00002): [number, number][] {
  if (pts.length < 3) return pts;
  const [a, b] = [pts[0], pts[pts.length - 1]];
  let worst = 0, at = 0;
  for (let i = 1; i < pts.length - 1; i++) {
    const p = pts[i];
    const dx = b[1] - a[1], dy = b[0] - a[0];
    const d = Math.abs(dy * p[1] - dx * p[0] + b[1] * a[0] - b[0] * a[1]) / (Math.hypot(dx, dy) || 1e-12);
    if (d > worst) { worst = d; at = i; }
  }
  if (worst <= eps) return [a, b];
  return [...simplify(pts.slice(0, at + 1), eps).slice(0, -1), ...simplify(pts.slice(at), eps)];
}

const ORDER: FeatureKind[] = ['park', 'water', 'waterway', 'path', 'rail', 'minor', 'major'];

/** Streets etc. inside `b`, from cache or OpenFreeMap; [] when offline (the map falls back to a grid). */
export async function mapFeatures(b: Bbox): Promise<Feature[]> {
  const key = keyOf(b);
  const hit = memo.get(key);
  if (hit) return hit;
  try {
    const raw = await AsyncStorage.getItem(key);
    if (raw) { const f = JSON.parse(raw) as Feature[]; memo.set(key, f); return f; }
  } catch { /* fall through */ }
  try {
    if (!template) {
      const tj = await (await fetch(TILEJSON)).json();
      template = tj.tiles?.[0] ?? null;
      if (!template) return [];
    }
    // z14 (full detail) for a neighbourhood, z13 once the area spans a few km.
    const z = (b.e - b.w) * 111 * Math.cos((b.s * Math.PI) / 180) > 3 ? 13 : 14;
    const [x0, x1, y0, y1] = [tileX(b.w, z), tileX(b.e, z), tileY(b.n, z), tileY(b.s, z)];
    if ((x1 - x0 + 1) * (y1 - y0 + 1) > 12) return [];
    const jobs: Promise<Feature[]>[] = [];
    for (let x = x0; x <= x1; x++) for (let y = y0; y <= y1; y++) {
      const url = template.replace('{z}', String(z)).replace('{x}', String(x)).replace('{y}', String(y));
      jobs.push(fetch(url).then(r => (r.ok ? r.arrayBuffer() : null)).then(buf => (buf ? decodeTile(buf, z, x, y) : [])).catch(() => []));
    }
    const feats = (await Promise.all(jobs)).flat().sort((p, q) => ORDER.indexOf(p.kind) - ORDER.indexOf(q.kind));
    if (feats.length) {
      memo.set(key, feats);
      void AsyncStorage.setItem(key, JSON.stringify(feats)).catch(() => {});
    }
    return feats;
  } catch {
    return [];
  }
}

export type PaceClass = 'fast' | 'steady' | 'slow';

/** Each segment against the run's own average, smoothed over a few segments
 *  so GPS jitter doesn't paint confetti: >7% quicker = fast, >10% slower = slow. */
export function paceClasses(wp: Waypoint[]): PaceClass[] {
  const R = 6_371_000, rad = Math.PI / 180;
  const seg: { m: number; s: number }[] = [];
  for (let i = 1; i < wp.length; i++) {
    const a = wp[i - 1], b = wp[i];
    const dLat = (b.lat - a.lat) * rad, dLng = (b.lng - a.lng) * rad;
    const h = Math.sin(dLat / 2) ** 2 + Math.cos(a.lat * rad) * Math.cos(b.lat * rad) * Math.sin(dLng / 2) ** 2;
    seg.push({ m: 2 * R * Math.asin(Math.sqrt(h)), s: Math.max(0, (b.timestamp - a.timestamp) / 1000) });
  }
  const totM = seg.reduce((x, v) => x + v.m, 0), totS = seg.reduce((x, v) => x + v.s, 0);
  if (totM <= 0 || totS <= 0) return seg.map(() => 'steady');
  const avg = totS / totM; // s per m
  const K = 2;
  return seg.map((_, i) => {
    let m = 0, s = 0;
    for (let j = Math.max(0, i - K); j <= Math.min(seg.length - 1, i + K); j++) { m += seg[j].m; s += seg[j].s; }
    if (m <= 0) return 'steady';
    const r = s / m / avg;
    return r < 0.93 ? 'fast' : r > 1.1 ? 'slow' : 'steady';
  });
}
