// ─────────────────────────────────────────────────────────────────────────
// STRENGTH — full-detail destination for the BODY hub's STRENGTH tile.
// Real headline-lift cards, a full trailing-28-day muscle-group breakdown,
// and the strength-trend detail chart. All data comes from lib/body-data.ts
// (which already aggregates lib/workout-data.ts's real exercises/PB log).
// ─────────────────────────────────────────────────────────────────────────

import { useState, useCallback } from 'react';
import { View, Text, ScrollView, StyleSheet } from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';
import { useFocusEffect } from 'expo-router';
import { Spark } from '@/components/Spark';
import { loadBodyData, getMuscleGroupBreakdown, type BodyData, type MuscleGroupTally } from '@/lib/body-data';

import { C, F } from '@/lib/theme';
import { ScreenHeader } from '@/components/ScreenHeader';
import { formatWeightFromKg, weightUnitLabel } from '@/lib/unit-preference';
const CARD   = C.surface;
const BOLD = F.mono;
const REG = F.mono;
const NUM    = F.mono;

export default function StrengthScreen() {
  const [data, setData] = useState<BodyData | null>(null);
  const [muscleGroups, setMuscleGroups] = useState<MuscleGroupTally[]>([]);

  useFocusEffect(useCallback(() => {
    loadBodyData().then(setData);
    getMuscleGroupBreakdown().then(setMuscleGroups);
  }, []));

  if (!data) return <SafeAreaView style={s.container} edges={['top']} />;

  const maxCount = Math.max(...muscleGroups.map(m => m.count), 1);

  return (
    <SafeAreaView style={s.container} edges={['top']}>
      <ScreenHeader title="STRENGTH" />

      <ScrollView contentContainerStyle={s.content} showsVerticalScrollIndicator={false}>
        <Text style={s.sectionLabel}>HEADLINE LIFTS</Text>
        {data.headlineLifts.length === 0 && (
          <Text style={s.empty}>Log a bench press, squat, or deadlift in Workouts to see it here.</Text>
        )}
        {data.headlineLifts.map(lift => (
          <View key={lift.name} style={s.liftCard}>
            <View style={s.liftHeader}>
              <Text style={s.liftName}>{lift.name}</Text>
              <Text style={s.liftValue}>{formatWeightFromKg(lift.topSetKg)}<Text style={s.liftUnit}>{weightUnitLabel()}</Text></Text>
            </View>
            {/* With no PBs the figure is the weight the plan sets, not one you've logged. */}
            <Text style={s.liftSub}>{lift.history.length ? 'TOP SET — max weight logged, not a calculated 1RM' : 'WORKING WEIGHT — what your plan sets, not a PB yet'}</Text>
            {lift.history.length > 0 ? (
              <Spark points={lift.history} dots width={280} height={60} />
            ) : (
              <Text style={s.emptySmall}>No PBs logged yet</Text>
            )}
            <Text style={s.liftDelta}>
              {lift.history.length >= 2
                ? `${lift.deltaKg >= 0 ? '+' : ''}${lift.deltaKg}KG vs 90 days ago`
                : 'Not enough data yet for a trend'}
            </Text>
          </View>
        ))}

        <Text style={[s.sectionLabel, s.sectionLabelSpaced]}>STRENGTH TREND</Text>
        {data.strengthTrend ? (
          <View style={s.trendCard}>
            <Text style={[s.trendPct, { color: C.hot }]}>
              {data.strengthTrend.pct >= 0 ? '+' : ''}{data.strengthTrend.pct}%
            </Text>
            <Text style={s.trendSub}>average change across qualifying lifts, vs 90 days ago</Text>
            <Spark points={data.strengthTrend.history} dots width={280} height={70} />
          </View>
        ) : (
          <Text style={s.empty}>Log at least 2 PBs on a headline lift to see a trend.</Text>
        )}

        <Text style={[s.sectionLabel, s.sectionLabelSpaced]}>MUSCLE GROUP FREQUENCY (28 DAYS)</Text>
        {muscleGroups.length === 0 && (
          <Text style={s.empty}>Create exercises with muscle-group tags in Workouts to see this breakdown.</Text>
        )}
        {muscleGroups.map(m => (
          <View key={m.group} style={s.barRow}>
            <Text style={s.barLabel}>{m.group.toUpperCase()}</Text>
            <View style={s.barTrack}>
              <View style={[s.barFill, { width: `${Math.max(4, (m.count / maxCount) * 100)}%` }]} />
            </View>
            <Text style={s.barValue}>{m.count}</Text>
          </View>
        ))}
      </ScrollView>
    </SafeAreaView>
  );
}

const s = StyleSheet.create({
  container: { flex: 1, backgroundColor: C.surface },
  content: { paddingHorizontal: 16, paddingBottom: 40 },
  sectionLabel: { fontFamily: F.dot, fontSize: 12, color: C.ink, letterSpacing: 1, marginBottom: 10 },
  sectionLabelSpaced: { marginTop: 24 },
  empty: { fontFamily: REG, fontSize: 12, color: C.dim, marginBottom: 12, lineHeight: 16 },
  emptySmall: { fontFamily: REG, fontSize: 10, color: C.dim, marginVertical: 8 },

  liftCard: { backgroundColor: CARD, borderRadius: 12, borderWidth: 1, borderColor: C.line, padding: 14, marginBottom: 10 },
  liftHeader: { flexDirection: 'row', justifyContent: 'space-between', alignItems: 'center' },
  liftName: { fontFamily: BOLD, fontSize: 13, color: C.ink, letterSpacing: 1 },
  liftValue: { fontFamily: NUM, fontSize: 20, color: C.hot },
  liftUnit: { fontFamily: BOLD, fontSize: 12 },
  liftSub: { fontFamily: REG, fontSize: 9, color: C.dim, marginTop: 2, marginBottom: 8 },
  liftDelta: { fontFamily: REG, fontSize: 10, color: C.dim, marginTop: 6 },

  trendCard: { backgroundColor: CARD, borderRadius: 12, borderWidth: 1, borderColor: C.line, padding: 14, marginBottom: 12, alignItems: 'center' },
  trendPct: { fontFamily: NUM, fontSize: 32 },
  trendSub: { fontFamily: REG, fontSize: 10, color: C.dim, marginTop: 4, marginBottom: 12, textAlign: 'center' },

  barRow: { flexDirection: 'row', alignItems: 'center', gap: 10, marginBottom: 10 },
  barLabel: { fontFamily: BOLD, fontSize: 10, color: C.ink, width: 90, letterSpacing: 0.5 },
  barTrack: { flex: 1, height: 10, backgroundColor: C.surface, borderRadius: 5, overflow: 'hidden' },
  barFill: { height: 10, backgroundColor: C.hot, borderRadius: 5 },
  barValue: { fontFamily: NUM, fontSize: 10, color: C.dim, width: 30, textAlign: 'right' },
});
