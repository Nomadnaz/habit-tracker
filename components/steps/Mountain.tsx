// ─────────────────────────────────────────────────────────────────────────
// The weekly climb's mountain (lib/mountain-geo.ts) on screen: twin peaks in
// coloured ASCII, the white dashed trail up to the summit, tagged checkpoint
// markers, prayer-flag strings at the camps, a few slow ASCII clouds.
//
// Drag sideways to turn it (it coasts, then drifts on its own). Pinch,
// double-tap or the +/− buttons zoom: close up the camera moves to you on
// the trail and the meadow becomes swaying grass with flowers, trees and
// huts as little ASCII sprites. Frames are only drawn when something moves:
// on a turn, or ~9 fps for the grass while zoomed in. The clouds run on the
// native driver, so they cost no renders.
// ─────────────────────────────────────────────────────────────────────────

import { useEffect, useMemo, useRef, useState } from 'react';
import { Animated, Easing, PanResponder, Pressable, StyleSheet, Text, View } from 'react-native';
import Svg, { Circle, G, Line, Path, Polygon, Polyline } from 'react-native-svg';
import { MaterialCommunityIcons } from '@expo/vector-icons';
import * as Haptics from 'expo-haptics';
import { C, F, MTN } from '@/lib/theme';
import { render, type Checkpoint, type Flagline, type Frame } from '@/lib/mountain-geo';

export type { Checkpoint };

const FS = 10;     // ASCII font size
const LH = 10;     // line height = cell height
const ZMIN = 1, ZMAX = 3.2;

const CLOUDS = [
  ['  .--.   ', '.(    ). ', '(___.__)'],
  [' .-.  ', '(   ).', ' `--\''],
  ['   _.--._  ', ' (        ) ', '(__.__.___)'],
];

/** A few ASCII clouds sliding slowly across the sky (native driver — no re-renders). */
function Clouds({ w }: { w: number }) {
  return (
    <View pointerEvents="none" style={StyleSheet.absoluteFill}>
      {CLOUDS.map((c, i) => <Cloud key={i} lines={c} w={w} top={14 + i * 34} dur={70_000 + i * 22_000} start={i / CLOUDS.length} />)}
    </View>
  );
}
function Cloud({ lines, w, top, dur, start }: { lines: string[]; w: number; top: number; dur: number; start: number }) {
  const x = useRef(new Animated.Value(start)).current;
  useEffect(() => {
    let from = start;
    const run = () => {
      Animated.timing(x, { toValue: 1, duration: dur * (1 - from), easing: Easing.linear, useNativeDriver: true })
        .start(({ finished }) => { if (finished) { from = 0; x.setValue(0); run(); } });
    };
    run();
    return () => x.stopAnimation();
  }, []);
  return (
    <Animated.View style={{ position: 'absolute', top, transform: [{ translateX: x.interpolate({ inputRange: [0, 1], outputRange: [-90, w + 10] }) }] }}>
      {lines.map((l, i) => <Text key={i} style={st.cloud}>{l}</Text>)}
    </Animated.View>
  );
}

