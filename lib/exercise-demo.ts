// ─────────────────────────────────────────────────────────────────────────
// Exercise demo maths — a mannequin posed at the start and end of a movement,
// eased between them, rasterised to a dot grid in the BODY figure's halftone.
// Pure (no React), so tests can check every pose bends the right way and a
// script can render them all to look at. components/ExerciseDemo.tsx animates it.
//
// No footage: every exercise is one of the movement patterns
// (lib/exercise-guide.ts patternOf), each posed by where the hips, hands and
// feet go; knees and elbows are solved (two-bone IK). The kit — bar plates,
// dumbbells, a cable to its pulley, a bench — comes from the equipment.
// ─────────────────────────────────────────────────────────────────────────

import type { Equipment, Pattern } from './exercise-guide';

type P = [number, number];
// Where a hand goes: world (w), from the shoulder (s), or in the torso's own
// frame (l: [along the spine, out the front]).
type Hand = { w: P } | { s: P } | { l: P };
type Pose = {
  hip: P; torso: number;          // torso: hip→shoulder angle, degrees; 0 down, 90 forward, 180 up
  ankle: P; ankle2?: P;            // near / far foot
  foot?: number; foot2?: number;   // ankle→toe angle (90 = flat, pointing forward)
  hand: Hand; hand2?: Hand;
  knee?: 1 | -1; knee2?: 1 | -1;   // which way the knee bends off the hip→ankle line
  elbow?: 1 | -1; elbow2?: 1 | -1;
  shrug?: number;                  // shoulders lifted, cm
};
export type Demo = {
  view: 'side' | 'front'; a: Pose; b: Pose; props?: (j: Joints) => Cap[];
  /** Where the cable comes from (its pulley); `anchor2` is the far hand's, for a pair of columns. */
  anchor?: P; anchor2?: P;
  /** The cable clips to the near ankle (kickbacks) instead of the hands. */
  cableTo?: 'hands' | 'ankle';
};

// cm. Figure faces +x, y up, the floor at 0.
const L = { torso: 50, neck: 9, head: 11, uarm: 29, farm: 27, thigh: 44, shin: 44, foot: 19 };
const VIEW = { x0: -110, y0: -6, size: 220 };
const CELLS = 52;

const rad = (d: number) => (d * Math.PI) / 180;
const dir = (deg: number): P => [Math.sin(rad(deg)), -Math.cos(rad(deg))];
const add = (a: P, b: P, k = 1): P => [a[0] + b[0] * k, a[1] + b[1] * k];
const lerp = (a: number, b: number, t: number) => a + (b - a) * t;
const lerpP = (a: P, b: P, t: number): P => [lerp(a[0], b[0], t), lerp(a[1], b[1], t)];

/** Two-bone IK: the middle joint for a chain from `a` reaching `t`, bent to side `s` (+1 counter-clockwise). */
function ik(a: P, t: P, l1: number, l2: number, s: number): P {
  const dx = t[0] - a[0], dy = t[1] - a[1];
  const d = Math.min(l1 + l2 - 0.01, Math.max(Math.abs(l1 - l2) + 0.01, Math.hypot(dx, dy)));
  const ang = Math.atan2(dy, dx) + s * Math.acos((l1 * l1 + d * d - l2 * l2) / (2 * l1 * d));
  return [a[0] + Math.cos(ang) * l1, a[1] + Math.sin(ang) * l1];
}

export type Joints = { hip: P; shoulder: P; head: P; u: P; v: P; knee: P; ankle: P; toe: P; knee2: P; ankle2: P; toe2: P; elbow: P; hand: P; elbow2: P; hand2: P; shoulder2: P; hip2: P };

function handAt(h: Hand, shoulder: P, u: P, v: P): P {
  if ('w' in h) return h.w;
  if ('s' in h) return add(shoulder, h.s);
  return add(add(shoulder, u, h.l[0]), v, h.l[1]);
}

/** Pose → joints, blending start→end by t. */
export function solve(demo: Demo, t: number): Joints {
  const { a, b } = demo;
  const torso = lerp(a.torso, b.torso, t);
  const hip = lerpP(a.hip, b.hip, t);
  const u = dir(torso);
  const v: P = [u[1], -u[0]]; // out the front of the chest
  const front = demo.view === 'front';
  const sh = add(hip, u, L.torso);
  const shoulderC: P = [sh[0], sh[1] + lerp(a.shrug ?? 0, b.shrug ?? 0, t)];
  const half = front ? 18 : 0;
  const shoulder: P = [shoulderC[0] + half, shoulderC[1]];
  const shoulder2: P = [shoulderC[0] - half, shoulderC[1]];
  const hipN: P = front ? [hip[0] + 9, hip[1]] : hip, hip2: P = front ? [hip[0] - 9, hip[1]] : hip;
  const mirror = (h: P): P => [2 * shoulderC[0] - h[0], h[1]];
  const handA = lerpP(handAt(a.hand, shoulder, u, v), handAt(b.hand, shoulder, u, v), t);
  const hand2A = a.hand2 && b.hand2
    ? lerpP(handAt(a.hand2, shoulder2, u, v), handAt(b.hand2, shoulder2, u, v), t)
    : front ? mirror(handA) : handA;
  const ankle = lerpP(a.ankle, b.ankle, t);
  const ankle2 = a.ankle2 && b.ankle2 ? lerpP(a.ankle2, b.ankle2, t) : front ? [2 * hip[0] - ankle[0], ankle[1]] as P : ankle;
  const kneeS = a.knee ?? 1, knee2S = a.knee2 ?? (front ? -kneeS as 1 | -1 : kneeS);
  const elS = a.elbow ?? -1, el2S = a.elbow2 ?? (front ? -elS as 1 | -1 : elS);
  const knee = ik(hipN, ankle, L.thigh, L.shin, kneeS);
  const knee2 = ik(hip2, ankle2, L.thigh, L.shin, knee2S);
  const elbow = ik(shoulder, handA, L.uarm, L.farm, elS);
  const elbow2 = ik(shoulder2, hand2A, L.uarm, L.farm, el2S);
  const footA = lerp(a.foot ?? 90, b.foot ?? 90, t), foot2A = lerp(a.foot2 ?? a.foot ?? 90, b.foot2 ?? b.foot ?? 90, t);
  return {
    hip: hipN, hip2, shoulder, shoulder2, u, v, head: add(shoulderC, u, L.neck + L.head),
    knee, ankle, toe: front ? ankle : add(ankle, dir(footA), L.foot),
    knee2, ankle2, toe2: front ? ankle2 : add(ankle2, dir(foot2A), L.foot),
    elbow, hand: handA, elbow2, hand2: hand2A,
  };
}

