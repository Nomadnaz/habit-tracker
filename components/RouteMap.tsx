// A run on our own black-and-white map (lib/route-map.ts: OpenStreetMap
// streets, paths, water and parks, no tiles, no key). The route draws itself
// on from the start as a dashed line — white at your usual pace, green where
// you were quicker, red where you were slower — with a dot riding its head.
// Offline, the streets drop out and a dot grid stands in.

import { useEffect, useMemo, useRef, useState } from 'react';
import { Animated, Easing, StyleSheet, Text, View } from 'react-native';
import Svg, { Circle, Path, Polyline } from 'react-native-svg';
import { C, F } from '@/lib/theme';
import { mapFeatures, paceClasses, routeBbox, type Feature, type PaceClass } from '@/lib/route-map';
import type { Waypoint } from '@/lib/activityFormulas';

const TONE: Record<PaceClass, string> = { fast: C.live, steady: C.hot, slow: C.alert };
const STREET: Record<Feature['kind'], { stroke: string; width: number; dash?: string; fill?: string }> = {
  park: { stroke: 'transparent', width: 0, fill: C.surface },
  water: { stroke: 'transparent', width: 0, fill: C.ghost },
  waterway: { stroke: C.ghost, width: 2.4 },
  path: { stroke: C.line, width: 0.8, dash: '2 2' },
  rail: { stroke: C.faint, width: 0.8, dash: '6 3' },
  minor: { stroke: C.lineHi, width: 1 },
  major: { stroke: C.faint, width: 1.8 },
};