export function Mountain({ width, progress, checkpoints }: { width: number; progress: number; checkpoints: Checkpoint[] }) {
  const H = Math.round(width * 0.9);
  const [cw, setCw] = useState(0);
  const [frame, setFrame] = useState<Frame | null>(null);
  const [zoomUi, setZoomUi] = useState(1);
  const yaw = useRef(0.55), pitch = useRef(0.42), vel = useRef(0), touching = useRef(false), idleAt = useRef(0);
  const zoom = useRef(1), zoomTo = useRef<number | null>(null);
  const drawn = useRef({ yaw: NaN, zoom: NaN, t: 0 });
  const startYaw = useRef(0), pinch = useRef<{ d: number; z: number } | null>(null), lastTap = useRef(0);
  const pulse = useRef(new Animated.Value(0)).current;

  useEffect(() => {
    const l = Animated.loop(Animated.timing(pulse, { toValue: 1, duration: 1400, useNativeDriver: true }));
    l.start();
    return () => l.stop();
  }, []);

  useEffect(() => {
    if (!cw) return;
    drawn.current.yaw = NaN; // new data → draw straight away
    let raf = 0, last = Date.now();
    const t0 = Date.now();
    const tick = () => {
      const now = Date.now(), dt = Math.min(0.05, (now - last) / 1000);
      last = now;
      // Zoom glides to a double-tap / button target.
      if (zoomTo.current != null) {
        zoom.current += (zoomTo.current - zoom.current) * Math.min(1, dt * 9);
        if (Math.abs(zoomTo.current - zoom.current) < 0.01) { zoom.current = zoomTo.current; zoomTo.current = null; }
      }
      if (!touching.current) {
        if (Math.abs(vel.current) > 0.02) { yaw.current += vel.current * dt; vel.current *= Math.pow(0.04, dt); }
        else if (now - idleAt.current > 2500 && zoom.current < 1.5) yaw.current += 0.12 * dt;
      }
      const near = zoom.current >= 1.9;
      const moving = touching.current || Math.abs(vel.current) > 0.02 || zoomTo.current != null || pinch.current != null;
      const gap = now - drawn.current.t;
      const changed = Math.abs(yaw.current - drawn.current.yaw) > 0.003 || Math.abs(zoom.current - drawn.current.zoom) > 0.005;
      // Moving: up to 30 fps. Grass up close: ~9 fps. Idle drift far out: ~12 fps. Otherwise nothing.
      if (Number.isNaN(drawn.current.yaw) || (changed && gap > (moving ? 33 : 80)) || (near && gap > 110)) {
        drawn.current = { yaw: yaw.current, zoom: zoom.current, t: now };
        setFrame(render(yaw.current, pitch.current, width, H, cw, LH, progress, checkpoints, zoom.current, (now - t0) / 1000));
        const zr = Math.round(zoom.current * 10) / 10;
        setZoomUi(z => (z === zr ? z : zr));
      }
      raf = requestAnimationFrame(tick);
    };
    raf = requestAnimationFrame(tick);
    return () => cancelAnimationFrame(raf);
  }, [cw, width, progress, checkpoints]);

  const setZoom = (z: number) => { zoomTo.current = Math.max(ZMIN, Math.min(ZMAX, z)); Haptics.selectionAsync(); };
  const doubleTap = () => {
    const now = Date.now();
    if (now - lastTap.current < 280) setZoom(zoom.current > 1.5 ? 1 : 2.6);
    lastTap.current = now;
  };

  const pan = useMemo(() => PanResponder.create({
    onStartShouldSetPanResponder: e => e.nativeEvent.touches.length >= 2,
    onMoveShouldSetPanResponder: (e, g) => e.nativeEvent.touches.length >= 2 || (Math.abs(g.dx) > 6 && Math.abs(g.dx) > Math.abs(g.dy)),
    onPanResponderGrant: () => { touching.current = true; startYaw.current = yaw.current; vel.current = 0; },
    onPanResponderMove: (e, g) => {
      const ts = e.nativeEvent.touches;
      if (ts.length >= 2) {
        const d = Math.hypot(ts[0].pageX - ts[1].pageX, ts[0].pageY - ts[1].pageY);
        if (!pinch.current) pinch.current = { d, z: zoom.current };
        zoomTo.current = null;
        zoom.current = Math.max(ZMIN, Math.min(ZMAX, pinch.current.z * (d / pinch.current.d)));
        return;
      }
      if (!pinch.current) yaw.current = startYaw.current + g.dx * 0.011;
    },
    onPanResponderRelease: (_, g) => {
      touching.current = false; idleAt.current = Date.now();
      if (!pinch.current) vel.current = g.vx * 11;
      pinch.current = null;
    },
    onPanResponderTerminate: () => { touching.current = false; pinch.current = null; idleAt.current = Date.now(); },
    onPanResponderTerminationRequest: () => false,
  }), []);

  return (
    <View style={[st.stage, { width, height: H }]} {...pan.panHandlers}>
      <Pressable style={StyleSheet.absoluteFill} onPress={doubleTap} />
      {!frame?.near && <Clouds w={width} />}
      {/* One hidden line to learn the mono face's advance at this size. */}
      <Text style={[st.ascii, st.probe]} onLayout={e => setCw(e.nativeEvent.layout.width / 40)}>{'M'.repeat(40)}</Text>
      {frame && (
        <View style={StyleSheet.absoluteFill} pointerEvents="none">
          {frame.rows.map((line, r) => (
            <Text key={r} style={st.ascii} numberOfLines={1} ellipsizeMode="clip">
              {line.map((s, k) => <Text key={k} style={{ color: s.color }}>{s.text}</Text>)}
            </Text>
          ))}
        </View>
      )}
      {frame && (
        <Svg width={width} height={H} style={StyleSheet.absoluteFill} pointerEvents="none">
          {frame.route.map((seg, k) => (
            <Polyline key={`b${k}`} points={seg.pts} fill="none" stroke={C.bg} strokeWidth={seg.done ? 4.5 : 3} strokeLinecap="round" strokeLinejoin="round" />
          ))}
          {frame.route.map((seg, k) => (
            <Polyline key={k} points={seg.pts} fill="none" stroke={C.hot} strokeOpacity={seg.done ? 1 : 0.4}
              strokeWidth={seg.done ? 2.2 : 1.4} strokeDasharray={seg.done ? '6 4' : '2 5'} strokeLinecap="round" strokeLinejoin="round" />
          ))}
          {frame.strings.map((s, k) => <FlagString key={`s${k}`} s={s} scale={Math.min(1.8, 0.8 + zoomUi * 0.3)} />)}
          {frame.flags.map(({ x, y, cp }) => (
            <G key={`m${cp.label}`}>
              <Line x1={x} y1={y} x2={x} y2={y - 26} stroke={cp.reached ? C.hot : C.dim} strokeWidth={1.4} />
              <Circle cx={x} cy={y} r={cp.reached ? 5 : 4} fill={cp.reached ? C.live : C.bg} stroke={cp.reached ? C.bg : C.dim} strokeWidth={1.5} />
            </G>
          ))}
        </Svg>
      )}
      {frame?.flags.map(({ x, y, cp }) => (
        <View key={cp.label} pointerEvents="none" style={[st.tag, cp.reached ? st.tagOn : st.tagOff, { left: x - 2, top: y - 46 }]}>
          <Text style={[st.tagText, cp.reached && { color: C.onHot }]}>{cp.label}</Text>
          {!!cp.time && <Text style={[st.tagTime, cp.reached && { color: 'rgba(0,0,0,0.6)' }]}>{cp.time}</Text>}
        </View>
      ))}
      {frame?.climber && (
        <View pointerEvents="none" style={[st.me, { left: frame.climber.x - 12, top: frame.climber.y - 12 }]}>
          <Animated.View style={[st.meRing, {
            opacity: pulse.interpolate({ inputRange: [0, 1], outputRange: [0.9, 0] }),
            transform: [{ scale: pulse.interpolate({ inputRange: [0, 1], outputRange: [0.4, 1.4] }) }],
          }]} />
          <View style={st.meDot} />
        </View>
      )}
      <View style={st.zoom}>
        <Pressable onPress={() => setZoom(zoom.current + 0.7)} hitSlop={6} style={({ pressed }) => [st.zoomBtn, pressed && { backgroundColor: C.raised }]} accessibilityLabel="Zoom in">
          <MaterialCommunityIcons name="plus" size={16} color={C.ink} />
        </Pressable>
        <Pressable onPress={() => setZoom(zoom.current - 0.7)} hitSlop={6} style={({ pressed }) => [st.zoomBtn, pressed && { backgroundColor: C.raised }]} accessibilityLabel="Zoom out">
          <MaterialCommunityIcons name="minus" size={16} color={C.ink} />
        </Pressable>
      </View>
    </View>
  );
}

