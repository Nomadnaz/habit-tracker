// TRAIN's ROUTINE: how many days a week, which days, and the split — the
// coach deals the sessions onto the days (lib/coach.ts weekPlan). Tap a
// count to reset the days to an even spread; tap a day to toggle it.

import { LayoutAnimation, Pressable, ScrollView, StyleSheet, Text, View } from 'react-native';
import * as Haptics from 'expo-haptics';
import { C, F } from '@/lib/theme';
import { autoSplit, defaultDays, rotation, SPLIT_NAME, splitOf, WEEK, weekPlan, type Routine, type SplitId } from '@/lib/coach';
import type { Focus } from '@/lib/workout-data';

const SHORT: Record<Focus, string> = { push: 'PUSH', pull: 'PULL', legs: 'LEGS', upper: 'UPPR', lower: 'LOWR', full: 'FULL', core: 'CORE' };
const SPLITS: SplitId[] = ['auto', 'full', 'ul', 'ppl', 'hybrid'];

export function RoutineCard({ routine, todayIdx, doneIdx, onChange }: {
  routine: Routine | null;
  /** Monday = 0. */
  todayIdx: number;
  /** Days this week with a finished session, Monday = 0. */
  doneIdx: number[];
  onChange: (r: Routine) => void;
}) {
  const r = routine ?? { days: [], split: 'auto' as SplitId };
  const n = r.days.length;
  const plan = weekPlan(r);
  const set = (next: Routine) => {
    Haptics.selectionAsync();
    LayoutAnimation.configureNext(LayoutAnimation.create(220, 'easeInEaseOut', 'opacity'));
    onChange(next);
  };

  return (
    <View style={st.card}>
      <View style={st.row}>
        <Text style={st.label}>DAYS A WEEK</Text>
        <Text style={st.caption}>{n ? `${SPLIT_NAME[splitOf(r)]} · ${rotation(r).length > 1 ? `${rotation(r).length}-DAY CYCLE` : 'EVERY SESSION'}` : 'PICK HOW OFTEN YOU TRAIN'}</Text>
      </View>
      <View style={st.counts}>
        {[1, 2, 3, 4, 5, 6, 7].map(k => (
          <Pressable key={k} onPress={() => set({ ...r, days: defaultDays(k) })} style={[st.count, n === k && st.countOn]}>
            <Text style={[st.countText, n === k && st.countTextOn]}>{k}</Text>
          </Pressable>
        ))}
      </View>

      <View style={st.week}>
        {WEEK.map((d, i) => {
          const on = r.days.includes(d);
          const focus = plan[d];
          return (
            <Pressable
              key={d}
              onPress={() => set({ ...r, days: on ? r.days.filter(x => x !== d) : WEEK.filter(x => x === d || r.days.includes(x)) })}
              style={st.dayCol}
            >
              <Text style={[st.dayLabel, i === todayIdx && { color: C.hot }]}>{d.slice(0, 3).toUpperCase()}</Text>
              <View style={[st.dayChip, on && st.dayChipOn, i === todayIdx && st.dayToday]}>
                <Text style={[st.dayText, on && st.dayTextOn]}>{on && focus && focus !== 'rest' && focus !== 'cheat' ? SHORT[focus as Focus] : 'REST'}</Text>
              </View>
              <View style={[st.doneDot, doneIdx.includes(i) && { backgroundColor: C.live }]} />
            </Pressable>
          );
        })}
      </View>

      <Text style={[st.label, { marginTop: 4 }]}>SPLIT</Text>
      <ScrollView horizontal showsHorizontalScrollIndicator={false} contentContainerStyle={st.splits}>
        {SPLITS.map(s => {
          const on = r.split === s;
          const label = s === 'auto' ? `AUTO${n ? ` · ${SPLIT_NAME[autoSplit(n)]}` : ''}` : SPLIT_NAME[s];
          return (
            <Pressable key={s} onPress={() => set({ ...r, split: s })} style={[st.split, on && st.splitOn]}>
              <Text style={[st.splitText, on && st.splitTextOn]}>{label}</Text>
            </Pressable>
          );
        })}
      </ScrollView>
    </View>
  );
}

const st = StyleSheet.create({
  card: { marginHorizontal: 16, marginBottom: 18, backgroundColor: C.surface, borderRadius: 22, borderWidth: 1, borderColor: C.line, padding: 16, gap: 10 },
  row: { flexDirection: 'row', justifyContent: 'space-between', alignItems: 'center', gap: 8 },
  label: { fontFamily: F.dot, fontSize: 9, color: C.dim, letterSpacing: 2 },
  caption: { flexShrink: 1, fontFamily: F.dot, fontSize: 8, color: C.faint, letterSpacing: 1.2, textAlign: 'right' },
  counts: { flexDirection: 'row', gap: 6 },
  count: { flex: 1, height: 38, borderRadius: 19, borderWidth: 1, borderColor: C.line, alignItems: 'center', justifyContent: 'center', backgroundColor: C.bg },
  countOn: { backgroundColor: C.hot, borderColor: C.hot },
  countText: { fontFamily: F.dot, fontSize: 13, color: C.dim },
  countTextOn: { color: C.onHot },
  week: { flexDirection: 'row', gap: 4 },
  dayCol: { flex: 1, alignItems: 'center', gap: 5 },
  dayLabel: { fontFamily: F.dot, fontSize: 8, color: C.dim, letterSpacing: 1 },
  dayChip: { width: '100%', height: 44, borderRadius: 12, borderWidth: 1, borderColor: C.line, alignItems: 'center', justifyContent: 'center', backgroundColor: C.bg },
  dayChipOn: { backgroundColor: C.raised, borderColor: C.lineHi },
  dayToday: { borderColor: C.hot },
  dayText: { fontFamily: F.dot, fontSize: 8, color: C.faint, letterSpacing: 0.5 },
  dayTextOn: { color: C.hot },
  doneDot: { width: 4, height: 4, borderRadius: 2, backgroundColor: 'transparent' },
  splits: { gap: 6 },
  split: { height: 34, paddingHorizontal: 14, borderRadius: 17, borderWidth: 1, borderColor: C.line, alignItems: 'center', justifyContent: 'center' },
  splitOn: { backgroundColor: C.hot, borderColor: C.hot },
  splitText: { fontFamily: F.dot, fontSize: 9, color: C.dim, letterSpacing: 1.2 },
  splitTextOn: { color: C.onHot },
});
