// A run on our own block map (lib/route-map.ts: OpenStreetMap building
// blocks, streets and their names, paths, water and parks — no raster tiles,
// no key). Buildings are dithered blocks shaded by height with a drop shadow;
// parks and water are dithered textures; everything is greyscale so the route
// is the only colour on it.
//
// The route draws itself on from the start as a fine dashed line over a soft
// tinted underglow, its colour a continuous gradient of pace against the
// run's own average — white at your usual pace, easing to green where you
// were quicker and red where you were slower. A dot rides the head (native
// driver), km markers drop in as it passes them, and with `hud` the map
// carries a live readout, scale bar, north arrow and pace legend.
// Offline, the streets drop out and a dot grid stands in.

import { memo, useEffect, useId, useMemo, useRef, useState, type ReactElement } from 'react';
import { Animated, Easing, StyleSheet, Text, View } from 'react-native';
import Svg, { Circle, Defs, G, Line, LinearGradient, Path, Pattern, Rect, Stop, Text as SvgText } from 'react-native-svg';
import { C, F, MAP } from '@/lib/theme';
import { mapFeatures, sampleRoute, type Bbox, type Feature } from '@/lib/route-map';
import type { Waypoint } from '@/lib/activityFormulas';


type RGB = [number, number, number];
const rgb = (h: string): RGB => [1, 3, 5].map(i => parseInt(h.slice(i, i + 2), 16)) as RGB;
const QUICK = rgb(C.live), USUAL = rgb(C.hot), SLOW = rgb(C.alert);
const ease = (x: number) => x * x * (3 - 2 * x);
/** Pace ratio (step pace ÷ run average) → colour: 12% quicker is full green, 15% slower full red. */
function paceRgb(r: number): RGB {
  const t = r < 1 ? Math.min(1, (1 - r) / 0.12) : Math.min(1, (r - 1) / 0.15);
  const to = r < 1 ? QUICK : SLOW, k = ease(t);
  return USUAL.map((m, i) => Math.round(m + (to[i] - m) * k)) as RGB;
}
const hex = (c: RGB, mul = 1) => '#' + c.map(v => Math.round(v * mul).toString(16).padStart(2, '0')).join('');
const clock = (s: number) => `${Math.floor(s / 60)}:${String(Math.round(s % 60)).padStart(2, '0')}`;

type Geo = { xy: (lat: number, lng: number) => [number, number]; view: Bbox; mPerPx: number; w: number; h: number };

function fit(wp: Waypoint[], w: number, h: number, pad: { l: number; r: number; t: number; b: number }): Geo {
  const lats = wp.map(p => p.lat), lngs = wp.map(p => p.lng);
  const [la0, la1, lo0, lo1] = [Math.min(...lats), Math.max(...lats), Math.min(...lngs), Math.max(...lngs)];
  const kx = Math.cos(((la0 + la1) / 2) * Math.PI / 180);
  const spanX = Math.max((lo1 - lo0) * kx, 0.0012), spanY = Math.max(la1 - la0, 0.0012);
  const k = Math.min((w - pad.l - pad.r) / spanX, (h - pad.t - pad.b) / spanY);
  const cx = (lo0 + lo1) / 2, cy = (la0 + la1) / 2;
  const X0 = pad.l + (w - pad.l - pad.r) / 2, Y0 = pad.t + (h - pad.t - pad.b) / 2;
  const xy = (lat: number, lng: number): [number, number] => [X0 + (lng - cx) * kx * k, Y0 - (lat - cy) * k];
  const lngAt = (x: number) => cx + (x - X0) / (kx * k), latAt = (y: number) => cy - (y - Y0) / k;
  return { xy, w, h, view: { w: lngAt(0), e: lngAt(w), n: latAt(0), s: latAt(h) }, mPerPx: 111_320 / k };
}

// ── The basemap: one Path per layer, so thousands of blocks are a handful of native nodes ──

