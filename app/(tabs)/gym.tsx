// ─────────────────────────────────────────────────────────────────────────
// BODY PAGE — the fitness overview dashboard.
// Visuals match the design mock; every number is read from lib/body-data.ts
// (a local AsyncStorage store). Water + weight are fully interactive.
// ─────────────────────────────────────────────────────────────────────────

import { useState, useCallback, useEffect } from 'react';
import {
  View, Text, ScrollView, StyleSheet, TouchableOpacity,
  Modal, Pressable, TextInput, KeyboardAvoidingView, Platform, Alert, ActivityIndicator,
} from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';
import { useFocusEffect, useRouter } from 'expo-router';
import { MaterialCommunityIcons } from '@expo/vector-icons';
import * as Haptics from 'expo-haptics';
import Svg, { Polyline, Circle } from 'react-native-svg';

import {
  loadBodyData, addWater, logWeight,
  todaySteps, todayWaterMl, latestWeight, weightHistory,
  buildDayGrid, stepsSquareState, trainingDayType,
  goalStatus, formatSleep, refreshAppleHealthIfConnected,
  type BodyData,
} from '@/lib/body-data';
import {
  connectAndSyncAppleHealth,
  isAppleHealthSupported,
} from '@/lib/apple-health';
import {
  ensureSeeded,
  getBodyWorkoutPreview,
  type BodyWorkoutPreview,
  type BodyMovement,
} from '@/lib/workout-data';
import { useUnitPreference, formatWeightWithUnit } from '@/lib/unit-preference';

// ── Design tokens (match the rest of the app) ──────────────────────────────
const ORANGE = '#FF4D00';
const INK     = '#1A1714';
const MUTED   = '#8C857B';
const FAINT    = '#C7C1B8';
const BORDER   = '#E5E1DA';
const CARD     = '#FCFBF9';
const GREEN    = '#4CAF50';

/** Same face as Today tab date wheel numbers (wheelNum). */
const NUM_FONT = 'PixeloidSans_400Regular';

const MOVEMENTS: BodyMovement[] = ['push', 'pull', 'legs', 'upper', 'lower'];

// ── Small line chart used for every sparkline / strength graph ──────────────
function Spark({
  points, width = 72, height = 26, color = ORANGE, dots = false,
}: { points: number[]; width?: number; height?: number; color?: string; dots?: boolean }) {
  if (points.length < 2) return <View style={{ width, height }} />;
  const min = Math.min(...points);
  const max = Math.max(...points);
  const range = max - min || 1;
  const stepX = width / (points.length - 1);
  const coords = points.map((p, i) => ({
    x: i * stepX,
    // When every point is equal (a flat series), draw a centred horizontal line.
    y: max === min ? height / 2 : height - 2 - ((p - min) / range) * (height - 4),
  }));
  return (
    <Svg width={width} height={height}>
      <Polyline
        points={coords.map(c => `${c.x},${c.y}`).join(' ')}
        fill="none"
        stroke={color}
        strokeWidth={1.6}
      />
      {dots && coords.map((c, i) => (
        <Circle key={i} cx={c.x} cy={c.y} r={1.9} fill={color} />
      ))}
    </Svg>
  );
}

// ── One heatmap square ──────────────────────────────────────────────────────
type SquareKind = 'hit' | 'partial' | 'missed' | 'empty' | 'trained' | 'rest' | 'cheat';

const SQ = 13;
const DITHER_TILES = 4;

function HeatSquare({ kind }: { kind: SquareKind }) {
  if (kind === 'empty') return <View style={[hs.sq, hs.invisible]} />;
  if (kind === 'hit' || kind === 'trained') return <View style={[hs.sq, hs.solid]} />;
  if (kind === 'partial' || kind === 'rest') return <View style={[hs.sq, hs.dotted]} />;
  if (kind === 'cheat') {
    const tile = SQ / DITHER_TILES;
    return (
      <View style={[hs.sq, { flexDirection: 'row', flexWrap: 'wrap', overflow: 'hidden' }]}>
        {Array.from({ length: DITHER_TILES * DITHER_TILES }).map((_, i) => {
          const row = Math.floor(i / DITHER_TILES);
          const col = i % DITHER_TILES;
          const on = (row + col) % 2 === 0;
          return (
            <View
              key={i}
              style={{
                width: tile,
                height: tile,
                backgroundColor: on ? ORANGE : '#FCFBF9',
              }}
            />
          );
        })}
      </View>
    );
  }
  return <View style={[hs.sq, hs.missed]} />;
}

