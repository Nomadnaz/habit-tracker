// ─────────────────────────────────────────────────────────────────────────
// STEPS — today's steps and distance, daily / weekly / monthly goals, the
// weekly climb (components/steps/Mountain.tsx: steps since Monday carry you
// up a 3D ASCII mountain, flags at 10K / 20K / 50K / summit 100K, with how
// long each took this week and your best — lib/climb.ts), and your latest or
// fastest run as a dashed route with the numbers Strava would show. Tap the
// run for its printed receipt.
// ─────────────────────────────────────────────────────────────────────────

import { useCallback, useMemo, useState } from 'react';
import { View, Text, ScrollView, StyleSheet, Pressable, useWindowDimensions } from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';
import { useFocusEffect, useRouter } from 'expo-router';
import { MaterialCommunityIcons } from '@expo/vector-icons';
import AsyncStorage from '@react-native-async-storage/async-storage';
import * as Haptics from 'expo-haptics';

import { loadBodyData, todaySteps, refreshAppleHealthIfConnected, type BodyData } from '@/lib/body-data';
import { getRecentActivities, computeSplits, formatDuration, formatPace, type Activity } from '@/lib/activity-data';
import { bests, CHECKPOINTS, cpLabel, fmtElapsed, progressOf, recentClimbs, SUMMIT, weekStart, type Best } from '@/lib/climb';
import { toDateKey } from '@/lib/dateKey';
import { C, F, MTN, numFace } from '@/lib/theme';
import { hit } from '@/lib/hit';
import { ScreenHeader, HeaderIcon } from '@/components/ScreenHeader';
import { Mountain, type Checkpoint } from '@/components/steps/Mountain';
import { RouteMap } from '@/components/RouteMap';

const BESTS_KEY = '@climb_bests';
const STRIDE_M = 0.762;
const MON = ['JAN', 'FEB', 'MAR', 'APR', 'MAY', 'JUN', 'JUL', 'AUG', 'SEP', 'OCT', 'NOV', 'DEC'];

const km = (m: number) => (m / 1000).toFixed(2);
const fmt = (n: number) => Math.round(n).toLocaleString();

function GoalBar({ label, value, goal }: { label: string; value: number; goal: number }) {
  const pct = goal > 0 ? Math.min(1, value / goal) : 0;
  const cells = 24;
  return (
    <View style={st.goal}>
      <View style={st.goalHead}>
        <Text style={st.goalLabel}>{label}</Text>
        <Text style={st.goalNums}>
          <Text style={{ color: C.hot }}>{fmt(value)}</Text>{` / ${fmt(goal)}`}
        </Text>
      </View>
      <View style={st.cells}>
        {Array.from({ length: cells }, (_, i) => (
          <View key={i} style={[st.cell, { backgroundColor: i < Math.round(pct * cells) ? (pct >= 1 ? C.live : C.hot) : C.ghost }]} />
        ))}
      </View>
    </View>
  );
}