// ── drawing ──────────────────────────────────────────────────────────────

type Cap = { a: P; b: P; r: number; k: number; z: number }; // z: higher draws on top
const cap = (a: P, b: P, r: number, k = 1, z = 1): Cap => ({ a, b, r, k, z });

function figure(j: Joints, front: boolean): Cap[] {
  const far = front ? 1 : 0, near = 2;
  const kFar = front ? 1 : 0.55;
  const caps: Cap[] = [
    cap(j.head, j.head, L.head, 1, 1.5),
    cap(add(j.shoulder, j.u, -2), j.head, 4.5, 0.9, 1.4),
  ];
  if (front) {
    caps.push(cap([j.hip[0] - 1, j.hip[1]], [j.shoulder[0] - 7, j.shoulder[1] - 6], 10, 1, 1));
    caps.push(cap([j.hip2[0] + 1, j.hip2[1]], [j.shoulder2[0] + 7, j.shoulder2[1] - 6], 10, 1, 1));
    caps.push(cap(j.shoulder, j.shoulder2, 6.5, 1, 1));
  } else {
    caps.push(cap(add(j.hip, j.u, 4), add(j.hip, j.u, 30), 12.5, 1, 1)); // pelvis + belly
    caps.push(cap(add(j.hip, j.u, 26), add(j.shoulder, j.u, -6), 13.5, 1, 1)); // chest
  }
  const limb = (h: P, k: P, a: P, t: P, el: P, hd: P, sh: P, z: number, kk: number) => [
    cap(h, k, 7.5, kk, z), cap(k, a, 5.8, kk, z), cap(a, t, 3.6, kk, z),
    cap(sh, el, 5.2, kk, z + 0.1), cap(el, hd, 4.3, kk, z + 0.1), cap(hd, hd, 4.6, kk, z + 0.1),
  ];
  caps.push(...limb(j.hip2, j.knee2, j.ankle2, j.toe2, j.elbow2, j.hand2, j.shoulder2, far, kFar));
  caps.push(...limb(j.hip, j.knee, j.ankle, j.toe, j.elbow, j.hand, j.shoulder, near, 1));
  return caps;
}

function kit(j: Joints, demo: Demo, eq: Equipment, front: boolean): Cap[] {
  const out: Cap[] = demo.props ? demo.props(j) : [];
  const hands = front ? [j.hand, j.hand2] : [j.hand];
  if (eq === 'barbell') {
    if (front) {
      const y = (j.hand[1] + j.hand2[1]) / 2;
      out.push(cap([j.hand2[0] - 30, y], [j.hand[0] + 30, y], 1.6, 0.8, 3));
      out.push(cap([j.hand[0] + 30, y - 18], [j.hand[0] + 30, y + 18], 3.5, 0.7, 3), cap([j.hand2[0] - 30, y - 18], [j.hand2[0] - 30, y + 18], 3.5, 0.7, 3));
    } else {
      out.push(cap(j.hand, j.hand, 19, 0.5, 3), cap(j.hand, j.hand, 3, 1, 3.1));
    }
  } else if (eq === 'dumbbell') {
    for (const h of hands) out.push(cap(h, h, 7, 0.75, 3));
  } else if (eq === 'cable' && demo.anchor) {
    // The column the cable runs from, its pulley lit at the pin's height.
    const column = (at: P) => [cap([at[0], 0], [at[0], 204], 1.4, 0.28, 0.1), cap(at, at, 4.5, 0.75, 0.5)];
    if (demo.cableTo === 'ankle') out.push(cap(j.ankle, demo.anchor, 1.1, 0.7, 0.5), cap(j.ankle, j.ankle, 3, 0.8, 2.5));
    else if (front && demo.anchor2) out.push(cap(j.hand, demo.anchor, 1.1, 0.7, 0.5), cap(j.hand2, demo.anchor2, 1.1, 0.7, 0.5));
    else for (const h of hands) out.push(cap(h, demo.anchor, 1.1, 0.7, 0.5));
    out.push(...column(demo.anchor));
    if (front && demo.anchor2) out.push(...column(demo.anchor2));
  }
  return out;
}

function segDist(p: P, a: P, b: P): number {
  const dx = b[0] - a[0], dy = b[1] - a[1];
  const l2 = dx * dx + dy * dy;
  const t = l2 ? Math.max(0, Math.min(1, ((p[0] - a[0]) * dx + (p[1] - a[1]) * dy) / l2)) : 0;
  return Math.hypot(p[0] - a[0] - dx * t, p[1] - a[1] - dy * t);
}

