// TRAIN's calendar: a strip of days, the past few, today and the week ahead,
// that scrolls back further. Each day shows what happened on it — a white
// bar for lifting, a green one for a run, a grey dot for anything else
// logged, a dash for a day marked missed — and, from today on, an outline
// for a planned session. Tap a day to open it below.
import { useRef } from 'react';
import { View, Text, StyleSheet, Pressable, ScrollView } from 'react-native';
import * as Haptics from 'expo-haptics';
import { C, F } from '@/lib/theme';
import { TAP } from '@/lib/hit';
import { fromDateKey } from '@/lib/dateKey';
import type { DayMark } from '@/lib/train-days';

const W = 42;
const GAP = 5;
const DOW = ['S', 'M', 'T', 'W', 'T', 'F', 'S'];

export function DayStrip({ marks, today, selected, onSelect }: {
  marks: DayMark[]; today: string; selected: string; onSelect: (date: string) => void;
}) {
  const scroll = useRef<ScrollView>(null);
  const placed = useRef(false);

  // Open with today a little right of centre, so the days before it show.
  const place = (width: number) => {
    if (placed.current || !marks.length) return;
    placed.current = true;
    const i = marks.findIndex(m => m.date === today);
    scroll.current?.scrollTo({ x: Math.max(0, i * (W + GAP) - width * 0.6 + W / 2), animated: false });
  };

  return (
    <ScrollView
      ref={scroll}
      horizontal
      showsHorizontalScrollIndicator={false}
      contentContainerStyle={styles.row}
      onLayout={e => place(e.nativeEvent.layout.width)}
    >
      {marks.map(m => {
        const d = fromDateKey(m.date)!;
        const on = m.date === selected;
        const isToday = m.date === today;
        const future = m.date > today;
        const planned = m.plan && m.plan !== 'rest' && m.plan !== 'cheat';
        const ink = on ? C.onHot : future ? C.dim : C.ink;
        return (
          <Pressable
            key={m.date}
            onPress={() => { if (!on) { void Haptics.selectionAsync(); onSelect(m.date); } }}
            style={[styles.day, isToday && styles.today, on && styles.on]}
            accessibilityLabel={`${d.toDateString()}${m.lifted ? ', lifted' : ''}${m.ran ? ', ran' : ''}${m.missed ? ', missed' : ''}${planned ? ', session planned' : ''}`}
            accessibilityState={{ selected: on }}
          >
            <Text style={[styles.dow, { color: on ? C.onHot : C.faint }]}>{isToday ? 'NOW' : DOW[d.getDay()]}</Text>
            <Text style={[styles.num, { color: ink }]}>{d.getDate()}</Text>
            <View style={styles.marks}>
              {m.lifted && <View style={[styles.bar, { backgroundColor: on ? C.onHot : C.hot }]} />}
              {m.ran && <View style={[styles.bar, { backgroundColor: C.live }]} />}
              {!m.lifted && !m.ran && m.logged && <View style={[styles.dot, { backgroundColor: on ? C.onHot : C.faint }]} />}
              {!m.logged && m.missed && <View style={[styles.dash, { backgroundColor: on ? C.onHot : C.faint }]} />}
              {!m.lifted && !m.ran && future && planned && <View style={[styles.ring, { borderColor: on ? C.onHot : C.dim }]} />}
            </View>
          </Pressable>
        );
      })}
    </ScrollView>
  );
}

const styles = StyleSheet.create({
  row: { paddingHorizontal: 16, gap: GAP },
  day: {
    width: W, minHeight: TAP + 12, alignItems: 'center', justifyContent: 'center', gap: 3,
    borderRadius: 12, borderCurve: 'continuous', borderWidth: 1, borderColor: C.line,
  },
  today: { borderColor: C.lineHi, backgroundColor: C.surface },
  on: { backgroundColor: C.hot, borderColor: C.hot },
  dow: { fontFamily: F.dot, fontSize: 8, letterSpacing: 1 },
  num: { fontFamily: F.dot, fontSize: 15 },
  marks: { flexDirection: 'row', gap: 3, height: 6, alignItems: 'center' },
  bar: { width: 9, height: 4, borderRadius: 2 },
  dot: { width: 4, height: 4, borderRadius: 2 },
  dash: { width: 9, height: 2 },
  ring: { width: 8, height: 8, borderRadius: 4, borderWidth: 1.2 },
});
