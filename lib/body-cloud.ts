// ─────────────────────────────────────────────────────────────────────────
// Body point cloud — the 3D figure on the BODY tab.
//
// The body is a set of "tubes" (torso, neck, head, and per side: delt, upper
// arm, forearm, hand, thigh, shin, foot). Each tube is a lofted cross-section
// along an axis, with its own radius toward front / back / lateral / medial
// at a few keyframes, so a calf can bulge backwards and a chest forwards.
// Points are sampled evenly over every tube's surface, and every point is
// labelled with the muscle under it by a per-tube classifier working in
// (t = along the axis, θ = around it). Then:
//   · points buried inside another tube are dropped, so tubes union cleanly
//   · points on a boundary between two labels are dropped — those gaps are
//     what make the muscles read as separate bellies (and the six-pack)
//   · each muscle region is pushed outward in a dome, so it bulges
// Units are centimetres, y up (feet at 0), +z is the front of the body and
// +x is the figure's LEFT. Deterministic — the same cloud every launch.
// ─────────────────────────────────────────────────────────────────────────

export type Side = 'l' | 'r';
export interface Muscle { id: string; name: string; group: string; side: Side | null }

type V3 = [number, number, number];

// ── muscles ──────────────────────────────────────────────────────────────

const SINGLE: [string, string, string][] = [
  ['head', 'HEAD', 'HEAD'],
  ['neck', 'NECK', 'NECK'],
  ['abs.upper', 'UPPER ABS', 'CORE'],
  ['abs.lower', 'LOWER ABS', 'CORE'],
];

const PAIRED: [string, string, string][] = [
  ['delt.front', 'FRONT DELT', 'SHOULDERS'],
  ['delt.side', 'SIDE DELT', 'SHOULDERS'],
  ['delt.rear', 'REAR DELT', 'SHOULDERS'],
  ['pec.upper', 'UPPER CHEST', 'CHEST'],
  ['pec.lower', 'LOWER CHEST', 'CHEST'],
  ['traps.upper', 'UPPER TRAP', 'BACK'],
  ['traps.mid', 'MID TRAP', 'BACK'],
  ['traps.lower', 'LOWER TRAP', 'BACK'],
  ['cuff', 'ROTATOR CUFF', 'BACK'],
  ['lat', 'LAT', 'BACK'],
  ['erector', 'LOWER BACK', 'BACK'],
  ['biceps', 'BICEP', 'ARMS'],
  ['brachialis', 'BRACHIALIS', 'ARMS'],
  ['triceps.lat', 'TRICEP OUTER HEAD', 'ARMS'],
  ['triceps.long', 'TRICEP LONG HEAD', 'ARMS'],
  ['elbow', 'ELBOW', 'ARMS'],
  ['brachiorad', 'BRACHIORADIALIS', 'ARMS'],
  ['forearm.flex', 'FOREARM FLEXORS', 'ARMS'],
  ['forearm.ext', 'FOREARM EXTENSORS', 'ARMS'],
  ['wrist', 'WRIST', 'ARMS'],
  ['hand', 'HAND', 'ARMS'],
  ['oblique', 'OBLIQUE', 'CORE'],
  ['serratus', 'SERRATUS', 'CORE'],
  ['hipflex', 'HIP FLEXOR', 'HIPS'],
  ['glute.max', 'GLUTE MAX', 'HIPS'],
  ['glute.med', 'GLUTE MED', 'HIPS'],
  ['quad.rf', 'RECTUS FEMORIS', 'LEGS'],
  ['quad.vl', 'OUTER QUAD', 'LEGS'],
  ['quad.vm', 'INNER QUAD', 'LEGS'],
  ['adductor', 'ADDUCTORS', 'LEGS'],
  ['ham.bf', 'OUTER HAMSTRING', 'LEGS'],
  ['ham.st', 'INNER HAMSTRING', 'LEGS'],
  ['knee', 'KNEE', 'LEGS'],
  ['tib', 'TIBIALIS', 'LEGS'],
  ['shin', 'SHIN', 'LEGS'],
  ['peroneal', 'PERONEALS', 'LEGS'],
  ['gastro.lat', 'OUTER CALF', 'LEGS'],
  ['gastro.med', 'INNER CALF', 'LEGS'],
  ['soleus', 'SOLEUS', 'LEGS'],
  ['ankle', 'ANKLE', 'LEGS'],
  ['foot', 'FOOT', 'LEGS'],
];

