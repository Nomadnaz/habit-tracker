// ─────────────────────────────────────────────────────────────────────────
// Our own basemap for routes: building blocks, streets and their names,
// paths, rail, water and parks around a run, decoded from OpenFreeMap's
// vector tiles (OpenStreetMap data — free, no key, served from a CDN) and
// drawn by components/RouteMap.tsx as a dithered black-and-white block map.
// Tiles are decoded, simplified and cached one by one on the phone, so any
// view over the same streets loads once.
// Data © OpenStreetMap contributors (ODbL) — the map shows the credit.
//
// Also the route itself, resampled evenly by distance with a smoothed pace
// ratio per step, which the line's colour gradient is drawn from.
// ─────────────────────────────────────────────────────────────────────────

import AsyncStorage from '@react-native-async-storage/async-storage';
import { VectorTile } from '@mapbox/vector-tile';
import Pbf from 'pbf';
import type { Waypoint } from './activityFormulas';

export type FeatureKind = 'major' | 'minor' | 'path' | 'rail' | 'water' | 'waterway' | 'park' | 'building' | 'name';
/** pts are [lat, lng]. Buildings carry their height in metres; street names their name. */
export type Feature = { kind: FeatureKind; pts: [number, number][]; closed: boolean; h?: number; name?: string };
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

