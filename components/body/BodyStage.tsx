// The BODY tab's stage: an exploded axonometric of the front and back plates
// over a dot floor, with floating annotation cards on leader lines.
//   drag sideways  → spin (with momentum)          tap a region → select
//   drag a card    → move it (offset is saved)     view presets → spring to angle
import { useEffect, useMemo, useRef, useState } from 'react';
import { View, Text, StyleSheet, PanResponder, Animated, Pressable } from 'react-native';
import Svg, { Polygon, Polyline, Line, Rect, Circle, Defs, Pattern, G, Text as SvgText } from 'react-native-svg';
import { C, F } from '@/lib/theme';
import {
  REGIONS, REGION_BY_ID, FLOOR_Y, toWorld, project, facing, centroid,
  type BodyMap, type Cam, type Plate, type Tone,
} from '@/lib/body-map';

export const TONE: Record<Tone, string> = { hot: C.hot, signal: C.signal, live: C.live, dim: C.dim, alert: C.alert };

const LABEL_W = 116;
const LABEL_H = 54;
const RAD_PER_PX = 0.011;

interface Props {
  width: number;
  height: number;
  map: BodyMap;
  selected: string | null;
  filter: string | null;
  yawTarget: { yaw: number; key: number };
  onSelect: (id: string | null) => void;
  onMoveLabel: (id: string, dx: number, dy: number) => void;
}

