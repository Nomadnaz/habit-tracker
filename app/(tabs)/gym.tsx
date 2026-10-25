// ─────────────────────────────────────────────────────────────────────────
// TRAIN — two big squares (RECORD RUN, LOG WORKOUT), then the coach's pick
// for today (lib/coach.ts: routine + muscle recovery + HRV / resting HR /
// sleep from the wearable), the routine that drives it, and strength.
// Water, weight, sleep and Apple Health live on BODY's vitals grid.
// ─────────────────────────────────────────────────────────────────────────

import { useState, useCallback } from 'react';
import { View, Text, ScrollView, StyleSheet, TouchableOpacity, useWindowDimensions } from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';
import { useFocusEffect, useRouter } from 'expo-router';
import { onWrite } from '@/lib/postWrite';
import { MaterialCommunityIcons } from '@expo/vector-icons';

import {
  loadBodyData, pullRemoteBody, todaySteps, refreshAppleHealthIfConnected,
  type BodyData,
} from '@/lib/body-data';
import { getDoneLog, getExercises, getPBLog, getTemplates, getTemplateExercises, getTrainingSessions } from '@/lib/workout-data';
import { buildHistory, dayName, shortDate, type DayLog } from '@/lib/history';
import { BodyMini } from '@/components/train/BodyMini';
import { Corners } from '@/components/Corners';
import { getActivitiesInRange, getRecentActivities, formatDistance } from '@/lib/activity-data';
import { loadCoach, recalibrateStarterLifts, saveRoutine, type CoachState } from '@/lib/routine';
import { focusOfName, FOCUS_LINEUP, muscleWord, planSession, type Routine } from '@/lib/coach';
import { ActionSquare, RunGlyph, WeekDots } from '@/components/train/ActionSquare';
import { CoachCard } from '@/components/train/CoachCard';
import { RoutineCard } from '@/components/train/RoutineCard';

import { C, F } from '@/lib/theme';
import { formatWeightWithUnit } from '@/lib/unit-preference';

// ── Helpers ──────────────────────────────────────────────────────────────────
function formatBig(n: number): string {
  if (n >= 1_000_000) return `${(n / 1_000_000).toFixed(1)}M`;
  if (n >= 1_000)     return n.toLocaleString();
  return String(n);
}

/** Monday 00:00 of this week. */
function weekStart(now = new Date()): Date {
  const d = new Date(now.getFullYear(), now.getMonth(), now.getDate());
  d.setDate(d.getDate() - ((d.getDay() + 6) % 7));
  return d;
}

type Week = { route: { lat: number; lng: number }[] | null; km: number; runs: number; sets: number[]; done: number[] };

