// The BODY tab's stage: a 3D point-cloud figure (lib/body-cloud.ts) you can
// turn and zoom, where every muscle is its own tappable region.
//   drag sideways → spin (with momentum)      pinch → zoom (1–4×)
//   two fingers   → pan while zoomed          drag up/down while zoomed → pan
//   tap a muscle  → select it                 tap empty space → deselect
// Rendering: each frame projects the cloud in JS and draws it as a handful
// of SVG paths, one per (colour, brightness) bucket, each point a round-
// capped zero-length stroke. A coarse screen-space depth buffer dims points
// hidden behind nearer ones (an arm in front of the ribs), and points facing
// away are drawn faint, so the figure reads solid but still see-through.
import { useEffect, useMemo, useRef, useState } from 'react';
import { View, Text, StyleSheet, Pressable } from 'react-native';
import Svg, { Path, Polyline, Rect } from 'react-native-svg';
import { Gesture, GestureDetector } from 'react-native-gesture-handler';
import * as Haptics from 'expo-haptics';
import { MaterialCommunityIcons } from '@expo/vector-icons';
import { C, F } from '@/lib/theme';
import { MUSCLES, MUSCLE_INDEX, decodeCloud, muscleFrames } from '@/lib/body-cloud';
import { BODY_CLOUD } from '@/lib/body-cloud-data';
import type { BodyMap, Tone } from '@/lib/body-map';

export const TONE: Record<Tone, string> = { hot: C.hot, signal: C.signal, live: C.live, dim: C.dim, alert: C.alert };
const TONES = Object.keys(TONE) as Tone[];

export type Facing = 'front' | 'back';

const CLOUD = decodeCloud(BODY_CLOUD);
const FRAMES = muscleFrames(CLOUD);

const PITCH = 0.1;          // camera looks slightly down, rad
const DIST = 520;           // perspective distance, cm
const CENTER_Y = 93;        // world height at the middle of the stage at 1×
const FIG_H = 192;          // world height that fills the stage at 1×
const MAX_ZOOM = 4;
const SPIN = 0.011;         // rad per px of drag
const LIGHT = (() => { const l = [-0.35, 0.45, 0.82]; const n = Math.hypot(...l); return l.map(v => v / n); })();
const CELL = 6;             // depth-buffer cell, px
const FLOOR = Array.from({ length: 48 }, (_, i) => {
  const a = (i / 48) * Math.PI * 2;
  return [Math.cos(a) * 30, 0, Math.sin(a) * 20] as const;
});

// Opacity per brightness level: 0 = facing away / hidden, 1–3 = lit.
const IDLE_A = [0.08, 0.36, 0.6, 0.88];
const TONE_A = [0.16, 0.6, 0.85, 1];
const SEL_A = [0.3, 0.8, 0.95, 1];

type Cam = { yaw: number; zoom: number; x: number; y: number };
const HOME: Cam = { yaw: 0, zoom: 1, x: 0, y: CENTER_Y };

interface Props {
  width: number;
  height: number;
  map: BodyMap;
  facing: Facing;
  selected: string | null;
  filter: string | null;
  onSelect: (id: string | null) => void;
  onFacing: (f: Facing) => void;
  /** True while zoomed in, so the page can stop scrolling under the finger. */
  onZoomed: (zoomed: boolean) => void;
}

const wrapAngle = (a: number) => Math.atan2(Math.sin(a), Math.cos(a));

