// ─────────────────────────────────────────────────────────────────────────
// ACTIVITY HISTORY — browsable list beyond the tab's truncated recent view.
// Same flat-file idiom as app/workouts.tsx. Tapping a row pushes to the
// real activity-summary page for that activity.
// ─────────────────────────────────────────────────────────────────────────

import { useState, useCallback } from 'react';
import { View, Text, ScrollView, StyleSheet, TouchableOpacity } from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';
import { useRouter, useFocusEffect } from 'expo-router';
import { MaterialCommunityIcons } from '@expo/vector-icons';
import { getRecentActivities, formatDuration, formatPace, formatDistance, type Activity, type ActivityType } from '@/lib/activity-data';

const ORANGE = '#FF4D00';
const INK    = '#1A1714';
const MUTED  = '#8C857B';
const BORDER = '#E5E1DA';
const CARD   = '#FCFBF9';
const BG     = '#F4F2EE';
const BOLD   = 'PixeloidSans_700Bold';
const REG    = 'PixeloidSans_400Regular';

const ICONS: Record<ActivityType, string> = { hike: 'hiking', run: 'run', walk: 'walk' };

function formatActivityDate(iso: string): string {
  const d = new Date(iso);
  const MONTHS = ['JAN', 'FEB', 'MAR', 'APR', 'MAY', 'JUN', 'JUL', 'AUG', 'SEP', 'OCT', 'NOV', 'DEC'];
  return `${MONTHS[d.getMonth()]} ${d.getDate()}, ${d.getFullYear()}`;
}

export default function ActivityHistoryScreen() {
  const router = useRouter();
  const [activities, setActivities] = useState<Activity[]>([]);

  useFocusEffect(useCallback(() => {
    getRecentActivities(500).then(setActivities); // no practical limit for a history browse
  }, []));

  return (
    <SafeAreaView style={s.container} edges={['top']}>
      <View style={s.header}>
        <TouchableOpacity onPress={() => router.back()} hitSlop={10}>
          <MaterialCommunityIcons name="chevron-left" size={26} color={ORANGE} />
        </TouchableOpacity>
        <Text style={s.title}>ACTIVITY HISTORY</Text>
        <View style={{ width: 26 }} />
      </View>

      <ScrollView contentContainerStyle={s.content}>
        {activities.length === 0 && <Text style={s.empty}>No activities logged yet.</Text>}
        {activities.map(a => (
          <TouchableOpacity
            key={a.id}
            style={s.row}
            activeOpacity={0.85}
            onPress={() => router.push({ pathname: '/activity-summary', params: { id: a.id } })}
          >
            <MaterialCommunityIcons name={ICONS[a.type] as any} size={22} color={ORANGE} />
            <View style={{ flex: 1 }}>
              <Text style={s.rowTitle}>{a.type.toUpperCase()} · {formatDistance(a.distanceM)}</Text>
              <Text style={s.rowSub}>{formatActivityDate(a.startTime)} · {formatDuration(a.durationSecs)} · {formatPace(a.avgPacePerKm)}</Text>
            </View>
            <MaterialCommunityIcons name="chevron-right" size={18} color={MUTED} />
          </TouchableOpacity>
        ))}
      </ScrollView>
    </SafeAreaView>
  );
}

const s = StyleSheet.create({
  container: { flex: 1, backgroundColor: BG },
  header: { flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between', paddingHorizontal: 16, paddingVertical: 12 },
  title: { fontFamily: BOLD, fontSize: 16, color: INK, letterSpacing: 1 },
  content: { paddingHorizontal: 16, paddingBottom: 32, gap: 8 },
  empty: { fontFamily: REG, fontSize: 13, color: MUTED, paddingVertical: 12 },
  row: {
    flexDirection: 'row', alignItems: 'center', gap: 12,
    backgroundColor: CARD, borderRadius: 10, borderWidth: 1, borderColor: BORDER, padding: 12,
  },
  rowTitle: { fontFamily: BOLD, fontSize: 12, color: INK },
  rowSub: { fontFamily: REG, fontSize: 10, color: MUTED, marginTop: 2 },
});
