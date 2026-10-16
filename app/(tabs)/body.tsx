// ─────────────────────────────────────────────────────────────────────────
// BODY — the hub: the 3D muscle map with today's numbers floating round it
// (heart rate and HRV from Apple Health, calories, water, steps), then
// sleep, mood and weight below. Water and weight log right here via
// components/BodyLogSheets.tsx; the rest open their own screens.
//
// Spin the figure, pinch in, tap a zone (the chest, a thigh) → a strip of
// its muscles; tap a muscle → a floating panel with its recovery, a GOAL
// (one of the user's categories — rename, recolour, add, delete) and GO,
// the exercises that work it. Everything persists locally via
// lib/body-map.ts.
// ─────────────────────────────────────────────────────────────────────────

import { useCallback, useEffect, useRef, useState } from 'react';
import {
  View, Text, StyleSheet, ScrollView, Pressable, Animated, TextInput, Modal,
  useWindowDimensions, KeyboardAvoidingView, Platform, Alert, ActivityIndicator,
} from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';
import { useFocusEffect, useRouter } from 'expo-router';
import { MaterialCommunityIcons } from '@expo/vector-icons';
import * as Haptics from 'expo-haptics';
import { C, F, SPRING, numFace } from '@/lib/theme';
import {
  REGIONS, REGION_BY_ID, loadBodyMap, saveBodyMap,
  type BodyMap, type Category, type Tone,
} from '@/lib/body-map';
import { BodyStage, Battery, TONE, batteryTone, type Facing, type HudStat } from '@/components/body/BodyStage';
import { ZONE_BY_ID, ZONE_OF, type Zone } from '@/lib/body-mesh';
import { getExercises, getTrainingSessions, type Exercise } from '@/lib/workout-data';
import {
  baseOf, byExercise, hasBattery, muscleStatus, suggestionsFor, type MuscleStatus, type Session,
} from '@/lib/muscle-recovery';
import { toDateKey } from '@/lib/dateKey';
import { Board, BoardRow } from '@/components/Board';
import { WaterSheet, WeightSheet } from '@/components/BodyLogSheets';
import {
  loadBodyData, pullRemoteBody, refreshAppleHealthIfConnected,
  todaySteps, todayWaterMl, latestWeight, formatSleep, type BodyData,
} from '@/lib/body-data';
import { connectAndSyncAppleHealth } from '@/lib/apple-health';
import { getMealsForDate, dailyTotals, getTargets, todayKey } from '@/lib/meals-data';
import { getTodayMood } from '@/lib/mood-data';

const SIDES: Facing[] = ['front', 'back'];

type Vitals = { kcal: number; kcalGoal: number; mood: number | null };

