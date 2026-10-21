// SETS / REPS / WEIGHT for a lift. Three readouts across the top — tap one
// to pick it, it lights green — and under them a ruler of every value it can
// take: swipe it like a tape (a haptic tick per notch) or tap a number. The
// one in the lens is the value. Weights are only ones you can load (the plate
// grid in lib/exercise-guide.ts); a rep range moves as one piece.

import { memo, useEffect, useMemo, useRef, useState } from 'react';
import { Animated, Pressable, StyleSheet, Text, View, type NativeScrollEvent, type NativeSyntheticEvent, type ScrollView } from 'react-native';
import * as Haptics from 'expo-haptics';
import { nextWeight, repRange, repText, type Equipment } from '@/lib/exercise-guide';
import { formatWeightFromKg } from '@/lib/unit-preference';
import { C, F } from '@/lib/theme';
import { Corners } from '@/components/Corners';

type Field = 'sets' | 'reps' | 'weight';
type Patch = { sets?: number; reps?: string; weightKg?: number };

/** Every loadable weight from 0 (bodyweight) to well past this one. */
function weightsFor(kit: Equipment, unit: 'metric' | 'imperial', cur: number): number[] {
  const top = Math.max(200, cur * 1.5);
  const out = [0];
  for (let v = 0; v < top && out.length < 400;) {
    const n = nextWeight(v, 1, kit, unit);
    if (n <= v) break;
    out.push(v = n);
  }
  return out;
}
const nearest = (xs: number[], v: number) => xs.reduce((b, x, i) => (Math.abs(x - v) < Math.abs(xs[b] - v) ? i : b), 0);

export function ValuePicker({ sets, reps, weightKg, kit, unit, onPatch }: {
  sets: number; reps: string; weightKg: number; kit: Equipment; unit: 'metric' | 'imperial';
  onPatch: (p: Patch) => void;
}) {
  const [field, setField] = useState<Field>('weight');
  const [lo, hi] = repRange(reps);
  const span = hi - lo;
  const setOpts = useMemo(() => Array.from({ length: 10 }, (_, i) => i + 1), []);
  const repOpts = useMemo(() => Array.from({ length: 50 - span }, (_, i) => repText([i + 1, i + 1 + span])), [span]);
  // Rebuilt only when the weight outgrows the list, not on every notch.
  const kgOpts = useMemo(() => weightsFor(kit, unit, weightKg), [kit, unit, Math.floor(weightKg / 130)]);
  const kgLabel = (kg: number) => (kg <= 0 ? 'BW' : formatWeightFromKg(kg, unit));

  const ruler = field === 'sets'
    ? { labels: setOpts.map(String), index: sets - 1, item: 44, pick: (i: number) => onPatch({ sets: setOpts[i] }) }
    : field === 'reps'
      ? { labels: repOpts, index: Math.max(0, lo - 1), item: span ? 64 : 44, pick: (i: number) => onPatch({ reps: repOpts[i] }) }
      : { labels: kgOpts.map(kgLabel), index: nearest(kgOpts, weightKg), item: 56, pick: (i: number) => onPatch({ weightKg: kgOpts[i] }) };

  const tab = (f: Field, label: string, value: string) => {
    const on = field === f;
    return (
      <Pressable
        key={f}
        onPress={() => { if (!on) { void Haptics.selectionAsync(); setField(f); } }}
        style={[st.tab, on && st.tabOn]}
        accessibilityRole="tab"
        accessibilityState={{ selected: on }}
      >
        <Corners color={on ? C.live : C.lineHi} />
        <Text style={[st.tabLabel, on && { color: C.live }]}>{label}</Text>
        <Text style={[st.tabValue, on && { color: C.ink }]} numberOfLines={1}>{value}</Text>
      </Pressable>
    );
  };

  return (
    <View style={st.wrap}>
      <View style={st.tabs}>
        {tab('sets', 'SETS', String(sets))}
        {tab('reps', 'REPS', reps)}
        {tab('weight', unit === 'imperial' ? 'LB' : 'KG', kgLabel(weightKg))}
      </View>
      <Ruler key={`${field}-${ruler.labels.length}`} {...ruler} />
    </View>
  );
}

const RULER_H = 50;