/** One frame as an SVG path of dots, in a size×size box. */
export function raster(caps: Cap[], size: number): string {
  const cell = size / CELLS, cm = VIEW.size / CELLS;
  const sorted = [...caps].sort((p, q) => q.z - p.z);
  let d = '';
  for (let i = 0; i < CELLS; i++) {
    for (let k = 0; k < CELLS; k++) {
      const p: P = [VIEW.x0 + (i + 0.5) * cm, VIEW.y0 + VIEW.size - (k + 0.5) * cm];
      let shade = 0;
      for (const c of sorted) {
        const inside = c.r - segDist(p, c.a, c.b);
        if (inside <= -cm * 0.35) continue;
        // Fuller towards the middle of a limb, thinning at its edge.
        shade = c.k * Math.min(1, 0.35 + Math.max(0, inside) / Math.min(c.r, 7));
        break;
      }
      if (p[1] > -1 && p[1] < cm && shade === 0 && i % 2 === 0) shade = 0.18; // the floor
      if (shade <= 0) continue;
      const r = cell * 0.48 * Math.sqrt(shade);
      const x = (i + 0.5) * cell, y = (k + 0.5) * cell;
      d += `M${(x - r).toFixed(1)},${y.toFixed(1)}a${r.toFixed(1)},${r.toFixed(1)} 0 1,0 ${(2 * r).toFixed(1)},0a${r.toFixed(1)},${r.toFixed(1)} 0 1,0 ${(-2 * r).toFixed(1)},0`;
    }
  }
  return d;
}

// ── the movements ────────────────────────────────────────────────────────

const STAND: Pose = { hip: [0, 88], torso: 180, ankle: [2, 0], hand: { s: [3, -55] } };
const bench = (j: Joints): Cap[] => {
  // Pad under the back, legs to the floor.
  const a = add(add(j.hip, j.u, -14), j.v, -14), b = add(add(j.hip, j.u, L.torso + 6), j.v, -14);
  return [cap(a, b, 5, 0.45, 0.2), cap(a, [a[0], 0], 2.5, 0.35, 0.2), cap(b, [b[0], 0], 2.5, 0.35, 0.2)];
};
const seat = (j: Joints): Cap[] => [cap([j.hip[0] - 12, j.hip[1] - 12], [j.hip[0] + 22, j.hip[1] - 12], 4.5, 0.45, 0.2), cap([j.hip[0] + 4, j.hip[1] - 12], [j.hip[0] + 4, 0], 2.5, 0.35, 0.2)];
const bar = (at: P) => () => [cap(at, at, 3.5, 0.8, 3)];