export default function BodyScreen() {
  const router = useRouter();
  const { width } = useWindowDimensions();
  const [map, setMap] = useState<BodyMap | null>(null);
  const [zone, setZone] = useState<string | null>(null);
  const [selected, setSelected] = useState<string | null>(null);
  const [focused, setFocused] = useState(true);
  const [going, setGoing] = useState(false);
  const [library, setLibrary] = useState<Exercise[]>([]);
  const [filter, setFilter] = useState<string | null>(null);
  const [side, setSide] = useState<Facing>('front');
  const [stageZoomed, setStageZoomed] = useState(false);
  const [editing, setEditing] = useState(false);
  const [body, setBody] = useState<BodyData | null>(null);
  const [vitals, setVitals] = useState<Vitals>({ kcal: 0, kcalGoal: 0, mood: null });
  const [sheet, setSheet] = useState<'water' | 'weight' | null>(null);
  const [healthSyncing, setHealthSyncing] = useState(false);
  const [sessions, setSessions] = useState<Session[]>([]);

  useEffect(() => { loadBodyMap().then(setMap); }, []);

  useFocusEffect(useCallback(() => {
    // Water/weight logged by the voice device land server-side; pull, then re-read.
    void pullRemoteBody().then(found => { if (found) loadBodyData().then(setBody); });
    loadBodyData().then(d => {
      setBody(d);
      if (d.appleHealthConnected) void refreshAppleHealthIfConnected().then(u => { if (u) setBody(u); });
    });
    void Promise.all([getMealsForDate(todayKey()), getTargets(), getTodayMood()]).then(([meals, t, mood]) =>
      setVitals({ kcal: dailyTotals(meals).calories, kcalGoal: t.calories, mood: mood?.moodScore ?? null }));
    void getTrainingSessions().then(setSessions).catch(() => {});
    void getExercises().then(setLibrary);
    setFocused(true);
    return () => setFocused(false);
  }, []));

  async function syncAppleHealth() {
    if (healthSyncing) return;
    setHealthSyncing(true);
    const result = await connectAndSyncAppleHealth(56);
    setHealthSyncing(false);
    if (result.ok && result.data) { setBody(result.data); Haptics.notificationAsync(Haptics.NotificationFeedbackType.Success); return; }
    Alert.alert('Apple Health', result.error ?? 'Could not connect to Apple Health.');
  }

  const update = useCallback((fn: (m: BodyMap) => BodyMap) => {
    setMap(prev => {
      if (!prev) return prev;
      const next = fn(prev);
      saveBodyMap(next);
      return next;
    });
  }, []);

  // From the TARGETS list or the zone strip: straight to the muscle.
  const select = (id: string) => {
    Haptics.selectionAsync();
    setZone(ZONE_OF[id]);
    setSelected(id);
  };

  // A tap on the figure: a muscle outside the framed zone frames its zone,
  // one inside picks it; empty space backs out one level.
  const pick = (id: string | null) => {
    if (!id) {
      if (selected) setSelected(null);
      else setZone(null);
    } else if (ZONE_OF[id] === zone) setSelected(id);
    else { setSelected(null); setZone(ZONE_OF[id]); }
  };
  const home = () => { setSelected(null); setZone(null); };

  const assign = (regionId: string, categoryId: string) => {
    Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Light);
    update(m => {
      const cur = m.marks[regionId];
      const marks = { ...m.marks };
      if (cur?.category === categoryId) delete marks[regionId];
      else marks[regionId] = { ...cur, category: categoryId };
      return { ...m, marks };
    });
  };

  if (!map) return <SafeAreaView style={styles.safe} />;

  const selBase = selected ? baseOf(selected) : null;
  const status = selBase ? muscleStatus(selBase, sessions, Date.now()) : null;
  const battery = selBase && status && hasBattery(selBase) ? status.pct : null;
  const batteryOf = (id: string) => (hasBattery(baseOf(id)) ? muscleStatus(baseOf(id), sessions, Date.now()).pct : null);
  // A framed zone's battery: the average of its muscles that have one.
  const zonePcts = zone ? ZONE_BY_ID[zone].muscles.map(batteryOf).filter((p): p is number => p != null) : [];
  const zoneBattery = zonePcts.length ? Math.round(zonePcts.reduce((a, b) => a + b, 0) / zonePcts.length) : null;

  // Today's numbers around the figure, each tied to where it lives on the body.
  const heart = body?.heart;
  const noHeart = body?.appleHealthConnected ? 'NO READING' : 'TAP TO CONNECT';
  const hud: HudStat[] = body ? [
    { id: 'hr', label: 'HEART', value: heart?.bpm != null ? String(heart.bpm) : '—', unit: 'BPM',
      sub: heart?.avgBpm != null ? `AVG ${heart.avgBpm}` : noHeart, onPress: syncAppleHealth },
    { id: 'hrv', label: 'HRV', value: heart?.hrvMs != null ? String(heart.hrvMs) : '—', unit: 'MS',
      sub: heart?.hrvAvgMs != null ? `7 DAY AVG ${heart.hrvAvgMs}` : noHeart, onPress: syncAppleHealth },
    { id: 'kcal', label: 'CALORIES', value: String(vitals.kcal), unit: 'KCAL',
      sub: vitals.kcalGoal ? `OF ${vitals.kcalGoal}` : 'TODAY', onPress: () => router.push('/calorie') },
    { id: 'water', label: 'WATER', value: (todayWaterMl(body) / 1000).toFixed(1), unit: 'L',
      sub: 'TAP TO ADD', onPress: () => setSheet('water') },
    { id: 'steps', label: 'STEPS', value: todaySteps(body).toLocaleString(), unit: '',
      sub: `OF ${body.stepsGoal.toLocaleString()}`, onPress: () => router.push('/steps') },
  ] : [];

  const stageH = Math.min(580, Math.round(width * 1.36));
  const counts = Object.values(map.marks).reduce<Record<string, number>>((a, m) => ({ ...a, [m.category]: (a[m.category] ?? 0) + 1 }), {});
  const targets = REGIONS.filter(r => map.marks[r.id]).sort((a, b) =>
    map.categories.findIndex(c => c.id === map.marks[a.id].category) - map.categories.findIndex(c => c.id === map.marks[b.id].category));

  return (
    <SafeAreaView style={styles.safe} edges={['top']}>
      <ScrollView contentContainerStyle={{ paddingBottom: selected ? 440 : zone ? 200 : 40 }} showsVerticalScrollIndicator={false} scrollEnabled={!stageZoomed}>
        <View style={styles.header}>
          <View>
            <Text style={styles.eyebrow}>{`${targets.length} TARGETS · ${REGIONS.length} MUSCLES`}</Text>
            <Text style={styles.title}>BODY</Text>
          </View>
          <View style={styles.headerRight}>
            <View style={styles.views}>
              {SIDES.map(v => (
                <Pressable
                  key={v}
                  onPress={() => { if (v !== side) { Haptics.selectionAsync(); setSide(v); } }}
                  style={[styles.view, side === v && styles.viewOn]}
                  hitSlop={4}
                >
                  <Text style={[styles.viewText, side === v && styles.viewTextOn]}>{v.toUpperCase()}</Text>
                </Pressable>
              ))}
            </View>
            <Pressable onPress={() => setEditing(true)} style={styles.iconBtn} hitSlop={8} accessibilityLabel="Edit categories">
              <MaterialCommunityIcons name="tune-variant" size={17} color={C.ink} />
            </Pressable>
          </View>
        </View>

        <BodyStage
          width={width}
          height={stageH}
          map={map}
          facing={side}
          zone={zone}
          selected={selected}
          filter={filter}
          active={focused}
          battery={selected ? battery : zoneBattery}
          onPick={pick}
          onHome={home}
          onFacing={setSide}
          onZoomed={setStageZoomed}
          hud={hud}
          pulse={heart?.bpm ?? null}
        />

        <Text style={styles.hint}>DRAG TO SPIN · PINCH TO ZOOM · TAP TO ZOOM IN</Text>

        <ScrollView horizontal showsHorizontalScrollIndicator={false} contentContainerStyle={styles.legend}>
          {map.categories.map(c => {
            const on = filter === c.id;
            return (
              <Pressable key={c.id} onPress={() => setFilter(on ? null : c.id)} style={[styles.legendChip, on && { borderColor: TONE[c.tone] }]}>
                <View style={[styles.swatch, { backgroundColor: TONE[c.tone] }]} />
                <Text style={[styles.legendText, on && { color: C.hot }]}>{c.name}</Text>
                <Text style={styles.legendCount}>{counts[c.id] ?? 0}</Text>
              </Pressable>
            );
          })}
        </ScrollView>

        <Board title="TARGETS" empty={targets.length === 0 ? 'NOTHING TARGETED YET' : undefined}>
          {targets.map((r, i) => {
            const mk = map.marks[r.id];
            const cat = map.categories.find(c => c.id === mk.category);
            return (
              <BoardRow key={r.id} index={i + 1} last={i === targets.length - 1} onPress={() => select(r.id)}
                label={r.name}
                sub={mk.note}
                right={<Text style={[styles.rowTag, cat && { color: TONE[cat.tone] }]}>{cat?.name ?? ''}</Text>}
              />
            );
          })}
        </Board>

        {body && (
          <>
              <Text style={styles.sectionTitle}>VITALS</Text>
              <View style={styles.vitals}>
                <Vital i={0} label="SLEEP" value={body.sleepMins != null ? formatSleep(body.sleepMins) : '—'} sub="LAST NIGHT" onPress={() => router.push('/modals/sleep-detail')} />
                <Vital i={1} label="MOOD" value={vitals.mood != null ? `${vitals.mood}/10` : '—'} sub={vitals.mood != null ? 'TODAY' : 'TAP TO LOG'} onPress={() => router.push('/modals/mood')} />
                <Vital i={2} label="WEIGHT" value={latestWeight(body) > 0 ? latestWeight(body).toFixed(1) : '—'} sub="KG · TAP TO LOG" onPress={() => setSheet('weight')} />
              </View>

              <Board title="MORE">
                {Platform.OS === 'ios' && (
                  <BoardRow index={1} label="APPLE HEALTH"
                    sub={body.appleHealthLastSync
                      ? `Synced ${new Date(body.appleHealthLastSync).toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' })}`
                      : body.appleHealthConnected ? 'Tap to sync' : 'Connect steps, sleep and weight'}
                    right={healthSyncing ? <ActivityIndicator size="small" color={C.hot} /> : <MaterialCommunityIcons name="sync" size={16} color={C.dim} />}
                    onPress={syncAppleHealth} />
                )}
                <BoardRow index={Platform.OS === 'ios' ? 2 : 1} label="CYCLE TRACKING" sub="Private, off by default" last
                  right={<MaterialCommunityIcons name="arrow-right" size={16} color={C.dim} />}
                  onPress={() => router.push('/modals/cycle-tracking')} />
              </Board>

              <Text style={styles.credit}>Anatomy model: Z-Anatomy (CC BY-SA 4.0), from BodyParts3D © DBCLS (CC BY 4.0).</Text>

              <WaterSheet visible={sheet === 'water'} data={body} onData={setBody} onClose={() => setSheet(null)} />
              <WeightSheet visible={sheet === 'weight'} data={body} onData={setBody} onClose={() => setSheet(null)} />
          </>
        )}
      </ScrollView>

      <AssignPanel
        map={map}
        zone={zone}
        regionId={selected}
        status={status}
        battery={battery}
        batteryOf={batteryOf}
        onPick={select}
        onAssign={assign}
        onNote={(id, note) => update(m => m.marks[id] ? { ...m, marks: { ...m.marks, [id]: { ...m.marks[id], note } } } : m)}
        onClose={() => (selected ? setSelected(null) : setZone(null))}
        onNewCategory={() => setEditing(true)}
        onGo={() => setGoing(true)}
      />

      <GoSheet
        visible={going && !!selected}
        regionId={selected}
        status={status}
        library={library}
        onClose={() => setGoing(false)}
      />

      <CategoryEditor
        visible={editing}
        categories={map.categories}
        onClose={() => setEditing(false)}
        onChange={categories => update(m => {
          const ids = new Set(categories.map(c => c.id));
          const marks = Object.fromEntries(Object.entries(m.marks).filter(([, v]) => ids.has(v.category)));
          return { categories, marks };
        })}
      />
    </SafeAreaView>
  );
}

