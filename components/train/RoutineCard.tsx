// TRAIN's ROUTINE: how many days a week, which days, and the split — the
// coach deals the sessions onto the days (lib/coach.ts weekPlan). Tap a
// count to reset the days to an even spread; tap a day to cycle it
// rest → training → cheat → rest. The week reads as bracketed boxes: today's
// session solid green, the ones to come grey with green corners, cheat days
// red, rest days black.

import { LayoutAnimation, Pressable, ScrollView, StyleSheet, Text, View } from 'react-native';
import * as Haptics from 'expo-haptics';
import { MaterialCommunityIcons } from '@expo/vector-icons';
import { C, F } from '@/lib/theme';
import { Corners } from '@/components/Corners';
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
          <Pressable key={k} onPress={() => { const days = defaultDays(k); set({ ...r, days, cheat: (r.cheat ?? []).filter(d => !days.includes(d)) }); }} style={[st.count, n === k && st.countOn]}>
            {n === k && <Corners color={C.hot} size={7} />}
            <Text style={[st.countText, n === k && st.countTextOn]}>{k}</Text>
          </Pressable>
        ))}
      </View>

      <View style={st.week}>
        {WEEK.map((d, i) => {
          const on = r.days.includes(d);
          const cheat = !on && (r.cheat ?? []).includes(d);
          const focus = plan[d];
          // rest → training → cheat → rest
          const cycle = () => set(on
            ? { ...r, days: r.days.filter(x => x !== d), cheat: [...(r.cheat ?? []), d] }
            : cheat
              ? { ...r, cheat: (r.cheat ?? []).filter(x => x !== d) }
              : { ...r, days: WEEK.filter(x => x === d || r.days.includes(x)) });
          const kind = cheat ? 'cheat' : !on ? 'rest' : i === todayIdx ? 'today' : i > todayIdx ? 'next' : 'past';
          const done = doneIdx.includes(i);
          return (
            <Pressable key={d} onPress={cycle} style={st.dayCol} accessibilityLabel={`${d}: ${kind === 'cheat' ? 'cheat day' : on ? 'training' : 'rest'}`}>
              <Text style={[st.dayLabel, i === todayIdx && { color: C.hot }]}>{d.slice(0, 3).toUpperCase()}</Text>
              <View style={[st.dayBox, BOX[kind]]}>
                {kind !== 'rest' && <Corners color={CORNER[kind]} size={7} />}
                {done && kind !== 'rest' && kind !== 'cheat'
                  ? <MaterialCommunityIcons name="check-bold" size={14} color={TEXT[kind]} />
                  : <Text style={[st.dayText, { color: TEXT[kind] }]}>{kind === 'cheat' ? 'CHEAT' : on && focus && focus !== 'rest' && focus !== 'cheat' ? SHORT[focus as Focus] : 'REST'}</Text>}
              </View>
            </Pressable>
          );
        })}
      </View>
      <Text style={st.hint}>TAP A DAY  ·  TRAIN → CHEAT → REST</Text>

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

type Kind = 'today' | 'next' | 'past' | 'cheat' | 'rest';
const BOX: Record<Kind, object> = {
  today: { backgroundColor: C.live },
  next: { backgroundColor: C.raised },
  past: { backgroundColor: C.raised, opacity: 0.6 },
  cheat: { backgroundColor: 'rgba(255,59,48,0.12)' },
  rest: { backgroundColor: C.bg, borderWidth: 1, borderColor: C.line },
};
const CORNER: Record<Kind, string> = { today: C.live, next: C.live, past: C.lineHi, cheat: C.alert, rest: C.line };
const TEXT: Record<Kind, string> = { today: C.onHot, next: C.ink, past: C.dim, cheat: C.alert, rest: C.faint };

const st = StyleSheet.create({
  card: { marginHorizontal: 16, marginBottom: 18, backgroundColor: C.surface, borderRadius: 22, borderCurve: 'continuous', borderWidth: 1, borderColor: C.line, padding: 16, gap: 10 },
  row: { flexDirection: 'row', justifyContent: 'space-between', alignItems: 'center', gap: 8 },
  label: { fontFamily: F.dot, fontSize: 9, color: C.dim, letterSpacing: 2 },
  caption: { flexShrink: 1, fontFamily: F.dot, fontSize: 8, color: C.faint, letterSpacing: 1.2, textAlign: 'right' },
  counts: { flexDirection: 'row', gap: 6 },
  count: { flex: 1, height: 36, borderWidth: 1, borderColor: C.line, alignItems: 'center', justifyContent: 'center', backgroundColor: C.bg },
  countOn: { backgroundColor: C.raised, borderColor: 'transparent' },
  countText: { fontFamily: F.dot, fontSize: 13, color: C.dim },
  countTextOn: { color: C.hot },
  week: { flexDirection: 'row', gap: 4 },
  dayCol: { flex: 1, alignItems: 'center', gap: 5 },
  dayLabel: { fontFamily: F.dot, fontSize: 8, color: C.dim, letterSpacing: 1 },
  dayBox: { width: '100%', height: 48, alignItems: 'center', justifyContent: 'center' },
  dayText: { fontFamily: F.dot, fontSize: 8, letterSpacing: 0.5 },
  hint: { fontFamily: F.mono, fontSize: 9, letterSpacing: 1.5, color: C.faint, textAlign: 'center' },
  splits: { gap: 6 },
  split: { height: 34, paddingHorizontal: 14, borderRadius: 17, borderWidth: 1, borderColor: C.line, alignItems: 'center', justifyContent: 'center' },
  splitOn: { backgroundColor: C.hot, borderColor: C.hot },
  splitText: { fontFamily: F.dot, fontSize: 9, color: C.dim, letterSpacing: 1.2 },
  splitTextOn: { color: C.onHot },
});
