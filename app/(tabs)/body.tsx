// ─────────────────────────────────────────────────────────────────────────
// BODY — the 3D muscle map + today's vitals (calories, sleep, mood,
// steps, water, weight). Water and weight log right here via
// components/BodyLogSheets.tsx; the rest open their own screens.
//
// Spin the figure, pinch in, tap a muscle → a floating panel assigns it a
// target category and a note. Categories are the user's own (rename,
// recolour, add, delete). Everything persists locally via lib/body-map.ts.
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
import { BodyStage, Battery, TONE, batteryTone, type Facing } from '@/components/body/BodyStage';
import { getTrainingSessions } from '@/lib/workout-data';
import { baseOf, hasBattery, muscleStatus, type Hit, type MuscleStatus, type Session } from '@/lib/muscle-recovery';
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
  const [selected, setSelected] = useState<string | null>(null);
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

  const select = (id: string | null) => {
    if (id) Haptics.selectionAsync();
    setSelected(id);
  };

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

  const stageH = Math.min(580, Math.round(width * 1.36));
  const counts = Object.values(map.marks).reduce<Record<string, number>>((a, m) => ({ ...a, [m.category]: (a[m.category] ?? 0) + 1 }), {});
  const targets = REGIONS.filter(r => map.marks[r.id]).sort((a, b) =>
    map.categories.findIndex(c => c.id === map.marks[a.id].category) - map.categories.findIndex(c => c.id === map.marks[b.id].category));

  return (
    <SafeAreaView style={styles.safe} edges={['top']}>
      <ScrollView contentContainerStyle={{ paddingBottom: selected ? 440 : 40 }} showsVerticalScrollIndicator={false} scrollEnabled={!stageZoomed}>
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
          selected={selected}
          filter={filter}
          battery={battery}
          onSelect={setSelected}
          onFacing={setSide}
          onZoomed={setStageZoomed}
        />

        <Text style={styles.hint}>DRAG TO SPIN · PINCH TO ZOOM · TAP A MUSCLE</Text>

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
              <Vital i={0} label="CALORIES" value={String(vitals.kcal)} sub={vitals.kcalGoal ? `OF ${vitals.kcalGoal}` : 'KCAL'} onPress={() => router.push('/calorie')} />
              <Vital i={1} label="SLEEP" value={body.sleepMins != null ? formatSleep(body.sleepMins) : '—'} sub="LAST NIGHT" onPress={() => router.push('/modals/sleep-detail')} />
              <Vital i={2} label="MOOD" value={vitals.mood != null ? `${vitals.mood}/10` : '—'} sub={vitals.mood != null ? 'TODAY' : 'TAP TO LOG'} onPress={() => router.push('/modals/mood')} />
              <Vital i={3} label="STEPS" value={todaySteps(body).toLocaleString()} sub={`OF ${body.stepsGoal.toLocaleString()}`} onPress={() => router.push('/steps')} />
              <Vital i={4} label="WATER" value={`${(todayWaterMl(body) / 1000).toFixed(1)}L`} sub="TAP TO ADD" onPress={() => setSheet('water')} />
              <Vital i={5} label="WEIGHT" value={latestWeight(body) > 0 ? latestWeight(body).toFixed(1) : '—'} sub="KG · TAP TO LOG" onPress={() => setSheet('weight')} />
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
        regionId={selected}
        status={status}
        battery={battery}
        onAssign={assign}
        onNote={(id, note) => update(m => m.marks[id] ? { ...m, marks: { ...m.marks, [id]: { ...m.marks[id], note } } } : m)}
        onClose={() => setSelected(null)}
        onNewCategory={() => setEditing(true)}
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
  const edges = { borderRightWidth: i % 3 === 2 ? 0 : 1, borderBottomWidth: i >= 3 ? 0 : 1 };
  return (
    <Pressable onPress={onPress} style={({ pressed }) => [styles.vital, edges, pressed && { backgroundColor: C.raised }]}>
      <Text style={styles.vitalLabel}>{label}</Text>
      <Text style={[styles.vitalValue, numFace(value, 20)]} numberOfLines={1} adjustsFontSizeToFit>{value}</Text>
      <Text style={styles.vitalSub} numberOfLines={1}>{sub}</Text>
    </Pressable>
  );
}

// ── floating assign panel ────────────────────────────────────────────────

function AssignPanel({ map, regionId, status, battery, onAssign, onNote, onClose, onNewCategory }: {
  map: BodyMap; regionId: string | null; status: MuscleStatus | null; battery: number | null;
  onAssign: (id: string, cat: string) => void; onNote: (id: string, note: string) => void;
  onClose: () => void; onNewCategory: () => void;
}) {
  const y = useRef(new Animated.Value(400)).current;
  const [shown, setShown] = useState<string | null>(regionId);
  const [note, setNote] = useState('');

  useEffect(() => {
    if (regionId) {
      setShown(regionId);
      setNote(map.marks[regionId]?.note ?? '');
      y.setValue(60);
      Animated.spring(y, { toValue: 0, ...SPRING.pop }).start();
    } else {
      Animated.timing(y, { toValue: 400, duration: 200, useNativeDriver: true }).start(() => setShown(null));
    }
  }, [regionId]);

  if (!shown) return null;
  const region = REGION_BY_ID[shown];
  const mark = map.marks[shown];

  return (
    <KeyboardAvoidingView behavior={Platform.OS === 'ios' ? 'position' : undefined} style={styles.panelWrap} pointerEvents="box-none">
      <Animated.View style={[styles.panel, { transform: [{ translateY: y }] }]}>
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

        <Text style={styles.panelLabel}>TARGET</Text>
        <View style={styles.catWrap}>
          {map.categories.map(c => {
            const on = mark?.category === c.id;
            return (
              <Pressable key={c.id} onPress={() => onAssign(shown, c.id)}
                style={[styles.cat, on && { backgroundColor: TONE[c.tone], borderColor: TONE[c.tone] }]}>
                {!on && <View style={[styles.swatch, { backgroundColor: TONE[c.tone] }]} />}
                <Text style={[styles.catText, on && { color: C.onHot }]}>{c.name}</Text>
              </Pressable>
            );
          })}
          <Pressable onPress={onNewCategory} style={[styles.cat, { borderStyle: 'dashed' }]}>
            <Text style={styles.catText}>+ NEW</Text>
          </Pressable>
        </View>

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
      </Animated.View>
    </KeyboardAvoidingView>
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
  // One row per exercise: its latest session, and how many in the window.
  const recent: (Hit & { times: number })[] = [];
  for (const h of status.hits) {
    const row = recent.find(r => r.session.exerciseId === h.session.exerciseId);
    if (row) row.times++;
    else recent.push({ ...h, times: 1 });
  }
  recent.splice(4);
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
  catWrap: { flexDirection: 'row', flexWrap: 'wrap', gap: 8 },
  cat: { flexDirection: 'row', alignItems: 'center', gap: 6, borderWidth: 1, borderColor: C.lineHi, borderRadius: 999, paddingHorizontal: 12, paddingVertical: 8 },
  catText: { fontFamily: F.dot, fontSize: 11, color: C.ink, letterSpacing: 1.5 },
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