// ── vitals tile ──────────────────────────────────────────────────────────

function Vital({ i, label, value, sub, onPress }: { i: number; label: string; value: string; sub: string; onPress: () => void }) {
  // Hairlines between tiles only — the grid's own border closes the outside.
  const edges = { borderRightWidth: i % 3 === 2 ? 0 : 1 };
  return (
    <Pressable onPress={onPress} style={({ pressed }) => [styles.vital, edges, pressed && { backgroundColor: C.raised }]}>
      <Text style={styles.vitalLabel}>{label}</Text>
      <Text style={[styles.vitalValue, numFace(value, 20)]} numberOfLines={1} adjustsFontSizeToFit>{value}</Text>
      <Text style={styles.vitalSub} numberOfLines={1}>{sub}</Text>
    </Pressable>
  );
}

// ── floating assign panel ────────────────────────────────────────────────

// A framed zone shows a strip of its muscles; a picked muscle shows the
// full panel.
function AssignPanel({ map, zone, regionId, status, battery, batteryOf, onPick, onAssign, onNote, onClose, onNewCategory, onGo }: {
  map: BodyMap; zone: string | null; regionId: string | null; status: MuscleStatus | null; battery: number | null;
  batteryOf: (id: string) => number | null; onPick: (id: string) => void;
  onAssign: (id: string, cat: string) => void; onNote: (id: string, note: string) => void;
  onClose: () => void; onNewCategory: () => void; onGo: () => void;
}) {
  const y = useRef(new Animated.Value(400)).current;
  const showing = regionId ?? (zone ? `zone:${zone}` : null);
  const [shown, setShown] = useState<string | null>(showing);
  const [note, setNote] = useState('');
  const [goalOpen, setGoalOpen] = useState(false);

  useEffect(() => {
    setGoalOpen(false);
    if (showing) {
      setShown(showing);
      if (regionId) setNote(map.marks[regionId]?.note ?? '');
      y.setValue(60);
      Animated.spring(y, { toValue: 0, ...SPRING.pop }).start();
    } else {
      Animated.timing(y, { toValue: 400, duration: 200, useNativeDriver: true }).start(() => setShown(null));
    }
  }, [showing]);

  if (!shown) return null;

  // One wrapper for both, so the slide-in isn't cut short by a remount
  // when a zone's strip turns into a muscle's panel.
  const framed = shown.startsWith('zone:') ? ZONE_BY_ID[shown.slice(5)] : null;
  const region = REGION_BY_ID[shown];
  const mark = map.marks[shown];
  const cat = mark ? map.categories.find(c => c.id === mark.category) : undefined;

  return (
    <KeyboardAvoidingView behavior={Platform.OS === 'ios' ? 'position' : undefined} style={styles.panelWrap} pointerEvents="box-none">
      <Animated.View style={[styles.panel, { transform: [{ translateY: y }] }]}>
        {framed ? <ZoneStrip zone={framed} batteryOf={batteryOf} onPick={onPick} onClose={onClose} /> : (
          <>
          <View style={styles.panelHead}>
            <View style={{ flex: 1 }}>
              <Text style={styles.panelEyebrow}>{region.side ? `${region.group}  ${region.side === 'l' ? 'LEFT' : 'RIGHT'}` : region.group}</Text>
              <Text style={styles.panelTitle}>{region.name}</Text>
            </View>
            <Pressable onPress={onClose} hitSlop={10} style={{ marginLeft: 10 }}>
              <MaterialCommunityIcons name="close" size={20} color={C.dim} />
            </Pressable>
          </View>

          {status && battery != null && <Recovery status={status} battery={battery} />}

          <View style={styles.actions}>
            <Pressable onPress={() => setGoalOpen(o => !o)} style={[styles.action, goalOpen && { borderColor: C.live }]}>
              <View style={styles.actionTop}>
                <Text style={styles.actionLabel}>GOAL</Text>
                <MaterialCommunityIcons name={goalOpen ? 'chevron-up' : 'chevron-down'} size={16} color={C.live} />
              </View>
              <View style={styles.actionValue}>
                {cat && <View style={[styles.swatch, { backgroundColor: TONE[cat.tone] }]} />}
                <Text style={[styles.actionValueText, cat && { color: TONE[cat.tone] }]} numberOfLines={1}>{cat?.name ?? 'NONE SET'}</Text>
              </View>
            </Pressable>
            <Pressable onPress={onGo} style={({ pressed }) => [styles.action, pressed && { borderColor: C.live }]}>
              <View style={styles.actionTop}>
                <Text style={styles.actionLabel}>GO</Text>
                <MaterialCommunityIcons name="arrow-right" size={16} color={C.live} />
              </View>
              <Text style={styles.actionValueText}>WORKOUTS</Text>
            </Pressable>
          </View>

          {goalOpen && (
            <View style={styles.dropdown}>
              {map.categories.map((c, i) => {
                const on = mark?.category === c.id;
                return (
                  <Pressable key={c.id} onPress={() => { onAssign(shown, c.id); setGoalOpen(false); }}
                    style={({ pressed }) => [styles.option, i > 0 && styles.optionRule, pressed && { backgroundColor: C.surface }]}>
                    <View style={[styles.swatch, { backgroundColor: TONE[c.tone] }]} />
                    <Text style={[styles.optionText, on && { color: TONE[c.tone] }]}>{c.name}</Text>
                    {on && <MaterialCommunityIcons name="check" size={16} color={TONE[c.tone]} />}
                  </Pressable>
                );
              })}
              <Pressable onPress={onNewCategory} style={({ pressed }) => [styles.option, styles.optionRule, pressed && { backgroundColor: C.surface }]}>
                <Text style={[styles.optionText, { color: C.dim }]}>+ NEW GOAL</Text>
              </Pressable>
            </View>
          )}

          {mark && (
            <TextInput
              style={styles.note}
              value={note}
              onChangeText={setNote}
              onEndEditing={() => onNote(shown, note.trim())}
              placeholder="Note — e.g. lagging side, 3x/wk, tweaked Tue"
              placeholderTextColor={C.faint}
              returnKeyType="done"
            />
          )}
          </>
        )}
      </Animated.View>
    </KeyboardAvoidingView>
  );
}