const DEMOS: Partial<Record<Pattern, Demo>> = {
  squat: { view: 'side', a: { ...STAND, hip: [-2, 88], hand: { s: [-11, 2] } }, b: { ...STAND, hip: [-28, 48], torso: 145, hand: { s: [-11, 2] } } },
  legpress: {
    view: 'side',
    a: { hip: [-30, 45], torso: 230, ankle: [28, 94], foot: 160, hand: { w: [-24, 46] }, knee: 1 },
    b: { hip: [-30, 45], torso: 230, ankle: [32, 107], foot: 160, hand: { w: [-24, 46] }, knee: 1 },
    props: j => [cap(add(j.ankle, [10, 2]), add(j.ankle, [24, -16]), 3.5, 0.5, 0.2), cap(add(j.ankle, [10, 2]), add(j.ankle, [-4, 20]), 3.5, 0.5, 0.2),
      cap([-44, 33], [-80, 70], 5, 0.45, 0.2), cap([-44, 33], [-10, 33], 5, 0.45, 0.2)],
  },
  lunge: {
    view: 'side',
    a: { hip: [-6, 84], torso: 180, ankle: [22, 0], ankle2: [-38, 4], foot2: 45, hand: { s: [3, -55] } },
    b: { hip: [-8, 50], torso: 176, ankle: [22, 0], ankle2: [-38, 4], foot2: 45, hand: { s: [3, -55] } },
  },
  hinge: { view: 'side', a: { ...STAND, hip: [-3, 88], hand: { s: [6, -54] } }, b: { ...STAND, hip: [-25, 80], torso: 100, hand: { s: [2, -55] } } },
  thrust: {
    view: 'side',
    a: { hip: [10, 22], torso: 250, ankle: [42, 0], hand: { w: [12, 30] }, knee: 1, elbow: 1 },
    b: { hip: [8, 44], torso: 268, ankle: [42, 0], hand: { w: [10, 52] }, knee: 1, elbow: 1 },
    props: () => [cap([-75, 34], [-34, 34], 5, 0.45, 0.2), cap([-70, 34], [-70, 0], 2.5, 0.35, 0.2), cap([-38, 34], [-38, 0], 2.5, 0.35, 0.2)],
  },
  bench: {
    view: 'side',
    a: { hip: [25, 48], torso: 270, ankle: [62, 0], hand: { l: [-2, 52] }, knee: 1, elbow: 1 },
    b: { hip: [25, 48], torso: 270, ankle: [62, 0], hand: { l: [-8, 14] }, knee: 1, elbow: 1 },
    props: bench,
  },
  pushup: {
    view: 'side',
    a: { hip: [0, 30], torso: 72, ankle: [-85, 5], foot: 20, hand: { w: [49, 2] } },
    b: { hip: [-2, 12], torso: 80, ankle: [-85, 5], foot: 20, hand: { w: [49, 2] } },
  },
  dip: {
    view: 'side',
    a: { hip: [0, 110], torso: 172, ankle: [-28, 42], hand: { w: [8, 106] }, knee: 1 },
    b: { hip: [-2, 80], torso: 160, ankle: [-30, 14], hand: { w: [8, 106] }, knee: 1 },
    props: bar([8, 106]),
  },
  ohp: { view: 'side', a: { ...STAND, hand: { s: [8, 4] } }, b: { ...STAND, hand: { s: [2, 54] } } },
  raise: { view: 'side', a: { ...STAND, hand: { s: [5, -54] } }, b: { ...STAND, hand: { s: [54, 4] } } },
  lateral: { view: 'front', a: { ...STAND, ankle: [11, 0], hand: { s: [8, -54] }, elbow: 1 }, b: { ...STAND, ankle: [11, 0], hand: { s: [54, -2] }, elbow: 1 } },
  fly: { view: 'front', a: { ...STAND, ankle: [11, 0], hand: { s: [50, -8] }, elbow: 1 }, b: { ...STAND, ankle: [11, 0], hand: { s: [-12, -20] }, elbow: 1 }, anchor: [100, 170] },
  row: {
    view: 'side',
    a: { ...STAND, hip: [-22, 80], torso: 120, hand: { s: [2, -55] } },
    b: { ...STAND, hip: [-22, 80], torso: 120, hand: { s: [-24, -24] } },
  },
  cablerow: {
    view: 'side',
    a: { hip: [-20, 40], torso: 168, ankle: [52, 28], foot: 160, hand: { s: [52, -12] }, knee: 1 },
    b: { hip: [-20, 40], torso: 184, ankle: [52, 28], foot: 160, hand: { s: [6, -26] }, knee: 1 },
    anchor: [104, 28], props: seat,
  },
  pulldown: {
    view: 'side',
    a: { hip: [-10, 48], torso: 180, ankle: [30, 0], hand: { s: [4, 54] }, knee: 1, elbow: 1 },
    b: { hip: [-10, 48], torso: 186, ankle: [30, 0], hand: { s: [10, 4] }, knee: 1, elbow: 1 },
    anchor: [0, 206], props: seat,
  },
  pullup: {
    view: 'side',
    a: { hip: [2, 80], torso: 176, ankle: [-8, 2], hand: { w: [10, 184] } },
    b: { hip: [6, 116], torso: 170, ankle: [-6, 38], hand: { w: [10, 184] } },
    props: bar([10, 184]),
  },
  curl: { view: 'side', a: { ...STAND, hand: { s: [3, -55] } }, b: { ...STAND, hand: { s: [24, -10] } } },
  pushdown: { view: 'side', a: { ...STAND, torso: 172, hand: { s: [22, -20] } }, b: { ...STAND, torso: 172, hand: { s: [6, -54] } }, anchor: [30, 204] },
  overheadext: { view: 'side', a: { ...STAND, hand: { s: [-14, 22] } }, b: { ...STAND, hand: { s: [2, 55] } } },
  skull: {
    view: 'side',
    a: { hip: [25, 48], torso: 270, ankle: [62, 0], hand: { l: [-2, 54] }, knee: 1 },
    b: { hip: [25, 48], torso: 270, ankle: [62, 0], hand: { l: [20, 16] }, knee: 1 },
    props: bench,
  },
  facepull: { view: 'side', a: { ...STAND, hand: { s: [54, 4] }, elbow: -1 }, b: { ...STAND, hand: { s: [10, 14] }, elbow: -1 }, anchor: [104, 150] },
  shrug: { view: 'side', a: { ...STAND, hand: { s: [4, -55] } }, b: { ...STAND, hand: { s: [4, -55] }, shrug: 7 } },
  calf: { view: 'side', a: { ...STAND, hip: [0, 88], ankle: [0, 0], hand: { s: [3, -55] } }, b: { ...STAND, hip: [1, 97], ankle: [1, 9], foot: 62, hand: { s: [3, -55] } } },
  crunch: {
    view: 'side',
    a: { hip: [10, 10], torso: 272, ankle: [50, 0], hand: { l: [12, 4] }, knee: 1, elbow: -1 },
    b: { hip: [10, 10], torso: 236, ankle: [50, 0], hand: { l: [12, 4] }, knee: 1, elbow: -1 },
  },
  legraise: {
    view: 'side',
    a: { hip: [2, 80], torso: 178, ankle: [0, 2], hand: { w: [6, 184] }, knee: 1 },
    b: { hip: [2, 82], torso: 182, ankle: [80, 78], hand: { w: [6, 184] }, knee: 1 },
    props: bar([6, 184]),
  },
  plank: {
    view: 'side',
    a: { hip: [0, 32], torso: 80, ankle: [-86, 5], foot: 20, hand: { w: [74, 3] }, elbow: -1 },
    b: { hip: [0, 36], torso: 80, ankle: [-86, 5], foot: 20, hand: { w: [74, 3] }, elbow: -1 },
  },
  legext: {
    view: 'side',
    a: { hip: [-10, 52], torso: 184, ankle: [36, 8], hand: { w: [0, 44] }, knee: 1 },
    b: { hip: [-10, 52], torso: 184, ankle: [76, 50], hand: { w: [0, 44] }, knee: 1 },
    props: j => [...seat(j), cap(add(j.ankle, [5, 4]), add(j.ankle, [5, 4]), 5, 0.5, 0.2)],
  },
  legcurl: {
    view: 'side',
    a: { hip: [-15, 50], torso: 90, ankle: [-102, 50], foot: 0, hand: { w: [58, 38] }, knee: 1 },
    b: { hip: [-15, 50], torso: 90, ankle: [-48, 92], foot: 0, hand: { w: [58, 38] }, knee: 1 },
    props: j => [cap([-60, 38], [52, 38], 5, 0.45, 0.2), cap([-50, 38], [-50, 0], 2.5, 0.35, 0.2), cap([40, 38], [40, 0], 2.5, 0.35, 0.2),
      cap(add(j.ankle, [0, 7]), add(j.ankle, [0, 7]), 5, 0.5, 0.2)],
  },
  abduct: {
    view: 'front',
    a: { ...STAND, ankle: [11, 0], ankle2: [-11, 0], hand: { s: [10, -54] }, hand2: { s: [-10, -54] }, knee: 1, knee2: -1, elbow: 1 },
    b: { ...STAND, ankle: [52, 14], ankle2: [-11, 0], hand: { s: [10, -54] }, hand2: { s: [-10, -54] }, knee: 1, knee2: -1, elbow: 1 },
    anchor: [-104, 8],
  },
  twist: {
    view: 'front',
    a: { ...STAND, ankle: [14, 0], hand: { w: [56, 170] }, hand2: { w: [52, 166] }, elbow: 1, elbow2: 1 },
    b: { ...STAND, ankle: [14, 0], hand: { w: [-48, 72] }, hand2: { w: [-44, 76] }, elbow: -1, elbow2: -1 },
    anchor: [96, 200],
  },
  run: {
    view: 'side',
    a: { hip: [0, 84], torso: 170, ankle: [26, 6], ankle2: [-30, 30], foot2: 140, hand: { s: [-20, -40] }, hand2: { s: [22, -30] }, knee: 1 },
    b: { hip: [0, 84], torso: 170, ankle: [-30, 30], ankle2: [26, 6], foot: 140, hand: { s: [22, -30] }, hand2: { s: [-20, -40] }, knee: 1 },
  },
  stand: { view: 'side', a: STAND, b: { ...STAND, hip: [0, 87], shrug: 1 } },
};
// ── movements added with the exercise library ────────────────────────────

