// ─────────────────────────────────────────────────────────────────────────
// ACTIVITY TAB — hike/run/walk RECORDING only (task 032 + the Strava-style
// split: this tab records, app/activity-summary.tsx shows the finished
// result, app/activity-history.tsx browses past activities). On stop(), this
// screen routes straight to the summary instead of refreshing an inline list.
//
// Background location IS now implemented (lib/locationTask.ts) but is
// IMPLEMENTED-BUT-UNVERIFIED THIS SESSION — no physical device, no EAS dev
// build, no real outdoor walk, no battery-drain test. If background
// permission is denied (or the OS task fails to start), this screen
// silently falls back to the previously-verified, working FOREGROUND-only
// path (Location.watchPositionAsync while this screen is open) — that
// fallback is a real, expected case, not an error.
// ─────────────────────────────────────────────────────────────────────────

import { useCallback, useEffect, useRef, useState } from 'react';
import { View, Text, ScrollView, StyleSheet, TouchableOpacity, Alert } from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';
import { useRouter } from 'expo-router';
import { MaterialCommunityIcons } from '@expo/vector-icons';
import * as Haptics from 'expo-haptics';
import * as Location from 'expo-location';
import ChatScreen from '@/components/ChatScreen';
import { RouteLine } from '@/components/SummaryCard';
import { startBackgroundLocation, stopBackgroundLocation, drainBackgroundWaypoints, mergeWaypoints } from '@/lib/locationTask';

import {
  saveActivity, computeDistanceM, computePacePerKm,
  formatDuration, formatPace, formatDistance,
  type ActivityType, type Waypoint,
} from '@/lib/activity-data';

const ORANGE = '#FF4D00';
const INK    = '#1A1714';
const MUTED  = '#8C857B';
const BORDER = '#E5E1DA';
const CARD   = '#FCFBF9';
const BG     = '#F4F2EE';
const RED    = '#C0432B';
const BOLD   = 'PixeloidSans_700Bold';
const REG    = 'PixeloidSans_400Regular';

const TYPES: { key: ActivityType; label: string; icon: string }[] = [
  { key: 'hike', label: 'HIKE', icon: 'hiking' },
  { key: 'run', label: 'RUN', icon: 'run' },
  { key: 'walk', label: 'WALK', icon: 'walk' },
];