export default function TrainScreen() {
  const router = useRouter();
  const { width } = useWindowDimensions();
  const [data, setData] = useState<BodyData | null>(null);
  const [coach, setCoach] = useState<CoachState | null>(null);
  const [lifts, setLifts] = useState(0);
  const [resting, setResting] = useState<{ name: string; muscle: string; pct: number }[]>([]);
  /** Heaviest PB, and the latest training day — TRAIN's PBS and HISTORY boxes. */
  const [bestPb, setBestPb] = useState<{ name: string; kg: number; date: string; count: number } | null>(null);
  const [lastDay, setLastDay] = useState<DayLog | null>(null);
  const [week, setWeek] = useState<Week>({ route: null, km: 0, runs: 0, sets: [0, 0, 0, 0, 0, 0, 0], done: [] });

  const refreshCoach = useCallback(async () => {
    const c = await loadCoach();
    setCoach(c);
    // Starter lifts still on placeholder weights get real ones here too, or
    // STRENGTH shows the placeholder (100 KG bench) until LOG WORKOUT opens.
    if (await recalibrateStarterLifts(c.sessions)) void loadBodyData().then(setData);
    const live = (await getTemplates()).filter(t => !t.isArchived);
    const t = live.find(x => focusOfName(x.name) === c.today.focus);
    const lib = await getExercises();
    const lineup = t ? await getTemplateExercises(t.id)
      : FOCUS_LINEUP[c.today.focus].map(name => lib.find(e => e.name === name) ?? { name, muscleGroups: [] });
    const plan = planSession(lineup, c.sessions, c.today.at);
    setLifts(plan.keep.length);
    setResting(plan.rest.map(r => ({ name: r.lift.name, muscle: muscleWord(r.muscle), pct: r.pct })));
    // This week, Monday first: sets per day (lifts only) and days with a finished session.
    const mon = weekStart();
    const idx = (date: string) => Math.round((new Date(`${date}T12:00:00`).getTime() - mon.getTime()) / 86_400_000 - 0.5);
    const sets = [0, 0, 0, 0, 0, 0, 0];
    for (const s of c.sessions) {
      if (s.name === 'RUN' || s.name === 'WALKING') continue;
      const i = idx(s.date);
      if (i >= 0 && i < 7) sets[i] += Math.round(s.sets);
    }
    const doneLog = await getDoneLog();
    const done = [...new Set(doneLog.map(d => idx(d.date)).filter(i => i >= 0 && i < 7))];
    setWeek(w => ({ ...w, sets, done }));
    const [pbs, history] = await Promise.all([getPBLog(), getTrainingSessions(60)]);
    const best = pbs.reduce<(typeof pbs)[number] | null>((b, p) => (!b || p.weightKg > b.weightKg ? p : b), null);
    const bestEx = best && lib.find(e => e.id === best.exerciseId);
    setBestPb(best && bestEx ? { name: bestEx.name, kg: best.weightKg, date: best.date, count: new Set(pbs.map(p => p.exerciseId)).size } : null);
    setLastDay(buildHistory(history, doneLog, live)[0] ?? null);
  }, []);

  useFocusEffect(useCallback(() => {
    // Water/weight logged by the voice device land server-side, and this layer
    // is local-first + push-only -- pull first or they never appear here.
    // Fire-and-forget: the local render below must not wait on the network.
    void pullRemoteBody().then(found => { if (found) loadBodyData().then(setData); });
    loadBodyData().then(d => {
      setData(d);
      if (d.appleHealthConnected) {
        void refreshAppleHealthIfConnected().then(updated => {
          if (updated) { setData(updated); void refreshCoach(); }
        });
      }
    });
    void refreshCoach();
    // A set logged from the chat overlay never refocuses this tab.
    const offWrite = onWrite(e => { if (e === 'workout') void refreshCoach(); });
    void Promise.all([
      getRecentActivities(1),
      getActivitiesInRange(weekStart().toISOString(), new Date(Date.now() + 60_000).toISOString()),
    ]).then(([recent, thisWeek]) => setWeek(w => ({
      ...w,
      route: recent[0]?.waypoints?.length > 1 ? recent[0].waypoints : null,
      km: thisWeek.reduce((a, x) => a + x.distanceM, 0),
      runs: thisWeek.length,
    }))).catch(() => {});
    return offWrite;
  }, [refreshCoach]));

  async function changeRoutine(r: Routine) {
    setCoach(c => (c ? { ...c, routine: r } : c));
    await saveRoutine(r);
    void refreshCoach();
  }

  if (!data) {
    return <SafeAreaView style={styles.container} edges={['top']} />;
  }

  const steps = todaySteps(data);
  const square = Math.floor((width - 32 - 10) / 2);
  const today = coach?.today;
  const todayIdx = (new Date().getDay() + 6) % 7;
  const openLog = () => router.push({ pathname: '/workouts', params: today ? { focus: today.focus } : {} });

  return (
    <SafeAreaView style={styles.container} edges={['top']}>
      <ScrollView showsVerticalScrollIndicator={false} contentContainerStyle={styles.scroll}>

        {/* ── Header ─────────────────────────────────────── */}
        <View style={styles.header}>
          <View style={styles.titleBlock}>
            <Text style={styles.subtitle}>BUILD YOUR CHARACTER</Text>
            <Text style={styles.title}>TRAIN</Text>
          </View>
          <TouchableOpacity onPress={() => router.push('/(tabs)/progress')} hitSlop={6} style={styles.headIcon} accessibilityLabel="Progress">
            <MaterialCommunityIcons name="chart-bar" size={19} color={C.ink} />
          </TouchableOpacity>
        </View>

        {/* ── The two squares ────────────────────────────── */}
        <View style={styles.squares}>
          <ActionSquare
            size={square} index="01" eyebrow="RECORD" title="RUN"
            sub={week.runs ? `${formatDistance(week.km)} THIS WEEK` : 'RUN · WALK · HIKE'}
            onPress={() => router.push('/(tabs)/activity')}
          >
            <RunGlyph route={week.route} w={square - 32} h={square * 0.42} />
          </ActionSquare>
          <ActionSquare
            size={square} light index="02" eyebrow={today?.scheduled && !today.done ? 'TODAY' : 'LOG'} title="WORKOUT"
            sub={today ? `${today.title}${today.when !== 'TODAY' ? ` · ${today.when}` : ''}` : 'LOG A SESSION'}
            live={!!today?.scheduled && !today.done}
            onPress={() => router.push('/workout-select')}
          >
            <WeekDots counts={week.sets} todayIdx={todayIdx} w={square - 40} h={square * 0.42} />
          </ActionSquare>
        </View>

        {/* ── Coach: today ───────────────────────────────── */}
        {today && (
          <CoachCard today={today} lifts={lifts} resting={resting} onStart={openLog} onConnect={() => router.push('/settings/wearables')} />
        )}

        {/* ── Routine ────────────────────────────────────── */}
        <Text style={[styles.sectionLabel, styles.sectionLabelStandalone]}>ROUTINE</Text>
        <RoutineCard routine={coach?.routine ?? null} todayIdx={todayIdx} doneIdx={week.done} onChange={changeRoutine} />

        {/* ── Totals: one tappable line (steps opens the steps screen) ── */}
        <TouchableOpacity style={styles.statsLine} activeOpacity={0.7} onPress={() => router.push('/steps')}>
          <Text style={styles.statsText} numberOfLines={1}>
            <Text style={styles.statsVal}>{data.workoutsTotal}</Text> WORKOUTS   <Text style={styles.statsVal}>{data.streak}</Text> DAY STREAK   <Text style={styles.statsVal}>{formatBig(steps)}</Text> STEPS
          </Text>
          <MaterialCommunityIcons name="chevron-right" size={16} color={C.dim} />
        </TouchableOpacity>

        {/* ── PBs and history (strength detail still on /strength) ── */}
        <View style={styles.strengthHeader}>
          <Text style={styles.sectionLabel}>STRENGTH</Text>
          <TouchableOpacity onPress={() => router.push('/strength')}>
            <Text style={styles.viewLinkText}>VIEW DETAILS ›</Text>
          </TouchableOpacity>
        </View>
        <View style={styles.cardRow}>
          <TouchableOpacity style={styles.metricCard} activeOpacity={0.85} onPress={() => router.push('/pbs')} accessibilityLabel="PBs">
            <Corners color={bestPb ? C.live : C.lineHi} />
            <View style={styles.metricHead}>
              <MaterialCommunityIcons name="trophy-outline" size={18} color={bestPb ? C.live : C.ink} />
              <Text style={styles.metricLabel}>PBS</Text>
            </View>
            {bestPb ? (
              <>
                <Text style={[styles.metricValue, { color: C.live }]}>{formatWeightWithUnit(bestPb.kg)}</Text>
                <Text style={styles.metricSub} numberOfLines={1}>{bestPb.name}</Text>
                <Text style={styles.metricSubTiny}>{`${shortDate(bestPb.date)} · ${bestPb.count} LIFT${bestPb.count === 1 ? '' : 'S'}`}</Text>
              </>
            ) : (
              <>
                <Text style={styles.metricValue}>--</Text>
                <Text style={styles.metricSub}>NO PBS YET</Text>
                <Text style={styles.metricSubTiny}>TAP TO SET ONE</Text>
              </>
            )}
          </TouchableOpacity>

          <TouchableOpacity style={styles.metricCard} activeOpacity={0.85} onPress={() => router.push('/history')} accessibilityLabel="History">
            <Corners color={lastDay ? C.alert : C.lineHi} />
            <View style={styles.metricHead}>
              <MaterialCommunityIcons name="history" size={18} color={C.ink} />
              <Text style={styles.metricLabel}>HISTORY</Text>
            </View>
            <View style={styles.historyRow}>
              <View style={{ flex: 1, gap: 2 }}>
                <Text style={styles.metricValue} numberOfLines={2}>{lastDay ? lastDay.title : '--'}</Text>
                <Text style={styles.metricSubTiny}>{lastDay ? `${dayName(lastDay.date)} ${shortDate(lastDay.date)} · ${lastDay.lifts.length} LIFTS` : 'NOTHING LOGGED YET'}</Text>
              </View>
              <BodyMini load={lastDay?.load ?? {}} height={64} />
            </View>
          </TouchableOpacity>
        </View>

      </ScrollView>

    </SafeAreaView>
  );
}

