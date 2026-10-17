// The day slider across the top of TODAY: one continuous row of days with
// the selected one held in the middle, bigger, under a white lens. Drag it
// and it snaps day by day with a haptic tick as each day passes the centre;
// neighbours shrink and fade with distance; the lens pops when a day lands.
// Tap any day to glide it to the middle. While a task is being dragged the
// strip turns into two drop zones — DELETE on the left, EDIT on the right —
// and reports its window rect so the drag handler can hit-test the finger.
import { useEffect, useRef, useState } from 'react';
import { View, Text, StyleSheet, Pressable, Animated, type NativeSyntheticEvent, type NativeScrollEvent } from 'react-native';
import * as Haptics from 'expo-haptics';
import { MaterialCommunityIcons } from '@expo/vector-icons';
import { C, F } from '@/lib/theme';

export type StripDate = { key: string; day: string; date: string; month: string };
export type ZoneRect = { top: number; bottom: number; midX: number };

const STRIP_H = 78;
const VISIBLE = 7;

export function WeekStrip({ dates, selectedKey, todayKey, pending, onSelect, dragging, overDelete, overEdit, onZoneLayout }: {
  dates: StripDate[];
  selectedKey: string;
  todayKey: string;
  pending: (key: string) => number;
  onSelect: (key: string) => void;
  dragging: boolean;
  overDelete: boolean;
  overEdit: boolean;
  onZoneLayout: (rect: ZoneRect) => void;
}) {
  const [w, setW] = useState(0);
  const item = w ? w / VISIBLE : 0;
  const pad = (w - item) / 2;
  const idxOf = (key: string) => Math.max(0, dates.findIndex(d => d.key === key));

  const scrollX = useRef(new Animated.Value(idxOf(selectedKey) * item)).current;
  const scrollRef = useRef<any>(null);
  const wrapRef = useRef<View>(null);
  const centre = useRef(idxOf(selectedKey));   // the day the strip is resting on
  const tick = useRef(centre.current);         // the day under the lens mid-drag
  const pop = useRef(new Animated.Value(1)).current;

  const bounce = () => {
    pop.setValue(0.86);
    Animated.spring(pop, { toValue: 1, friction: 4, tension: 220, useNativeDriver: true }).start();
  };

  // Follow a selection made elsewhere (calendar jump, a task moved to another day).
  useEffect(() => {
    const i = idxOf(selectedKey);
    if (!item || i === centre.current) return;
    centre.current = i;
    tick.current = i;
    scrollRef.current?.scrollTo({ x: i * item, animated: true });
    bounce();
  }, [selectedKey, item]);

  // Park on the selected day once the slider has a width (contentOffset alone is iOS-only).
  useEffect(() => {
    if (!item) return;
    const t = setTimeout(() => scrollRef.current?.scrollTo({ x: centre.current * item, animated: false }), 0);
    return () => clearTimeout(t);
  }, [item, dragging]);

  const measure = () => {
    wrapRef.current?.measureInWindow((x, y, width, height) => {
      onZoneLayout({ top: y, bottom: y + height, midX: x + width / 2 });
    });
  };
  useEffect(() => { if (dragging) measure(); }, [dragging]);

  const onScroll = Animated.event([{ nativeEvent: { contentOffset: { x: scrollX } } }], {
    useNativeDriver: true,
    listener: (e: NativeSyntheticEvent<NativeScrollEvent>) => {
      if (!item) return;
      const i = Math.round(e.nativeEvent.contentOffset.x / item);
      if (i !== tick.current && i >= 0 && i < dates.length) {
        tick.current = i;
        Haptics.selectionAsync();
      }
    },
  });

  const settle = (x: number) => {
    if (!item) return;
    const i = Math.max(0, Math.min(dates.length - 1, Math.round(x / item)));
    if (i === centre.current) return;
    centre.current = i;
    bounce();
    onSelect(dates[i].key);
  };

  const tap = (i: number) => {
    if (i === centre.current) { bounce(); return; }
    Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Light);
    scrollRef.current?.scrollTo({ x: i * item, animated: true });
  };

  const sel = dates[idxOf(selectedKey)];

  return (
    <View ref={wrapRef} style={styles.wrap} onLayout={e => { setW(e.nativeEvent.layout.width); measure(); }}>
      {dragging ? (
        <View style={styles.zones}>
          <Zone icon="trash-can-outline" label={overDelete ? 'RELEASE' : 'DELETE'} on={overDelete} danger />
          <Zone icon="pencil-outline" label={overEdit ? 'RELEASE' : 'EDIT'} on={overEdit} />
        </View>
      ) : w > 0 && (
        <>
          {/* The lens: fixed in the middle, the day under it reads black on white. */}
          <Animated.View pointerEvents="none" style={[styles.lens, { left: pad - 4, width: item + 8, transform: [{ scale: pop }] }]}>
            <Text style={styles.lensMonth}>{sel?.month?.slice(0, 3)}</Text>
          </Animated.View>
          <Animated.ScrollView
            ref={scrollRef}
            horizontal
            showsHorizontalScrollIndicator={false}
            snapToInterval={item}
            decelerationRate="fast"
            contentOffset={{ x: centre.current * item, y: 0 }}
            contentContainerStyle={{ paddingHorizontal: pad }}
            onScroll={onScroll}
            scrollEventThrottle={16}
            onMomentumScrollEnd={e => settle(e.nativeEvent.contentOffset.x)}
          >
            {dates.map((d, i) => (
              <Day key={d.key} d={d} i={i} item={item} x={scrollX} today={d.key === todayKey} count={pending(d.key)} onPress={() => tap(i)} />
            ))}
          </Animated.ScrollView>
        </>
      )}
    </View>
  );
}