export function BodyStage({ width: W, height: H, map, facing, selected, filter, onSelect, onFacing, onZoomed }: Props) {
  const cam = useRef<Cam>({ ...HOME });
  const target = useRef<Cam | null>(null);
  const spin = useRef(0);               // rad/s of momentum
  const raf = useRef<number | null>(null);
  const last = useRef(0);
  const [frame, setFrame] = useState(0);
  const [zoomed, setZoomed] = useState(false);
  const facingRef = useRef<Facing>(facing);
  const tapped = useRef<string | null>(null);

  // Latest props for the gesture callbacks (they're built once).
  const props = useRef({ onSelect, onFacing, onZoomed });
  props.current = { onSelect, onFacing, onZoomed };

  const base = (H * 0.94) / FIG_H; // px per cm at 1×

  // ── animation loop: momentum + tweens, then one render per frame ───────
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
    const t = target.current;
    if (t) {
      const k = 1 - Math.pow(0.0005, dt); // ease, frame-rate independent
      const dy = wrapAngle(t.yaw - c.yaw);
      c.yaw += dy * k; c.zoom += (t.zoom - c.zoom) * k; c.x += (t.x - c.x) * k; c.y += (t.y - c.y) * k;
      if (Math.abs(dy) < 0.002 && Math.abs(t.zoom - c.zoom) < 0.002 && Math.abs(t.x - c.x) < 0.05 && Math.abs(t.y - c.y) < 0.05) {
        Object.assign(c, t, { yaw: c.yaw + dy });
        target.current = null;
      } else more = true;
    }
    settle();
    setFrame(f => f + 1);
    if (more) { last.current = now; raf.current = requestAnimationFrame(step); }
  };
  useEffect(() => () => { if (raf.current != null) cancelAnimationFrame(raf.current); }, []);

  // After any camera change: report front/back and zoomed state.
  const settle = () => {
    const c = cam.current;
    const f: Facing = Math.cos(c.yaw) >= 0 ? 'front' : 'back';
    if (f !== facingRef.current) { facingRef.current = f; props.current.onFacing(f); }
    const z = c.zoom > 1.02;
    if (z !== zoomedRef.current) { zoomedRef.current = z; setZoomed(z); props.current.onZoomed(z); }
  };
  const zoomedRef = useRef(false);

  // FRONT / BACK from the header turns the figure.
  useEffect(() => {
    if (facing === facingRef.current) return;
    facingRef.current = facing;
    const c = cam.current;
    const goal = facing === 'front' ? 0 : Math.PI;
    target.current = { ...(target.current ?? c), yaw: c.yaw + wrapAngle(goal - c.yaw) };
    spin.current = 0;
    kick();
  }, [facing]);

  // Selected from outside the stage (TARGETS list) → turn to face it and
  // zoom in. A tap on the figure leaves the camera where it is.
  useEffect(() => {
    if (!selected || selected === tapped.current) return;
    const i = MUSCLE_INDEX[selected];
    const f = FRAMES[i];
    if (!f || !f.count) return;
    const yaw = Math.atan2(-f.n[0], f.n[2]);
    const zoom = Math.max(cam.current.zoom, 1.9);
    const cy = Math.cos(yaw), sy = Math.sin(yaw);
    const x1 = f.c[0] * cy + f.c[2] * sy;
    const z1 = -f.c[0] * sy + f.c[2] * cy;
    const y2 = f.c[1] * Math.cos(PITCH) - z1 * Math.sin(PITCH);
    const c = cam.current;
    target.current = { yaw: c.yaw + wrapAngle(yaw - c.yaw), zoom, x: x1, y: y2 };
    spin.current = 0;
    kick();
  }, [selected]);

  // ── projection ─────────────────────────────────────────────────────────
  const proj = useRef({
    sx: new Float32Array(CLOUD.n), sy: new Float32Array(CLOUD.n), z: new Float32Array(CLOUD.n),
    facing: new Float32Array(CLOUD.n), lum: new Float32Array(CLOUD.n), vis: new Uint8Array(CLOUD.n), k: base,
  });

  const catById = useMemo(() => Object.fromEntries(map.categories.map(c => [c.id, c])), [map.categories]);
  // Muscle index → colour bucket: 0 idle, 1..5 a category tone, 6 selected.
  const toneOf = useMemo(() => {
    const out = new Int8Array(MUSCLES.length);
    MUSCLES.forEach((m, i) => {
      const mk = map.marks[m.id];
      if (!mk || (filter && mk.category !== filter)) return;
      const t = catById[mk.category]?.tone;
      if (t) out[i] = 1 + TONES.indexOf(t);
    });
    if (selected && MUSCLE_INDEX[selected] != null) out[MUSCLE_INDEX[selected]] = 6;
    return out;
  }, [map.marks, filter, catById, selected]);

  const drawn = useMemo(() => {
    const c = cam.current;
    const k = base * c.zoom;
    const cy = Math.cos(c.yaw), sy = Math.sin(c.yaw), cp = Math.cos(PITCH), sp = Math.sin(PITCH);
    const P = proj.current;
    P.k = k;
    const gw = Math.ceil(W / CELL) + 1, gh = Math.ceil(H / CELL) + 1;
    const zbuf = new Float32Array(gw * gh).fill(-1e9);
    const { facing: facingArr, lum } = P;

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
      if (n2z > 0 && X >= 0 && X < W && Y >= 0 && Y < H) {
        const cell = Math.floor(Y / CELL) * gw + Math.floor(X / CELL);
        if (z2 > zbuf[cell]) zbuf[cell] = z2;
      }
    }

    // Buckets: tone (0..6) × level (0..3).
    const parts: string[][] = Array.from({ length: 28 }, () => []);
    for (let i = 0; i < CLOUD.n; i++) {
      const X = P.sx[i], Y = P.sy[i];
      if (X < -4 || X > W + 4 || Y < -4 || Y > H + 4) { P.vis[i] = 0; continue; }
      let level: number;
      if (facingArr[i] <= 0.02) level = 0;
      else {
        const cell = Math.floor(Math.min(H - 1, Math.max(0, Y)) / CELL) * gw + Math.floor(Math.min(W - 1, Math.max(0, X)) / CELL);
        level = P.z[i] < zbuf[cell] - 3 ? 0 : lum[i] < 0.3 ? 1 : lum[i] < 0.62 ? 2 : 3;
      }
      P.vis[i] = level > 0 ? 1 : 0;
      const tone = CLOUD.m[i] >= 0 ? toneOf[CLOUD.m[i]] : 0;
      if (level === 0 && tone === 0 && (i & 1)) continue; // thin out the far side
      parts[tone * 4 + level].push(`M${Math.round(X * 10) / 10} ${Math.round(Y * 10) / 10}h.01`);
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
    if (selected && MUSCLE_INDEX[selected] != null) {
      const mi = MUSCLE_INDEX[selected];
      let sx = 0, sy2 = 0, n = 0;
      for (let i = 0; i < CLOUD.n; i++) {
        if (CLOUD.m[i] !== mi) continue;
        if (P.vis[i]) { sx += P.sx[i]; sy2 += P.sy[i]; n++; }
      }
      // Only while some of it faces the camera — a leader into the far side
      // of the body points at nothing you can see.
      if (n >= 3) callout = { x: sx / n, y: sy2 / n };
    }

    const dot = Math.min(3.8, Math.max(2, k * 0.8));
    return { parts, floor: floor.join(''), callout, dot };
  }, [frame, toneOf, W, H, base, selected]);

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
      target.current = null; spin.current = 0;
      Object.assign(start, cam.current);
    };
    const clampPan = () => {
      const c = cam.current;
      // Keep the figure on screen; at 1× it snaps back to centre.
      const slack = (1 - 1 / c.zoom) * (FIG_H / 2);
      c.y = Math.min(CENTER_Y + slack, Math.max(CENTER_Y - slack, c.y));
      c.x = Math.min(slack * 0.6, Math.max(-slack * 0.6, c.x));
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
        if (cam.current.zoom < 1.05) { target.current = { ...cam.current, zoom: 1, x: 0, y: CENTER_Y }; kick(); }
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
        tapped.current = id;
        if (id) Haptics.selectionAsync();
        props.current.onSelect(id);
      });

    return Gesture.Race(Gesture.Simultaneous(pinch, twoPan), spinPan, tap);
  }, [zoomed, W, H, base]);

  const reset = () => {
    target.current = { ...HOME, yaw: cam.current.yaw + wrapAngle(0 - cam.current.yaw) };
    spin.current = 0;
    kick();
  };

  const colourOf = (tone: number) => tone === 0 ? C.ink : tone === 6 ? C.hot : TONE[TONES[tone - 1]];
  const alphaOf = (tone: number, level: number) =>
    tone === 0 ? IDLE_A[level] * (selected ? 0.6 : 1) : tone === 6 ? SEL_A[level] : TONE_A[level];
  const sizeOf = (tone: number, level: number) => drawn.dot * (level === 0 ? 0.75 : level === 1 ? 0.9 : 1) * (tone === 6 ? 1.2 : 1);

  const muscle = selected ? MUSCLES[MUSCLE_INDEX[selected]] : null;
  const mark = selected ? map.marks[selected] : undefined;
  const cat = mark ? catById[mark.category] : undefined;
  const co = drawn.callout;
  const labelLeft = co ? co.x > W / 2 : false; // put the label on the emptier side
  const LABEL_W = 132;
  const ly = co ? Math.min(H - 46, Math.max(6, co.y - 20)) : 0;
  const lx = labelLeft ? 10 : W - LABEL_W - 10;

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
                stroke={colourOf(b >> 2)}
                strokeOpacity={alphaOf(b >> 2, b & 3)}
                strokeWidth={sizeOf(b >> 2, b & 3)}
                strokeLinecap="round"
              />
            ))}
            {co && (
              <>
                <Polyline
                  points={`${co.x},${co.y} ${labelLeft ? lx + LABEL_W + 8 : lx - 8},${ly + 20} ${labelLeft ? lx + LABEL_W : lx},${ly + 20}`}
                  fill="none" stroke={C.hot} strokeWidth={1} strokeOpacity={0.8}
                />
                <Rect x={co.x - 3} y={co.y - 3} width={6} height={6} fill={C.hot} />
              </>
            )}
          </Svg>
        </View>
      </GestureDetector>

      {co && muscle && (
        <View style={[styles.label, { left: lx, top: ly, width: LABEL_W }]} pointerEvents="none">
          <View style={styles.labelTag}>
            <View style={[styles.labelSwatch, { backgroundColor: cat ? TONE[cat.tone] : C.faint }]} />
            <Text style={[styles.labelCat, cat && { color: TONE[cat.tone] }]} numberOfLines={1}>{cat ? cat.name : muscle.group}</Text>
          </View>
          <Text style={styles.labelName} numberOfLines={1} adjustsFontSizeToFit minimumFontScale={0.7}>{muscle.name}</Text>
        </View>
      )}

      {zoomed && (
        <Pressable onPress={reset} style={styles.reset} hitSlop={8} accessibilityLabel="Reset view">
          <MaterialCommunityIcons name="fit-to-screen-outline" size={18} color={C.ink} />
        </Pressable>
      )}
    </View>
  );
}

const styles = StyleSheet.create({
  label: {
    position: 'absolute', height: 40, paddingHorizontal: 9, justifyContent: 'center',
    backgroundColor: C.surface, borderWidth: 1, borderColor: C.hot, borderRadius: 10,
  },
  labelTag: { flexDirection: 'row', alignItems: 'center', gap: 5 },
  labelSwatch: { width: 5, height: 5 },
  labelCat: { fontFamily: F.dot, fontSize: 8, color: C.dim, letterSpacing: 1.5, flexShrink: 1 },
  labelName: { fontFamily: F.dot, fontSize: 11, color: C.ink, letterSpacing: 0.5, marginTop: 3 },
  reset: {
    position: 'absolute', right: 12, bottom: 12, width: 40, height: 40, borderRadius: 20,
    borderWidth: 1, borderColor: C.lineHi, backgroundColor: C.surface, alignItems: 'center', justifyContent: 'center',
  },
});