export const MUSCLES: Muscle[] = [
  ...SINGLE.map(([id, name, group]) => ({ id, name, group, side: null })),
  ...PAIRED.flatMap(([id, name, group]) => (['l', 'r'] as Side[]).map(side => ({
    id: `${id}.${side}`, name: `${side.toUpperCase()} ${name}`, group, side,
  }))),
];
export const MUSCLE_INDEX: Record<string, number> = Object.fromEntries(MUSCLES.map((m, i) => [m.id, i]));

// How far each muscle domes out of the surface, cm. Joints, hands, feet and
// the head stay flat.
const BULGE: Record<string, number> = {
  'pec.upper': 1.5, 'pec.lower': 1.9, delt: 1.1, biceps: 1.4, brachialis: 0.7, triceps: 1.1,
  brachiorad: 0.8, forearm: 0.7, abs: 0.8, oblique: 0.7, serratus: 0.5, lat: 1.2, traps: 1.0,
  cuff: 0.8, erector: 1.1, glute: 1.8, quad: 1.4, adductor: 0.7, ham: 1.2, gastro: 1.5,
  soleus: 0.7, tib: 0.7, peroneal: 0.4,
};
const bulgeOf = (base: string) => BULGE[base] ?? BULGE[base.split('.')[0]] ?? 0;

// ── tubes ────────────────────────────────────────────────────────────────

/** [t, front, back, lateral, medial] radii keyframes. */
type Key = [number, number, number, number, number];

interface Tube {
  A: V3; B: V3;
  ref: V3;           // which way is "front" (θ = 0)
  side: 1 | -1;      // +1: lateral is +x (left limbs, torso), -1: lateral is −x
  keys: Key[];
  p?: number;        // superellipse exponent for the cross-section (2 = ellipse)
  /** Muscle id (with side) plus an optional '#sub' for extra seams. */
  label: (t: number, th: number, P: V3) => string;
}

const add = (a: V3, b: V3): V3 => [a[0] + b[0], a[1] + b[1], a[2] + b[2]];
const sub = (a: V3, b: V3): V3 => [a[0] - b[0], a[1] - b[1], a[2] - b[2]];
const mul = (a: V3, k: number): V3 => [a[0] * k, a[1] * k, a[2] * k];
const dot = (a: V3, b: V3) => a[0] * b[0] + a[1] * b[1] + a[2] * b[2];
const cross = (a: V3, b: V3): V3 => [a[1] * b[2] - a[2] * b[1], a[2] * b[0] - a[0] * b[2], a[0] * b[1] - a[1] * b[0]];
const len = (a: V3) => Math.hypot(a[0], a[1], a[2]);
const norm = (a: V3): V3 => mul(a, 1 / (len(a) || 1));
const deg = (r: number) => (r * 180) / Math.PI;

/** Catmull-Rom through the keyframes, per radius column. */
function radiiAt(keys: Key[], t: number): [number, number, number, number] {
  let i = 0;
  while (i < keys.length - 2 && t > keys[i + 1][0]) i++;
  const k1 = keys[i], k2 = keys[i + 1];
  const k0 = keys[Math.max(0, i - 1)], k3 = keys[Math.min(keys.length - 1, i + 2)];
  const u = Math.min(1, Math.max(0, (t - k1[0]) / (k2[0] - k1[0] || 1)));
  const out = [0, 0, 0, 0] as [number, number, number, number];
  for (let c = 1; c <= 4; c++) {
    const p0 = k0[c], p1 = k1[c], p2 = k2[c], p3 = k3[c];
    out[c - 1] = Math.max(0.05, 0.5 * (2 * p1 + (-p0 + p2) * u + (2 * p0 - 5 * p1 + 4 * p2 - p3) * u * u + (-p0 + 3 * p1 - 3 * p2 + p3) * u * u * u));
  }
  return out;
}