function Day({ d, i, item, x, today, count, onPress }: {
  d: StripDate; i: number; item: number; x: Animated.Value; today: boolean; count: number; onPress: () => void;
}) {
  const at = (k: number) => (i + k) * item;
  const scale = x.interpolate({ inputRange: [at(-3), at(-1), at(0), at(1), at(3)], outputRange: [0.72, 0.9, 1.22, 0.9, 0.72], extrapolate: 'clamp' });
  const fade = x.interpolate({ inputRange: [at(-3), at(-1), at(0), at(1), at(3)], outputRange: [0.3, 0.75, 1, 0.75, 0.3], extrapolate: 'clamp' });
  // How centred this day is, 0–1: crossfades its light text to dark under the lens.
  const on = x.interpolate({ inputRange: [at(-1), at(0), at(1)], outputRange: [0, 1, 0], extrapolate: 'clamp' });
  const off = x.interpolate({ inputRange: [at(-1), at(0), at(1)], outputRange: [1, 0, 1], extrapolate: 'clamp' });

  const face = (dark: boolean) => (
    <>
      <Text style={[styles.dow, { color: dark ? C.onHot : today ? C.live : C.dim }]}>{d.day.slice(0, 3)}</Text>
      <Text style={[styles.num, { color: dark ? C.onHot : C.ink }]}>{d.date}</Text>
      <View style={styles.marks}>
        {count > 0 && <View style={[styles.mark, { backgroundColor: dark ? C.onHot : C.dim }]} />}
        {today && <View style={[styles.mark, { backgroundColor: C.live }]} />}
      </View>
    </>
  );

  return (
    <Pressable onPress={onPress} style={{ width: item, height: STRIP_H }}>
      <Animated.View style={[styles.day, { opacity: fade, transform: [{ scale }] }]}>
        <Animated.View style={[styles.face, { opacity: off }]}>{face(false)}</Animated.View>
        <Animated.View style={[styles.face, StyleSheet.absoluteFill, { opacity: on }]}>{face(true)}</Animated.View>
      </Animated.View>
    </Pressable>
  );
}

function Zone({ icon, label, on, danger }: { icon: 'trash-can-outline' | 'pencil-outline'; label: string; on: boolean; danger?: boolean }) {
  const bg = on ? (danger ? C.alert : C.hot) : C.raised;
  const fg = on ? (danger ? C.hot : C.onHot) : C.ink;
  return (
    <View style={[styles.zone, { backgroundColor: bg, borderColor: on ? bg : C.lineHi }]}>
      <MaterialCommunityIcons name={icon} size={20} color={fg} />
      <Text style={[styles.zoneLabel, { color: fg }]}>{label}</Text>
    </View>
  );
}

const styles = StyleSheet.create({
  wrap: { height: STRIP_H, marginHorizontal: 16, marginBottom: 10 },
  lens: { position: 'absolute', top: 0, height: STRIP_H, borderRadius: 18, backgroundColor: C.hot, alignItems: 'center', justifyContent: 'flex-start', paddingTop: 3 },
  lensMonth: { fontFamily: F.dot, fontSize: 6, color: 'rgba(0,0,0,0.45)', letterSpacing: 1 },
  day: { flex: 1, alignItems: 'center', justifyContent: 'center' },
  face: { alignItems: 'center', justifyContent: 'center', gap: 2 },
  dow: { fontFamily: F.dot, fontSize: 9, letterSpacing: 1.5 },
  num: { fontFamily: F.dot, fontSize: 20 },
  marks: { flexDirection: 'row', gap: 3, height: 4 },
  mark: { width: 4, height: 4, borderRadius: 2 },
  zones: { flex: 1, flexDirection: 'row', gap: 8 },
  zone: { flex: 1, borderRadius: 14, borderWidth: 1, borderStyle: 'dashed', flexDirection: 'row', alignItems: 'center', justifyContent: 'center', gap: 8 },
  zoneLabel: { fontFamily: F.dot, fontSize: 12, letterSpacing: 2 },
});
