// A big number tile for sets / reps / weight. Tap − or + (they bounce), hold
// one to keep going (it speeds up), or slide a finger across the tile to
// scrub — one step per notch with a haptic tick. The value pops on change.

import { useEffect, useMemo, useRef } from 'react';
import { Animated, PanResponder, Pressable, StyleSheet, Text, View } from 'react-native';
import { MaterialCommunityIcons } from '@expo/vector-icons';
import * as Haptics from 'expo-haptics';
import { C, F, SPRING, numFace } from '@/lib/theme';

const NOTCH = 16; // px of slide per step

function Btn({ icon, onStep }: { icon: 'minus' | 'plus'; onStep: () => void }) {
  const s = useRef(new Animated.Value(1)).current;
  const repeat = useRef<ReturnType<typeof setTimeout> | null>(null);
  const stop = () => { if (repeat.current) clearTimeout(repeat.current); repeat.current = null; };
  useEffect(() => stop, []);
  const hold = (delay: number) => {
    repeat.current = setTimeout(() => { onStep(); Haptics.selectionAsync(); hold(Math.max(60, delay * 0.8)); }, delay);
  };
  return (
    <Pressable
      hitSlop={8}
      onPressIn={() => {
        Animated.spring(s, { toValue: 0.82, ...SPRING.settle }).start();
        onStep();
        Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Light);
        hold(420);
      }}
      onPressOut={() => { stop(); Animated.spring(s, { toValue: 1, ...SPRING.pop }).start(); }}
    >
      <Animated.View style={[st.btn, { transform: [{ scale: s }] }]}>
        <MaterialCommunityIcons name={icon} size={18} color={C.ink} />
      </Animated.View>
    </Pressable>
  );
}

export function Stepper({ label, value, unit, onStep }: {
  label: string; value: string; unit?: string; onStep: (delta: number) => void;
}) {
  const pop = useRef(new Animated.Value(1)).current;
  const first = useRef(true);
  useEffect(() => {
    if (first.current) { first.current = false; return; }
    pop.setValue(1.18);
    Animated.spring(pop, { toValue: 1, friction: 4, tension: 260, useNativeDriver: true }).start();
  }, [value]);

  const step = useRef(onStep);
  step.current = onStep;
  const notches = useRef(0);
  const pan = useMemo(() => PanResponder.create({
    onMoveShouldSetPanResponder: (_, g) => Math.abs(g.dx) > 8 && Math.abs(g.dx) > Math.abs(g.dy),
    onPanResponderGrant: () => { notches.current = 0; },
    onPanResponderMove: (_, g) => {
      const n = Math.trunc(g.dx / NOTCH);
      if (n === notches.current) return;
      step.current(n - notches.current);
      notches.current = n;
      Haptics.selectionAsync();
    },
    onPanResponderTerminationRequest: () => false,
  }), []);

  return (
    <View style={st.tile} {...pan.panHandlers}>
      <Text style={st.label}>{label}</Text>
      <Animated.View style={[st.valueRow, { transform: [{ scale: pop }] }]}>
        <Text style={[st.value, numFace(value, 24)]} numberOfLines={1} adjustsFontSizeToFit>{value}</Text>
        {!!unit && <Text style={st.unit}>{unit}</Text>}
      </Animated.View>
      <View style={st.btns}>
        <Btn icon="minus" onStep={() => step.current(-1)} />
        <View style={st.notches}>
          {[0, 1, 2, 3, 4].map(i => <View key={i} style={st.notch} />)}
        </View>
        <Btn icon="plus" onStep={() => step.current(1)} />
      </View>
    </View>
  );
}

const st = StyleSheet.create({
  tile: { flex: 1, backgroundColor: C.bg, borderRadius: 16, borderWidth: 1, borderColor: C.lineHi, paddingVertical: 10, paddingHorizontal: 8, gap: 6, alignItems: 'center' },
  label: { fontFamily: F.dot, fontSize: 8, color: C.dim, letterSpacing: 1.8 },
  valueRow: { flexDirection: 'row', alignItems: 'baseline', gap: 3, height: 32 },
  value: { color: C.hot },
  unit: { fontFamily: F.dot, fontSize: 9, color: C.dim, letterSpacing: 1 },
  btns: { flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between', alignSelf: 'stretch' },
  btn: { width: 36, height: 36, borderRadius: 18, backgroundColor: C.raised, borderWidth: 1, borderColor: C.lineHi, alignItems: 'center', justifyContent: 'center' },
  notches: { flexDirection: 'row', gap: 3 },
  notch: { width: 2, height: 8, borderRadius: 1, backgroundColor: C.lineHi },
});
