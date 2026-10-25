// ─────────────────────────────────────────────────────────────────────────
// Body mesh — the anatomical figure on the BODY tab.
//
// Real muscle geometry from Z-Anatomy (CC BY-SA 4.0, itself built on
// BodyParts3D © DBCLS, CC BY 4.0), cut down to the muscles you'd train,
// decimated, and pre-packed into lib/body-mesh-data.ts by scripts/anatomy/
// (see the README there). The rest of the figure — head, neck, hands,
// feet, the knee and forearm bones, the small lower-leg muscles — is
// scenery: parts named 'x.…', drawn faint and never tappable.
//
// Units are centimetres, y up (feet at 0), +z is the front of the body and
// +x is the figure's LEFT.
// ─────────────────────────────────────────────────────────────────────────

import { BODY_MESH } from './body-mesh-data';

export type Side = 'l' | 'r';
export interface Muscle { id: string; name: string; group: string; side: Side | null }

type V3 = [number, number, number];

// ── muscles ──────────────────────────────────────────────────────────────

const SINGLE: [string, string, string][] = [
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
  ['teres', 'TERES MAJOR', 'BACK'],
  ['lat', 'LAT', 'BACK'],
  ['erector', 'LOWER BACK', 'BACK'],
  ['biceps', 'BICEP', 'ARMS'],
  ['brachialis', 'BRACHIALIS', 'ARMS'],
  ['triceps.lat', 'TRICEP OUTER HEAD', 'ARMS'],
  ['triceps.long', 'TRICEP LONG HEAD', 'ARMS'],
  ['brachiorad', 'BRACHIORADIALIS', 'ARMS'],
  ['forearm.flex', 'FOREARM FLEXORS', 'ARMS'],
  ['forearm.ext', 'FOREARM EXTENSORS', 'ARMS'],
  ['oblique', 'OBLIQUE', 'CORE'],
  ['serratus', 'SERRATUS', 'CORE'],
  ['hipflex', 'HIP FLEXOR', 'HIPS'],
  ['tfl', 'TFL - IT BAND', 'HIPS'],
  ['glute.max', 'GLUTE MAX', 'HIPS'],
  ['glute.med', 'GLUTE MED', 'HIPS'],
  ['quad.rf', 'RECTUS FEMORIS', 'LEGS'],
  ['quad.vl', 'OUTER QUAD', 'LEGS'],
  ['quad.vm', 'INNER QUAD', 'LEGS'],
  ['adductor', 'ADDUCTORS', 'LEGS'],
  ['ham.bf', 'OUTER HAMSTRING', 'LEGS'],
  ['ham.st', 'INNER HAMSTRING', 'LEGS'],
  ['tib', 'TIBIALIS', 'LEGS'],
  ['gastro.lat', 'OUTER CALF', 'LEGS'],
  ['gastro.med', 'INNER CALF', 'LEGS'],
  ['soleus', 'SOLEUS', 'LEGS'],
];

export const MUSCLES: Muscle[] = [
  ...SINGLE.map(([id, name, group]) => ({ id, name, group, side: null })),
  ...PAIRED.flatMap(([id, name, group]) => (['l', 'r'] as Side[]).map(side => ({
    id: `${id}.${side}`, name: `${side.toUpperCase()} ${name}`, group, side,
  }))),
];
export const MUSCLE_INDEX: Record<string, number> = Object.fromEntries(MUSCLES.map((m, i) => [m.id, i]));

// ── zones ────────────────────────────────────────────────────────────────
// Tapping the figure first zooms to the zone a muscle sits in (the whole
// chest, one thigh), then to the muscle itself. Zones across the midline
// take both sides; limbs are one side each.

export interface Zone { id: string; name: string; muscles: string[] }

const ZONE_DEFS: [id: string, name: string, muscles: string[], bothSides: boolean][] = [
  ['chest', 'CHEST', ['pec.upper', 'pec.lower'], true],
  ['core', 'CORE', ['abs.upper', 'abs.lower', 'oblique', 'serratus'], true],
  ['upperback', 'UPPER BACK', ['traps.upper', 'traps.mid', 'traps.lower', 'cuff', 'teres'], true],
  ['back', 'LATS AND LOWER BACK', ['lat', 'erector'], true],
  ['hips', 'HIPS AND GLUTES', ['glute.max', 'glute.med', 'hipflex', 'tfl'], true],
  ['shoulder', 'SHOULDER', ['delt.front', 'delt.side', 'delt.rear'], false],
  ['arm', 'UPPER ARM', ['biceps', 'brachialis', 'triceps.lat', 'triceps.long'], false],
  ['forearm', 'FOREARM', ['brachiorad', 'forearm.flex', 'forearm.ext'], false],
  ['thigh', 'THIGH', ['quad.rf', 'quad.vl', 'quad.vm', 'adductor', 'ham.bf', 'ham.st'], false],
  ['leg', 'LOWER LEG', ['tib', 'gastro.lat', 'gastro.med', 'soleus'], false],
];

