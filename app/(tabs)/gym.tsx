// ─────────────────────────────────────────────────────────────────────────
// TRAIN — today's session, the week plan and strength. Every number is read
// from lib/body-data.ts / lib/workout-data.ts (local AsyncStorage stores).
// Water, weight, sleep and Apple Health live on BODY's vitals grid.
// ─────────────────────────────────────────────────────────────────────────

import { useState, useCallback, useEffect } from 'react';
import { View, Text, ScrollView, StyleSheet, TouchableOpacity } from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';
import { useFocusEffect, useRouter } from 'expo-router';
import { MaterialCommunityIcons } from '@expo/vector-icons';
import * as Haptics from 'expo-haptics';

import {
  loadBodyData, pullRemoteBody, todaySteps, refreshAppleHealthIfConnected,
  type BodyData,
} from '@/lib/body-data';
import {
  ensureSeeded,
  getBodyWorkoutPreview,
  getGymPlan, setGymPlanDay, WEEKDAYS,
  type BodyWorkoutPreview,
  type BodyMovement,
  type GymPlan, type PlanDayValue,
} from '@/lib/workout-data';
import { useUnitPreference, formatWeightWithUnit } from '@/lib/unit-preference';

import { C, F } from '@/lib/theme';
// ── Design tokens (match the rest of the app) ──────────────────────────────
const ORANGE = C.hot;
const FAINT    = C.faint;

/** Same face as Today tab date wheel numbers (wheelNum). */
const NUM_FONT = F.mono;

const MOVEMENTS: BodyMovement[] = ['push', 'pull', 'legs', 'upper', 'lower'];

// ── Helpers ──────────────────────────────────────────────────────────────────
function formatBig(n: number): string {
  if (n >= 1_000_000) return `${(n / 1_000_000).toFixed(1)}M`;
  if (n >= 1_000)     return n.toLocaleString();
  return String(n);
}

