// ─────────────────────────────────────────────────────────────────────────
// ACTIVITY TAB — hike/run/walk tracking (task 032). Deliberately basic per
// system-model: track, draw, summarise — nothing fancier yet.
//
// DEVICE-GATED, NOT VERIFIED THIS SESSION: background location + a 30-min
// battery-drain test need a real device. What's built here is FOREGROUND
// tracking only (Location.watchPositionAsync while this screen is open) —
// closing the app mid-activity will stop recording. Upgrading to background
// tracking (Location.startLocationUpdatesAsync + a background task) is a
// deliberate follow-up once this can be tested on a device.
//
// The route is drawn as an abstract pace-coloured polyline (SVG, normalized
// to the waypoints' own bounding box) rather than on a real map — no map
// library (e.g. react-native-maps) is installed, and adding one is a native
// module change that needs a device/EAS rebuild to verify. Swapping this for
// a real map later doesn't touch lib/activity-data.ts.
// ─────────────────────────────────────────────────────────────────────────

import { useCallback, useEffect, useRef, useState } from 'react';
import { View, Text, ScrollView, StyleSheet, TouchableOpacity, Alert } from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';
import { useFocusEffect } from 'expo-router';
import { MaterialCommunityIcons } from '@expo/vector-icons';
import * as Haptics from 'expo-haptics';
import * as Location from 'expo-location';
import Svg, { Polyline } from 'react-native-svg';
import ChatScreen from '@/components/ChatScreen';

import {
  saveActivity, getRecentActivities, computeDistanceM, computePacePerKm, segmentPaces,
  formatDuration, formatPace, formatDistance,
  type Activity, type ActivityType, type Waypoint,
} from '@/lib/activity-data';

const ORANGE = '#FF4D00';
const INK    = '#1A1714';
const MUTED  = '#8C857B';
const BORDER = '#E5E1DA';
const CARD   = '#FCFBF9';
const BG     = '#F4F2EE';
const GREEN  = '#3B7A57';
const RED    = '#C0432B';
const BOLD   = 'PixeloidSans_700Bold';
const REG    = 'PixeloidSans_400Regular';

const TYPES: { key: ActivityType; label: string; icon: string }[] = [
  { key: 'hike', label: 'HIKE', icon: 'hiking' },
  { key: 'run', label: 'RUN', icon: 'run' },
  { key: 'walk', label: 'WALK', icon: 'walk' },
];

function RouteLine({ waypoints }: { waypoints: Waypoint[] }) {
  if (waypoints.length < 2) return <View style={styles.routeBox} />;
  const lats = waypoints.map(w => w.lat), lngs = waypoints.map(w => w.lng);
  const minLat = Math.min(...lats), maxLat = Math.max(...lats);
  const minLng = Math.min(...lngs), maxLng = Math.max(...lngs);
  const w = 280, h = 160, pad = 10;
  const scaleX = (maxLng - minLng) || 1;
  const scaleY = (maxLat - minLat) || 1;
  const toXY = (p: Waypoint) => ({
    x: pad + ((p.lng - minLng) / scaleX) * (w - pad * 2),
    y: h - pad - ((p.lat - minLat) / scaleY) * (h - pad * 2), // flip Y (lat increases upward)
  });
  const paces = segmentPaces(waypoints);
  const avgPace = paces.reduce((a, b) => a + b, 0) / (paces.length || 1);

  return (
    <Svg width={w} height={h} style={styles.routeBox}>
      {waypoints.slice(1).map((p, i) => {
        const a = toXY(waypoints[i]);
        const b = toXY(p);
        const pace = paces[i] ?? avgPace;
        const color = pace <= avgPace * 0.95 ? GREEN : pace >= avgPace * 1.15 ? RED : ORANGE;
        return (
          <Polyline key={i} points={`${a.x},${a.y} ${b.x},${b.y}`} stroke={color} strokeWidth={3} fill="none" />
        );
      })}
    </Svg>
  );
}