const floorBench = (x0: number, x1: number, y: number) => () => [cap([x0, y], [x1, y], 5, 0.45, 0.2), cap([x0 + 5, y], [x0 + 5, 0], 2.5, 0.35, 0.2), cap([x1 - 5, y], [x1 - 5, 0], 2.5, 0.35, 0.2)];
// Walking: one stride, feet swapping, hands where the load is.
const walk = (hand: Hand, stride = 1): Demo => ({
  view: 'side',
  a: { hip: [0, 86], torso: 178, ankle: [22 * stride, 2], ankle2: [-20 * stride, 5], foot2: 60, hand },
  b: { hip: [0, 86], torso: 178, ankle: [-20 * stride, 5], ankle2: [22 * stride, 2], foot: 60, hand },
});
const LYING_LEGS: Pose = { hip: [10, 8], torso: 270, ankle: [97, 6], foot: 170, hand: { l: [-48, -4] } };

const ADDED: Partial<Record<Pattern, Demo>> = {
  // Lying on a bench, arms long: from over the chest back past the head.
  pullover: {
    view: 'side',
    a: { hip: [25, 48], torso: 270, ankle: [62, 0], hand: { l: [-4, 55] }, knee: 1 },
    b: { hip: [25, 48], torso: 270, ankle: [62, 0], hand: { l: [50, 14] }, knee: 1 },
    props: bench,
  },
  // Under a bar, heels down, body straight: chest up to the bar.
  invrow: {
    view: 'side',
    a: { hip: [17, 36], torso: 250, ankle: [100, 6], foot: 180, hand: { w: [-11, 106] }, elbow: 1 },
    b: { hip: [25, 53], torso: 238, ankle: [100, 6], foot: 180, hand: { w: [-11, 106] }, elbow: 1 },
    props: () => [cap([-11, 106], [-11, 106], 3.5, 0.8, 3), cap([-11, 106], [-11, 0], 1.6, 0.3, 0.1)],
  },
  // 45° bench: legs locked along the pad, the trunk folds down and back up to a line.
  backext: {
    view: 'side',
    a: { hip: [7, 82], torso: 30, ankle: [-55, 20], foot: 120, hand: { l: [-14, 8] }, elbow: -1 },
    b: { hip: [7, 82], torso: 135, ankle: [-55, 20], foot: 120, hand: { l: [-14, 8] }, elbow: -1 },
    props: j => [cap(add(j.hip, [8, -9]), add(lerpP(j.hip, j.ankle, 0.45), [8, -9]), 5, 0.45, 0.2),
      cap(add(j.ankle, [6, -8]), add(j.ankle, [6, -8]), 4.5, 0.5, 0.2), cap(add(lerpP(j.hip, j.ankle, 0.3), [10, -12]), [10, 0], 2.5, 0.35, 0.2)],
  },
  // Hike the bell back between the legs, snap the hips through to chest height.
  swing: {
    view: 'side',
    a: { hip: [-24, 80], torso: 108, ankle: [2, 0], hand: { s: [-14, -52] } },
    b: { hip: [0, 88], torso: 182, ankle: [2, 0], hand: { s: [54, 4] } },
  },
  // Facing the column, one ankle strapped to the low pulley, the leg driven back.
  kickback: {
    view: 'side',
    a: { hip: [0, 88], torso: 168, ankle: [8, 6], ankle2: [2, 0], hand: { w: [42, 112] } },
    b: { hip: [0, 88], torso: 160, ankle: [-56, 40], ankle2: [2, 0], hand: { w: [42, 112] } },
    anchor: [64, 12], cableTo: 'ankle',
  },
  sideplank: {
    view: 'side',
    a: { hip: [0, 30], torso: 76, ankle: [-86, 5], foot: 20, hand: { w: [30, 3] }, elbow: -1 },
    b: { hip: [0, 36], torso: 76, ankle: [-86, 5], foot: 20, hand: { w: [30, 3] }, elbow: -1 },
  },
  carry: walk({ s: [4, -55] }),
  // From the hang, hips through, bar to the front rack.
  clean: {
    view: 'side',
    a: { hip: [-20, 82], torso: 128, ankle: [2, 0], hand: { s: [3, -55] } },
    b: { hip: [-14, 76], torso: 176, ankle: [2, 0], hand: { s: [14, 2] } },
  },
  // Dip, then off the floor, toes pointed.
  jump: {
    view: 'side',
    a: { hip: [-18, 62], torso: 148, ankle: [2, 0], hand: { s: [-22, -44] } },
    b: { hip: [0, 112], torso: 180, ankle: [4, 24], foot: 30, hand: { s: [16, 48] } },
  },
  jacks: {
    view: 'front',
    a: { ...STAND, ankle: [10, 0], hand: { s: [8, -54] }, elbow: 1 },
    b: { ...STAND, hip: [0, 86], ankle: [40, 2], hand: { s: [30, 48] }, elbow: 1 },
  },
  // Stand, then down to the push-up position.
  burpee: {
    view: 'side',
    a: { hip: [-16, 60], torso: 140, ankle: [2, 0], hand: { w: [30, 2] } },
    b: { hip: [0, 30], torso: 72, ankle: [-85, 5], foot: 20, hand: { w: [49, 2] } },
  },
  // Catch (shins up, reaching) to finish (legs long, leaning back, handle to the ribs).
  rower: {
    view: 'side',
    a: { hip: [-14, 30], torso: 158, ankle: [36, 18], foot: 150, hand: { s: [50, -12] } },
    b: { hip: [-58, 30], torso: 200, ankle: [30, 18], foot: 150, hand: { s: [12, -30] } },
    props: j => [cap([-90, 22], [62, 22], 3, 0.4, 0.2), cap([72, 30], [72, 30], 11, 0.4, 0.2), cap(j.hand, [72, 34], 1.1, 0.6, 0.5), cap([j.hip[0] - 10, 25], [j.hip[0] + 10, 25], 4, 0.45, 0.3)],
  },
  // Seated on the saddle, pedalling.
  bike: {
    view: 'side',
    a: { hip: [-14, 92], torso: 150, ankle: [10, 44], ankle2: [-6, 22], foot: 100, hand: { w: [36, 106] } },
    b: { hip: [-14, 92], torso: 150, ankle: [-6, 22], ankle2: [10, 44], foot2: 100, hand: { w: [36, 106] } },
    props: () => [cap([-26, 82], [-2, 82], 3, 0.45, 0.2), cap([-14, 82], [0, 32], 2.5, 0.35, 0.05), cap([0, 32], [30, 100], 2.5, 0.35, 0.05), cap([-36, 2], [36, 2], 2.5, 0.35, 0.05), cap([0, 32], [0, 2], 2.5, 0.35, 0.05)],
  },
};
Object.assign(DEMOS, ADDED);
const demoOf = (p: Pattern): Demo => DEMOS[p] ?? DEMOS.stand!;