const BaseMap = memo(function BaseMap({ feats, geo, names, uid }: { feats: Feature[]; geo: Geo; names: boolean; uid: string }) {
  const layers = useMemo(() => {
    const d: Record<string, string> = { park: '', water: '', waterway: '', path: '', rail: '', minor: '', major: '', b0: '', b1: '', b2: '' };
    const labels: { name: string; x: number; y: number; a: number; len: number }[] = [];
    const M = 6;
    for (const f of feats) {
      let s = '', x0 = 1e9, x1 = -1e9, y0 = 1e9, y1 = -1e9;
      const P = f.pts.map(([la, lo]) => {
        const p = geo.xy(la, lo);
        if (p[0] < x0) x0 = p[0]; if (p[0] > x1) x1 = p[0]; if (p[1] < y0) y0 = p[1]; if (p[1] > y1) y1 = p[1];
        return p;
      });
      if (x1 < -M || x0 > geo.w + M || y1 < -M || y0 > geo.h + M) continue;
      if (f.kind === 'name') {
        if (!names) continue;
        let best = 0, at = 0;
        for (let i = 1; i < P.length; i++) { const l = Math.hypot(P[i][0] - P[i - 1][0], P[i][1] - P[i - 1][1]); if (l > best) { best = l; at = i; } }
        if (!best) continue;
        const [a, b] = [P[at - 1], P[at]];
        let ang = (Math.atan2(b[1] - a[1], b[0] - a[0]) * 180) / Math.PI;
        if (ang > 90) ang -= 180; if (ang < -90) ang += 180;
        labels.push({ name: f.name!.toUpperCase(), x: (a[0] + b[0]) / 2, y: (a[1] + b[1]) / 2, a: ang, len: best });
        continue;
      }
      if (f.kind === 'building' && x1 - x0 < 1.1 && y1 - y0 < 1.1) continue; // sub-pixel sheds
      for (let i = 0; i < P.length; i++) s += `${i ? 'L' : 'M'}${P[i][0].toFixed(1)} ${P[i][1].toFixed(1)}`;
      if (f.closed) s += 'Z';
      const key = f.kind === 'building' ? ((f.h ?? 0) < 10 ? 'b0' : (f.h ?? 0) < 24 ? 'b1' : 'b2') : f.kind;
      d[key] += s;
    }
    // A few street names on their longest straight run, longest first, never crowding.
    const placed: typeof labels = [];
    const seen = new Set<string>();
    for (const l of labels.sort((p, q) => q.len - p.len)) {
      if (placed.length >= 7) break;
      if (seen.has(l.name) || l.len < l.name.length * 3.9 + 6) continue;
      if (l.x < 14 || l.x > geo.w - 14 || l.y < 14 || l.y > geo.h - 14) continue;
      if (placed.some(p => Math.hypot(p.x - l.x, p.y - l.y) < 46)) continue;
      seen.add(l.name);
      placed.push(l);
    }
    return { d, labels: placed };
  }, [feats, geo, names]);

  const { d, labels } = layers;
  const blocks = d.b0 + d.b1 + d.b2;
  return (
    <Svg width={geo.w} height={geo.h}>
      <Defs>
        <Pattern id={`pk${uid}`} width={4} height={4} patternUnits="userSpaceOnUse">
          <Rect width={4} height={4} fill={MAP.park} /><Rect x={1} y={1} width={1} height={1} fill={MAP.parkDot} /><Rect x={3} y={3} width={1} height={1} fill={MAP.parkDot} />
        </Pattern>
        <Pattern id={`wt${uid}`} width={5} height={3} patternUnits="userSpaceOnUse">
          <Rect width={5} height={3} fill={MAP.water} /><Rect y={1} width={3} height={0.8} fill={MAP.waterLine} />
        </Pattern>
        <Pattern id={`b0${uid}`} width={3} height={3} patternUnits="userSpaceOnUse">
          <Rect width={3} height={3} fill={MAP.low[0]} /><Rect x={1} y={1} width={1} height={1} fill={MAP.low[1]} />
        </Pattern>
        <Pattern id={`b1${uid}`} width={2} height={2} patternUnits="userSpaceOnUse">
          <Rect width={2} height={2} fill={MAP.mid[0]} /><Rect width={1} height={1} fill={MAP.mid[1]} />
        </Pattern>
        <Pattern id={`b2${uid}`} width={2} height={2} patternUnits="userSpaceOnUse">
          <Rect width={2} height={2} fill={MAP.tall[0]} /><Rect width={1} height={1} fill={MAP.tall[1]} /><Rect x={1} y={1} width={1} height={1} fill={MAP.tall[1]} />
        </Pattern>
      </Defs>
      <Rect width={geo.w} height={geo.h} fill={MAP.ground} />
      {!!d.park && <Path d={d.park} fill={`url(#pk${uid})`} />}
      {!!d.water && <Path d={d.water} fill={`url(#wt${uid})`} fillRule="evenodd" />}
      {!!d.waterway && <Path d={d.waterway} fill="none" stroke={MAP.waterLine} strokeWidth={2} strokeLinecap="round" />}
      {!!d.minor && <Path d={d.minor} fill="none" stroke={MAP.minor} strokeWidth={1.6} strokeLinecap="round" strokeLinejoin="round" />}
      {!!d.major && <Path d={d.major} fill="none" stroke={MAP.major} strokeWidth={3} strokeLinecap="round" strokeLinejoin="round" />}
      {!!d.rail && <Path d={d.rail} fill="none" stroke={MAP.rail} strokeWidth={1} strokeDasharray="4 2" />}
      {!!d.path && <Path d={d.path} fill="none" stroke={MAP.path} strokeWidth={0.8} strokeDasharray="1 1.6" />}
      {/* blocks: a hard shadow down-right, then the dithered tops */}
      {!!blocks && <Path d={blocks} fill={MAP.shade} fillRule="evenodd" transform="translate(0.9 1.2)" />}
      {!!d.b0 && <Path d={d.b0} fill={`url(#b0${uid})`} fillRule="evenodd" />}
      {!!d.b1 && <Path d={d.b1} fill={`url(#b1${uid})`} fillRule="evenodd" />}
      {!!d.b2 && <Path d={d.b2} fill={`url(#b2${uid})`} fillRule="evenodd" />}
      {labels.map(l => (
        <G key={l.name} transform={`rotate(${l.a.toFixed(1)} ${l.x.toFixed(1)} ${l.y.toFixed(1)})`}>
          <SvgText x={l.x} y={l.y + 2} fontSize={6.5} fontFamily={F.mono} textAnchor="middle" fill={MAP.ground} stroke={MAP.ground} strokeWidth={2.4} letterSpacing={0.6}>{l.name}</SvgText>
          <SvgText x={l.x} y={l.y + 2} fontSize={6.5} fontFamily={F.mono} textAnchor="middle" fill={MAP.label} letterSpacing={0.6}>{l.name}</SvgText>
        </G>
      ))}
    </Svg>
  );
});

