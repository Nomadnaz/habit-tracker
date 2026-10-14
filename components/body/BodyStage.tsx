// The BODY tab's stage: a 3D point-cloud figure (lib/body-cloud.ts) you can
// turn and zoom, where every muscle is its own tappable region.
//   drag sideways → spin (with momentum)      pinch → zoom (1–4×)
//   two fingers   → pan while zoomed          drag up/down while zoomed → pan
//   tap a muscle  → fly to it                 tap empty space → back out
// Selecting a muscle (tap, or from the TARGETS list) eases the camera round
// and in until it fills the top of the stage, lights it up in a wave from
// its centre, then types its name into a callout and fills its recovery
// battery.
// Rendering: each frame projects the cloud in JS and draws it as a handful
// of SVG paths, one per (colour, brightness) bucket, each point a round-
// capped zero-length stroke. A coarse screen-space depth buffer dims points
// hidden behind nearer ones (an arm in front of the ribs), and points facing
// away are drawn faint, so the figure reads solid but still see-through.
// While the figure is moving only an even sample of the cloud is drawn (the
// cloud is pre-shuffled, so any prefix is one); the full cloud lands as soon
// as it's still.
import { useEffect, useMemo, useRef, useState } from 'react';
import { View, Text, StyleSheet, Pressable } from 'react-native';
import Svg, { Path, Polyline, Rect } from 'react-native-svg';
import { Gesture, GestureDetector } from 'react-native-gesture-handler';
import * as Haptics from 'expo-haptics';
import { MaterialCommunityIcons } from '@expo/vector-icons';
import { C, F, numFace } from '@/lib/theme';
import { MUSCLES, MUSCLE_INDEX, decodeCloud, muscleFrames } from '@/lib/body-cloud';
import { BODY_CLOUD } from '@/lib/body-cloud-data';
import type { BodyMap, Tone } from '@/lib/body-map';

export const TONE: Record<Tone, string> = { hot: C.hot, signal: C.signal, live: C.live, dim: C.dim, alert: C.alert };
const TONES = Object.keys(TONE) as Tone[];

export type Facing = 'front' | 'back';

/** Battery colour for a recovery percentage. */
export const batteryTone = (pct: number) => (pct >= 80 ? C.live : pct >= 40 ? C.ink : C.alert);

const CLOUD = decodeCloud(BODY_CLOUD);
const FRAMES = muscleFrames(CLOUD);

const PITCH = 0.1;          // camera looks slightly down, rad
const DIST = 520;           // perspective distance, cm
const CENTER_Y = 93;        // world height at the middle of the stage at 1×
const FIG_H = 192;          // world height that fills the stage at 1×
const MAX_ZOOM = 4;
const SPIN = 0.011;         // rad per px of drag
const LIGHT = (() => { const l = [-0.35, 0.45, 0.82]; const n = Math.hypot(...l); return l.map(v => v / n); })();
const CELL = 5;             // depth-buffer cell, px
const BUDGET = 5200;        // points drawn per frame while moving
const FOCUS = 0.36;         // a selected muscle settles this far down the stage — clear of the panel
const FOCUS_X = 0.4;        // …and this far across, leaving the right for its callout
const FLOOR = Array.from({ length: 64 }, (_, i) => {
  const a = (i / 64) * Math.PI * 2;
  return [Math.cos(a) * 30, 0, Math.sin(a) * 20] as const;
});

// Selection timeline, ms after the tap.
const FLY_MS = 760;               // camera move
const WAVE = [120, 720] as const; // highlight spreading out from the centre
const TYPE = [620, 980] as const; // name typed into the callout
const FILL = [860, 1500] as const; // battery charging up to its level

// Colour buckets: 0 idle, 1..5 a category tone, 6 selected, 7 the wave front.
const N_TONES = 8;
const LEVELS = 5; // 0 = facing away / hidden, 1–4 = lit
const IDLE_A = [0.07, 0.3, 0.5, 0.7, 0.92];
const TONE_A = [0.15, 0.55, 0.75, 0.9, 1];
const SEL_A = [0.3, 0.75, 0.9, 1, 1];

