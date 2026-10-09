// ─────────────────────────────────────────────────────────────────────────
// ACTIVITY SUMMARY — task 033, finally built. Strava-style post-activity
// page: stat panel, the route visual as the dominant element, a real
// per-km splits table, and a real elevation profile. Used both right after
// finishing a recording (app/(tabs)/activity.tsx routes here on stop()) and
// for any past activity opened from app/activity-history.tsx.
// ─────────────────────────────────────────────────────────────────────────

import { useState, useEffect } from 'react';
import { View, Text, ScrollView, StyleSheet, TouchableOpacity } from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';
import { useRouter, useLocalSearchParams } from 'expo-router';
import { MaterialCommunityIcons } from '@expo/vector-icons';
import { RouteLine } from '@/components/SummaryCard';
import { ElevationGraph } from '@/components/ElevationGraph';
import {
  getActivityById, computeSplits, formatDuration, formatPace, formatDistance,
  type Activity,
} from '@/lib/activity-data';

import { C, F } from '@/lib/theme';
const BOLD = F.mono;
const REG = F.mono;

function formatActivityDate(iso: string): string {
  const d = new Date(iso);
  const MONTHS = ['JAN', 'FEB', 'MAR', 'APR', 'MAY', 'JUN', 'JUL', 'AUG', 'SEP', 'OCT', 'NOV', 'DEC'];
  let h = d.getHours();
  const ampm = h >= 12 ? 'PM' : 'AM';
  h = h % 12 || 12;
  const min = String(d.getMinutes()).padStart(2, '0');
  return `${MONTHS[d.getMonth()]} ${d.getDate()}, ${d.getFullYear()} AT ${h}:${min} ${ampm}`;
}

export default function ActivitySummaryScreen() {
  const router = useRouter();
  const { id } = useLocalSearchParams<{ id?: string | string[] }>();
  const activityId = Array.isArray(id) ? (id[0] ?? '') : (id ?? '');
  const [activity, setActivity] = useState<Activity | null>(null);
  const [notFound, setNotFound] = useState(false);

  useEffect(() => {
    if (!activityId) { setNotFound(true); return; }
    getActivityById(activityId).then(a => (a ? setActivity(a) : setNotFound(true)));
  }, [activityId]);

  if (notFound) {
    return (
      <SafeAreaView style={s.container} edges={['top']}>
        <View style={s.header}>
          <TouchableOpacity onPress={() => router.back()} hitSlop={10}>
            <MaterialCommunityIcons name="chevron-left" size={26} color={C.hot} />
          </TouchableOpacity>
          <Text style={s.title}>ACTIVITY</Text>
          <View style={{ width: 26 }} />
        </View>
        <Text style={s.empty}>Activity not found.</Text>
      </SafeAreaView>
    );
  }

  if (!activity) return <SafeAreaView style={s.container} edges={['top']} />;

  const splits = computeSplits(activity.waypoints);

  return (
    <SafeAreaView style={s.container} edges={['top']}>
      <View style={s.header}>
        <TouchableOpacity onPress={() => router.back()} hitSlop={10}>
          <MaterialCommunityIcons name="chevron-left" size={26} color={C.hot} />
        </TouchableOpacity>
        <Text style={s.title}>{activity.type.toUpperCase()}</Text>
        <View style={{ width: 26 }} />
      </View>

      <ScrollView contentContainerStyle={s.content}>
        <Text style={s.date}>{formatActivityDate(activity.startTime)}</Text>

        {/* Persistent stat panel */}
        <View style={s.statsCard}>
          <View style={s.statsRow}>
            <View style={s.statCol}>
              <Text style={s.statValue}>{formatDistance(activity.distanceM)}</Text>
              <Text style={s.statLabel}>DISTANCE</Text>
            </View>
            <View style={s.statCol}>
              <Text style={s.statValue}>{formatDuration(activity.durationSecs)}</Text>
              <Text style={s.statLabel}>DURATION</Text>
            </View>
            <View style={s.statCol}>
              <Text style={s.statValue}>{formatPace(activity.avgPacePerKm)}</Text>
              <Text style={s.statLabel}>AVG PACE</Text>
            </View>
            <View style={s.statCol}>
              <Text style={s.statValue}>{activity.elevationGainM}M</Text>
              <Text style={s.statLabel}>ELEVATION</Text>
            </View>
          </View>
        </View>

        {/* Route visual — the dominant element */}
        <RouteLine waypoints={activity.waypoints} width={320} height={200} />

        {/* Elevation profile */}
        <Text style={s.sectionLabel}>ELEVATION PROFILE</Text>
        <ElevationGraph waypoints={activity.waypoints} width={320} height={100} />

        {/* Splits */}
        <Text style={s.sectionLabel}>SPLITS</Text>
        {splits.length === 0 && <Text style={s.empty}>Not enough distance for a split.</Text>}
        {splits.map(split => (
          <View key={split.km} style={s.splitRow}>
            <Text style={s.splitKm}>KM {split.km}</Text>
            <Text style={s.splitPace}>{formatPace(split.paceSecPerKm)}</Text>
          </View>
        ))}
      </ScrollView>
    </SafeAreaView>
  );
}

const s = StyleSheet.create({
  container: { flex: 1, backgroundColor: C.bg },
  header: { flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between', paddingHorizontal: 16, paddingVertical: 12 },
  title: { fontFamily: F.dot, fontSize: 18, color: C.ink, letterSpacing: 1 },
  content: { paddingHorizontal: 16, paddingBottom: 40, alignItems: 'center' },
  date: { fontFamily: REG, fontSize: 11, color: C.dim, letterSpacing: 0.5, marginBottom: 12, alignSelf: 'flex-start' },

  statsCard: { width: '100%', backgroundColor: C.surface, borderRadius: 12, borderWidth: 1, borderColor: C.line, padding: 16, marginBottom: 14 },
  statsRow: { flexDirection: 'row', justifyContent: 'space-between' },
  statCol: { alignItems: 'center', flex: 1 },
  statValue: { fontFamily: BOLD, fontSize: 16, color: C.ink },
  statLabel: { fontFamily: REG, fontSize: 9, color: C.dim, marginTop: 4, letterSpacing: 0.5 },

  sectionLabel: { fontFamily: F.dot, fontSize: 12, color: C.dim, letterSpacing: 1, marginTop: 18, marginBottom: 10, alignSelf: 'flex-start' },
  empty: { fontFamily: REG, fontSize: 12, color: C.dim, alignSelf: 'flex-start' },

  splitRow: {
    flexDirection: 'row', justifyContent: 'space-between', width: '100%',
    backgroundColor: C.surface, borderRadius: 8, borderWidth: 1, borderColor: C.line,
    paddingVertical: 10, paddingHorizontal: 14, marginBottom: 6,
  },
  splitKm: { fontFamily: BOLD, fontSize: 12, color: C.ink },
  splitPace: { fontFamily: REG, fontSize: 12, color: C.dim },
});