function ZoneStrip({ zone, batteryOf, onPick, onClose }: {
  zone: Zone; batteryOf: (id: string) => number | null; onPick: (id: string) => void; onClose: () => void;
}) {
  const oneSide = /\.[lr]$/.test(zone.id); // 'L THIGH' — drop the L from each muscle
  return (
    <>
      <View style={styles.panelHead}>
        <View style={{ flex: 1 }}>
          <Text style={styles.panelEyebrow}>{`${zone.muscles.length} MUSCLES · TAP ONE`}</Text>
          <Text style={styles.panelTitle}>{zone.name}</Text>
        </View>
        <Pressable onPress={onClose} hitSlop={10} style={{ marginLeft: 10 }}>
          <MaterialCommunityIcons name="close" size={20} color={C.dim} />
        </Pressable>
      </View>
      <ScrollView horizontal showsHorizontalScrollIndicator={false} contentContainerStyle={styles.zoneStrip}>
        {zone.muscles.map(id => {
          const pct = batteryOf(id);
          const name = REGION_BY_ID[id].name;
          return (
            <Pressable key={id} onPress={() => onPick(id)} style={({ pressed }) => [styles.zoneChip, pressed && { backgroundColor: C.surface }]}>
              <Text style={styles.zoneChipName} numberOfLines={1}>{oneSide ? name.slice(2) : name}</Text>
              {pct != null && <Text style={[numFace(`${pct}%`, 13), { color: batteryTone(pct) }]}>{`${pct}%`}</Text>}
            </Pressable>
          );
        })}
      </ScrollView>
    </>
  );
}