function Heatmap({
  weeks,
  getKind,
}: {
  weeks: number;
  getKind: (d: Date | null) => SquareKind;
}) {
  const grid = buildDayGrid(weeks);
  const headerDates = grid[grid.length - 1] ?? [];

  return (
    <View>
      <View style={hm.headerRow}>
        {headerDates.map((day, i) => (
          <Text key={i} style={hm.headerDate}>
            {day ? String(day.getDate()) : ''}
          </Text>
        ))}
      </View>
      {grid.map((row, r) => (
        <View key={r} style={hm.row}>
          {row.map((day, c) => (
            <HeatSquare key={c} kind={getKind(day)} />
          ))}
        </View>
      ))}
    </View>
  );
}

function Legend({ items }: { items: { kind: SquareKind; label: string }[] }) {
  return (
    <View style={hm.legend}>
      {items.map(it => (
        <View key={it.label} style={hm.legendItem}>
          <HeatSquare kind={it.kind} />
          <Text style={hm.legendText}>{it.label}</Text>
        </View>
      ))}
    </View>
  );
}

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
  const [waterOpen, setWaterOpen]   = useState(false);
  const [weightOpen, setWeightOpen] = useState(false);
  const [weightInput, setWeightInput] = useState('');
  const [healthSyncing, setHealthSyncing] = useState(false);
  const refreshWorkoutPreview = useCallback(async (movement: BodyMovement) => {
    await ensureSeeded();
    setWorkoutPreview(await getBodyWorkoutPreview(movement));
  }, []);

  useFocusEffect(useCallback(() => {
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
  }, [refreshWorkoutPreview]));

  useEffect(() => {
    void refreshWorkoutPreview(activeMovement);
  }, [activeMovement, refreshWorkoutPreview]);

  if (!data) {
    return <SafeAreaView style={styles.container} edges={['top']} />;
  }

  // Derived display values — all computed from the store, nothing hardcoded.
  const steps     = todaySteps(data);
  const stepsPct  = Math.min(1, steps / data.stepsGoal);
  const waterMl   = todayWaterMl(data);
  const waterPct  = waterMl / data.waterGoalMl;
  const weight    = latestWeight(data);
  const proteinPct = data.proteinTodayG / data.proteinGoalG;
  const sleepPct   = data.sleepMins / (8 * 60);

  const preview = workoutPreview;

  function openWorkoutDetail() {
    if (preview?.templateId) {
      router.push({ pathname: '/workout-detail', params: { templateId: preview.templateId } });
      return;
    }
    router.push('/workouts');
  }

  // Progress-bar squares (≈84% filled at 16,842 / 20,000).
  const BAR_SQUARES = 16;
  const filledSquares = Math.round(stepsPct * BAR_SQUARES);

  async function quickWater(ml: number) {
    Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Light);
    const d = await addWater(ml);
    setData({ ...d });
  }

  async function handleAppleHealth() {
    if (healthSyncing) return;
    setHealthSyncing(true);
    Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Light);
    const result = await connectAndSyncAppleHealth(56);
    setHealthSyncing(false);
    if (result.ok && result.data) {
      setData(result.data);
      Haptics.notificationAsync(Haptics.NotificationFeedbackType.Success);
      return;
    }
    Alert.alert(
      'Apple Health',
      result.error ?? 'Could not connect to Apple Health.',
    );
  }

  async function saveWeight() {
    const kg = parseFloat(weightInput);
    if (!kg || kg <= 0) return;
    Haptics.notificationAsync(Haptics.NotificationFeedbackType.Success);
    const d = await logWeight(kg);
    setData({ ...d });
    setWeightInput('');
    setWeightOpen(false);
  }

  return (
    <SafeAreaView style={styles.container} edges={['top']}>
      <ScrollView showsVerticalScrollIndicator={false} contentContainerStyle={styles.scroll}>

        {/* ── Header ─────────────────────────────────────── */}
        <View style={styles.header}>
          <View style={styles.titleBlock}>
            <View style={styles.titleWrap}>
              <View style={[styles.corner, styles.cornerTL]} />
              <Text style={styles.title}>BODY</Text>
              <View style={[styles.corner, styles.cornerBR]} />
            </View>
            <Text style={styles.subtitle}>BUILD YOUR CHARACTER</Text>
          </View>
          <View style={styles.headerIcons}>
            <MaterialCommunityIcons name="information-outline" size={18} color={MUTED} />
            <MaterialCommunityIcons name="chart-bar" size={18} color={MUTED} />
            <MaterialCommunityIcons name="dots-horizontal" size={18} color={MUTED} />
          </View>
        </View>

        {/* ── Log workout button ─────────────────────────── */}
        <TouchableOpacity
          style={styles.logWorkoutBtn}
          activeOpacity={0.85}
          onPress={() => router.push('/workouts')}
        >
          <MaterialCommunityIcons name="dumbbell" size={16} color="#FFFFFF" />
          <Text style={styles.logWorkoutText}>LOG WORKOUT</Text>
          <MaterialCommunityIcons name="chevron-right" size={16} color="#FFFFFF" />
        </TouchableOpacity>

        {/* ── Global stats bar ───────────────────────────── */}
        <View style={styles.statsBar}>
          <Stat label="WORKOUTS" value={String(data.workoutsTotal)} sub="TOTAL" />
          <View style={styles.statDivider} />
          <Stat label="STEPS" value={formatBig(data.stepsThisYear)} sub="THIS YEAR" />
          <View style={styles.statDivider} />
          <Stat label="STREAK" value={String(data.streak)} sub="DAYS" />
        </View>

        {/* ── Today's steps + heatmap ────────────────────── */}
        <View style={styles.sectionRow}>
          <View style={styles.stepsLeft}>
            <TouchableOpacity activeOpacity={0.7} onPress={() => router.push('/steps')}>
              <Text style={styles.sectionLabel}>TODAY'S STEPS</Text>
              <Text style={styles.bigNumber}>{steps.toLocaleString()}</Text>
            </TouchableOpacity>
            {data.appleHealthConnected && data.activityToday && data.activityToday.distanceM > 0 && (
              <Text style={styles.walkDistance}>
                {(data.activityToday.distanceM / 1000).toFixed(2)} KM WALKED TODAY
              </Text>
            )}
            <View style={styles.goalRow}>
              <Text style={styles.goalText}>GOAL: {data.stepsGoal.toLocaleString()} STEPS</Text>
              <Text style={styles.goalPct}>{Math.round(stepsPct * 100)}%</Text>
            </View>
            <View style={styles.progressBar}>
              {Array.from({ length: BAR_SQUARES }).map((_, i) => (
                <View key={i} style={[styles.progressSquare, i < filledSquares && styles.progressSquareFilled]} />
              ))}
            </View>
            {Platform.OS === 'ios' && (
              <TouchableOpacity
                style={styles.healthConnectBtn}
                onPress={handleAppleHealth}
                activeOpacity={0.85}
                disabled={healthSyncing}
              >
                {healthSyncing ? (
                  <ActivityIndicator size="small" color={ORANGE} />
                ) : (
                  <MaterialCommunityIcons name="heart-pulse" size={14} color={ORANGE} />
                )}
                <Text style={styles.healthConnectText}>
                  {data.appleHealthConnected ? 'SYNC APPLE HEALTH' : 'CONNECT APPLE HEALTH'}
                </Text>
              </TouchableOpacity>
            )}
            {Platform.OS === 'ios' && !isAppleHealthSupported() && (
              <Text style={styles.healthHint}>
                Rebuild the iOS app (npx expo run:ios) to enable HealthKit — not available in Expo Go.
              </Text>
            )}
            {data.appleHealthLastSync && (
              <Text style={styles.healthSynced}>
                Last sync {new Date(data.appleHealthLastSync).toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' })}
              </Text>
            )}
          </View>

          <View style={styles.heatRight}>
            <Heatmap weeks={4} getKind={day => stepsSquareState(data, day)} />
            <Legend items={[
              { kind: 'hit', label: 'GOAL HIT' },
              { kind: 'partial', label: 'PARTIAL' },
              { kind: 'missed', label: 'MISSED' },
            ]} />
            <TouchableOpacity style={styles.viewLink} onPress={() => router.push('/steps')}>
              <Text style={styles.viewLinkText}>VIEW STEPS ›</Text>
            </TouchableOpacity>
          </View>
        </View>

        {/* ── Training ───────────────────────────────────── */}
        <Text style={[styles.sectionLabel, styles.sectionLabelStandalone]}>TRAINING</Text>
        <View style={styles.sectionRow}>
          <TouchableOpacity style={styles.nextCard} activeOpacity={0.85}>
            <View style={styles.nextCardRow}>
              <View style={styles.nextCardBody}>
                <Text style={styles.nextLabel}>NEXT SESSION</Text>
                <Text style={styles.nextTitle}>{data.nextSession.name}</Text>
                <View style={styles.nextMeta}>
                  <MaterialCommunityIcons name="calendar-blank-outline" size={12} color={MUTED} />
                  <Text style={styles.nextMetaText}>{data.nextSession.when}</Text>
                </View>
                <View style={styles.nextMeta}>
                  <MaterialCommunityIcons name="clock-outline" size={12} color={MUTED} />
                  <Text style={styles.nextMetaText}>{data.nextSession.time}</Text>
                </View>
              </View>
              <MaterialCommunityIcons name="chevron-right" size={20} color={MUTED} />
            </View>
          </TouchableOpacity>

          <View style={styles.heatRight}>
            <Heatmap weeks={3} getKind={day => trainingDayType(data, day) as SquareKind} />
            <Legend items={[
              { kind: 'trained', label: 'TRAINED' },
              { kind: 'rest', label: 'REST' },
              { kind: 'cheat', label: 'CHEAT' },
              { kind: 'missed', label: 'MISSED' },
            ]} />
          </View>
        </View>

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
            <TouchableOpacity onPress={openWorkoutDetail} activeOpacity={0.8}>
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
                    onPress={openWorkoutDetail}
                  >
                    <MaterialCommunityIcons name={ex.icon as any} size={26} color={INK} style={styles.exerciseIcon} />
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
                    <MaterialCommunityIcons name="chevron-right" size={18} color={MUTED} />
                  </TouchableOpacity>
                );
              })}
              {preview.extraCount > 0 && (
                <TouchableOpacity style={styles.moreRow} activeOpacity={0.85} onPress={openWorkoutDetail}>
                  <Text style={styles.moreText}>
                    + {preview.extraCount} MORE EXERCISE{preview.extraCount === 1 ? '' : 'S'}
                  </Text>
                </TouchableOpacity>
              )}
            </>
          ) : (
            <TouchableOpacity activeOpacity={0.85} onPress={openWorkoutDetail}>
              <Text style={styles.emptyTemplate}>
                {preview?.templateId
                  ? 'No exercises yet — tap to build this workout.'
                  : `No ${activeMovement.toUpperCase()} workout yet — tap to create one.`}
              </Text>
            </TouchableOpacity>
          )}
        </View>

        {/* ── Strength (headline lifts — live from workout engine) ── */}
        <View style={styles.strengthHeader}>
          <Text style={styles.sectionLabel}>STRENGTH</Text>
          <TouchableOpacity onPress={() => router.push('/workouts')}>
            <Text style={styles.viewLinkText}>VIEW WORKOUTS ›</Text>
          </TouchableOpacity>
        </View>
        <View style={styles.cardRow}>
          {data.headlineLifts.map(lift => (
            <View key={lift.name} style={styles.liftCard}>
              <Text style={styles.liftName}>{lift.name}</Text>
              <Text style={styles.liftValue}>{lift.oneRmKg}<Text style={styles.liftUnit}>KG</Text></Text>
              <Text style={styles.lift1rm}>1RM</Text>
              <Spark points={lift.history} dots width={86} height={26} />
              <Text style={styles.liftDelta} numberOfLines={1}>+{lift.deltaKg}KG vs last month</Text>
            </View>
          ))}
        </View>

        {/* ── Body metrics row ───────────────────────────── */}
        <View style={styles.cardRow}>
          <TouchableOpacity style={styles.metricCard} activeOpacity={0.85} onPress={() => setWeightOpen(true)}>
            <MaterialCommunityIcons name="scale-bathroom" size={22} color={INK} />
            <Text style={styles.metricLabel}>WEIGHT</Text>
            <Text style={styles.metricValue}>{weight.toFixed(1)}KG</Text>
            <Spark points={weightHistory(data)} dots width={90} height={24} />
          </TouchableOpacity>

          <View style={styles.metricCard}>
            <MaterialCommunityIcons name="arm-flex" size={22} color={INK} />
            <Text style={styles.metricLabel}>WEAKEST MUSCLE</Text>
            <Text style={styles.metricValue}>{data.weakestMuscle.name}</Text>
            <Text style={styles.metricSub}>{data.weakestMuscle.pct}%</Text>
            <Spark points={[1, 1, 1, 1, 1]} color={FAINT} width={90} height={24} />
            <Text style={styles.metricSubTiny}>vs other muscles</Text>
          </View>

          <View style={styles.metricCard}>
            <MaterialCommunityIcons name="trending-up" size={22} color={INK} />
            <Text style={styles.metricLabel}>STRENGTH</Text>
            <Text style={[styles.metricValue, { color: ORANGE }]}>+{data.strengthTrend.pct}%</Text>
            <Spark points={data.strengthTrend.history} dots width={90} height={24} />
            <Text style={styles.metricSubTiny}>vs last month</Text>
          </View>
        </View>

        {/* ── Recovery ───────────────────────────────────── */}
        <Text style={[styles.sectionLabel, styles.sectionLabelStandalone]}>RECOVERY</Text>
        <View style={styles.recoveryCard}>
          <Recovery icon="moon-waning-crescent" label="SLEEP" value={formatSleep(data.sleepMins)} status={goalStatus(sleepPct)} />
          <View style={styles.statDivider} />
          <TouchableOpacity style={styles.recoveryItem} activeOpacity={0.85} onPress={() => setWaterOpen(true)}>
            <MaterialCommunityIcons name="water" size={22} color={ORANGE} />
            <Text style={styles.recoveryValue}>{(waterMl / 1000).toFixed(1)}L</Text>
            <Text style={styles.recoveryStatus}>{goalStatus(waterPct)}</Text>
          </TouchableOpacity>
          <View style={styles.statDivider} />
          <Recovery icon="shaker-outline" label="PROTEIN" value={`${data.proteinTodayG}G`} status={goalStatus(proteinPct)} />
        </View>

      </ScrollView>

      {/* ── Water bottom sheet ─────────────────────────── */}
      <Modal visible={waterOpen} transparent animationType="fade" onRequestClose={() => setWaterOpen(false)}>
        <Pressable style={styles.backdrop} onPress={() => setWaterOpen(false)}>
          <Pressable style={styles.sheet} onPress={e => e.stopPropagation()}>
            <Text style={styles.sheetLabel}>ADD WATER</Text>
            <Text style={styles.sheetTotal}>{(waterMl / 1000).toFixed(2)}L <Text style={styles.sheetTotalSub}>/ {(data.waterGoalMl / 1000).toFixed(1)}L</Text></Text>
            <View style={styles.waterBtnRow}>
              {[250, 500, 750].map(ml => (
                <TouchableOpacity key={ml} style={styles.waterBtn} onPress={() => quickWater(ml)} activeOpacity={0.8}>
                  <Text style={styles.waterBtnText}>+{ml}</Text>
                  <Text style={styles.waterBtnUnit}>ML</Text>
                </TouchableOpacity>
              ))}
            </View>
            <TouchableOpacity style={styles.doneBtn} onPress={() => setWaterOpen(false)}>
              <Text style={styles.doneBtnText}>DONE</Text>
            </TouchableOpacity>
          </Pressable>
        </Pressable>
      </Modal>

      {/* ── Weight bottom sheet ────────────────────────── */}
      <Modal visible={weightOpen} transparent animationType="fade" onRequestClose={() => setWeightOpen(false)}>
        <KeyboardAvoidingView behavior={Platform.OS === 'ios' ? 'padding' : undefined} style={{ flex: 1 }}>
          <Pressable style={styles.backdrop} onPress={() => setWeightOpen(false)}>
            <Pressable style={styles.sheet} onPress={e => e.stopPropagation()}>
              <Text style={styles.sheetLabel}>LOG WEIGHT</Text>
              <Text style={styles.sheetTotal}>{weight.toFixed(1)}<Text style={styles.sheetTotalSub}> KG NOW</Text></Text>
              <TextInput
                style={styles.weightInput}
                value={weightInput}
                onChangeText={setWeightInput}
                placeholder="ENTER KG"
                placeholderTextColor={FAINT}
                keyboardType="decimal-pad"
                autoFocus
              />
              <TouchableOpacity style={styles.doneBtn} onPress={saveWeight}>
                <Text style={styles.doneBtnText}>SAVE</Text>
              </TouchableOpacity>
            </Pressable>
          </Pressable>
        </KeyboardAvoidingView>
      </Modal>

    </SafeAreaView>
  );
}

