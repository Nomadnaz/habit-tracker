// ─────────────────────────────────────────────────────────────────────────
// STEPS PAGE — "TRACK YOUR JOURNEY"
// Step count / goal / weekly bars / heatmap all read from body-data (shared
// source). Distance, runs, elevation and run tracking come from steps-data.
// ─────────────────────────────────────────────────────────────────────────

import { useState, useEffect, useCallback, useRef } from 'react';
import {
  View, Text, ScrollView, StyleSheet, TouchableOpacity, Pressable,
  useWindowDimensions,
} from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';
import { useRouter, useFocusEffect } from 'expo-router';
import { MaterialCommunityIcons } from '@expo/vector-icons';
import * as Haptics from 'expo-haptics';
import Svg, { Ellipse, Polyline, Circle } from 'react-native-svg';

import {
  loadBodyData, todaySteps, buildDayGrid, stepsSquareState,
  dateKey, type BodyData,
} from '@/lib/body-data';
import {
  loadStepsData, startRun, endRun,
  weekStepBars, recentStepPins, daysLeftInWeek, daysLeftInMonth,
  formatDuration, formatPace, formatActiveTime, formatRunDate,
  type StepsData, type GoalStatus,
} from '@/lib/steps-data';

// ── Design tokens (identical to BODY page) ─────────────────────────────────
const ORANGE = '#FF4D00';
const INK    = '#1A1714';
const MUTED  = '#8C857B';
const FAINT  = '#C7C1B8';
const BORDER = '#E5E1DA';
const CARD   = '#FCFBF9';
const NUM    = 'PixeloidSans_400Regular';
const BOLD   = 'PixeloidSans_700Bold';
const REG    = 'PixeloidSans_400Regular';

// ── Mountain geometry (viewBox 320 × 230) ──────────────────────────────────
const MTN_VB_W = 320;
const MTN_VB_H = 230;
// Winding route from base (bottom-left ▶) up to the peak (🏁).
const ROUTE: { x: number; y: number }[] = [
  { x: 58,  y: 198 },
  { x: 96,  y: 182 },
  { x: 84,  y: 158 },
  { x: 128, y: 150 },
  { x: 120, y: 124 },
  { x: 150, y: 112 },
  { x: 140, y: 92 },
  { x: 160, y: 72 },
];

// Point at fraction t (0..1) along the route polyline.
function pointAlong(t: number): { x: number; y: number } {
  const segs = ROUTE.length - 1;
  const clamped = Math.max(0, Math.min(1, t));
  const pos = clamped * segs;
  const i = Math.min(segs - 1, Math.floor(pos));
  const local = pos - i;
  const a = ROUTE[i], b = ROUTE[i + 1];
  return { x: a.x + (b.x - a.x) * local, y: a.y + (b.y - a.y) * local };
}

// ── Heatmap (re-declared locally; data comes from body-data) ────────────────
const SQ = 13;
type SquareKind = 'hit' | 'partial' | 'missed' | 'empty';

function HeatSquare({ kind }: { kind: SquareKind }) {
  if (kind === 'empty')   return <View style={[hs.sq, { borderWidth: 0 }]} />;
  if (kind === 'hit')     return <View style={[hs.sq, hs.solid]} />;
  if (kind === 'partial') return <View style={[hs.sq, hs.dotted]} />;
  return <View style={[hs.sq, hs.missed]} />;
}

function Heatmap({ body }: { body: BodyData }) {
  const grid = buildDayGrid(4);
  const header = grid[grid.length - 1] ?? [];
  return (
    <View>
      <View style={hm.headerRow}>
        {['M', 'T', 'W', 'T', 'F', 'S', 'S'].map((d, i) => (
          <Text key={i} style={hm.headerLetter}>{d}</Text>
        ))}
      </View>
      {grid.map((row, r) => (
        <View key={r} style={hm.row}>
          {row.map((day, c) => (
            <HeatSquare key={c} kind={stepsSquareState(body, day) as SquareKind} />
          ))}
        </View>
      ))}
    </View>
  );
}

