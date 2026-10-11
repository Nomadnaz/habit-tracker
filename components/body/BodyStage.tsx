// The BODY tab's stage: one anatomical view (front or back) in dot-matrix
// fill, with floating annotation cards on leader lines either side.
//   swipe sideways → flip front/back (the figure squashes like a card turning)
//   tap a region   → select            drag a card → move it (offset saved)
import { useEffect, useMemo, useRef, useState } from 'react';
import { View, Text, StyleSheet, PanResponder, Animated, Pressable, Easing } from 'react-native';
import Svg, { Path, Polyline, Rect, Defs, Pattern, G } from 'react-native-svg';
import * as Haptics from 'expo-haptics';
import { C, F } from '@/lib/theme';
import { REGIONS, REGION_BY_ID, FIGURE, smoothPath, centroid, type BodyMap, type Plate, type Tone } from '@/lib/body-map';

export const TONE: Record<Tone, string> = { hot: C.hot, signal: C.signal, live: C.live, dim: C.dim, alert: C.alert };

const CARD_W = 94;
const CARD_H = 44;
const IDLE_BASE = '#101010';
const IDLE_DOT = '#3C3C3C';

// Precomputed outlines — the geometry never changes, only the fills do.
const PATHS: Record<string, string> = Object.fromEntries(REGIONS.map(r => [r.id, smoothPath(r.pts)]));

// Non-interactive anatomy detail drawn in the background colour, so it reads
// as the gaps between muscle bellies (six-pack, spine).
const DETAIL: Record<Plate, string[]> = {
  front: ['M-14,141 L14,141', 'M-14,160 L14,160', 'M-14,178 L14,178', 'M0,122 L0,196'],
  back: ['M0,68 L0,196'],
};

interface Props {
  width: number;
  height: number;
  map: BodyMap;
  side: Plate;
  selected: string | null;
  filter: string | null;
  onSelect: (id: string | null) => void;
  onFlip: () => void;
  onMoveLabel: (id: string, dx: number, dy: number) => void;
}

