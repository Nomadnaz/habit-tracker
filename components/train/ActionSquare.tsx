// The two big squares at the top of TRAIN — RECORD RUN and LOG WORKOUT —
// with their micrographics: corner brackets, an index, a tick ruler, and a
// live glyph (the last route drawing itself; this week's sets as dot columns).

import { useEffect, useRef, type ReactNode } from 'react';
import { Animated, Easing, Pressable, StyleSheet, Text, View } from 'react-native';
import Svg, { Circle, Line, Polyline } from 'react-native-svg';
import { C, F, SPRING } from '@/lib/theme';

const AnimatedPolyline = Animated.createAnimatedComponent(Polyline);
const AnimatedCircle = Animated.createAnimatedComponent(Circle);

export function ActionSquare({ size, light, index, eyebrow, title, sub, live, onPress, children }: {
  size: number; light?: boolean; index: string; eyebrow: string; title: string; sub: string;
  /** Blinking dot by the eyebrow — e.g. today's session is waiting. */
  live?: boolean;
  onPress: () => void; children: ReactNode;
}) {
  const press = useRef(new Animated.Value(1)).current;
  const blink = useRef(new Animated.Value(1)).current;
  useEffect(() => {
    if (!live) return;
    const loop = Animated.loop(Animated.sequence([
      Animated.timing(blink, { toValue: 0.15, duration: 600, useNativeDriver: true }),
      Animated.timing(blink, { toValue: 1, duration: 600, useNativeDriver: true }),
    ]));
    loop.start();
    return () => loop.stop();
  }, [live]);

  const ink = light ? C.onHot : C.ink;
  const dim = light ? 'rgba(0,0,0,0.5)' : C.dim;
  const rule = light ? 'rgba(0,0,0,0.25)' : C.lineHi;
  const B = 12;

  return (
    <Pressable
      onPress={onPress}
      onPressIn={() => Animated.spring(press, { toValue: 0.96, ...SPRING.settle }).start()}
      onPressOut={() => Animated.spring(press, { toValue: 1, ...SPRING.pop }).start()}
      accessibilityRole="button" accessibilityLabel={`${eyebrow} ${title}`}
    >
      <Animated.View style={[st.box, { width: size, height: size, backgroundColor: light ? C.hot : C.surface, borderColor: light ? C.hot : C.lineHi, transform: [{ scale: press }] }]}>
        {/* corner brackets */}
        <Svg style={StyleSheet.absoluteFill} width={size} height={size} pointerEvents="none">
          {[[8, 8, 1, 1], [size - 8, 8, -1, 1], [8, size - 8, 1, -1], [size - 8, size - 8, -1, -1]].map(([x, y, dx, dy], i) => (
            <Polyline key={i} points={`${x},${y + dy * B} ${x},${y} ${x + dx * B},${y}`} stroke={rule} strokeWidth={1.2} fill="none" />
          ))}
          {/* tick ruler along the bottom */}
          {Array.from({ length: Math.floor((size - 40) / 6) + 1 }, (_, i) => (
            <Line key={i} x1={20 + i * 6} x2={20 + i * 6} y1={size - 7} y2={size - (i % 5 ? 10 : 13)} stroke={rule} strokeWidth={1} />
          ))}
        </Svg>

        <View style={st.top}>
          <Text style={[st.index, { color: dim }]}>{index}</Text>
          <View style={st.eyebrowRow}>
            {live && <Animated.View style={[st.liveDot, { opacity: blink, backgroundColor: light ? C.onHot : C.live }]} />}
            <Text style={[st.eyebrow, { color: dim }]}>{eyebrow}</Text>
          </View>
        </View>

        <View style={st.glyph} pointerEvents="none">{children}</View>

        <View>
          <Text style={[st.title, { color: ink }]} numberOfLines={1} adjustsFontSizeToFit minimumFontScale={0.6}>{title}</Text>
          <Text style={[st.sub, { color: dim }]} numberOfLines={1}>{sub}</Text>
        </View>
      </Animated.View>
    </Pressable>
  );
}

type Pt = { lat: number; lng: number };

// A loop to draw when there's no route yet — a lap of an imaginary park.
const LOOP: Pt[] = Array.from({ length: 28 }, (_, i) => {
  const a = (i / 27) * Math.PI * 2;
  return { lat: Math.sin(a) * 1 + Math.sin(a * 3) * 0.18, lng: Math.cos(a) * 1.4 + Math.cos(a * 2) * 0.2 };
});