export default function StepsScreen() {
  const router = useRouter();
  const { width } = useWindowDimensions();

  const [body, setBody] = useState<BodyData | null>(null);
  const [steps, setSteps] = useState<StepsData | null>(null);
  const [selectedPin, setSelectedPin] = useState<number | null>(null);
  const [elapsed, setElapsed] = useState(0);
  const tickRef = useRef<ReturnType<typeof setInterval> | null>(null);

  useFocusEffect(useCallback(() => {
    loadBodyData().then(setBody);
    loadStepsData().then(setSteps);
  }, []));

  // Live timer while a run is active.
  useEffect(() => {
    if (steps?.activeRunStart) {
      const start = new Date(steps.activeRunStart).getTime();
      const update = () => setElapsed(Math.round((Date.now() - start) / 1000));
      update();
      tickRef.current = setInterval(update, 1000);
      return () => { if (tickRef.current) clearInterval(tickRef.current); };
    }
    setElapsed(0);
  }, [steps?.activeRunStart]);

  if (!body || !steps) {
    return <SafeAreaView style={s.container} edges={['top']} />;
  }

  const stepCount = todaySteps(body);
  const stepPct   = Math.min(1, stepCount / body.stepsGoal);
  const distPct   = Math.min(1, steps.weeklyDistanceKm / steps.weeklyDistanceGoalKm);
  const elevPct   = Math.min(1, steps.monthlyElevationKm / steps.monthlyElevationGoalKm);

  const BAR_SQUARES = 16;
  const filled = Math.round(stepPct * BAR_SQUARES);

  const bars = weekStepBars(body);
  const maxBar = Math.max(...bars.map(b => b.steps), 1);
  const pins = recentStepPins(body, 4);
  const recentRun = steps.runs[0] ?? null;

  // Mountain render size.
  const mtnW = width - 32 - 28;          // screen − card margins − card padding
  const scale = mtnW / MTN_VB_W;
  const mtnH = MTN_VB_H * scale;

  // Pin positions: START (t=0), milestones spread, SUMMIT (t=1).
  const milestoneTs = pins.map((_, i) => 0.22 + (i * 0.6) / Math.max(1, pins.length - 1 || 1));

  async function toggleRun() {
    Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Medium);
    if (steps!.activeRunStart) {
      const d = await endRun();
      setSteps({ ...d });
      Haptics.notificationAsync(Haptics.NotificationFeedbackType.Success);
    } else {
      const d = await startRun();
      setSteps({ ...d });
    }
  }

  const running = !!steps.activeRunStart;

  return (
    <SafeAreaView style={s.container} edges={['top']}>
      <ScrollView showsVerticalScrollIndicator={false} contentContainerStyle={{ paddingBottom: 32 }}>

        {/* ── Header ─────────────────────────────────────── */}
        <View style={s.header}>
          <View style={s.headerLeft}>
            <TouchableOpacity onPress={() => router.back()} hitSlop={{ top: 10, bottom: 10, left: 10, right: 10 }}>
              <MaterialCommunityIcons name="chevron-left" size={26} color={ORANGE} />
            </TouchableOpacity>
            <View>
              <View style={s.titleWrap}>
                <View style={[s.corner, s.cornerTL]} />
                <Text style={s.title}>STEPS</Text>
                <View style={[s.corner, s.cornerBR]} />
              </View>
              <Text style={s.subtitle}>TRACK YOUR JOURNEY</Text>
            </View>
          </View>
          <View style={s.headerIcons}>
            <MaterialCommunityIcons name="information-outline" size={18} color={MUTED} />
            <MaterialCommunityIcons name="chart-bar" size={18} color={MUTED} />
            <MaterialCommunityIcons name="dots-horizontal" size={18} color={MUTED} />
          </View>
        </View>

        {/* ── Today stats row ────────────────────────────── */}
        <View style={s.statsRow}>
          <View style={s.statsCol}>
            <Text style={s.colLabel}>TODAY'S STEPS</Text>
            <Text style={s.bigNum}>{stepCount.toLocaleString()}</Text>
            <Text style={s.colUnit}>STEPS</Text>
            <View style={s.goalLine}>
              <Text style={s.goalText}>GOAL: {body.stepsGoal.toLocaleString()} STEPS</Text>
              <Text style={s.goalPct}>{Math.round(stepPct * 100)}%</Text>
            </View>
            <View style={s.blockBar}>
              {Array.from({ length: BAR_SQUARES }).map((_, i) => (
                <View key={i} style={[s.block, i < filled && s.blockFilled]} />
              ))}
            </View>
          </View>

          <View style={s.colDivider} />

          <View style={s.statsCol}>
            <Text style={s.colLabel}>DISTANCE</Text>
            <Text style={s.bigNum}>{steps.todayDistanceKm.toFixed(2)}<Text style={s.bigNumUnit}> KM</Text></Text>
            <Text style={s.colUnit}>WEEKLY DISTANCE GOAL</Text>
            <View style={s.goalLine}>
              <Text style={s.goalText}>
                <Text style={{ color: ORANGE }}>{steps.weeklyDistanceKm}</Text> / {steps.weeklyDistanceGoalKm} KM
              </Text>
              <Text style={s.goalPct}>{Math.round(distPct * 100)}%</Text>
            </View>
            <View style={s.lineTrack}>
              <View style={[s.lineFill, { width: `${distPct * 100}%` }]} />
            </View>
          </View>
        </View>

        {/* ── Topographic mountain ───────────────────────── */}
        <View style={s.mountainCard}>
          <View style={{ width: mtnW, height: mtnH, alignSelf: 'center' }}>
            <Svg width={mtnW} height={mtnH} viewBox={`0 0 ${MTN_VB_W} ${MTN_VB_H}`}>
              {/* Contour rings — concentric rising ellipses */}
              {Array.from({ length: 9 }).map((_, k) => (
                <Ellipse
                  key={k}
                  cx={160}
                  cy={186 - k * 13}
                  rx={132 - k * 13.5}
                  ry={40 - k * 3.4}
                  stroke="#D8D2C8"
                  strokeWidth={1}
                  fill="none"
                />
              ))}
              {/* Route */}
              <Polyline
                points={ROUTE.map(p => `${p.x},${p.y}`).join(' ')}
                fill="none"
                stroke={ORANGE}
                strokeWidth={2.5}
              />
              {ROUTE.map((p, i) => (
                <Circle key={i} cx={p.x} cy={p.y} r={1.6} fill={ORANGE} />
              ))}
            </Svg>

            {/* START pin (▶) */}
            <View style={[s.pinBase, { left: ROUTE[0].x * scale - 11, top: ROUTE[0].y * scale - 11 }]}>
              <View style={s.pinStart}>
                <MaterialCommunityIcons name="play" size={11} color="#FFFFFF" />
              </View>
            </View>

            {/* SUMMIT pin (🏁) */}
            <View
              style={[
                s.summitWrap,
                { left: ROUTE[ROUTE.length - 1].x * scale - 11, top: ROUTE[ROUTE.length - 1].y * scale - 34 },
              ]}
            >
              <View style={s.pinSummit}>
                <MaterialCommunityIcons name="flag-checkered" size={12} color="#FFFFFF" />
              </View>
              <View style={s.pinStalk} />
            </View>

            {/* Milestone pins */}
            {pins.map((pin, i) => {
              const pt = pointAlong(milestoneTs[i]);
              const left = pt.x * scale;
              const top = pt.y * scale;
              const hit = pin.status === 'hit';
              return (
                <Pressable
                  key={i}
                  style={[s.milestoneWrap, { left: left - 24, top: top - 30 }]}
                  onPress={() => { Haptics.selectionAsync(); setSelectedPin(selectedPin === i ? null : i); }}
                  hitSlop={{ top: 6, bottom: 6, left: 6, right: 6 }}
                >
                  <Text style={[s.milestoneLabel, { color: hit ? ORANGE : MUTED }]}>{pin.label}</Text>
                  <View style={[s.milestoneStalk, { backgroundColor: hit ? ORANGE : '#C7C1B8' }]} />
                  <View style={[s.milestoneDot, { backgroundColor: hit ? ORANGE : '#C7C1B8' }]} />
                </Pressable>
              );
            })}

            {/* Tooltip */}
            {selectedPin !== null && pins[selectedPin] && (() => {
              const pin = pins[selectedPin];
              const pt = pointAlong(milestoneTs[selectedPin]);
              const km = (pin.steps * 0.0007).toFixed(1);
              const kcal = Math.round(pin.steps * 0.04);
              return (
                <View style={[s.tooltip, { left: Math.min(mtnW - 130, Math.max(4, pt.x * scale - 60)), top: pt.y * scale - 92 }]}>
                  <Text style={s.tooltipDate}>{pin.label}</Text>
                  <Text style={s.tooltipRow}>{pin.steps.toLocaleString()} STEPS</Text>
                  <Text style={s.tooltipRow}>{km} KM · {kcal} KCAL</Text>
                  <View style={[s.tooltipBadge, pin.status !== 'hit' && s.tooltipBadgeMuted]}>
                    <Text style={s.tooltipBadgeText}>{pin.status.toUpperCase()}</Text>
                  </View>
                </View>
              );
            })()}
          </View>

          {/* 3 stat pills */}
          <View style={s.pillsRow}>
            <View style={s.pill}>
              <Text style={s.pillLabel}>ELEVATION GAINED</Text>
              <Text style={s.pillValue}>{steps.todayElevationM}</Text>
              <Text style={s.pillUnit}>M</Text>
            </View>
            <View style={s.pillDivider} />
            <View style={s.pill}>
              <Text style={s.pillLabel}>ACTIVE TIME</Text>
              <Text style={s.pillValue}>{formatActiveTime(steps.todayActiveMins)}</Text>
              <Text style={s.pillUnit}>HRS</Text>
            </View>
            <View style={s.pillDivider} />
            <View style={s.pill}>
              <Text style={s.pillLabel}>CALORIES</Text>
              <Text style={s.pillValue}>{steps.todayCalories.toLocaleString()}</Text>
              <Text style={s.pillUnit}>KCAL</Text>
            </View>
          </View>
        </View>

        {/* ── START RUN ──────────────────────────────────── */}
        <TouchableOpacity style={[s.runBtn, running && s.runBtnActive]} activeOpacity={0.85} onPress={toggleRun}>
          <MaterialCommunityIcons name={running ? 'stop' : 'play'} size={18} color="#FFFFFF" />
          <Text style={s.runBtnText}>{running ? `STOP RUN  ${formatDuration(elapsed)}` : 'START RUN'}</Text>
        </TouchableOpacity>
        <Text style={s.runCaption}>TRACK A RUN TO LOG PACE, SPEED, TIME & DISTANCE</Text>

        {/* ── Recent run ─────────────────────────────────── */}
        {recentRun && (
          <View style={s.recentCard}>
            <View style={s.recentHeader}>
              <Text style={s.sectionLabel}>RECENT RUN</Text>
              <Text style={s.viewLink}>VIEW ALL ›</Text>
            </View>
            <View style={s.recentBody}>
              {/* Map thumbnail (placeholder route on grey) */}
              <View style={s.mapThumb}>
                <Svg width={88} height={88} viewBox="0 0 88 88">
                  <Polyline points="14,70 28,52 40,58 52,34 66,40 76,18" fill="none" stroke={ORANGE} strokeWidth={2.5} />
                  <Circle cx={14} cy={70} r={3} fill="#4CAF50" />
                  <Circle cx={76} cy={18} r={3} fill={ORANGE} />
                </Svg>
              </View>
              <View style={s.recentStats}>
                <Text style={s.recentDate}>{formatRunDate(recentRun.startedAt)}</Text>
                <View style={s.recentTop}>
                  <View>
                    <Text style={s.recentBig}>{recentRun.distanceKm.toFixed(2)}<Text style={s.recentBigUnit}> KM</Text></Text>
                  </View>
                  <View style={s.recentTopRight}>
                    <View style={s.recentMini}>
                      <Text style={s.recentMiniVal}>{formatDuration(recentRun.durationSec)}</Text>
                      <Text style={s.recentMiniLbl}>TIME</Text>
                    </View>
                    <View style={s.recentMini}>
                      <Text style={s.recentMiniVal}>{formatPace(recentRun.avgPaceSecPerKm)}</Text>
                      <Text style={s.recentMiniLbl}>/KM</Text>
                    </View>
                  </View>
                </View>
              </View>
            </View>
            <View style={s.recentFooter}>
              <RecentStat icon="speedometer-slow" value={`${formatPace(recentRun.bestPaceSecPerKm)} /KM`} label="BEST PACE" />
              <RecentStat icon="speedometer" value={`${recentRun.avgSpeedKph} KM/H`} label="AVG SPEED" />
              <RecentStat icon="fire" value={`${recentRun.calories}`} label="KCAL" />
            </View>
          </View>
        )}

        {/* ── This week + heatmap ────────────────────────── */}
        <View style={s.weekRow}>
          <View style={s.weekLeft}>
            <Text style={s.sectionLabel}>THIS WEEK</Text>
            <View style={s.barChart}>
              {bars.map((b, i) => {
                const h = 6 + (b.steps / maxBar) * 64;
                return (
                  <View key={i} style={s.barCol}>
                    {b.isToday && b.steps > 0 && (
                      <View style={s.barTip}><Text style={s.barTipText}>{b.steps.toLocaleString()}</Text></View>
                    )}
                    <View style={[s.bar, { height: h }]} />
                    <Text style={s.barLabel}>{b.day[0]}</Text>
                  </View>
                );
              })}
            </View>
          </View>

          <View style={s.weekRight}>
            <Text style={s.sectionLabel}>HEATMAP</Text>
            <View style={{ marginTop: 8 }}>
              <Heatmap body={body} />
            </View>
            <View style={s.legend}>
              <View style={s.legendItem}><HeatSquare kind="hit" /><Text style={s.legendText}>GOAL HIT</Text></View>
              <View style={s.legendItem}><HeatSquare kind="partial" /><Text style={s.legendText}>PARTIAL</Text></View>
              <View style={s.legendItem}><HeatSquare kind="missed" /><Text style={s.legendText}>MISSED</Text></View>
            </View>
          </View>
        </View>

        {/* ── Goals ──────────────────────────────────────── */}
        <View style={s.goalsHeader}>
          <Text style={s.sectionLabel}>GOALS</Text>
          <Text style={s.viewLink}>VIEW ALL GOALS ›</Text>
        </View>

        <GoalRow
          icon="shoe-print"
          name="DAILY STEPS GOAL"
          value={`${stepCount.toLocaleString()} / ${body.stepsGoal.toLocaleString()} STEPS`}
          pct={stepPct}
        />
        <GoalRow
          icon="image-filter-hdr"
          name="WEEKLY DISTANCE GOAL"
          value={`${steps.weeklyDistanceKm} / ${steps.weeklyDistanceGoalKm} KM`}
          pct={distPct}
          endsIn={`ENDS IN ${daysLeftInWeek()} DAYS`}
        />
        <GoalRow
          icon="flag-variant"
          name="MONTHLY ELEVATION GOAL"
          value={`${steps.monthlyElevationKm} / ${steps.monthlyElevationGoalKm} KM`}
          pct={elevPct}
          endsIn={`ENDS IN ${daysLeftInMonth()} DAYS`}
        />

      </ScrollView>
    </SafeAreaView>
  );
}

