// ─────────────────────────────────────────────────────────────────────────
// HISTORY — from TRAIN's HISTORY box. Every training day, newest first: the
// day it was, what it was (the ticked template's name), the lifts with sets
// and weight, and a small front/back body with the muscles it worked lit red
// (lib/history.ts, components/train/BodyMini.tsx).
// ─────────────────────────────────────────────────────────────────────────

import { useCallback, useState } from 'react';
import { ScrollView, StyleSheet, Text, View } from 'react-native';
import { SafeAreaView, useSafeAreaInsets } from 'react-native-safe-area-context';
import { useFocusEffect } from 'expo-router';

import { getDoneLog, getTemplates, getTrainingSessions } from '@/lib/workout-data';
import { buildHistory, dayName, shortDate, type DayLog } from '@/lib/history';
import { formatWeightWithUnit, useUnitPreference } from '@/lib/unit-preference';
import { toDateKey } from '@/lib/dateKey';
import { ScreenHeader } from '@/components/ScreenHeader';
import { Corners } from '@/components/Corners';
import { BodyMini } from '@/components/train/BodyMini';
import { Reveal } from '@/components/Reveal';
import { C, F } from '@/lib/theme';

export default function History() {
  const insets = useSafeAreaInsets();
  const { unitSystem } = useUnitPreference();
  const [days, setDays] = useState<DayLog[] | null>(null);

  useFocusEffect(useCallback(() => {
    void Promise.all([getTrainingSessions(120), getDoneLog(), getTemplates()])
      .then(([s, d, t]) => setDays(buildHistory(s, d, t)));
  }, []));

  const today = toDateKey(new Date());

  return (
    <SafeAreaView style={st.safe} edges={['top']}>
      <ScreenHeader title="HISTORY" />
      <ScrollView contentContainerStyle={{ paddingHorizontal: 16, paddingBottom: 40 + insets.bottom, gap: 10 }} showsVerticalScrollIndicator={false}>
        {days && <Text style={st.eyebrow}>{`${days.length} TRAINING DAYS  ·  LAST 120`}</Text>}
        {days?.length === 0 && <Text style={st.empty}>Nothing yet. Tick off a workout and it shows up here.</Text>}
        {days?.map((d, i) => (
          <Reveal key={d.date} delay={Math.min(i, 8) * 60}>
            <View style={st.card}>
              {d.date === today && <Corners color={C.live} />}
              <View style={{ flex: 1, gap: 6 }}>
                <View style={st.head}>
                  <Text style={[st.day, d.date === today && { color: C.live }]}>{d.date === today ? 'TODAY' : dayName(d.date)}</Text>
                  <Text style={st.date}>{shortDate(d.date)}</Text>
                </View>
                <Text style={st.title} numberOfLines={1}>{d.title}</Text>
                {d.lifts.map(l => (
                  <View key={l.id} style={st.lift}>
                    <Text style={st.liftName} numberOfLines={1}>{l.name}</Text>
                    <Text style={st.liftMeta}>{`${l.sets}×${l.reps ?? '-'}${l.weightKg > 0 ? ` · ${formatWeightWithUnit(l.weightKg, unitSystem)}` : ''}`}</Text>
                  </View>
                ))}
              </View>
              <BodyMini load={d.load} height={120} />
            </View>
          </Reveal>
        ))}
      </ScrollView>
    </SafeAreaView>
  );
}

const st = StyleSheet.create({
  safe: { flex: 1, backgroundColor: C.bg },
  eyebrow: { fontFamily: F.mono, fontSize: 11, letterSpacing: 2, color: C.dim, marginBottom: 2 },
  empty: { fontFamily: F.mono, fontSize: 12, color: C.dim, paddingVertical: 10 },
  card: { flexDirection: 'row', gap: 12, backgroundColor: C.surface, borderWidth: 1, borderColor: C.line, padding: 14 },
  head: { flexDirection: 'row', alignItems: 'baseline', gap: 8 },
  day: { fontFamily: F.dot, fontSize: 11, color: C.ink, letterSpacing: 1.5 },
  date: { fontFamily: F.mono, fontSize: 10, color: C.dim, letterSpacing: 1 },
  title: { fontFamily: F.dot, fontSize: 18, color: C.hot, letterSpacing: 0.8, marginBottom: 2 },
  lift: { flexDirection: 'row', alignItems: 'baseline', gap: 6 },
  liftName: { flex: 1, fontFamily: F.dot, fontSize: 9, color: C.ink, letterSpacing: 0.8 },
  liftMeta: { fontFamily: F.mono, fontSize: 10, color: C.dim },
});
