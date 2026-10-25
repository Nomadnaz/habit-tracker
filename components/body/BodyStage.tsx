// The BODY tab's stage: the anatomical figure (lib/body-mesh.ts) drawn on
// the GPU, which you can turn and zoom, where every muscle is tappable.
//   drag sideways → spin (with momentum)      pinch → zoom (1–4×)
//   two fingers   → pan while zoomed          drag up/down while zoomed → pan
//   tap a muscle  → fly to its zone, then to the muscle
//   tap empty space → back out one level
// Left alone at the whole figure, it turns slowly by itself.
// Tapping the figure first frames the muscle's zone (the whole chest, one
// thigh): the rest of the body dims and a ring sweeps over the zone. A
// second tap inside it picks the muscle: the camera eases in until it fills
// the top of the stage, fills it in solid from its centre outwards, then
// types its name into a callout and charges its recovery battery.
// Look: muscles are drawn as a dot-matrix halftone — a fixed screen grid of
// dots sized by how much light the surface catches, like the puck's
// display — with a faint rim on the edges. The selected muscle is drawn
// solid and lit, so its real shape reads at a glance. Marked muscles take
// their category's colour.
// At the whole figure, the day's readouts hang in slots either side of it
// (lib/body-hud.ts), each with a leader line to the point on the body it's
// pinned to — the heart, the stomach, a foot — that follows the figure as
// it turns. The lines stay hidden: tapping a readout draws its one line out
// to the point, then a faint dithered green ripple spreads from there over
// the body and fades. In edit mode every line shows, a tap on the figure
// reports the point under the finger instead of zooming, and the empty
// slots show.
// Rendering is plain WebGL through expo-gl: one shader, one draw per
// muscle, redrawn only when something changes. React only re-renders for
// the callout and the readouts' lines.
import { useEffect, useMemo, useRef, useState, type MutableRefObject, type ReactNode } from 'react';
import { View, Text, StyleSheet, Pressable, Animated, AppState } from 'react-native';
import Svg, { Polyline, Rect } from 'react-native-svg';
import { GLView, type ExpoWebGLRenderingContext } from 'expo-gl';
import { Gesture, GestureDetector } from 'react-native-gesture-handler';
import * as Haptics from 'expo-haptics';
import { MaterialCommunityIcons } from '@expo/vector-icons';
import { C, F, numFace } from '@/lib/theme';
import { MUSCLES, MUSCLE_INDEX, ZONES, ZONE_BY_ID, decodeBodyMesh, raycast, raycastHit, type Part } from '@/lib/body-mesh';
import { ROWS, slotRow, slotSide, type Spot } from '@/lib/body-hud';
import type { BodyMap, Tone } from '@/lib/body-map';

export const TONE: Record<Tone, string> = { hot: C.hot, signal: C.signal, live: C.live, dim: C.dim, alert: C.alert };

export type Facing = 'front' | 'back';

/** Battery colour for a recovery percentage. */
export const batteryTone = (pct: number) => (pct >= 80 ? C.live : pct >= 40 ? C.ink : C.alert);

const MESH = decodeBodyMesh();
// Golden-ratio steps, so neighbouring muscles land on well-separated shifts.
const PHASE = MUSCLES.map((_, i) => [(i * 0.618034) % 1, (i * 0.381966 + 0.5) % 1] as const);
const ZONE_PHASE = [0.5, 0.5] as const; // one grid over a whole zone, so it reads as one shape

const PITCH = 0.1;          // camera looks slightly down, rad
const DIST = 520;           // camera distance, cm
const CENTER_Y = 90;        // world height at the middle of the stage at 1×
const FIG_H = 186;          // world height that fills the stage at 1×
const MAX_ZOOM = 4;
const SPIN = 0.011;         // rad per px of drag
const FOCUS = 0.36;         // a selected muscle settles this far down the stage — clear of the panel
const FOCUS_X = 0.4;        // …and this far across, leaving the right for its callout
const CELL = 4.2;           // halftone cell, pt
const ZONE_FOCUS = 0.42;    // a framed zone settles this far down the stage
const IDLE_SPIN = 0.26;     // rad/s when left alone (~24s a turn)
const IDLE_DELAY = 1500;    // ms after the last touch before it starts
const LIGHT = (() => { const l = [-0.35, 0.45, 0.82]; const n = Math.hypot(...l); return l.map(v => v / n); })();

// Selection timeline, ms after the tap.
const FLY_MS = 760;               // camera move
const WAVE = [120, 760] as const; // solid fill spreading out from the centre
const TYPE = [620, 980] as const; // name typed into the callout
const FILL = [860, 1500] as const; // battery charging up to its level

type Cam = { yaw: number; zoom: number; x: number; y: number };
const HOME: Cam = { yaw: 0, zoom: 1, x: 0, y: CENTER_Y };
type Tween = { from: Cam; to: Cam; t0: number; dur: number };
type V3 = [number, number, number];

// Each zone's extent, and the turn that shows it — null where its muscles
// face different ways (a thigh: quads front, hamstrings back), in which
// case it turns to whichever muscle you tapped.
type ZoneView = { lo: V3; hi: V3; c: V3; r: number; yaw: number | null; members: Set<number>; anchors: V3[] };

// Points a callout can hang from: the centre first, then a spread of the
// part's own vertices, nearest the centre first — so a muscle whose centre
// is hidden (the abs' falls in the gap down the middle) still gets one.
function anchorsOf(p: Part): V3[] {
  const step = Math.max(1, Math.floor(p.vCount / 24));
  const vs: V3[] = [];
  for (let i = 0; i < p.vCount; i += step) {
    const k = (p.vStart + i) * 3;
    vs.push([MESH.pos[k], MESH.pos[k + 1], MESH.pos[k + 2]]);
  }
  const d = (v: V3) => Math.hypot(v[0] - p.c[0], v[1] - p.c[1], v[2] - p.c[2]);
  return [p.c, ...vs.sort((a, b) => d(a) - d(b))];
}
const ANCHORS = new Map(MESH.parts.map(p => [p, anchorsOf(p)]));
const ZONE_VIEW: Record<string, ZoneView> = Object.fromEntries(ZONES.map(z => {
  const parts = z.muscles.map(id => MESH.byMuscle[MUSCLE_INDEX[id]]).filter((p): p is Part => !!p);
  const lo: V3 = [1e9, 1e9, 1e9], hi: V3 = [-1e9, -1e9, -1e9];
  let sx = 0, sy = 0, sw = 0;
  for (const p of parts) {
    for (let k = 0; k < 3; k++) { lo[k] = Math.min(lo[k], p.lo[k]); hi[k] = Math.max(hi[k], p.hi[k]); }
    const w = p.r * p.r;
    sx += w * Math.cos(p.yaw); sy += w * Math.sin(p.yaw); sw += w;
  }
  const c: V3 = [0, 1, 2].map(k => (lo[k] + hi[k]) / 2) as V3;
  const r = Math.hypot(hi[0] - lo[0], hi[1] - lo[1], hi[2] - lo[2]) / 2;
  const yaw = sw && Math.hypot(sx, sy) / sw > 0.6 ? Math.atan2(sy, sx) : null;
  // A zone's callout hangs from its centre, else the centre of whichever
  // of its muscles is nearest that.
  const d = (v: V3) => Math.hypot(v[0] - c[0], v[1] - c[1], v[2] - c[2]);
  const anchors = [c, ...parts.map(p => p.c).sort((a, b) => d(a) - d(b))];
  return [z.id, { lo, hi, c, r, yaw, members: new Set(parts.map(p => p.mi)), anchors }];
}));

