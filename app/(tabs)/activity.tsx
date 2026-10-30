// ─────────────────────────────────────────────────────────────────────────
// ACTIVITY TAB — hike/run/walk RECORDING only (task 032 + the Strava-style
// split: this tab records, app/activity-receipt.tsx is the landing result
// screen, app/activity-summary.tsx holds the full analytical view, and
// app/activity-history.tsx browses past activities). On stop(), this screen
// routes straight to the receipt instead of refreshing an inline list.
//
// Laid out like BODY: the map runs edge to edge with readouts hung in its
// corners (status, GPS, and while recording a NOW readout on a line to the
// route's head), then the clock, the current km filling up, the numbers,
// a dot-column chart of the splits, and the button: a ring of dots that
// turns while it waits and fills red as you hold to stop. START counts
// 3-2-1 with the GPS already warming up.
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
import { View, Text, StyleSheet, Pressable, Alert, Animated, Easing, type LayoutChangeEvent, type LayoutRectangle } from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';
import { useFocusEffect, useRouter } from 'expo-router';
import { MaterialCommunityIcons } from '@expo/vector-icons';
import * as Haptics from 'expo-haptics';
import * as Location from 'expo-location';
import Svg, { Circle, Polyline, Rect } from 'react-native-svg';
import { startBackgroundLocation, stopBackgroundLocation, drainBackgroundWaypoints, mergeWaypoints } from '@/lib/locationTask';

import {
  saveActivity, computeDistanceM, computeElevationGainM, computePacePerKm, computeSplits, getActivitiesInRange, getRecentActivities,
  formatDuration,
  type Activity, type ActivityType, type Waypoint,
} from '@/lib/activity-data';

import { C, F, TNUM, numFace } from '@/lib/theme';
import { hit } from '@/lib/hit';
import { RouteMap } from '@/components/RouteMap';
import { Corners } from '@/components/Corners';
import { Pixel, Segs } from '@/components/today/bits';

const TYPES: { key: ActivityType; word: string }[] = [
  { key: 'run', word: 'RUN' },
  { key: 'walk', word: 'WALK' },
  { key: 'hike', word: 'HIKE' },
];
const HOLD_MS = 900;
const BTN = 124;  // the button with its ring
const CORE = 86;  // the disc inside it
const DOTS = 36;  // round the ring
const DAYS = ['SUN', 'MON', 'TUE', 'WED', 'THU', 'FRI', 'SAT'];
const MONTHS = ['JAN', 'FEB', 'MAR', 'APR', 'MAY', 'JUN', 'JUL', 'AUG', 'SEP', 'OCT', 'NOV', 'DEC'];

const km = (m: number) => (m / 1000).toFixed(2);
const pace = (secsPerKm?: number) => (secsPerKm && Number.isFinite(secsPerKm) && secsPerKm < 3600
  ? `${Math.floor(secsPerKm / 60)}:${String(Math.round(secsPerKm % 60)).padStart(2, '0')}` : '-:--');
const wait = (ms: number) => new Promise(r => setTimeout(r, ms));
/** GPS accuracy (m) → 0–4 bars. */
const barsOf = (acc: number | null) => (acc == null ? 0 : acc <= 5 ? 4 : acc <= 10 ? 3 : acc <= 20 ? 2 : acc <= 50 ? 1 : 0);
const agoWord = (iso: string) => {
  const d = Math.floor((Date.now() - Date.parse(iso)) / 86_400_000);
  return d <= 0 ? 'TODAY' : d === 1 ? 'YESTERDAY' : `${d} DAYS AGO`;
};