function Ruler({ labels, index, item, pick }: { labels: string[]; index: number; item: number; pick: (i: number) => void }) {
  const [w, setW] = useState(0);
  const x = useRef(new Animated.Value(index * item)).current;
  const list = useRef<ScrollView>(null);
  const at = useRef(index);
  /** Only a finger moves the value; a scroll we started just catches up. */
  const user = useRef(false);
  const placed = useRef(false);
  const pickRef = useRef(pick);
  pickRef.current = pick;

  // The value changed elsewhere (USE, or the other tab): roll to it.
  useEffect(() => {
    if (index === at.current || !w) return;
    at.current = index;
    user.current = false;
    list.current?.scrollTo({ x: index * item, animated: true });
  }, [index, w]);

  const onScroll = useMemo(() => Animated.event([{ nativeEvent: { contentOffset: { x } } }], {
    useNativeDriver: true,
    listener: (e: NativeSyntheticEvent<NativeScrollEvent>) => {
      if (!user.current) return;
      const i = Math.max(0, Math.min(labels.length - 1, Math.round(e.nativeEvent.contentOffset.x / item)));
      if (i === at.current) return;
      at.current = i;
      void Haptics.selectionAsync();
      pickRef.current(i);
    },
  }), [labels.length, item]);

  const tap = useRef((i: number) => {
    if (i === at.current) return;
    void Haptics.selectionAsync();
    at.current = i;
    user.current = false;
    list.current?.scrollTo({ x: i * item, animated: true });
    pickRef.current(i);
  }).current;

  const side = Math.max(0, (w - item) / 2);
  return (
    <View style={st.ruler} onLayout={e => setW(e.nativeEvent.layout.width)}>
      {/* the lens — behind the tape, so it never takes a touch */}
      {!!w && (
        <View pointerEvents="none" style={[st.lens, { left: side, width: item }]}>
          <Corners color={C.live} />
        </View>
      )}
      {!!w && (
        <Animated.ScrollView
          ref={list}
          horizontal
          style={StyleSheet.absoluteFill}
          contentContainerStyle={{ paddingHorizontal: side }}
          // Placed once. A contentOffset prop would be re-applied by iOS on every
          // value change and yank the tape back mid-swipe.
          onLayout={() => { if (placed.current) return; placed.current = true; list.current?.scrollTo({ x: index * item, animated: false }); }}
          onScroll={onScroll}
          onScrollBeginDrag={() => { user.current = true; }}
          scrollEventThrottle={16}
          snapToInterval={item}
          decelerationRate="fast"
          showsHorizontalScrollIndicator={false}
        >
          <Tape labels={labels} item={item} x={x} tap={tap} />
        </Animated.ScrollView>
      )}
    </View>
  );
}

/** The numbers on the tape. Memoised so a value change doesn't rebuild every
 *  number's native animation while the tape is moving. */
const Tape = memo(function Tape({ labels, item, x, tap }: { labels: string[]; item: number; x: Animated.Value; tap: (i: number) => void }) {
  return (
    <>
      {labels.map((l, i) => {
        const r = (k: number) => (i + k) * item;
        const inputRange = [r(-3), r(-1), r(0), r(1), r(3)];
        const scale = x.interpolate({ inputRange, outputRange: [0.7, 0.8, 1.15, 0.8, 0.7], extrapolate: 'clamp' });
        const opacity = x.interpolate({ inputRange, outputRange: [0.2, 0.5, 1, 0.5, 0.2], extrapolate: 'clamp' });
        return (
          <Pressable key={i} onPress={() => tap(i)} style={{ width: item, height: RULER_H, alignItems: 'center', justifyContent: 'center' }}>
            <Animated.Text style={[st.num, { opacity, transform: [{ scale }] }]} numberOfLines={1}>{l}</Animated.Text>
            <View style={[st.tick, i % 5 === 0 && st.tickMajor]} />
          </Pressable>
        );
      })}
    </>
  );
}, (a, b) => a.item === b.item && a.labels.length === b.labels.length && a.labels.every((l, i) => l === b.labels[i]));

const st = StyleSheet.create({
  wrap: { gap: 6 },
  tabs: { flexDirection: 'row', gap: 6 },
  tab: { flex: 1, height: 48, backgroundColor: C.bg, paddingHorizontal: 12, justifyContent: 'center', gap: 3 },
  tabOn: { backgroundColor: 'rgba(116,242,91,0.07)' },
  tabLabel: { fontFamily: F.dot, fontSize: 7, color: C.dim, letterSpacing: 1.8 },
  tabValue: { fontFamily: F.dot, fontSize: 15, color: C.dim, letterSpacing: 0.5 },
  ruler: { height: RULER_H, borderRadius: 12, borderWidth: 1, borderColor: C.line, backgroundColor: C.bg, overflow: 'hidden' },
  lens: { position: 'absolute', top: 3, bottom: 3, backgroundColor: 'rgba(116,242,91,0.07)' },
  num: { fontFamily: F.dot, fontSize: 15, color: C.ink, letterSpacing: 0.5 },
  tick: { position: 'absolute', bottom: 4, width: 1, height: 4, backgroundColor: C.lineHi },
  tickMajor: { height: 7, backgroundColor: C.dim },
});