// ── recovery: battery, last worked, recent exercises ─────────────────────

const DAY = 86_400_000;
const WEEKDAY = ['SUN', 'MON', 'TUE', 'WED', 'THU', 'FRI', 'SAT'];

function daysAgo(at: number) {
  const a = new Date(at), b = new Date();
  const midnight = (d: Date) => new Date(d.getFullYear(), d.getMonth(), d.getDate()).getTime();
  return Math.round((midnight(b) - midnight(a)) / DAY);
}
function agoText(at: number) {
  const d = daysAgo(at);
  return d <= 0 ? 'TODAY' : d === 1 ? 'YESTERDAY' : `${d} DAYS AGO`;
}
function readyText(readyAt: number | null) {
  if (readyAt == null || readyAt <= Date.now()) return 'NOW';
  const h = Math.ceil((readyAt - Date.now()) / 3_600_000);
  return h < 36 ? `IN ${h}H` : `IN ${Math.round(h / 24)} DAYS`;
}
function dayTag(s: Session) {
  if (s.date === toDateKey(new Date())) return 'TODAY';
  const [y, m, d] = s.date.split('-').map(Number);
  return `${WEEKDAY[new Date(y, m - 1, d).getDay()]} ${d}`;
}

function Recovery({ status, battery }: { status: MuscleStatus; battery: number }) {
  const recent = byExercise(status.hits).slice(0, 4);
  return (
    <View style={styles.rec}>
      <View style={styles.recTop}>
        <View>
          <Text style={styles.panelLabelTight}>RECOVERY</Text>
          <Battery pct={battery} cells={12} cellW={8} cellH={14} />
        </View>
        <View style={styles.recFacts}>
          <View style={styles.recFact}>
            <Text style={styles.recFactLabel}>LAST WORKED</Text>
            <Text style={styles.recFactValue}>{status.lastAt ? agoText(status.lastAt) : 'NOT RECENTLY'}</Text>
          </View>
          <View style={styles.recFact}>
            <Text style={styles.recFactLabel}>READY</Text>
            <Text style={[styles.recFactValue, { color: batteryTone(battery) }]}>{readyText(status.readyAt)}</Text>
          </View>
        </View>
      </View>

      <Text style={styles.panelLabel}>RECENT EXERCISES</Text>
      {recent.length === 0 ? (
        <Text style={styles.recEmpty}>Nothing in the last 3 weeks has worked this.</Text>
      ) : recent.map(({ session: s, share, times }) => (
        <View key={s.exerciseId} style={styles.recRow}>
          <View style={[styles.recShare, { opacity: 0.35 + share * 0.65 }]} />
          <View style={{ flex: 1 }}>
            <Text style={styles.recName} numberOfLines={1}>{s.name}</Text>
            <Text style={styles.recDetail} numberOfLines={1}>
              {s.measured
                ? `${s.sets} ${s.sets === 1 ? 'set' : 'sets'} · best ${s.weightKg}kg × ${s.reps ?? '?'}`
                : `${s.sets} × ${s.reps ?? '?'} @ ${s.weightKg}kg · planned`}
              {times > 1 ? ` · ${times}× in 3 wks` : ''}
              {share < 0.95 ? ' · assist' : ''}
            </Text>
          </View>
          <Text style={styles.recDay}>{dayTag(s)}</Text>
        </View>
      ))}
    </View>
  );
}