export default function BodyScreen() {
  const router = useRouter();
  const { unitSystem } = useUnitPreference();
  const [data, setData] = useState<BodyData | null>(null);
  const [activeMovement, setActiveMovement] = useState<BodyMovement>('pull');
  const [workoutPreview, setWorkoutPreview] = useState<BodyWorkoutPreview | null>(null);
  const [gymPlan, setGymPlanState] = useState<GymPlan | null>(null);
  const refreshWorkoutPreview = useCallback(async (movement: BodyMovement) => {
    await ensureSeeded();
    setWorkoutPreview(await getBodyWorkoutPreview(movement));
  }, []);

  useFocusEffect(useCallback(() => {
    // Water/weight logged by the voice device land server-side, and this layer
    // is local-first + push-only -- pull first or they never appear here.
    // Fire-and-forget: the local render below must not wait on the network.
    void pullRemoteBody().then(found => { if (found) loadBodyData().then(setData); });
    loadBodyData().then(d => {
      const movement = d.activeMovement as BodyMovement;
      setData(d);
      setActiveMovement(movement);
      void refreshWorkoutPreview(movement);
      if (d.appleHealthConnected) {
        void refreshAppleHealthIfConnected().then(updated => {
          if (updated) setData(updated);
        });
      }
    });
    ensureSeeded();
    getGymPlan().then(setGymPlanState);
  }, [refreshWorkoutPreview]));

  // Tapping a planner day cycles through push -> pull -> legs -> upper ->
  // lower -> rest -> cheat -> (cleared), one column per weekday (task 025).
  const PLAN_CYCLE: PlanDayValue[] = ['push', 'pull', 'legs', 'upper', 'lower', 'rest', 'cheat', null];
  async function cyclePlanDay(day: keyof GymPlan) {
    const current = gymPlan?.[day] ?? null;
    const next = PLAN_CYCLE[(PLAN_CYCLE.indexOf(current) + 1) % PLAN_CYCLE.length];
    setGymPlanState(await setGymPlanDay(day, next));
  }

  useEffect(() => {
    void refreshWorkoutPreview(activeMovement);
  }, [activeMovement, refreshWorkoutPreview]);

  if (!data) {
    return <SafeAreaView style={styles.container} edges={['top']} />;
  }

  // Derived display values — all computed from the store, nothing hardcoded.
  const steps     = todaySteps(data);

  const preview = workoutPreview;

  function openWorkoutDetail(exerciseId?: string) {
    if (preview?.templateId) {
      router.push({ pathname: '/workout-detail', params: { templateId: preview.templateId, ...(exerciseId ? { exerciseId } : {}) } });
      return;
    }
    router.push('/workouts');
  }

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

        {/* ── Record activity + log workout buttons ──────── */}
        <View style={styles.actionRow}>
        <TouchableOpacity
          style={styles.recordBtn}
          activeOpacity={0.85}
          onPress={() => router.push('/(tabs)/activity')}
        >
          <MaterialCommunityIcons name="run" size={16} color={C.onHot} />
          <Text style={styles.logWorkoutText}>RECORD</Text>
        </TouchableOpacity>
        <TouchableOpacity
          style={styles.logWorkoutBtn}
          activeOpacity={0.85}
          onPress={() => router.push('/workouts')}
        >
          <MaterialCommunityIcons name="dumbbell" size={16} color={C.ink} />
          <Text style={[styles.logWorkoutText, { color: C.ink }]}>LOG WORKOUT</Text>
        </TouchableOpacity>
        </View>

        <Text style={[styles.sectionLabel, styles.sectionLabelStandalone]}>SESSION</Text>
        {/* ── Movement filter pills ──────────────────────── */}
        <View style={styles.pillRow}>
          {MOVEMENTS.map(m => (
            <TouchableOpacity
              key={m}
              style={[styles.pill, activeMovement === m && styles.pillActive]}
              onPress={() => {
                setActiveMovement(m);
                Haptics.selectionAsync();
                void refreshWorkoutPreview(m);
              }}
              activeOpacity={0.8}
            >
              <Text style={[styles.pillText, activeMovement === m && styles.pillTextActive]}>
                {m.toUpperCase()}
              </Text>
            </TouchableOpacity>
          ))}
        </View>

        {/* ── Active workout (exercise list) ─────────────── */}
        <View style={styles.workoutCard}>
          <View style={styles.workoutHeader}>
            <Text style={styles.workoutTitle}>{preview?.templateName ?? 'NO TEMPLATE'}</Text>
            <TouchableOpacity onPress={() => openWorkoutDetail()} activeOpacity={0.8}>
              <Text style={styles.viewLinkText}>VIEW LOG ›</Text>
            </TouchableOpacity>
          </View>

          {preview && preview.totalCount > 0 ? (
            <>
              <Text style={styles.exerciseCount}>{preview.totalCount} EXERCISES</Text>
              {preview.previewExercises.map((ex, idx) => {
                const atOrAbovePb = ex.pbMaxKg != null && ex.weightKg >= ex.pbMaxKg;
                return (
                  <TouchableOpacity
                    key={ex.id}
                    style={[styles.exerciseRow, idx > 0 && styles.exerciseRowBorder]}
                    activeOpacity={0.85}
                    onPress={() => openWorkoutDetail(ex.id)}
                  >
                    <MaterialCommunityIcons name={ex.icon as any} size={26} color={C.ink} style={styles.exerciseIcon} />
                    <Text style={styles.exerciseName}>{ex.name}</Text>
                    <View style={styles.exerciseMeta}>
                      <Text style={[styles.setText, atOrAbovePb && styles.setTextPb]}>
                        {formatWeightWithUnit(ex.weightKg, unitSystem)} × {ex.reps}
                      </Text>
                      {ex.pbDeltaKg != null && ex.pbDeltaKg > 0 ? (
                        <View style={styles.pbBadge}>
                          <Text style={styles.pbBadgeText}>
                            PB +{formatWeightWithUnit(ex.pbDeltaKg, unitSystem)}
                          </Text>
                        </View>
                      ) : ex.pbMaxKg != null ? (
                        <Text style={styles.pbMetaText}>
                          PB {formatWeightWithUnit(ex.pbMaxKg, unitSystem)}
                        </Text>
                      ) : null}
                    </View>
                    <MaterialCommunityIcons name="chevron-right" size={18} color={C.dim} />
                  </TouchableOpacity>
                );
              })}
              {preview.extraCount > 0 && (
                <TouchableOpacity style={styles.moreRow} activeOpacity={0.85} onPress={() => openWorkoutDetail()}>
                  <Text style={styles.moreText}>
                    + {preview.extraCount} MORE EXERCISE{preview.extraCount === 1 ? '' : 'S'}
                  </Text>
                </TouchableOpacity>
              )}
            </>
          ) : (
            <TouchableOpacity activeOpacity={0.85} onPress={() => openWorkoutDetail()}>
              <Text style={styles.emptyTemplate}>
                {preview?.templateId
                  ? 'No exercises yet — tap to build this workout.'
                  : `No ${activeMovement.toUpperCase()} workout yet — tap to create one.`}
              </Text>
            </TouchableOpacity>
          )}
        </View>

        {/* ── PPL day planner (task 025) — tap a day to cycle push/pull/legs/upper/lower/rest/cheat ── */}
        <Text style={[styles.sectionLabel, styles.sectionLabelStandalone]}>WEEK PLAN</Text>
        <View style={styles.plannerRow}>
          {WEEKDAYS.map(day => {
            const value = gymPlan?.[day] ?? null;
            const isRest = value === 'rest';
            const isCheat = value === 'cheat';
            return (
              <TouchableOpacity key={day} style={styles.plannerCol} onPress={() => cyclePlanDay(day)}>
                <Text style={styles.plannerDayLabel}>{day.slice(0, 3).toUpperCase()}</Text>
                <View style={[
                  styles.plannerChip,
                  value && !isRest && !isCheat && styles.plannerChipActive,
                  isRest && styles.plannerChipRest,
                  isCheat && styles.plannerChipCheat,
                ]}>
                  <Text style={[styles.plannerChipText, value && styles.plannerChipTextActive]}>
                    {value ? (isRest ? 'REST' : isCheat ? 'CHEAT' : value.slice(0, 4).toUpperCase()) : '—'}
                  </Text>
                </View>
              </TouchableOpacity>
            );
          })}
        </View>

        {/* ── Totals: one tappable line (steps opens the steps screen) ── */}
        <TouchableOpacity style={styles.statsLine} activeOpacity={0.7} onPress={() => router.push('/steps')}>
          <Text style={styles.statsText} numberOfLines={1}>
            <Text style={styles.statsVal}>{data.workoutsTotal}</Text> WORKOUTS   <Text style={styles.statsVal}>{data.streak}</Text> DAY STREAK   <Text style={styles.statsVal}>{formatBig(steps)}</Text> STEPS
          </Text>
          <MaterialCommunityIcons name="chevron-right" size={16} color={C.dim} />
        </TouchableOpacity>

        {/* ── Strength (compact — full detail lives on /strength) ── */}
        <View style={styles.strengthHeader}>
          <Text style={styles.sectionLabel}>STRENGTH</Text>
          <TouchableOpacity onPress={() => router.push('/strength')}>
            <Text style={styles.viewLinkText}>VIEW DETAILS ›</Text>
          </TouchableOpacity>
        </View>
        <View style={styles.cardRow}>
          <TouchableOpacity style={styles.metricCard} activeOpacity={0.85} onPress={() => router.push('/strength')}>
            <MaterialCommunityIcons name="dumbbell" size={22} color={C.ink} />
            <Text style={styles.metricLabel}>TOP LIFT</Text>
            {data.headlineLifts.length > 0 ? (
              <>
                <Text style={styles.metricValue}>{data.headlineLifts[0].topSetKg}KG</Text>
                <Text style={styles.metricSub}>{data.headlineLifts[0].name}</Text>
              </>
            ) : (
              <Text style={styles.metricValue}>—</Text>
            )}
          </TouchableOpacity>

          <TouchableOpacity style={styles.metricCard} activeOpacity={0.85} onPress={() => router.push('/strength')}>
            <MaterialCommunityIcons name="trending-up" size={22} color={C.ink} />
            <Text style={styles.metricLabel}>STRENGTH</Text>
            {data.strengthTrend ? (
              <Text style={[styles.metricValue, { color: C.hot }]}>
                {data.strengthTrend.pct >= 0 ? '+' : ''}{data.strengthTrend.pct}%
              </Text>
            ) : (
              <Text style={styles.metricValue}>—</Text>
            )}
            <Text style={styles.metricSubTiny}>vs 90d ago</Text>
          </TouchableOpacity>
        </View>

      </ScrollView>

    </SafeAreaView>
  );
}