const styles = StyleSheet.create({
  container: { flex: 1, backgroundColor: C.bg },
  scroll: { paddingBottom: 48 },

  // Header
  header: { flexDirection: 'row', alignItems: 'flex-end', justifyContent: 'space-between', paddingHorizontal: 20, paddingTop: 8, paddingBottom: 16 },
  titleBlock: {},
  title: { fontFamily: F.dot, fontSize: 40, color: C.ink, letterSpacing: 2, marginTop: 2 },
  subtitle: { fontFamily: F.dot, fontSize: 10, color: C.dim, letterSpacing: 3 },
  headIcon: { width: 40, height: 40, borderRadius: 20, borderWidth: 1, borderColor: C.lineHi, alignItems: 'center', justifyContent: 'center', marginBottom: 4 },

  squares: { flexDirection: 'row', gap: 10, marginHorizontal: 16, marginBottom: 14 },

  statsLine: { flexDirection: 'row', alignItems: 'center', marginHorizontal: 16, marginBottom: 18, paddingHorizontal: 14, minHeight: 46, borderWidth: 1, borderColor: C.line, borderRadius: 16, borderCurve: 'continuous', backgroundColor: C.surface },
  statsText: { flex: 1, fontFamily: F.dot, fontSize: 9, color: C.dim, letterSpacing: 1.5 },
  statsVal: { fontSize: 14, color: C.ink },

  sectionLabel: { fontFamily: F.dot, fontSize: 11, color: C.dim, letterSpacing: 3 },
  sectionLabelStandalone: { paddingHorizontal: 20, marginBottom: 8 },

  viewLinkText: { fontFamily: F.dot, fontSize: 10, color: C.ink, letterSpacing: 1.5, paddingVertical: 12, paddingLeft: 12 },

  // Strength + metric cards
  strengthHeader: { flexDirection: 'row', justifyContent: 'space-between', alignItems: 'center', paddingLeft: 20, paddingRight: 16 },
  cardRow: { flexDirection: 'row', paddingHorizontal: 16, gap: 8, marginBottom: 16 },

  metricCard: { flex: 1, backgroundColor: C.surface, padding: 12, gap: 4 },
  metricHead: { flexDirection: 'row', alignItems: 'center', gap: 6, marginBottom: 2 },
  metricLabel: { fontFamily: F.dot, fontSize: 9, color: C.dim, letterSpacing: 1.5 },
  historyRow: { flexDirection: 'row', alignItems: 'flex-end', gap: 6 },
  metricValue: { fontFamily: F.dot, fontSize: 17, color: C.ink },
  metricSub: { fontFamily: F.mono, fontSize: 11, color: C.dim },
  metricSubTiny: { fontFamily: F.mono, fontSize: 11, color: C.dim },
});
