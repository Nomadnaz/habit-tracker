// ─────────────────────────────────────────────────────────────────────────
// The weekly climb's mountain — a 3D heightfield drawn as coloured ASCII
// (lit snow, rock, scree, meadow, '^' trees) over a dithered sky and sun,
// with a white dashed route spiralling to the summit, prayer flags at each
// checkpoint, huts at the camps, wind streaks, snow blowing off the peak and
// leaves drifting down. Drag sideways to turn it; let go and it coasts, then
// drifts round on its own.
//
// Software-rendered: ~9k surface points projected into a character grid with
// a depth buffer each frame (only when the angle moves), shaded by a fixed
// sun so faces change as it turns. Overlays are depth-tested against the
// same buffer, so the route and flags hide behind the mountain.
// ─────────────────────────────────────────────────────────────────────────

import { useEffect, useMemo, useRef, useState } from 'react';
import { Animated, Easing, PanResponder, StyleSheet, Text, View } from 'react-native';
import Svg, { Circle, Line, Polygon, Polyline } from 'react-native-svg';
import { C, F, MTN } from '@/lib/theme';
import { render, type Checkpoint, type Frame } from '@/lib/mountain-geo';

export type { Checkpoint };

// ── sky: an ordered-dither gradient and a halftone sun, drawn once ──────

const BAYER = [0, 8, 2, 10, 12, 4, 14, 6, 3, 11, 1, 9, 15, 7, 13, 5].map(v => (v + 0.5) / 16);
function Sky({ w, h }: { w: number; h: number }) {
  const dots = useMemo(() => {
    const out: { x: number; y: number; r: number; c: string }[] = [];
    const G = 6, sx = w * 0.8, sy = h * 0.2, R = w * 0.1;
    for (let i = 0; i * G < w; i++) for (let j = 0; j * G < h * 0.75; j++) {
      const x = i * G + G / 2, y = j * G + G / 2;
      const dsun = Math.hypot(x - sx, y - sy) / R;
      if (dsun < 1.6) {
        const r = Math.max(0, (1.6 - dsun) / 1.6) * 2.4;
        if (r > 0.35) out.push({ x, y, r, c: MTN.sun });
        continue;
      }
      // Faint glow towards the horizon, dithered.
      const g = (y / (h * 0.75)) * 0.32;
      if (g > BAYER[(j % 4) * 4 + (i % 4)]) out.push({ x, y, r: 0.8, c: C.faint });
    }
    return out;
  }, [w, h]);
  return (
    <Svg width={w} height={h} style={StyleSheet.absoluteFill}>
      {dots.map((d, k) => <Circle key={k} cx={d.x} cy={d.y} r={d.r} fill={d.c} />)}
    </Svg>
  );
}

// ── weather: wind streaks, snow off the summit, falling leaves ──────────

function Loop({ duration, delay = 0, children }: { duration: number; delay?: number; children: (v: Animated.Value) => React.ReactNode }) {
  const v = useRef(new Animated.Value(0)).current;
  useEffect(() => {
    const l = Animated.loop(Animated.sequence([
      Animated.delay(delay),
      Animated.timing(v, { toValue: 1, duration, easing: Easing.linear, useNativeDriver: true }),
      Animated.timing(v, { toValue: 0, duration: 0, useNativeDriver: true }),
    ]));
    l.start();
    return () => l.stop();
  }, []);
  return <>{children(v)}</>;
}