/** The last route over a dot grid, drawing itself on a loop, with a pulsing runner at its head. */
export function RunGlyph({ route, w, h, color = C.ink, grid = C.ghost }: { route: Pt[] | null; w: number; h: number; color?: string; grid?: string }) {
  const pts = route && route.length > 1 ? route : LOOP;
  const lats = pts.map(p => p.lat), lngs = pts.map(p => p.lng);
  const [a, b, c, d] = [Math.min(...lats), Math.max(...lats), Math.min(...lngs), Math.max(...lngs)];
  const pad = 8;
  const k = Math.min((w - pad * 2) / ((d - c) || 1), (h - pad * 2) / ((b - a) || 1));
  const ox = (w - (d - c) * k) / 2, oy = (h - (b - a) * k) / 2;
  const xy = pts.map(p => [ox + (p.lng - c) * k, h - oy - (p.lat - a) * k] as const);
  const len = xy.slice(1).reduce((s, p, i) => s + Math.hypot(p[0] - xy[i][0], p[1] - xy[i][1]), 0);

  const draw = useRef(new Animated.Value(0)).current;
  const pulse = useRef(new Animated.Value(0)).current;
  useEffect(() => {
    const loop = Animated.loop(Animated.sequence([
      Animated.timing(draw, { toValue: 1, duration: 2600, easing: Easing.inOut(Easing.cubic), useNativeDriver: false }),
      Animated.delay(900),
      Animated.timing(draw, { toValue: 0, duration: 0, useNativeDriver: false }),
    ]));
    const beat = Animated.loop(Animated.timing(pulse, { toValue: 1, duration: 1200, useNativeDriver: false }));
    loop.start(); beat.start();
    return () => { loop.stop(); beat.stop(); };
  }, [len]);

  const head = xy[xy.length - 1];
  const G = 10;
  return (
    <Svg width={w} height={h}>
      {Array.from({ length: Math.floor(w / G) }, (_, i) => Array.from({ length: Math.floor(h / G) }, (_, j) => (
        <Circle key={`${i}.${j}`} cx={G / 2 + i * G} cy={G / 2 + j * G} r={0.9} fill={grid} />
      )))}
      <Polyline points={xy.map(p => p.join(',')).join(' ')} stroke={grid} strokeWidth={2} fill="none" strokeLinejoin="round" />
      <AnimatedPolyline
        points={xy.map(p => p.join(',')).join(' ')} stroke={color} strokeWidth={2.4} fill="none" strokeLinejoin="round" strokeLinecap="round"
        strokeDasharray={`${len} ${len}`} strokeDashoffset={draw.interpolate({ inputRange: [0, 1], outputRange: [len, 0] })}
      />
      <AnimatedCircle cx={head[0]} cy={head[1]} r={pulse.interpolate({ inputRange: [0, 1], outputRange: [3, 11] })} fill="none" stroke={color}
        strokeOpacity={pulse.interpolate({ inputRange: [0, 1], outputRange: [0.8, 0] })} strokeWidth={1.2} />
      <Circle cx={head[0]} cy={head[1]} r={3} fill={color} />
      <Circle cx={xy[0][0]} cy={xy[0][1]} r={2.5} fill="none" stroke={color} strokeWidth={1.2} />
    </Svg>
  );
}


/** This week, Monday first: a column of dots per day, one per set (capped), today's top dot blinking. */
export function WeekDots({ counts, todayIdx, w, h, color = C.onHot, ghost = 'rgba(0,0,0,0.14)' }: {
  counts: number[]; todayIdx: number; w: number; h: number; color?: string; ghost?: string;
}) {
  const rows = 8;
  const gap = w / 7;
  const r = Math.min(gap, (h - 14) / rows) * 0.32;
  const blink = useRef(new Animated.Value(1)).current;
  useEffect(() => {
    const loop = Animated.loop(Animated.sequence([
      Animated.timing(blink, { toValue: 0.2, duration: 500, useNativeDriver: false }),
      Animated.timing(blink, { toValue: 1, duration: 500, useNativeDriver: false }),
    ]));
    loop.start();
    return () => loop.stop();
  }, []);
  const rowH = (h - 14) / rows;
  return (
    <Svg width={w} height={h}>
      {counts.map((n, i) => {
        const lit = Math.min(rows, Math.ceil(n / 3));
        return Array.from({ length: rows }, (_, j) => {
          const on = j < lit;
          const top = i === todayIdx && j === Math.min(rows - 1, lit);
          const props = { cx: gap / 2 + i * gap, cy: h - 14 - rowH / 2 - j * rowH, r };
          return top
            ? <AnimatedCircle key={`${i}.${j}`} {...props} fill={color} fillOpacity={blink} />
            : <Circle key={`${i}.${j}`} {...props} fill={on ? color : ghost} />;
        });
      })}
      {['M', 'T', 'W', 'T', 'F', 'S', 'S'].map((d, i) => (
        <Circle key={d + i} cx={gap / 2 + i * gap} cy={h - 4} r={i === todayIdx ? 2.2 : 1.2} fill={i === todayIdx ? color : ghost} />
      ))}
    </Svg>
  );
}

const st = StyleSheet.create({
  box: { borderWidth: 1, padding: 16, paddingBottom: 18, justifyContent: 'space-between', overflow: 'hidden' },
  top: { flexDirection: 'row', justifyContent: 'space-between', alignItems: 'center' },
  index: { fontFamily: F.dot, fontSize: 11, letterSpacing: 1 },
  eyebrowRow: { flexDirection: 'row', alignItems: 'center', gap: 6 },
  liveDot: { width: 6, height: 6, borderRadius: 3 },
  eyebrow: { fontFamily: F.dot, fontSize: 9, letterSpacing: 2 },
  glyph: { flex: 1, alignItems: 'center', justifyContent: 'center', marginVertical: 6 },
  title: { fontFamily: F.dot, fontSize: 26, letterSpacing: 1 },
  sub: { fontFamily: F.mono, fontSize: 10, letterSpacing: 1, marginTop: 2 },
});
