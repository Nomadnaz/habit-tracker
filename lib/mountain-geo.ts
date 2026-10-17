// The climb mountain's geometry and software renderer, kept free of React
// Native so it can be tested and dumped as text. components/steps/Mountain.tsx
// draws the frames this produces.
//
// The mountain: two peaks joined by a saddle, lumpy shoulders, an irregular
// footprint and ridged rock — a heightfield sampled on a 128² grid. Each
// frame projects it into a character grid with a depth buffer, lit by a
// fixed sun. Level of detail follows zoom: far, shading characters and '^'
// trees; near, the meadow turns into swaying grass blades with flowers,
// trees and huts become little ASCII sprites, and the camera drifts to
// where you are on the trail.

import { MTN } from './theme';

export type Checkpoint = { t: number; label: string; reached: boolean; time?: string };

// ── noise ────────────────────────────────────────────────────────────────

export const hash = (x: number, y: number) => {
  const s = Math.sin(x * 127.1 + y * 311.7) * 43758.5453;
  return s - Math.floor(s);
};
function noise(x: number, y: number) {
  const ix = Math.floor(x), iy = Math.floor(y), fx = x - ix, fy = y - iy;
  const u = fx * fx * (3 - 2 * fx), v = fy * fy * (3 - 2 * fy);
  const a = hash(ix, iy), b = hash(ix + 1, iy), c = hash(ix, iy + 1), d = hash(ix + 1, iy + 1);
  return a + (b - a) * u + (c - a) * v + (a - b - c + d) * u * v;
}
const ridged = (x: number, y: number) => {
  let s = 0, amp = 0.55, f = 1;
  for (let o = 0; o < 4; o++) { s += amp * (1 - Math.abs(2 * noise(x * f, y * f) - 1)); amp *= 0.5; f *= 2.1; }
  return s;
};
const smax = (a: number, b: number, k: number) => {
  const h = Math.max(0, Math.min(1, 0.5 + (a - b) / (2 * k)));
  return b + (a - b) * h + k * h * (1 - h);
};

// ── terrain ──────────────────────────────────────────────────────────────

const PEAKS = [
  { x: 0.26, z: -0.14, h: 0.98, r: 0.58 },  // main summit
  { x: -0.42, z: 0.28, h: 0.82, r: 0.46 },  // the twin
];
// Lumps on the shoulders.
const LUMPS = [
  { x: 0.55, z: 0.35, a: 0.09, r: 0.2 }, { x: -0.1, z: -0.55, a: 0.08, r: 0.18 }, { x: -0.6, z: -0.25, a: 0.07, r: 0.2 },
  { x: 0.45, z: -0.5, a: 0.06, r: 0.16 }, { x: 0.05, z: 0.6, a: 0.07, r: 0.18 }, { x: -0.62, z: 0.48, a: 0.05, r: 0.15 },
];

/** Height at (x, z) in [-1, 1]²; −1 outside the footprint. */
export function height(x: number, z: number): number {
  const r = Math.hypot(x, z);
  const th = Math.atan2(z, x);
  // An irregular footprint, not a circle.
  const edge = 0.86 + 0.12 * noise(Math.cos(th) * 1.6 + 5, Math.sin(th) * 1.6 + 5);
  if (r > edge) return -1;
  const rim = 1 - Math.max(0, Math.min(1, (r - edge * 0.7) / (edge * 0.3))) ** 1.6;
  // Domain warp so the peaks' slopes wander.
  const wx = x + 0.1 * (noise(x * 3 + 1, z * 3) - 0.5), wz = z + 0.1 * (noise(x * 3, z * 3 + 4) - 0.5);
  const peak = (p: typeof PEAKS[0]) => p.h * Math.max(0, 1 - Math.hypot(wx - p.x, wz - p.z) / p.r) ** 1.45;
  let h = smax(peak(PEAKS[0]), peak(PEAKS[1]), 0.12) + 0.2 * Math.max(0, 1 - r / edge) ** 1.3;
  for (const l of LUMPS) h += l.a * Math.exp(-(((x - l.x) ** 2 + (z - l.z) ** 2) / (l.r * l.r)));
  h += 0.16 * h * (ridged(x * 2.4 + 3.3, z * 2.4 + 7.1) - 0.5);
  return Math.max(0, h * rim);
}

type Band = 0 | 1 | 2 | 3 | 4 | 5; // ground, forest, meadow, scree, rock, snow
type Vert = { x: number; y: number; z: number; nx: number; ny: number; nz: number; band: Band; tree: boolean; seed: number };