/** Offline stand-in. */
const Grid = memo(function Grid({ w, h }: { w: number; h: number }) {
  const dots: ReactElement[] = [];
  for (let x = 6; x < w; x += 12) for (let y = 6; y < h; y += 12) dots.push(<Circle key={`${x}.${y}`} cx={x} cy={y} r={0.7} fill={C.ghost} />);
  return <Svg width={w} height={h}>{dots}</Svg>;
});

const SCALES = [50, 100, 200, 250, 500, 1000, 2000, 5000, 10000];

export function RouteMap({ waypoints, width, height, playing = true, durationMs, live, hud, legend, onDrawn, onKm, onHead }: {
  waypoints: Waypoint[];
  width: number;
  height: number;
  /** Start drawing the route on (hold false until the screen is ready for it). */
  playing?: boolean;
  /** Draw-on time; defaults to 3.4–5.5 s by route length. */
  durationMs?: number;
  /** A route still being recorded: no draw-on, the head pulses. */
  live?: boolean;
  /** Full detail: street names, live readout, km labels, scale, north, legend. */
  hud?: boolean;
  /** Just the pace legend. */
  legend?: boolean;
  onDrawn?: () => void;
  /** Called as the head passes each whole km (1, 2, …). */
  onKm?: (km: number) => void;
  /** Live: where the head is on the map, as it moves. */
  onHead?: (x: number, y: number) => void;
}) {
  const uid = useId().replace(/[^a-zA-Z0-9]/g, '');
  const [feats, setFeats] = useState<Feature[]>([]);
  const mapIn = useRef(new Animated.Value(0)).current;
  const prog = useRef(new Animated.Value(live ? 1 : 0)).current;
  const pulse = useRef(new Animated.Value(0)).current;

  // Camera: fit the route; while recording, only refit once it nears the edge.
  const last = useRef<Geo | null>(null);
  const pad = hud ? { l: 20, r: 20, t: 46, b: 34 } : { l: 16, r: 16, t: 16, b: 16 };
  const lastWp = waypoints[waypoints.length - 1];
  const geo = useMemo(() => {
    if (!waypoints.length) return null;
    const prev = last.current;
    if (live && prev && prev.w === width && prev.h === height && waypoints.every(p => {
      const [x, y] = prev.xy(p.lat, p.lng);
      return x > width * 0.1 && x < width * 0.9 && y > height * 0.1 && y < height * 0.9;
    })) return prev;
    return (last.current = fit(waypoints, width, height, live ? { l: width * 0.25, r: width * 0.25, t: height * 0.25, b: height * 0.25 } : pad));
  }, [waypoints.length, waypoints[0]?.timestamp, lastWp?.timestamp, width, height, hud, live]);

  // The streets under the view, tile-cached; fade in when they land.
  const viewKey = geo ? [geo.view.s, geo.view.w, geo.view.n, geo.view.e].map(v => v.toFixed(4)).join() : '';
  useEffect(() => {
    if (!geo) return;
    let alive = true;
    const v = geo.view, dy = (v.n - v.s) * 0.05, dx = (v.e - v.w) * 0.05;
    void mapFeatures({ s: v.s - dy, n: v.n + dy, w: v.w - dx, e: v.e + dx }).then(f => {
      if (!alive || !f.length) return;
      setFeats(f);
      Animated.timing(mapIn, { toValue: 1, duration: 520, easing: Easing.out(Easing.cubic), useNativeDriver: true }).start();
    });
    return () => { alive = false; };
  }, [viewKey]);

  const S = useMemo(() => sampleRoute(waypoints, live ? 200 : 260), [waypoints.length, waypoints[0]?.timestamp, lastWp?.timestamp]);
  const N = S.lat.length;
  const pts = useMemo(() => (geo ? S.lat.map((la, i) => geo.xy(la, S.lng[i])) : []), [S, geo]);

  // Every step as its own pair of lines (underglow + fine dash), built once;
  // the draw-on just shows more of the same elements.
  const segs = useMemo(() => {
    const glow: ReactElement[] = [], dash: ReactElement[] = [], col: string[] = [];
    let L = 0;
    for (let i = 0; i < pts.length - 1; i++) {
      const [a, b] = [pts[i], pts[i + 1]];
      const c = paceRgb(S.ratio[i] ?? 1);
      col.push(hex(c));
      glow.push(<Line key={i} x1={a[0]} y1={a[1]} x2={b[0]} y2={b[1]} stroke={hex(c, 0.3)} strokeWidth={6} strokeLinecap="round" />);
      dash.push(<Line key={i} x1={a[0]} y1={a[1]} x2={b[0]} y2={b[1]} stroke={hex(c)} strokeWidth={1.6} strokeDasharray="1.6 2.2" strokeDashoffset={L % 3.8} />);
      L += Math.hypot(b[0] - a[0], b[1] - a[1]);
    }
    return { glow, dash, col };
  }, [pts]);

  const tip = live && N >= 2 ? pts[N - 1] : null;
  useEffect(() => { if (tip) onHead?.(tip[0], tip[1]); }, [tip?.[0], tip?.[1]]);

  const [n, setN] = useState(live ? Math.max(0, N - 1) : 0);
  // Set by the animation's end, not by n: unmounting the head early would
  // detach `prog` and cancel the animation before it reports done.
  const [drawn, setDrawn] = useState(!!live);
  const nRef = useRef(n);
  const kmRef = useRef(0);
  const dur = durationMs ?? Math.min(5500, Math.max(3400, 2400 + N * 10));

  useEffect(() => {
    if (live) { setN(Math.max(0, N - 1)); return; }
    if (!playing || N < 2) return;
    prog.setValue(0);
    nRef.current = 0; kmRef.current = 0; setN(0); setDrawn(false);
    const id = prog.addListener(({ value }) => {
      const k = Math.min(N - 1, Math.round(value * (N - 1)));
      if (k !== nRef.current) { nRef.current = k; setN(k); }
    });
    const anim = Animated.timing(prog, { toValue: 1, duration: dur, easing: Easing.bezier(0.42, 0, 0.3, 1), useNativeDriver: true });
    anim.start(({ finished }) => { if (finished) { nRef.current = N - 1; setN(N - 1); setDrawn(true); onDrawn?.(); } });
    return () => { anim.stop(); prog.removeListener(id); };
  }, [playing, S, live]);

  useEffect(() => {
    if (live) return;
    while (kmRef.current < S.km.length && S.km[kmRef.current] <= n) {
      kmRef.current++;
      onKm?.(kmRef.current);
    }
  }, [n]);

  useEffect(() => {
    if (!live) return;
    const l = Animated.loop(Animated.timing(pulse, { toValue: 1, duration: 1300, useNativeDriver: true }));
    l.start();
    return () => l.stop();
  }, [live]);

  if (!geo || N < 2) {
    return <View style={[st.box, { width, height }]}><Grid w={width} h={height} /></View>;
  }

  const done = live || drawn;
  const head = pts[n];
  const range = pts.map((_, i) => i / (N - 1));
  const headX = live ? head[0] : prog.interpolate({ inputRange: range, outputRange: pts.map(p => p[0]) });
  const headY = live ? head[1] : prog.interpolate({ inputRange: range, outputRange: pts.map(p => p[1]) });

  // Splits for the km markers and the fastest-km ring.
  const kmTimes = S.km.map((k, i) => S.s[k] - (i ? S.s[S.km[i - 1]] : 0));
  const fastest = kmTimes.length > 1 ? kmTimes.indexOf(Math.min(...kmTimes)) : -1;
  const [sx, sy] = pts[0], [ex, ey] = pts[N - 1];
  const loop = Math.hypot(ex - sx, ey - sy) < 10;

  const scaleM = SCALES.filter(m => m / geo.mPerPx <= width * 0.24).pop() ?? 50;
  const scalePx = scaleM / geo.mPerPx;
  const paceNow = (S.ratio[Math.min(n, S.ratio.length - 1)] ?? 1) * S.avg;

  return (
    <View style={[st.box, { width, height }]}>
      <Grid w={width} h={height} />
      <Animated.View style={[StyleSheet.absoluteFill, { opacity: mapIn }]}>
        {feats.length > 0 && <BaseMap feats={feats} geo={geo} names={!!hud} uid={uid} />}
      </Animated.View>

      <Svg width={width} height={height} style={StyleSheet.absoluteFill}>
        {segs.glow.slice(0, n)}
        {segs.dash.slice(0, n)}
        {/* km markers, dropping in as the head passes */}
        {S.km.map((k, i) => k <= n && (
          <G key={i}>
            {done && i === fastest && hud && <Circle cx={pts[k][0]} cy={pts[k][1]} r={9.5} fill="none" stroke={C.live} strokeWidth={0.8} strokeDasharray="1.5 1.5" />}
            <Circle cx={pts[k][0]} cy={pts[k][1]} r={hud ? 5.8 : 2.6} fill={C.bg} stroke={segs.col[Math.max(0, k - 1)]} strokeWidth={1} />
            {hud && <SvgText x={pts[k][0]} y={pts[k][1] + 2.3} fontSize={6.5} fontFamily={F.mono} textAnchor="middle" fill={segs.col[Math.max(0, k - 1)]}>{i + 1}</SvgText>}
          </G>
        ))}
        {/* finish: a small chequer */}
        {done && !live && (
          <G transform={`translate(${(loop ? ex + 7 : ex) - 4} ${(loop ? ey - 7 : ey) - 4})`}>
            <Rect width={8} height={8} fill={C.bg} stroke={C.hot} strokeWidth={0.8} />
            <Rect width={4} height={4} fill={C.hot} /><Rect x={4} y={4} width={4} height={4} fill={C.hot} />
          </G>
        )}
        <Circle cx={sx} cy={sy} r={3.4} fill={C.live} stroke={C.bg} strokeWidth={1.5} />
        {hud && done && fastest >= 0 && (() => {
          // the tag sits outboard of the route, away from its middle
          const [fx, fy] = pts[S.km[fastest]];
          const mx = pts.reduce((v, p) => v + p[0], 0) / N, my = pts.reduce((v, p) => v + p[1], 0) / N;
          const dx = fx - mx, dy = fy - my;
          // beside the marker if the ~54 px tag fits that side, else above/below it
          const side = Math.abs(dx) > Math.abs(dy) && (dx < 0 ? fx - 13 - 54 > 4 : fx + 13 + 54 < width - 4);
          const anchor = side ? (dx < 0 ? 'end' : 'start') : 'middle';
          const tx = side ? fx + Math.sign(dx) * 13 : Math.min(width - 30, Math.max(30, fx)), ty = side ? fy + 2 : fy + Math.sign(dy || 1) * 17 + 2;
          return <SvgText x={tx} y={ty} fontSize={6} fontFamily={F.mono} textAnchor={anchor} fill={C.live} letterSpacing={0.8}>{`FASTEST ${clock(kmTimes[fastest])}`}</SvgText>;
        })()}
      </Svg>

      {/* the head */}
      {(!done || live) && (
        <Animated.View pointerEvents="none" style={[st.head, { transform: [{ translateX: headX }, { translateY: headY }] }]}>
          <View style={[st.halo, { borderColor: segs.col[Math.max(0, n - 1)] ?? C.hot }]} />
          <View style={st.core} />
          {live && (
            <Animated.View style={[st.ring, {
              opacity: pulse.interpolate({ inputRange: [0, 1], outputRange: [0.9, 0] }),
              transform: [{ scale: pulse.interpolate({ inputRange: [0, 1], outputRange: [0.4, 1.6] }) }],
            }]} />
          )}
        </Animated.View>
      )}

      {hud && (
        <>
          <View style={st.readout} pointerEvents="none">
            <View style={st.readRow}>
              <Text style={st.readBig}>{(S.m[n] / 1000).toFixed(2)}</Text>
              <Text style={st.readUnit}>KM</Text>
            </View>
            <Text style={st.readSub}>{`${clock(S.s[n])} · ${S.avg ? clock(done ? S.avg : paceNow) : '--'} /KM${done ? ' AVG' : ''}`}</Text>
          </View>
          <View style={st.north} pointerEvents="none">
            <Svg width={10} height={12}><Path d="M5 0 L10 12 L5 9 L0 12 Z" fill={C.ink} /><Path d="M5 0 L5 9 L0 12 Z" fill={C.faint} /></Svg>
            <Text style={st.northText}>N</Text>
          </View>
          <View style={st.scale} pointerEvents="none">
            <View style={[st.scaleBar, { width: scalePx }]} />
            <Text style={st.scaleText}>{scaleM >= 1000 ? `${scaleM / 1000} KM` : `${scaleM} M`}</Text>
          </View>
        </>
      )}
      {(hud || legend) && (
        <View style={st.legend} pointerEvents="none">
          <Text style={st.legendText}>SLOW</Text>
          <Svg width={46} height={4}>
            <Defs>
              <LinearGradient id={`pg${uid}`} x1="0" y1="0" x2="1" y2="0">
                <Stop offset="0" stopColor={hex(SLOW)} /><Stop offset="0.5" stopColor={hex(USUAL)} /><Stop offset="1" stopColor={hex(QUICK)} />
              </LinearGradient>
            </Defs>
            <Rect width={46} height={4} rx={1} fill={`url(#pg${uid})`} />
          </Svg>
          <Text style={st.legendText}>FAST</Text>
        </View>
      )}
      {feats.length > 0 && <Text style={st.credit}>© OPENSTREETMAP</Text>}
    </View>
  );
}

