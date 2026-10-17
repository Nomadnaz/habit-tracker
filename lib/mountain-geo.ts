// The climb mountain's geometry and software renderer, kept free of React
// Native so it can be tested and dumped as text. components/steps/Mountain.tsx
// draws the frames this produces.

import { MTN } from './theme';

export type Checkpoint = { t: number; label: string; reached: boolean; time?: string };

// ── terrain ──────────────────────────────────────────────────────────────

const hash = (x: number, y: number) => {
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

/** Height at (x, z) in [-1, 1]²; below 0 outside the footprint. */
export function height(x: number, z: number): number {
  const r = Math.hypot(x - 0.04, z + 0.02);
  if (r > 1) return -1;
  const base = Math.max(0, 1 - r / 0.95);
  const cone = Math.pow(base, 1.3);
  return 0.92 * cone * (0.62 + 0.42 * ridged(x * 2.1 + 3.3, z * 2.1 + 7.1)) + 0.05 * base * noise(x * 7, z * 7);
}

type Band = 0 | 1 | 2 | 3 | 4 | 5 | 6; // ground, forest, meadow, scree, rock, snow, tree
type Vert = { x: number; y: number; z: number; nx: number; ny: number; nz: number; band: Band };

const N = 96;
const VERTS: Vert[] = (() => {
  const out: Vert[] = [];
  const e = 2 / N;
  for (let i = 0; i <= N; i++) for (let j = 0; j <= N; j++) {
    const x = -1 + i * e, z = -1 + j * e;
    const y = height(x, z);
    if (y < 0) continue;
    const dx = (Math.max(0, height(x + e, z)) - Math.max(0, height(x - e, z))) / (2 * e);
    const dz = (Math.max(0, height(x, z + e)) - Math.max(0, height(x, z - e))) / (2 * e);
    const len = Math.hypot(dx, 1, dz);
    const nx = -dx / len, ny = 1 / len, nz = -dz / len;
    const wob = noise(x * 9, z * 9) * 0.07;
    const band: Band = y < 0.012 ? 0
      : y > 0.56 + wob ? 5
      : y > 0.3 + wob ? (ny < 0.72 ? 4 : 3)
      : y > 0.13 + wob ? (ny > 0.78 ? 2 : 4)
      : hash(i, j) > 0.8 && y > 0.025 ? 6 : 1;
    out.push({ x, y, z, nx, ny, nz, band });
  }
  return out;
})();

// The route: from the foot of the mountain, round and up to the summit.
const PEAK = (() => {
  let best = { x: 0, z: 0, y: 0 };
  for (const v of VERTS) if (v.y > best.y) best = { x: v.x, z: v.z, y: v.y };
  return best;
})();
const ROUTE = Array.from({ length: 140 }, (_, k) => {
  const t = k / 139;
  const r = 0.9 * Math.pow(1 - t, 0.85);
  const a = 3.9 + t * Math.PI * 3.1;
  const x = PEAK.x + r * Math.cos(a), z = PEAK.z + r * Math.sin(a);
  return { t, x, z, y: Math.max(0, height(x, z)) + 0.018 };
});
const routeAt = (t: number) => ROUTE[Math.max(0, Math.min(ROUTE.length - 1, Math.round(t * (ROUTE.length - 1))))];

// ── shading → characters ────────────────────────────────────────────────

const RAMP = ' .,:;-=+*#%@';
const LIGHT = (() => { const l = [-0.55, 0.75, -0.4]; const n = Math.hypot(...l); return l.map(v => v / n); })();
function look(v: Vert, b: number): [string, string] {
  const ch = RAMP[Math.max(1, Math.min(RAMP.length - 1, Math.round(b * (RAMP.length - 1))))];
  switch (v.band) {
    case 0: return ['.', MTN.ground];
    case 1: return [b > 0.5 ? '"' : ':', MTN.forest];
    case 2: return [ch, b > 0.55 ? MTN.meadow : MTN.forest];
    case 3: return [ch, MTN.scree];
    case 4: return [ch, b > 0.55 ? MTN.rock : MTN.rockShade];
    case 5: return [ch, b > 0.5 ? MTN.snow : MTN.snowShade];
    case 6: return ['^', MTN.meadow];
  }
}

export type Frame = {
  rows: { color: string; text: string }[][];
  route: { pts: string; done: boolean }[];
  flags: { x: number; y: number; cp: Checkpoint }[];
  huts: { x: number; y: number }[];
  climber: { x: number; y: number } | null;
  peak: { x: number; y: number };
};

export function render(yaw: number, pitch: number, W: number, Hh: number, cw: number, chH: number, progress: number, cps: Checkpoint[]): Frame {
  const cols = Math.floor(W / cw) - 1, rows = Math.floor(Hh / chH);
  const S = W * 0.5, cx = W / 2, cy = Hh * 0.7;
  const cy_ = Math.cos(yaw), sy_ = Math.sin(yaw), cp_ = Math.cos(pitch), sp_ = Math.sin(pitch);
  const proj = (x: number, y: number, z: number) => {
    const X = x * cy_ - z * sy_, Z = x * sy_ + z * cy_;
    return { sx: cx + X * S, sy: cy - (y * cp_ + Z * sp_) * S, d: Z * cp_ - y * sp_ };
  };
  const depth = new Float32Array(cols * rows).fill(Infinity);
  // Non-breaking spaces: plain ones collapse in some text renderers and shove the row left.
  const chars: string[] = new Array(cols * rows).fill('\u00A0');
  const colors: string[] = new Array(cols * rows).fill('');
  // Light turns with the world, so the camera sees different faces lit as it turns.
  for (const v of VERTS) {
    const p = proj(v.x, v.y, v.z);
    const c = Math.floor(p.sx / cw), r = Math.floor(p.sy / chH);
    if (c < 0 || r < 0 || c >= cols || r >= rows) continue;
    const k = r * cols + c;
    if (p.d >= depth[k]) continue;
    depth[k] = p.d;
    const lam = Math.max(0, v.nx * LIGHT[0] + v.ny * LIGHT[1] + v.nz * LIGHT[2]);
    // A little per-point grain so big lit faces read as texture, not one solid character.
    const grain = (hash(v.x * 97, v.z * 89) - 0.5) * 0.16;
    const [ch, col] = look(v, Math.max(0.05, Math.min(0.97, 0.08 + 0.78 * Math.pow(lam, 1.25) + grain)));
    chars[k] = ch; colors[k] = col;
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
  const visible = (x: number, y: number, z: number) => {
    const p = proj(x, y, z);
    const c = Math.floor(p.sx / cw), r = Math.floor(p.sy / chH);
    const ok = c < 0 || r < 0 || c >= cols || r >= rows || p.d <= depth[r * cols + c] + 0.05;
    return { ...p, ok };
  };

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

  const flags = cps.map(cp => ({ cp, ...visible(routeAt(cp.t).x, routeAt(cp.t).y, routeAt(cp.t).z) })).filter(f => f.ok).map(f => ({ x: f.sx, y: f.sy, cp: f.cp }));
  const huts = [0.2, 0.5].map(t => routeAt(t)).map(q => {
    // Camps sit just off the trail.
    const p = visible(q.x * 1.06, Math.max(0, height(q.x * 1.06, q.z * 1.06)) + 0.01, q.z * 1.06);
    return p.ok ? { x: p.sx, y: p.sy } : null;
  }).filter((h): h is { x: number; y: number } => !!h);
  const me = routeAt(progress);
  const mp = visible(me.x, me.y, me.z);
  const pk = proj(PEAK.x, PEAK.y, PEAK.z);
  return { rows: out, route, flags, huts, climber: progress > 0 && mp.ok ? { x: mp.sx, y: mp.sy } : null, peak: { x: pk.sx, y: pk.sy } };
}

