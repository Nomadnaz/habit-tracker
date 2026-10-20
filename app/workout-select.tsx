// ─────────────────────────────────────────────────────────────────────────
// SELECT — TRAIN's WORKOUT square lands here, not straight in a session.
// A dial of sessions (components/train/Dial.tsx): the coach's next one lit
// green in the slot at the top, the rotation after it in the order it comes
// round, then the other foci and your own days (lib/workout-dial.ts). START
// (or tapping the slotted one) opens LOG WORKOUT on it; DAYS opens the list
// to create, rename, edit and delete days (app/workout-days.tsx).
// ─────────────────────────────────────────────────────────────────────────

import { useCallback, useState } from 'react';
import { Pressable, StyleSheet, Text, View } from 'react-native';
import { SafeAreaView, useSafeAreaInsets } from 'react-native-safe-area-context';
import { useFocusEffect, useRouter } from 'expo-router';
import * as Haptics from 'expo-haptics';

import { getJunctions, getTemplates } from '@/lib/workout-data';
import { loadCoach } from '@/lib/routine';
import { dialOrder, type DialItem } from '@/lib/workout-dial';
import { Dial } from '@/components/train/Dial';
import { HeaderPill, ScreenHeader } from '@/components/ScreenHeader';
import { C, F } from '@/lib/theme';

const pad2 = (n: number) => String(n).padStart(2, '0');

export default function WorkoutSelect() {
  const router = useRouter();
  const insets = useSafeAreaInsets();
  const [items, setItems] = useState<DialItem[] | null>(null);
  const [index, setIndex] = useState(0);
  const [box, setBox] = useState<{ w: number; h: number } | null>(null);

  // Re-read on every return: a day renamed or added on DAYS shows up here.
  useFocusEffect(useCallback(() => {
    void (async () => {
      const [c, templates, junctions] = await Promise.all([loadCoach(), getTemplates(), getJunctions()]);
      const count = (id: string) => junctions.filter(j => j.templateId === id).length;
      const next = dialOrder({ today: c.today, routine: c.routine, templates, liftsOf: count, now: new Date() });
      setItems(next);
      setIndex(i => Math.min(i, next.length - 1));
    })();
  }, []));

  const start = (it: DialItem) => {
    void Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Medium);
    router.push({ pathname: '/workouts', params: 'focus' in it.sel ? { focus: it.sel.focus } : { templateId: it.sel.templateId } });
  };

  const cur = items?.[index];

  return (
    <SafeAreaView style={st.safe} edges={['top']}>
      <ScreenHeader title="SELECT" right={<HeaderPill label="DAYS" onPress={() => router.push('/workout-days')} />} />

      <View style={st.eyebrowRow}>
        <Text style={st.eyebrow}>CHOOSE A SESSION</Text>
        {items && <Text style={st.count}>{pad2(index + 1)}/{pad2(items.length)}</Text>}
      </View>

      <View style={st.dialBox} onLayout={e => setBox({ w: e.nativeEvent.layout.width, h: e.nativeEvent.layout.height })}>
        {items && box && <Dial items={items} width={box.w} height={box.h} onFocus={setIndex} onPick={start} />}
      </View>

      {cur && (
        <View style={[st.readout, { paddingBottom: 16 + insets.bottom }]}>
          <View style={st.stats}>
            <Stat label="WHEN" value={cur.when ?? 'ANY DAY'} live={cur.next} />
            <Stat label="LIFTS" value={String(cur.lifts)} />
            <Stat label="READY" value={cur.ready != null ? `${cur.ready}%` : '--'} />
          </View>
          <Pressable
            onPress={() => start(cur)}
            accessibilityRole="button"
            style={({ pressed }) => [st.go, { backgroundColor: cur.next ? C.live : C.hot }, pressed && { opacity: 0.85 }]}
          >
            <Text style={st.goText} numberOfLines={1}>START {cur.title}</Text>
          </Pressable>
        </View>
      )}
    </SafeAreaView>
  );
}

function Stat({ label, value, live }: { label: string; value: string; live?: boolean }) {
  return (
    <View style={st.stat}>
      <Text style={st.statLabel}>{label}</Text>
      <Text style={[st.statValue, live && { color: C.live }]} numberOfLines={1}>{value}</Text>
    </View>
  );
}

const st = StyleSheet.create({
  safe: { flex: 1, backgroundColor: C.bg },
  eyebrowRow: { flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between', paddingHorizontal: 16, paddingBottom: 8 },
  eyebrow: { fontFamily: F.mono, fontSize: 11, letterSpacing: 2, color: C.dim },
  count: { fontFamily: F.dot, fontSize: 12, letterSpacing: 1, color: C.dim },
  dialBox: { flex: 1, borderTopWidth: 1, borderColor: C.line },
  readout: { borderTopWidth: 1, borderColor: C.line, paddingHorizontal: 16, paddingTop: 14, gap: 14, backgroundColor: C.bg },
  stats: { flexDirection: 'row', gap: 8 },
  stat: { flex: 1, borderWidth: 1, borderColor: C.line, backgroundColor: C.surface, paddingVertical: 10, paddingHorizontal: 12 },
  statLabel: { fontFamily: F.mono, fontSize: 9, letterSpacing: 2, color: C.dim },
  statValue: { fontFamily: F.dot, fontSize: 16, color: C.ink, marginTop: 4 },
  go: { height: 54, alignItems: 'center', justifyContent: 'center', paddingHorizontal: 16 },
  goText: { fontFamily: F.dot, fontSize: 16, letterSpacing: 1.5, color: C.onHot },
});