export function BodyStage({ width: W, height: H, map, selected, filter, yawTarget, onSelect, onMoveLabel }: Props) {
  const yawAnim = useRef(new Animated.Value(yawTarget.yaw)).current;
  const [yaw, setYaw] = useState(yawTarget.yaw);
  const startYaw = useRef(0);

  useEffect(() => {
    const id = yawAnim.addListener(({ value }) => setYaw(value));
    return () => yawAnim.removeListener(id);
  }, []);

  // presets: take the shortest way round, then spring (overshoots a touch)
  useEffect(() => {
    if (yawTarget.key === 0) return;
    yawAnim.stopAnimation(cur => {
      const turns = Math.round((cur - yawTarget.yaw) / (2 * Math.PI));
      Animated.spring(yawAnim, { toValue: yawTarget.yaw + turns * 2 * Math.PI, friction: 6, tension: 50, useNativeDriver: false }).start();
    });
  }, [yawTarget.key]);

  const pan = useMemo(() => PanResponder.create({
    onMoveShouldSetPanResponder: (_, g) => Math.abs(g.dx) > 6 && Math.abs(g.dx) > Math.abs(g.dy) * 1.2,
    onPanResponderTerminationRequest: () => false,
    onPanResponderGrant: () => { yawAnim.stopAnimation(v => { startYaw.current = v; }); },
    onPanResponderMove: (_, g) => yawAnim.setValue(startYaw.current + g.dx * RAD_PER_PX),
    onPanResponderRelease: (_, g) => {
      Animated.decay(yawAnim, { velocity: g.vx * RAD_PER_PX, deceleration: 0.994, useNativeDriver: false }).start();
    },
  }), []);

  const scale = (H - 36) / 470;
  const cam: Cam = { yaw, scale, cx: W / 2, top: 14 };
  const P = (plate: Plate, p: [number, number]) => project(cam, toWorld(plate, p));
  const pts = (plate: Plate, list: [number, number][]) => list.map(p => P(plate, p).slice(0, 2).join(',')).join(' ');

  // far plate first
  const plateDepth = (plate: Plate) => P(plate, [0, 200])[2];
  const plates: Plate[] = plateDepth('front') >= plateDepth('back') ? ['back', 'front'] : ['front', 'back'];

  const catById = Object.fromEntries(map.categories.map(c => [c.id, c]));
  const toneOf = (id: string): Tone | null => {
    const m = map.marks[id];
    const c = m && catById[m.category];
    return c ? c.tone : null;
  };

  // floor: a 15 × 11 lattice of dots under the feet
  const floor: [number, number][] = [];
  for (let x = -140; x <= 140; x += 20) for (let z = -100; z <= 100; z += 20) {
    const [sx, sy] = project(cam, [x, FLOOR_Y, z]);
    floor.push([sx, sy]);
  }

  // exploded-view connectors between the plates
  const links: [number, number][] = [[0, 5], [80, 234], [-80, 234], [38, 416], [-38, 416]];

  // ── annotation layout ──
  const annotated = REGIONS.filter(r => (map.marks[r.id]?.pinned && (!filter || map.marks[r.id].category === filter)) || r.id === selected);
  const cards = layoutCards(annotated.map(r => {
    const [ax, ay] = P(r.plate, centroid(r.pts));
    const m = map.marks[r.id];
    return { id: r.id, ax, ay, dx: m?.dx ?? 0, dy: m?.dy ?? 0, away: facing(r.plate, yaw) < 0 };
  }), W, H);

  // gizmo
  const g0: [number, number] = [34, H - 30];
  const axis = (v: [number, number, number]) => {
    const [x0, y0] = project({ ...cam, cx: 0, top: 0, scale: 1 }, [0, 0, 0]);
    const [x1, y1] = project({ ...cam, cx: 0, top: 0, scale: 1 }, v);
    return [g0[0] + (x1 - x0), g0[1] + (y1 - y0)] as [number, number];
  };
  const gx = axis([20, 0, 0]), gy = axis([0, -22, 0]), gz = axis([0, 0, 20]);

  return (
    <View style={{ width: W, height: H }} {...pan.panHandlers}>
      <Svg width={W} height={H}>
        <Defs>
          <Pattern id="p-idle" width={4} height={4} patternUnits="userSpaceOnUse">
            <Rect x={1} y={1} width={1.2} height={1.2} fill="#3A3A3A" />
          </Pattern>
          {(Object.keys(TONE) as Tone[]).map(t => (
            <Pattern key={t} id={`p-${t}`} width={3} height={3} patternUnits="userSpaceOnUse">
              <Rect x={0.5} y={0.5} width={1.7} height={1.7} fill={TONE[t]} />
            </Pattern>
          ))}
        </Defs>

        <Rect x={0} y={0} width={W} height={H} fill={C.bg} fillOpacity={0.001} onPress={() => onSelect(null)} />

        {floor.map(([x, y], i) => <Rect key={i} x={x - 0.8} y={y - 0.8} width={1.6} height={1.6} fill={C.faint} />)}

        {links.map((p, i) => {
          const [x1, y1] = P('front', p);
          const [x2, y2] = P('back', [-p[0], p[1]]);
          return <Line key={i} x1={x1} y1={y1} x2={x2} y2={y2} stroke={C.lineHi} strokeWidth={0.8} strokeDasharray="2,3" />;
        })}

        {plates.map((plate, pi) => {
          const near = pi === 1;
          return (
            <G key={plate} opacity={near ? 1 : 0.3}>
              {REGIONS.filter(r => r.plate === plate).map(r => {
                const tone = toneOf(r.id);
                const dimmed = filter && map.marks[r.id]?.category !== filter;
                const sel = r.id === selected;
                return (
                  <Polygon
                    key={r.id}
                    points={pts(plate, r.pts)}
                    fill={sel ? 'url(#p-hot)' : tone && !dimmed ? `url(#p-${tone})` : 'url(#p-idle)'}
                    stroke={sel ? C.hot : tone && !dimmed ? TONE[tone] : '#3A3A3A'}
                    strokeWidth={sel ? 1.6 : 0.8}
                    strokeLinejoin="round"
                    onPress={() => onSelect(r.id)}
                  />
                );
              })}
            </G>
          );
        })}

        {cards.map(c => (
          <G key={c.id}>
            <Polyline points={`${c.ax},${c.ay} ${c.ex},${c.ey} ${c.lx},${c.ey}`} fill="none" stroke={c.id === selected ? C.hot : C.dim} strokeWidth={0.9} />
            <Rect x={c.ax - 3} y={c.ay - 3} width={6} height={6} fill={c.away ? C.bg : C.hot} stroke={C.hot} strokeWidth={1} />
          </G>
        ))}

        <Line x1={g0[0]} y1={g0[1]} x2={gx[0]} y2={gx[1]} stroke={C.dim} strokeWidth={1} />
        <Line x1={g0[0]} y1={g0[1]} x2={gy[0]} y2={gy[1]} stroke={C.dim} strokeWidth={1} />
        <Line x1={g0[0]} y1={g0[1]} x2={gz[0]} y2={gz[1]} stroke={C.dim} strokeWidth={1} />
        <Circle cx={g0[0]} cy={g0[1]} r={1.6} fill={C.dim} />
        <SvgText x={gx[0] + 3} y={gx[1] + 3} fill={C.dim} fontSize={8} fontFamily={F.dot}>X</SvgText>
        <SvgText x={gy[0] - 2} y={gy[1] - 3} fill={C.dim} fontSize={8} fontFamily={F.dot}>Y</SvgText>
        <SvgText x={gz[0] + 3} y={gz[1] + 3} fill={C.dim} fontSize={8} fontFamily={F.dot}>Z</SvgText>
      </Svg>

      {cards.map(c => (
        <Card
          key={c.id}
          x={c.lx0}
          y={c.ly}
          id={c.id}
          away={c.away}
          active={c.id === selected}
          map={map}
          onPress={() => onSelect(c.id)}
          onDrop={(ddx, ddy) => onMoveLabel(c.id, c.dx + ddx, c.dy + ddy)}
        />
      ))}

      <Text style={styles.deg} pointerEvents="none">{`${String(((Math.round((yaw * 180) / Math.PI) % 360) + 360) % 360).padStart(3, '0')}`}</Text>
    </View>
  );
}