// ── GO: exercises that work the muscle ───────────────────────────────────

function GoSheet({ visible, regionId, status, library, onClose }: {
  visible: boolean; regionId: string | null; status: MuscleStatus | null; library: Exercise[]; onClose: () => void;
}) {
  const region = regionId ? REGION_BY_ID[regionId] : null;
  const base = regionId ? baseOf(regionId) : '';
  const recent = status ? byExercise(status.hits) : [];
  const more = region ? suggestionsFor(base, status?.hits ?? [], library) : [];
  const role = (share: number) => (share >= 0.95 ? 'Primary' : share >= 0.6 ? 'Strong assist' : 'Assist');
  return (
    <Modal visible={visible} animationType="slide" presentationStyle="pageSheet" onRequestClose={onClose}>
      <View style={styles.editor}>
        <View style={styles.editorHead}>
          <View style={{ flex: 1 }}>
            <Text style={styles.panelEyebrow}>GO</Text>
            <Text style={styles.editorTitle} numberOfLines={1} adjustsFontSizeToFit>{region ? (region.side ? region.name.slice(2) : region.name) : ''}</Text>
          </View>
          <Pressable onPress={onClose} style={styles.doneBtn}><Text style={styles.doneText}>DONE</Text></Pressable>
        </View>
        <ScrollView contentContainerStyle={{ paddingBottom: 40 }}>
          <Text style={styles.panelLabel}>{`DONE RECENTLY · ${recent.length}`}</Text>
          {recent.length === 0 ? (
            <Text style={styles.recEmpty}>Nothing in the last 3 weeks has worked this.</Text>
          ) : recent.map(({ session: s, share, times }) => (
            <View key={s.exerciseId} style={styles.goRow}>
              <View style={[styles.recShare, { opacity: 0.35 + share * 0.65 }]} />
              <View style={{ flex: 1 }}>
                <Text style={styles.recName} numberOfLines={1}>{s.name}</Text>
                <Text style={styles.recDetail} numberOfLines={1}>{`${role(share)} · ${times}× in 3 wks · ${s.weightKg}kg best`}</Text>
              </View>
              <Text style={styles.recDay}>{dayTag(s)}</Text>
            </View>
          ))}

          <Text style={[styles.panelLabel, { marginTop: 22 }]}>{`RECOMMENDED · ${more.length}`}</Text>
          {more.length === 0 ? (
            <Text style={styles.recEmpty}>No lifts aimed at this one — it works as part of bigger movements.</Text>
          ) : more.map(x => (
            <View key={x.name} style={styles.goRow}>
              <View style={[styles.recShare, { opacity: 0.35 + x.share * 0.65 }]} />
              <View style={{ flex: 1 }}>
                <Text style={styles.recName} numberOfLines={1}>{x.name.toUpperCase()}</Text>
                <Text style={styles.recDetail} numberOfLines={1}>{x.mine ? `${role(x.share)} · in your library` : role(x.share)}</Text>
              </View>
            </View>
          ))}
        </ScrollView>
      </View>
    </Modal>
  );
}

// ── category editor ──────────────────────────────────────────────────────

const TONES: Tone[] = ['hot', 'signal', 'live', 'dim', 'alert'];

