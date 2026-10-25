// ─────────────────────────────────────────────────────────────────────────
// PROGRESS — Strava-style profile/stats page. Was a 17-line dead stub; now
// the destination for "activity calendar + trophy case + stats table" —
// all real data, reusing existing modules rather than inventing new ones:
//   - calendar grid: lib/body-data.ts's real trainingHistory (via the
//     shared GymHeatmap component, extracted from app/(tabs)/gym.tsx)
//   - trophy case: lib/badges.ts's real catalogue + earned-badge log
//   - stats table: lib/postWrite.ts's getCumulativeStats() (already
//     populated by every domain write's postWrite() fan-out)
// ─────────────────────────────────────────────────────────────────────────

import { useState, useCallback } from 'react';
import { View, Text, ScrollView, StyleSheet } from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';
import { MaterialCommunityIcons } from '@expo/vector-icons';
import { useFocusEffect } from 'expo-router';
import { loadBodyData, trainingDayType, type BodyData } from '@/lib/body-data';
import { GymHeatmap, GymHeatmapLegend } from '@/components/GymHeatmap';
import { BADGES, getEarnedBadgeIds } from '@/lib/badges';
import { getCumulativeStats, type CumulativeStats } from '@/lib/postWrite';

import { C, F } from '@/lib/theme';
import { ScreenHeader } from '@/components/ScreenHeader';
const MUTED  = C.dim;
const CARD   = C.surface;
const REG = F.mono;

function km(meters: number): string {
  return `${(meters / 1000).toFixed(1)} KM`;
}

function hours(secs: number): string {
  return `${Math.floor(secs / 3600)}H ${Math.floor((secs % 3600) / 60)}M`;
}

export default function ProgressScreen() {
  const [body, setBody] = useState<BodyData | null>(null);
  const [earned, setEarned] = useState<string[]>([]);
  const [stats, setStats] = useState<CumulativeStats | null>(null);

  useFocusEffect(useCallback(() => {
    loadBodyData().then(setBody);
    getEarnedBadgeIds().then(setEarned);
    getCumulativeStats().then(setStats);
  }, []));

  if (!body || !stats) {
    return <SafeAreaView style={s.container} edges={['top']} />;
  }

  const earnedCount = BADGES.filter(b => earned.includes(b.id)).length;
  // Nothing ever adds to cumulative_stats.total_steps; the day-by-day history
  // on the phone (Health + tracked) is the real count.
  const allSteps = Math.max(stats.total_steps, Object.values(body.stepsHistory).reduce((t, n) => t + n, 0));

  return (
    <SafeAreaView style={s.container} edges={['top']}>
      <ScreenHeader title="PROGRESS" />
      <ScrollView contentContainerStyle={s.content} showsVerticalScrollIndicator={false}>

        <Text style={s.sectionLabel}>ACTIVITY CALENDAR</Text>
        <View style={s.card}>
          <GymHeatmap weeks={6} getKind={day => trainingDayType(body, day)} />
          <GymHeatmapLegend items={[
            { kind: 'trained', label: 'TRAINED' },
            { kind: 'rest', label: 'REST' },
            { kind: 'cheat', label: 'CHEAT' },
            { kind: 'missed', label: 'MISSED' },
          ]} />
        </View>

        <Text style={[s.sectionLabel, s.sectionLabelSpaced]}>{`TROPHY CASE  ${earnedCount} OF ${BADGES.length}`}</Text>
        <View style={s.badgeGrid}>
          {BADGES.map(b => {
            const unlocked = earned.includes(b.id);
            const showHidden = !!b.hidden && !unlocked;
            return (
              <View key={b.id} style={[s.badge, !unlocked && s.badgeLocked]}>
                <MaterialCommunityIcons name={unlocked ? 'medal' : 'lock-outline'} size={18} color={unlocked ? C.hot : C.faint} />
                <Text style={[s.badgeName, !unlocked && s.badgeNameLocked]}>
                  {showHidden ? '???' : b.name.toUpperCase()}
                </Text>
                <Text style={s.badgeDesc}>{showHidden ? '???' : b.description}</Text>
              </View>
            );
          })}
        </View>

        <Text style={[s.sectionLabel, s.sectionLabelSpaced]}>ALL-TIME STATS</Text>
        <View style={s.card}>
          <StatRow label="STEPS" value={allSteps.toLocaleString('en-US')} />
          <StatRow label="WALKED" value={km(stats.total_distance_walked_m)} />
          <StatRow label="RUN" value={km(stats.total_distance_run_m)} />
          <StatRow label="GYM SESSIONS" value={String(stats.total_gym_sessions)} />
          <StatRow label="FOCUS TIME" value={hours(stats.total_focus_secs)} />
          <StatRow label="HABITS DONE" value={String(stats.total_habits_completed)} />
          <StatRow label="BOOKS FINISHED" value={String(stats.total_books_finished)} />
          <StatRow label="LONGEST STREAK" value={`${stats.longest_streak_ever} DAYS`} last />
        </View>
      </ScrollView>
    </SafeAreaView>
  );
}

function StatRow({ label, value, last }: { label: string; value: string; last?: boolean }) {
  return (
    <View style={[s.statRow, !last && s.statRowBorder]}>
      <Text style={s.statLabel}>{label}</Text>
      <Text style={s.statValue}>{value}</Text>
    </View>
  );
}

const s = StyleSheet.create({
  container: { flex: 1, backgroundColor: C.bg },
  content: { paddingHorizontal: 16, paddingTop: 12, paddingBottom: 40 },
  sectionLabel: { fontFamily: F.dot, fontSize: 11, color: C.dim, letterSpacing: 3, marginBottom: 8 },
  sectionLabelSpaced: { marginTop: 24 },
  card: { backgroundColor: CARD, borderRadius: 16, borderCurve: 'continuous', borderWidth: 1, borderColor: C.line, padding: 14 },

  badgeGrid: { flexDirection: 'row', flexWrap: 'wrap', justifyContent: 'space-between', rowGap: 8 },
  badge: { width: '32%', backgroundColor: C.surface, borderRadius: 14, borderCurve: 'continuous', borderWidth: 1, borderColor: C.line, padding: 10, alignItems: 'center', gap: 4, minHeight: 104 },
  badgeLocked: { opacity: 0.85 },
  badgeName: { fontFamily: F.dot, fontSize: 10, color: C.ink, letterSpacing: 1, textAlign: 'center' },
  badgeNameLocked: { color: MUTED },
  badgeDesc: { fontFamily: REG, fontSize: 10, color: C.dim, textAlign: 'center', lineHeight: 13 },

  statRow: { flexDirection: 'row', justifyContent: 'space-between', paddingVertical: 10 },
  statRowBorder: { borderBottomWidth: 1, borderBottomColor: C.line },
  statLabel: { fontFamily: F.dot, fontSize: 10, color: C.dim, letterSpacing: 1.5 },
  statValue: { fontFamily: F.mono, fontSize: 14, color: C.ink },
});