// ── readouts ─────────────────────────────────────────────────────────────

/** A readout hung in a slot beside the figure, its line run to `at`. */
export type StagePin = Spot & {
  key: string;
  slot: number;
  tone: string;
  node: ReactNode;
  onPress?: () => void;
  onLongPress?: () => void;
  /** Picked in edit mode. */
  on?: boolean;
};
/** Edit mode: the empty slots show and a tap on the figure reports its point. */
export type StageEdit = {
  free: number[];
  /** The slot picked for the next readout. */
  slotOn: number | null;
  /** The point picked for the next readout (or the picked readout's new point). */
  marker: Spot | null;
  onSlot: (slot: number) => void;
  onSpot: (s: Spot & { muscle: string | null }) => void;
};
type HudPt = { x: number; y: number; a: number };

const HUD_W = 70; // until a readout has measured itself
const LINE_MS = 380;    // a tapped readout's line drawing out to the body
const PULSE_MS = 1900;  // then the ripple from its point
const PULSE_R = 30;     // how far the ripple runs, cm
const LIT_MS = 4500;    // how long the line stays before it fades
const FADE_MS = 500;
const SLOT_GAP = 12;
/** A slot's top edge, as a fraction of the stage. */
const slotTop = (slot: number) => 0.025 + slotRow(slot) * (0.95 / ROWS);
/** How much a point faces the camera, 0.3–1 — its line fades round the back.
 *  Only the turn matters, so the normal is flattened first; feet (no normal)
 *  and points facing straight up or down always show. */
function facingOf(R: [V3, V3, V3], n: V3 | null) {
  if (!n) return 1;
  const h = Math.hypot(n[0], n[2]);
  if (h < 0.25) return 1;
  return 0.3 + 0.7 * clamp01(((R[2][0] * n[0] + R[2][2] * n[2]) / h + 0.15) / 0.5);
}

interface Props {
  width: number;
  height: number;
  map: BodyMap;
  facing: Facing;
  /** Zone being framed (lib/body-mesh ZONES); `selected` is always inside it. */
  zone: string | null;
  selected: string | null;
  filter: string | null;
  /** False while the tab is out of sight — stops the idle turn. */
  active: boolean;
  /** Recovery 0–100 of the selected muscle, or the zone's average; null when there's none. */
  battery: number | null;
  /** A tap on the figure: the muscle under the finger, or null for empty space. */
  onPick: (id: string | null) => void;
  /** Back out to the whole figure. */
  onHome: () => void;
  onFacing: (f: Facing) => void;
  /** True while zoomed in, so the page can stop scrolling under the finger. */
  onZoomed: (zoomed: boolean) => void;
  /** The readouts round the whole figure; hidden while zoomed or framing a zone. */
  pins: StagePin[];
  edit: StageEdit | null;
  /** The readout just tapped (and when): its line draws out and its point ripples. */
  lit: { key: string; t0: number } | null;
  /** Lens / recovery colours, by muscle id: from ink (t 0) to `tone` (t 1). Wins over goals. */
  paint: Record<string, Paint> | null;
  /** Draw goal categories' colours (off while a lens is showing something else). */
  showGoals: boolean;
  /** Step back the muscles `paint` leaves out, so the painted ones stand out. */
  dimRest: boolean;
}

/** glow 0–1: a soft inner light that breathes (RECOVERY lights worn muscles by how worn). */
export type Paint = { tone: string; t: number; glow?: number };

const wrapAngle = (a: number) => Math.atan2(Math.sin(a), Math.cos(a));
const clamp01 = (v: number) => Math.min(1, Math.max(0, v));
const easeInOut = (u: number) => (u < 0.5 ? 4 * u * u * u : 1 - Math.pow(-2 * u + 2, 3) / 2);
const easeOut = (u: number) => 1 - Math.pow(1 - u, 3);
const phase = (t: number, [a, b]: readonly [number, number]) => clamp01((t - a) / (b - a));
const rgb = (hex: string): V3 => [1, 3, 5].map(i => parseInt(hex.slice(i, i + 2), 16) / 255) as V3;
const mix3 = (a: V3, b: V3, t: number): V3 => [0, 1, 2].map(k => a[k] + (b[k] - a[k]) * t) as V3;

/** World → camera rotation (yaw about y, then the fixed pitch), as rows. */
function rotation(yaw: number): [V3, V3, V3] {
  const cy = Math.cos(yaw), sy = Math.sin(yaw), cp = Math.cos(PITCH), sp = Math.sin(PITCH);
  return [[cy, 0, sy], [sp * sy, cp, -sp * cy], [-cp * sy, sp, cp * cy]];
}
const dot3 = (a: V3, b: V3) => a[0] * b[0] + a[1] * b[1] + a[2] * b[2];

// ── shaders ──────────────────────────────────────────────────────────────

const VS = `
attribute vec3 aPos;
attribute vec3 aNrm;
uniform mat4 uMVP;
uniform mat3 uRot;
varying vec3 vN;
varying vec3 vW;
void main() {
  vN = uRot * aNrm;
  vW = aPos;
  gl_Position = uMVP * vec4(aPos, 1.0);
}`;

