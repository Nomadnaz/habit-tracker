// How hard the chosen weight × reps is, as a row of dots like the battery
// bar: green → yellow → amber → red, lit up to the difficulty, with the word
// and reps in reserve. Animates as the weight changes.

import { useEffect, useRef, useState } from 'react';
import { Animated, StyleSheet, Text, View } from 'react-native';
import { C, F } from '@/lib/theme';
import type { Difficulty } from '@/lib/exercise-guide';

const DOTS = 20;
// Green → yellow → amber → red along the bar.
const STOPS: [number, number, number][] = [[116, 242, 91], [242, 226, 74], [255, 178, 63], [255, 59, 48]];
function at(t: number): string {
  const x = Math.max(0, Math.min(1, t)) * (STOPS.length - 1);
  const i = Math.min(STOPS.length - 2, Math.floor(x)), f = x - i;
  const c = STOPS[i].map((v, k) => Math.round(v + (STOPS[i + 1][k] - v) * f));
  return `rgb(${c[0]},${c[1]},${c[2]})`;
}

export function DifficultyBar({ d, measured }: { d: Difficulty | null; measured: boolean }) {
  const fill = useRef(new Animated.Value(0)).current;
  const [lit, setLit] = useState(0);
  useEffect(() => {
    const id = fill.addListener(({ value }) => setLit(Math.round(value)));
    Animated.spring(fill, { toValue: d ? Math.round(d.level * DOTS) : 0, friction: 7, tension: 90, useNativeDriver: false }).start();
    return () => fill.removeListener(id);
  }, [d?.level]);

  const tone = d ? at(d.level) : C.dim;
  const reserve = !d ? '' : d.rir < 0 ? `${-d.rir} REP${d.rir === -1 ? '' : 'S'} SHORT` : d.rir === 0 ? 'NOTHING LEFT' : `${d.rir} IN RESERVE`;
  return (
    <View style={st.wrap}>
      <View style={st.head}>
        <Text style={[st.word, { color: tone }]}>{d ? d.word : 'BODYWEIGHT'}</Text>
        <Text style={st.sub}>{d ? `${reserve}${measured ? '' : ' · ESTIMATE'}` : 'Use reps to make it harder'}</Text>
      </View>
      <View style={st.dots}>
        {Array.from({ length: DOTS }, (_, i) => (
          <View key={i} style={[st.dot, { backgroundColor: i < lit ? at(i / (DOTS - 1)) : C.ghost }]} />
        ))}
      </View>
    </View>
  );
}

const st = StyleSheet.create({
  wrap: { gap: 6 },
  head: { flexDirection: 'row', justifyContent: 'space-between', alignItems: 'baseline' },
  word: { fontFamily: F.dot, fontSize: 11, letterSpacing: 1.5 },
  sub: { fontFamily: F.mono, fontSize: 10, color: C.dim },
  dots: { flexDirection: 'row', gap: 3 },
  dot: { flex: 1, height: 9, borderRadius: 4.5 },
});