export function BodyStage({ width: W, height: H, map, side, selected, filter, onSelect, onFlip, onMoveLabel }: Props) {
  // The view shown lags `side` by half a flip: squash to 0, swap, spring back.
  const [shown, setShown] = useState<Plate>(side);
  const squash = useRef(new Animated.Value(1)).current;
  const flipRef = useRef(onFlip);
  flipRef.current = onFlip;

  useEffect(() => {
    if (side === shown) return;
    Animated.timing(squash, { toValue: 0.02, duration: 130, easing: Easing.in(Easing.quad), useNativeDriver: true }).start(() => {
      setShown(side);
      Animated.spring(squash, { toValue: 1, friction: 5, tension: 120, useNativeDriver: true }).start();
    });
  }, [side]);

  const pan = useMemo(() => PanResponder.create({
    onMoveShouldSetPanResponder: (_, g) => Math.abs(g.dx) > 12 && Math.abs(g.dx) > Math.abs(g.dy) * 1.5,
    onPanResponderMove: (_, g) => squash.setValue(Math.max(0.08, 1 - Math.abs(g.dx) / 240)),
    onPanResponderRelease: (_, g) => {
      if (Math.abs(g.dx) > 60 || Math.abs(g.vx) > 0.6) { Haptics.selectionAsync(); flipRef.current(); }
      else Animated.spring(squash, { toValue: 1, friction: 5, tension: 140, useNativeDriver: true }).start();
    },
    onPanResponderTerminate: () => Animated.spring(squash, { toValue: 1, useNativeDriver: true }).start(),
  }), []);

  const s = Math.min((H - 20) / FIGURE.height, (W - 2 * CARD_W) / 168);
  const cx = W / 2;
  const top = (H - FIGURE.height * s) / 2;
  const toScreen = ([x, y]: [number, number]): [number, number] => [cx + x * s, top + y * s];

  const catById = Object.fromEntries(map.categories.map(c => [c.id, c]));
  const toneOf = (id: string): Tone | null => {
    const m = map.marks[id];
    if (!m || (filter && m.category !== filter)) return null;
    return catById[m.category]?.tone ?? null;
  };

  const regions = REGIONS.filter(r => r.plate === shown);
  const annotated = regions.filter(r => (map.marks[r.id]?.pinned && (!filter || map.marks[r.id].category === filter)) || r.id === selected);
  const cards = layoutCards(annotated.map(r => {
    const [ax, ay] = toScreen(centroid(r.pts));
    const m = map.marks[r.id];
    return { id: r.id, ax, ay, dx: m?.dx ?? 0, dy: m?.dy ?? 0 };
  }), W, H);

  // a ring of floor dots under the feet
  const floor = Array.from({ length: 28 }, (_, i) => {
    const a = (i / 28) * Math.PI * 2;
    return toScreen([Math.cos(a) * 52, 424 + Math.sin(a) * 7]);
  });

  const figure = { transform: [{ scaleX: squash }] };
  const leftLabel = shown === 'front' ? 'R' : 'L';
  const rightLabel = shown === 'front' ? 'L' : 'R';

  return (
    <View style={{ width: W, height: H }} {...pan.panHandlers}>
      <Animated.View style={[StyleSheet.absoluteFill, figure]}>
        <Svg width={W} height={H}>
          <Defs>
            <Pattern id="p-idle" width={3.2} height={3.2} patternUnits="userSpaceOnUse">
              <Rect width={3.2} height={3.2} fill={IDLE_BASE} />
              <Rect x={1} y={1} width={1.2} height={1.2} fill={IDLE_DOT} />
            </Pattern>
            {(Object.keys(TONE) as Tone[]).map(t => (
              <Pattern key={t} id={`p-${t}`} width={2.8} height={2.8} patternUnits="userSpaceOnUse">
                <Rect width={2.8} height={2.8} fill={TONE[t]} fillOpacity={0.16} />
                <Rect x={0.5} y={0.5} width={1.7} height={1.7} fill={TONE[t]} />
              </Pattern>
            ))}
          </Defs>

          <Rect x={0} y={0} width={W} height={H} fill={C.bg} fillOpacity={0.001} onPress={() => onSelect(null)} />

          {floor.map(([x, y], i) => <Rect key={i} x={x - 0.8} y={y - 0.8} width={1.6} height={1.6} fill={C.faint} />)}

          <G transform={`translate(${cx},${top}) scale(${s})`}>
            {regions.map(r => {
              const tone = toneOf(r.id);
              const sel = r.id === selected;
              return (
                <Path
                  key={r.id}
                  d={PATHS[r.id]}
                  fill={sel ? 'url(#p-hot)' : tone ? `url(#p-${tone})` : 'url(#p-idle)'}
                  stroke={C.bg}
                  strokeWidth={1.8}
                  strokeLinejoin="round"
                  onPress={() => onSelect(r.id)}
                />
              );
            })}
            {DETAIL[shown].map((d, i) => <Path key={i} d={d} stroke={C.bg} strokeWidth={1.6} fill="none" pointerEvents="none" />)}
            {selected && REGION_BY_ID[selected]?.plate === shown && (
              <Path d={PATHS[selected]} fill="none" stroke={C.hot} strokeWidth={1.3} strokeLinejoin="round" pointerEvents="none" />
            )}
          </G>
        </Svg>
      </Animated.View>

      <Svg width={W} height={H} style={StyleSheet.absoluteFill} pointerEvents="none">
        {cards.map(c => (
          <G key={c.id}>
            <Polyline points={`${c.ax},${c.ay} ${c.ex},${c.ey} ${c.lx},${c.ey}`} fill="none" stroke={c.id === selected ? C.hot : C.dim} strokeWidth={0.9} />
            <Rect x={c.ax - 2.5} y={c.ay - 2.5} width={5} height={5} fill={C.hot} />
          </G>
        ))}
      </Svg>

      {cards.map(c => (
        <Card
          key={c.id}
          x={c.cardX}
          y={c.cardY}
          id={c.id}
          active={c.id === selected}
          map={map}
          onPress={() => onSelect(c.id)}
          onDrop={(ddx, ddy) => onMoveLabel(c.id, c.dx + ddx, c.dy + ddy)}
        />
      ))}

      <Text style={[styles.sideMark, { left: cx - 64 * s - 12, top: top + 418 * s }]} pointerEvents="none">{leftLabel}</Text>
      <Text style={[styles.sideMark, { left: cx + 64 * s + 6, top: top + 418 * s }]} pointerEvents="none">{rightLabel}</Text>
    </View>
  );
}