const FS = `
precision highp float;
varying vec3 vN;
varying vec3 vW;
uniform vec3 uCol;     // dot colour: ink or the muscle's category
uniform float uAmt;    // dot strength
uniform float uMode;   // 1 = ring sweeping over (framed zone), 2 = ring + solid fill (selected muscle)
uniform vec3 uSelC;    // where the ring starts, cm
uniform float uWave;   // ring radius from there, cm
uniform float uCell;   // halftone cell, device px
uniform vec2 uPhase;   // per-muscle shift of the dot grid, in cells
uniform vec3 uLight;
uniform float uGlow;   // 0–1, worn muscles under RECOVERY
uniform float uTime;   // seconds, for the glow's slow breathe
uniform vec3 uPulseC;  // a tapped readout's point, cm
uniform float uPulseR; // its ripple's radius, cm
uniform float uPulseA; // and strength, 0 = none
uniform vec3 uPulseCol;
void main() {
  vec3 n = normalize(vN);
  if (!gl_FrontFacing) n = -n;
  float diff = max(dot(n, uLight), 0.0);
  float rim = pow(1.0 - max(n.z, 0.0), 2.5);
  float lum = 0.06 + 0.94 * diff;
  // Each muscle's grid is shifted a little, so where two meet the dots
  // fall out of step and the boundary shows as a seam.
  vec2 g = fract(gl_FragCoord.xy / uCell + uPhase) - 0.5;
  // Glow: dots swell a touch, a faint light fills between them and the
  // silhouette's edge brightens — kept low so it reads as warmth, not neon.
  float glow = uGlow * (0.8 + 0.2 * sin(uTime * 2.1));
  float r = 0.48 * sqrt(lum) * (1.0 + 0.16 * glow);
  float dots = 1.0 - smoothstep(r - 0.1, r + 0.1, length(g));
  vec3 col = vec3(0.025) + uCol * (dots * uAmt + rim * 0.2 * uAmt);
  col += uCol * glow * (0.07 + 0.3 * rim) * (0.5 + 0.5 * lum);
  if (uMode > 0.5) {
    float d = distance(vW, uSelC);
    if (uMode > 1.5) {
      float lit = 1.0 - smoothstep(uWave - 0.8, uWave, d);
      vec3 solid = vec3(0.3) + vec3(0.7) * diff + vec3(0.3) * rim;
      col = mix(col, solid, lit);
    }
    col += vec3(1.0 - smoothstep(0.0, 1.4, abs(d - uWave))) * step(uWave, 500.0);
  }
  if (uPulseA > 0.0) {
    // The ripple: a ring running out from the point with a faint wake
    // behind it, drawn on the halftone dots plus a scatter of pixels
    // between them, so it reads as dithered light rather than paint.
    float pd = distance(vW, uPulseC);
    float ring = 1.0 - smoothstep(0.0, 5.5, abs(pd - uPulseR));
    float wake = (1.0 - smoothstep(0.0, uPulseR + 1.0, pd)) * 0.35;
    float g = (ring + wake) * uPulseA;
    vec2 px = floor(gl_FragCoord.xy / (uCell * 0.5));
    float hash = fract(sin(dot(px, vec2(12.9898, 78.233))) * 43758.5453);
    float lit = max(dots, step(hash, g * 0.5));
    col = mix(col, uPulseCol * (0.45 + 0.55 * dots), clamp(g * lit * 0.85, 0.0, 0.85));
  }
  gl_FragColor = vec4(col, 1.0);
}`;

type GLState = {
  gl: ExpoWebGLRenderingContext;
  aPos: number; aNrm: number;
  u: Record<string, WebGLUniformLocation | null>;
};

function setupGL(gl: ExpoWebGLRenderingContext): GLState {
  const sh = (type: number, src: string) => {
    const s = gl.createShader(type)!;
    gl.shaderSource(s, src);
    gl.compileShader(s);
    if (!gl.getShaderParameter(s, gl.COMPILE_STATUS)) throw new Error(`body shader: ${gl.getShaderInfoLog(s)}`);
    return s;
  };
  const prog = gl.createProgram()!;
  gl.attachShader(prog, sh(gl.VERTEX_SHADER, VS));
  gl.attachShader(prog, sh(gl.FRAGMENT_SHADER, FS));
  gl.linkProgram(prog);
  if (!gl.getProgramParameter(prog, gl.LINK_STATUS)) throw new Error(`body program: ${gl.getProgramInfoLog(prog)}`);
  gl.useProgram(prog);

  // Interleaved position + normal, and the part-local indices.
  const NV = MESH.pos.length / 3;
  const inter = new Float32Array(NV * 6);
  for (let i = 0; i < NV; i++) {
    inter.set(MESH.pos.subarray(i * 3, i * 3 + 3), i * 6);
    inter.set(MESH.nrm.subarray(i * 3, i * 3 + 3), i * 6 + 3);
  }
  gl.bindBuffer(gl.ARRAY_BUFFER, gl.createBuffer());
  gl.bufferData(gl.ARRAY_BUFFER, inter, gl.STATIC_DRAW);
  gl.bindBuffer(gl.ELEMENT_ARRAY_BUFFER, gl.createBuffer());
  gl.bufferData(gl.ELEMENT_ARRAY_BUFFER, MESH.idx, gl.STATIC_DRAW);

  const aPos = gl.getAttribLocation(prog, 'aPos'), aNrm = gl.getAttribLocation(prog, 'aNrm');
  gl.enableVertexAttribArray(aPos);
  gl.enableVertexAttribArray(aNrm);
  const u: GLState['u'] = {};
  for (const name of ['uMVP', 'uRot', 'uCol', 'uAmt', 'uMode', 'uSelC', 'uWave', 'uCell', 'uPhase', 'uLight', 'uGlow', 'uTime', 'uPulseC', 'uPulseR', 'uPulseA', 'uPulseCol']) u[name] = gl.getUniformLocation(prog, name);
  gl.enable(gl.DEPTH_TEST);
  gl.clearColor(0, 0, 0, 1);
  return { gl, aPos, aNrm, u };
}