export default function ActivityScreen() {
  const router = useRouter();
  const [type, setType] = useState<ActivityType>('run');
  const [recording, setRecording] = useState(false);
  const [waypoints, setWaypoints] = useState<Waypoint[]>([]);
  const [startedAt, setStartedAt] = useState<string | null>(null);
  const [elapsedSecs, setElapsedSecs] = useState(0);
  const [stage, setStage] = useState({ w: 0, h: 0 });
  const [last, setLast] = useState<Activity | null>(null);
  const [week, setWeek] = useState({ m: 0, n: 0 });
  const [acc, setAcc] = useState<number | null>(null);
  const [count, setCount] = useState<number | null>(null); // 3, 2, 1, 0 = GO
  const [head, setHead] = useState<{ x: number; y: number } | null>(null);
  const [nowBox, setNowBox] = useState<LayoutRectangle | null>(null);
  const subRef = useRef<Location.LocationSubscription | null>(null);
  const tickRef = useRef<ReturnType<typeof setInterval> | null>(null);
  const starting = useRef(false);
  const taking = useRef(false); // waypoints are kept from GO, not during the countdown
  const hold = useRef(new Animated.Value(0)).current;
  const turn = useRef(new Animated.Value(0)).current;
  const lineIn = useRef(new Animated.Value(0)).current;
  const wordIn = useRef(new Animated.Value(1)).current;

  useEffect(() => () => {
    subRef.current?.remove();
    subRef.current = null;
    if (tickRef.current) clearInterval(tickRef.current);
    void stopBackgroundLocation(); // never leave the GPS on behind a screen that's gone
  }, []);

  useFocusEffect(useCallback(() => {
    const mon = new Date(); mon.setHours(0, 0, 0, 0); mon.setDate(mon.getDate() - ((mon.getDay() + 6) % 7));
    void Promise.all([getRecentActivities(1), getActivitiesInRange(mon.toISOString(), new Date(Date.now() + 60_000).toISOString())])
      .then(([r, w]) => {
        setLast(r[0]?.waypoints?.length > 1 ? r[0] : null);
        setWeek({ m: w.reduce((a, x) => a + x.distanceM, 0), n: w.length });
      }).catch(() => {});
  }, []));

  // The ring turns slowly while it waits for START.
  useEffect(() => {
    if (recording) return;
    turn.setValue(0);
    const l = Animated.loop(Animated.timing(turn, { toValue: 1, duration: 9000, easing: Easing.linear, useNativeDriver: true }));
    l.start();
    return () => l.stop();
  }, [recording]);

  // The NOW line draws in once there's a head to point at.
  useEffect(() => {
    if (!recording || !head) { lineIn.setValue(0); return; }
    Animated.timing(lineIn, { toValue: 1, duration: 420, easing: Easing.out(Easing.cubic), useNativeDriver: true }).start();
  }, [recording, !!head]);

  const pickType = (t: ActivityType) => {
    if (recording || count != null || t === type) return;
    void Haptics.selectionAsync();
    setType(t);
    wordIn.setValue(0);
    Animated.spring(wordIn, { toValue: 1, friction: 7, tension: 140, useNativeDriver: true }).start();
  };

  async function start() {
    // A second tap while the permission prompt or countdown is up would start
    // a second GPS watch and timer, and the orphaned timer keeps counting after STOP.
    if (starting.current || subRef.current) return;
    starting.current = true;
    try { await begin(); } finally { starting.current = false; }
  }

  async function begin() {
    const perm = await Location.requestForegroundPermissionsAsync();
    if (perm.status !== 'granted') {
      Alert.alert('Location access needed', 'Enable location access in Settings to track an activity.');
      return;
    }
    setWaypoints([]);
    setElapsedSecs(0);
    setHead(null);
    taking.current = false;
    // The watch starts now so the GPS has locked on by GO; points before GO are dropped.
    subRef.current = await Location.watchPositionAsync(
      { accuracy: Location.Accuracy.Balanced, timeInterval: 5000, distanceInterval: 10 },
      loc => {
        setAcc(loc.coords.accuracy ?? null);
        if (!taking.current) return;
        setWaypoints(prev => [...prev, {
          lat: loc.coords.latitude, lng: loc.coords.longitude,
          altitude: loc.coords.altitude, timestamp: loc.timestamp,
        }]);
      },
    );
    for (const n of [3, 2, 1]) {
      setCount(n);
      void Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Light);
      await wait(800);
      if (!subRef.current) { setCount(null); return; } // left the screen mid-count
    }
    setCount(0);
    void Haptics.notificationAsync(Haptics.NotificationFeedbackType.Success);
    taking.current = true;
    const now = new Date().toISOString();
    setStartedAt(now);
    setRecording(true);
    setTimeout(() => setCount(null), 650);

    // From the clock, not by counting ticks: iOS pauses JS timers while the
    // phone is locked in a pocket, which froze the time and pace mid-run.
    const t0 = Date.now();
    tickRef.current = setInterval(() => setElapsedSecs(Math.round((Date.now() - t0) / 1000)), 1000);

    // Best-effort background tracking alongside the foreground subscription
    // above — if permission is denied or the OS task fails to start, the
    // foreground path (already running) is the complete, working fallback.
    void startBackgroundLocation();
  }

  async function stop() {
    subRef.current?.remove();
    subRef.current = null;
    taking.current = false;
    if (tickRef.current) clearInterval(tickRef.current);
    tickRef.current = null;
    setRecording(false);
    setHead(null);
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
    Animated.timing(hold, { toValue: 1, duration: HOLD_MS, easing: Easing.linear, useNativeDriver: true }).start(({ finished }) => {
      if (!finished) return;
      hold.setValue(0);
      void stop();
    });
  }
  function holdOut() {
    Animated.timing(hold, { toValue: 0, duration: 160, useNativeDriver: true }).start();
  }

  const liveDistance = computeDistanceM(waypoints);
  const livePace = computePacePerKm(liveDistance, elapsedSecs);
  const climb = Math.round(computeElevationGainM(waypoints));
  const shown = recording ? waypoints : last?.waypoints ?? null;
  const splits = computeSplits(recording ? waypoints : last?.waypoints ?? []).slice(-14);
  const into = liveDistance % 1000;
  const kmNo = Math.floor(liveDistance / 1000) + 1;
  const bars = barsOf(acc);
  const word = TYPES.find(t => t.key === type)!.word;
  const armed = count != null && !recording;
  const n = new Date();

  // The NOW readout's line: out of its left edge, then to the head.
  const line = recording && head && nowBox ? (() => {
    const ex = nowBox.x - 2, ey = nowBox.y + 11, sx = ex - 8;
    return `${ex},${ey} ${sx},${ey} ${head.x},${head.y}`;
  })() : null;

  return (
    <SafeAreaView style={st.safe} edges={['top']}>
      {/* ── header: the date, then the activity's name as the title; the others beside it ── */}
      <View style={st.header}>
        <Pressable onPress={() => router.back()} hitSlop={8} style={st.iconBtn} accessibilityLabel="Back">
          <MaterialCommunityIcons name="chevron-left" size={20} color={C.ink} />
        </Pressable>
        <View style={{ flex: 1 }}>
          <Text style={st.eyebrow}>{`${DAYS[n.getDay()]} ${String(n.getDate()).padStart(2, '0')} ${MONTHS[n.getMonth()]} · ${recording ? 'RECORDING' : 'RECORD'}`}</Text>
          <View style={st.titleRow}>
            <Animated.Text style={[st.title, { opacity: wordIn, transform: [{ translateY: wordIn.interpolate({ inputRange: [0, 1], outputRange: [10, 0] }) }] }]}>{word}</Animated.Text>
            {!recording && !armed && TYPES.filter(t => t.key !== type).map(t => (
              <Pressable key={t.key} onPress={() => pickType(t.key)} hitSlop={hit(56, 26, 4)} style={st.alt} accessibilityLabel={`Switch to ${t.word}`}>
                <Text style={st.altText}>{t.word}</Text>
              </Pressable>
            ))}
          </View>
        </View>
        <Pressable onPress={() => router.push('/activity-history')} hitSlop={8} style={st.iconBtn} accessibilityLabel="History">
          <MaterialCommunityIcons name="history" size={18} color={C.ink} />
        </Pressable>
      </View>

      {/* ── the map, edge to edge, with readouts in its corners ── */}
      <View style={st.stage} onLayout={(e: LayoutChangeEvent) => setStage({ w: e.nativeEvent.layout.width, h: e.nativeEvent.layout.height })}>
        {stage.w > 0 && shown && shown.length > 1
          ? <RouteMap key={recording ? 'live' : `last${last?.id}`} waypoints={shown} width={stage.w} height={stage.h} live={recording} durationMs={1600}
              onHead={(x, y) => setHead(h => (h && h.x === x && h.y === y ? h : { x, y }))} />
          : stage.w > 0 && <DotField w={stage.w} h={stage.h} />}
        <View style={st.frame} pointerEvents="none"><Corners color={recording ? C.alert : C.lineHi} size={12} weight={1.5} /></View>

        {line && (
          <Animated.View style={[StyleSheet.absoluteFill, { opacity: lineIn }]} pointerEvents="none">
            <Svg width={stage.w} height={stage.h}>
              <Polyline points={line} fill="none" stroke={C.bg} strokeWidth={3} strokeOpacity={0.7} />
              <Polyline points={line} fill="none" stroke={C.hot} strokeWidth={1.25} strokeOpacity={0.9} />
              <Rect x={head!.x - 2.5} y={head!.y - 2.5} width={5} height={5} fill={C.hot} />
            </Svg>
          </Animated.View>
        )}

        <View style={[st.corner, { left: 18, top: 16 }]} pointerEvents="none">
          <View style={st.readHead}>
            <Pixel tone={recording ? C.alert : armed ? C.hot : C.live} blink={recording || armed} size={5} />
            <Text style={[st.readWord, { color: recording ? C.alert : C.dim }]}>{recording ? 'REC' : armed ? 'LOCKING ON' : last ? 'LAST ROUTE' : 'READY'}</Text>
          </View>
          <Text style={st.readSub}>
            {recording ? `${waypoints.length} GPS POINTS` : last ? `${km(last.distanceM)} KM · ${agoWord(last.startTime)}` : 'NO ROUTES YET'}
          </Text>
        </View>

        <View style={[st.corner, { right: 18, top: 16, alignItems: 'flex-end' }]} pointerEvents="none">
          <View style={[st.readHead, { flexDirection: 'row-reverse' }]}>
            <View style={st.bars}>
              {[0, 1, 2, 3].map(i => (
                <View key={i} style={[st.bar, { height: 3 + i * 2, backgroundColor: i < bars ? (bars >= 3 ? C.live : bars === 2 ? C.hot : C.alert) : C.ghost }]} />
              ))}
            </View>
            <Text style={st.readWord}>GPS</Text>
          </View>
          <Text style={st.readSub}>{acc == null ? 'LOCKS ON AT START' : `±${Math.round(acc)} M`}</Text>
        </View>

        {recording ? (
          <View key="now" style={[st.corner, { right: 18, bottom: 16, alignItems: 'flex-end' }]} pointerEvents="none"
            onLayout={e => setNowBox(e.nativeEvent.layout)}>
            <Text style={[st.readWord, { color: C.hot }]}>NOW</Text>
            <View style={st.readRow}>
              <Text style={[st.readValue, numFace(pace(livePace), 21)]}>{pace(livePace)}</Text>
              <Text style={st.readUnit}>/KM</Text>
            </View>
            <Text style={st.readSub}>{`${km(liveDistance)} KM IN`}</Text>
          </View>
        ) : (
          <View key="week" style={[st.corner, { left: 18, bottom: 16 }]} pointerEvents="none">
            <Text style={st.readWord}>THIS WEEK</Text>
            <View style={st.readRow}>
              <Text style={[st.readValue, numFace(km(week.m), 21)]}>{km(week.m)}</Text>
              <Text style={st.readUnit}>KM</Text>
            </View>
            <Text style={st.readSub}>{`${week.n} ${week.n === 1 ? 'SESSION' : 'SESSIONS'}`}</Text>
          </View>
        )}

        {count != null && <Countdown key={count} n={count} />}
      </View>

      {/* ── the clock, the km filling up, the numbers ── */}
      <View style={st.clockBlock}>
        <Text style={[st.clock, !recording && { color: C.faint }]} numberOfLines={1} adjustsFontSizeToFit>{formatDuration(elapsedSecs)}</Text>
        <View style={st.kmRow}>
          <Text style={st.kmWord}>{`KM ${String(kmNo).padStart(2, '0')}`}</Text>
          <Segs pct={recording ? into / 1000 : 0} tone={C.hot} n={24} h={5} style={{ flex: 1 }} />
          <Text style={st.kmWord}>{recording ? `${Math.round(1000 - into)} M` : '1000 M'}</Text>
        </View>
      </View>

      <View style={st.stats}>
        <Stat word="DISTANCE" value={km(liveDistance)} unit="KM" />
        <Stat word="PACE" value={pace(livePace)} unit="/KM" tone={C.live} rule />
        <Stat word="CLIMB" value={String(climb)} unit="M" rule />
      </View>

      {splits.some(x => Number.isInteger(x.km)) && <Splits splits={splits} title={recording ? 'SPLITS' : `LAST ${TYPES.find(t => t.key === last?.type)?.word ?? word} · SPLITS`} />}

      {/* ── the button ── */}
      <View style={st.btnWrap}>
        {recording ? (
          <Pressable onPressIn={holdIn} onPressOut={holdOut} accessibilityLabel="Hold to stop" style={st.btn}>
            <Ring hold={hold} />
            <View style={[st.core, st.coreStop]}><View style={st.stopSquare} /></View>
          </Pressable>
        ) : (
          <Pressable onPress={start} disabled={armed} accessibilityLabel="Start" style={({ pressed }) => [st.btn, pressed && { transform: [{ scale: 0.96 }] }]}>
            <Animated.View style={[StyleSheet.absoluteFill, { transform: [{ rotate: turn.interpolate({ inputRange: [0, 1], outputRange: ['0deg', '360deg'] }) }] }]}>
              <Ring />
            </Animated.View>
            <View style={[st.core, armed && { backgroundColor: C.raised }]}>
              <Text style={[st.btnText, armed && { color: C.hot }]}>{armed ? 'READY' : 'START'}</Text>
            </View>
          </Pressable>
        )}
        <Text style={st.btnHint}>{recording ? 'HOLD TO STOP' : armed ? 'GET SET' : `TAP TO START ${word}`}</Text>
      </View>
    </SafeAreaView>
  );
}

