// Bottom bar: four destinations, each a line icon over its name. A lit pill
// slides behind the current tab's icon (it jumps there under Reduce Motion).
// Talking to the assistant lives on LOG: its send button is hold-to-talk
// while the box is empty.
import { useEffect, useRef, useState } from 'react';
import { View, Text, StyleSheet, Pressable, Animated } from 'react-native';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import type { BottomTabBarProps } from '@react-navigation/bottom-tabs';
import Svg, { Circle, Path, Rect } from 'react-native-svg';
import * as Haptics from 'expo-haptics';
import { C, F, SPRING } from '@/lib/theme';
import { TAP } from '@/lib/hit';
import { useReducedMotion } from '@/lib/use-reduced-motion';

type Glyph = 'log' | 'body' | 'train' | 'life';

export const TAB_ORDER: { name: string; label: string; glyph: Glyph }[] = [
  { name: 'log',   label: 'LOG',   glyph: 'log'   },
  { name: 'index', label: 'BODY',  glyph: 'body'  },
  { name: 'gym',   label: 'TRAIN', glyph: 'train' },
  { name: 'life',  label: 'LIFE',  glyph: 'life'  },
];

// Hidden tab routes light up the tab they belong to, so you never lose your place.
const PARENT: Record<string, string> = { habits: 'life', activity: 'gym', progress: 'gym' };

const PILL_W = 54;
const PILL_H = 30;

/** 24-unit line icons, drawn at 22 pt: a log list, a figure, a dumbbell, a calendar with a tick. */
function Icon({ glyph, color }: { glyph: Glyph; color: string }) {
  const line = { stroke: color, strokeWidth: 1.7, strokeLinecap: 'round' as const, strokeLinejoin: 'round' as const, fill: 'none' };
  return (
    <Svg width={22} height={22} viewBox="0 0 24 24">
      {glyph === 'log' && (
        <>
          <Rect x={4} y={3} width={16} height={18} rx={3.5} {...line} />
          <Path d="M8.5 8.5h7M8.5 12h7M8.5 15.5h4" {...line} />
        </>
      )}
      {glyph === 'body' && (
        <>
          <Circle cx={12} cy={4.6} r={2.3} {...line} />
          <Path d="M6 9.4c2 .9 4 1.3 6 1.3s4-.4 6-1.3M12 10.7v4.6M12 15.3l-2.6 5.6M12 15.3l2.6 5.6M9.2 10.3l-.9 4.4M14.8 10.3l.9 4.4" {...line} />
        </>
      )}
      {glyph === 'train' && (
        <>
          <Rect x={4.6} y={7} width={3} height={10} rx={1.2} {...line} />
          <Rect x={16.4} y={7} width={3} height={10} rx={1.2} {...line} />
          <Path d="M7.6 12h8.8M2.6 10v4M21.4 10v4" {...line} />
        </>
      )}
      {glyph === 'life' && (
        <>
          <Rect x={3.5} y={5} width={17} height={15.5} rx={3.5} {...line} />
          <Path d="M3.5 9.8h17M8.2 3v4M15.8 3v4M9 14.8l2 2 4-4" {...line} />
        </>
      )}
    </Svg>
  );
}

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
    const to = at * slot + (slot - PILL_W) / 2;
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
    <View style={[styles.bar, { paddingBottom: Math.max(insets.bottom - 12, 6) }]}>
      <View style={styles.row} onLayout={e => setSlot(e.nativeEvent.layout.width / TAB_ORDER.length)}>
        {slot > 0 && <Animated.View pointerEvents="none" style={[styles.pill, { transform: [{ translateX: x }] }]} />}
        {TAB_ORDER.map(t => (
          <Tab key={t.name} label={t.label} glyph={t.glyph} active={lit === t.name} reduced={reduced} onPress={() => go(t.name)} />
        ))}
      </View>
    </View>
  );
}

function Tab({ label, glyph, active, reduced, onPress }: {
  label: string; glyph: Glyph; active: boolean; reduced: boolean; onPress: () => void;
}) {
  const press = useRef(new Animated.Value(1)).current;
  const to = (v: number) => { if (!reduced) Animated.spring(press, { toValue: v, ...SPRING.pop }).start(); };
  return (
    <Pressable
      style={styles.tab}
      onPress={onPress}
      onPressIn={() => to(0.9)}
      onPressOut={() => to(1)}
      role="tab"
      accessibilityState={{ selected: active }}
      accessibilityLabel={label}
    >
      <Animated.View style={[styles.icon, { transform: [{ scale: press }] }]}>
        <Icon glyph={glyph} color={active ? C.onHot : C.dim} />
      </Animated.View>
      <Text style={[styles.label, active && styles.labelActive]}>{label}</Text>
    </Pressable>
  );
}

const styles = StyleSheet.create({
  bar: { backgroundColor: C.bg, borderTopWidth: StyleSheet.hairlineWidth, borderTopColor: C.lineHi, paddingTop: 6, paddingHorizontal: 6 },
  row: { flexDirection: 'row' },
  pill: { position: 'absolute', top: 0, left: 0, width: PILL_W, height: PILL_H, borderRadius: PILL_H / 2, backgroundColor: C.hot },
  tab: { flex: 1, minHeight: TAP, alignItems: 'center', gap: 3 },
  icon: { height: PILL_H, width: PILL_W, alignItems: 'center', justifyContent: 'center' },
  label: { fontFamily: F.dot, fontSize: 9, letterSpacing: 1.5, color: C.faint },
  labelActive: { color: C.hot },
});