/** A sagging string between two poles with small flags in the five prayer-flag colours. */
function FlagString({ s, scale }: { s: Flagline; scale: number }) {
  const mx = (s.x1 + s.x2) / 2, my = (s.y1 + s.y2) / 2 + 7 * scale;
  const at = (t: number) => ({ x: (1 - t) ** 2 * s.x1 + 2 * (1 - t) * t * mx + t * t * s.x2, y: (1 - t) ** 2 * s.y1 + 2 * (1 - t) * t * my + t * t * s.y2 });
  const n = 7;
  const fw = 3.4 * scale, fh = 4.4 * scale;
  return (
    <>
      <Line x1={s.x1} y1={s.y1} x2={s.x1} y2={s.y1 + 12 * scale} stroke={C.dim} strokeWidth={1} />
      <Line x1={s.x2} y1={s.y2} x2={s.x2} y2={s.y2 + 12 * scale} stroke={C.dim} strokeWidth={1} />
      <Path d={`M${s.x1} ${s.y1} Q${mx} ${my} ${s.x2} ${s.y2}`} stroke={s.on ? C.ink : C.faint} strokeWidth={0.8} fill="none" />
      {Array.from({ length: n }, (_, i) => {
        const p = at((i + 1) / (n + 1));
        return <Polygon key={i} points={`${p.x - fw / 2},${p.y} ${p.x + fw / 2},${p.y} ${p.x + fw / 2},${p.y + fh} ${p.x - fw / 2},${p.y + fh}`} fill={s.on ? MTN.flags[i % 5] : C.faint} />;
      })}
    </>
  );
}

const st = StyleSheet.create({
  stage: { overflow: 'hidden', borderRadius: 22, borderCurve: 'continuous', backgroundColor: C.bg, borderWidth: 1, borderColor: C.line },
  ascii: { fontFamily: F.mono, fontSize: FS, lineHeight: LH, height: LH, includeFontPadding: false, color: C.ink },
  probe: { position: 'absolute', opacity: 0, top: -100 },
  cloud: { fontFamily: F.mono, fontSize: 10, lineHeight: 10, color: MTN.cloud, opacity: 0.55 },
  tag: { position: 'absolute', borderRadius: 4, borderCurve: 'continuous', paddingHorizontal: 5, paddingVertical: 2, borderWidth: 1 },
  tagOn: { backgroundColor: C.hot, borderColor: C.hot },
  tagOff: { backgroundColor: C.bg, borderColor: C.lineHi },
  tagText: { fontFamily: F.dot, fontSize: 9, color: C.dim, letterSpacing: 1 },
  tagTime: { fontFamily: F.mono, fontSize: 8, color: C.dim },
  me: { position: 'absolute', width: 24, height: 24, alignItems: 'center', justifyContent: 'center' },
  meRing: { position: 'absolute', width: 24, height: 24, borderRadius: 12, borderWidth: 1.5, borderColor: C.live },
  meDot: { width: 9, height: 9, borderRadius: 5, backgroundColor: C.live, borderWidth: 1.5, borderColor: C.bg },
  zoom: { position: 'absolute', right: 10, bottom: 10, gap: 6 },
  zoomBtn: { width: 32, height: 32, borderRadius: 16, borderWidth: 1, borderColor: C.lineHi, backgroundColor: C.surface, alignItems: 'center', justifyContent: 'center' },
});