/** OpenMapTiles layer + class → our map layer. */
export function classify(layer: string, cls: string | undefined): FeatureKind | null {
  if (layer === 'transportation') {
    if (/^(motorway|trunk|primary|secondary)$/.test(cls ?? '')) return 'major';
    if (/^(tertiary|minor|service|raceway|busway)$/.test(cls ?? '')) return 'minor';
    if (/^(path|track|bridge|pier)$/.test(cls ?? '')) return 'path';
    if (/^(rail|transit)$/.test(cls ?? '')) return 'rail';
    return null;
  }
  if (layer === 'transportation_name') return /^(motorway|trunk|primary|secondary|tertiary|minor)$/.test(cls ?? '') ? 'name' : null;
  if (layer === 'building') return 'building';
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

const LAYERS = ['landcover', 'park', 'water', 'waterway', 'transportation', 'building', 'transportation_name'];

/** Decode one tile's features we draw, in lat/lng. */
export function decodeTile(buf: ArrayBuffer, z: number, x: number, y: number): Feature[] {
  const vt = new VectorTile(new Pbf(new Uint8Array(buf)));
  // ~1.6 m at z14: block corners stay square, the cache stays small.
  const eps = z >= 14 ? 0.000015 : 0.00003;
  const out: Feature[] = [];
  for (const name of LAYERS) {
    const layer = vt.layers[name];
    if (!layer) continue;
    for (let i = 0; i < layer.length; i++) {
      const f = layer.feature(i);
      const kind = classify(name, f.properties.class as string | undefined);
      if (!kind || f.type === 1) continue;
      const label = kind === 'name' ? String(f.properties.name ?? '') : '';
      if (kind === 'name' && !label) continue;
      const h = kind === 'building' ? Number(f.properties.render_height ?? 0) || 0 : undefined;
      const ext = f.extent;
      for (const ring of f.loadGeometry()) {
        if (ring.length < 2) continue;
        const pts = simplify(ring.map(p => [+toLat(y + p.y / ext, z).toFixed(6), +toLng(x + p.x / ext, z).toFixed(6)] as [number, number]), eps);
        if (f.type === 3 && pts.length < 4) continue; // collapsed to a sliver
        out.push({ kind, pts, closed: f.type === 3, ...(h !== undefined && { h }), ...(label && { name: label }) });
      }
    }
  }
  return out;
}

/** Douglas–Peucker in degrees. */
function simplify(pts: [number, number][], eps = 0.00002): [number, number][] {
  if (pts.length < 3) return pts;
  const [a, b] = [pts[0], pts[pts.length - 1]];
  let worst = 0, at = 0;
  for (let i = 1; i < pts.length - 1; i++) {
    const p = pts[i];
    const dx = b[1] - a[1], dy = b[0] - a[0];
    const len = Math.hypot(dx, dy);
    // a closed ring's ends coincide: measure from the point instead of the chord
    const d = len < 1e-12 ? Math.hypot(p[0] - a[0], p[1] - a[1]) : Math.abs(dy * p[1] - dx * p[0] + b[1] * a[0] - b[0] * a[1]) / len;
    if (d > worst) { worst = d; at = i; }
  }
  if (worst <= eps) return [a, b];
  return [...simplify(pts.slice(0, at + 1), eps).slice(0, -1), ...simplify(pts.slice(at), eps)];
}

async function tile(z: number, x: number, y: number): Promise<Feature[]> {
  const key = `@osmt3:${z}/${x}/${y}`;
  const hit = memo.get(key);
  if (hit) return hit;
  try {
    const raw = await AsyncStorage.getItem(key);
    if (raw) { const f = unpack(JSON.parse(raw)); memo.set(key, f); return f; }
  } catch { /* fall through */ }
  if (!template) {
    const tj = await (await fetch(TILEJSON)).json();
    template = tj.tiles?.[0] ?? null;
    if (!template) return [];
  }
  const res = await fetch(template.replace('{z}', String(z)).replace('{x}', String(x)).replace('{y}', String(y)));
  if (!res.ok) return [];
  const buf = await res.arrayBuffer();
  // let a frame through before the decode, so animations don't hitch on it
  await new Promise(r => setTimeout(r, 0));
  const feats = decodeTile(buf, z, x, y);
  memo.set(key, feats);
  void AsyncStorage.setItem(key, JSON.stringify(pack(feats))).catch(() => {});
  return feats;
}

// Stored compactly: micro-degree integers, each point as a delta from the
// last, so a dense city tile is a few hundred KB rather than most of a MB.
type Packed = { k: FeatureKind; c?: 1; h?: number; n?: string; p: number[] };
export function pack(fs: Feature[]): Packed[] {
  return fs.map(f => {
    const p: number[] = [];
    let la = 0, lo = 0;
    for (const [a, b] of f.pts) {
      const A = Math.round(a * 1e6), B = Math.round(b * 1e6);
      p.push(A - la, B - lo); la = A; lo = B;
    }
    return { k: f.kind, p, ...(f.closed && { c: 1 as const }), ...(f.h && { h: f.h }), ...(f.name && { n: f.name }) };
  });
}
export function unpack(ps: Packed[]): Feature[] {
  return ps.map(q => {
    const pts: [number, number][] = [];
    let la = 0, lo = 0;
    for (let i = 0; i < q.p.length; i += 2) { la += q.p[i]; lo += q.p[i + 1]; pts.push([la / 1e6, lo / 1e6]); }
    return { kind: q.k, pts, closed: !!q.c, ...(q.h && { h: q.h }), ...(q.n && { name: q.n }) };
  });
}

const ORDER: FeatureKind[] = ['park', 'water', 'waterway', 'path', 'rail', 'minor', 'major', 'building', 'name'];

/** Everything inside `b`, tile by tile from cache or OpenFreeMap; [] when
 *  offline (the map falls back to a grid). z14 has the building blocks. */
export async function mapFeatures(b: Bbox): Promise<Feature[]> {
  try {
    let z = 14;
    const count = (zz: number) => (tileX(b.e, zz) - tileX(b.w, zz) + 1) * (tileY(b.s, zz) - tileY(b.n, zz) + 1);
    while (z > 12 && count(z) > 9) z--;
    if (count(z) > 16) return [];
    const jobs: Promise<Feature[]>[] = [];
    for (let x = tileX(b.w, z); x <= tileX(b.e, z); x++)
      for (let y = tileY(b.n, z); y <= tileY(b.s, z); y++) jobs.push(tile(z, x, y).catch(() => []));
    return (await Promise.all(jobs)).flat().sort((p, q) => ORDER.indexOf(p.kind) - ORDER.indexOf(q.kind));
  } catch {
    return [];
  }
}

/** Warm the tile cache for a route before its map is on screen. */
export function prefetchRouteMap(pts: { lat: number; lng: number }[]): Promise<Feature[]> {
  return pts.length ? mapFeatures(routeBbox(pts, 0.6)) : Promise.resolve([]);
}

const R = 6_371_000, RAD = Math.PI / 180;
function metres(a: { lat: number; lng: number }, b: { lat: number; lng: number }) {
  const dLat = (b.lat - a.lat) * RAD, dLng = (b.lng - a.lng) * RAD;
  const h = Math.sin(dLat / 2) ** 2 + Math.cos(a.lat * RAD) * Math.cos(b.lat * RAD) * Math.sin(dLng / 2) ** 2;
  return 2 * R * Math.asin(Math.sqrt(h));
}

export type Sampled = {
  lat: number[]; lng: number[];
  /** metres and seconds from the start at each sample */
  m: number[]; s: number[];
  /** per step (length − 1): pace against the run's average, smoothed over ~±80 m; <1 is quicker */
  ratio: number[];
  /** sample index where each whole km is reached */
  km: number[];
  total: number;
  /** average seconds per km */
  avg: number;
};

/** The route resampled to even steps along its length (at most `max` points). */
export function sampleRoute(wp: Waypoint[], max = 260): Sampled {
  const d = [0], t = [0];
  for (let i = 1; i < wp.length; i++) {
    d.push(d[i - 1] + metres(wp[i - 1], wp[i]));
    t.push(Math.max(t[i - 1], (wp[i].timestamp - wp[0].timestamp) / 1000));
  }
  const total = d[d.length - 1] ?? 0;
  const out: Sampled = { lat: [], lng: [], m: [], s: [], ratio: [], km: [], total, avg: 0 };
  if (!wp.length) return out;
  if (total <= 0) {
    out.lat.push(wp[0].lat); out.lng.push(wp[0].lng); out.m.push(0); out.s.push(0);
    return out;
  }
  const step = Math.max(total / (max - 1), 3);
  const n = Math.ceil(total / step);
  let j = 0;
  for (let k = 0; k <= n; k++) {
    const D = Math.min(k * step, total);
    while (j < d.length - 2 && d[j + 1] < D) j++;
    const span = d[j + 1] - d[j], f = span > 0 ? (D - d[j]) / span : 0;
    out.lat.push(wp[j].lat + (wp[j + 1].lat - wp[j].lat) * f);
    out.lng.push(wp[j].lng + (wp[j + 1].lng - wp[j].lng) * f);
    out.m.push(D);
    out.s.push(t[j] + (t[j + 1] - t[j]) * f);
  }
  const totS = out.s[out.s.length - 1];
  out.avg = totS > 0 ? (totS / total) * 1000 : 0;
  const W = Math.max(1, Math.round(80 / step));
  for (let k = 0; k < out.m.length - 1; k++) {
    const a = Math.max(0, k - W), b = Math.min(out.m.length - 1, k + 1 + W);
    const dm = out.m[b] - out.m[a], ds = out.s[b] - out.s[a];
    out.ratio.push(dm > 0 && totS > 0 ? (ds / dm) / (totS / total) : 1);
  }
  for (let km = 1; km * 1000 <= total; km++) out.km.push(out.m.findIndex(v => v >= km * 1000 - 1e-6));
  return out;
}

export type PaceClass = 'fast' | 'steady' | 'slow';

/** Each segment against the run's own average, smoothed over a few segments
 *  so GPS jitter doesn't paint confetti: >7% quicker = fast, >10% slower = slow. */
export function paceClasses(wp: Waypoint[]): PaceClass[] {
  const seg: { m: number; s: number }[] = [];
  for (let i = 1; i < wp.length; i++) seg.push({ m: metres(wp[i - 1], wp[i]), s: Math.max(0, (wp[i].timestamp - wp[i - 1].timestamp) / 1000) });
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