export function BodyStage({ width: W, height: H, map, facing, zone, selected, filter, active, battery, onPick, onHome, onFacing, onZoomed, pins, edit, lit, paint, showGoals, dimRest }: Props) {
  const cam = useRef<Cam>({ ...HOME });
  const tween = useRef<Tween | null>(null);
  const spin = useRef(0);               // rad/s of momentum
  const raf = useRef<number | null>(null);
  const last = useRef(0);
  const glRef = useRef<GLState | null>(null);
  const selT0 = useRef(0);              // when the current zone / muscle was picked
  const anchorAt = useRef(0);           // which of its anchors the callout last hung from
  const hint = useRef<string | null>(null); // the muscle that led into the zone
  const lastInput = useRef(0);
  const held = useRef(false);          // a finger is on the figure
  const idleDir = useRef(1);
  const [, setFrame] = useState(0);     // callout re-render
  const [zoomed, setZoomed] = useState(false);
  const facingRef = useRef<Facing>(facing);
  const zoomedRef = useRef(false);
  const hudSet = useRef<((p: Record<string, HudPt>) => void) | null>(null);
  const hudLast = useRef<Record<string, HudPt> | null>(null);
  const pulse = useRef<{ c: V3; t0: number } | null>(null);

  // Latest props for the gesture callbacks (they're built once).
  const props = useRef({ onPick, onFacing, onZoomed, pins, edit });
  props.current = { onPick, onFacing, onZoomed, pins, edit };

  const base = (H * 0.94) / FIG_H; // px per cm at 1×
  const selPart: Part | undefined = selected ? MESH.byMuscle[MUSCLE_INDEX[selected]] : undefined;
  const zv: ZoneView | undefined = zone ? ZONE_VIEW[zone] : undefined;

  // Per-muscle dot colour, strength, grid shift and highlight. Framing a
  // zone dims everything outside it; inside, the zone is one shape until a
  // muscle is picked, then that muscle fills solid and its neighbours step
  // back.
  const catById = useMemo(() => Object.fromEntries(map.categories.map(c => [c.id, c])), [map.categories]);
  const look = useMemo(() => {
    const ink = rgb(C.ink);
    return MUSCLES.map((m, i) => {
      const mk = showGoals ? map.marks[m.id] : undefined;
      const cat = mk && (!filter || mk.category === filter) ? catById[mk.category] : undefined;
      const pt = paint?.[m.id];
      const col: V3 = pt ? mix3(ink, rgb(pt.tone), pt.t) : cat ? rgb(TONE[cat.tone]) : ink;
      const full = pt || cat ? 1 : dimRest ? 0.32 : 0.8;
      const glow = pt?.glow ?? 0;
      if (!zv) return { col, amt: full, phase: PHASE[i], mode: 0, glow };
      if (!zv.members.has(i)) return { col, amt: full * 0.16, phase: PHASE[i], mode: 0, glow: 0 };
      if (!selected) return { col, amt: 1, phase: ZONE_PHASE, mode: 1, glow };
      return m.id === selected ? { col, amt: 1, phase: PHASE[i], mode: 2, glow } : { col, amt: full * 0.6, phase: PHASE[i], mode: 0, glow };
    });
  }, [map.marks, filter, catById, selected, zv, paint, showGoals, dimRest]);

  // Everything the draw needs that React owns, for the animation loop.
  const glowing = look.some(l => l.glow > 0.01);
  const live = useRef({ look, selPart, zv, active, W, H, base, glowing });
  live.current = { look, selPart, zv, active, W, H, base, glowing };

  // ── drawing ────────────────────────────────────────────────────────────
  const draw = () => {
    const S = glRef.current;
    // No GPU work outside the foreground: a frame queued as the app left
    // stalled expo-gl's queue and iOS killed the app (see patches/expo-gl).
    if (!S || AppState.currentState !== 'active') return;
    const { gl, u } = S;
    const { look: lk, selPart: sp, zv: z, W: w, H: h, base: b } = live.current;
    const c = cam.current;
    const k = b * c.zoom;
    const R = rotation(c.yaw);
    const near = 200, far = 900;
    const A = -(far + near) / (far - near), B = (-2 * far * near) / (far - near);
    const px = (2 * k * DIST) / w, py = (2 * k * DIST) / h;
    const t: V3 = [c.x, c.y, DIST];
    // clip = P · (R·p − t), column-major.
    const m = new Float32Array(16);
    for (let col = 0; col < 3; col++) {
      m[col * 4] = px * R[0][col];
      m[col * 4 + 1] = py * R[1][col];
      m[col * 4 + 2] = A * R[2][col];
      m[col * 4 + 3] = -R[2][col];
    }
    m[12] = -px * t[0]; m[13] = -py * t[1]; m[14] = -A * t[2] + B; m[15] = t[2];
    const rot = new Float32Array([R[0][0], R[1][0], R[2][0], R[0][1], R[1][1], R[2][1], R[0][2], R[1][2], R[2][2]]);

    gl.viewport(0, 0, gl.drawingBufferWidth, gl.drawingBufferHeight);
    gl.clear(gl.COLOR_BUFFER_BIT | gl.DEPTH_BUFFER_BIT);
    gl.uniformMatrix4fv(u.uMVP, false, m);
    gl.uniformMatrix3fv(u.uRot, false, rot);
    gl.uniform1f(u.uCell, CELL * (gl.drawingBufferWidth / w));
    gl.uniform3f(u.uLight, LIGHT[0], LIGHT[1], LIGHT[2]);
    gl.uniform1f(u.uTime, (Date.now() % 600_000) / 1000);
    // The ring starts from the muscle's centre, or the zone's.
    const st = Date.now() - selT0.current;
    const from = sp ?? z;
    const wave = from ? (st >= WAVE[1] ? 1e4 : from.r * 1.05 * easeOut(phase(st, WAVE))) : 0;
    if (from) gl.uniform3f(u.uSelC, from.c[0], from.c[1], from.c[2]);
    gl.uniform1f(u.uWave, wave);
    const pl = pulse.current;
    const pu = pl ? (Date.now() - pl.t0) / PULSE_MS : -1;
    if (pl && pu >= 0 && pu < 1) {
      gl.uniform3f(u.uPulseC, pl.c[0], pl.c[1], pl.c[2]);
      gl.uniform1f(u.uPulseR, PULSE_R * easeOut(pu));
      gl.uniform1f(u.uPulseA, Math.pow(1 - pu, 1.1));
      const g = rgb(C.live);
      gl.uniform3f(u.uPulseCol, g[0], g[1], g[2]);
    } else gl.uniform1f(u.uPulseA, 0);
    for (const p of MESH.parts) {
      const l = lk[p.mi];
      gl.uniform3f(u.uCol, l.col[0], l.col[1], l.col[2]);
      gl.uniform1f(u.uAmt, l.amt);
      gl.uniform1f(u.uMode, l.mode);
      gl.uniform1f(u.uGlow, l.glow);
      gl.uniform2f(u.uPhase, l.phase[0], l.phase[1]);
      gl.vertexAttribPointer(S.aPos, 3, gl.FLOAT, false, 24, p.vStart * 24);
      gl.vertexAttribPointer(S.aNrm, 3, gl.FLOAT, false, 24, p.vStart * 24 + 12);
      gl.drawElements(gl.TRIANGLES, p.iCount, gl.UNSIGNED_SHORT, p.iStart * 2);
    }
    // Scenery: one faint ink, receding further while a zone is framed.
    const ink = rgb(C.ink);
    gl.uniform3f(u.uCol, ink[0], ink[1], ink[2]);
    gl.uniform1f(u.uAmt, z ? 0.1 : 0.42);
    gl.uniform1f(u.uMode, 0);
    gl.uniform1f(u.uGlow, 0);
    gl.uniform2f(u.uPhase, ZONE_PHASE[0], ZONE_PHASE[1]);
    for (const p of MESH.decor) {
      gl.vertexAttribPointer(S.aPos, 3, gl.FLOAT, false, 24, p.vStart * 24);
      gl.vertexAttribPointer(S.aNrm, 3, gl.FLOAT, false, 24, p.vStart * 24 + 12);
      gl.drawElements(gl.TRIANGLES, p.iCount, gl.UNSIGNED_SHORT, p.iStart * 2);
    }
    gl.flush();
    gl.endFrameEXP?.();
  };

  const onContextCreate = (gl: ExpoWebGLRenderingContext) => {
    glRef.current = setupGL(gl);
    draw();
    kick();
  };

  // ── animation loop: momentum + tweens + selection + idle turn ─────────
  const kick = () => {
    if (raf.current != null) return;
    last.current = Date.now();
    raf.current = requestAnimationFrame(step);
  };
  const step = () => {
    raf.current = null;
    if (AppState.currentState !== 'active') return; // picked up again on return
    const now = Date.now();
    const dt = Math.min(0.05, (now - last.current) / 1000);
    last.current = now;
    let more = false;
    const c = cam.current;
    if (Math.abs(spin.current) > 0.05) {
      c.yaw += spin.current * dt;
      spin.current *= Math.pow(0.04, dt); // ~96% of the speed gone after 1s
      more = true;
    } else {
      if (spin.current) idleDir.current = Math.sign(spin.current); // keep turning the way it was flicked
      spin.current = 0;
    }
    const tw = tween.current;
    if (tw) {
      const u = clamp01((now - tw.t0) / tw.dur);
      const e = easeInOut(u);
      c.yaw = tw.from.yaw + (tw.to.yaw - tw.from.yaw) * e;
      // Zoom moves in log space so zooming in and out feel the same speed.
      c.zoom = tw.from.zoom * Math.pow(tw.to.zoom / tw.from.zoom, e);
      c.x = tw.from.x + (tw.to.x - tw.from.x) * e;
      c.y = tw.from.y + (tw.to.y - tw.from.y) * e;
      if (u >= 1) tween.current = null; else more = true;
    }
    // Left alone at the whole figure, it turns slowly, easing in.
    const L = live.current;
    const touching = held.current && now - lastInput.current < 10_000;
    if (L.active && !L.zv && !tw && !spin.current && c.zoom <= 1.02 && !touching) {
      c.yaw += IDLE_SPIN * idleDir.current * clamp01((now - lastInput.current - IDLE_DELAY) / 1200) * dt;
      more = true;
    }
    if ((L.selPart || L.zv) && now - selT0.current < FILL[1] + 40) more = true; // ring / fill / callout still playing
    if (L.active && L.glowing) more = true; // the worn-muscle glow breathes
    if (pulse.current && now - pulse.current.t0 < PULSE_MS + 50) more = true; // a ripple is running (or about to)
    settle();
    draw();
    if (live.current.selPart || live.current.zv) setFrame(f => f + 1); // the callout follows the muscle / zone
    else placeHud();
    if (more) { last.current = now; raf.current = requestAnimationFrame(step); }
  };
  useEffect(() => () => { if (raf.current != null) cancelAnimationFrame(raf.current); }, []);

  // Colours / size changed → redraw once.
  useEffect(() => { draw(); placeHud(); if (glowing) kick(); }, [look, W, H]);
  // A readout moved or re-pointed, or a point picked → re-place the lines.
  const pinSig = pins.map(p => `${p.key}@${p.slot}:${p.at.join(',')}`).join('|') + (edit?.marker ? `|m:${edit.marker.at.join(',')}` : '');
  useEffect(() => { placeHud(); }, [pinSig]);

  // Moves the readouts' lines to where their points now are on screen —
  // only when one has moved, so a still figure re-renders nothing.
  const placeHud = () => {
    if (!hudSet.current) return;
    const R = rotation(cam.current.yaw);
    const next: Record<string, HudPt> = {};
    let moved = !hudLast.current;
    const { pins: ps, edit: ed } = props.current;
    const spots: [string, Spot][] = ps.map(p => [p.key, p]);
    if (ed?.marker) spots.push(['marker', ed.marker]);
    for (const [key, { at, n }] of spots) {
      const p = project(at);
      const a = facingOf(R, n);
      next[key] = { x: p.x, y: p.y, a };
      const was = hudLast.current?.[key];
      if (!was || Math.abs(was.x - p.x) > 0.5 || Math.abs(was.y - p.y) > 0.5 || Math.abs(was.a - a) > 0.02) moved = true;
    }
    if (hudLast.current && Object.keys(hudLast.current).length !== spots.length) moved = true;
    if (!moved) return;
    hudLast.current = next;
    hudSet.current(next);
  };

  // Back in the app → redraw and carry on where the loop stopped.
  useEffect(() => {
    const sub = AppState.addEventListener('change', s => { if (s === 'active') { draw(); kick(); } });
    return () => sub.remove();
  }, []);

  // Back on the tab → pick the idle turn up again.
  useEffect(() => { if (active) { lastInput.current = Date.now(); kick(); } }, [active]);

  const fly = (to: Cam, dur = FLY_MS) => {
    const c = cam.current;
    tween.current = { from: { ...c }, to: { ...to, yaw: c.yaw + wrapAngle(to.yaw - c.yaw) }, t0: Date.now(), dur };
    spin.current = 0;
    lastInput.current = Date.now();
    kick();
  };

  // After any camera change: report front/back and zoomed state.
  const settle = () => {
    const c = cam.current;
    const f: Facing = Math.cos(c.yaw) >= 0 ? 'front' : 'back';
    if (f !== facingRef.current) { facingRef.current = f; props.current.onFacing(f); }
    const z = c.zoom > 1.02;
    if (z !== zoomedRef.current) { zoomedRef.current = z; setZoomed(z); props.current.onZoomed(z); }
  };

  // A readout tapped: once its line reaches the body, ripple from its point.
  useEffect(() => {
    const p = lit ? props.current.pins.find(x => x.key === lit.key) : null;
    pulse.current = p && lit ? { c: p.at, t0: lit.t0 + LINE_MS } : null;
    if (pulse.current) kick();
  }, [lit?.t0]);

  // Arranging the readouts: face front at the whole figure, so points are easy to tap.
  useEffect(() => { if (edit) fly({ ...HOME }, 600); }, [!!edit]);

  // FRONT / BACK from the header turns the figure.
  useEffect(() => {
    if (facing === facingRef.current) return;
    facingRef.current = facing;
    const c = cam.current;
    fly({ ...(tween.current?.to ?? c), yaw: facing === 'front' ? 0 : Math.PI }, 600);
  }, [facing]);

  // Framing a zone or picking a muscle (tap or TARGETS list) flies to it;
  // clearing both backs out to the whole figure.
  const prevZone = useRef<string | null>(null);
  useEffect(() => {
    const had = prevZone.current;
    prevZone.current = zone;
    selT0.current = Date.now();
    anchorAt.current = 0;
    if (selected) hint.current = selected;
    if (!selPart) {
      if (zv) {
        const hp = hint.current ? MESH.byMuscle[MUSCLE_INDEX[hint.current]] : undefined;
        fly(frameZone(zv, zv.yaw ?? hp?.yaw ?? cam.current.yaw));
      } else if (had) fly({ ...HOME, yaw: cam.current.yaw }, 620);
      else draw();
      return;
    }
    // Turn to the side that shows most of it, zoom until it spans about a
    // third of the stage, and park its centre at FOCUS — clear of the panel.
    const { yaw, c: ctr, r } = selPart;
    const zoom = Math.min(2.6, Math.max(1.6, 34 / Math.max(6, r)));
    const R = rotation(yaw);
    const e: V3 = [dot3(R[0], ctr), dot3(R[1], ctr), dot3(R[2], ctr)];
    const kz = base * zoom * (DIST / (DIST - e[2]));
    fly({ yaw, zoom, x: e[0] + (W * (0.5 - FOCUS_X)) / kz, y: e[1] - (H * (0.5 - FOCUS)) / kz });
  }, [zone, selected]);

  // Fit a zone's box into the stage, above its panel and left of its callout.
  const frameZone = (z: ZoneView, yaw: number): Cam => {
    const R = rotation(yaw);
    let x0 = 1e9, x1 = -1e9, y0 = 1e9, y1 = -1e9;
    for (let i = 0; i < 8; i++) {
      const p: V3 = [i & 1 ? z.hi[0] : z.lo[0], i & 2 ? z.hi[1] : z.lo[1], i & 4 ? z.hi[2] : z.lo[2]];
      const ex = dot3(R[0], p), ey = dot3(R[1], p);
      x0 = Math.min(x0, ex); x1 = Math.max(x1, ex); y0 = Math.min(y0, ey); y1 = Math.max(y1, ey);
    }
    const zoom = Math.min(3, Math.max(1, Math.min((W * 0.72) / (x1 - x0), (H * 0.6) / (y1 - y0)) / base));
    const k = base * zoom;
    return { yaw, zoom, x: (x0 + x1) / 2 + (W * (0.5 - FOCUS_X)) / k, y: (y0 + y1) / 2 - (H * (0.5 - ZONE_FOCUS)) / k };
  };

  // ── screen ↔ world ─────────────────────────────────────────────────────
  const project = (p: V3) => {
    const c = cam.current;
    const R = rotation(c.yaw);
    const k = base * c.zoom;
    const pp = DIST / (DIST - dot3(R[2], p));
    return { x: W / 2 + (dot3(R[0], p) - c.x) * k * pp, y: H / 2 - (dot3(R[1], p) - c.y) * k * pp };
  };
  const rayAt = (sx: number, sy: number): { o: V3; d: V3 } => {
    const c = cam.current;
    const R = rotation(c.yaw);
    const k = base * c.zoom;
    const toWorld = (v: V3): V3 => [0, 1, 2].map(i => R[0][i] * v[0] + R[1][i] * v[1] + R[2][i] * v[2]) as V3;
    return { o: toWorld([c.x, c.y, DIST]), d: toWorld([(sx - W / 2) / (k * DIST), -(sy - H / 2) / (k * DIST), -1]) };
  };
  const pick = (x: number, y: number): string | null => {
    const { o, d } = rayAt(x, y);
    const hit = raycast(MESH, o, d);
    return hit && hit.mi >= 0 ? MUSCLES[hit.mi].id : null;
  };
  const pickRef = useRef(pick);
  pickRef.current = pick;
  // Edit mode: the exact point under the finger, scenery (head, feet) included.
  const spotAt = (x: number, y: number) => {
    const { o, d } = rayAt(x, y);
    const hit = raycastHit(MESH, o, d);
    if (!hit) return null;
    const r1 = (v: V3) => v.map(q => Math.round(q * 10) / 10) as V3;
    return { at: r1(hit.at), n: r1(hit.n), muscle: hit.part.mi >= 0 ? MUSCLES[hit.part.mi].id : null };
  };
  const spotRef = useRef(spotAt);
  spotRef.current = spotAt;

  // ── gestures ───────────────────────────────────────────────────────────
  const gesture = useMemo(() => {
    const start = { yaw: 0, zoom: 1, x: 0, y: 0 };
    const grab = () => {
      tween.current = null; spin.current = 0;
      Object.assign(start, cam.current);
    };
    // A finger on the figure holds the idle turn. A watcher alongside the
    // real gestures, since a pan that loses to a tap never hears the lift.
    const hold = (on: boolean) => {
      held.current = on;
      lastInput.current = Date.now();
      if (!on) kick();
    };
    const watch = Gesture.Manual()
      .onTouchesDown(() => hold(true))
      .onTouchesUp(() => hold(false))
      .onTouchesCancelled(() => hold(false));
    const clampPan = () => {
      const c = cam.current;
      // Keep the figure on screen; at 1× it snaps back to centre.
      const lim = 1 - 1 / c.zoom;
      c.y = Math.min(CENTER_Y + lim * (FIG_H / 2 + 40), Math.max(CENTER_Y - lim * (FIG_H / 2 + 40), c.y));
      c.x = Math.min(lim * 60, Math.max(-lim * 60, c.x));
    };

    const spinPan = Gesture.Pan()
      .maxPointers(1)
      .activeOffsetX([-6, 6])
      .onStart(grab)
      .onUpdate(e => {
        const c = cam.current;
        c.yaw = start.yaw + e.translationX * SPIN;
        if (c.zoom > 1.02) { c.y = start.y + e.translationY / (base * c.zoom); clampPan(); }
        kick();
      })
      .onEnd(e => { spin.current = Math.max(-12, Math.min(12, e.velocityX * SPIN)); kick(); });
    if (!zoomed) spinPan.failOffsetY([-12, 12]);
    else spinPan.activeOffsetY([-6, 6]);

    const pinch = Gesture.Pinch()
      .onStart(grab)
      .onUpdate(e => {
        const c = cam.current;
        const k0 = base * c.zoom;
        // Zoom about the fingers: the world point under them stays put.
        const wx = c.x + (e.focalX - W / 2) / k0, wy = c.y - (e.focalY - H / 2) / k0;
        c.zoom = Math.min(MAX_ZOOM, Math.max(1, start.zoom * e.scale));
        const k1 = base * c.zoom;
        c.x = wx - (e.focalX - W / 2) / k1; c.y = wy + (e.focalY - H / 2) / k1;
        clampPan();
        kick();
      })
      .onEnd(() => {
        if (cam.current.zoom < 1.05) fly({ ...cam.current, zoom: 1, x: 0, y: CENTER_Y }, 300);
      });

    const twoPan = Gesture.Pan()
      .minPointers(2)
      .onStart(grab)
      .onUpdate(e => {
        const c = cam.current;
        c.x = start.x - e.translationX / (base * c.zoom);
        c.y = start.y + e.translationY / (base * c.zoom);
        clampPan();
        kick();
      });

    const tap = Gesture.Tap()
      .maxDuration(300)
      .maxDistance(10)
      .onEnd((e, ok) => {
        if (!ok) return;
        const ed = props.current.edit;
        if (ed) {
          const hit = spotRef.current(e.x, e.y);
          if (hit) { Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Light); ed.onSpot(hit); }
          return;
        }
        const id = pickRef.current(e.x, e.y);
        if (id) { Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Light); hint.current = id; }
        props.current.onPick(id);
      });

    return Gesture.Simultaneous(watch, Gesture.Race(Gesture.Simultaneous(pinch, twoPan), spinPan, tap));
  }, [zoomed, W, H, base]);

  const reset = () => fly({ ...HOME, yaw: cam.current.yaw }, 620);

  // ── callout ────────────────────────────────────────────────────────────
  // For a picked muscle, or a framed zone (its name, and the average
  // battery of its muscles).
  const muscle = selected ? MUSCLES[MUSCLE_INDEX[selected]] : null;
  const zoneDef = !muscle && zone ? ZONE_BY_ID[zone] : null;
  const title = muscle?.name ?? zoneDef?.name ?? '';
  const mark = selected ? map.marks[selected] : undefined;
  const cat = mark ? catById[mark.category] : undefined;
  const tag = cat ? cat.name : muscle ? muscle.group : zoneDef ? `AVERAGE · ${zoneDef.muscles.length} MUSCLES` : '';
  // Only while you can see it — a leader into the far side of the body
  // points at nothing. Tries the anchor that worked last frame first.
  let co: { x: number; y: number } | null = null;
  const anchors = selPart ? ANCHORS.get(selPart)! : zoneDef && zv ? zv.anchors : null;
  if (anchors) {
    const ok = (h: Part | null) => !!h && (selPart ? h === selPart : zv!.members.has(h.mi));
    const tries = [anchorAt.current, ...anchors.keys()].filter((i, n, a) => i < anchors.length && a.indexOf(i) === n).slice(0, 12);
    for (const i of tries) {
      const at = project(anchors[i]);
      if (at.x < 0 || at.x > W || at.y < 0 || at.y > H) continue;
      const { o, d } = rayAt(at.x, at.y);
      if (ok(raycast(MESH, o, d))) { co = at; anchorAt.current = i; break; }
    }
  }
  const st = Date.now() - selT0.current;
  const typed = title.slice(0, Math.ceil(title.length * phase(st, TYPE)));
  const showLabel = !!(co && title && st >= TYPE[0]);
  const labelIn = easeOut(phase(st, [TYPE[0], TYPE[0] + 220]));
  const charge = battery != null ? Math.round(battery * easeOut(phase(st, FILL))) : null;
  const labelLeft = co ? co.x > W * 0.6 : false; // right of the muscle unless that's off-stage
  const LABEL_W = 156;
  const LABEL_H = battery != null ? 64 : 42;
  const ly = co ? Math.min(H - LABEL_H - 6, Math.max(6, co.y - LABEL_H / 2)) : 0;
  const lx = labelLeft ? 10 : W - LABEL_W - 10;
  const ex = labelLeft ? lx + LABEL_W : lx, ey = ly + 20;

  return (
    <View style={{ width: W, height: H }}>
      <GestureDetector gesture={gesture}>
        <View style={StyleSheet.absoluteFill} collapsable={false}>
          <GLView style={{ width: W, height: H }} onContextCreate={onContextCreate} msaaSamples={4} />
        </View>
      </GestureDetector>

      {co && showLabel && (
        // The View, not the Svg, takes pointerEvents: an Svg root on iOS
        // still swallows touches, which locked the figure on one muscle.
        <View style={StyleSheet.absoluteFill} pointerEvents="none">
          <Svg width={W} height={H}>
            <Polyline
              points={`${co.x},${co.y} ${co.x + ((labelLeft ? ex + 8 : ex - 8) - co.x) * labelIn},${co.y + (ey - co.y) * labelIn}${labelIn >= 1 ? ` ${ex},${ey}` : ''}`}
              fill="none" stroke={C.hot} strokeWidth={1} strokeOpacity={0.8}
            />
            <Rect x={co.x - 3} y={co.y - 3} width={6} height={6} fill={C.hot} />
          </Svg>
        </View>
      )}

      {showLabel && (
        <View
          style={[styles.label, { left: lx, top: ly, width: LABEL_W, height: LABEL_H, opacity: labelIn, transform: [{ translateX: (labelLeft ? -8 : 8) * (1 - labelIn) }] }]}
          pointerEvents="none"
        >
          <View style={styles.labelTag}>
            <View style={[styles.labelSwatch, { backgroundColor: cat ? TONE[cat.tone] : C.faint }]} />
            <Text style={[styles.labelCat, cat && { color: TONE[cat.tone] }]} numberOfLines={1}>{tag}</Text>
          </View>
          <Text style={styles.labelName} numberOfLines={1} adjustsFontSizeToFit minimumFontScale={0.7}>{typed}</Text>
          {charge != null && battery != null && <Battery pct={charge} tone={batteryTone(battery)} />}
        </View>
      )}

      {!zone && !zoomed && (pins.length > 0 || !!edit) && (
        <Hud W={W} H={H} pins={pins} edit={edit} lit={lit} bind={hudSet} onBind={() => { hudLast.current = null; placeHud(); }} />
      )}

      {zoomed && (
        <Pressable onPress={zone ? onHome : reset} style={styles.reset} hitSlop={8} accessibilityLabel="Reset view">
          <MaterialCommunityIcons name="fit-to-screen-outline" size={18} color={C.ink} />
        </Pressable>
      )}
    </View>
  );
}