function layoutCards(items: { id: string; ax: number; ay: number; dx: number; dy: number }[], W: number, H: number) {
  const out: { id: string; ax: number; ay: number; ex: number; ey: number; lx: number; cardX: number; cardY: number; dx: number; dy: number }[] = [];
  for (const left of [true, false]) {
    const list = items.filter(i => (i.ax < W / 2) === left).sort((a, b) => a.ay - b.ay);
    let floorY = 4;
    for (const it of list) {
      const cardY = Math.max(floorY, Math.min(H - CARD_H - 4, it.ay - CARD_H / 2 + it.dy));
      floorY = cardY + CARD_H + 6;
      const cardX = (left ? 6 : W - CARD_W - 6) + it.dx;
      const lx = left ? cardX + CARD_W : cardX;        // where the leader meets the card
      const ey = cardY + CARD_H / 2;
      const ex = left ? Math.min(it.ax - 10, lx + 12) : Math.max(it.ax + 10, lx - 12);
      out.push({ ...it, ex, ey, lx, cardX, cardY });
    }
  }
  return out;
}

function Card({ x, y, id, active, map, onPress, onDrop }: {
  x: number; y: number; id: string; active: boolean; map: BodyMap;
  onPress: () => void; onDrop: (dx: number, dy: number) => void;
}) {
  const drag = useRef(new Animated.ValueXY()).current;
  const pop = useRef(new Animated.Value(0)).current;
  useEffect(() => { Animated.spring(pop, { toValue: 1, friction: 5, tension: 120, useNativeDriver: true }).start(); }, []);
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
      style={[styles.card, active && styles.cardActive, { left: x, top: y, transform: [...drag.getTranslateTransform()] }]}
    >
      <Animated.View style={{ transform: [{ scale: pop.interpolate({ inputRange: [0, 1], outputRange: [0.8, 1] }) }], opacity: pop }}>
        <Pressable onPress={onPress}>
          <View style={styles.cardTag}>
            <View style={[styles.cardSwatch, { backgroundColor: cat ? TONE[cat.tone] : C.faint }]} />
            <Text style={[styles.cardCat, cat && { color: TONE[cat.tone] }]} numberOfLines={1}>{cat ? cat.name : 'SELECTED'}</Text>
          </View>
          <Text style={styles.cardName} numberOfLines={1} adjustsFontSizeToFit minimumFontScale={0.7}>{region?.name}</Text>
        </Pressable>
      </Animated.View>
    </Animated.View>
  );
}

const styles = StyleSheet.create({
  card: {
    position: 'absolute', width: CARD_W, height: CARD_H, paddingHorizontal: 8, justifyContent: 'center',
    backgroundColor: C.surface, borderWidth: 1, borderColor: C.line, borderRadius: 10,
  },
  cardActive: { borderColor: C.hot },
  cardTag: { flexDirection: 'row', alignItems: 'center', gap: 5 },
  cardSwatch: { width: 5, height: 5 },
  cardCat: { fontFamily: F.dot, fontSize: 8, color: C.dim, letterSpacing: 1.5, flexShrink: 1 },
  cardName: { fontFamily: F.dot, fontSize: 11, color: C.ink, letterSpacing: 0.5, marginTop: 4 },
  sideMark: { position: 'absolute', fontFamily: F.dot, fontSize: 9, color: C.faint, letterSpacing: 1 },
});
