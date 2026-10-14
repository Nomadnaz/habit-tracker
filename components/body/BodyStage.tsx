// The BODY tab's stage: the anatomical figure (lib/body-mesh.ts) drawn on
// the GPU, which you can turn and zoom, where every muscle is tappable.
//   drag sideways → spin (with momentum)      pinch → zoom (1–4×)
//   two fingers   → pan while zoomed          drag up/down while zoomed → pan
//   tap a muscle  → fly to it                 tap empty space → back out
// Selecting a muscle (tap, or from the TARGETS list) eases the camera round
// and in until it fills the top of the stage, fills it in solid from its
// centre outwards, then types its name into a callout and charges its
// recovery battery.
// Look: muscles are drawn as a dot-matrix halftone — a fixed screen grid of
// dots sized by how much light the surface catches, like the puck's
// display — with a faint rim on the edges. The selected muscle is drawn
// solid and lit, so its real shape reads at a glance. Marked muscles take
// their category's colour.
// Rendering is plain WebGL through expo-gl: one shader, one draw per
// muscle, redrawn only when something changes. React only re-renders for
// the callout.
import { useEffect, useMemo, useRef, useState } from 'react';
import { View, Text, StyleSheet, Pressable } from 'react-native';
import Svg, { Polyline, Rect } from 'react-native-svg';
import { GLView, type ExpoWebGLRenderingContext } from 'expo-gl';
import { Gesture, GestureDetector } from 'react-native-gesture-handler';
import * as Haptics from 'expo-haptics';
import { MaterialCommunityIcons } from '@expo/vector-icons';
import { C, F, numFace } from '@/lib/theme';
import { MUSCLES, MUSCLE_INDEX, decodeBodyMesh, raycast, type Part } from '@/lib/body-mesh';
import type { BodyMap, Tone } from '@/lib/body-map';

export const TONE: Record<Tone, string> = { hot: C.hot, signal: C.signal, live: C.live, dim: C.dim, alert: C.alert };

export type Facing = 'front' | 'back';

/** Battery colour for a recovery percentage. */
export const batteryTone = (pct: number) => (pct >= 80 ? C.live : pct >= 40 ? C.ink : C.alert);

const MESH = decodeBodyMesh();
// Golden-ratio steps, so neighbouring muscles land on well-separated shifts.
const PHASE = MUSCLES.map((_, i) => [(i * 0.618034) % 1, (i * 0.381966 + 0.5) % 1] as const);

const PITCH = 0.1;          // camera looks slightly down, rad
const DIST = 520;           // camera distance, cm
const CENTER_Y = 90;        // world height at the middle of the stage at 1×
const FIG_H = 186;          // world height that fills the stage at 1×
const MAX_ZOOM = 4;
const SPIN = 0.011;         // rad per px of drag
const FOCUS = 0.36;         // a selected muscle settles this far down the stage — clear of the panel
const FOCUS_X = 0.4;        // …and this far across, leaving the right for its callout
const CELL = 4.2;           // halftone cell, pt
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

interface Props {
  width: number;
  height: number;
  map: BodyMap;
  facing: Facing;
  selected: string | null;
  filter: string | null;
  /** Recovery 0–100 of the selected muscle; null when it has none (joints, head). */
  battery: number | null;
  onSelect: (id: string | null) => void;
  onFacing: (f: Facing) => void;
  /** True while zoomed in, so the page can stop scrolling under the finger. */
  onZoomed: (zoomed: boolean) => void;
}