function Stat({ word, value, unit, tone = C.dim, rule }: { word: string; value: string; unit: string; tone?: string; rule?: boolean }) {
  return (
    <View style={[st.stat, rule && st.statRule]}>
      <Text style={[st.readWord, { color: tone }]}>{word}</Text>
      <View style={st.readRow}>
        <Text style={[st.readValue, numFace(value, 26)]} numberOfLines={1} adjustsFontSizeToFit>{value}</Text>
        <Text style={st.readUnit}>{unit}</Text>
      </View>
    </View>
  );
}

/** Each km as a column of dots, taller for quicker; the fastest in green, a part km faint. */
function Splits({ splits, title }: { splits: { km: number; paceSecPerKm: number }[]; title: string }) {
  const whole = splits.filter(s => Number.isInteger(s.km));
  const best = whole.length ? Math.min(...whole.map(s => s.paceSecPerKm)) : null;
  const quickest = Math.min(...splits.map(s => s.paceSecPerKm));
  const ROWS = 9;
  return (
    <View style={st.splits}>
      <View style={st.splitsHead}>
        <Text style={st.readWord}>{title}</Text>
        {best != null && <Text style={[st.readWord, { color: C.live }]}>{`FASTEST ${pace(best)}`}</Text>}
      </View>
      <View style={st.cols}>
        {splits.map((s, i) => {
          const part = !Number.isInteger(s.km);
          const lit = Math.max(1, Math.round(ROWS * Math.min(1, (quickest / s.paceSecPerKm) ** 2)));
          const tone = part ? C.faint : s.paceSecPerKm === best ? C.live : C.hot;
          return (
            <View key={i} style={st.col}>
              {Array.from({ length: ROWS }, (_, r) => (
                <View key={r} style={[st.cell, { backgroundColor: ROWS - r <= lit ? tone : C.ghost }]} />
              ))}
              <Text style={st.colKm}>{part ? '·' : s.km}</Text>
            </View>
          );
        })}
      </View>
    </View>
  );
}