export default function ActivityScreen() {
  const router = useRouter();
  const [type, setType] = useState<ActivityType>('run');
  const [recording, setRecording] = useState(false);
  const [chatOpen, setChatOpen] = useState(false);
  const [waypoints, setWaypoints] = useState<Waypoint[]>([]);
  const [startedAt, setStartedAt] = useState<string | null>(null);
  const [elapsedSecs, setElapsedSecs] = useState(0);
  const subRef = useRef<Location.LocationSubscription | null>(null);
  const tickRef = useRef<ReturnType<typeof setInterval> | null>(null);

  useEffect(() => () => {
    subRef.current?.remove();
    if (tickRef.current) clearInterval(tickRef.current);
  }, []);

  async function start() {
    const perm = await Location.requestForegroundPermissionsAsync();
    if (perm.status !== 'granted') {
      Alert.alert('Location access needed', 'Enable location access in Settings to track an activity.');
      return;
    }
    Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Medium);
    setWaypoints([]);
    setElapsedSecs(0);
    const now = new Date().toISOString();
    setStartedAt(now);
    setRecording(true);

    subRef.current = await Location.watchPositionAsync(
      { accuracy: Location.Accuracy.Balanced, timeInterval: 5000, distanceInterval: 10 },
      loc => {
        setWaypoints(prev => [...prev, {
          lat: loc.coords.latitude, lng: loc.coords.longitude,
          altitude: loc.coords.altitude, timestamp: loc.timestamp,
        }]);
      },
    );
    tickRef.current = setInterval(() => setElapsedSecs(s => s + 1), 1000);

    // Best-effort background tracking alongside the foreground subscription
    // above — if permission is denied or the OS task fails to start, the
    // foreground path (already running) is the complete, working fallback.
    void startBackgroundLocation();
  }

  async function stop() {
    subRef.current?.remove();
    subRef.current = null;
    if (tickRef.current) clearInterval(tickRef.current);
    setRecording(false);
    await stopBackgroundLocation();
    const bgWaypoints = await drainBackgroundWaypoints();
    const finalWaypoints = bgWaypoints.length > 0 ? mergeWaypoints(waypoints, bgWaypoints) : waypoints;

    if (!startedAt || finalWaypoints.length < 2) {
      Alert.alert('Not enough data', 'That activity was too short to save.');
      setStartedAt(null);
      return;
    }
    Haptics.notificationAsync(Haptics.NotificationFeedbackType.Success);
    const saved = await saveActivity({ type, startTime: startedAt, endTime: new Date().toISOString(), waypoints: finalWaypoints });
    setStartedAt(null);
    setWaypoints([]);
    router.push({ pathname: '/activity-summary', params: { id: saved.id } });
  }

  const liveDistance = computeDistanceM(waypoints);
  const livePace = computePacePerKm(liveDistance, elapsedSecs);

  return (
    <SafeAreaView style={styles.safe} edges={['top']}>
      <View style={styles.header}>
        <Text style={styles.title}>ACTIVITY</Text>
        <View style={styles.headerIcons}>
          <TouchableOpacity onPress={() => router.push('/activity-history')} hitSlop={{ top: 10, bottom: 10, left: 10, right: 10 }}>
            <MaterialCommunityIcons name="history" size={20} color={ORANGE} />
          </TouchableOpacity>
          <TouchableOpacity onPress={() => setChatOpen(true)} hitSlop={{ top: 10, bottom: 10, left: 10, right: 10 }}>
            <MaterialCommunityIcons name="chat-processing-outline" size={22} color={ORANGE} />
          </TouchableOpacity>
        </View>
      </View>

      <ScrollView contentContainerStyle={styles.content}>
        <View style={styles.typeRow}>
          {TYPES.map(t => (
            <TouchableOpacity
              key={t.key}
              style={[styles.typeChip, type === t.key && styles.typeChipActive]}
              onPress={() => !recording && setType(t.key)}
              disabled={recording}
            >
              <MaterialCommunityIcons name={t.icon as any} size={18} color={type === t.key ? '#FFFFFF' : ORANGE} />
              <Text style={[styles.typeChipText, type === t.key && styles.typeChipTextActive]}>{t.label}</Text>
            </TouchableOpacity>
          ))}
        </View>

        <View style={styles.card}>
          <View style={styles.statsRow}>
            <View style={styles.statCol}>
              <Text style={styles.statValue}>{formatDuration(elapsedSecs)}</Text>
              <Text style={styles.statLabel}>DURATION</Text>
            </View>
            <View style={styles.statCol}>
              <Text style={styles.statValue}>{formatDistance(liveDistance)}</Text>
              <Text style={styles.statLabel}>DISTANCE</Text>
            </View>
            <View style={styles.statCol}>
              <Text style={styles.statValue}>{formatPace(livePace)}</Text>
              <Text style={styles.statLabel}>PACE</Text>
            </View>
          </View>

          <RouteLine waypoints={waypoints} />

          <TouchableOpacity
            style={[styles.recordBtn, recording && styles.recordBtnActive]}
            onPress={recording ? stop : start}
          >
            <Text style={styles.recordBtnText}>{recording ? 'STOP' : 'START'}</Text>
          </TouchableOpacity>
        </View>
      </ScrollView>

      <ChatScreen
        visible={chatOpen}
        onClose={() => setChatOpen(false)}
        companionType="activity"
        onTasksUpdated={() => {}}
      />
    </SafeAreaView>
  );
}

const styles = StyleSheet.create({
  safe: { flex: 1, backgroundColor: BG },
  header: { flexDirection: 'row', justifyContent: 'space-between', alignItems: 'center', paddingHorizontal: 20, paddingTop: 8, paddingBottom: 12 },
  title: { fontFamily: BOLD, fontSize: 16, color: INK },
  headerIcons: { flexDirection: 'row', gap: 16 },
  content: { paddingHorizontal: 16, paddingBottom: 32, gap: 14 },
  typeRow: { flexDirection: 'row', gap: 8 },
  typeChip: {
    flex: 1, flexDirection: 'row', gap: 6, alignItems: 'center', justifyContent: 'center',
    paddingVertical: 10, borderRadius: 10, borderWidth: 1, borderColor: BORDER,
  },
  typeChipActive: { backgroundColor: ORANGE, borderColor: ORANGE },
  typeChipText: { fontFamily: BOLD, fontSize: 11, color: INK },
  typeChipTextActive: { color: '#FFFFFF' },
  card: {
    backgroundColor: CARD, borderRadius: 12, borderWidth: 1, borderColor: BORDER,
    padding: 16, gap: 14, alignItems: 'center',
  },
  statsRow: { flexDirection: 'row', width: '100%', justifyContent: 'space-around' },
  statCol: { alignItems: 'center' },
  statValue: { fontFamily: BOLD, fontSize: 18, color: INK },
  statLabel: { fontFamily: REG, fontSize: 9, color: MUTED, marginTop: 2 },
  recordBtn: {
    width: '100%', backgroundColor: ORANGE, borderRadius: 10, paddingVertical: 14, alignItems: 'center',
  },
  recordBtnActive: { backgroundColor: RED },
  recordBtnText: { fontFamily: BOLD, fontSize: 13, color: '#FFFFFF' },
});
