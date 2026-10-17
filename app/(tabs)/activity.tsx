// ─────────────────────────────────────────────────────────────────────────
// ACTIVITY TAB — hike/run/walk RECORDING only (task 032 + the Strava-style
// split: this tab records, app/activity-receipt.tsx is the landing result
// screen, app/activity-summary.tsx holds the full analytical view, and
// app/activity-history.tsx browses past activities). On stop(), this screen
// routes straight to the receipt instead of refreshing an inline list.
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
import { View, Text, StyleSheet, Pressable, Alert, Animated, Easing, type LayoutChangeEvent } from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';
import { useFocusEffect, useRouter } from 'expo-router';
import { MaterialCommunityIcons } from '@expo/vector-icons';
import * as Haptics from 'expo-haptics';
import * as Location from 'expo-location';
import Svg, { Circle, Polyline } from 'react-native-svg';
import { startBackgroundLocation, stopBackgroundLocation, drainBackgroundWaypoints, mergeWaypoints } from '@/lib/locationTask';

import {
  saveActivity, computeDistanceM, computePacePerKm, getActivitiesInRange, getRecentActivities,
  formatDuration,
  type ActivityType, type Waypoint,
} from '@/lib/activity-data';

import { C, F, numFace } from '@/lib/theme';
import { ScreenHeader, HeaderIcon } from '@/components/ScreenHeader';
import { RouteMap } from '@/components/RouteMap';

const TYPES: { key: ActivityType; label: string; icon: string }[] = [
  { key: 'run', label: 'RUN', icon: 'run' },
  { key: 'walk', label: 'WALK', icon: 'walk' },
  { key: 'hike', label: 'HIKE', icon: 'hiking' },
];
const HOLD_MS = 900;
const AnimatedCircle = Animated.createAnimatedComponent(Circle);

const km = (m: number) => (m / 1000).toFixed(2);
const pace = (secsPerKm?: number) => (secsPerKm && Number.isFinite(secsPerKm) && secsPerKm < 3600
  ? `${Math.floor(secsPerKm / 60)}:${String(Math.round(secsPerKm % 60)).padStart(2, '0')}` : '-:--');