// Variants that share a pattern's muscles but not its shape.
const TWIST_HIGH: Pose = { ...STAND, ankle: [14, 0], hand: { w: [56, 170] }, hand2: { w: [52, 166] }, elbow: 1, elbow2: 1 };
const TWIST_LOW: Pose = { ...STAND, ankle: [14, 0], hand: { w: [-48, 72] }, hand2: { w: [-44, 76] }, elbow: -1, elbow2: -1 };
const VARIANTS: [RegExp, Pattern[] | null, Demo][] = [
  // Standing between the columns, pressing forward from the chest.
  [/CABLE (CHEST )?PRESS|STANDING CABLE CHEST/, ['bench'], {
    view: 'side',
    a: { ...STAND, ankle: [14, 0], ankle2: [-22, 2], foot2: 60, torso: 172, hand: { s: [12, -14] } },
    b: { ...STAND, ankle: [14, 0], ankle2: [-22, 2], foot2: 60, torso: 168, hand: { s: [54, -2] } },
  }],
  // Standing, arms long: from overhead in front down to the thighs.
  [/STRAIGHT ARM|LAT PRAYER|CABLE PULLOVER|LAT PULLOVER/, ['pulldown'], {
    view: 'side',
    a: { ...STAND, hip: [-8, 86], torso: 162, hand: { s: [42, 34] }, elbow: 1 },
    b: { ...STAND, hip: [-8, 86], torso: 162, hand: { s: [16, -50] }, elbow: 1 },
    anchor: [78, 200],
  }],
  // Hips out against the strap: the far column for abduction, the near one for adduction.
  [/ADDUCT/, ['abduct'], {
    view: 'front',
    a: { ...STAND, ankle: [42, 10], ankle2: [-11, 0], hand: { s: [10, -54] }, hand2: { s: [-10, -54] }, knee: 1, knee2: -1, elbow: 1 },
    b: { ...STAND, ankle: [6, 2], ankle2: [-11, 0], hand: { s: [10, -54] }, hand2: { s: [-10, -54] }, knee: 1, knee2: -1, elbow: 1 },
    anchor: [104, 10], cableTo: 'ankle',
  }],
  [/LOW TO HIGH|CABLE LIFT|REVERSE WOODCHOP|LOW TO HIGH CHOP/, ['twist'], {
    view: 'front',
    a: { ...TWIST_LOW, hand: { w: [48, 72] }, hand2: { w: [44, 76] }, elbow: 1, elbow2: 1 },
    b: { ...TWIST_HIGH, hand: { w: [-56, 170] }, hand2: { w: [-52, 166] }, elbow: -1, elbow2: -1 },
  }],
  // Upright row: hands up the front of the body to the chin, elbows high.
  [/UPRIGHT/, null, { view: 'front', a: { ...STAND, ankle: [11, 0], hand: { s: [-13, -54] }, elbow: 1 }, b: { ...STAND, ankle: [11, 0], hand: { s: [-13, -6] }, elbow: 1 } }],
  [/NORDIC|GLUTE HAM|\bGHR\b/, null, {
    view: 'side',
    a: { hip: [0, 54], torso: 180, ankle: [-44, 8], foot: 270, hand: { l: [-14, 10] }, elbow: -1 },
    b: { hip: [34, 38], torso: 130, ankle: [-44, 8], foot: 270, hand: { l: [-10, 26] }, elbow: -1 },
    props: () => [cap([-6, 4], [14, 4], 5, 0.45, 0.2), cap([-48, 16], [-48, 16], 4, 0.5, 0.2)],
  }],
  [/DONKEY KICK|QUADRUPED|FIRE HYDRANT/, null, {
    view: 'side',
    a: { hip: [-25, 56], torso: 90, ankle: [-68, 6], ankle2: [-68, 6], foot: 270, foot2: 270, hand: { w: [27, 2] } },
    b: { hip: [-25, 56], torso: 92, ankle: [-66, 100], ankle2: [-68, 6], foot: 180, foot2: 270, hand: { w: [27, 2] } },
  }],
  [/KICKBACK/, ['pushdown'], {
    view: 'side',
    a: { hip: [-22, 80], torso: 112, ankle: [2, 0], hand: { s: [-28, -27] } },
    b: { hip: [-22, 80], torso: 112, ankle: [2, 0], hand: { s: [-55, 4] } },
  }],
  [/CABLE CRUNCH|ROPE CRUNCH|KNEELING/, ['crunch'], {
    view: 'side',
    a: { hip: [0, 52], torso: 172, ankle: [-44, 6], foot: 270, hand: { s: [12, 10] } },
    b: { hip: [-4, 50], torso: 96, ankle: [-44, 6], foot: 270, hand: { s: [12, 10] } },
    anchor: [46, 200],
  }],
  [/SEATED CALF|SOLEUS|BENT KNEE CALF/, null, {
    view: 'side',
    a: { hip: [-32, 50], torso: 180, ankle: [12, 0], hand: { w: [8, 56] } },
    b: { hip: [-32, 55], torso: 180, ankle: [13, 8], foot: 62, hand: { w: [8, 61] } },
    props: j => [...seat(j), cap(add(j.knee, [0, 6]), add(j.knee, [16, 6]), 4, 0.5, 0.2)],
  }],
  [/HIP FLEX|KNEE DRIVE|MARCH/, null, {
    view: 'side',
    a: { ...STAND, ankle: [2, 0], ankle2: [0, 0], hand: { w: [30, 110] } },
    b: { ...STAND, ankle: [42, 46], ankle2: [0, 0], hand: { w: [30, 110] } },
    anchor: [-60, 12], cableTo: 'ankle',
  }],
  [/LYING LEG|FLUTTER|LEG LIFT|LEG RAISE$|DRAGON|WIPER/, ['legraise'], {
    view: 'side', a: LYING_LEGS, b: { ...LYING_LEGS, ankle: [14, 96], foot: 180 },
  }],
  [/REVERSE CRUNCH|LEG PULL|KNEE TUCK/, ['legraise'], {
    view: 'side', a: { ...LYING_LEGS, ankle: [60, 40] }, b: { ...LYING_LEGS, hip: [12, 16], ankle: [18, 48] },
  }],
  [/L SIT/, null, {
    view: 'side',
    a: { hip: [0, 28], torso: 180, ankle: [86, 30], foot: 120, hand: { w: [2, 24] } },
    b: { hip: [0, 30], torso: 178, ankle: [86, 34], foot: 120, hand: { w: [2, 24] } },
  }],
  [/THRUSTER|WALL BALL|SQUAT TO PRESS/, null, {
    view: 'side',
    a: { ...STAND, hip: [-26, 50], torso: 150, hand: { s: [14, 2] } },
    b: { ...STAND, hand: { s: [4, 54] } },
  }],
  [/SNATCH/, ['clean'], {
    view: 'side',
    a: { hip: [-20, 82], torso: 128, ankle: [2, 0], hand: { s: [3, -55] } },
    b: { hip: [-22, 62], torso: 160, ankle: [2, 0], hand: { s: [-6, 54] } },
  }],
  [/JERK|AND PRESS|MAN MAKER/, ['clean'], {
    view: 'side',
    a: { hip: [-14, 76], torso: 176, ankle: [2, 0], hand: { s: [14, 2] } },
    b: { ...STAND, hand: { s: [2, 54] } },
  }],
  [/OVERHEAD CARRY|WAITER|OVERHEAD WALK/, ['carry'], walk({ s: [2, 54] })],
  [/RACK CARRY|GOBLET CARRY|BEAR HUG|SANDBAG CARRY|ZERCHER CARRY|YOKE/, ['carry'], walk({ s: [16, -16] })],
  [/SLED PUSH|PROWLER/, null, {
    view: 'side',
    a: { hip: [-20, 78], torso: 122, ankle: [16, 2], ankle2: [-58, 6], foot2: 50, hand: { w: [40, 96] } },
    b: { hip: [-20, 78], torso: 122, ankle: [-58, 6], ankle2: [16, 2], foot: 50, hand: { w: [40, 96] } },
    props: () => [cap([40, 96], [44, 20], 3, 0.45, 0.2), cap([30, 14], [100, 14], 6, 0.4, 0.2)],
  }],
  [/SLED (PULL|DRAG|ROW)|BACKWARD|REVERSE SLED/, null, {
    view: 'side',
    a: { hip: [-6, 78], torso: 196, ankle: [12, 2], ankle2: [-30, 5], foot2: 60, hand: { s: [40, -36] } },
    b: { hip: [-6, 78], torso: 196, ankle: [-30, 5], ankle2: [12, 2], foot: 60, hand: { s: [40, -36] } },
    props: j => [cap(j.hand, [104, 12], 1.2, 0.6, 0.5), cap([96, 8], [110, 8], 6, 0.4, 0.2)],
  }],
  [/WALK|HIK|RUCK|ELLIPTICAL|STAIR|TREADMILL/, ['run', 'lunge'], walk({ s: [8, -50] }, 0.9)],
  [/SLAM/, null, {
    view: 'side',
    a: { ...STAND, hand: { s: [8, 52] } },
    b: { ...STAND, hip: [-22, 62], torso: 128, hand: { s: [36, -42] } },
  }],
  [/BATTLE ROPE|ROPE WAVE|BATTLING/, null, {
    view: 'side',
    a: { ...STAND, hip: [-16, 72], torso: 160, hand: { s: [34, -14] } },
    b: { ...STAND, hip: [-16, 72], torso: 160, hand: { s: [36, -42] } },
    props: j => [cap(j.hand, [104, 4], 1.4, 0.6, 0.5)],
  }],
  [/CHEST PASS|CHEST THROW|MED BALL THROW|SCOOP|OVERHEAD THROW/, null, {
    view: 'side', a: { ...STAND, hand: { s: [16, -18] } }, b: { ...STAND, torso: 172, hand: { s: [54, 4] } },
  }],
  [/SHADOW|BOXING|BAG|PAD WORK|KICKBOX/, null, {
    view: 'side',
    a: { ...STAND, hip: [-4, 84], ankle: [16, 0], ankle2: [-24, 2], foot2: 60, hand: { s: [20, 6] }, hand2: { s: [16, 2] } },
    b: { ...STAND, hip: [0, 84], ankle: [16, 0], ankle2: [-24, 2], foot2: 60, hand: { s: [56, 6] }, hand2: { s: [16, 2] } },
  }],
  [/GET UP|GETUP|\bTGU\b/, null, {
    view: 'side',
    a: { hip: [10, 8], torso: 268, ankle: [58, 0], ankle2: [94, 6], foot2: 170, hand: { l: [0, 56] } },
    b: { hip: [10, 10], torso: 212, ankle: [58, 0], ankle2: [94, 6], foot2: 170, hand: { l: [0, 56] } },
  }],
  [/JUMP ROPE|SKIPPING|DOUBLE UNDER|SINGLE UNDER|POGO|ANKLE HOP/, null, {
    view: 'side',
    a: { ...STAND, hip: [0, 86], ankle: [2, 0], foot: 90, hand: { s: [16, -40] } },
    b: { ...STAND, hip: [0, 96], ankle: [2, 10], foot: 40, hand: { s: [16, -40] } },
  }],
  // Bent over with dumbbells; the cable version stands and pulls at shoulder height (the face-pull shape).
  [/^(?!.*CABLE).*(REAR DELT FLY|REAR DELT RAISE|REVERSE FLY|BENT OVER LATERAL|REAR LATERAL)/, ['facepull'], {
    view: 'side',
    a: { ...STAND, hip: [-22, 80], torso: 112, hand: { s: [2, -54] } },
    b: { ...STAND, hip: [-22, 80], torso: 112, hand: { s: [-2, -10] } },
  }],
  [/EXTERNAL ROT|INTERNAL ROT/, null, {
    view: 'front',
    a: { ...STAND, ankle: [11, 0], hand: { s: [4, -30] }, hand2: { s: [-4, -56] }, elbow: 1 },
    b: { ...STAND, ankle: [11, 0], hand: { s: [32, -30] }, hand2: { s: [-4, -56] }, elbow: 1 },
  }],
  [/PALLOF/, null, {
    view: 'front',
    a: { ...STAND, ankle: [14, 0], hand: { w: [3, 118] }, hand2: { w: [-3, 118] }, elbow: 1, elbow2: -1 },
    b: { ...STAND, ankle: [14, 0], hand: { w: [2, 124] }, hand2: { w: [-2, 124] }, elbow: 1, elbow2: -1 },
  }],
];

