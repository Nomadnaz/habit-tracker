// ─────────────────────────────────────────────────────────────────────────
// STRENGTH — full-detail destination for the BODY hub's STRENGTH tile.
// Real headline-lift cards, a full trailing-28-day muscle-group breakdown,
// and the strength-trend detail chart. All data comes from lib/body-data.ts
// (which already aggregates lib/workout-data.ts's real exercises/PB log).
// ─────────────────────────────────────────────────────────────────────────

import { useState, useCallback } from 'react';
import { View, Text, ScrollView, StyleSheet, TouchableOpacity } from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';
import { useRouter, useFocusEffect } from 'expo-router';
import { MaterialCommunityIcons } from '@expo/vector-icons';
import { Spark } from '@/components/Spark';
import { loadBodyData, getMuscleGroupBreakdown, type BodyData, type MuscleGroupTally } from '@/lib/body-data';

const ORANGE = '#FF4D00';
const INK    = '#1A1714';
const MUTED  = '#8C857B';
const FAINT  = '#C7C1B8';
const BORDER = '#E5E1DA';
const CARD   = '#FCFBF9';
const BOLD   = 'PixeloidSans_700Bold';
const REG    = 'PixeloidSans_400Regular';
const NUM    = 'PixeloidSans_400Regular';

export default function StrengthScreen() {
  const router = useRouter();
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
      <View style={s.header}>
        <TouchableOpacity onPress={() => router.back()} hitSlop={10}>
          <MaterialCommunityIcons name="chevron-left" size={26} color={ORANGE} />
        </TouchableOpacity>
        <Text style={s.title}>STRENGTH</Text>
        <View style={{ width: 26 }} />
      </View>

      <ScrollView contentContainerStyle={s.content} showsVerticalScrollIndicator={false}>
        <Text style={s.sectionLabel}>HEADLINE LIFTS</Text>
        {data.headlineLifts.length === 0 && (
          <Text style={s.empty}>Log a bench press, squat, or deadlift in Workouts to see it here.</Text>
        )}
        {data.headlineLifts.map(lift => (
          <View key={lift.name} style={s.liftCard}>
            <View style={s.liftHeader}>
              <Text style={s.liftName}>{lift.name}</Text>
              <Text style={s.liftValue}>{lift.topSetKg}<Text style={s.liftUnit}>KG</Text></Text>
            </View>
            <Text style={s.liftSub}>TOP SET — max weight logged, not a calculated 1RM</Text>
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
            <Text style={[s.trendPct, { color: ORANGE }]}>
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
  container: { flex: 1, backgroundColor: '#F5F2ED' },
  header: { flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between', paddingHorizontal: 16, paddingTop: 8, paddingBottom: 12 },
  title: { fontFamily: BOLD, fontSize: 16, color: INK, letterSpacing: 1 },
  content: { paddingHorizontal: 16, paddingBottom: 40 },
  sectionLabel: { fontFamily: BOLD, fontSize: 11, color: INK, letterSpacing: 1, marginBottom: 10 },
  sectionLabelSpaced: { marginTop: 24 },
  empty: { fontFamily: REG, fontSize: 11, color: MUTED, marginBottom: 12, lineHeight: 16 },
  emptySmall: { fontFamily: REG, fontSize: 9, color: MUTED, marginVertical: 8 },

  liftCard: { backgroundColor: CARD, borderRadius: 12, borderWidth: 1, borderColor: BORDER, padding: 14, marginBottom: 10 },
  liftHeader: { flexDirection: 'row', justifyContent: 'space-between', alignItems: 'center' },
  liftName: { fontFamily: BOLD, fontSize: 13, color: INK, letterSpacing: 1 },
  liftValue: { fontFamily: NUM, fontSize: 20, color: ORANGE },
  liftUnit: { fontFamily: BOLD, fontSize: 11 },
  liftSub: { fontFamily: REG, fontSize: 8, color: MUTED, marginTop: 2, marginBottom: 8 },
  liftDelta: { fontFamily: REG, fontSize: 9, color: MUTED, marginTop: 6 },

  trendCard: { backgroundColor: CARD, borderRadius: 12, borderWidth: 1, borderColor: BORDER, padding: 14, marginBottom: 12, alignItems: 'center' },
  trendPct: { fontFamily: NUM, fontSize: 32 },
  trendSub: { fontFamily: REG, fontSize: 9, color: MUTED, marginTop: 4, marginBottom: 12, textAlign: 'center' },

  barRow: { flexDirection: 'row', alignItems: 'center', gap: 10, marginBottom: 10 },
  barLabel: { fontFamily: BOLD, fontSize: 9, color: INK, width: 90, letterSpacing: 0.5 },
  barTrack: { flex: 1, height: 10, backgroundColor: '#E8E4DD', borderRadius: 5, overflow: 'hidden' },
  barFill: { height: 10, backgroundColor: ORANGE, borderRadius: 5 },
  barValue: { fontFamily: NUM, fontSize: 10, color: MUTED, width: 30, textAlign: 'right' },
});