// ── Tiny presentational sub-components ───────────────────────────────────────
function Stat({ label, value, sub }: { label: string; value: string; sub: string }) {
  return (
    <View style={styles.stat}>
      <Text style={styles.statLabel}>{label}</Text>
      <Text style={styles.statValue}>{value}</Text>
      <Text style={styles.statSub}>{sub}</Text>
    </View>
  );
}

function Recovery({ icon, label, value, status }: { icon: string; label: string; value: string; status: string }) {
  return (
    <View style={styles.recoveryItem}>
      <MaterialCommunityIcons name={icon as any} size={22} color={ORANGE} />
      <Text style={styles.recoveryValue}>{value}</Text>
      <Text style={styles.recoveryStatus}>{status}</Text>
    </View>
  );
}

// ── Heatmap square styles ────────────────────────────────────────────────────
const hs = StyleSheet.create({
  sq: { width: SQ, height: SQ, borderRadius: 0, marginRight: 3, marginBottom: 3, overflow: 'hidden' },
  invisible: {},
  solid: { backgroundColor: ORANGE },
  dotted: { borderWidth: 1.5, borderColor: ORANGE, borderStyle: 'dotted' },
  missed: { borderWidth: 1.5, borderColor: '#D8D2C8' },
});

const hm = StyleSheet.create({
  headerRow: { flexDirection: 'row', marginBottom: 4 },
  headerDate: {
    width: SQ + 3,
    textAlign: 'center',
    fontFamily: 'PixeloidSans_400Regular',
    fontSize: 7,
    color: FAINT,
  },
  row: { flexDirection: 'row' },
  legend: { flexDirection: 'row', flexWrap: 'wrap', marginTop: 6, gap: 8 },
  legendItem: { flexDirection: 'row', alignItems: 'center', gap: 3 },
  legendText: { fontFamily: 'PixeloidSans_400Regular', fontSize: 7, color: MUTED },
});

