// Bottom bar: four destinations, each a pixel glyph in the puck's square
// dots over its name. A lit plate slides to the tab you're on (it jumps
// there under Reduce Motion). Talking to the assistant lives on LOG: its
// send button is hold-to-talk while the box is empty.
import { useEffect, useRef, useState } from 'react';
import { View, Text, StyleSheet, Pressable, Animated } from 'react-native';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import type { BottomTabBarProps } from '@react-navigation/bottom-tabs';
import * as Haptics from 'expo-haptics';
import { C, F, SPRING } from '@/lib/theme';
import { TAP } from '@/lib/hit';
import { useReducedMotion } from '@/lib/use-reduced-motion';
import { DotGlyph } from '@/components/today/DotIcon';

// 7×7, the readout glyphs' grid: a list, a figure, a dumbbell, a calendar.
const GLYPH = {
  log:   ['#.#####', '.......', '#.####.', '.......', '#.#####', '.......', '#.###..'],
  body:  ['..###..', '..###..', '.......', '#######', '..###..', '.##.##.', '.##.##.'],
  train: ['.......', '##...##', '##...##', '#######', '##...##', '##...##', '.......'],
  life:  ['.#...#.', '#######', '#.....#', '#.#.#.#', '#.....#', '#.#.#.#', '#######'],
} as const;

export const TAB_ORDER: { name: string; label: string; glyph: readonly string[] }[] = [
  { name: 'log',   label: 'LOG',   glyph: GLYPH.log   },
  { name: 'index', label: 'BODY',  glyph: GLYPH.body  },
  { name: 'gym',   label: 'TRAIN', glyph: GLYPH.train },
  { name: 'life',  label: 'LIFE',  glyph: GLYPH.life  },
];

// Hidden tab routes light up the tab they belong to, so you never lose your place.
const PARENT: Record<string, string> = { habits: 'life', activity: 'gym', progress: 'gym' };

const INSET = 6; // the plate sits this far inside its slot

export function PuckTabBar({ state, navigation }: BottomTabBarProps) {
  const insets = useSafeAreaInsets();
  const reduced = useReducedMotion();
  const current = state.routes[state.index]?.name;
  const lit = PARENT[current] ?? current;
  const at = Math.max(0, TAB_ORDER.findIndex(t => t.name === lit));
  const [slot, setSlot] = useState(0);
  const x = useRef(new Animated.Value(0)).current;
  const placed = useRef(false);

  useEffect(() => {
    if (!slot) return;
    const to = at * slot;
    // First layout, or Reduce Motion: put it there; otherwise slide.
    if (!placed.current || reduced) { x.setValue(to); placed.current = true; return; }
    Animated.spring(x, { toValue: to, ...SPRING.settle }).start();
  }, [at, slot, reduced]);

  const go = (name: string) => {
    const route = state.routes.find(r => r.name === name);
    if (!route) return;
    const ev = navigation.emit({ type: 'tabPress', target: route.key, canPreventDefault: true });
    if (current !== name && !ev.defaultPrevented) {
      Haptics.selectionAsync();
      navigation.navigate(name);
    }
  };

  return (
    <View style={[styles.bar, { paddingBottom: Math.max(insets.bottom - 8, 8) }]}>
      <View style={styles.row} onLayout={e => setSlot(e.nativeEvent.layout.width / TAB_ORDER.length)}>
        {slot > 0 && (
          <Animated.View pointerEvents="none" style={[styles.plate, { width: slot - INSET * 2, transform: [{ translateX: x }] }]}>
            <View style={styles.plateTick} />
          </Animated.View>
        )}
        {TAB_ORDER.map(t => (
          <Tab key={t.name} label={t.label} glyph={t.glyph} active={lit === t.name} reduced={reduced} onPress={() => go(t.name)} />
        ))}
      </View>
    </View>
  );
}

function Tab({ label, glyph, active, reduced, onPress }: {
  label: string; glyph: readonly string[]; active: boolean; reduced: boolean; onPress: () => void;
}) {
  const press = useRef(new Animated.Value(1)).current;
  const to = (v: number) => { if (!reduced) Animated.spring(press, { toValue: v, ...SPRING.pop }).start(); };
  return (
    <Pressable
      style={styles.tab}
      onPress={onPress}
      onPressIn={() => to(0.92)}
      onPressOut={() => to(1)}
      role="tab"
      accessibilityState={{ selected: active }}
      accessibilityLabel={label}
    >
      <Animated.View style={[styles.tabInner, { transform: [{ scale: press }] }]}>
        <DotGlyph art={glyph} tone={active ? C.hot : C.faint} dot={2} gap={1} />
        <Text style={[styles.label, active && styles.labelActive]}>{label}</Text>
      </Animated.View>
    </Pressable>
  );
}

const styles = StyleSheet.create({
  bar: { backgroundColor: C.bg, borderTopWidth: 1, borderTopColor: C.line, paddingTop: 6, paddingHorizontal: 8 },
  row: { flexDirection: 'row' },
  plate: {
    position: 'absolute', top: 0, bottom: 0, left: INSET,
    backgroundColor: C.raised, borderWidth: 1, borderColor: C.lineHi,
    borderRadius: 14, borderCurve: 'continuous', alignItems: 'center',
  },
  plateTick: { width: 14, height: 2, backgroundColor: C.hot, marginTop: -1 },
  tab: { flex: 1, minHeight: TAP + 10 },
  tabInner: { flex: 1, alignItems: 'center', justifyContent: 'center', gap: 6, paddingVertical: 8 },
  label: { fontFamily: F.dot, fontSize: 10, letterSpacing: 2, color: C.faint },
  labelActive: { color: C.hot },
});
