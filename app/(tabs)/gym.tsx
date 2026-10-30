// ─────────────────────────────────────────────────────────────────────────
// TRAIN — the two big squares (RECORD RUN, LOG WORKOUT), then a calendar
// strip of your days (components/train/DayStrip.tsx): the past weeks, today
// and the week ahead, marked with what you lifted, ran and logged, days
// marked missed, and the routine's plan. Tap a day for its panel
// (components/train/DayPanel.tsx) to put right what was logged on it:
// lifts, runs, food, water, weigh-ins, or mark a blank day missed so an
// average day is assumed. Every change recomputes the twin (lib/twin-data.ts:
// muscles, targets, the coach's pick). The routine, PBs, strength and steps
// sit in a row of links underneath, and HISTORY last: the latest training
// day with the muscles it worked, opening the full history.
// ─────────────────────────────────────────────────────────────────────────

import { useState, useCallback } from 'react';
import { View, Text, ScrollView, StyleSheet, Pressable, useWindowDimensions } from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';
import { useFocusEffect, useRouter } from 'expo-router';
import { MaterialCommunityIcons } from '@expo/vector-icons';
import * as Haptics from 'expo-haptics';

import { onWrite } from '@/lib/postWrite';
import { loadBodyData, pullRemoteBody, refreshAppleHealthIfConnected } from '@/lib/body-data';
import { getDoneLog, getJunctions, getTemplates, getTrainingSessions } from '@/lib/workout-data';
import { getMealMap } from '@/lib/meals-data';
import { getActivitiesInRange, getRecentActivities, formatDistance } from '@/lib/activity-data';
import { loadCoach, recalibrateStarterLifts, saveRoutine, type CoachState } from '@/lib/routine';
import { weekPlan, type Routine } from '@/lib/coach';
import { getMissedDays, setMissed } from '@/lib/missed-days';
import { dialOrder, type DialItem } from '@/lib/workout-dial';
import { buildHistory, dayName, shortDate, type DayLog } from '@/lib/history';
import { blankDays, dayMarks, type DayMark } from '@/lib/train-days';
import { loadToday } from '@/lib/twin-data';
import { toDateKey } from '@/lib/dateKey';
import { useRevalidate } from '@/lib/revalidate';
import { ActionSquare, RunGlyph, WeekDots } from '@/components/train/ActionSquare';
import { RoutineCard } from '@/components/train/RoutineCard';
import { DayStrip } from '@/components/train/DayStrip';
import { DayPanel } from '@/components/train/DayPanel';
import { BodyMini } from '@/components/train/BodyMini';
import { Corners } from '@/components/Corners';

import { C, F } from '@/lib/theme';
import { TAP } from '@/lib/hit';

const BACK = 56; // days of calendar behind today
const AHEAD = 7;
const MONTHS = ['JANUARY', 'FEBRUARY', 'MARCH', 'APRIL', 'MAY', 'JUNE', 'JULY', 'AUGUST', 'SEPTEMBER', 'OCTOBER', 'NOVEMBER', 'DECEMBER'];
const CARDIO = new Set(['RUN', 'WALKING']);

/** Monday 00:00 of this week. */
function weekStart(now = new Date()): Date {
  const d = new Date(now.getFullYear(), now.getMonth(), now.getDate());
  d.setDate(d.getDate() - ((d.getDay() + 6) % 7));
  return d;
}

type Week = { route: { lat: number; lng: number }[] | null; km: number; runs: number; sets: number[] };

