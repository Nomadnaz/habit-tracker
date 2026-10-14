// Packs the Blender export (scripts/anatomy/export_muscles.py) into
// lib/body-mesh-data.ts — one base64 string, decoded by lib/body-mesh.ts.
//   node scripts/anatomy/pack.mjs <out.json>
// Layout (little-endian): 'BDY1', u16 parts, then per part u8 name length,
// name, u32 vertex count, u32 index count, f32 view yaw, f32×3 view centre;
// then per part its vertices (int16 xyz in 1/50 cm, int8 normal ×127) and
// u16 indices.
// The view yaw / centre are where the stage flies to for a muscle: the turn
// that shows the most of it unblocked (ray-traced here, offline — a closed
// muscle's normals cancel out, so they can't say which side is exposed),
// and the middle of the part you can then see.
import { readFileSync, writeFileSync } from 'fs';

const parts = Object.entries(JSON.parse(readFileSync(process.argv[2], 'utf8')))
  .filter(([, p]) => p.idx.length > 0)
  .sort(([a], [b]) => a.localeCompare(b));

// ── visibility ───────────────────────────────────────────────────────────
const boxes = parts.map(([, p]) => {
  const lo = [1e9, 1e9, 1e9], hi = [-1e9, -1e9, -1e9];
  for (let i = 0; i < p.pos.length; i += 3) for (let c = 0; c < 3; c++) {
    lo[c] = Math.min(lo[c], p.pos[i + c]); hi[c] = Math.max(hi[c], p.pos[i + c]);
  }
  return { lo, hi };
});
function rayBox(o, d, { lo, hi }, maxT) {
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
function firstHit(o, d) {
  let best = -1, bestT = Infinity;
  parts.forEach(([, p], pi) => {
    if (!rayBox(o, d, boxes[pi], bestT)) return;
    const P = p.pos, I = p.idx;
    for (let t = 0; t < I.length; t += 3) {
      const a = I[t] * 3, b = I[t + 1] * 3, c = I[t + 2] * 3;
      const e1 = [P[b] - P[a], P[b + 1] - P[a + 1], P[b + 2] - P[a + 2]];
      const e2 = [P[c] - P[a], P[c + 1] - P[a + 1], P[c + 2] - P[a + 2]];
      const px = d[1] * e2[2] - d[2] * e2[1], py = d[2] * e2[0] - d[0] * e2[2], pz = d[0] * e2[1] - d[1] * e2[0];
      const det = e1[0] * px + e1[1] * py + e1[2] * pz;
      if (Math.abs(det) < 1e-9) continue;
      const inv = 1 / det;
      const s = [o[0] - P[a], o[1] - P[a + 1], o[2] - P[a + 2]];
      const u = (s[0] * px + s[1] * py + s[2] * pz) * inv;
      if (u < 0 || u > 1) continue;
      const q = [s[1] * e1[2] - s[2] * e1[1], s[2] * e1[0] - s[0] * e1[2], s[0] * e1[1] - s[1] * e1[0]];
      const w = (d[0] * q[0] + d[1] * q[1] + d[2] * q[2]) * inv;
      if (w < 0 || u + w > 1) continue;
      const tt = (e2[0] * q[0] + e2[1] * q[1] + e2[2] * q[2]) * inv;
      if (tt > 0 && tt < bestT) { bestT = tt; best = pi; }
    }
  });
  return best;
}
// Deterministic area-weighted sample points on a part.
function samples(p, n) {
  const P = p.pos, I = p.idx, cum = [];
  let A = 0;
  for (let t = 0; t < I.length; t += 3) {
    const a = I[t] * 3, b = I[t + 1] * 3, c = I[t + 2] * 3;
    const u = [P[b] - P[a], P[b + 1] - P[a + 1], P[b + 2] - P[a + 2]], v = [P[c] - P[a], P[c + 1] - P[a + 1], P[c + 2] - P[a + 2]];
    A += Math.hypot(u[1] * v[2] - u[2] * v[1], u[2] * v[0] - u[0] * v[2], u[0] * v[1] - u[1] * v[0]);
    cum.push(A);
  }
  const out = [];
  for (let k = 0; k < n; k++) {
    const target = ((k + 0.5) / n) * A;
    const t = cum.findIndex(x => x >= target);
    const a = I[t * 3] * 3, b = I[t * 3 + 1] * 3, c = I[t * 3 + 2] * 3;
    const q = [0, 1, 2].map(i => (P[a + i] + P[b + i] + P[c + i]) / 3);
    const u = [P[b] - P[a], P[b + 1] - P[a + 1], P[b + 2] - P[a + 2]], v = [P[c] - P[a], P[c + 1] - P[a + 1], P[c + 2] - P[a + 2]];
    const fn = [u[1] * v[2] - u[2] * v[1], u[2] * v[0] - u[0] * v[2], u[0] * v[1] - u[1] * v[0]];
    const l = Math.hypot(...fn) || 1;
    q.n = fn.map(x => x / l);
    out.push(q);
  }
  return out;
}
const YAWS = 24, SAMPLES = 48, PITCH = 0.1;
const views = parts.map(([name, p], pi) => {
  const pts = samples(p, SAMPLES);
  let best = { score: -1, yaw: 0, c: pts[0] };
  for (let k = 0; k < YAWS; k++) {
    const yaw = (k / YAWS) * Math.PI * 2 - Math.PI;
    // Camera looks along d (world), from in front of the turned figure.
    const d = [Math.sin(yaw) * Math.cos(PITCH), -Math.sin(PITCH), -Math.cos(yaw) * Math.cos(PITCH)];
    const vis = pts.filter(q => firstHit([q[0] - d[0] * 400, q[1] - d[1] * 400, q[2] - d[2] * 400], d) === pi);
    // Visible surface weighted by how squarely it faces the camera — so a
    // chest is shot from the front, not edge-on. Ties go to the front.
    const score = vis.reduce((s, q) => s + Math.abs(q.n[0] * d[0] + q.n[1] * d[1] + q.n[2] * d[2]), 0) / pts.length + 0.03 * Math.cos(yaw);
    if (score > best.score) {
      const c = vis.length ? [0, 1, 2].map(i => vis.reduce((s, q) => s + q[i], 0) / vis.length) : best.c;
      best = { score, yaw, c };
    }
  }
  if (best.score < 0.08) console.warn(`  ${name}: barely visible from any side (${best.score.toFixed(2)})`);
  return best;
});

let size = 6;
for (const [name, p] of parts) size += 1 + name.length + 8 + 16 + (p.pos.length / 3) * 9 + p.idx.length * 2;
const buf = Buffer.alloc(size);
let o = buf.write('BDY1', 0, 'ascii');
o = buf.writeUInt16LE(parts.length, o);
for (const [name, p] of parts) {
  o = buf.writeUInt8(name.length, o);
  o += buf.write(name, o, 'ascii');
  o = buf.writeUInt32LE(p.pos.length / 3, o);
  o = buf.writeUInt32LE(p.idx.length, o);
  const v = views[parts.findIndex(([n]) => n === name)];
  o = buf.writeFloatLE(v.yaw, o);
  for (const x of v.c) o = buf.writeFloatLE(x, o);
}
for (const [, p] of parts) {
  for (let i = 0; i < p.pos.length; i += 3) {
    for (let c = 0; c < 3; c++) o = buf.writeInt16LE(Math.round(p.pos[i + c] * 50), o);
    const l = Math.hypot(p.nrm[i], p.nrm[i + 1], p.nrm[i + 2]) || 1;
    for (let c = 0; c < 3; c++) o = buf.writeInt8(Math.round((p.nrm[i + c] / l) * 127), o);
  }
  for (const v of p.idx) o = buf.writeUInt16LE(v, o);
}
const b64 = buf.toString('base64');
const tris = parts.reduce((s, [, p]) => s + p.idx.length / 3, 0);
writeFileSync('lib/body-mesh-data.ts',
  `// GENERATED by scripts/anatomy/pack.mjs — do not edit. ${parts.length} parts, ${tris} triangles.\n` +
  `// Anatomy: Z-Anatomy (CC BY-SA 4.0), from BodyParts3D © DBCLS (CC BY 4.0). See assets/anatomy/LICENSE.md.\n` +
  `export const BODY_MESH =\n  '${b64}';\n`);
console.log(`${parts.length} parts, ${tris} tris, ${buf.length} bytes, ${b64.length} b64 chars`);