function layoutCards(items: { id: string; ax: number; ay: number; dx: number; dy: number; away: boolean }[], W: number, H: number) {
  const out: { id: string; ax: number; ay: number; ex: number; ey: number; lx: number; lx0: number; ly: number; dx: number; dy: number; away: boolean }[] = [];
  for (const side of ['left', 'right'] as const) {
    const list = items.filter(i => (i.ax < W / 2) === (side === 'left')).sort((a, b) => a.ay - b.ay);
    let floorY = 6;
    for (const it of list) {
      let ly = Math.max(floorY, Math.min(H - LABEL_H - 6, it.ay - LABEL_H / 2 + it.dy));
      floorY = ly + LABEL_H + 8;
      const lx0 = (side === 'left' ? 8 : W - LABEL_W - 8) + it.dx;
      const lx = side === 'left' ? lx0 + LABEL_W : lx0;          // where the leader meets the card
      const ex = side === 'left' ? lx + 14 : lx - 14;
      out.push({ ...it, ex, ey: ly + 15, lx, lx0, ly });
    }
  }
  return out;
}

function Card({ x, y, id, away, active, map, onPress, onDrop }: {
  x: number; y: number; id: string; away: boolean; active: boolean; map: BodyMap;
  onPress: () => void; onDrop: (dx: number, dy: number) => void;
}) {
  const drag = useRef(new Animated.ValueXY()).current;
  const pop = useRef(new Animated.Value(0)).current;
  useEffect(() => { Animated.spring(pop, { toValue: 1, friction: 5, tension: 120, useNativeDriver: false }).start(); }, []);
  const dropRef = useRef(onDrop);
  dropRef.current = onDrop;
  const pan = useMemo(() => PanResponder.create({
    onMoveShouldSetPanResponder: (_, g) => Math.abs(g.dx) + Math.abs(g.dy) > 5,
    onPanResponderTerminationRequest: () => false,
    onPanResponderMove: Animated.event([null, { dx: drag.x, dy: drag.y }], { useNativeDriver: false }),
    onPanResponderRelease: (_, g) => { drag.setValue({ x: 0, y: 0 }); dropRef.current(g.dx, g.dy); },
  }), []);

  const region = REGION_BY_ID[id];
  const mark = map.marks[id];
  const cat = mark && map.categories.find(c => c.id === mark.category);
  return (
    <Animated.View
      {...pan.panHandlers}
      style={[
        styles.card, active && styles.cardActive, away && { opacity: 0.6 },
        { left: x, top: y, transform: [...drag.getTranslateTransform(), { scale: pop.interpolate({ inputRange: [0, 1], outputRange: [0.85, 1] }) }] },
      ]}
    >
      <Pressable onPress={onPress}>
        <View style={styles.cardTag}>
          <View style={[styles.cardSwatch, { backgroundColor: cat ? TONE[cat.tone] : C.faint }]} />
          <Text style={[styles.cardCat, cat && { color: TONE[cat.tone] }]} numberOfLines={1}>{cat ? cat.name : 'UNASSIGNED'}</Text>
        </View>
        <Text style={styles.cardName} numberOfLines={1}>{region?.name}</Text>
        {!!mark?.note && <Text style={styles.cardNote} numberOfLines={1}>{mark.note}</Text>}
      </Pressable>
    </Animated.View>
  );
}

const styles = StyleSheet.create({
  card: {
    position: 'absolute', width: LABEL_W, minHeight: LABEL_H - 8, paddingHorizontal: 9, paddingVertical: 7,
    backgroundColor: 'rgba(12,12,12,0.92)', borderWidth: 1, borderColor: C.line, borderRadius: 10,
  },
  cardActive: { borderColor: C.hot },
  cardTag: { flexDirection: 'row', alignItems: 'center', gap: 5 },
  cardSwatch: { width: 6, height: 6 },
  cardCat: { fontFamily: F.dot, fontSize: 9, color: C.dim, letterSpacing: 1.5 },
  cardName: { fontFamily: F.dot, fontSize: 12, color: C.ink, letterSpacing: 0.5, marginTop: 4 },
  cardNote: { fontFamily: F.mono, fontSize: 10, color: C.dim, marginTop: 2 },
  deg: { position: 'absolute', right: 12, bottom: 8, fontFamily: F.dot, fontSize: 10, color: C.faint, letterSpacing: 2 },
});