export default function ActivityScreen() {
  const [type, setType] = useState<ActivityType>('run');
  const [recording, setRecording] = useState(false);
  const [chatOpen, setChatOpen] = useState(false);
  const [waypoints, setWaypoints] = useState<Waypoint[]>([]);
  const [startedAt, setStartedAt] = useState<string | null>(null);
  const [elapsedSecs, setElapsedSecs] = useState(0);
  const [recent, setRecent] = useState<Activity[]>([]);
  const subRef = useRef<Location.LocationSubscription | null>(null);
  const tickRef = useRef<ReturnType<typeof setInterval> | null>(null);

  const refresh = useCallback(async () => setRecent(await getRecentActivities()), []);
  useFocusEffect(useCallback(() => { refresh(); }, [refresh]));

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
  }

  async function stop() {
    subRef.current?.remove();
    subRef.current = null;
    if (tickRef.current) clearInterval(tickRef.current);
    setRecording(false);

    if (!startedAt || waypoints.length < 2) {
      Alert.alert('Not enough data', 'That activity was too short to save.');
      setStartedAt(null);
      return;
    }
    Haptics.notificationAsync(Haptics.NotificationFeedbackType.Success);
    await saveActivity({ type, startTime: startedAt, endTime: new Date().toISOString(), waypoints });
    setStartedAt(null);
    setWaypoints([]);
    refresh();
  }

  const liveDistance = computeDistanceM(waypoints);
  const livePace = computePacePerKm(liveDistance, elapsedSecs);

  return (
    <SafeAreaView style={styles.safe} edges={['top']}>
      <View style={styles.header}>
        <Text style={styles.title}>ACTIVITY</Text>
        <TouchableOpacity onPress={() => setChatOpen(true)} hitSlop={{ top: 10, bottom: 10, left: 10, right: 10 }}>
          <MaterialCommunityIcons name="chat-processing-outline" size={22} color={ORANGE} />
        </TouchableOpacity>
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

        <Text style={styles.sectionLabel}>RECENT</Text>
        {recent.length === 0 && <Text style={styles.empty}>No activities logged yet.</Text>}
        {recent.map(a => (
          <View key={a.id} style={styles.recentCard}>
            <MaterialCommunityIcons
              name={TYPES.find(t => t.key === a.type)?.icon as any ?? 'walk'}
              size={20}
              color={ORANGE}
            />
            <View style={{ flex: 1 }}>
              <Text style={styles.recentTitle}>{a.type.toUpperCase()} · {formatDistance(a.distanceM)}</Text>
              <Text style={styles.recentSub}>{formatDuration(a.durationSecs)} · {formatPace(a.avgPacePerKm)}</Text>
            </View>
          </View>
        ))}
      </ScrollView>

      <ChatScreen
        visible={chatOpen}
        onClose={() => setChatOpen(false)}
        companionType="activity"
        onTasksUpdated={refresh}
      />
    </SafeAreaView>
  );
}

const styles = StyleSheet.create({
  safe: { flex: 1, backgroundColor: BG },
  header: { flexDirection: 'row', justifyContent: 'space-between', alignItems: 'center', paddingHorizontal: 20, paddingTop: 8, paddingBottom: 12 },
  title: { fontFamily: BOLD, fontSize: 16, color: INK },
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
  routeBox: { width: 280, height: 160, backgroundColor: BG, borderRadius: 8 },
  recordBtn: {
    width: '100%', backgroundColor: ORANGE, borderRadius: 10, paddingVertical: 14, alignItems: 'center',
  },
  recordBtnActive: { backgroundColor: RED },
  recordBtnText: { fontFamily: BOLD, fontSize: 13, color: '#FFFFFF' },
  sectionLabel: { fontFamily: BOLD, fontSize: 11, color: MUTED, marginTop: 4 },
  empty: { fontFamily: REG, fontSize: 12, color: MUTED },
  recentCard: {
    flexDirection: 'row', alignItems: 'center', gap: 12,
    backgroundColor: CARD, borderRadius: 10, borderWidth: 1, borderColor: BORDER, padding: 12,
  },
  recentTitle: { fontFamily: BOLD, fontSize: 12, color: INK },
  recentSub: { fontFamily: REG, fontSize: 10, color: MUTED, marginTop: 2 },
});