function Weather({ w, h, peak }: { w: number; h: number; peak: { x: number; y: number } }) {
  const gusts = [0.16, 0.34, 0.5, 0.7];
  const leaves = [0.12, 0.3, 0.62, 0.8, 0.9, 0.45];
  return (
    <View pointerEvents="none" style={StyleSheet.absoluteFill}>
      {gusts.map((y, i) => (
        <Loop key={`g${i}`} duration={4200 + i * 900} delay={i * 700}>
          {v => (
            <Animated.Text style={[st.gust, {
              top: y * h, opacity: v.interpolate({ inputRange: [0, 0.15, 0.85, 1], outputRange: [0, 0.7, 0.7, 0] }),
              transform: [{ translateX: v.interpolate({ inputRange: [0, 1], outputRange: [-90, w + 20] }) }],
            }]}>{i % 2 ? '~  ~~~  ~' : '~~ ~ ~~~~'}</Animated.Text>
          )}
        </Loop>
      ))}
      {[0, 1, 2, 3].map(i => (
        <Loop key={`s${i}`} duration={1800 + i * 300} delay={i * 450}>
          {v => (
            <Animated.Text style={[st.spin, {
              left: peak.x, top: peak.y - 4,
              opacity: v.interpolate({ inputRange: [0, 0.2, 1], outputRange: [0, 0.9, 0] }),
              transform: [
                { translateX: v.interpolate({ inputRange: [0, 1], outputRange: [0, 60 + i * 14] }) },
                { translateY: v.interpolate({ inputRange: [0, 1], outputRange: [0, -6 + i * 5] }) },
              ],
            }]}>{i % 2 ? '·' : '.'}</Animated.Text>
          )}
        </Loop>
      ))}
      {leaves.map((x, i) => (
        <Loop key={`l${i}`} duration={5200 + i * 700} delay={i * 1100}>
          {v => (
            <Animated.Text style={[st.leaf, {
              left: x * w, top: h * 0.6, color: i % 3 ? MTN.leaf : MTN.meadow,
              opacity: v.interpolate({ inputRange: [0, 0.1, 0.8, 1], outputRange: [0, 1, 1, 0] }),
              transform: [
                { translateY: v.interpolate({ inputRange: [0, 1], outputRange: [0, h * 0.36] }) },
                { translateX: v.interpolate({ inputRange: [0, 0.25, 0.5, 0.75, 1], outputRange: [0, 10, -4, 12, 22] }) },
                { rotate: v.interpolate({ inputRange: [0, 1], outputRange: ['0deg', `${i % 2 ? 300 : -260}deg`] }) },
              ],
            }]}>{i % 2 ? '*' : '\''}</Animated.Text>
          )}
        </Loop>
      ))}
    </View>
  );
}

// ── the stage ───────────────────────────────────────────────────────────

const FS = 10;     // ASCII font size
const LH = 10;     // line height = cell height