function CategoryEditor({ visible, categories, onChange, onClose }: {
  visible: boolean; categories: Category[]; onChange: (c: Category[]) => void; onClose: () => void;
}) {
  const [draft, setDraft] = useState(categories);
  useEffect(() => { if (visible) setDraft(categories); }, [visible]);
  const save = () => {
    onChange(draft.map(c => ({ ...c, name: c.name.trim().toUpperCase() || 'UNTITLED' })));
    onClose();
  };
  return (
    <Modal visible={visible} animationType="slide" presentationStyle="pageSheet" onRequestClose={save}>
      <View style={styles.editor}>
        <View style={styles.editorHead}>
          <Text style={styles.editorTitle}>CATEGORIES</Text>
          <Pressable onPress={save} style={styles.doneBtn}><Text style={styles.doneText}>DONE</Text></Pressable>
        </View>
        <Text style={styles.editorSub}>Name what you're aiming at. Deleting one clears the regions tagged with it.</Text>
        <ScrollView contentContainerStyle={{ gap: 10, paddingBottom: 40 }} keyboardShouldPersistTaps="handled">
          {draft.map((c, i) => (
            <View key={c.id} style={styles.editRow}>
              <TextInput
                style={styles.editName}
                value={c.name}
                autoCapitalize="characters"
                maxLength={14}
                onChangeText={name => setDraft(d => d.map((x, j) => (j === i ? { ...x, name } : x)))}
              />
              <View style={styles.tones}>
                {TONES.map(t => (
                  <Pressable key={t} onPress={() => setDraft(d => d.map((x, j) => (j === i ? { ...x, tone: t } : x)))}
                    style={[styles.tone, { backgroundColor: TONE[t] }, c.tone === t && styles.toneOn]} />
                ))}
              </View>
              <Pressable onPress={() => setDraft(d => d.filter((_, j) => j !== i))} hitSlop={8}>
                <MaterialCommunityIcons name="trash-can-outline" size={18} color={C.dim} />
              </Pressable>
            </View>
          ))}
          <Pressable
            style={styles.addCat}
            onPress={() => setDraft(d => [...d, { id: `c${Date.now().toString(36)}`, name: 'NEW', tone: TONES[d.length % TONES.length] }])}
          >
            <Text style={styles.addCatText}>+ ADD CATEGORY</Text>
          </Pressable>
        </ScrollView>
      </View>
    </Modal>
  );
}

