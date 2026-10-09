// Bottom bar: four destinations split around the PUCK dot — the same white
// square the puck shows while recording. Tap it to open chat, hold it to talk.
// Active tab = white label + a single dot above it, like the puck's pager dots.
import { useEffect, useRef } from 'react';
import { View, Text, StyleSheet, Pressable, Animated } from 'react-native';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import type { BottomTabBarProps } from '@react-navigation/bottom-tabs';
import * as Haptics from 'expo-haptics';
import { C, F, SPRING } from '@/lib/theme';
import { openFromDot, useAssistant } from '@/lib/assistant';
import { useHoldToTalk } from '@/components/assistant/useHoldToTalk';

export const TAB_ORDER: { name: string; label: string }[] = [
  { name: 'index', label: 'TODAY' },
  { name: 'body',  label: 'BODY'  },
  { name: 'gym',   label: 'TRAIN' },
  { name: 'life',  label: 'LIFE'  },
];

export function PuckTabBar({ state, navigation }: BottomTabBarProps) {
  const insets = useSafeAreaInsets();
  const current = state.routes[state.index]?.name;
  const go = (name: string) => {
    const route = state.routes.find(r => r.name === name);
    if (!route) return;
    const ev = navigation.emit({ type: 'tabPress', target: route.key, canPreventDefault: true });
    if (current !== name && !ev.defaultPrevented) {
      Haptics.selectionAsync();
      navigation.navigate(name);
    }
  };
  const tabs = TAB_ORDER.map(t => <Tab key={t.name} label={t.label} active={current === t.name} onPress={() => go(t.name)} />);

  return (
    <View style={[styles.bar, { paddingBottom: Math.max(insets.bottom - 6, 10) }]}>
      {tabs.slice(0, 2)}
      <PuckDot />
      {tabs.slice(2)}
    </View>
  );
}

function Tab({ label, active, onPress }: { label: string; active: boolean; onPress: () => void }) {
  const a = useRef(new Animated.Value(active ? 1 : 0)).current;
  const press = useRef(new Animated.Value(1)).current;
  useEffect(() => { Animated.spring(a, { toValue: active ? 1 : 0, ...SPRING.pop }).start(); }, [active]);
  return (
    <Pressable
      style={styles.tab}
      onPress={onPress}
      onPressIn={() => Animated.spring(press, { toValue: 0.9, ...SPRING.pop }).start()}
      onPressOut={() => Animated.spring(press, { toValue: 1, ...SPRING.pop }).start()}
      hitSlop={6}
    >
      <Animated.View style={{ alignItems: 'center', transform: [{ scale: press }] }}>
        <Animated.View style={[styles.pip, { opacity: a, transform: [{ scale: a }] }]} />
        <Text style={[styles.label, active && styles.labelActive]}>{label}</Text>
      </Animated.View>
    </Pressable>
  );
}

function PuckDot() {
  const { phase } = useAssistant();
  const talk = useHoldToTalk();
  const scale = useRef(new Animated.Value(1)).current;
  const held = useRef(false);
  const live = phase === 'rec';

  return (
    <Pressable
      onPressIn={() => Animated.spring(scale, { toValue: 0.86, ...SPRING.pop }).start()}
      onPressOut={() => {
        Animated.spring(scale, { toValue: 1, ...SPRING.pop }).start();
        if (held.current) { held.current = false; talk.stop(); }
      }}
      onPress={() => { Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Light); openFromDot(); }}
      onLongPress={() => { held.current = true; void talk.start(); }}
      delayLongPress={280}
      style={styles.puckSlot}
      accessibilityLabel="Assistant. Tap to chat, hold to talk."
    >
      <Animated.View style={[styles.puck, live && styles.puckLive, { transform: [{ scale }] }]}>
        <View style={[styles.puckSquare, live && { backgroundColor: C.onHot }]} />
      </Animated.View>
    </Pressable>
  );
}

const styles = StyleSheet.create({
  bar: {
    flexDirection: 'row', alignItems: 'center', backgroundColor: C.bg,
    borderTopWidth: 1, borderTopColor: C.line, paddingTop: 8, paddingHorizontal: 6,
  },
  tab: { flex: 1, alignItems: 'center', paddingVertical: 6 },
  pip: { width: 4, height: 4, backgroundColor: C.hot, marginBottom: 6 },
  label: { fontFamily: F.dot, fontSize: 12, letterSpacing: 2, color: C.faint },
  labelActive: { color: C.hot },
  puckSlot: { width: 76, alignItems: 'center', marginTop: -22 },
  puck: {
    width: 60, height: 60, borderRadius: 30, backgroundColor: C.bg,
    borderWidth: 1.5, borderColor: C.lineHi, alignItems: 'center', justifyContent: 'center',
  },
  puckLive: { backgroundColor: C.hot, borderColor: C.hot },
  puckSquare: { width: 16, height: 16, backgroundColor: C.hot },
});