// Where a cable's column stands for each movement, side to side (cm; the
// figure faces +x). Front views put it to one side; pairs get two columns.
const CABLE_X: Partial<Record<Pattern, number>> = {
  pushdown: 56, overheadext: -64, curl: 52, cablerow: 104, pulldown: 0, facepull: 104, fly: 100, lateral: -100,
  raise: -60, shrug: 60, bench: -90, skull: -100, twist: 96, crunch: 22, swing: -90, kickback: 64, hinge: 60, legcurl: 60,
  abduct: -100, legraise: -60, squat: 60, lunge: 60, row: 90,
};
const BEHIND = /BAYESIAN|FACE AWAY|BEHIND THE BACK/;

/** A movement's demo, with the bench's tilt, the variant's shape, and the
 *  cable's column at the pulley height the library gives (0 floor … 1 top). */
export function demoFor(pattern: Pattern, name: string, pulley?: number): Demo {
  const n = name.toUpperCase();
  const variant = VARIANTS.find(([re, only]) => re.test(n) && (!only || only.includes(pattern)))?.[2];
  let d = variant ?? demoOf(pattern);
  if (!variant && (pattern === 'bench' || pattern === 'skull' || pattern === 'pullover')) {
    const torso = /INCLINE/.test(n) ? 240 : /DECLINE/.test(n) ? 292 : 270;
    d = { ...d, a: { ...d.a, torso }, b: { ...d.b, torso } };
  }
  if (pulley != null) {
    const y = 8 + pulley * 196;
    const x0 = d.anchor?.[0] ?? (/UPRIGHT/.test(n) ? 0 : CABLE_X[pattern] ?? 100);
    const x = BEHIND.test(n) ? -Math.abs(x0 || 70) : x0;
    d = {
      ...d, anchor: [x, y], anchor2: d.view === 'front' && pattern === 'fly' ? [-x, y] : undefined,
      cableTo: d.cableTo ?? (pattern === 'abduct' ? 'ankle' : undefined),
    };
  }
  return d;
}