// ── Sub-components ───────────────────────────────────────────────────────────
function RecentStat({ icon, value, label }: { icon: string; value: string; label: string }) {
  return (
    <View style={s.recentStatItem}>
      <MaterialCommunityIcons name={icon as any} size={14} color={MUTED} />
      <Text style={s.recentStatVal}>{value}</Text>
      <Text style={s.recentStatLbl}>{label}</Text>
    </View>
  );
}

function GoalRow({
  icon, name, value, pct, endsIn,
}: { icon: string; name: string; value: string; pct: number; endsIn?: string }) {
  return (
    <View style={s.goalRow}>
      <View style={s.goalIcon}>
        <MaterialCommunityIcons name={icon as any} size={18} color={MUTED} />
      </View>
      <View style={s.goalBody}>
        <View style={s.goalTopLine}>
          <Text style={s.goalName}>{name}</Text>
          <Text style={s.goalRowPct}>{Math.round(pct * 100)}%</Text>
        </View>
        <Text style={s.goalValue}>{value}</Text>
        <View style={s.goalTrack}>
          <View style={[s.goalFill, { width: `${pct * 100}%` }]} />
        </View>
        {endsIn && <Text style={s.goalEnds}>{endsIn}</Text>}
      </View>
    </View>
  );
}

// ── Styles ────────────────────────────────────────────────────────────────
const hs = StyleSheet.create({
  sq: { width: SQ, height: SQ, marginRight: 3, marginBottom: 3 },
  solid: { backgroundColor: ORANGE },
  dotted: { borderWidth: 1.5, borderColor: ORANGE, borderStyle: 'dotted' },
  missed: { borderWidth: 1.5, borderColor: '#D8D2C8' },
});