const st = StyleSheet.create({
  box: { backgroundColor: MAP.ground, overflow: 'hidden' },
  head: { position: 'absolute', left: -9, top: -9, width: 18, height: 18, alignItems: 'center', justifyContent: 'center' },
  halo: { position: 'absolute', width: 14, height: 14, borderRadius: 7, borderWidth: 1, opacity: 0.6 },
  core: { width: 6, height: 6, borderRadius: 3, backgroundColor: C.hot },
  ring: { position: 'absolute', width: 24, height: 24, borderRadius: 12, borderWidth: 1.5, borderColor: C.hot },

  readout: { position: 'absolute', left: 10, top: 8 },
  readRow: { flexDirection: 'row', alignItems: 'baseline', gap: 4 },
  readBig: { fontFamily: F.dot, fontSize: 17, color: C.ink },
  readUnit: { fontFamily: F.dot, fontSize: 9, color: C.dim, letterSpacing: 1 },
  readSub: { fontFamily: F.mono, fontSize: 9, color: C.dim, letterSpacing: 0.5, marginTop: 1 },
  north: { position: 'absolute', right: 10, top: 9, alignItems: 'center', gap: 2 },
  northText: { fontFamily: F.dot, fontSize: 8, color: C.dim },
  scale: { position: 'absolute', left: 10, bottom: 9, gap: 3 },
  scaleBar: { height: 4, borderWidth: 1, borderTopWidth: 0, borderColor: C.dim },
  scaleText: { fontFamily: F.mono, fontSize: 8, color: C.dim, letterSpacing: 0.5 },
  legend: { position: 'absolute', right: 10, bottom: 16, width: 104, flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between' },
  legendText: { fontFamily: F.dot, fontSize: 7, color: C.dim, letterSpacing: 1 },
  credit: { position: 'absolute', right: 10, bottom: 4, fontFamily: F.mono, fontSize: 6.5, color: C.faint },
});