const styles = StyleSheet.create({
  safe: { flex: 1, backgroundColor: C.bg },
  header: { flexDirection: 'row', alignItems: 'flex-end', justifyContent: 'space-between', paddingHorizontal: 20, paddingTop: 10, marginBottom: 6 },
  headerRight: { flexDirection: 'row', alignItems: 'center', gap: 8, marginBottom: 4 },
  iconBtn: { width: 40, height: 40, borderRadius: 20, borderWidth: 1, borderColor: C.lineHi, alignItems: 'center', justifyContent: 'center' },
  eyebrow: { fontFamily: F.dot, fontSize: 10, color: C.dim, letterSpacing: 2 },
  title: { fontFamily: F.dot, fontSize: 40, color: C.ink, letterSpacing: 2, marginTop: 4 },
  views: { flexDirection: 'row', borderWidth: 1, borderColor: C.lineHi, borderRadius: 999, padding: 3 },
  view: { alignItems: 'center', justifyContent: 'center', minHeight: 34, paddingHorizontal: 12, borderRadius: 999 },
  viewOn: { backgroundColor: C.hot },
  viewText: { fontFamily: F.dot, fontSize: 10, color: C.dim, letterSpacing: 1.5 },
  viewTextOn: { color: C.onHot },

  hint: { fontFamily: F.mono, fontSize: 10, color: C.faint, letterSpacing: 1, textAlign: 'center', marginTop: 2 },
  credit: { fontFamily: F.mono, fontSize: 9, color: C.faint, textAlign: 'center', marginHorizontal: 24, marginTop: 16, lineHeight: 13 },
  legend: { gap: 8, paddingHorizontal: 16, paddingVertical: 14 },
  legendChip: { flexDirection: 'row', alignItems: 'center', gap: 7, borderWidth: 1, borderColor: C.line, borderRadius: 999, paddingHorizontal: 14, minHeight: 38 },
  legendText: { fontFamily: F.dot, fontSize: 11, color: C.dim, letterSpacing: 1.5 },
  legendCount: { fontFamily: F.dot, fontSize: 11, color: C.faint },
  swatch: { width: 7, height: 7 },

  rowTag: { fontFamily: F.dot, fontSize: 11, color: C.dim, letterSpacing: 1.5 },

  sectionTitle: { fontFamily: F.dot, fontSize: 11, color: C.dim, letterSpacing: 3, marginHorizontal: 20, marginTop: 18, marginBottom: 8 },
  vitals: { flexDirection: 'row', flexWrap: 'wrap', marginHorizontal: 16, borderWidth: 1, borderColor: C.line, borderRadius: 16, overflow: 'hidden', backgroundColor: C.surface },
  vital: { width: '33.333%', paddingHorizontal: 12, paddingVertical: 12, borderColor: C.line, gap: 3 },
  vitalLabel: { fontFamily: F.dot, fontSize: 9, color: C.dim, letterSpacing: 1.5 },
  vitalValue: { color: C.ink },
  vitalSub: { fontFamily: F.dot, fontSize: 9, color: C.dim, letterSpacing: 1 },

  panelWrap: { position: 'absolute', left: 0, right: 0, bottom: 0 },
  panel: {
    margin: 10, padding: 16, borderRadius: 22, backgroundColor: C.raised,
    borderWidth: 1, borderColor: C.lineHi,
    shadowColor: '#000', shadowOpacity: 0.6, shadowRadius: 24, shadowOffset: { width: 0, height: 10 },
  },
  panelHead: { flexDirection: 'row', alignItems: 'center' },
  panelEyebrow: { fontFamily: F.dot, fontSize: 9, color: C.dim, letterSpacing: 2 },
  panelTitle: { fontFamily: F.dot, fontSize: 22, color: C.ink, letterSpacing: 1, marginTop: 3 },
  panelLabel: { fontFamily: F.dot, fontSize: 9, color: C.faint, letterSpacing: 2, marginTop: 14, marginBottom: 8 },
  panelLabelTight: { fontFamily: F.dot, fontSize: 9, color: C.faint, letterSpacing: 2, marginBottom: 2 },
  rec: { marginTop: 12 },
  recTop: { flexDirection: 'row', alignItems: 'flex-end', justifyContent: 'space-between', gap: 12, paddingTop: 12, borderTopWidth: 1, borderTopColor: C.line },
  recFacts: { flexDirection: 'row', gap: 14 },
  recFact: { alignItems: 'flex-end' },
  recFactLabel: { fontFamily: F.dot, fontSize: 8, color: C.faint, letterSpacing: 1.5 },
  recFactValue: { fontFamily: F.dot, fontSize: 12, color: C.ink, letterSpacing: 1, marginTop: 4 },
  recEmpty: { fontFamily: F.mono, fontSize: 12, color: C.dim },
  recRow: { flexDirection: 'row', alignItems: 'center', gap: 10, paddingVertical: 6 },
  recShare: { width: 3, alignSelf: 'stretch', backgroundColor: C.hot, borderRadius: 2 },
  recName: { fontFamily: F.dot, fontSize: 12, color: C.ink, letterSpacing: 1 },
  recDetail: { fontFamily: F.mono, fontSize: 11, color: C.dim, marginTop: 2 },
  recDay: { fontFamily: F.dot, fontSize: 10, color: C.dim, letterSpacing: 1.5 },
  zoneStrip: { gap: 8, paddingTop: 12 },
  zoneChip: { borderWidth: 1, borderColor: C.lineHi, borderRadius: 12, paddingHorizontal: 12, paddingVertical: 9, gap: 4, minWidth: 92 },
  zoneChipName: { fontFamily: F.dot, fontSize: 10, color: C.ink, letterSpacing: 1 },
  actions: { flexDirection: 'row', gap: 10, marginTop: 14 },
  action: { flex: 1, borderWidth: 1, borderColor: C.lineHi, borderRadius: 14, paddingHorizontal: 12, paddingVertical: 10, gap: 6 },
  actionTop: { flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between' },
  actionLabel: { fontFamily: F.dot, fontSize: 15, color: C.live, letterSpacing: 2 },
  actionValue: { flexDirection: 'row', alignItems: 'center', gap: 6 },
  actionValueText: { fontFamily: F.dot, fontSize: 10, color: C.dim, letterSpacing: 1.5, flexShrink: 1 },
  dropdown: { marginTop: 8, borderWidth: 1, borderColor: C.lineHi, borderRadius: 14, overflow: 'hidden' },
  option: { flexDirection: 'row', alignItems: 'center', gap: 10, paddingHorizontal: 14, minHeight: 42 },
  optionRule: { borderTopWidth: 1, borderTopColor: C.line },
  optionText: { flex: 1, fontFamily: F.dot, fontSize: 12, color: C.ink, letterSpacing: 1.5 },
  goRow: { flexDirection: 'row', alignItems: 'center', gap: 10, paddingVertical: 9, borderBottomWidth: 1, borderBottomColor: C.line },
  note: { marginTop: 12, borderWidth: 1, borderColor: C.line, borderRadius: 12, paddingHorizontal: 12, paddingVertical: 10, fontFamily: F.mono, fontSize: 13, color: C.ink, backgroundColor: C.bg },

  editor: { flex: 1, backgroundColor: C.bg, padding: 20 },
  editorHead: { flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between', marginTop: 6 },
  editorTitle: { fontFamily: F.dot, fontSize: 26, color: C.ink, letterSpacing: 2 },
  editorSub: { fontFamily: F.mono, fontSize: 12, color: C.dim, marginTop: 8, marginBottom: 18, lineHeight: 18 },
  doneBtn: { backgroundColor: C.hot, borderRadius: 999, paddingHorizontal: 16, paddingVertical: 8 },
  doneText: { fontFamily: F.dot, fontSize: 12, color: C.onHot, letterSpacing: 2 },
  editRow: { flexDirection: 'row', alignItems: 'center', gap: 12, borderWidth: 1, borderColor: C.line, borderRadius: 14, padding: 12, backgroundColor: C.surface },
  editName: { flex: 1, fontFamily: F.dot, fontSize: 15, color: C.ink, letterSpacing: 1, paddingVertical: 4 },
  tones: { flexDirection: 'row', gap: 7 },
  tone: { width: 18, height: 18, borderRadius: 4, opacity: 0.45 },
  toneOn: { opacity: 1, borderWidth: 2, borderColor: C.ink },
  addCat: { borderWidth: 1, borderStyle: 'dashed', borderColor: C.lineHi, borderRadius: 14, paddingVertical: 16, alignItems: 'center' },
  addCatText: { fontFamily: F.dot, fontSize: 12, color: C.ink, letterSpacing: 2 },
});