export default function ActivityScreen() {
  const router = useRouter();
  const [type, setType] = useState<ActivityType>('run');
  const [recording, setRecording] = useState(false);
  const [waypoints, setWaypoints] = useState<Waypoint[]>([]);
  const [startedAt, setStartedAt] = useState<string | null>(null);
  const [elapsedSecs, setElapsedSecs] = useState(0);
  const [stage, setStage] = useState({ w: 0, h: 0 });
  const [last, setLast] = useState<Waypoint[] | null>(null);
  const [week, setWeek] = useState({ m: 0, n: 0 });
  const subRef = useRef<Location.LocationSubscription | null>(null);
  const tickRef = useRef<ReturnType<typeof setInterval> | null>(null);
  const hold = useRef(new Animated.Value(0)).current;
  const rec = useRef(new Animated.Value(1)).current;

  useEffect(() => () => {
    subRef.current?.remove();
    if (tickRef.current) clearInterval(tickRef.current);
  }, []);

  useFocusEffect(useCallback(() => {
    const mon = new Date(); mon.setHours(0, 0, 0, 0); mon.setDate(mon.getDate() - ((mon.getDay() + 6) % 7));
    void Promise.all([getRecentActivities(1), getActivitiesInRange(mon.toISOString(), new Date(Date.now() + 60_000).toISOString())])
      .then(([r, w]) => {
        setLast(r[0]?.waypoints?.length > 1 ? r[0].waypoints : null);
        setWeek({ m: w.reduce((a, x) => a + x.distanceM, 0), n: w.length });
      }).catch(() => {});
  }, []));

  useEffect(() => {
    if (!recording) return;
    const loop = Animated.loop(Animated.sequence([
      Animated.timing(rec, { toValue: 0.2, duration: 700, useNativeDriver: true }),
      Animated.timing(rec, { toValue: 1, duration: 700, useNativeDriver: true }),
    ]));
    loop.start();
    return () => loop.stop();
  }, [recording]);

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
    router.push({ pathname: '/activity-receipt', params: { id: saved.id } });
  }

  // Stopping is a hold, so a bump in a pocket can't end a run.
  function holdIn() {
    Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Light);
    Animated.timing(hold, { toValue: 1, duration: HOLD_MS, easing: Easing.linear, useNativeDriver: false }).start(({ finished }) => {
      if (!finished) return;
      hold.setValue(0);
      void stop();
    });
  }
  function holdOut() {
    Animated.timing(hold, { toValue: 0, duration: 160, useNativeDriver: false }).start();
  }

  const liveDistance = computeDistanceM(waypoints);
  const livePace = computePacePerKm(liveDistance, elapsedSecs);
  const shown = recording ? waypoints : last;
  const BTN = 104, R = BTN / 2 - 4, CIRC = 2 * Math.PI * R;

  return (
    <SafeAreaView style={styles.safe} edges={['top']}>
      <ScreenHeader title="RECORD"
        right={<HeaderIcon icon="history" label="History" onPress={() => router.push('/activity-history')} />}
      />

      <View style={styles.typeRow}>
        {TYPES.map(t => {
          const on = type === t.key;
          return (
            <Pressable
              key={t.key}
              style={[styles.typeChip, on && styles.typeChipActive, recording && !on && { opacity: 0.3 }]}
              onPress={() => { if (!recording) { Haptics.selectionAsync(); setType(t.key); } }}
              disabled={recording}
            >
              <MaterialCommunityIcons name={t.icon as any} size={16} color={on ? C.onHot : C.ink} />
              <Text style={[styles.typeChipText, on && styles.typeChipTextActive]}>{t.label}</Text>
            </Pressable>
          );
        })}
      </View>

      {/* ── the stage: dot grid, live route, status ── */}
      <View style={styles.stage} onLayout={(e: LayoutChangeEvent) => setStage({ w: e.nativeEvent.layout.width, h: e.nativeEvent.layout.height })}>
        {stage.w > 0 && shown && shown.length > 1
          ? <RouteMap key={recording ? 'live' : 'last'} waypoints={shown} width={stage.w} height={stage.h} live={recording} durationMs={1600} />
          : stage.w > 0 && <Route pts={null} w={stage.w} h={stage.h} live={false} />}
        <View style={styles.stageTop}>
          <View style={styles.status}>
            {recording
              ? <Animated.View style={[styles.recDot, { opacity: rec }]} />
              : <View style={[styles.recDot, { backgroundColor: C.faint }]} />}
            <Text style={styles.statusText}>{recording ? `REC · ${waypoints.length} GPS POINTS` : last ? 'LAST ROUTE' : 'READY'}</Text>
          </View>
          <Text style={styles.statusText}>{TYPES.find(t => t.key === type)?.label}</Text>
        </View>
        {!recording && (
          <View style={styles.stageFoot}>
            <Text style={styles.footLabel}>THIS WEEK</Text>
            <Text style={[styles.footValue, numFace(km(week.m), 18)]}>{km(week.m)}</Text>
            <Text style={styles.footLabel}>{`KM · ${week.n} ${week.n === 1 ? 'SESSION' : 'SESSIONS'}`}</Text>
          </View>
        )}
      </View>

      {/* ── numbers ── */}
      <View style={styles.timeBlock}>
        <Text style={styles.timer} numberOfLines={1} adjustsFontSizeToFit>{formatDuration(elapsedSecs)}</Text>
        <Text style={styles.statLabel}>TIME</Text>
      </View>
      <View style={styles.statsRow}>
        <View style={styles.statCol}>
          <Text style={[styles.statValue, numFace(km(liveDistance), 30)]}>{km(liveDistance)}</Text>
          <Text style={styles.statLabel}>KM</Text>
        </View>
        <View style={[styles.statCol, styles.statRule]}>
          <Text style={[styles.statValue, { fontFamily: F.dot, fontSize: 30 }]}>{pace(livePace)}</Text>
          <Text style={styles.statLabel}>PACE PER KM</Text>
        </View>
      </View>

      {/* ── start / hold to stop ── */}
      <View style={styles.btnWrap}>
        {recording ? (
          <Pressable onPressIn={holdIn} onPressOut={holdOut} accessibilityLabel="Hold to stop">
            <View style={[styles.btn, styles.btnStop, { width: BTN, height: BTN, borderRadius: BTN / 2 }]}>
              <Svg width={BTN} height={BTN} style={StyleSheet.absoluteFill}>
                <Circle cx={BTN / 2} cy={BTN / 2} r={R} stroke={C.lineHi} strokeWidth={3} fill="none" />
                <AnimatedCircle cx={BTN / 2} cy={BTN / 2} r={R} stroke={C.alert} strokeWidth={4} fill="none" strokeLinecap="round"
                  strokeDasharray={`${CIRC} ${CIRC}`} strokeDashoffset={hold.interpolate({ inputRange: [0, 1], outputRange: [CIRC, 0] })}
                  transform={`rotate(-90 ${BTN / 2} ${BTN / 2})`} />
              </Svg>
              <View style={styles.stopSquare} />
            </View>
          </Pressable>
        ) : (
          <Pressable onPress={start} style={({ pressed }) => [styles.btn, { width: BTN, height: BTN, borderRadius: BTN / 2 }, pressed && { transform: [{ scale: 0.95 }] }]}>
            <Text style={styles.btnText}>START</Text>
          </Pressable>
        )}
        <Text style={styles.btnHint}>{recording ? 'HOLD TO STOP' : 'TAP TO START'}</Text>
      </View>
    </SafeAreaView>
  );
}