/** The button's ring of dots: idle, a comet of white; recording, ghost dots that fill red as `hold` runs. */
function Ring({ hold }: { hold?: Animated.Value }) {
  const r = BTN / 2 - 6;
  return (
    <View style={StyleSheet.absoluteFill} pointerEvents="none">
      {Array.from({ length: DOTS }, (_, i) => {
        const a = (i / DOTS) * Math.PI * 2 - Math.PI / 2;
        const pos = { left: BTN / 2 + Math.cos(a) * r - 2, top: BTN / 2 + Math.sin(a) * r - 2 };
        if (!hold) return <View key={i} style={[st.dot, pos, { backgroundColor: C.hot, opacity: 0.12 + 0.88 * (i / DOTS) ** 2 }]} />;
        return (
          <View key={i} style={[st.dot, pos, { backgroundColor: C.ghost }]}>
            <Animated.View style={[StyleSheet.absoluteFill, { backgroundColor: C.alert, opacity: hold.interpolate({ inputRange: [i / DOTS, (i + 1) / DOTS], outputRange: [0, 1], extrapolate: 'clamp' }) }]} />
          </View>
        );
      })}
    </View>
  );
}

/** 3 · 2 · 1 · GO over the map. */
function Countdown({ n }: { n: number }) {
  const a = useRef(new Animated.Value(0)).current;
  useEffect(() => {
    Animated.timing(a, { toValue: 1, duration: 620, easing: Easing.out(Easing.cubic), useNativeDriver: true }).start();
  }, []);
  return (
    <View style={[StyleSheet.absoluteFill, st.count]} pointerEvents="none">
      <Animated.Text style={[st.countText, n === 0 && { color: C.live },
        { opacity: a.interpolate({ inputRange: [0, 0.2, 1], outputRange: [0, 1, 0.85] }), transform: [{ scale: a.interpolate({ inputRange: [0, 1], outputRange: [1.6, 1] }) }] }]}>
        {n === 0 ? 'GO' : String(n)}
      </Animated.Text>
    </View>
  );
}