/** The readouts in their slots with their leader lines, and in edit mode
 *  the empty slots and the picked point. Lines are re-placed by the stage
 *  through `bind` as the figure turns, without re-rendering the stage. */
function Hud({ W, H, pins, edit, lit, bind, onBind }: {
  W: number; H: number; pins: StagePin[]; edit: StageEdit | null; lit: { key: string; t0: number } | null;
  bind: MutableRefObject<((p: Record<string, HudPt>) => void) | null>; onBind: () => void;
}) {
  const [pts, setPts] = useState<Record<string, HudPt> | null>(null);
  // The tapped readout's line: re-rendered each frame while it draws out and fades.
  const [, setTick] = useState(0);
  useEffect(() => {
    if (!lit) return;
    let f: number | null = null;
    const run = () => {
      setTick(t => t + 1);
      f = Date.now() - lit.t0 < LIT_MS + FADE_MS ? requestAnimationFrame(run) : null;
    };
    f = requestAnimationFrame(run);
    return () => { if (f != null) cancelAnimationFrame(f); };
  }, [lit?.t0]);
  const age = lit ? Date.now() - lit.t0 : Infinity;
  const draw = clamp01(age / LINE_MS);
  const fadeOut = 1 - clamp01((age - LIT_MS) / FADE_MS);
  useEffect(() => {
    bind.current = setPts;
    onBind();
    return () => { bind.current = null; };
  }, []);

  // Each line leaves from the readout's inner edge, so it needs its width.
  const [wide, setWide] = useState<Record<string, number>>({});
  const edge = (p: StagePin) => {
    const left = slotSide(p.slot) === 'l';
    const w = (wide[p.key] ?? HUD_W) + 2;
    return { x: left ? SLOT_GAP + w : W - SLOT_GAP - w, y: slotTop(p.slot) * H + 11, dx: left ? 8 : -8 };
  };
  const maxW = Math.round(W * 0.3);
  const m = edit?.marker ? pts?.marker : null;
  return (
    <>
      {pts && (
        <View style={StyleSheet.absoluteFill} pointerEvents="none">
          <Svg width={W} height={H}>
            {pins.map(p => {
              const q = pts[p.key];
              const isLit = !edit && lit?.key === p.key && fadeOut > 0;
              if (!q || (!edit && !isLit)) return null;
              const e = edge(p);
              // Lit: the line draws out from the readout, then reaches the point.
              const k = isLit ? draw : 1;
              const sx = e.x + e.dx, sy = e.y;
              const line = `${e.x},${e.y} ${sx},${sy} ${sx + (q.x - sx) * k},${sy + (q.y - sy) * k}`;
              const op = (isLit ? 0.9 * fadeOut : p.on ? 0.85 : 0.45) * q.a;
              // A dark casing, so the line still reads across the lit figure.
              return [
                <Polyline key={`${p.key}-c`} points={line} fill="none" stroke={C.bg} strokeWidth={3} strokeOpacity={0.7 * op} />,
                <Polyline key={p.key} points={line} fill="none" stroke={C.hot} strokeWidth={p.on || isLit ? 1.25 : 1} strokeOpacity={op} />,
                (k >= 1 ? <Rect key={`${p.key}-p`} x={q.x - 2.5} y={q.y - 2.5} width={5} height={5} fill={C.hot} fillOpacity={op} /> : null),
              ];
            })}
            {m && [
              <Rect key="m" x={m.x - 6} y={m.y - 6} width={12} height={12} fill="none" stroke={C.hot} strokeWidth={1.5} />,
              <Rect key="m2" x={m.x - 1.5} y={m.y - 1.5} width={3} height={3} fill={C.hot} />,
              <Polyline key="m3" points={`${m.x - 14},${m.y} ${m.x - 8},${m.y}`} stroke={C.hot} strokeWidth={1} />,
              <Polyline key="m4" points={`${m.x + 8},${m.y} ${m.x + 14},${m.y}`} stroke={C.hot} strokeWidth={1} />,
              <Polyline key="m5" points={`${m.x},${m.y - 14} ${m.x},${m.y - 8}`} stroke={C.hot} strokeWidth={1} />,
              <Polyline key="m6" points={`${m.x},${m.y + 8} ${m.x},${m.y + 14}`} stroke={C.hot} strokeWidth={1} />,
            ]}
          </Svg>
        </View>
      )}
      {edit?.free.map(slot => {
        const left = slotSide(slot) === 'l';
        const on = edit.slotOn === slot;
        return (
          <Pressable key={`free${slot}`} onPress={() => edit.onSlot(slot)} hitSlop={4} accessibilityLabel={`Empty slot ${slot + 1}`}
            style={[styles.ghost, { top: slotTop(slot) * H }, left ? { left: SLOT_GAP } : { right: SLOT_GAP }, on && styles.ghostOn]}>
            <Text style={[styles.ghostPlus, on && { color: C.onHot }]}>+</Text>
            <Text style={[styles.ghostText, on && { color: C.onHot }]}>{`SLOT ${String(slot + 1).padStart(2, '0')}`}</Text>
          </Pressable>
        );
      })}
      {pins.map(p => {
        const left = slotSide(p.slot) === 'l';
        return (
          <Pressable key={p.key} onPress={p.onPress} onLongPress={p.onLongPress} delayLongPress={380} hitSlop={6}
            onLayout={e => { const w = Math.round(e.nativeEvent.layout.width); setWide(o => (o[p.key] === w ? o : { ...o, [p.key]: w })); }}
            style={[
              styles.hud, { top: slotTop(p.slot) * H, maxWidth: maxW },
              left ? { left: SLOT_GAP } : { right: SLOT_GAP, alignItems: 'flex-end' },
              edit && { borderColor: p.on ? p.tone : `${p.tone}55`, borderStyle: p.on ? 'solid' : 'dashed' },
              p.on && { backgroundColor: `${p.tone}1A` },
            ]}>
            {p.node}
          </Pressable>
        );
      })}
    </>
  );
}