export default function TrainScreen() {
  const router = useRouter();
  const { width } = useWindowDimensions();
  const today = toDateKey(new Date());
  const [coach, setCoach] = useState<CoachState | null>(null);
  const [week, setWeek] = useState<Week>({ route: null, km: 0, runs: 0, sets: [0, 0, 0, 0, 0, 0, 0] });
  const [marks, setMarks] = useState<DayMark[]>([]);
  const [selected, setSelected] = useState(today);
  const [routineOpen, setRoutineOpen] = useState(false);
  const [dial, setDial] = useState<DialItem[]>([]);
  const [lastDay, setLastDay] = useState<DayLog | null>(null);

  const refresh = useCallback(async () => {
    const c = await loadCoach();
    setCoach(c);
    // Starter lifts still on placeholder weights get real ones here too.
    void recalibrateStarterLifts(c.sessions);

    const now = new Date();
    const from = new Date(now.getFullYear(), now.getMonth(), now.getDate() - BACK);
    const [lifts, runs, meals, missed, done, recent, templates, junctions] = await Promise.all([
      getTrainingSessions(BACK + 1).catch(() => []),
      getActivitiesInRange(from.toISOString(), new Date(now.getTime() + 60_000).toISOString()).catch(() => []),
      getMealMap(),
      getMissedDays(),
      getDoneLog(),
      getRecentActivities(1).catch(() => []),
      getTemplates(),
      getJunctions(),
    ]);
    // The day panel's picker: SELECT's sessions, in its order.
    setDial(dialOrder({ today: c.today, routine: c.routine, templates, liftsOf: id => junctions.filter(j => j.templateId === id).length, now }));
    setLastDay(buildHistory(lifts, done, templates.filter(t => !t.isArchived))[0] ?? null);
    const body = c.body;
    const day = (iso: string | number) => toDateKey(new Date(iso));
    const liftDays = [...lifts.filter(s => !CARDIO.has(s.name)).map(s => s.date), ...done.map(d => d.date)];
    const runDays = [...runs.map(r => day(r.endTime)), ...(body.runs ?? []).map(r => day(r.end))];
    const loggedDays = [
      ...Object.entries(meals).filter(([, m]) => m.length).map(([k]) => k),
      ...body.waterLogs.map(w => day(w.at)),
      ...body.weightLogs.map(w => day(w.at)),
    ];
    setMarks(dayMarks({
      today: toDateKey(now), back: BACK, ahead: AHEAD, liftDays, runDays, loggedDays, missed,
      plan: c.routine ? weekPlan(c.routine) : null,
    }));

    // The squares: this week's sets per day (Monday first), km and the last route.
    const mon = weekStart(now);
    const sets = [0, 0, 0, 0, 0, 0, 0];
    for (const s of c.sessions) {
      if (CARDIO.has(s.name)) continue;
      const i = Math.round((new Date(`${s.date}T12:00:00`).getTime() - mon.getTime()) / 86_400_000 - 0.5);
      if (i >= 0 && i < 7) sets[i] += Math.round(s.sets);
    }
    const thisWeek = runs.filter(r => Date.parse(r.endTime) >= mon.getTime());
    setWeek({
      route: recent[0]?.waypoints?.length > 1 ? recent[0].waypoints : null,
      km: thisWeek.reduce((a, x) => a + x.distanceM, 0),
      runs: thisWeek.length,
      sets,
    });
  }, []);

  useFocusEffect(useCallback(() => {
    void refresh();
    // Water/weight logged by the voice device land server-side; pull, then redraw.
    void pullRemoteBody().then(found => { if (found) void refresh(); });
    void loadBodyData().then(d => {
      if (d.appleHealthConnected) void refreshAppleHealthIfConnected().then(u => { if (u) void refresh(); });
    });
    // A set logged from the chat overlay never refocuses this tab.
    return onWrite(e => { if (e === 'workout' || e === 'meal' || e === 'water' || e === 'weight') void refresh(); });
  }, [refresh]));
  useRevalidate(() => { void refresh(); });

  /** A day was changed: redraw, and let the twin recompute muscles, targets and the plan. */
  const changed = useCallback(() => {
    void refresh();
    void loadToday().catch(() => {});
  }, [refresh]);

  async function markBlanks(days: string[]) {
    void Haptics.notificationAsync(Haptics.NotificationFeedbackType.Success);
    for (const d of days) await setMissed(d, true);
    changed();
  }

  async function changeRoutine(r: Routine) {
    setCoach(c => (c ? { ...c, routine: r } : c));
    await saveRoutine(r);
    changed();
  }

  const square = Math.floor((width - 32 - 10) / 2);
  const todayCoach = coach?.today;
  const todayIdx = (new Date().getDay() + 6) % 7;
  const openLog = () => router.push({ pathname: '/workouts', params: todayCoach ? { focus: todayCoach.focus } : {} });
  const pick = marks.find(m => m.date === selected);
  const blanks = blankDays(marks, today);
  const shownMonth = MONTHS[Number(selected.slice(5, 7)) - 1];

  return (
    <SafeAreaView style={styles.container} edges={['top']}>
      <ScrollView showsVerticalScrollIndicator={false} contentContainerStyle={styles.scroll} keyboardShouldPersistTaps="handled">

        <View style={styles.header}>
          <View>
            <Text style={styles.subtitle}>BUILD YOUR CHARACTER</Text>
            <Text style={styles.title}>TRAIN</Text>
          </View>
          <Pressable onPress={() => router.push('/(tabs)/progress')} style={({ pressed }) => [styles.headIcon, pressed && { backgroundColor: C.raised }]} accessibilityLabel="Progress">
            <MaterialCommunityIcons name="chart-bar" size={19} color={C.ink} />
          </Pressable>
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
            size={square} light index="02" eyebrow={todayCoach?.scheduled && !todayCoach.done ? 'TODAY' : 'LOG'} title="WORKOUT"
            sub={todayCoach ? `${todayCoach.title}${todayCoach.when !== 'TODAY' ? ` · ${todayCoach.when}` : ''}` : 'LOG A SESSION'}
            live={!!todayCoach?.scheduled && !todayCoach.done}
            onPress={() => router.push('/workout-select')}
          >
            <WeekDots counts={week.sets} todayIdx={todayIdx} w={square - 40} h={square * 0.42} />
          </ActionSquare>
        </View>

        {/* ── Calendar ───────────────────────────────────── */}
        <View style={styles.calHead}>
          <Text style={styles.calMonth}>{shownMonth}</Text>
          <View style={styles.legend}>
            <View style={[styles.legBar, { backgroundColor: C.hot }]} /><Text style={styles.legText}>LIFT</Text>
            <View style={[styles.legBar, { backgroundColor: C.live }]} /><Text style={styles.legText}>RUN</Text>
            <View style={styles.legRing} /><Text style={styles.legText}>PLAN</Text>
          </View>
          {selected !== today && (
            <Pressable onPress={() => { void Haptics.selectionAsync(); setSelected(today); }} hitSlop={8} style={styles.todayKey}>
              <Text style={styles.todayKeyText}>TODAY</Text>
            </Pressable>
          )}
        </View>
        {marks.length > 0 && <DayStrip marks={marks} today={today} selected={selected} onSelect={setSelected} />}

        {blanks.length > 0 && (
          <Pressable onPress={() => void markBlanks(blanks)} style={({ pressed }) => [styles.blanks, pressed && { opacity: 0.8 }]}>
            <Text style={styles.blanksText}>
              {`${blanks.length} ${blanks.length === 1 ? 'DAY' : 'DAYS'} WITH NOTHING LOGGED · MARK ${blanks.length === 1 ? 'IT' : 'THEM'} MISSED`}
            </Text>
            <MaterialCommunityIcons name="chevron-right" size={16} color={C.dim} />
          </Pressable>
        )}

        {pick && (
          <DayPanel
            date={selected} today={today} missed={pick.missed} plan={pick.plan} sessions={dial}
            onChanged={changed} onStart={openLog}
          />
        )}

        {/* ── Everything else, one row of links ──────────── */}
        <View style={styles.links}>
          {([
            { label: 'ROUTINE', icon: 'calendar-sync-outline', on: routineOpen, go: () => setRoutineOpen(o => !o) },
            { label: 'PBS', icon: 'trophy-outline', go: () => router.push('/pbs') },
            { label: 'STRENGTH', icon: 'arm-flex-outline', go: () => router.push('/strength') },
            { label: 'STEPS', icon: 'shoe-print', go: () => router.push('/steps') },
          ] as const).map(l => (
            <Pressable key={l.label} onPress={() => { void Haptics.selectionAsync(); l.go(); }}
              style={({ pressed }) => [styles.link, 'on' in l && l.on && styles.linkOn, pressed && { opacity: 0.8 }]}>
              <MaterialCommunityIcons name={l.icon} size={18} color={'on' in l && l.on ? C.onHot : C.ink} />
              <Text style={[styles.linkText, 'on' in l && l.on && { color: C.onHot }]}>{l.label}</Text>
            </Pressable>
          ))}
        </View>
        {routineOpen && (
          <View style={{ marginTop: 10 }}>
            <RoutineCard routine={coach?.routine ?? null} todayIdx={todayIdx} doneIdx={[]} onChange={changeRoutine} />
          </View>
        )}

        {/* ── History: the latest training day and what it worked ── */}
        <Pressable onPress={() => router.push('/history')} style={({ pressed }) => [styles.history, pressed && { backgroundColor: C.raised }]} accessibilityLabel="History">
          <Corners size={10} color={lastDay ? C.alert : C.lineHi} />
          <View style={{ flex: 1, gap: 4 }}>
            <Text style={styles.histLabel}>HISTORY  ›</Text>
            <Text style={styles.histTitle} numberOfLines={2}>{lastDay ? lastDay.title : 'NOTHING YET'}</Text>
            <Text style={styles.histSub}>{lastDay ? `${dayName(lastDay.date)} ${shortDate(lastDay.date)} · ${lastDay.lifts.length} LIFTS` : 'YOUR TRAINING DAYS SHOW UP HERE'}</Text>
            {lastDay && (
              <Text style={styles.histLifts} numberOfLines={3}>{lastDay.lifts.map(l => l.name).join(' · ')}</Text>
            )}
          </View>
          <BodyMini load={lastDay?.load ?? {}} height={104} />
        </Pressable>
      </ScrollView>
    </SafeAreaView>
  );
}