/** The route over a dot grid, fitted to the stage; while live, a pulsing head. */
function Route({ pts, w, h, live }: { pts: Waypoint[] | null; w: number; h: number; live: boolean }) {
  const pulse = useRef(new Animated.Value(0)).current;
  useEffect(() => {
    const loop = Animated.loop(Animated.timing(pulse, { toValue: 1, duration: 1300, useNativeDriver: false }));
    loop.start();
    return () => loop.stop();
  }, []);
  const G = 14;
  const grid = [];
  for (let x = G / 2; x < w; x += G) for (let y = G / 2; y < h; y += G) grid.push(<Circle key={`${x}.${y}`} cx={x} cy={y} r={0.9} fill={C.ghost} />);

  let line = null;
  if (pts && pts.length > 1) {
    const lats = pts.map(p => p.lat), lngs = pts.map(p => p.lng);
    const [a, b, c, d] = [Math.min(...lats), Math.max(...lats), Math.min(...lngs), Math.max(...lngs)];
    const pad = 36;
    // Longitude degrees shrink with latitude; scale them so the shape isn't stretched.
    const kx = Math.cos(((a + b) / 2) * Math.PI / 180);
    const k = Math.min((w - pad * 2) / (((d - c) * kx) || 1e-9), (h - pad * 2) / ((b - a) || 1e-9));
    const ox = (w - (d - c) * kx * k) / 2, oy = (h - (b - a) * k) / 2;
    const xy = pts.map(p => [ox + (p.lng - c) * kx * k, h - oy - (p.lat - a) * k]);
    const head = xy[xy.length - 1];
    line = (
      <>
        <Polyline points={xy.map(p => p.join(',')).join(' ')} stroke={live ? C.hot : C.faint} strokeWidth={live ? 3 : 2} fill="none" strokeLinejoin="round" strokeLinecap="round" />
        <Circle cx={xy[0][0]} cy={xy[0][1]} r={4} fill="none" stroke={live ? C.hot : C.faint} strokeWidth={1.5} />
        {live && <AnimatedCircle cx={head[0]} cy={head[1]} r={pulse.interpolate({ inputRange: [0, 1], outputRange: [4, 16] })} fill="none" stroke={C.live}
          strokeOpacity={pulse.interpolate({ inputRange: [0, 1], outputRange: [0.9, 0] })} strokeWidth={1.5} />}
        {live && <Circle cx={head[0]} cy={head[1]} r={4} fill={C.live} />}
      </>
    );
  }
  return (
    <Svg width={w} height={h} style={StyleSheet.absoluteFill}>
      {grid}
      {line}
    </Svg>
  );
}

const styles = StyleSheet.create({
  safe: { flex: 1, backgroundColor: C.bg },
  typeRow: { flexDirection: 'row', gap: 6, paddingHorizontal: 16 },
  typeChip: {
    flex: 1, flexDirection: 'row', gap: 6, alignItems: 'center', justifyContent: 'center',
    height: 40, borderRadius: 20, borderWidth: 1, borderColor: C.line, backgroundColor: C.surface,
  },
  typeChipActive: { backgroundColor: C.hot, borderColor: C.hot },
  typeChipText: { fontFamily: F.dot, fontSize: 11, color: C.ink, letterSpacing: 1.5 },
  typeChipTextActive: { color: C.onHot },

  stage: { flex: 1, minHeight: 160, marginHorizontal: 16, marginTop: 12, borderRadius: 22, borderWidth: 1, borderColor: C.line, backgroundColor: C.surface, overflow: 'hidden' },
  stageTop: { flexDirection: 'row', justifyContent: 'space-between', alignItems: 'center', padding: 14 },
  status: { flexDirection: 'row', alignItems: 'center', gap: 6 },
  recDot: { width: 7, height: 7, borderRadius: 4, backgroundColor: C.alert },
  statusText: { fontFamily: F.dot, fontSize: 9, color: C.dim, letterSpacing: 1.5 },
  stageFoot: { position: 'absolute', left: 14, bottom: 12, flexDirection: 'row', alignItems: 'baseline', gap: 6 },
  footLabel: { fontFamily: F.dot, fontSize: 8, color: C.dim, letterSpacing: 1.5 },
  footValue: { color: C.ink },

  timeBlock: { alignItems: 'center', marginTop: 14 },
  timer: { fontFamily: F.dot, fontSize: 76, color: C.hot, letterSpacing: 2 },
  statsRow: { flexDirection: 'row', marginHorizontal: 16, marginTop: 6, borderTopWidth: 1, borderBottomWidth: 1, borderColor: C.line },
  statCol: { flex: 1, alignItems: 'center', paddingVertical: 10, gap: 2 },
  statRule: { borderLeftWidth: 1, borderLeftColor: C.line },
  statValue: { color: C.ink },
  statLabel: { fontFamily: F.dot, fontSize: 8, color: C.dim, letterSpacing: 2 },

  btnWrap: { alignItems: 'center', paddingVertical: 16, gap: 8 },
  btn: { backgroundColor: C.hot, alignItems: 'center', justifyContent: 'center' },
  btnStop: { backgroundColor: C.surface },
  btnText: { fontFamily: F.dot, fontSize: 16, color: C.onHot, letterSpacing: 2 },
  stopSquare: { width: 26, height: 26, borderRadius: 5, backgroundColor: C.alert },
  btnHint: { fontFamily: F.dot, fontSize: 8, color: C.faint, letterSpacing: 2 },
});