/** Ten-cell battery, filled to `pct`, with the number beside it. `tone`
 *  overrides the colour (the callout fills up in its final colour). */
export function Battery({ pct, tone = batteryTone(pct), cells = 10, cellW = 7, cellH = 11, showPct = true }: {
  pct: number; tone?: string; cells?: number; cellW?: number; cellH?: number; showPct?: boolean;
}) {
  const full = Math.round((pct / 100) * cells);
  return (
    <View style={styles.battery}>
      <View style={[styles.batteryBody, { height: cellH + 6 }]}>
        {Array.from({ length: cells }, (_, i) => (
          <View key={i} style={{ width: cellW, height: cellH, backgroundColor: i < full ? tone : C.ghost }} />
        ))}
      </View>
      <View style={[styles.batteryNub, { height: cellH * 0.5 }]} />
      {showPct && <Text style={[styles.batteryPct, numFace(`${pct}%`, 13), { color: tone }]}>{`${pct}%`}</Text>}
    </View>
  );
}

const styles = StyleSheet.create({
  label: {
    position: 'absolute', paddingHorizontal: 9, justifyContent: 'center',
    backgroundColor: C.surface, borderWidth: 1, borderColor: C.hot, borderRadius: 10,
  },
  labelTag: { flexDirection: 'row', alignItems: 'center', gap: 5 },
  labelSwatch: { width: 5, height: 5 },
  labelCat: { fontFamily: F.dot, fontSize: 8, color: C.dim, letterSpacing: 1.5, flexShrink: 1 },
  labelName: { fontFamily: F.dot, fontSize: 11, color: C.ink, letterSpacing: 0.5, marginTop: 3, minHeight: 14 },
  battery: { flexDirection: 'row', alignItems: 'center', marginTop: 5 },
  batteryBody: { flexDirection: 'row', alignItems: 'center', gap: 2, paddingHorizontal: 2, borderWidth: 1, borderColor: C.lineHi, borderRadius: 3 },
  batteryNub: { width: 2, backgroundColor: C.lineHi, marginLeft: 1, borderTopRightRadius: 1, borderBottomRightRadius: 1 },
  batteryPct: { marginLeft: 7 },
  hud: { position: 'absolute', padding: 4, borderWidth: 1, borderColor: 'transparent', borderRadius: 8 },
  ghost: {
    position: 'absolute', width: 74, height: 46, borderWidth: 1, borderStyle: 'dashed', borderColor: C.lineHi, borderRadius: 8,
    alignItems: 'center', justifyContent: 'center', gap: 2,
  },
  ghostOn: { backgroundColor: C.hot, borderColor: C.hot, borderStyle: 'solid' },
  ghostPlus: { fontFamily: F.dot, fontSize: 14, color: C.dim },
  ghostText: { fontFamily: F.dot, fontSize: 7, color: C.faint, letterSpacing: 1.5 },
  reset: {
    position: 'absolute', right: 12, bottom: 12, width: 40, height: 40, borderRadius: 20,
    borderWidth: 1, borderColor: C.lineHi, backgroundColor: C.surface, alignItems: 'center', justifyContent: 'center',
  },
});