const withSides = (ids: string[], sides: Side[]) =>
  ids.flatMap(id => (MUSCLE_INDEX[id] != null ? [id] : sides.map(s => `${id}.${s}`)));

export const ZONES: Zone[] = ZONE_DEFS.flatMap(([id, name, muscles, both]) => both
  ? [{ id, name, muscles: withSides(muscles, ['l', 'r']) }]
  : (['l', 'r'] as Side[]).map(s => ({ id: `${id}.${s}`, name: `${s.toUpperCase()} ${name}`, muscles: withSides(muscles, [s]) })));
export const ZONE_BY_ID: Record<string, Zone> = Object.fromEntries(ZONES.map(z => [z.id, z]));
/** Muscle id → the zone it sits in. */
export const ZONE_OF: Record<string, string> = Object.fromEntries(ZONES.flatMap(z => z.muscles.map(m => [m, z.id])));

// ── mesh ─────────────────────────────────────────────────────────────────

export interface Part {
  mi: number;            // index into MUSCLES; -1 for scenery
  vStart: number;        // first vertex in the shared arrays
  vCount: number;
  iStart: number;        // first index in `idx` (indices are part-local)
  iCount: number;
  lo: V3; hi: V3;        // bounding box
  c: V3;                 // centre of the part you see from `yaw`
  yaw: number;           // the figure's turn that shows the most of it (scripts/anatomy/pack.mjs)
  r: number;             // farthest vertex from `c`, cm
}

export interface BodyMesh {
  pos: Float32Array;     // xyz per vertex, cm
  nrm: Float32Array;     // unit normal per vertex
  idx: Uint16Array;      // triangles, part-local vertex numbers
  parts: Part[];
  decor: Part[];         // scenery: drawn, and hides what's behind it, but never picked
  byMuscle: (Part | undefined)[];
}

const B64 = 'ABCDEFGHIJKLMNOPQRSTUVWXYZabcdefghijklmnopqrstuvwxyz0123456789+/';

function fromBase64(b64: string): Uint8Array {
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
  return bytes;
}

export function decodeBodyMesh(b64: string = BODY_MESH): BodyMesh {
  const bytes = fromBase64(b64);
  const v = new DataView(bytes.buffer);
  if (String.fromCharCode(bytes[0], bytes[1], bytes[2], bytes[3]) !== 'BDY1') throw new Error('body mesh: bad header');
  let o = 4;
  const nParts = v.getUint16(o, true); o += 2;
  const heads: { name: string; nv: number; ni: number; yaw: number; c: V3 }[] = [];
  for (let p = 0; p < nParts; p++) {
    const len = v.getUint8(o); o += 1;
    let name = '';
    for (let i = 0; i < len; i++) name += String.fromCharCode(bytes[o + i]);
    o += len;
    heads.push({
      name, nv: v.getUint32(o, true), ni: v.getUint32(o + 4, true),
      yaw: v.getFloat32(o + 8, true), c: [v.getFloat32(o + 12, true), v.getFloat32(o + 16, true), v.getFloat32(o + 20, true)],
    });
    o += 24;
  }
  const NV = heads.reduce((s, h) => s + h.nv, 0), NI = heads.reduce((s, h) => s + h.ni, 0);
  const pos = new Float32Array(NV * 3), nrm = new Float32Array(NV * 3), idx = new Uint16Array(NI);
  const parts: Part[] = [], decor: Part[] = [];
  let vs = 0, is = 0;
  for (const h of heads) {
    for (let i = 0; i < h.nv; i++) {
      const k = (vs + i) * 3;
      pos[k] = v.getInt16(o, true) / 50; pos[k + 1] = v.getInt16(o + 2, true) / 50; pos[k + 2] = v.getInt16(o + 4, true) / 50;
      const nx = v.getInt8(o + 6), ny = v.getInt8(o + 7), nz = v.getInt8(o + 8);
      const l = Math.hypot(nx, ny, nz) || 1;
      nrm[k] = nx / l; nrm[k + 1] = ny / l; nrm[k + 2] = nz / l;
      o += 9;
    }
    for (let i = 0; i < h.ni; i++) { idx[is + i] = v.getUint16(o, true); o += 2; }
    const mi = MUSCLE_INDEX[h.name];
    if (mi != null) parts.push(frame({ mi, vStart: vs, vCount: h.nv, iStart: is, iCount: h.ni, yaw: h.yaw, c: h.c }, pos));
    else if (h.name.startsWith('x.')) decor.push(frame({ mi: -1, vStart: vs, vCount: h.nv, iStart: is, iCount: h.ni, yaw: h.yaw, c: h.c }, pos));
    vs += h.nv; is += h.ni;
  }
  const byMuscle: (Part | undefined)[] = MUSCLES.map(() => undefined);
  for (const p of parts) byMuscle[p.mi] = p;
  return { pos, nrm, idx, parts, decor, byMuscle };
}