type Cam = { yaw: number; zoom: number; x: number; y: number };
const HOME: Cam = { yaw: 0, zoom: 1, x: 0, y: CENTER_Y };
type Tween = { from: Cam; to: Cam; t0: number; dur: number };
type Sel = { mi: number; t0: number; idx: Int32Array; nd: Float32Array };

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

export function BodyStage({ width: W, height: H, map, facing, selected, filter, battery, onSelect, onFacing, onZoomed }: Props) {
  const cam = useRef<Cam>({ ...HOME });
  const tween = useRef<Tween | null>(null);
  const spin = useRef(0);               // rad/s of momentum
  const raf = useRef<number | null>(null);
  const last = useRef(0);
  const moving = useRef(false);         // camera animating this frame
  const touching = useRef(false);       // a gesture is in progress
  const sel = useRef<Sel | null>(null);
  const [frame, setFrame] = useState(0);   // every animation frame (callout, battery)
  const [scene, setScene] = useState(0);   // only when the cloud itself must be redrawn
  const sceneSig = useRef('');
  const [zoomed, setZoomed] = useState(false);
  const facingRef = useRef<Facing>(facing);
  const zoomedRef = useRef(false);

  // Latest props for the gesture callbacks (they're built once).
  const props = useRef({ onSelect, onFacing, onZoomed });
  props.current = { onSelect, onFacing, onZoomed };

  const base = (H * 0.94) / FIG_H; // px per cm at 1×

  // ── animation loop: momentum + tweens + selection, one render per frame ─
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
    moving.current = more;
    const s = sel.current;
    if (s && now - s.t0 < FILL[1] + 40) more = true; // the wave / callout are still playing
    settle();
    // Redraw the cloud only if the camera, the wave or the level of detail
    // changed — the callout's typing and battery fill don't need it.
    const wave = s ? Math.min(1, (now - s.t0) / WAVE[1]) : 0;
    const sig = `${c.yaw}|${c.zoom}|${c.x}|${c.y}|${wave}|${more && moving.current}|${touching.current}`;
    if (sig !== sceneSig.current) { sceneSig.current = sig; setScene(n => n + 1); }
    setFrame(f => f + 1);
    if (more) { last.current = now; raf.current = requestAnimationFrame(step); }
  };
  useEffect(() => () => { if (raf.current != null) cancelAnimationFrame(raf.current); }, []);

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
    const mi = selected ? MUSCLE_INDEX[selected] : undefined;
    const f = mi != null ? FRAMES[mi] : undefined;
    if (!selected || mi == null || !f || !f.count) {
      sel.current = null;
      if (had) fly({ ...HOME, yaw: cam.current.yaw }, 620);
      return;
    }

    // Its points, by distance from the centre — the order the wave lights them.
    const idx: number[] = [];
    for (let i = 0; i < CLOUD.n; i++) if (CLOUD.m[i] === mi) idx.push(i);
    const nd = new Float32Array(idx.length);
    idx.forEach((i, j) => {
      nd[j] = Math.hypot(CLOUD.x[i] - f.c[0], CLOUD.y[i] - f.c[1], CLOUD.z[i] - f.c[2]) / (f.r || 1);
    });
    sel.current = { mi, t0: Date.now(), idx: Int32Array.from(idx), nd };

    // Face it, zoom until it spans about a third of the stage, and park its
    // centre at FOCUS so the panel below doesn't cover it.
    const yaw = Math.atan2(-f.n[0], f.n[2]);
    const zoom = Math.min(2.5, Math.max(1.6, 34 / Math.max(6, f.r)));
    const cy = Math.cos(yaw), sy = Math.sin(yaw);
    const x1 = f.c[0] * cy + f.c[2] * sy;
    const z1 = -f.c[0] * sy + f.c[2] * cy;
    const y2 = f.c[1] * Math.cos(PITCH) - z1 * Math.sin(PITCH);
    const z2 = f.c[1] * Math.sin(PITCH) + z1 * Math.cos(PITCH);
    const pp = DIST / (DIST - z2);
    const kz = base * zoom * pp;
    fly({ yaw, zoom, x: x1 + (W * (0.5 - FOCUS_X)) / kz, y: y2 - (H * (0.5 - FOCUS)) / kz });
  }, [selected]);

  // ── projection ─────────────────────────────────────────────────────────
  const proj = useRef({
    sx: new Float32Array(CLOUD.n), sy: new Float32Array(CLOUD.n), z: new Float32Array(CLOUD.n),
    facing: new Float32Array(CLOUD.n), lum: new Float32Array(CLOUD.n), vis: new Uint8Array(CLOUD.n),
    lev: new Uint8Array(CLOUD.n), tone: new Uint8Array(CLOUD.n), k: base,
  });

  const catById = useMemo(() => Object.fromEntries(map.categories.map(c => [c.id, c])), [map.categories]);
  // Muscle index → colour bucket for its marked category (0 = none).
  const toneOf = useMemo(() => {
    const out = new Int8Array(MUSCLES.length);
    MUSCLES.forEach((m, i) => {
      const mk = map.marks[m.id];
      if (!mk || (filter && mk.category !== filter)) return;
      const t = catById[mk.category]?.tone;
      if (t) out[i] = 1 + TONES.indexOf(t);
    });
    return out;
  }, [map.marks, filter, catById]);

  const drawn = useMemo(() => {
    const now = Date.now();
    const c = cam.current;
    const k = base * c.zoom;
    const cy = Math.cos(c.yaw), sy = Math.sin(c.yaw), cp = Math.cos(PITCH), sp = Math.sin(PITCH);
    const P = proj.current;
    P.k = k;
    const gw = Math.ceil(W / CELL) + 1, gh = Math.ceil(H / CELL) + 1;
    const zbuf = new Float32Array(gw * gh).fill(-1e9);
    const { facing: facingArr, lum, lev, tone } = P;

    for (let i = 0; i < CLOUD.n; i++) {
      const x = CLOUD.x[i], y = CLOUD.y[i], z = CLOUD.z[i];
      const x1 = x * cy + z * sy, z1 = -x * sy + z * cy;
      const y2 = y * cp - z1 * sp, z2 = y * sp + z1 * cp;
      const pp = DIST / (DIST - z2);
      const X = W / 2 + (x1 - c.x) * k * pp, Y = H / 2 - (y2 - c.y) * k * pp;
      P.sx[i] = X; P.sy[i] = Y; P.z[i] = z2;
      const nx = CLOUD.nx[i], ny = CLOUD.ny[i], nz = CLOUD.nz[i];
      const n1x = nx * cy + nz * sy, n1z = -nx * sy + nz * cy;
      const n2y = ny * cp - n1z * sp, n2z = ny * sp + n1z * cp;
      facingArr[i] = n2z;
      lum[i] = Math.max(0, n1x * LIGHT[0] + n2y * LIGHT[1] + n2z * LIGHT[2]);
      tone[i] = CLOUD.m[i] >= 0 ? toneOf[CLOUD.m[i]] : 0;
      if (n2z > 0 && X >= 0 && X < W && Y >= 0 && Y < H) {
        const cell = Math.floor(Y / CELL) * gw + Math.floor(X / CELL);
        if (z2 > zbuf[cell]) zbuf[cell] = z2;
      }
    }

    // The selection: lit out to the wave front, the front itself brightest.
    const s = sel.current;
    const st = s ? now - s.t0 : 0;
    if (s) {
      const p = easeOut(phase(st, WAVE)) * 1.15;
      for (let j = 0; j < s.idx.length; j++) {
        const d = s.nd[j];
        if (d <= p) tone[s.idx[j]] = p < 1.15 && d > p - 0.14 ? 7 : 6;
      }
    }

    // Brightness level per point, and how many would be drawn.
    let shown = 0;
    for (let i = 0; i < CLOUD.n; i++) {
      const X = P.sx[i], Y = P.sy[i];
      if (X < -4 || X > W + 4 || Y < -4 || Y > H + 4) { P.vis[i] = 0; lev[i] = 255; continue; }
      let level: number;
      if (facingArr[i] <= 0.02) level = 0;
      else {
        const cell = Math.floor(Math.min(H - 1, Math.max(0, Y)) / CELL) * gw + Math.floor(Math.min(W - 1, Math.max(0, X)) / CELL);
        const L = lum[i];
        level = P.z[i] < zbuf[cell] - 3 ? 0 : L < 0.22 ? 1 : L < 0.45 ? 2 : L < 0.68 ? 3 : 4;
      }
      P.vis[i] = level > 0 ? 1 : 0;
      // The far side is a faint hint — a third of it is plenty.
      if (level === 0 && tone[i] === 0 && i % 3) { lev[i] = 255; continue; }
      lev[i] = level;
      shown++;
    }

    // Moving → draw a prefix (an even sample) of the shuffled cloud.
    const lod = moving.current || touching.current;
    const limit = lod && shown > BUDGET ? Math.floor(CLOUD.n * (BUDGET / shown)) : CLOUD.n;
    const parts: string[][] = Array.from({ length: N_TONES * LEVELS }, () => []);
    for (let i = 0; i < CLOUD.n; i++) {
      const level = lev[i];
      if (level === 255 || (i >= limit && tone[i] < 6)) continue;
      parts[tone[i] * LEVELS + level].push(`M${Math.round(P.sx[i] * 10) / 10} ${Math.round(P.sy[i] * 10) / 10}h.01`);
    }

    // Floor ring.
    const floor: string[] = [];
    for (const [x, y, z] of FLOOR) {
      const x1 = x * cy + z * sy, z1 = -x * sy + z * cy;
      const y2 = y * cp - z1 * sp, z2 = y * sp + z1 * cp;
      const pp = DIST / (DIST - z2);
      floor.push(`M${(W / 2 + (x1 - c.x) * k * pp).toFixed(1)} ${(H / 2 - (y2 - c.y) * k * pp).toFixed(1)}h.01`);
    }

    // Callout for the selection: its visible points' centre.
    let callout: { x: number; y: number } | null = null;
    if (s) {
      let ax = 0, ay = 0, n = 0;
      for (let j = 0; j < s.idx.length; j++) {
        const i = s.idx[j];
        if (P.vis[i]) { ax += P.sx[i]; ay += P.sy[i]; n++; }
      }
      // Only while some of it faces the camera — a leader into the far side
      // of the body points at nothing you can see.
      if (n >= 3) callout = { x: ax / n, y: ay / n };
    }

    const dot = Math.min(6, Math.max(1.5, k * 0.64)) * (limit < CLOUD.n ? Math.min(1.4, Math.sqrt(CLOUD.n / limit) * 0.85) : 1);
    return { parts, floor: floor.join(''), callout, dot };
  }, [scene, toneOf, W, H, base, selected]);

  // ── hit test ───────────────────────────────────────────────────────────
  const pick = (x: number, y: number): string | null => {
    const P = proj.current;
    const R = Math.max(14, P.k * 2.2);
    let bestZ = -1e9;
    const near: number[] = [];
    for (let i = 0; i < CLOUD.n; i++) {
      if (!P.vis[i] || CLOUD.m[i] < 0) continue;
      const d = Math.hypot(P.sx[i] - x, P.sy[i] - y);
      if (d > R) continue;
      near.push(i);
      if (P.z[i] > bestZ) bestZ = P.z[i];
    }
    let best = -1, bestD = 1e9;
    for (const i of near) {
      if (P.z[i] < bestZ - 4) continue; // something nearer is in the way
      const d = Math.hypot(P.sx[i] - x, P.sy[i] - y);
      if (d < bestD) { bestD = d; best = i; }
    }
    return best >= 0 ? MUSCLES[CLOUD.m[best]].id : null;
  };
  const pickRef = useRef(pick);
  pickRef.current = pick;

  // ── gestures ───────────────────────────────────────────────────────────
  const gesture = useMemo(() => {
    const start = { yaw: 0, zoom: 1, x: 0, y: 0 };
    const grab = () => {
      tween.current = null; spin.current = 0; touching.current = true;
      Object.assign(start, cam.current);
    };
    const release = () => { touching.current = false; kick(); };
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
      .onEnd(e => { spin.current = Math.max(-12, Math.min(12, e.velocityX * SPIN)); })
      .onFinalize(release);
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
      })
      .onFinalize(release);

    const twoPan = Gesture.Pan()
      .minPointers(2)
      .onStart(grab)
      .onUpdate(e => {
        const c = cam.current;
        c.x = start.x - e.translationX / (base * c.zoom);
        c.y = start.y + e.translationY / (base * c.zoom);
        clampPan();
        kick();
      })
      .onFinalize(release);

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

  const colourOf = (tone: number) => tone === 0 ? C.ink : tone >= 6 ? C.hot : TONE[TONES[tone - 1]];
  const alphaOf = (tone: number, level: number) =>
    tone === 0 ? IDLE_A[level] * (selected ? 0.5 : 1) : tone === 7 ? 1 : tone === 6 ? SEL_A[level] : TONE_A[level];
  const sizeOf = (tone: number, level: number) =>
    drawn.dot * (level === 0 ? 0.75 : level === 1 ? 0.88 : 1) * (tone === 7 ? 1.9 : tone === 6 ? 1.2 : 1);

  const muscle = selected ? MUSCLES[MUSCLE_INDEX[selected]] : null;
  const mark = selected ? map.marks[selected] : undefined;
  const cat = mark ? catById[mark.category] : undefined;
  const co = drawn.callout;
  void frame; // re-rendered every frame for the callout's timeline
  const st = sel.current ? Date.now() - sel.current.t0 : 0;
  const typed = muscle ? muscle.name.slice(0, Math.ceil(muscle.name.length * phase(st, TYPE))) : '';
  const showLabel = !!(co && muscle && st >= TYPE[0]);
  const labelIn = easeOut(phase(st, [TYPE[0], TYPE[0] + 220]));
  const charge = battery != null ? Math.round(battery * easeOut(phase(st, FILL))) : null;
  const labelLeft = co ? co.x > W * 0.6 : false; // right of the muscle unless that's off-stage
  const LABEL_W = 156;
  const LABEL_H = battery != null ? 64 : 42;
  const ly = co ? Math.min(H - LABEL_H - 6, Math.max(6, co.y - LABEL_H / 2)) : 0;
  const lx = labelLeft ? 10 : W - LABEL_W - 10;
  // Leader grows from the muscle out to the label.
  const lead = labelIn;
  const ex = labelLeft ? lx + LABEL_W : lx, ey = ly + 20;

  return (
    <View style={{ width: W, height: H }}>
      <GestureDetector gesture={gesture}>
        <View style={StyleSheet.absoluteFill} collapsable={false}>
          <Svg width={W} height={H}>
            <Rect x={0} y={0} width={W} height={H} fill={C.bg} />
            <Path d={drawn.floor} stroke={C.faint} strokeWidth={drawn.dot * 0.8} strokeLinecap="round" />
            {drawn.parts.map((p, b) => p.length > 0 && (
              <Path
                key={b}
                d={p.join('')}
                stroke={colourOf(Math.floor(b / LEVELS))}
                strokeOpacity={alphaOf(Math.floor(b / LEVELS), b % LEVELS)}
                strokeWidth={sizeOf(Math.floor(b / LEVELS), b % LEVELS)}
                strokeLinecap="round"
              />
            ))}
            {co && showLabel && (
              <>
                <Polyline
                  points={`${co.x},${co.y} ${co.x + ((labelLeft ? ex + 8 : ex - 8) - co.x) * lead},${co.y + (ey - co.y) * lead}${lead >= 1 ? ` ${ex},${ey}` : ''}`}
                  fill="none" stroke={C.hot} strokeWidth={1} strokeOpacity={0.8}
                />
                <Rect x={co.x - 3} y={co.y - 3} width={6} height={6} fill={C.hot} />
              </>
            )}
          </Svg>
        </View>
      </GestureDetector>

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