const hm = StyleSheet.create({
  headerRow: { flexDirection: 'row', marginBottom: 4 },
  headerLetter: { width: SQ + 3, textAlign: 'center', fontFamily: REG, fontSize: 7, color: FAINT },
  row: { flexDirection: 'row' },
});

const s = StyleSheet.create({
  container: { flex: 1, backgroundColor: '#F5F2ED' },

  // Header
  header: { flexDirection: 'row', alignItems: 'flex-start', justifyContent: 'space-between', paddingHorizontal: 16, paddingTop: 10, paddingBottom: 16 },
  headerLeft: { flexDirection: 'row', alignItems: 'flex-start', gap: 6 },
  titleWrap: { flexDirection: 'row', alignItems: 'center', alignSelf: 'flex-start', paddingHorizontal: 8, paddingVertical: 4, position: 'relative' },
  corner: { width: 12, height: 12, borderColor: ORANGE, position: 'absolute' },
  cornerTL: { top: 0, left: 0, borderTopWidth: 2, borderLeftWidth: 2 },
  cornerBR: { bottom: 0, right: 0, borderBottomWidth: 2, borderRightWidth: 2 },
  title: { fontFamily: BOLD, fontSize: 30, color: INK, letterSpacing: 2 },
  subtitle: { fontFamily: REG, fontSize: 8, color: MUTED, letterSpacing: 2, marginTop: 6, marginLeft: 8 },
  headerIcons: { flexDirection: 'row', gap: 14, paddingTop: 8 },

  // Today stats row
  statsRow: { flexDirection: 'row', paddingHorizontal: 20, marginBottom: 18 },
  statsCol: { flex: 1 },
  colDivider: { width: 1, backgroundColor: BORDER, marginHorizontal: 16 },
  colLabel: { fontFamily: REG, fontSize: 9, color: MUTED, letterSpacing: 1 },
  bigNum: { fontFamily: NUM, fontSize: 38, color: ORANGE, marginTop: 6 },
  bigNumUnit: { fontFamily: NUM, fontSize: 14, color: ORANGE },
  colUnit: { fontFamily: REG, fontSize: 8, color: MUTED, letterSpacing: 1, marginTop: 2 },
  goalLine: { flexDirection: 'row', justifyContent: 'space-between', alignItems: 'center', marginTop: 10 },
  goalText: { fontFamily: REG, fontSize: 8, color: MUTED },
  goalPct: { fontFamily: NUM, fontSize: 10, color: INK },
  blockBar: { flexDirection: 'row', marginTop: 8, gap: 2 },
  block: { flex: 1, height: 12, borderWidth: 1, borderColor: '#D8D2C8' },
  blockFilled: { backgroundColor: ORANGE, borderColor: ORANGE },
  lineTrack: { height: 8, backgroundColor: '#E8E4DD', borderRadius: 4, marginTop: 9, overflow: 'hidden' },
  lineFill: { height: 8, backgroundColor: ORANGE, borderRadius: 4 },

  // Mountain
  mountainCard: { marginHorizontal: 16, marginBottom: 18, backgroundColor: CARD, borderRadius: 14, borderWidth: 1, borderColor: BORDER, padding: 14 },
  pinBase: { position: 'absolute' },
  pinStart: { width: 22, height: 22, borderRadius: 11, backgroundColor: ORANGE, alignItems: 'center', justifyContent: 'center', borderWidth: 2, borderColor: '#FFFFFF' },
  summitWrap: { position: 'absolute', alignItems: 'center' },
  pinSummit: { width: 22, height: 22, borderRadius: 11, backgroundColor: INK, alignItems: 'center', justifyContent: 'center', borderWidth: 2, borderColor: '#FFFFFF' },
  pinStalk: { width: 1.5, height: 12, backgroundColor: INK },
  milestoneWrap: { position: 'absolute', width: 48, alignItems: 'center' },
  milestoneLabel: { fontFamily: BOLD, fontSize: 7, letterSpacing: 0.5, marginBottom: 2 },
  milestoneStalk: { width: 1.5, height: 14 },
  milestoneDot: { width: 8, height: 8, borderRadius: 4, borderWidth: 1.5, borderColor: '#FFFFFF' },
  tooltip: { position: 'absolute', width: 124, backgroundColor: '#FFFFFF', borderRadius: 8, borderWidth: 1, borderColor: BORDER, padding: 8, shadowColor: '#000', shadowOffset: { width: 0, height: 4 }, shadowOpacity: 0.15, shadowRadius: 8, elevation: 6 },
  tooltipDate: { fontFamily: BOLD, fontSize: 9, color: INK, marginBottom: 4 },
  tooltipRow: { fontFamily: REG, fontSize: 8, color: MUTED, marginBottom: 2 },
  tooltipBadge: { alignSelf: 'flex-start', backgroundColor: ORANGE, borderRadius: 4, paddingHorizontal: 6, paddingVertical: 2, marginTop: 4 },
  tooltipBadgeMuted: { backgroundColor: '#C7C1B8' },
  tooltipBadgeText: { fontFamily: BOLD, fontSize: 7, color: '#FFFFFF', letterSpacing: 0.5 },

  pillsRow: { flexDirection: 'row', alignItems: 'center', borderTopWidth: 1, borderTopColor: BORDER, marginTop: 12, paddingTop: 12 },
  pill: { flex: 1, alignItems: 'center' },
  pillDivider: { width: 1, height: 32, backgroundColor: BORDER },
  pillLabel: { fontFamily: REG, fontSize: 7, color: MUTED, letterSpacing: 0.5, marginBottom: 4 },
  pillValue: { fontFamily: NUM, fontSize: 20, color: ORANGE },
  pillUnit: { fontFamily: REG, fontSize: 7, color: MUTED, marginTop: 2, letterSpacing: 1 },

  // Run button
  runBtn: { flexDirection: 'row', alignItems: 'center', justifyContent: 'center', gap: 10, backgroundColor: ORANGE, marginHorizontal: 16, borderRadius: 12, paddingVertical: 16 },
  runBtnActive: { backgroundColor: INK },
  runBtnText: { fontFamily: BOLD, fontSize: 14, color: '#FFFFFF', letterSpacing: 2 },
  runCaption: { fontFamily: REG, fontSize: 8, color: MUTED, textAlign: 'center', letterSpacing: 1, marginTop: 10, marginBottom: 20 },

  // Recent run
  recentCard: { marginHorizontal: 16, marginBottom: 20, backgroundColor: CARD, borderRadius: 14, borderWidth: 1, borderColor: BORDER, padding: 14 },
  recentHeader: { flexDirection: 'row', justifyContent: 'space-between', alignItems: 'center', marginBottom: 12 },
  sectionLabel: { fontFamily: BOLD, fontSize: 11, color: INK, letterSpacing: 1 },
  viewLink: { fontFamily: BOLD, fontSize: 8, color: ORANGE, letterSpacing: 1 },
  recentBody: { flexDirection: 'row', gap: 12 },
  mapThumb: { width: 88, height: 88, borderRadius: 8, backgroundColor: '#ECE8E1', alignItems: 'center', justifyContent: 'center', overflow: 'hidden' },
  recentStats: { flex: 1 },
  recentDate: { fontFamily: REG, fontSize: 8, color: MUTED, letterSpacing: 0.5, marginBottom: 6 },
  recentTop: { flexDirection: 'row', justifyContent: 'space-between', alignItems: 'flex-start' },
  recentBig: { fontFamily: NUM, fontSize: 28, color: ORANGE },
  recentBigUnit: { fontFamily: NUM, fontSize: 12, color: ORANGE },
  recentTopRight: { flexDirection: 'row', gap: 12 },
  recentMini: { alignItems: 'flex-end' },
  recentMiniVal: { fontFamily: NUM, fontSize: 16, color: INK },
  recentMiniLbl: { fontFamily: REG, fontSize: 7, color: MUTED, marginTop: 2 },
  recentFooter: { flexDirection: 'row', borderTopWidth: 1, borderTopColor: BORDER, marginTop: 12, paddingTop: 12 },
  recentStatItem: { flex: 1, alignItems: 'center', gap: 3 },
  recentStatVal: { fontFamily: NUM, fontSize: 11, color: INK },
  recentStatLbl: { fontFamily: REG, fontSize: 7, color: MUTED, letterSpacing: 0.5 },

  // Week + heatmap
  weekRow: { flexDirection: 'row', paddingHorizontal: 16, marginBottom: 20, gap: 16 },
  weekLeft: { flex: 1 },
  weekRight: {},
  barChart: { flexDirection: 'row', alignItems: 'flex-end', justifyContent: 'space-between', height: 96, marginTop: 12 },
  barCol: { alignItems: 'center', flex: 1, justifyContent: 'flex-end' },
  bar: { width: 6, backgroundColor: ORANGE, borderRadius: 1 },
  barLabel: { fontFamily: REG, fontSize: 7, color: MUTED, marginTop: 6 },
  barTip: { backgroundColor: INK, borderRadius: 4, paddingHorizontal: 4, paddingVertical: 2, marginBottom: 4 },
  barTipText: { fontFamily: BOLD, fontSize: 7, color: '#FFFFFF' },
  legend: { flexDirection: 'row', flexWrap: 'wrap', marginTop: 8, gap: 8 },
  legendItem: { flexDirection: 'row', alignItems: 'center', gap: 3 },
  legendText: { fontFamily: REG, fontSize: 7, color: MUTED },

  // Goals
  goalsHeader: { flexDirection: 'row', justifyContent: 'space-between', alignItems: 'center', paddingHorizontal: 20, marginBottom: 14 },
  goalRow: { flexDirection: 'row', paddingHorizontal: 16, marginBottom: 16, gap: 12 },
  goalIcon: { width: 36, height: 36, borderRadius: 18, borderWidth: 1, borderColor: BORDER, alignItems: 'center', justifyContent: 'center', marginTop: 2 },
  goalBody: { flex: 1 },
  goalTopLine: { flexDirection: 'row', justifyContent: 'space-between', alignItems: 'center' },
  goalName: { fontFamily: REG, fontSize: 8, color: MUTED, letterSpacing: 1 },
  goalRowPct: { fontFamily: NUM, fontSize: 10, color: INK },
  goalValue: { fontFamily: NUM, fontSize: 13, color: ORANGE, marginTop: 3 },
  goalTrack: { height: 6, backgroundColor: '#E8E4DD', borderRadius: 3, marginTop: 6, overflow: 'hidden' },
  goalFill: { height: 6, backgroundColor: ORANGE, borderRadius: 3 },
  goalEnds: { fontFamily: REG, fontSize: 7, color: MUTED, textAlign: 'right', marginTop: 4, letterSpacing: 0.5 },
});