interface Frame { A: V3; u: V3; f: V3; s: V3; L: number }

function frameOf(tube: Tube): Frame {
  const axis = sub(tube.B, tube.A);
  const L = len(axis);
  const u = mul(axis, 1 / L);
  const f = norm(sub(tube.ref, mul(u, dot(tube.ref, u))));
  let s = norm(cross(f, u));
  if (Math.abs(s[0]) > 0.05 && Math.sign(s[0]) !== tube.side) s = mul(s, -1);
  return { A: tube.A, u, f, s, L };
}

function radius(tube: Tube, t: number, th: number) {
  const [rf, rb, rl, rm] = radiiAt(tube.keys, t);
  const c = Math.cos(th), s = Math.sin(th);
  const a = c >= 0 ? rf : rb, b = s >= 0 ? rl : rm;
  const p = tube.p ?? 2;
  return 1 / Math.pow(Math.pow(Math.abs(c) / a, p) + Math.pow(Math.abs(s) / b, p), 1 / p);
}

function surface(tube: Tube, fr: Frame, t: number, th: number): V3 {
  const r = radius(tube, t, th);
  return add(add(fr.A, mul(fr.u, t * fr.L)), add(mul(fr.f, r * Math.cos(th)), mul(fr.s, r * Math.sin(th))));
}

function inside(tube: Tube, fr: Frame, P: V3, margin: number) {
  const d = sub(P, fr.A);
  const t = dot(d, fr.u) / fr.L;
  if (t < 0 || t > 1) return false;
  const a = dot(d, fr.f), b = dot(d, fr.s);
  return Math.hypot(a, b) < radius(tube, t, Math.atan2(b, a)) - margin;
}

// ── the figure ───────────────────────────────────────────────────────────

const Y = (y: number) => (y - 84) / 72; // torso t from height

function torsoLabel(_t: number, th: number, P: V3): string {
  const [x, y] = P;
  const side = x >= 0 ? 'l' : 'r';
  const ax = Math.abs(x), a = Math.abs(deg(th));
  const S = (id: string) => `${id}.${side}`;
  if (y >= 149.5) return a < 60 && ax < 6 ? 'neck' : S('traps.upper');
  if (a < 90) {
    const pecLow = 129 + ax * 0.38;
    if (y >= 147) return S('traps.upper');
    if (y >= pecLow && ax > 15) return S('lat');
    if (y >= pecLow) return S(y > 140.5 + ax * 0.12 ? 'pec.upper' : 'pec.lower');
    if (a >= 60 && y >= 121) return `${S('serratus')}#${Math.floor((y - 121) / 3.2)}`;
    if (ax < 6.6 && y >= 96) {
      if (y < 110) return `abs.lower#${side}`;
      return `abs.upper#${y >= 124 ? 'a' : y >= 117 ? 'b' : 'c'}${side}`;
    }
    if (y < 96) return ax < 4 ? 'abs.lower#p' : S('hipflex');
    return S('oblique');
  }
  const lowTrap = 2 + (y - 117) * 0.6;
  if (y >= 143) return S(ax < 14.5 ? 'traps.upper' : 'cuff');
  if (y >= 133 && ax < 11) return S('traps.mid');
  if (y >= 117 && y < 133 && ax < lowTrap) return S('traps.lower');
  if (y >= 135 && ax >= 11) return S('cuff');
  if (y < 97) return S(a > 118 ? 'glute.max' : 'glute.med');
  if (y < 105 && a < 130 && ax > 9) return S('glute.med');
  if (ax < 6.4) return S('erector');
  if (y >= 103 + (ax - 6.4) * 0.8) return S('lat');
  return S('oblique');
}