export function RouteMap({ waypoints, width, height, playing = true, durationMs = 1800, live, legend, onDrawn }: {
  waypoints: Waypoint[];
  width: number;
  height: number;
  /** Start drawing the route on (hold false until the screen is ready for it). */
  playing?: boolean;
  durationMs?: number;
  /** A route still being recorded: no draw-on, the head pulses. */
  live?: boolean;
  legend?: boolean;
  onDrawn?: () => void;
}) {
  const [feats, setFeats] = useState<Feature[]>([]);
  const [shown, setShown] = useState(live ? 1 : 0);
  const prog = useRef(new Animated.Value(live ? 1 : 0)).current;
  const pulse = useRef(new Animated.Value(0)).current;

  // The map for this area — refetched only when the route outgrows it.
  const area = useRef<ReturnType<typeof routeBbox> | null>(null);
  useEffect(() => {
    if (waypoints.length < 1) return;
    const want = routeBbox(waypoints);
    const a = area.current;
    if (a && want.s >= a.s && want.n <= a.n && want.w >= a.w && want.e <= a.e) return;
    area.current = routeBbox(waypoints, live ? 0.6 : 0.25);
    let alive = true;
    void mapFeatures(area.current).then(f => { if (alive) setFeats(f); });
    return () => { alive = false; };
  }, [waypoints.length]);

  useEffect(() => {
    if (live || !playing) return;
    prog.setValue(0);
    const id = prog.addListener(({ value }) => setShown(value));
    Animated.timing(prog, { toValue: 1, duration: durationMs, easing: Easing.inOut(Easing.cubic), useNativeDriver: false }).start(({ finished }) => finished && onDrawn?.());
    return () => prog.removeListener(id);
  }, [playing, waypoints.length > 1 ? waypoints[0].timestamp : 0]);

  useEffect(() => {
    if (!live) return;
    const l = Animated.loop(Animated.timing(pulse, { toValue: 1, duration: 1300, useNativeDriver: false }));
    l.start();
    return () => l.stop();
  }, [live]);

  // One projection for streets and route: equirectangular, longitude scaled for latitude.
  const geo = useMemo(() => {
    if (waypoints.length < 1) return null;
    const lats = waypoints.map(p => p.lat), lngs = waypoints.map(p => p.lng);
    const [la0, la1, lo0, lo1] = [Math.min(...lats), Math.max(...lats), Math.min(...lngs), Math.max(...lngs)];
    const kx = Math.cos(((la0 + la1) / 2) * Math.PI / 180);
    const pad = 22;
    const spanX = Math.max((lo1 - lo0) * kx, 0.0012), spanY = Math.max(la1 - la0, 0.0012);
    const k = Math.min((width - pad * 2) / spanX, (height - pad * 2) / spanY);
    const cx = (lo0 + lo1) / 2, cy = (la0 + la1) / 2;
    const xy = (lat: number, lng: number): [number, number] => [width / 2 + (lng - cx) * kx * k, height / 2 - (lat - cy) * k];
    return { xy };
  }, [waypoints.length, waypoints[0]?.lat, width, height]);

  const streets = useMemo(() => {
    if (!geo) return [];
    return feats.map((f, i) => {
      const d = f.pts.map(([la, lo], j) => { const [x, y] = geo.xy(la, lo); return `${j ? 'L' : 'M'}${x.toFixed(1)} ${y.toFixed(1)}`; }).join('') + (f.closed ? 'Z' : '');
      const st = STREET[f.kind];
      return <Path key={i} d={d} fill={f.closed && st.fill ? st.fill : 'none'} stroke={st.stroke} strokeWidth={st.width} strokeDasharray={st.dash} strokeLinejoin="round" strokeLinecap="round" />;
    });
  }, [feats, geo]);

  const grid = useMemo(() => {
    const out = [];
    const G = 12;
    for (let x = G / 2; x < width; x += G) for (let y = G / 2; y < height; y += G) out.push(<Circle key={`${x}.${y}`} cx={x} cy={y} r={0.7} fill={C.ghost} />);
    return out;
  }, [width, height]);

  const paces = useMemo(() => paceClasses(waypoints), [waypoints.length]);

  if (!geo || waypoints.length < 2) {
    return <View style={[st.box, { width, height }]}><Svg width={width} height={height}>{grid}</Svg></View>;
  }

  // Draw-on: the first `n` segments, grouped into runs of one pace colour.
  const pts = waypoints.map(p => geo.xy(p.lat, p.lng));
  const n = Math.max(1, Math.round(shown * (pts.length - 1)));
  const runs: { cls: PaceClass; pts: string }[] = [];
  for (let i = 0; i < n; i++) {
    const cls = paces[i] ?? 'steady';
    const a = pts[i], b = pts[i + 1];
    const last = runs[runs.length - 1];
    if (last && last.cls === cls) last.pts += ` ${b[0].toFixed(1)},${b[1].toFixed(1)}`;
    else runs.push({ cls, pts: `${a[0].toFixed(1)},${a[1].toFixed(1)} ${b[0].toFixed(1)},${b[1].toFixed(1)}` });
  }
  const head = pts[n];

  return (
    <View style={[st.box, { width, height }]}>
      <Svg width={width} height={height}>
        {feats.length ? streets : grid}
        {/* the route's shadow, so it reads over streets */}
        {runs.map((r, i) => <Polyline key={`s${i}`} points={r.pts} fill="none" stroke={C.bg} strokeWidth={5} strokeLinecap="round" strokeLinejoin="round" />)}
        {runs.map((r, i) => (
          <Polyline key={i} points={r.pts} fill="none" stroke={TONE[r.cls]} strokeWidth={2.4} strokeDasharray="6 4" strokeLinecap="round" strokeLinejoin="round" />
        ))}
        <Circle cx={pts[0][0]} cy={pts[0][1]} r={4} fill={C.live} stroke={C.bg} strokeWidth={1.5} />
        {shown >= 1 && !live && <Circle cx={pts[pts.length - 1][0]} cy={pts[pts.length - 1][1]} r={4.5} fill={C.bg} stroke={C.hot} strokeWidth={2} />}
        {(shown < 1 || live) && <Circle cx={head[0]} cy={head[1]} r={3.6} fill={C.hot} />}
      </Svg>
      {live && (
        <Animated.View pointerEvents="none" style={[st.ring, {
          left: head[0] - 12, top: head[1] - 12,
          opacity: pulse.interpolate({ inputRange: [0, 1], outputRange: [0.9, 0] }),
          transform: [{ scale: pulse.interpolate({ inputRange: [0, 1], outputRange: [0.4, 1.5] }) }],
        }]} />
      )}
      {legend && (
        <View style={st.legend}>
          {(['fast', 'steady', 'slow'] as const).map(k => (
            <View key={k} style={st.legendItem}>
              <View style={[st.legendDash, { backgroundColor: TONE[k] }]} />
              <Text style={st.legendText}>{k === 'fast' ? 'QUICKER' : k === 'steady' ? 'USUAL' : 'SLOWER'}</Text>
            </View>
          ))}
        </View>
      )}
      {feats.length > 0 && <Text style={st.credit}>© OPENSTREETMAP</Text>}
    </View>
  );
}

const st = StyleSheet.create({
  box: { backgroundColor: C.bg, overflow: 'hidden' },
  ring: { position: 'absolute', width: 24, height: 24, borderRadius: 12, borderWidth: 1.5, borderColor: C.hot },
  legend: { position: 'absolute', left: 8, bottom: 6, flexDirection: 'row', gap: 10 },
  legendItem: { flexDirection: 'row', alignItems: 'center', gap: 4 },
  legendDash: { width: 10, height: 2.5, borderRadius: 1 },
  legendText: { fontFamily: F.dot, fontSize: 7, color: C.dim, letterSpacing: 1 },
  credit: { position: 'absolute', right: 6, bottom: 4, fontFamily: F.mono, fontSize: 7, color: C.faint },
});
