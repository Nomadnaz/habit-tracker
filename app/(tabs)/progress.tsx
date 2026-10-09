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
import { useFocusEffect } from 'expo-router';
import { loadBodyData, trainingDayType, type BodyData } from '@/lib/body-data';
import { GymHeatmap, GymHeatmapLegend } from '@/components/GymHeatmap';
import { BADGES, getEarnedBadgeIds } from '@/lib/badges';
import { getCumulativeStats, type CumulativeStats } from '@/lib/postWrite';

import { C, F } from '@/lib/theme';
const MUTED  = C.dim;
const CARD   = C.surface;
const BOLD = F.mono;
const REG = F.mono;
const NUM    = F.mono;

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

  return (
    <SafeAreaView style={s.container} edges={['top']}>
      <ScrollView contentContainerStyle={s.content} showsVerticalScrollIndicator={false}>
        <Text style={s.title}>PROGRESS</Text>

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

        <Text style={[s.sectionLabel, s.sectionLabelSpaced]}>TROPHY CASE ({earnedCount}/{BADGES.length})</Text>
        <View style={s.badgeGrid}>
          {BADGES.map(b => {
            const unlocked = earned.includes(b.id);
            const showHidden = !!b.hidden && !unlocked;
            return (
              <View key={b.id} style={[s.badge, !unlocked && s.badgeLocked]}>
                <Text style={[s.badgeName, !unlocked && s.badgeNameLocked]}>
                  {showHidden ? '???' : b.name}
                </Text>
                <Text style={s.badgeDesc}>{showHidden ? '???' : b.description}</Text>
              </View>
            );
          })}
        </View>

        <Text style={[s.sectionLabel, s.sectionLabelSpaced]}>ALL-TIME STATS</Text>
        <View style={s.card}>
          <StatRow label="Total steps" value={stats.total_steps.toLocaleString()} />
          <StatRow label="Distance walked" value={km(stats.total_distance_walked_m)} />
          <StatRow label="Distance run" value={km(stats.total_distance_run_m)} />
          <StatRow label="Gym sessions" value={String(stats.total_gym_sessions)} />
          <StatRow label="Focus time" value={hours(stats.total_focus_secs)} />
          <StatRow label="Habits completed" value={String(stats.total_habits_completed)} />
          <StatRow label="Books finished" value={String(stats.total_books_finished)} />
          <StatRow label="Longest streak ever" value={`${stats.longest_streak_ever} days`} last />
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
  container: { flex: 1, backgroundColor: C.surface },
  content: { paddingHorizontal: 16, paddingTop: 12, paddingBottom: 40 },
  title: { fontFamily: F.dot, fontSize: 24, color: C.ink, letterSpacing: 1, marginBottom: 20 },
  sectionLabel: { fontFamily: F.dot, fontSize: 12, color: C.ink, letterSpacing: 1, marginBottom: 10 },
  sectionLabelSpaced: { marginTop: 24 },
  card: { backgroundColor: CARD, borderRadius: 12, borderWidth: 1, borderColor: C.line, padding: 14 },

  badgeGrid: { flexDirection: 'row', flexWrap: 'wrap', gap: 10 },
  badge: { width: '31%', backgroundColor: C.surface, borderRadius: 10, borderWidth: 1, borderColor: C.line, padding: 10, alignItems: 'center' },
  badgeLocked: { opacity: 0.6 },
  badgeName: { fontFamily: BOLD, fontSize: 11, color: C.ink, textAlign: 'center' },
  badgeNameLocked: { color: MUTED },
  badgeDesc: { fontFamily: REG, fontSize: 9, color: C.dim, textAlign: 'center', marginTop: 4 },

  statRow: { flexDirection: 'row', justifyContent: 'space-between', paddingVertical: 10 },
  statRowBorder: { borderBottomWidth: 1, borderBottomColor: C.line },
  statLabel: { fontFamily: REG, fontSize: 12, color: C.dim },
  statValue: { fontFamily: NUM, fontSize: 13, color: C.hot },
});