export default function StepsScreen() {
  const router = useRouter();
  const { width } = useWindowDimensions();
  const [body, setBody] = useState<BodyData | null>(null);
  const [runs, setRuns] = useState<Activity[]>([]);
  const [kept, setKept] = useState<Best[]>([]);
  const [pick, setPick] = useState<'latest' | 'fastest'>('latest');

  useFocusEffect(useCallback(() => {
    void loadBodyData().then(d => {
      setBody(d);
      if (d.appleHealthConnected) void refreshAppleHealthIfConnected().then(u => { if (u) setBody(u); });
    });
    void getRecentActivities(50).then(setRuns).catch(() => {});
    void AsyncStorage.getItem(BESTS_KEY).then(r => setKept(r ? JSON.parse(r) : [])).catch(() => {});
  }, []));

  const now = new Date();
  const climbs = useMemo(() => (body ? recentClimbs(body.stepsHistory, body.stepsHourly ?? {}, now, 9) : []), [body]);
  const best = useMemo(() => {
    const b = bests(climbs, kept);
    if (climbs.length && JSON.stringify(b) !== JSON.stringify(kept)) void AsyncStorage.setItem(BESTS_KEY, JSON.stringify(b));
    return b;
  }, [climbs, kept]);
  const week = climbs[0];
  const checkpoints: Checkpoint[] = useMemo(() => CHECKPOINTS.map((cp, i) => ({
    t: cp / SUMMIT, label: cpLabel(cp), reached: week?.reached[i] != null,
    time: week?.reached[i] != null ? fmtElapsed(week.reached[i]!) : undefined,
  })), [week]);

  if (!body) return <SafeAreaView style={st.safe} edges={['top']} />;

  const steps = todaySteps(body);
  const distM = body.activityToday?.distanceM || steps * STRIDE_M;
  const mon = weekStart(now);
  const daysInMonth = new Date(now.getFullYear(), now.getMonth() + 1, 0).getDate();
  const monthPrefix = toDateKey(now).slice(0, 7);
  const monthSteps = Object.entries(body.stepsHistory).filter(([k]) => k.startsWith(monthPrefix)).reduce((a, [, v]) => a + v, 0);
  const stageW = width - 32;

  const moving = runs.filter(r => r.distanceM >= 500 && r.durationSecs > 0);
  const fastest = [...moving].filter(r => r.distanceM >= 1000).sort((a, b) => (a.durationSecs / a.distanceM) - (b.durationSecs / b.distanceM))[0];
  const shown = pick === 'fastest' ? fastest : moving[0];
  const splits = shown ? computeSplits(shown.waypoints) : [];
  const bestSplit = splits.length ? Math.min(...splits.map(s => s.paceSecPerKm)) : null;

  return (
    <SafeAreaView style={st.safe} edges={['top']}>
      <ScreenHeader title="STEPS" right={<HeaderIcon icon="history" label="Activity history" onPress={() => router.push('/activity-history')} />} />
      <ScrollView contentContainerStyle={st.content} showsVerticalScrollIndicator={false}>

        {/* ── today ── */}
        <View style={st.hero}>
          <View style={{ flex: 1 }}>
            <Text style={st.eyebrow}>TODAY</Text>
            <Text style={st.big} numberOfLines={1} adjustsFontSizeToFit>{fmt(steps)}</Text>
            <Text style={st.eyebrow}>STEPS</Text>
          </View>
          <View style={st.side}>
            <Text style={[st.sideVal, numFace(km(distM), 26)]}>{km(distM)}</Text>
            <Text style={st.eyebrow}>KM</Text>
            {!!body.activityToday?.activeMinutes && (
              <>
                <Text style={[st.sideVal, { fontFamily: F.dot, fontSize: 20, marginTop: 8 }]}>{body.activityToday.activeMinutes}</Text>
                <Text style={st.eyebrow}>ACTIVE MIN</Text>
              </>
            )}
          </View>
        </View>

        <View style={st.card}>
          <GoalBar label="DAILY" value={steps} goal={body.stepsGoal} />
          <GoalBar label="WEEKLY" value={week?.total ?? 0} goal={body.stepsGoal * 7} />
          <GoalBar label="MONTHLY" value={monthSteps} goal={body.stepsGoal * daysInMonth} />
        </View>

        {/* ── the climb ── */}
        <View style={st.sectionHead}>
          <Text style={st.section}>THE CLIMB</Text>
          <Text style={st.sectionSub}>{`WEEK OF ${mon.getDate()} ${MON[mon.getMonth()]} · ${Math.round(progressOf(week?.total ?? 0) * 100)}%`}</Text>
        </View>
        <Mountain width={stageW} progress={progressOf(week?.total ?? 0)} checkpoints={checkpoints} />
        <Text style={st.hint}>DRAG TO TURN THE MOUNTAIN</Text>

        <View style={st.card}>
          {CHECKPOINTS.map((cp, i) => {
            const t = week?.reached[i];
            const b = best[i];
            const pb = t != null && b != null && b.week === week.start && Math.abs(b.ms - t) < 1;
            return (
              <View key={cp} style={[st.cp, i > 0 && st.cpRule]}>
                <MaterialCommunityIcons name={t != null ? 'flag-variant' : 'flag-variant-outline'} size={18} color={t != null ? MTN.flags[i % 5] : C.faint} />
                <View style={{ flex: 1 }}>
                  <Text style={[st.cpLabel, t == null && { color: C.dim }]}>{cpLabel(cp)}</Text>
                  <Text style={st.cpSub}>{t != null ? `REACHED IN ${fmtElapsed(t)}` : `${fmt(cp - (week?.total ?? 0))} TO GO`}</Text>
                </View>
                <View style={{ alignItems: 'flex-end', gap: 3 }}>
                  {pb && <Text style={st.pb}>NEW PB</Text>}
                  <Text style={st.cpBest}>{b ? `BEST ${fmtElapsed(b.ms)}` : 'NO BEST YET'}</Text>
                </View>
              </View>
            );
          })}
        </View>

        {/* ── runs ── */}
        <View style={st.sectionHead}>
          <Text style={st.section}>RUNS</Text>
          <View style={st.tabs}>
            {(['latest', 'fastest'] as const).map(k => (
              <Pressable key={k} onPress={() => { Haptics.selectionAsync(); setPick(k); }} hitSlop={hit(60, 28)} style={[st.tab, pick === k && st.tabOn]}>
                <Text style={[st.tabText, pick === k && { color: C.onHot }]}>{k.toUpperCase()}</Text>
              </Pressable>
            ))}
          </View>
        </View>
        {shown ? (
          <Pressable
            onPress={() => { Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Light); router.push({ pathname: '/activity-receipt', params: { id: shown.id } }); }}
            style={({ pressed }) => [st.run, pressed && { transform: [{ scale: 0.98 }] }]}
          >
            <View style={st.runHead}>
              <Text style={st.runType}>{shown.type.toUpperCase()}</Text>
              <Text style={st.runDate}>{`${new Date(shown.startTime).getDate()} ${MON[new Date(shown.startTime).getMonth()]} · ${new Date(shown.startTime).toTimeString().slice(0, 5)}`}</Text>
            </View>
            <View style={st.runBody}>
              <View style={st.routeBox}><RouteMap key={shown.id} waypoints={shown.waypoints} width={Math.round(stageW * 0.46)} height={Math.round(stageW * 0.46)} durationMs={2600} /></View>
              <View style={st.stats}>
                <Stat label="DISTANCE" value={`${km(shown.distanceM)}`} unit="KM" />
                <Stat label="TIME" value={formatDuration(shown.durationSecs)} />
                <Stat label="PACE" value={formatPace(shown.avgPacePerKm).replace('/km', '')} unit="/KM" />
                <Stat label="SPEED" value={((shown.distanceM / 1000) / (shown.durationSecs / 3600)).toFixed(1)} unit="KM/H" />
                <Stat label="ELEV GAIN" value={`${shown.elevationGainM}`} unit="M" />
                {bestSplit != null && <Stat label="FASTEST KM" value={formatPace(bestSplit).replace('/km', '')} unit="/KM" />}
              </View>
            </View>
            <View style={st.runFoot}>
              <MaterialCommunityIcons name="receipt" size={14} color={C.dim} />
              <Text style={st.runFootText}>TAP FOR THE RECEIPT · SHARE</Text>
              <MaterialCommunityIcons name="chevron-right" size={16} color={C.dim} />
            </View>
          </Pressable>
        ) : (
          <Pressable onPress={() => router.push('/(tabs)/activity')} style={st.emptyRun}>
            <MaterialCommunityIcons name="run" size={18} color={C.ink} />
            <Text style={st.emptyText}>NO RUNS YET · RECORD ONE</Text>
          </Pressable>
        )}
      </ScrollView>
    </SafeAreaView>
  );
}