export function Mountain({ width, progress, checkpoints }: { width: number; progress: number; checkpoints: Checkpoint[] }) {
  const H = Math.round(width * 0.86);
  const [cw, setCw] = useState(0);
  const [frame, setFrame] = useState<Frame | null>(null);
  const yaw = useRef(0.6), pitch = useRef(0.42), vel = useRef(0), touching = useRef(false), idleAt = useRef(0);
  const drawn = useRef({ yaw: NaN, t: 0 });
  const startYaw = useRef(0);
  const pulse = useRef(new Animated.Value(0)).current;

  useEffect(() => {
    const l = Animated.loop(Animated.timing(pulse, { toValue: 1, duration: 1400, useNativeDriver: true }));
    l.start();
    return () => l.stop();
  }, []);

  // Turn: drag, coast, then a slow drift once left alone for a bit.
  useEffect(() => {
    if (!cw) return;
    drawn.current.yaw = NaN; // new data → draw straight away
    let raf = 0, last = Date.now();
    const tick = () => {
      const now = Date.now(), dt = Math.min(0.05, (now - last) / 1000);
      last = now;
      if (!touching.current) {
        if (Math.abs(vel.current) > 0.02) { yaw.current += vel.current * dt; vel.current *= Math.pow(0.04, dt); }
        else if (now - idleAt.current > 2500) yaw.current += 0.14 * dt;
      }
      const moved = Math.abs(yaw.current - drawn.current.yaw);
      const gap = now - drawn.current.t;
      // Redraw on a real change — fast while dragging/coasting, ~12 fps for the idle drift.
      if (Number.isNaN(drawn.current.yaw) || (moved > 0.003 && gap > (touching.current || Math.abs(vel.current) > 0.02 ? 33 : 80))) {
        drawn.current = { yaw: yaw.current, t: now };
        setFrame(render(yaw.current, pitch.current, width, H, cw, LH, progress, checkpoints));
      }
      raf = requestAnimationFrame(tick);
    };
    raf = requestAnimationFrame(tick);
    return () => cancelAnimationFrame(raf);
  }, [cw, width, progress, checkpoints]);

  const pan = useMemo(() => PanResponder.create({
    onMoveShouldSetPanResponder: (_, g) => Math.abs(g.dx) > 6 && Math.abs(g.dx) > Math.abs(g.dy),
    onPanResponderGrant: () => { touching.current = true; startYaw.current = yaw.current; vel.current = 0; },
    onPanResponderMove: (_, g) => { yaw.current = startYaw.current + g.dx * 0.011; },
    onPanResponderRelease: (_, g) => { touching.current = false; vel.current = g.vx * 11; idleAt.current = Date.now(); },
    onPanResponderTerminate: () => { touching.current = false; idleAt.current = Date.now(); },
    onPanResponderTerminationRequest: () => false,
  }), []);

  return (
    <View style={[st.stage, { width, height: H }]} {...pan.panHandlers}>
      <Sky w={width} h={H} />
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
            <Polyline key={k} points={seg.pts} fill="none" stroke={C.hot} strokeOpacity={seg.done ? 1 : 0.35}
              strokeWidth={seg.done ? 2 : 1.4} strokeDasharray={seg.done ? '5 4' : '2 5'} strokeLinecap="round" />
          ))}
          {frame.huts.map((h, k) => (
            <Polygon key={`h${k}`} points={`${h.x - 6},${h.y} ${h.x + 6},${h.y} ${h.x + 6},${h.y - 6} ${h.x},${h.y - 11} ${h.x - 6},${h.y - 6}`}
              fill={MTN.hut} stroke={C.bg} strokeWidth={1} />
          ))}
          {frame.flags.map(({ x, y, cp }, k) => (
            <PrayerFlags key={`f${k}`} x={x} y={y} on={cp.reached} />
          ))}
        </Svg>
      )}
      {frame?.flags.map(({ x, y, cp }) => (
        <View key={cp.label} pointerEvents="none" style={[st.flagLabel, { left: x + 4, top: y - 34 }]}>
          <Text style={[st.flagText, !cp.reached && { color: C.dim }]}>{cp.label}</Text>
          {!!cp.time && <Text style={st.flagTime}>{cp.time}</Text>}
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
      {frame && <Weather w={width} h={H} peak={frame.peak} />}
    </View>
  );
}

/** A pole with a string of the five prayer-flag colours running off it; grey until reached. */
function PrayerFlags({ x, y, on }: { x: number; y: number; on: boolean }) {
  const top = y - 22;
  return (
    <>
      <Line x1={x} y1={y} x2={x} y2={top} stroke={on ? C.hot : C.dim} strokeWidth={1.2} />
      {MTN.flags.map((c, i) => {
        const fx = x + 3 + i * 5.5, fy = top + 2 + i * 2.4;
        return <Polygon key={i} points={`${fx},${fy} ${fx + 5},${fy} ${fx + 2.5},${fy + 5}`} fill={on ? c : C.faint} />;
      })}
      <Circle cx={x} cy={y} r={1.8} fill={on ? C.hot : C.dim} />
    </>
  );
}

const st = StyleSheet.create({
  stage: { overflow: 'hidden', borderRadius: 22, backgroundColor: C.bg, borderWidth: 1, borderColor: C.line },
  ascii: { fontFamily: F.mono, fontSize: FS, lineHeight: LH, height: LH, includeFontPadding: false, color: C.ink },
  probe: { position: 'absolute', opacity: 0, top: -100 },
  gust: { position: 'absolute', fontFamily: F.mono, fontSize: 11, color: C.dim, letterSpacing: 1 },
  spin: { position: 'absolute', fontFamily: F.mono, fontSize: 12, color: MTN.snow },
  leaf: { position: 'absolute', fontFamily: F.mono, fontSize: 12 },
  flagLabel: { position: 'absolute' },
  flagText: { fontFamily: F.dot, fontSize: 9, color: C.hot, letterSpacing: 1 },
  flagTime: { fontFamily: F.mono, fontSize: 9, color: C.dim },
  me: { position: 'absolute', width: 24, height: 24, alignItems: 'center', justifyContent: 'center' },
  meRing: { position: 'absolute', width: 24, height: 24, borderRadius: 12, borderWidth: 1.5, borderColor: C.live },
  meDot: { width: 8, height: 8, borderRadius: 4, backgroundColor: C.live, borderWidth: 1.5, borderColor: C.bg },
});