const styles = StyleSheet.create({
  container: { flex: 1, backgroundColor: '#F5F2ED' },
  scroll: { paddingBottom: 48 },

  // Header
  header: { flexDirection: 'row', alignItems: 'flex-start', justifyContent: 'space-between', paddingHorizontal: 20, paddingTop: 12, paddingBottom: 16 },
  titleBlock: {},
  titleWrap: { flexDirection: 'row', alignItems: 'center', alignSelf: 'flex-start', paddingHorizontal: 8, paddingVertical: 4, position: 'relative' },
  corner: { width: 12, height: 12, borderColor: ORANGE, position: 'absolute' },
  cornerTL: { top: 0, left: 0, borderTopWidth: 2, borderLeftWidth: 2 },
  cornerBR: { bottom: 0, right: 0, borderBottomWidth: 2, borderRightWidth: 2 },
  title: { fontFamily: 'PixeloidSans_700Bold', fontSize: 30, color: INK, letterSpacing: 2 },
  subtitle: { fontFamily: 'PixeloidSans_400Regular', fontSize: 8, color: MUTED, letterSpacing: 2, marginTop: 6, marginLeft: 8 },
  headerIcons: { flexDirection: 'row', gap: 14, paddingTop: 6 },

  // Stats bar
  logWorkoutBtn: { flexDirection: 'row', alignItems: 'center', justifyContent: 'center', gap: 10, backgroundColor: ORANGE, marginHorizontal: 16, marginBottom: 16, borderRadius: 12, paddingVertical: 14 },
  logWorkoutText: { fontFamily: 'PixeloidSans_700Bold', fontSize: 12, color: '#FFFFFF', letterSpacing: 2 },
  statsBar: { flexDirection: 'row', marginHorizontal: 16, marginBottom: 20, paddingVertical: 4 },
  stat: { flex: 1, alignItems: 'center' },
  statDivider: { width: 1, backgroundColor: BORDER },
  statLabel: { fontFamily: 'PixeloidSans_400Regular', fontSize: 8, color: MUTED, letterSpacing: 1 },
  statValue: { fontFamily: NUM_FONT, fontSize: 26, color: ORANGE, marginVertical: 4 },
  statSub: { fontFamily: 'PixeloidSans_400Regular', fontSize: 8, color: MUTED, letterSpacing: 1 },

  sectionRow: { flexDirection: 'row', paddingHorizontal: 20, marginBottom: 18, justifyContent: 'space-between' },
  sectionLabel: { fontFamily: 'PixeloidSans_700Bold', fontSize: 11, color: INK, letterSpacing: 1 },
  sectionLabelStandalone: { paddingHorizontal: 20, marginBottom: 12 },

  stepsLeft: { flex: 1, paddingRight: 14 },
  bigNumber: { fontFamily: NUM_FONT, fontSize: 38, color: ORANGE, marginTop: 6 },
  walkDistance: {
    fontFamily: 'PixeloidSans_400Regular',
    fontSize: 8,
    color: MUTED,
    marginTop: 4,
    letterSpacing: 0.5,
  },
  goalRow: { flexDirection: 'row', justifyContent: 'space-between', alignItems: 'center', marginTop: 8 },
  goalText: { fontFamily: 'PixeloidSans_400Regular', fontSize: 8, color: MUTED },
  goalPct: { fontFamily: NUM_FONT, fontSize: 10, color: INK },
  progressBar: { flexDirection: 'row', marginTop: 8, gap: 2 },
  progressSquare: { flex: 1, height: 12, borderWidth: 1, borderColor: '#D8D2C8', borderRadius: 0 },
  progressSquareFilled: { backgroundColor: ORANGE, borderColor: ORANGE },
  healthConnectBtn: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 6,
    marginTop: 10,
    alignSelf: 'flex-start',
    borderWidth: 1,
    borderColor: ORANGE,
    borderRadius: 6,
    paddingVertical: 6,
    paddingHorizontal: 10,
  },
  healthConnectText: {
    fontFamily: 'PixeloidSans_700Bold',
    fontSize: 8,
    color: ORANGE,
    letterSpacing: 0.5,
  },
  healthHint: {
    fontFamily: 'PixeloidSans_400Regular',
    fontSize: 7,
    color: MUTED,
    marginTop: 6,
    lineHeight: 11,
    maxWidth: 200,
  },
  healthSynced: {
    fontFamily: 'PixeloidSans_400Regular',
    fontSize: 7,
    color: FAINT,
    marginTop: 4,
  },

  heatRight: { alignItems: 'flex-start' },
  viewLink: { marginTop: 6 },
  viewLinkText: { fontFamily: 'PixeloidSans_700Bold', fontSize: 8, color: ORANGE, letterSpacing: 1 },

  nextCard: {
    flex: 1,
    marginRight: 14,
    borderWidth: 1.5,
    borderColor: ORANGE,
    borderRadius: 10,
    paddingVertical: 12,
    paddingHorizontal: 12,
  },
  nextCardRow: { flexDirection: 'row', alignItems: 'center' },
  nextCardBody: { flex: 1, paddingRight: 12 },
  nextLabel: { fontFamily: 'PixeloidSans_400Regular', fontSize: 7, color: MUTED, letterSpacing: 1 },
  nextTitle: { fontFamily: 'PixeloidSans_700Bold', fontSize: 18, color: ORANGE, marginVertical: 6 },
  nextMeta: { flexDirection: 'row', alignItems: 'center', gap: 5, marginTop: 4 },
  nextMetaText: { fontFamily: 'PixeloidSans_400Regular', fontSize: 9, color: INK },

  // Pills
  pillRow: { flexDirection: 'row', paddingHorizontal: 16, gap: 6, marginBottom: 16 },
  pill: { flex: 1, borderWidth: 1, borderColor: BORDER, borderRadius: 6, paddingVertical: 8, alignItems: 'center', backgroundColor: CARD },
  pillActive: { backgroundColor: ORANGE, borderColor: ORANGE },
  pillText: { fontFamily: 'PixeloidSans_700Bold', fontSize: 8, color: MUTED, letterSpacing: 1 },
  pillTextActive: { color: '#FFFFFF' },

  // Workout card
  workoutCard: { marginHorizontal: 16, marginBottom: 20, backgroundColor: CARD, borderRadius: 12, borderWidth: 1, borderColor: BORDER, padding: 14 },
  workoutHeader: { flexDirection: 'row', justifyContent: 'space-between', alignItems: 'center' },
  workoutTitle: { fontFamily: 'PixeloidSans_700Bold', fontSize: 15, color: ORANGE, letterSpacing: 1 },
  exerciseCount: { fontFamily: 'PixeloidSans_400Regular', fontSize: 8, color: MUTED, marginTop: 4, marginBottom: 8, letterSpacing: 1 },
  exerciseRow: { flexDirection: 'row', alignItems: 'center', paddingVertical: 12 },
  exerciseRowBorder: { borderTopWidth: 1, borderTopColor: BORDER },
  exerciseIcon: { marginRight: 12, width: 30 },
  exerciseName: { fontFamily: 'PixeloidSans_700Bold', fontSize: 10, color: INK, flex: 1 },
  exerciseMeta: { marginRight: 10, alignItems: 'flex-end', gap: 4 },
  setText: { fontFamily: 'PixeloidSans_400Regular', fontSize: 9, color: INK, lineHeight: 15, textAlign: 'right' },
  setTextPb: { color: ORANGE },
  pbMetaText: { fontFamily: 'PixeloidSans_400Regular', fontSize: 8, color: MUTED, textAlign: 'right', letterSpacing: 0.5 },
  pbBadge: { backgroundColor: ORANGE, borderRadius: 4, paddingHorizontal: 6, paddingVertical: 3, alignSelf: 'flex-end' },
  pbBadgeText: { fontFamily: 'PixeloidSans_700Bold', fontSize: 8, color: '#FFFFFF' },
  moreRow: { borderTopWidth: 1, borderTopColor: BORDER, paddingTop: 12, marginTop: 2, alignItems: 'center' },
  moreText: { fontFamily: 'PixeloidSans_700Bold', fontSize: 9, color: ORANGE, letterSpacing: 1 },
  emptyTemplate: { fontFamily: 'PixeloidSans_400Regular', fontSize: 9, color: MUTED, marginTop: 12, lineHeight: 15 },

  // Strength + metric cards
  strengthHeader: { flexDirection: 'row', justifyContent: 'space-between', alignItems: 'center', paddingHorizontal: 20, marginBottom: 12 },
  cardRow: { flexDirection: 'row', paddingHorizontal: 16, gap: 8, marginBottom: 16 },
  liftCard: { flex: 1, backgroundColor: CARD, borderRadius: 10, borderWidth: 1, borderColor: BORDER, padding: 10 },
  liftName: { fontFamily: 'PixeloidSans_400Regular', fontSize: 7, color: MUTED, marginTop: 6, letterSpacing: 1 },
  liftValue: { fontFamily: NUM_FONT, fontSize: 20, color: ORANGE, marginTop: 4 },
  liftUnit: { fontFamily: 'PixeloidSans_700Bold', fontSize: 10 },
  lift1rm: { fontFamily: 'PixeloidSans_400Regular', fontSize: 7, color: MUTED, marginBottom: 6 },
  liftDelta: { fontFamily: 'PixeloidSans_400Regular', fontSize: 7, color: MUTED, marginTop: 6 },

  metricCard: { flex: 1, backgroundColor: CARD, borderRadius: 10, borderWidth: 1, borderColor: BORDER, padding: 10, minHeight: 120 },
  metricLabel: { fontFamily: 'PixeloidSans_400Regular', fontSize: 7, color: MUTED, marginTop: 6, letterSpacing: 1 },
  metricValue: { fontFamily: NUM_FONT, fontSize: 15, color: INK, marginTop: 4, marginBottom: 4 },
  metricSub: { fontFamily: NUM_FONT, fontSize: 12, color: ORANGE },
  metricSubTiny: { fontFamily: 'PixeloidSans_400Regular', fontSize: 7, color: MUTED, marginTop: 4 },

  // Recovery — wrapped in a card like every other section
  recoveryCard: { flexDirection: 'row', marginHorizontal: 16, paddingVertical: 16, paddingHorizontal: 8, alignItems: 'center', backgroundColor: CARD, borderRadius: 12, borderWidth: 1, borderColor: BORDER },
  recoveryItem: { flex: 1, alignItems: 'center', gap: 6 },
  recoveryValue: { fontFamily: NUM_FONT, fontSize: 16, color: ORANGE },
  recoveryStatus: { fontFamily: 'PixeloidSans_400Regular', fontSize: 8, color: MUTED, letterSpacing: 1 },

  // Bottom sheets
  backdrop: { flex: 1, backgroundColor: 'rgba(0,0,0,0.55)', justifyContent: 'flex-end', alignItems: 'center', paddingHorizontal: 20, paddingBottom: 40 },
  sheet: { width: '100%', backgroundColor: '#FFFFFF', borderRadius: 16, padding: 22, shadowColor: '#000', shadowOffset: { width: 0, height: 8 }, shadowOpacity: 0.18, shadowRadius: 24, elevation: 10 },
  sheetLabel: { fontFamily: 'PixeloidSans_400Regular', fontSize: 9, color: ORANGE, letterSpacing: 1, marginBottom: 10 },
  sheetTotal: { fontFamily: NUM_FONT, fontSize: 28, color: INK, marginBottom: 18 },
  sheetTotalSub: { fontFamily: 'PixeloidSans_400Regular', fontSize: 12, color: MUTED },
  waterBtnRow: { flexDirection: 'row', gap: 10, marginBottom: 18 },
  waterBtn: { flex: 1, backgroundColor: '#FFF1F0', borderWidth: 1.5, borderColor: ORANGE, borderRadius: 10, paddingVertical: 16, alignItems: 'center' },
  waterBtnText: { fontFamily: NUM_FONT, fontSize: 16, color: ORANGE },
  waterBtnUnit: { fontFamily: 'PixeloidSans_400Regular', fontSize: 8, color: ORANGE, marginTop: 2 },
  weightInput: { fontFamily: NUM_FONT, fontSize: 18, color: INK, borderBottomWidth: 2, borderBottomColor: BORDER, paddingVertical: 10, marginBottom: 20 },
  doneBtn: { backgroundColor: ORANGE, borderRadius: 10, paddingVertical: 14, alignItems: 'center' },
  doneBtnText: { fontFamily: 'PixeloidSans_700Bold', fontSize: 12, color: '#FFFFFF', letterSpacing: 1 },
});