function buildTubes(): Tube[] {
  const tubes: Tube[] = [
    {
      // torso, crotch to the base of the neck
      A: [0, 84, 0], B: [0, 156, 0], ref: [0, 0, 1], side: 1, p: 2.15,
      keys: [
        [Y(84), 5, 6, 8, 8], [Y(88), 8, 10.5, 13.5, 13.5], [Y(93), 9, 12.5, 15.8, 15.8],
        [Y(99), 9, 11.5, 15.8, 15.8], [Y(105), 8.8, 9.5, 14.4, 14.4], [Y(111), 9.2, 9, 13.4, 13.4],
        [Y(117), 9.8, 9.4, 13.6, 13.6], [Y(123), 10.4, 10.2, 14.4, 14.4], [Y(129), 11.4, 10.8, 15.2, 15.2],
        [Y(135), 11.8, 11, 15.8, 15.8], [Y(141), 11.2, 10.6, 16.2, 16.2], [Y(146), 9.4, 9.2, 16.4, 16.4],
        [Y(150), 7.6, 7.6, 13, 13], [Y(153.5), 6.2, 6.4, 8.5, 8.5], [Y(156), 5.5, 5.8, 6.5, 6.5],
      ],
      label: torsoLabel,
    },
    {
      A: [0, 150, -1], B: [0, 166, 0], ref: [0, 0, 1], side: 1,
      keys: [[0, 5.4, 5.4, 5.8, 5.8], [0.5, 5.0, 5.2, 5.4, 5.4], [1, 5.2, 5.4, 5.6, 5.6]],
      label: () => 'neck',
    },
    {
      A: [0, 158.5, 1], B: [0, 185, 0.5], ref: [0, 0, 1], side: 1,
      keys: [[0, 0.5, 0.5, 0.5, 0.5], [0.08, 5.2, 5.6, 4.6, 4.6], [0.28, 8.6, 8.6, 6.4, 6.4], [0.55, 9.6, 9.8, 7.8, 7.8], [0.85, 8.2, 8.8, 7.0, 7.0], [1, 0.5, 0.5, 0.5, 0.5]],
      label: () => 'head',
    },
  ];

  for (const sg of [1, -1] as const) {
    const side = sg === 1 ? 'l' : 'r';
    const S = (id: string) => `${id}.${side}`;
    const th = (r: number) => deg(r);

    const shoulder: V3 = [sg * 17.5, 145, -0.5];
    const d1 = norm([sg * 0.208, -0.978, 0]);
    const elbow = add(shoulder, mul(d1, 30));
    const d2 = norm([sg * 0.26, -0.96, 0.08]);
    const wrist = add(elbow, mul(d2, 26));
    const hip: V3 = [sg * 8.8, 96, 0];
    const knee: V3 = [sg * 10.5, 50, 0.8];
    const ankle: V3 = [sg * 11.5, 8, -1];

    tubes.push(
      {
        // deltoid cap over the shoulder joint
        A: add(shoulder, [sg * 1, 4.5, 0]), B: add(add(shoulder, [sg * 1, 4.5, 0]), mul(d1, 15)),
        ref: [0, 0, 1], side: sg,
        keys: [[0, 0.5, 0.5, 0.5, 0.5], [0.15, 3.6, 3.8, 3.8, 3.4], [0.4, 5.2, 5.4, 5.5, 4.6], [0.72, 4.6, 4.8, 4.8, 3.8], [1, 2.4, 2.4, 2.4, 2.4]],
        label: (_t, r) => {
          const a = th(r);
          return S(a > -100 && a < 30 ? 'delt.front' : a >= 30 && a <= 120 ? 'delt.side' : 'delt.rear');
        },
      },
      {
        A: add(shoulder, mul(d1, -2)), B: elbow, ref: [0, 0, 1], side: sg,
        keys: [[0, 4.6, 4.6, 5.0, 4.4], [0.35, 4.8, 5.0, 4.4, 4.2], [0.75, 4.0, 4.4, 3.9, 3.8], [1, 3.4, 3.4, 3.6, 3.6]],
        label: (t, r) => {
          const a = th(r);
          if (t > 0.9) return S('elbow');
          if (a >= -70 && a < 50) return S('biceps');
          if (a >= 50 && a < 105) return S(t > 0.42 ? 'brachialis' : 'triceps.lat');
          if (a >= 105) return S(t < 0.62 ? 'triceps.lat' : 'triceps.long');
          return S('triceps.long');
        },
      },
      {
        A: add(elbow, mul(d2, -1)), B: wrist, ref: [0, 0, 1], side: sg,
        keys: [[0, 3.6, 3.6, 4.0, 3.8], [0.25, 3.9, 3.7, 4.2, 3.8], [0.7, 2.8, 2.7, 2.9, 2.7], [1, 2.0, 2.0, 2.7, 2.7]],
        label: (t, r) => {
          const a = th(r);
          if (t > 0.9) return S('wrist');
          if (a >= 10 && a < 80) return S(t < 0.62 ? 'brachiorad' : a > 45 ? 'forearm.ext' : 'forearm.flex');
          if (a >= -150 && a < 10) return S('forearm.flex');
          return S('forearm.ext');
        },
      },
      {
        A: wrist, B: add(wrist, mul(d2, 17)), ref: [0, 0, 1], side: sg,
        keys: [[0, 1.7, 1.7, 2.8, 2.8], [0.35, 1.7, 1.7, 3.8, 3.8], [0.8, 1.3, 1.3, 3.4, 3.4], [1, 0.3, 0.3, 1.2, 1.2]],
        label: () => S('hand'),
      },
      {
        A: hip, B: knee, ref: [0, 0, 1], side: sg,
        keys: [[0, 8.2, 9.2, 7.8, 7.2], [0.15, 8.2, 8.6, 7.8, 7.4], [0.45, 7.6, 7.4, 7.4, 6.6], [0.8, 6.0, 5.8, 6.0, 5.3], [1, 5.0, 4.6, 5.2, 5.0]],
        label: (t, r) => {
          const a = th(r);
          if (t < 0.2 && Math.abs(a) > 100) return S('glute.max');
          if (t < 0.12 && a >= 40 && a <= 100) return S('glute.med');
          if (t > 0.9) return S('knee');
          if (a >= -28 && a < 28) return S(t < 0.05 ? 'hipflex' : 'quad.rf');
          if (a >= 28 && a < 118) return S('quad.vl');
          if (a >= 118) return S('ham.bf');
          if (a < -150) return S('ham.st');
          if (t > 0.42 && a > -28 - 150 * (t - 0.42)) return S('quad.vm');
          if (a < -120) return S('ham.st');
          return S(t <= 0.8 ? 'adductor' : 'quad.vm');
        },
      },
      {
        A: add(knee, [0, 1.5, 0]), B: ankle, ref: [0, 0, 1], side: sg,
        keys: [[0, 4.8, 4.8, 5.0, 5.0], [0.25, 4.0, 6.2, 5.0, 5.2], [0.55, 3.4, 4.6, 4.2, 4.2], [0.85, 2.5, 2.8, 3.0, 3.0], [1, 2.6, 2.8, 3.2, 3.2]],
        label: (t, r) => {
          const a = th(r);
          if (t < 0.07) return S('knee');
          if (t > 0.86) return S('ankle');
          if (a >= -50 && a < 8) return S('shin');
          if (a >= 8 && a < 62) return S(t < 0.72 ? 'tib' : 'shin');
          if (a >= 62 && a < 112) return S('peroneal');
          if (a >= 112) return S(t < 0.5 ? 'gastro.lat' : 'soleus');
          if (a < -95) return S(t < 0.56 ? 'gastro.med' : 'soleus');
          return S(t < 0.35 ? 'gastro.med' : 'soleus');
        },
      },
      {
        A: [sg * 11.8, 4, -4.5], B: [sg * 13, 3, 17], ref: [0, 1, 0], side: sg,
        keys: [[0, 2.0, 2.0, 2.4, 2.4], [0.15, 3.2, 2.6, 3.0, 3.0], [0.5, 3.0, 1.8, 3.6, 3.6], [0.85, 1.8, 1.5, 4.0, 4.0], [1, 0.6, 0.6, 2.0, 2.0]],
        label: () => S('foot'),
      },
    );
  }
  return tubes;
}