const N = 128;
const STEP = 2 / N;
export const VERTS: Vert[] = (() => {
  const out: Vert[] = [];
  const e = STEP;
  for (let i = 0; i <= N; i++) for (let j = 0; j <= N; j++) {
    const x = -1 + i * e, z = -1 + j * e;
    const y = height(x, z);
    if (y < 0) continue;
    const hx = (Math.max(0, height(x + e, z)) - Math.max(0, height(x - e, z))) / (2 * e);
    const hz = (Math.max(0, height(x, z + e)) - Math.max(0, height(x, z - e))) / (2 * e);
    const len = Math.hypot(hx, 1, hz);
    const nx = -hx / len, ny = 1 / len, nz = -hz / len;
    const wob = noise(x * 9, z * 9) * 0.07;
    const band: Band = y < 0.01 ? 0
      : y > 0.66 + wob ? 5
      : y > 0.44 + wob ? (ny < 0.66 ? 4 : 3)
      : y > 0.12 + wob ? (ny > 0.62 ? 2 : 4)
      : y < 0.09 ? 1 : 2;
    const seed = hash(i * 1.3, j * 0.7);
    out.push({ x, y, z, nx, ny, nz, band, tree: band === 1 && seed > 0.86 && y > 0.02, seed });
  }
  return out;
})();

export const PEAK = (() => {
  let best = { x: 0, z: 0, y: 0 };
  for (const v of VERTS) if (v.y > best.y) best = { x: v.x, z: v.z, y: v.y };
  return best;
})();

// ── the trail: base camp → round the twin → switchbacks → saddle → summit ──

const CTRL: [number, number][] = [
  [-0.05, 0.84], [-0.46, 0.7], [-0.74, 0.32], [-0.7, -0.1], [-0.46, -0.4], [-0.12, -0.6],
  [0.2, -0.6], [0.0, -0.44], [0.28, -0.42], [0.06, -0.28], [-0.14, -0.02], [0.0, 0.06], [0.14, -0.04], [PEAK.x, PEAK.z],
];
function catmull(p: [number, number][], t: number): [number, number] {
  const n = p.length - 1, f = t * n, i = Math.min(n - 1, Math.floor(f)), u = f - i;
  const p0 = p[Math.max(0, i - 1)], p1 = p[i], p2 = p[i + 1], p3 = p[Math.min(n, i + 2)];
  const c = (a: number, b: number, cc: number, d: number) => 0.5 * (2 * b + (-a + cc) * u + (2 * a - 5 * b + 4 * cc - d) * u * u + (-a + 3 * b - 3 * cc + d) * u * u * u);
  return [c(p0[0], p1[0], p2[0], p3[0]), c(p0[1], p1[1], p2[1], p3[1])];
}
export const ROUTE = (() => {
  // Sample densely, then re-space by arc length so `t` is distance along the trail.
  const raw = Array.from({ length: 600 }, (_, k) => catmull(CTRL, k / 599));
  const acc = [0];
  for (let k = 1; k < raw.length; k++) acc.push(acc[k - 1] + Math.hypot(raw[k][0] - raw[k - 1][0], raw[k][1] - raw[k - 1][1]));
  const L = acc[acc.length - 1];
  const out: { t: number; x: number; z: number; y: number }[] = [];
  let j = 0;
  for (let k = 0; k < 260; k++) {
    const want = (k / 259) * L;
    while (j < acc.length - 2 && acc[j + 1] < want) j++;
    const f = (want - acc[j]) / ((acc[j + 1] - acc[j]) || 1);
    const x = raw[j][0] + (raw[j + 1][0] - raw[j][0]) * f, z = raw[j][1] + (raw[j + 1][1] - raw[j][1]) * f;
    out.push({ t: k / 259, x, z, y: Math.max(0, height(x, z)) + 0.016 });
  }
  return out;
})();
export const routeAt = (t: number) => ROUTE[Math.max(0, Math.min(ROUTE.length - 1, Math.round(t * (ROUTE.length - 1))))];

// ── characters ───────────────────────────────────────────────────────────

const RAMP = ' .,:;-=+*#%@';
const LIGHT = (() => { const l = [-0.55, 0.75, -0.4]; const n = Math.hypot(...l); return l.map(v => v / n); })();
const GREENS = [MTN.meadow, MTN.forest, MTN.grassHi];