/** No route yet: a field of dots, brighter towards the middle. */
function DotField({ w, h }: { w: number; h: number }) {
  const G = 14, dots = [];
  for (let x = G / 2; x < w; x += G) for (let y = G / 2; y < h; y += G) {
    const d = Math.hypot((x - w / 2) / w, (y - h / 2) / h);
    dots.push(<Circle key={`${x}.${y}`} cx={x} cy={y} r={0.9} fill={d < 0.18 ? C.faint : C.ghost} />);
  }
  return <Svg width={w} height={h} style={StyleSheet.absoluteFill}>{dots}</Svg>;
}

const st = StyleSheet.create({
  safe: { flex: 1, backgroundColor: C.bg },
  header: { flexDirection: 'row', alignItems: 'flex-end', gap: 12, paddingHorizontal: 16, paddingTop: 10, marginBottom: 10 },
  eyebrow: { fontFamily: F.dot, fontSize: 10, color: C.dim, letterSpacing: 3 },
  titleRow: { flexDirection: 'row', alignItems: 'center', gap: 8, marginTop: 4 },
  title: { fontFamily: F.dot, fontSize: 40, color: C.ink, letterSpacing: 2, marginRight: 4 },
  alt: { height: 26, paddingHorizontal: 9, borderRadius: 13, borderWidth: 1, borderColor: C.lineHi, justifyContent: 'center' },
  altText: { fontFamily: F.dot, fontSize: 9, color: C.dim, letterSpacing: 1.5 },
  iconBtn: { width: 38, height: 38, borderRadius: 19, borderWidth: 1, borderColor: C.lineHi, alignItems: 'center', justifyContent: 'center', marginBottom: 4 },

  stage: { flex: 1, minHeight: 190, overflow: 'hidden' },
  frame: { position: 'absolute', left: 8, right: 8, top: 8, bottom: 8 },
  corner: { position: 'absolute', gap: 2 },
  readHead: { flexDirection: 'row', alignItems: 'center', gap: 5 },
  readWord: { fontFamily: F.dot, fontSize: 8, color: C.dim, letterSpacing: 1.5 },
  readRow: { flexDirection: 'row', alignItems: 'baseline', gap: 4 },
  readValue: { color: C.hot, ...TNUM },
  readUnit: { fontFamily: F.dot, fontSize: 7, color: C.dim, letterSpacing: 1 },
  readSub: { fontFamily: F.dot, fontSize: 7, color: C.faint, letterSpacing: 1, ...TNUM },
  bars: { flexDirection: 'row', alignItems: 'flex-end', gap: 1.5 },
  bar: { width: 3 },
  count: { alignItems: 'center', justifyContent: 'center', backgroundColor: C.scrim },
  countText: { fontFamily: F.dot, fontSize: 120, color: C.hot, letterSpacing: 4 },

  clockBlock: { paddingHorizontal: 20, marginTop: 10 },
  clock: { fontFamily: F.dot, fontSize: 64, color: C.hot, letterSpacing: 2, textAlign: 'center', ...TNUM },
  kmRow: { flexDirection: 'row', alignItems: 'center', gap: 10, marginTop: 2 },
  kmWord: { fontFamily: F.dot, fontSize: 8, color: C.dim, letterSpacing: 1.5, minWidth: 44, ...TNUM },
  stats: { flexDirection: 'row', marginHorizontal: 20, marginTop: 14, borderTopWidth: 1, borderBottomWidth: 1, borderColor: C.line },
  stat: { flex: 1, paddingVertical: 10, paddingHorizontal: 10, gap: 3 },
  statRule: { borderLeftWidth: 1, borderLeftColor: C.line },

  splits: { marginHorizontal: 20, marginTop: 12, gap: 6 },
  splitsHead: { flexDirection: 'row', justifyContent: 'space-between' },
  cols: { flexDirection: 'row', gap: 6 },
  col: { alignItems: 'center', gap: 2 },
  cell: { width: 5, height: 2.5 },
  colKm: { fontFamily: F.dot, fontSize: 7, color: C.faint, marginTop: 2 },

  btnWrap: { alignItems: 'center', paddingTop: 10, paddingBottom: 14, gap: 4 },
  btn: { width: BTN, height: BTN, alignItems: 'center', justifyContent: 'center' },
  dot: { position: 'absolute', width: 4, height: 4, borderRadius: 1, overflow: 'hidden' },
  core: { width: CORE, height: CORE, borderRadius: CORE / 2, backgroundColor: C.hot, alignItems: 'center', justifyContent: 'center' },
  coreStop: { backgroundColor: C.surface, borderWidth: 1, borderColor: C.lineHi },
  btnText: { fontFamily: F.dot, fontSize: 16, color: C.onHot, letterSpacing: 2 },
  stopSquare: { width: 26, height: 26, borderRadius: 5, borderCurve: 'continuous', backgroundColor: C.alert },
  btnHint: { fontFamily: F.dot, fontSize: 8, color: C.faint, letterSpacing: 2 },
});