// ── sampling ─────────────────────────────────────────────────────────────

export interface Cloud {
  n: number;
  x: Float32Array; y: Float32Array; z: Float32Array;
  nx: Float32Array; ny: Float32Array; nz: Float32Array;
  m: Int16Array;  // index into MUSCLES
}

function mulberry32(seed: number) {
  return () => {
    seed |= 0; seed = (seed + 0x6d2b79f5) | 0;
    let t = Math.imul(seed ^ (seed >>> 15), 1 | seed);
    t = (t + Math.imul(t ^ (t >>> 7), 61 | t)) ^ t;
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
}

const wrap = (a: number) => Math.atan2(Math.sin(a), Math.cos(a));

/** Builds the cloud. `spacing` is the rough distance between points, cm. */
export function buildCloud(spacing = 1.6): Cloud {
  const tubes = buildTubes();
  const frames = tubes.map(frameOf);
  const rand = mulberry32(7);
  const SEAM = 1.0; // cm either side of a label boundary left empty

  type Raw = { ti: number; t: number; th: number; label: string };
  const raw: Raw[] = [];

  tubes.forEach((tube, ti) => {
    const fr = frames[ti];
    // Rows evenly spaced by meridian arc length, so domes (head, delt caps)
    // aren't sparse at the poles.
    const STEPS = 200;
    const arc = [0];
    let prevR = 0;
    for (let i = 0; i <= STEPS; i++) {
      const t = i / STEPS;
      const r = (radius(tube, t, 0) + radius(tube, t, Math.PI) + radius(tube, t, Math.PI / 2) + radius(tube, t, -Math.PI / 2)) / 4;
      if (i > 0) arc.push(arc[i - 1] + Math.hypot(fr.L / STEPS, r - prevR));
      prevR = r;
    }
    const total = arc[STEPS];
    const rows = Math.max(2, Math.round(total / spacing));
    let j = 0;
    for (let k = 0; k < rows; k++) {
      const target = ((k + 0.5 + (rand() - 0.5) * 0.5) / rows) * total;
      while (j < STEPS - 1 && arc[j + 1] < target) j++;
      const tRow = (j + (target - arc[j]) / (arc[j + 1] - arc[j] || 1)) / STEPS;
      let perim = 0;
      for (let q = 0; q < 24; q++) perim += radius(tube, tRow, (q / 24) * Math.PI * 2);
      perim *= (Math.PI * 2) / 24;
      const cols = Math.max(3, Math.round(perim / spacing));
      const off = k * 2.39996;
      for (let c = 0; c < cols; c++) {
        const th = wrap(off + ((c + 0.5 + (rand() - 0.5) * 0.6) / cols) * Math.PI * 2);
        // Nudge each point along the axis too, so rows don't read as scan lines.
        const t = Math.min(1, Math.max(0, tRow + ((rand() - 0.5) * 0.7 * spacing) / fr.L));
        const P = surface(tube, fr, t, th);
        // Buried inside another tube → never visible.
        if (tubes.some((o, oi) => oi !== ti && inside(o, frames[oi], P, 0.25))) continue;
        raw.push({ ti, t, th, label: tube.label(t, th, P) });
      }
    }
  });

  // Seams: a point whose label changes within SEAM cm along or around the
  // tube sits on a boundary — drop it.
  const keep = raw.filter(p => {
    const tube = tubes[p.ti], fr = frames[p.ti];
    const r = radius(tube, p.t, p.th);
    const dt = SEAM / fr.L, dth = SEAM / Math.max(r, 0.5);
    for (const [a, b] of [[dt, 0], [-dt, 0], [0, dth], [0, -dth]]) {
      const t = Math.min(1, Math.max(0, p.t + a)), th = p.th + b;
      if (tube.label(t, th, surface(tube, fr, t, th)) !== p.label) return false;
    }
    return true;
  });

  // Region stats per (tube, label) in tube coordinates (cm), for the domes.
  type Stat = { a0: number; th0: number; ea: number; eb: number; r: number };
  const stats = new Map<string, Stat>();
  const groups = new Map<string, Raw[]>();
  for (const p of keep) {
    const k = `${p.ti}|${p.label}`;
    (groups.get(k) ?? groups.set(k, []).get(k)!).push(p);
  }
  for (const [k, ps] of groups) {
    const tube = tubes[ps[0].ti], fr = frames[ps[0].ti];
    const th0 = Math.atan2(ps.reduce((s, p) => s + Math.sin(p.th), 0), ps.reduce((s, p) => s + Math.cos(p.th), 0));
    const a0 = (ps.reduce((s, p) => s + p.t, 0) / ps.length) * fr.L;
    const r = ps.reduce((s, p) => s + radius(tube, p.t, p.th), 0) / ps.length;
    let ea = 0.5, eb = 0.5;
    for (const p of ps) {
      ea = Math.max(ea, Math.abs(p.t * fr.L - a0));
      eb = Math.max(eb, Math.abs(wrap(p.th - th0)) * r);
    }
    stats.set(k, { a0, th0, ea: ea + SEAM, eb: eb + SEAM, r });
  }

  // Final position = surface + dome along the surface normal. Normals come
  // from finite differences of that, so the shading follows the bellies.
  const domed = (ti: number, label: string, t: number, th: number): V3 => {
    const tube = tubes[ti], fr = frames[ti];
    const P = surface(tube, fr, t, th);
    const st = stats.get(`${ti}|${label}`);
    const amp = bulgeOf(label.split('#')[0].replace(/\.[lr]$/, ''));
    if (!st || !amp) return P;
    const da = (t * fr.L - st.a0) / st.ea, db = (wrap(th - st.th0) * st.r) / st.eb;
    const k = 1 - (da ** 4 + db ** 4);
    if (k <= 0) return P;
    const radial = norm(sub(P, add(fr.A, mul(fr.u, t * fr.L))));
    return add(P, mul(radial, amp * Math.sqrt(k)));
  };

  const n = keep.length;
  const cloud: Cloud = {
    n,
    x: new Float32Array(n), y: new Float32Array(n), z: new Float32Array(n),
    nx: new Float32Array(n), ny: new Float32Array(n), nz: new Float32Array(n),
    m: new Int16Array(n),
  };
  keep.forEach((p, i) => {
    const fr = frames[p.ti];
    const P = domed(p.ti, p.label, p.t, p.th);
    const h = 0.004, e = 0.01;
    const Ta = domed(p.ti, p.label, Math.min(1, p.t + h), p.th);
    const Tb = domed(p.ti, p.label, Math.max(0, p.t - h), p.th);
    const Ra = domed(p.ti, p.label, p.t, p.th + e);
    const Rb = domed(p.ti, p.label, p.t, p.th - e);
    let N = norm(cross(sub(Ta, Tb), sub(Ra, Rb)));
    // Make it point away from the axis (cross order depends on handedness).
    if (dot(N, sub(P, add(fr.A, mul(fr.u, p.t * fr.L)))) < 0) N = mul(N, -1);
    cloud.x[i] = P[0]; cloud.y[i] = P[1]; cloud.z[i] = P[2];
    cloud.nx[i] = N[0]; cloud.ny[i] = N[1]; cloud.nz[i] = N[2];
    cloud.m[i] = MUSCLE_INDEX[p.label.split('#')[0]] ?? -1;
  });
  return cloud;
}

// ── packed form ──────────────────────────────────────────────────────────
// Building takes ~1s under Hermes, so the cloud ships pre-built in
// lib/body-cloud-data.ts (regenerate: npm run gen:body-cloud). 10 bytes a
// point: x y z as int16 in 0.05 cm, normal as int8 ×127, muscle as uint8.

const B64 = 'ABCDEFGHIJKLMNOPQRSTUVWXYZabcdefghijklmnopqrstuvwxyz0123456789+/';

export function encodeCloud(c: Cloud): string {
  const buf = new DataView(new ArrayBuffer(c.n * 10));
  for (let i = 0; i < c.n; i++) {
    const o = i * 10;
    buf.setInt16(o, Math.round(c.x[i] * 20), true);
    buf.setInt16(o + 2, Math.round(c.y[i] * 20), true);
    buf.setInt16(o + 4, Math.round(c.z[i] * 20), true);
    buf.setInt8(o + 6, Math.round(c.nx[i] * 127));
    buf.setInt8(o + 7, Math.round(c.ny[i] * 127));
    buf.setInt8(o + 8, Math.round(c.nz[i] * 127));
    buf.setUint8(o + 9, c.m[i] < 0 ? 255 : c.m[i]);
  }
  const bytes = new Uint8Array(buf.buffer);
  let out = '';
  for (let i = 0; i < bytes.length; i += 3) {
    const n = (bytes[i] << 16) | ((bytes[i + 1] ?? 0) << 8) | (bytes[i + 2] ?? 0);
    out += B64[(n >> 18) & 63] + B64[(n >> 12) & 63]
      + (i + 1 < bytes.length ? B64[(n >> 6) & 63] : '=') + (i + 2 < bytes.length ? B64[n & 63] : '=');
  }
  return out;
}

export function decodeCloud(b64: string): Cloud {
  const lut = new Uint8Array(128);
  for (let i = 0; i < 64; i++) lut[B64.charCodeAt(i)] = i;
  const pad = b64.endsWith('==') ? 2 : b64.endsWith('=') ? 1 : 0;
  const bytes = new Uint8Array((b64.length / 4) * 3 - pad);
  for (let i = 0, j = 0; i < b64.length; i += 4) {
    const n = (lut[b64.charCodeAt(i)] << 18) | (lut[b64.charCodeAt(i + 1)] << 12)
      | (lut[b64.charCodeAt(i + 2)] << 6) | lut[b64.charCodeAt(i + 3)];
    if (j < bytes.length) bytes[j++] = (n >> 16) & 255;
    if (j < bytes.length) bytes[j++] = (n >> 8) & 255;
    if (j < bytes.length) bytes[j++] = n & 255;
  }
  const v = new DataView(bytes.buffer);
  const n = bytes.length / 10;
  const c: Cloud = {
    n,
    x: new Float32Array(n), y: new Float32Array(n), z: new Float32Array(n),
    nx: new Float32Array(n), ny: new Float32Array(n), nz: new Float32Array(n),
    m: new Int16Array(n),
  };
  for (let i = 0; i < n; i++) {
    const o = i * 10;
    c.x[i] = v.getInt16(o, true) / 20; c.y[i] = v.getInt16(o + 2, true) / 20; c.z[i] = v.getInt16(o + 4, true) / 20;
    const nx = v.getInt8(o + 6), ny = v.getInt8(o + 7), nz = v.getInt8(o + 8);
    const l = Math.hypot(nx, ny, nz) || 1;
    c.nx[i] = nx / l; c.ny[i] = ny / l; c.nz[i] = nz / l;
    const m = v.getUint8(o + 9);
    c.m[i] = m === 255 ? -1 : m;
  }
  return c;
}

/** Per muscle: centroid and the direction it faces (mean normal). */
export function muscleFrames(c: Cloud) {
  const out = MUSCLES.map(() => ({ c: [0, 0, 0] as V3, n: [0, 0, 0] as V3, count: 0 }));
  for (let i = 0; i < c.n; i++) {
    const o = out[c.m[i]];
    if (!o) continue;
    o.c[0] += c.x[i]; o.c[1] += c.y[i]; o.c[2] += c.z[i];
    o.n[0] += c.nx[i]; o.n[1] += c.ny[i]; o.n[2] += c.nz[i];
    o.count++;
  }
  return out.map(o => ({ c: mul(o.c, 1 / Math.max(1, o.count)), n: norm(o.n), count: o.count }));
}