function farLook(v: Vert, b: number): [string, string] {
  const ch = RAMP[Math.max(1, Math.min(RAMP.length - 1, Math.round(b * (RAMP.length - 1))))];
  switch (v.band) {
    case 0: return ['.', MTN.ground];
    case 1: return [b > 0.5 ? '"' : ':', MTN.forest];
    case 2: return [ch, b > 0.55 ? MTN.meadow : MTN.forest];
    case 3: return [ch, MTN.scree];
    case 4: return [ch, b > 0.55 ? MTN.rock : MTN.rockShade];
    case 5: return [ch, b > 0.5 ? MTN.snow : MTN.snowShade];
  }
}

/** A grass blade leaning with the wind: '/', '|', '\', with the odd tuft and flower. */
function blade(v: Vert, time: number, c: number, r: number): [string, string] {
  if (v.seed > 0.975) return ['*', MTN.flower];
  const w = Math.sin(time * 1.7 + v.x * 9 + v.z * 6) + 0.35 * Math.sin(time * 3.1 + v.seed * 20);
  const ch = w > 0.45 ? '/' : w < -0.45 ? '\\' : v.seed > 0.7 ? '\'' : '|';
  // Colour in runs of three cells, so a row is a handful of spans, not one per blade.
  return [ch, GREENS[Math.floor(hash(Math.floor(c / 3), r) * 3)]];
}

const TREE_NEAR = [[' ', '^', ' '], ['/', '^', '\\'], [' ', '|', ' ']];
const HUT_NEAR = [[' ', '/', '\\', ' '], ['/', '_', '_', '\\'], ['|', '[', ']', '|']];
const HUT_FAR = [['/', '\\'], ['[', ']']];

// ── frame ────────────────────────────────────────────────────────────────

export type Flagline = { x1: number; y1: number; x2: number; y2: number; on: boolean };
export type Frame = {
  rows: { color: string; text: string }[][];
  route: { pts: string; done: boolean }[];
  flags: { x: number; y: number; cp: Checkpoint }[];
  strings: Flagline[];
  climber: { x: number; y: number } | null;
  near: boolean;
};