function frame(p: Pick<Part, 'mi' | 'vStart' | 'vCount' | 'iStart' | 'iCount' | 'yaw' | 'c'>, pos: Float32Array): Part {
  const lo: V3 = [1e9, 1e9, 1e9], hi: V3 = [-1e9, -1e9, -1e9];
  let r = 0;
  for (let i = 0; i < p.vCount; i++) {
    const k = (p.vStart + i) * 3;
    for (let c = 0; c < 3; c++) {
      const x = pos[k + c];
      if (x < lo[c]) lo[c] = x;
      if (x > hi[c]) hi[c] = x;
    }
    r = Math.max(r, Math.hypot(pos[k] - p.c[0], pos[k + 1] - p.c[1], pos[k + 2] - p.c[2]));
  }
  return { ...p, lo, hi, r };
}

// ── picking ──────────────────────────────────────────────────────────────

/** Nearest part hit by the ray o + t·d (t > 0), or null. Scenery counts —
 *  a hand in front of a thigh hides it — so check `mi` before picking. */
export function raycast(mesh: BodyMesh, o: V3, d: V3): Part | null {
  return raycastHit(mesh, o, d)?.part ?? null;
}

/** The nearest triangle under a ray: its part, the point (cm) and the
 *  triangle's normal turned to face the ray's origin. */
export type Hit = { part: Part; at: V3; n: V3 };
export function raycastHit(mesh: BodyMesh, o: V3, d: V3): Hit | null {
  let best: Part | null = null, bestT = Infinity;
  let bn: V3 = [0, 0, 1];
  const { pos, idx } = mesh;
  for (const p of [...mesh.parts, ...mesh.decor]) {
    if (!rayBox(o, d, p.lo, p.hi, bestT)) continue;
    for (let t = 0; t < p.iCount; t += 3) {
      const a = (p.vStart + idx[p.iStart + t]) * 3, b = (p.vStart + idx[p.iStart + t + 1]) * 3, c = (p.vStart + idx[p.iStart + t + 2]) * 3;
      // Möller–Trumbore, double-sided.
      const e1x = pos[b] - pos[a], e1y = pos[b + 1] - pos[a + 1], e1z = pos[b + 2] - pos[a + 2];
      const e2x = pos[c] - pos[a], e2y = pos[c + 1] - pos[a + 1], e2z = pos[c + 2] - pos[a + 2];
      const px = d[1] * e2z - d[2] * e2y, py = d[2] * e2x - d[0] * e2z, pz = d[0] * e2y - d[1] * e2x;
      const det = e1x * px + e1y * py + e1z * pz;
      if (Math.abs(det) < 1e-9) continue;
      const inv = 1 / det;
      const sx = o[0] - pos[a], sy = o[1] - pos[a + 1], sz = o[2] - pos[a + 2];
      const u = (sx * px + sy * py + sz * pz) * inv;
      if (u < 0 || u > 1) continue;
      const qx = sy * e1z - sz * e1y, qy = sz * e1x - sx * e1z, qz = sx * e1y - sy * e1x;
      const w = (d[0] * qx + d[1] * qy + d[2] * qz) * inv;
      if (w < 0 || u + w > 1) continue;
      const tt = (e2x * qx + e2y * qy + e2z * qz) * inv;
      if (tt > 0 && tt < bestT) {
        bestT = tt; best = p;
        bn = [e1y * e2z - e1z * e2y, e1z * e2x - e1x * e2z, e1x * e2y - e1y * e2x];
      }
    }
  }
  if (!best) return null;
  const len = Math.hypot(bn[0], bn[1], bn[2]) || 1;
  const toward = bn[0] * d[0] + bn[1] * d[1] + bn[2] * d[2] > 0 ? -1 : 1;
  const n = bn.map(v => (v / len) * toward) as V3;
  return { part: best, at: [o[0] + d[0] * bestT, o[1] + d[1] * bestT, o[2] + d[2] * bestT], n };
}

function rayBox(o: V3, d: V3, lo: V3, hi: V3, maxT: number) {
  let t0 = 0, t1 = maxT;
  for (let k = 0; k < 3; k++) {
    if (Math.abs(d[k]) < 1e-12) { if (o[k] < lo[k] || o[k] > hi[k]) return false; continue; }
    let a = (lo[k] - o[k]) / d[k], b = (hi[k] - o[k]) / d[k];
    if (a > b) [a, b] = [b, a];
    t0 = Math.max(t0, a); t1 = Math.min(t1, b);
    if (t0 > t1) return false;
  }
  return true;
}