const styles = StyleSheet.create({
  container: { flex: 1, backgroundColor: C.surface },
  scroll: { paddingBottom: 48 },

  // Header
  header: { flexDirection: 'row', alignItems: 'flex-end', justifyContent: 'space-between', paddingHorizontal: 20, paddingTop: 8, paddingBottom: 16 },
  titleBlock: {},
  title: { fontFamily: F.dot, fontSize: 40, color: C.ink, letterSpacing: 2, marginTop: 2 },
  subtitle: { fontFamily: F.dot, fontSize: 10, color: C.dim, letterSpacing: 3 },
  headIcon: { width: 40, height: 40, borderRadius: 20, borderWidth: 1, borderColor: C.lineHi, alignItems: 'center', justifyContent: 'center', marginBottom: 4 },

  // Stats bar
  actionRow: { flexDirection: 'row', gap: 8, marginHorizontal: 16, marginTop: 2, marginBottom: 18 },
  recordBtn: { flex: 1, flexDirection: 'row', alignItems: 'center', justifyContent: 'center', gap: 8, backgroundColor: C.hot, borderRadius: 999, minHeight: 46 },
  logWorkoutBtn: { flex: 1, flexDirection: 'row', alignItems: 'center', justifyContent: 'center', gap: 8, borderWidth: 1, borderColor: C.lineHi, borderRadius: 999, minHeight: 46 },
  statsLine: { flexDirection: 'row', alignItems: 'center', marginHorizontal: 16, marginBottom: 18, paddingHorizontal: 14, minHeight: 46, borderWidth: 1, borderColor: C.line, borderRadius: 16, backgroundColor: C.bg },
  statsText: { flex: 1, fontFamily: F.dot, fontSize: 9, color: C.dim, letterSpacing: 1.5 },
  statsVal: { fontSize: 14, color: C.ink },
  logWorkoutText: { fontFamily: F.dot, fontSize: 11, color: C.onHot, letterSpacing: 2 },

  sectionLabel: { fontFamily: F.dot, fontSize: 11, color: C.dim, letterSpacing: 3 },
  sectionLabelStandalone: { paddingHorizontal: 20, marginBottom: 8 },

  plannerRow: { flexDirection: 'row', paddingHorizontal: 20, marginBottom: 18, gap: 4 },
  plannerCol: { flex: 1, alignItems: 'center', gap: 4 },
  plannerDayLabel: { fontFamily: F.dot, fontSize: 9, color: C.dim, letterSpacing: 1 },
  plannerChip: {
    width: '100%', minHeight: 40, justifyContent: 'center', borderRadius: 10, borderWidth: 1, borderColor: C.line,
    alignItems: 'center', backgroundColor: C.surface,
  },
  plannerChipActive: { backgroundColor: ORANGE, borderColor: C.hot },
  plannerChipRest: { backgroundColor: FAINT, borderColor: C.line },
  plannerChipCheat: { backgroundColor: C.signal, borderColor: C.signal },
  plannerChipText: { fontFamily: F.dot, fontSize: 9, color: C.dim, letterSpacing: 0.5 },
  plannerChipTextActive: { color: C.onHot },


  viewLinkText: { fontFamily: F.dot, fontSize: 10, color: C.ink, letterSpacing: 1.5, paddingVertical: 12, paddingLeft: 12 },


  // Pills
  pillRow: { flexDirection: 'row', paddingHorizontal: 16, gap: 6, marginBottom: 16 },
  pill: { flex: 1, borderWidth: 1, borderColor: C.line, borderRadius: 999, minHeight: 40, justifyContent: 'center', alignItems: 'center', backgroundColor: C.surface },
  pillActive: { backgroundColor: ORANGE, borderColor: C.hot },
  pillText: { fontFamily: F.dot, fontSize: 10, color: C.dim, letterSpacing: 1 },
  pillTextActive: { color: C.onHot },

  // Workout card
  workoutCard: { marginHorizontal: 16, marginBottom: 20, backgroundColor: C.bg, borderRadius: 16, borderWidth: 1, borderColor: C.line, paddingHorizontal: 14, paddingBottom: 6 },
  workoutHeader: { flexDirection: 'row', justifyContent: 'space-between', alignItems: 'center' },
  workoutTitle: { fontFamily: F.dot, fontSize: 15, color: C.hot, letterSpacing: 1 },
  exerciseCount: { fontFamily: F.dot, fontSize: 9, color: C.dim, marginTop: -6, marginBottom: 4, letterSpacing: 1.5 },
  exerciseRow: { flexDirection: 'row', alignItems: 'center', paddingVertical: 12 },
  exerciseRowBorder: { borderTopWidth: 1, borderTopColor: C.line },
  exerciseIcon: { marginRight: 12, width: 30 },
  exerciseName: { fontFamily: F.mono, fontSize: 13, color: C.ink, flex: 1 },
  exerciseMeta: { marginRight: 10, alignItems: 'flex-end', gap: 4 },
  setText: { fontFamily: F.mono, fontSize: 12, color: C.ink, lineHeight: 15, textAlign: 'right' },
  setTextPb: { color: ORANGE },
  pbMetaText: { fontFamily: F.mono, fontSize: 9, color: C.dim, textAlign: 'right', letterSpacing: 0.5 },
  pbBadge: { backgroundColor: ORANGE, borderRadius: 4, paddingHorizontal: 6, paddingVertical: 3, alignSelf: 'flex-end' },
  pbBadgeText: { fontFamily: F.mono, fontSize: 9, color: C.onHot },
  moreRow: { borderTopWidth: 1, borderTopColor: C.line, minHeight: 44, justifyContent: 'center', alignItems: 'center' },
  moreText: { fontFamily: F.dot, fontSize: 10, color: C.ink, letterSpacing: 1.5 },
  emptyTemplate: { fontFamily: F.mono, fontSize: 12, color: C.dim, marginTop: 4, marginBottom: 10, lineHeight: 17 },

  // Strength + metric cards
  strengthHeader: { flexDirection: 'row', justifyContent: 'space-between', alignItems: 'center', paddingLeft: 20, paddingRight: 16 },
  cardRow: { flexDirection: 'row', paddingHorizontal: 16, gap: 8, marginBottom: 16 },

  metricCard: { flex: 1, backgroundColor: C.bg, borderRadius: 16, borderWidth: 1, borderColor: C.line, padding: 12, gap: 4 },
  metricLabel: { fontFamily: F.dot, fontSize: 9, color: C.dim, letterSpacing: 1.5, marginTop: 4 },
  metricValue: { fontFamily: F.num, fontSize: 20, color: C.ink },
  metricSub: { fontFamily: F.mono, fontSize: 11, color: C.dim },
  metricSubTiny: { fontFamily: F.mono, fontSize: 11, color: C.dim },


  empty: { fontFamily: F.mono, fontSize: 12, color: C.dim, paddingVertical: 12 },
  liftCard: { flex: 1, backgroundColor: C.surface, borderRadius: 10, borderWidth: 1, borderColor: C.line, padding: 10 },
  liftName: { fontFamily: F.mono, fontSize: 8, color: C.dim, marginTop: 6, letterSpacing: 1 },
  liftValue: { fontFamily: NUM_FONT, fontSize: 20, color: C.hot, marginTop: 4 },
  liftUnit: { fontFamily: F.mono, fontSize: 11 },
  lift1rm: { fontFamily: F.mono, fontSize: 8, color: C.dim, marginBottom: 6 },
  liftDelta: { fontFamily: F.mono, fontSize: 8, color: C.dim, marginTop: 6 },
});
