// ExerciseDemo — a looping dot-matrix demo of an exercise, drawn in the
// same halftone as the BODY figure: a mannequin posed at the start and end
// of the movement, eased between them and back, rasterised to a grid of
// dots each frame (bigger dots towards the middle of a limb, so it reads as
// round). The far-side limbs are dimmer and sit behind the body.
//
// No footage: every exercise is one of ~30 movement patterns
// (lib/exercise-guide.ts patternOf), each posed here by where the hips,
// hands and feet go; knees and elbows are solved (two-bone IK). The kit —
// bar plates, dumbbells, a cable to its pulley, a bench — comes from the
// equipment in the name.

import { memo, useEffect, useMemo, useState } from 'react';
import { View } from 'react-native';
import Svg, { Path } from 'react-native-svg';
import { C } from '@/lib/theme';
import type { Equipment, Pattern } from '@/lib/exercise-guide';

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
type Demo = { view: 'side' | 'front'; a: Pose; b: Pose; anchor?: P; props?: (j: Joints) => Cap[] };

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

type Joints = { hip: P; shoulder: P; head: P; u: P; v: P; knee: P; ankle: P; toe: P; knee2: P; ankle2: P; toe2: P; elbow: P; hand: P; elbow2: P; hand2: P; shoulder2: P; hip2: P };

function handAt(h: Hand, shoulder: P, u: P, v: P): P {
  if ('w' in h) return h.w;
  if ('s' in h) return add(shoulder, h.s);
  return add(add(shoulder, u, h.l[0]), v, h.l[1]);
}

/** Pose → joints, blending start→end by t. */
function solve(demo: Demo, t: number): Joints {
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
    for (const h of hands) out.push(cap(h, demo.anchor, 1.1, 0.7, 0.5));
    out.push(cap(demo.anchor, demo.anchor, 4.5, 0.6, 0.5));
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
function raster(caps: Cap[], size: number): string {
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

const DEMOS: Record<Pattern, Demo> = {
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
    a: { hip: [0, 30], torso: 72, ankle: [-85, 5], foot: 20, hand: { w: [49, 2] }, knee: -1 },
    b: { hip: [-2, 12], torso: 80, ankle: [-85, 5], foot: 20, hand: { w: [49, 2] }, knee: -1 },
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
    a: { hip: [2, 80], torso: 176, ankle: [-8, 2], hand: { w: [10, 184] }, knee: -1 },
    b: { hip: [6, 116], torso: 170, ankle: [-6, 38], hand: { w: [10, 184] }, knee: -1 },
    props: bar([10, 184]),
  },
  curl: { view: 'side', a: { ...STAND, hand: { s: [3, -55] } }, b: { ...STAND, hand: { s: [24, -10] } } },
  pushdown: { view: 'side', a: { ...STAND, torso: 172, hand: { s: [22, -20] } }, b: { ...STAND, torso: 172, hand: { s: [6, -54] } }, anchor: [30, 204] },
  overheadext: { view: 'side', a: { ...STAND, hand: { s: [-14, 22] } }, b: { ...STAND, hand: { s: [2, 55] } } },
  skull: {
    view: 'side',
    a: { hip: [25, 48], torso: 270, ankle: [62, 0], hand: { l: [-2, 54] }, knee: 1, elbow: 1 },
    b: { hip: [25, 48], torso: 270, ankle: [62, 0], hand: { l: [20, 16] }, knee: 1, elbow: 1 },
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
    a: { hip: [0, 32], torso: 80, ankle: [-86, 5], foot: 20, hand: { w: [74, 3] }, knee: -1, elbow: -1 },
    b: { hip: [0, 36], torso: 80, ankle: [-86, 5], foot: 20, hand: { w: [74, 3] }, knee: -1, elbow: -1 },
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

// Tweaks by name: the bench's tilt, a seated press.
function demoFor(pattern: Pattern, name: string): Demo {
  const d = DEMOS[pattern];
  const n = name.toUpperCase();
  // Upright row: hands up the front of the body to the chin, elbows high.
  if (/UPRIGHT/.test(n)) return { view: 'front', a: { ...STAND, ankle: [11, 0], hand: { s: [-13, -54] }, elbow: 1 }, b: { ...STAND, ankle: [11, 0], hand: { s: [-13, -6] }, elbow: 1 } };
  if (pattern === 'bench' || pattern === 'skull') {
    const torso = /INCLINE/.test(n) ? 240 : /DECLINE/.test(n) ? 292 : 270;
    return { ...d, a: { ...d.a, torso }, b: { ...d.b, torso } };
  }
  return d;
}

const FRAMES = 28;
const FRAME_MS = 70;

export const ExerciseDemo = memo(function ExerciseDemo({ pattern, equipment, name, size }: {
  pattern: Pattern; equipment: Equipment; name: string; size: number;
}) {
  // Every frame rasterised once: start → end → start, eased.
  const frames = useMemo(() => {
    const demo = demoFor(pattern, name);
    return Array.from({ length: FRAMES }, (_, f) => {
      const t = (1 - Math.cos((f / FRAMES) * Math.PI * 2)) / 2;
      const j = solve(demo, t);
      const front = demo.view === 'front';
      return raster([...figure(j, front), ...kit(j, demo, equipment, front)], size);
    });
  }, [pattern, equipment, name, size]);
  const [f, setF] = useState(0);
  useEffect(() => {
    const id = setInterval(() => setF(x => (x + 1) % FRAMES), FRAME_MS);
    return () => clearInterval(id);
  }, [frames]);
  return (
    <View style={{ width: size, height: size }}>
      <Svg width={size} height={size}><Path d={frames[f]} fill={C.ink} /></Svg>
    </View>
  );
});