export function render(
  yaw: number, pitch: number, W: number, Hh: number, cw: number, chH: number,
  progress: number, cps: Checkpoint[], zoom = 1, time = 0,
): Frame {
  const cols = Math.floor(W / cw) - 1, rows = Math.floor(Hh / chH);
  const near = zoom >= 1.9;
  // Zooming in drifts the camera from the mountain's middle to you on the trail.
  const me = routeAt(progress);
  const f = Math.max(0, Math.min(1, (zoom - 1) / 0.8));
  const tx = me.x * f, ty = 0.3 * (1 - f) + me.y * f, tz = me.z * f;
  const S = W * 0.47 * zoom, cx = W / 2, cy = Hh * (0.62 - 0.08 * f);
  const cY = Math.cos(yaw), sY = Math.sin(yaw), cP = Math.cos(pitch), sP = Math.sin(pitch);
  const proj = (x: number, y: number, z: number) => {
    const dx = x - tx, dy = y - ty, dz = z - tz;
    const X = dx * cY - dz * sY, Z = dx * sY + dz * cY;
    return { sx: cx + X * S, sy: cy - (dy * cP + Z * sP) * S, d: Z * cP - dy * sP };
  };

  const n = cols * rows;
  const depth = new Float32Array(n).fill(Infinity);
  const chars: string[] = new Array(n).fill(' ');
  const colors: string[] = new Array(n).fill('');
  // Each surface point covers this many cells, so zoomed in there are no holes.
  const span = STEP * S;
  const sc = Math.max(1, Math.ceil(span / cw)), sr = Math.max(1, Math.ceil((span * 0.75) / chH));
  const trees: { c: number; r: number; d: number }[] = [];

  for (const v of VERTS) {
    const p = proj(v.x, v.y, v.z);
    const c0 = Math.floor(p.sx / cw), r0 = Math.floor(p.sy / chH);
    if (c0 < -sc || r0 < -sr || c0 >= cols || r0 >= rows) continue;
    const lam = Math.max(0, v.nx * LIGHT[0] + v.ny * LIGHT[1] + v.nz * LIGHT[2]);
    const grain = (v.seed - 0.5) * 0.16;
    const b = Math.max(0.05, Math.min(0.97, 0.08 + 0.78 * Math.pow(lam, 1.25) + grain));
    for (let dr = 0; dr < sr; dr++) for (let dc = 0; dc < sc; dc++) {
      const c = c0 + dc, r = r0 + dr;
      if (c < 0 || r < 0 || c >= cols || r >= rows) continue;
      const k = r * cols + c;
      if (p.d >= depth[k]) continue;
      depth[k] = p.d;
      const [ch, col] = near && (v.band === 1 || v.band === 2) ? blade(v, time, c, r) : farLook(v, b);
      chars[k] = ch; colors[k] = col;
    }
    if (v.tree) trees.push({ c: c0, r: r0, d: p.d });
  }

  // Sprites on top, where they're in front of the ground around them.
  const stamp = (sprite: string[][], c0: number, r0: number, d: number, color: (ch: string) => string) => {
    const h = sprite.length, w = sprite[0].length;
    for (let i = 0; i < h; i++) for (let j = 0; j < w; j++) {
      const ch = sprite[i][j];
      if (ch === ' ') continue;
      const c = c0 - Math.floor(w / 2) + j, r = r0 - (h - 1) + i;
      if (c < 0 || r < 0 || c >= cols || r >= rows) continue;
      const k = r * cols + c;
      if (d > depth[r0 * cols + Math.max(0, Math.min(cols - 1, c0))] + 0.03) continue;
      chars[k] = ch; colors[k] = color(ch);
    }
  };
  for (const t of trees) {
    if (t.c < 0 || t.r < 0 || t.c >= cols || t.r >= rows) continue;
    if (near) stamp(TREE_NEAR, t.c, t.r, t.d, ch => (ch === '|' ? MTN.trunk : MTN.grassHi));
    else { const k = t.r * cols + t.c; if (t.d <= depth[k] + 0.02) { chars[k] = '^'; colors[k] = MTN.meadow; } }
  }
  const visible = (x: number, y: number, z: number) => {
    const p = proj(x, y, z);
    const c = Math.floor(p.sx / cw), r = Math.floor(p.sy / chH);
    const ok = c < 0 || r < 0 || c >= cols || r >= rows || p.d <= depth[r * cols + c] + 0.05;
    return { ...p, c, r, ok };
  };
  // Huts at the camps (20K, 50K), a little off the trail.
  for (const t of [0.2, 0.5]) {
    const q = routeAt(t);
    const hx = q.x * 1.08, hz = q.z * 1.08;
    const p = visible(hx, Math.max(0, height(hx, hz)) + 0.01, hz);
    if (p.ok && p.c >= 0 && p.r >= 0 && p.c < cols && p.r < rows) stamp(near ? HUT_NEAR : HUT_FAR, p.c, p.r, p.d - 0.05, ch => ('/\\_'.includes(ch) ? MTN.hutRoof : MTN.hut));
  }

  const out: Frame['rows'] = [];
  for (let r = 0; r < rows; r++) {
    const line: { color: string; text: string }[] = [];
    for (let c = 0; c < cols; c++) {
      const k = r * cols + c, col = colors[k] || 'transparent';
      const last = line[line.length - 1];
      if (last && last.color === col) last.text += chars[k];
      else line.push({ color: col, text: chars[k] });
    }
    out.push(line);
  }

  const route: Frame['route'] = [];
  let run: string[] = [], runDone = true;
  for (const q of ROUTE) {
    const p = visible(q.x, q.y, q.z);
    const done = q.t <= progress;
    if (!p.ok || done !== runDone) {
      if (run.length > 1) route.push({ pts: run.join(' '), done: runDone });
      run = p.ok ? [`${p.sx.toFixed(1)},${p.sy.toFixed(1)}`] : [];
      runDone = done;
      continue;
    }
    run.push(`${p.sx.toFixed(1)},${p.sy.toFixed(1)}`);
  }
  if (run.length > 1) route.push({ pts: run.join(' '), done: runDone });

  const flags = cps.map(cp => { const q = routeAt(cp.t); return { cp, ...visible(q.x, q.y, q.z) }; })
    .filter(x => x.ok).map(x => ({ x: x.sx, y: x.sy, cp: x.cp }));

  // Prayer-flag strings: from a short pole at each camp and the summit, sagging to a second pole beside the trail.
  const strings: Flagline[] = [];
  for (const cp of cps) {
    if (cp.t < 0.15) continue;
    const q = routeAt(cp.t), q2 = routeAt(Math.max(0, cp.t - 0.025));
    const a = visible(q.x, q.y + 0.05, q.z), b = visible(q2.x + 0.04, Math.max(0, height(q2.x + 0.04, q2.z)) + 0.04, q2.z);
    if (a.ok && b.ok) strings.push({ x1: a.sx, y1: a.sy, x2: b.sx, y2: b.sy, on: cp.reached });
  }

  const mp = visible(me.x, me.y, me.z);
  return { rows: out, route, flags, strings, climber: progress > 0 && mp.ok ? { x: mp.sx, y: mp.sy } : null, near };
}
