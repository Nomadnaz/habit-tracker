// How hard the chosen weight × reps is, on one slim line: the word, a short
// row of dots green → yellow → amber → red lit up to the difficulty, and the
// reps in reserve. Animates as the weight changes.

import { useEffect, useRef, useState } from 'react';
import { Animated, StyleSheet, Text, View } from 'react-native';
import { C, F } from '@/lib/theme';
import type { Difficulty } from '@/lib/exercise-guide';

const DOTS = 12;
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
  const reserve = !d ? 'ADD REPS' : d.rir < 0 ? `${-d.rir} SHORT` : d.rir === 0 ? '0 LEFT' : `${d.rir} RIR`;
  return (
    <View style={st.row}>
      <Text style={[st.word, { color: tone }]} numberOfLines={1}>{d ? d.word : 'BODYWEIGHT'}</Text>
      <View style={st.dots}>
        {Array.from({ length: DOTS }, (_, i) => (
          <View key={i} style={[st.dot, { backgroundColor: i < lit ? at(i / (DOTS - 1)) : C.ghost }]} />
        ))}
      </View>
      <Text style={st.sub} numberOfLines={1}>{`${reserve}${d && !measured ? ' ~' : ''}`}</Text>
    </View>
  );
}

const st = StyleSheet.create({
  row: { flexDirection: 'row', alignItems: 'center', gap: 8, height: 18 },
  word: { fontFamily: F.dot, fontSize: 8, letterSpacing: 1.2, width: 74 },
  dots: { flexDirection: 'row', gap: 2, width: 96 },
  dot: { flex: 1, height: 5, borderRadius: 1 },
  sub: { flex: 1, textAlign: 'right', fontFamily: F.mono, fontSize: 10, color: C.dim },
});
