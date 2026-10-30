// Bottom bar: four square chips, cyberdeck style — an angular line icon
// (components/CyberIcon.tsx) over the name, an index in the corner. A white
// square slides to the current one (it jumps there under Reduce Motion).
// Talking to the assistant lives on LOG: its send button is hold-to-talk
// while the box is empty.
import { useEffect, useRef, useState } from 'react';
import { View, Text, StyleSheet, Pressable, Animated } from 'react-native';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import type { BottomTabBarProps } from '@react-navigation/bottom-tabs';
import * as Haptics from 'expo-haptics';
import { C, F, SPRING } from '@/lib/theme';
import { TAP } from '@/lib/hit';
import { useReducedMotion } from '@/lib/use-reduced-motion';
import { CyberIcon, type CyberIconName } from '@/components/CyberIcon';

export const TAB_ORDER: { name: string; label: string; glyph: CyberIconName }[] = [
  { name: 'log',   label: 'LOG',   glyph: 'log'   },
  { name: 'index', label: 'BODY',  glyph: 'body'  },
  { name: 'gym',   label: 'TRAIN', glyph: 'train' },
  { name: 'life',  label: 'LIFE',  glyph: 'life'  },
];

// Hidden tab routes light up the tab they belong to, so you never lose your place.
const PARENT: Record<string, string> = { habits: 'life', activity: 'gym', progress: 'gym' };

const GAP = 6;

export function PuckTabBar({ state, navigation }: BottomTabBarProps) {
  const insets = useSafeAreaInsets();
  const reduced = useReducedMotion();
  const current = state.routes[state.index]?.name;
  const lit = PARENT[current] ?? current;
  const at = Math.max(0, TAB_ORDER.findIndex(t => t.name === lit));
  const [slot, setSlot] = useState(0); // one chip's width
  const x = useRef(new Animated.Value(0)).current;
  const placed = useRef(false);

  useEffect(() => {
    if (!slot) return;
    const to = at * (slot + GAP);
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
    <View style={[styles.bar, { paddingBottom: Math.max(insets.bottom - 14, 6) }]}>
      <View style={styles.row} onLayout={e => setSlot((e.nativeEvent.layout.width - GAP * (TAB_ORDER.length - 1)) / TAB_ORDER.length)}>
        {slot > 0 && <Animated.View pointerEvents="none" style={[styles.plate, { width: slot, transform: [{ translateX: x }] }]} />}
        {TAB_ORDER.map((t, i) => (
          <Tab key={t.name} index={i + 1} label={t.label} glyph={t.glyph} active={lit === t.name} reduced={reduced} onPress={() => go(t.name)} />
        ))}
      </View>
    </View>
  );
}

function Tab({ index, label, glyph, active, reduced, onPress }: {
  index: number; label: string; glyph: CyberIconName; active: boolean; reduced: boolean; onPress: () => void;
}) {
  const press = useRef(new Animated.Value(1)).current;
  const to = (v: number) => { if (!reduced) Animated.spring(press, { toValue: v, ...SPRING.pop }).start(); };
  const ink = active ? C.onHot : C.dim;
  return (
    <Pressable
      style={[styles.chip, active && styles.chipOn]}
      onPress={onPress}
      onPressIn={() => to(0.92)}
      onPressOut={() => to(1)}
      role="tab"
      accessibilityState={{ selected: active }}
      accessibilityLabel={label}
    >
      <Text style={[styles.index, { color: active ? C.onHot : C.faint }]}>{String(index).padStart(2, '0')}</Text>
      <Animated.View style={[styles.inner, { transform: [{ scale: press }] }]}>
        <CyberIcon name={glyph} color={ink} size={20} />
        <Text style={[styles.label, { color: active ? C.onHot : C.faint }]}>{label}</Text>
      </Animated.View>
    </Pressable>
  );
}

const styles = StyleSheet.create({
  bar: { backgroundColor: C.bg, borderTopWidth: 1, borderTopColor: C.line, paddingTop: 6, paddingHorizontal: 8 },
  row: { flexDirection: 'row', gap: GAP },
  plate: { position: 'absolute', top: 0, bottom: 0, left: 0, backgroundColor: C.hot },
  chip: { flex: 1, minHeight: TAP + 4, borderWidth: 1, borderColor: C.line, justifyContent: 'center' },
  chipOn: { borderColor: C.hot },
  index: { position: 'absolute', top: 3, left: 4, fontFamily: F.dot, fontSize: 7, letterSpacing: 0.5 },
  inner: { alignItems: 'center', gap: 3, paddingVertical: 5 },
  label: { fontFamily: F.dot, fontSize: 8, letterSpacing: 1.5 },
});