/** Every frame of a demo, start → end → start, eased, as SVG dot paths in a size×size box. */
export function demoFrames(pattern: Pattern, equipment: Equipment, name: string, size: number, frames: number, pulley?: number): string[] {
  const demo = demoFor(pattern, name, pulley);
  const front = demo.view === 'front';
  return Array.from({ length: frames }, (_, f) => {
    const t = (1 - Math.cos((f / frames) * Math.PI * 2)) / 2;
    const j = solve(demo, t);
    return raster([...figure(j, front), ...kit(j, demo, equipment, front)], size);
  });
}

// ── the pulley pin ───────────────────────────────────────────────────────

export const PINS = 20;

/** Pulley height (0 floor … 1 top) → the pin to set on a 20-hole column,
 *  counted up from the floor, and a body landmark to check it against. */
export function pulleyPin(pulley: number): { pin: number; of: number; zone: string } {
  const p = Math.max(0, Math.min(1, pulley));
  const zone = p >= 0.9 ? 'TOP' : p >= 0.72 ? 'HEAD HEIGHT' : p >= 0.55 ? 'CHEST HEIGHT' : p >= 0.38 ? 'WAIST HEIGHT' : p >= 0.15 ? 'KNEE HEIGHT' : 'BOTTOM';
  return { pin: Math.round(p * (PINS - 1)) + 1, of: PINS, zone };
}

/** Which side of the demo the cable's column stands on. */
export function cableSide(pattern: Pattern, name: string, pulley: number): 'left' | 'right' {
  return (demoFor(pattern, name, pulley).anchor?.[0] ?? 1) < 0 ? 'left' : 'right';
}