const styles = StyleSheet.create({
  container: { flex: 1, backgroundColor: C.bg },
  scroll: { paddingBottom: 40 },

  header: { flexDirection: 'row', alignItems: 'flex-end', justifyContent: 'space-between', paddingHorizontal: 20, paddingTop: 8, paddingBottom: 14 },
  title: { fontFamily: F.dot, fontSize: 40, color: C.ink, letterSpacing: 2, marginTop: 2 },
  subtitle: { fontFamily: F.dot, fontSize: 10, color: C.dim, letterSpacing: 3 },
  headIcon: { width: TAP, height: TAP, borderWidth: 1, borderColor: C.lineHi, alignItems: 'center', justifyContent: 'center' },

  squares: { flexDirection: 'row', gap: 10, marginHorizontal: 16, marginBottom: 18 },

  calHead: { flexDirection: 'row', alignItems: 'center', gap: 12, paddingHorizontal: 20, marginBottom: 10 },
  calMonth: { fontFamily: F.dot, fontSize: 11, color: C.ink, letterSpacing: 3 },
  legend: { flex: 1, flexDirection: 'row', alignItems: 'center', gap: 5 },
  legBar: { width: 9, height: 4 },
  legRing: { width: 8, height: 8, borderWidth: 1.2, borderColor: C.dim },
  legText: { fontFamily: F.dot, fontSize: 7, color: C.faint, letterSpacing: 1, marginRight: 6 },
  todayKey: { minHeight: 30, paddingHorizontal: 12, borderWidth: 1, borderColor: C.lineHi, alignItems: 'center', justifyContent: 'center' },
  todayKeyText: { fontFamily: F.dot, fontSize: 9, color: C.ink, letterSpacing: 1.5 },

  blanks: { flexDirection: 'row', alignItems: 'center', gap: 8, marginHorizontal: 16, marginTop: 10, minHeight: TAP, paddingHorizontal: 14, borderWidth: 1, borderStyle: 'dashed', borderColor: C.lineHi },
  blanksText: { flex: 1, fontFamily: F.dot, fontSize: 9, color: C.dim, letterSpacing: 1.2 },

  links: { flexDirection: 'row', gap: 6, marginHorizontal: 16, marginTop: 14 },
  link: { flex: 1, minHeight: 58, alignItems: 'center', justifyContent: 'center', gap: 5, borderWidth: 1, borderColor: C.line, backgroundColor: C.surface },
  linkOn: { backgroundColor: C.hot, borderColor: C.hot },
  linkText: { fontFamily: F.dot, fontSize: 7, color: C.ink, letterSpacing: 1 },

  history: { flexDirection: 'row', alignItems: 'flex-end', gap: 10, marginHorizontal: 16, marginTop: 14, padding: 14, backgroundColor: C.surface },
  histLabel: { fontFamily: F.dot, fontSize: 9, color: C.dim, letterSpacing: 2 },
  histTitle: { fontFamily: F.dot, fontSize: 18, color: C.ink, letterSpacing: 1 },
  histSub: { fontFamily: F.dot, fontSize: 9, color: C.dim, letterSpacing: 1 },
  histLifts: { fontFamily: F.mono, fontSize: 11, color: C.faint, marginTop: 4, lineHeight: 15 },
});