const wrapAngle = (a: number) => Math.atan2(Math.sin(a), Math.cos(a));
const clamp01 = (v: number) => Math.min(1, Math.max(0, v));
const easeInOut = (u: number) => (u < 0.5 ? 4 * u * u * u : 1 - Math.pow(-2 * u + 2, 3) / 2);
const easeOut = (u: number) => 1 - Math.pow(1 - u, 3);
const phase = (t: number, [a, b]: readonly [number, number]) => clamp01((t - a) / (b - a));
const rgb = (hex: string): V3 => [1, 3, 5].map(i => parseInt(hex.slice(i, i + 2), 16) / 255) as V3;

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
uniform float uSel;    // 1 on the selected muscle
uniform vec3 uSelC;    // its centre, cm
uniform float uWave;   // solid fill radius from that centre, cm
uniform float uCell;   // halftone cell, device px
uniform vec2 uPhase;   // per-muscle shift of the dot grid, in cells
uniform vec3 uLight;
void main() {
  vec3 n = normalize(vN);
  if (!gl_FrontFacing) n = -n;
  float diff = max(dot(n, uLight), 0.0);
  float rim = pow(1.0 - max(n.z, 0.0), 2.5);
  float lum = 0.06 + 0.94 * diff;
  // Each muscle's grid is shifted a little, so where two meet the dots
  // fall out of step and the boundary shows as a seam.
  vec2 g = fract(gl_FragCoord.xy / uCell + uPhase) - 0.5;
  float r = 0.48 * sqrt(lum);
  float dots = 1.0 - smoothstep(r - 0.1, r + 0.1, length(g));
  vec3 col = vec3(0.025) + uCol * (dots * uAmt + rim * 0.2 * uAmt);
  if (uSel > 0.5) {
    float d = distance(vW, uSelC);
    float lit = 1.0 - smoothstep(uWave - 0.8, uWave, d);
    vec3 solid = vec3(0.3) + vec3(0.7) * diff + vec3(0.3) * rim;
    col = mix(col, solid, lit);
    col += vec3(1.0 - smoothstep(0.0, 1.4, abs(d - uWave))) * step(uWave, 500.0);
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
  for (const name of ['uMVP', 'uRot', 'uCol', 'uAmt', 'uSel', 'uSelC', 'uWave', 'uCell', 'uPhase', 'uLight']) u[name] = gl.getUniformLocation(prog, name);
  gl.enable(gl.DEPTH_TEST);
  gl.clearColor(0, 0, 0, 1);
  return { gl, aPos, aNrm, u };
}

export function BodyStage({ width: W, height: H, map, facing, selected, filter, battery, onSelect, onFacing, onZoomed }: Props) {
  const cam = useRef<Cam>({ ...HOME });
  const tween = useRef<Tween | null>(null);
  const spin = useRef(0);               // rad/s of momentum
  const raf = useRef<number | null>(null);
  const last = useRef(0);
  const glRef = useRef<GLState | null>(null);
  const selT0 = useRef(0);
  const [, setFrame] = useState(0);     // callout re-render
  const [zoomed, setZoomed] = useState(false);
  const facingRef = useRef<Facing>(facing);
  const zoomedRef = useRef(false);

  // Latest props for the gesture callbacks (they're built once).
  const props = useRef({ onSelect, onFacing, onZoomed });
  props.current = { onSelect, onFacing, onZoomed };

  const base = (H * 0.94) / FIG_H; // px per cm at 1×
  const selPart: Part | undefined = selected ? MESH.byMuscle[MUSCLE_INDEX[selected]] : undefined;

  // Per-muscle dot colour and strength.
  const catById = useMemo(() => Object.fromEntries(map.categories.map(c => [c.id, c])), [map.categories]);
  const look = useMemo(() => {
    const ink = rgb(C.ink);
    return MUSCLES.map(m => {
      const mk = map.marks[m.id];
      const cat = mk && (!filter || mk.category === filter) ? catById[mk.category] : undefined;
      return cat ? { col: rgb(TONE[cat.tone]), amt: 1 } : { col: ink, amt: selected ? 0.42 : 0.8 };
    });
  }, [map.marks, filter, catById, selected]);

  // Everything the draw needs that React owns, for the animation loop.
  const live = useRef({ look, selPart, W, H, base });
  live.current = { look, selPart, W, H, base };

  // ── drawing ────────────────────────────────────────────────────────────
  const draw = () => {
    const S = glRef.current;
    if (!S) return;
    const { gl, u } = S;
    const { look: lk, selPart: sp, W: w, H: h, base: b } = live.current;
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
    const st = Date.now() - selT0.current;
    const wave = sp ? (st >= WAVE[1] ? 1e4 : sp.r * 1.05 * easeOut(phase(st, WAVE))) : 0;
    if (sp) gl.uniform3f(u.uSelC, sp.c[0], sp.c[1], sp.c[2]);
    gl.uniform1f(u.uWave, wave);
    for (const p of MESH.parts) {
      const l = lk[p.mi];
      gl.uniform3f(u.uCol, l.col[0], l.col[1], l.col[2]);
      gl.uniform1f(u.uAmt, l.amt);
      gl.uniform1f(u.uSel, p === sp ? 1 : 0);
      gl.uniform2f(u.uPhase, PHASE[p.mi][0], PHASE[p.mi][1]);
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
  };

  // ── animation loop: momentum + tweens + selection ──────────────────────
  const kick = () => {
    if (raf.current != null) return;
    last.current = Date.now();
    raf.current = requestAnimationFrame(step);
  };
  const step = () => {
    raf.current = null;
    const now = Date.now();
    const dt = Math.min(0.05, (now - last.current) / 1000);
    last.current = now;
    let more = false;
    const c = cam.current;
    if (Math.abs(spin.current) > 0.05) {
      c.yaw += spin.current * dt;
      spin.current *= Math.pow(0.04, dt); // ~96% of the speed gone after 1s
      more = true;
    } else spin.current = 0;
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
    if (live.current.selPart && now - selT0.current < FILL[1] + 40) more = true; // fill / callout still playing
    settle();
    draw();
    if (live.current.selPart) setFrame(f => f + 1); // the callout follows the muscle
    if (more) { last.current = now; raf.current = requestAnimationFrame(step); }
  };
  useEffect(() => () => { if (raf.current != null) cancelAnimationFrame(raf.current); }, []);

  // Colours / size changed → redraw once.
  useEffect(() => { draw(); }, [look, W, H]);

  const fly = (to: Cam, dur = FLY_MS) => {
    const c = cam.current;
    tween.current = { from: { ...c }, to: { ...to, yaw: c.yaw + wrapAngle(to.yaw - c.yaw) }, t0: Date.now(), dur };
    spin.current = 0;
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

  // FRONT / BACK from the header turns the figure.
  useEffect(() => {
    if (facing === facingRef.current) return;
    facingRef.current = facing;
    const c = cam.current;
    fly({ ...(tween.current?.to ?? c), yaw: facing === 'front' ? 0 : Math.PI }, 600);
  }, [facing]);

  // Selecting a muscle (tap or TARGETS list) flies to it; clearing the
  // selection backs out to the whole figure.
  const prevSel = useRef<string | null>(null);
  useEffect(() => {
    const had = prevSel.current;
    prevSel.current = selected;
    if (!selPart) {
      if (had) fly({ ...HOME, yaw: cam.current.yaw }, 620);
      else draw();
      return;
    }
    selT0.current = Date.now();
    // Turn to the side that shows most of it, zoom until it spans about a
    // third of the stage, and park its centre at FOCUS — clear of the panel.
    const { yaw, c: ctr, r } = selPart;
    const zoom = Math.min(2.6, Math.max(1.6, 34 / Math.max(6, r)));
    const R = rotation(yaw);
    const e: V3 = [dot3(R[0], ctr), dot3(R[1], ctr), dot3(R[2], ctr)];
    const kz = base * zoom * (DIST / (DIST - e[2]));
    fly({ yaw, zoom, x: e[0] + (W * (0.5 - FOCUS_X)) / kz, y: e[1] - (H * (0.5 - FOCUS)) / kz });
  }, [selected]);

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
    return hit ? MUSCLES[hit.mi].id : null;
  };
  const pickRef = useRef(pick);
  pickRef.current = pick;

  // ── gestures ───────────────────────────────────────────────────────────
  const gesture = useMemo(() => {
    const start = { yaw: 0, zoom: 1, x: 0, y: 0 };
    const grab = () => {
      tween.current = null; spin.current = 0;
      Object.assign(start, cam.current);
    };
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
        const id = pickRef.current(e.x, e.y);
        if (id) Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Light);
        props.current.onSelect(id);
      });

    return Gesture.Race(Gesture.Simultaneous(pinch, twoPan), spinPan, tap);
  }, [zoomed, W, H, base]);

  const reset = () => fly({ ...HOME, yaw: cam.current.yaw }, 620);

  // ── callout ────────────────────────────────────────────────────────────
  const muscle = selected ? MUSCLES[MUSCLE_INDEX[selected]] : null;
  const mark = selected ? map.marks[selected] : undefined;
  const cat = mark ? catById[mark.category] : undefined;
  let co: { x: number; y: number } | null = null;
  if (selPart) {
    // Only while you can see it — a leader into the far side of the body
    // points at nothing.
    const at = project(selPart.c);
    const { o, d } = rayAt(at.x, at.y);
    if (raycast(MESH, o, d) === selPart) co = at;
  }
  const st = Date.now() - selT0.current;
  const typed = muscle ? muscle.name.slice(0, Math.ceil(muscle.name.length * phase(st, TYPE))) : '';
  const showLabel = !!(co && muscle && st >= TYPE[0]);
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
        <Svg width={W} height={H} style={StyleSheet.absoluteFill} pointerEvents="none">
          <Polyline
            points={`${co.x},${co.y} ${co.x + ((labelLeft ? ex + 8 : ex - 8) - co.x) * labelIn},${co.y + (ey - co.y) * labelIn}${labelIn >= 1 ? ` ${ex},${ey}` : ''}`}
            fill="none" stroke={C.hot} strokeWidth={1} strokeOpacity={0.8}
          />
          <Rect x={co.x - 3} y={co.y - 3} width={6} height={6} fill={C.hot} />
        </Svg>
      )}

      {showLabel && muscle && (
        <View
          style={[styles.label, { left: lx, top: ly, width: LABEL_W, height: LABEL_H, opacity: labelIn, transform: [{ translateX: (labelLeft ? -8 : 8) * (1 - labelIn) }] }]}
          pointerEvents="none"
        >
          <View style={styles.labelTag}>
            <View style={[styles.labelSwatch, { backgroundColor: cat ? TONE[cat.tone] : C.faint }]} />
            <Text style={[styles.labelCat, cat && { color: TONE[cat.tone] }]} numberOfLines={1}>{cat ? cat.name : muscle.group}</Text>
          </View>
          <Text style={styles.labelName} numberOfLines={1} adjustsFontSizeToFit minimumFontScale={0.7}>{typed}</Text>
          {charge != null && battery != null && <Battery pct={charge} tone={batteryTone(battery)} />}
        </View>
      )}

      {zoomed && (
        <Pressable onPress={selected ? () => onSelect(null) : reset} style={styles.reset} hitSlop={8} accessibilityLabel="Reset view">
          <MaterialCommunityIcons name="fit-to-screen-outline" size={18} color={C.ink} />
        </Pressable>
      )}
    </View>
  );
}

/** Ten-cell battery, filled to `pct`, with the number beside it. `tone`
 *  overrides the colour (the callout fills up in its final colour). */
export function Battery({ pct, tone = batteryTone(pct), cells = 10, cellW = 7, cellH = 11 }: {
  pct: number; tone?: string; cells?: number; cellW?: number; cellH?: number;
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
      <Text style={[styles.batteryPct, numFace(`${pct}%`, 13), { color: tone }]}>{`${pct}%`}</Text>
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
  reset: {
    position: 'absolute', right: 12, bottom: 12, width: 40, height: 40, borderRadius: 20,
    borderWidth: 1, borderColor: C.lineHi, backgroundColor: C.surface, alignItems: 'center', justifyContent: 'center',
  },
});