function Stat({ label, value, unit }: { label: string; value: string; unit?: string }) {
  return (
    <View style={st.stat}>
      <Text style={st.statLabel}>{label}</Text>
      <Text style={st.statValue} numberOfLines={1} adjustsFontSizeToFit>
        <Text style={numFace(value, 16)}>{value}</Text>{unit ? <Text style={st.statUnit}>{` ${unit}`}</Text> : null}
      </Text>
    </View>
  );
}

const st = StyleSheet.create({
  safe: { flex: 1, backgroundColor: C.bg },
  content: { paddingHorizontal: 16, paddingBottom: 48, gap: 12 },
  hero: { flexDirection: 'row', alignItems: 'flex-end', gap: 12, paddingHorizontal: 4 },
  eyebrow: { fontFamily: F.dot, fontSize: 9, color: C.dim, letterSpacing: 2 },
  big: { fontFamily: F.dot, fontSize: 64, color: C.hot, letterSpacing: 1 },
  side: { alignItems: 'flex-end', paddingBottom: 4 },
  sideVal: { color: C.ink },
  card: { backgroundColor: C.surface, borderRadius: 20, borderCurve: 'continuous', borderWidth: 1, borderColor: C.line, padding: 14, gap: 12 },
  goal: { gap: 6 },
  goalHead: { flexDirection: 'row', justifyContent: 'space-between' },
  goalLabel: { fontFamily: F.dot, fontSize: 9, color: C.dim, letterSpacing: 2 },
  goalNums: { fontFamily: F.mono, fontSize: 11, color: C.dim },
  cells: { flexDirection: 'row', gap: 2 },
  cell: { flex: 1, height: 8, borderRadius: 1.5 },
  sectionHead: { flexDirection: 'row', justifyContent: 'space-between', alignItems: 'center', marginTop: 8, paddingHorizontal: 4 },
  section: { fontFamily: F.dot, fontSize: 12, color: C.dim, letterSpacing: 3 },
  sectionSub: { fontFamily: F.mono, fontSize: 11, color: C.dim },
  hint: { fontFamily: F.mono, fontSize: 10, color: C.faint, letterSpacing: 1, textAlign: 'center', marginTop: -4 },
  cp: { flexDirection: 'row', alignItems: 'center', gap: 12 },
  cpRule: { borderTopWidth: 1, borderTopColor: C.line, paddingTop: 12 },
  cpLabel: { fontFamily: F.dot, fontSize: 14, color: C.hot, letterSpacing: 1 },
  cpSub: { fontFamily: F.mono, fontSize: 11, color: C.dim, marginTop: 2 },
  cpBest: { fontFamily: F.mono, fontSize: 11, color: C.ink },
  pb: { fontFamily: F.dot, fontSize: 8, color: C.onHot, backgroundColor: C.live, paddingHorizontal: 6, paddingVertical: 2, borderRadius: 4, borderCurve: 'continuous', overflow: 'hidden', letterSpacing: 1 },
  tabs: { flexDirection: 'row', gap: 4 },
  tab: { height: 28, paddingHorizontal: 12, borderRadius: 14, borderWidth: 1, borderColor: C.line, justifyContent: 'center' },
  tabOn: { backgroundColor: C.hot, borderColor: C.hot },
  tabText: { fontFamily: F.dot, fontSize: 9, color: C.dim, letterSpacing: 1.2 },
  run: { backgroundColor: C.surface, borderRadius: 20, borderCurve: 'continuous', borderWidth: 1, borderColor: C.line, padding: 14, gap: 12 },
  runHead: { flexDirection: 'row', justifyContent: 'space-between', alignItems: 'baseline' },
  runType: { fontFamily: F.dot, fontSize: 16, color: C.hot, letterSpacing: 1.5 },
  runDate: { fontFamily: F.mono, fontSize: 11, color: C.dim },
  runBody: { flexDirection: 'row', gap: 12 },
  routeBox: { borderRadius: 14, borderCurve: 'continuous', overflow: 'hidden', backgroundColor: C.bg, borderWidth: 1, borderColor: C.line },
  stats: { flex: 1, flexDirection: 'row', flexWrap: 'wrap', rowGap: 10 },
  stat: { width: '50%', gap: 2 },
  statLabel: { fontFamily: F.dot, fontSize: 7, color: C.dim, letterSpacing: 1.2 },
  statValue: { color: C.hot },
  statUnit: { fontFamily: F.dot, fontSize: 8, color: C.dim },
  runFoot: { flexDirection: 'row', alignItems: 'center', gap: 6, borderTopWidth: 1, borderTopColor: C.line, paddingTop: 10 },
  runFootText: { flex: 1, fontFamily: F.dot, fontSize: 8, color: C.dim, letterSpacing: 1.5 },
  emptyRun: { flexDirection: 'row', alignItems: 'center', justifyContent: 'center', gap: 8, height: 56, borderRadius: 18, borderCurve: 'continuous', borderWidth: 1, borderStyle: 'dashed', borderColor: C.lineHi },
  emptyText: { fontFamily: F.dot, fontSize: 10, color: C.ink, letterSpacing: 1.5 },
});
