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

import { C, F } from '@/lib/theme';
import { ScreenHeader } from '@/components/ScreenHeader';
import { Bone, BoneText, Loading, useLate } from '@/components/Skeleton';
const BOLD = F.mono;
const REG = F.mono;

const ICONS: Record<ActivityType, string> = { hike: 'hiking', run: 'run', walk: 'walk' };

function formatActivityDate(iso: string): string {
  const d = new Date(iso);
  const MONTHS = ['JAN', 'FEB', 'MAR', 'APR', 'MAY', 'JUN', 'JUL', 'AUG', 'SEP', 'OCT', 'NOV', 'DEC'];
  return `${MONTHS[d.getMonth()]} ${d.getDate()}, ${d.getFullYear()}`;
}

export default function ActivityHistoryScreen() {
  const router = useRouter();
  const [activities, setActivities] = useState<Activity[] | null>(null); // null until first read
  // Hundreds of saved routes can take a moment: bones after 300 ms, never a false "no activities".
  const late = useLate(activities === null);

  useFocusEffect(useCallback(() => {
    getRecentActivities(500).then(setActivities); // no practical limit for a history browse
  }, []));

  return (
    <SafeAreaView style={s.container} edges={['top']}>
      <ScreenHeader title="HISTORY" />

      <ScrollView contentContainerStyle={s.content}>
        {activities === null && late && <Loading style={{ gap: 8 }}>{[0, 1, 2, 3, 4, 5].map(i => <Row key={i} />)}</Loading>}
        {activities?.length === 0 && <Text style={s.empty}>No activities logged yet.</Text>}
        {activities?.map(a => (
          <Row key={a.id} a={a} onPress={() => router.push({ pathname: '/activity-summary', params: { id: a.id } })} />
        ))}
      </ScrollView>
    </SafeAreaView>
  );
}

/** One activity, or with no `a` its skeleton: the same row with bones for its text. */
function Row({ a, onPress }: { a?: Activity; onPress?: () => void }) {
  if (!a) {
    return (
      <View style={s.row}>
        <Bone w={22} h={22} round />
        <View style={{ flex: 1 }}>
          <BoneText style={s.rowTitle} w="45%" />
          <BoneText style={s.rowSub} w="75%" />
        </View>
        <Bone w={18} h={18} />
      </View>
    );
  }
  return (
    <TouchableOpacity style={s.row} activeOpacity={0.85} onPress={onPress}>
      <MaterialCommunityIcons name={ICONS[a.type] as any} size={22} color={C.hot} />
      <View style={{ flex: 1 }}>
        <Text style={s.rowTitle}>{a.type.toUpperCase()} · {formatDistance(a.distanceM)}</Text>
        <Text style={s.rowSub}>{formatActivityDate(a.startTime)} · {formatDuration(a.durationSecs)} · {formatPace(a.avgPacePerKm)}</Text>
      </View>
      <MaterialCommunityIcons name="chevron-right" size={18} color={C.dim} />
    </TouchableOpacity>
  );
}

const s = StyleSheet.create({
  container: { flex: 1, backgroundColor: C.bg },
  content: { paddingHorizontal: 16, paddingBottom: 32, gap: 8 },
  empty: { fontFamily: REG, fontSize: 13, color: C.dim, paddingVertical: 12 },
  row: {
    flexDirection: 'row', alignItems: 'center', gap: 12,
    backgroundColor: C.surface, borderRadius: 10, borderWidth: 1, borderColor: C.line, padding: 12,
  },
  rowTitle: { fontFamily: BOLD, fontSize: 12, color: C.ink },
  rowSub: { fontFamily: REG, fontSize: 11, color: C.dim, marginTop: 2 },
});
