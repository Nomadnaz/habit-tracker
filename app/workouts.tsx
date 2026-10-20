// ─────────────────────────────────────────────────────────────────────────
// LOG WORKOUT — a session built from chips. The focus row picks the day
// (the coach's pick is marked; lib/coach.ts), the session is a stack of lift
// chips you can open (sets / reps / weight, send to puck, how-to), swap for
// a lift that works the same muscles, or throw out; the tray underneath
// holds what else fits the focus — tap one to drop it in. FINISH ticks the
// day off, which is what the coach and BODY's recovery read.
//
// Each focus is backed by a template ("PUSH DAY"), made with a starter
// lineup the first time (lib/routine.ts), so edits here stick for next time.
// ─────────────────────────────────────────────────────────────────────────

import { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import {
  Alert, Animated, LayoutAnimation, Platform, Pressable, ScrollView, StyleSheet, Text, TextInput, View, UIManager,
} from 'react-native';
import { SafeAreaView, useSafeAreaInsets } from 'react-native-safe-area-context';
import { useFocusEffect, useLocalSearchParams, useRouter } from 'expo-router';
import { MaterialCommunityIcons } from '@expo/vector-icons';
import * as Haptics from 'expo-haptics';

import {
  addExerciseToTemplate, createTemplate, getExercises, getJunctions, getTemplates, isDoneToday, markDoneToday,
  removeExerciseFromTemplate, replaceExerciseInTemplate, unmarkDoneToday, updateExercise, getSetsForDay,
  type Exercise, type Focus, type WorkoutTemplate,
} from '@/lib/workout-data';
import {
  alternativesFor, dayWord, FOCI, FOCUS_TITLE, focusOfName, LEVEL, liftReady, muscleWord, planSession, suggestFor,
  type Pick as Choice, type Resting, type Today,
} from '@/lib/coach';
import { bestE1rms, ensureFocusTemplate, exerciseFor, loadCoach, recalibrateStarterLifts } from '@/lib/routine';
import { musclesFor, type Session } from '@/lib/muscle-recovery';
import { difficulty, e1rmFor, equipmentOf, guideFor, nextWeight, patternOf, repRange, shiftReps, snapWeight, type Guide } from '@/lib/exercise-guide';
import { Stepper } from '@/components/train/Stepper';
import { DifficultyBar } from '@/components/train/DifficultyBar';
import { getBodyProfile, latestWeight, loadBodyData, type BodyProfile } from '@/lib/body-data';
import { useUnitPreference, formatWeightFromKg, formatWeightWithUnit } from '@/lib/unit-preference';
import { bleBridge } from '@/lib/ble-bridge';
import { toDateKey } from '@/lib/dateKey';
import { C, F, SPRING } from '@/lib/theme';
import { ScreenHeader } from '@/components/ScreenHeader';
import { ExerciseCard } from '@/components/ExerciseCard';

if (Platform.OS === 'android') UIManager.setLayoutAnimationEnabledExperimental?.(true);

const SHORT: Record<Focus, string> = { push: 'PUSH', pull: 'PULL', legs: 'LEGS', upper: 'UPPER', lower: 'LOWER', full: 'FULL BODY', core: 'CORE' };
const animate = () => LayoutAnimation.configureNext(LayoutAnimation.create(240, 'easeInEaseOut', 'opacity'));

type Row = { jid: string; ex: Exercise };
/** A focus, or one of your own templates by id. */
type Sel = { focus: Focus } | { templateId: string };

const topMuscles = (ex: { name: string; muscleGroups: Exercise['muscleGroups'] }) =>
  [...new Set(Object.entries(musclesFor(ex.name, ex.muscleGroups)).sort((a, b) => b[1] - a[1]).map(([m]) => muscleWord(m)))].slice(0, 2);

export default function LogWorkout() {
  const router = useRouter();
  const insets = useSafeAreaInsets();
  const params = useLocalSearchParams<{ focus?: string; templateId?: string }>();
  const { unitSystem } = useUnitPreference();

  const [today, setToday] = useState<Today | null>(null);
  const [sessions, setSessions] = useState<Session[]>([]);
  /** Resting lifts the user chose to train anyway. */
  const [forced, setForced] = useState<Set<string>>(new Set());
  const [sel, setSel] = useState<Sel | null>(null);
  const [template, setTemplate] = useState<WorkoutTemplate | null>(null);
  const [custom, setCustom] = useState<WorkoutTemplate[]>([]);
  const [rows, setRows] = useState<Row[]>([]);
  const [library, setLibrary] = useState<Exercise[]>([]);
  const [done, setDone] = useState(false);
  const [logged, setLogged] = useState<Record<string, number>>({});
  const [open, setOpen] = useState<string | null>(null);
  const [swapping, setSwapping] = useState<string | null>(null);
  const [howTo, setHowTo] = useState<Exercise | null>(null);
  const [puck, setPuck] = useState<string | null>(null);
  const [query, setQuery] = useState('');
  const [profile, setProfile] = useState<BodyProfile>({ heightCm: null, sex: null, weightKg: null });
  const [bodyKg, setBodyKg] = useState<number | null>(null);
  const busy = useRef(false);

  const loadTemplate = useCallback(async (id: string) => {
    const [templates, exs, jcts] = await Promise.all([getTemplates(), getExercises(), getJunctions()]);
    const byId = Object.fromEntries(exs.map(e => [e.id, e]));
    const list = jcts.filter(j => j.templateId === id).sort((a, b) => a.orderIndex - b.orderIndex)
      .map(j => ({ jid: j.id, ex: byId[j.exerciseId] })).filter(r => r.ex);
    setTemplate(templates.find(t => t.id === id) ?? null);
    setCustom(templates.filter(t => !t.isArchived && focusOfName(t.name) == null));
    setLibrary(exs);
    setRows(list);
    setDone(await isDoneToday(id));
    const day = toDateKey(new Date());
    const counts = await Promise.all(list.map(async r => [r.ex.id, (await getSetsForDay(r.ex.id, day)).length] as const));
    setLogged(Object.fromEntries(counts));
  }, []);

  const choose = useCallback(async (next: Sel) => {
    animate();
    setSel(next);
    setOpen(null);
    setSwapping(null);
    setForced(new Set());
    const id = 'focus' in next ? await ensureFocusTemplate(next.focus) : next.templateId;
    await loadTemplate(id);
  }, [loadTemplate]);

  // First open: what SELECT / TRAIN sent, else the coach's pick.
  useEffect(() => {
    void (async () => {
      const c = await loadCoach();
      setToday(c.today);
      setSessions(c.sessions);
      // Starter lifts still on placeholder numbers get real ones before anything shows.
      await recalibrateStarterLifts(c.sessions);
      // A day picked on SELECT / WORKOUT DAYS, else the focus TRAIN sent, else the coach's pick.
      if (params.templateId) { await choose({ templateId: params.templateId }); return; }
      const asked = FOCI.find(f => f === params.focus);
      await choose({ focus: asked ?? c.today.focus });
    })();
    void getBodyProfile().then(setProfile);
    void loadBodyData().then(b => setBodyKg(latestWeight(b) || null));
  }, []);

  // Coming back from the full exercise log: re-read.
  useFocusEffect(useCallback(() => { if (template) void loadTemplate(template.id); }, [template?.id]));

  // Sets the puck logs land here live.
  useEffect(() => bleBridge.onSetLogged(id => {
    Haptics.notificationAsync(Haptics.NotificationFeedbackType.Success);
    void getSetsForDay(id, toDateKey(new Date())).then(xs => setLogged(l => ({ ...l, [id]: xs.length })));
  }), []);

  const focus: Focus | null = sel && 'focus' in sel ? sel.focus : template ? focusOfName(template.name) : null;
  const inSession = rows.map(r => r.ex.name);
  // Recovery is judged at the session's time (now, or the next training day).
  const at = today?.at ?? Date.now();
  const restOf = useMemo(() => {
    // Today's own training of these lifts is this session — it can't make itself rest.
    const todayKey = toDateKey(new Date());
    const mine = new Set(rows.map(r => r.ex.id));
    const before = sessions.filter(x => !(x.date === todayKey && mine.has(x.exerciseId)));
    const { rest } = planSession(rows.map(r => r.ex), before, at);
    return Object.fromEntries(rest.map(r => [r.lift.id, r])) as Record<string, Resting<Exercise>>;
  }, [rows, sessions, at]);
  // One recommendation per lift — the tile and the HOW TO card read the same one.
  const best = useMemo(() => bestE1rms(sessions), [sessions]);
  const guideOf = (ex: Exercise): Guide =>
    guideFor(ex.name, { goal: 'size', bodyKg: bodyKg ?? profile.weightKg, heightCm: profile.heightCm, sex: profile.sex, bestE1rmKg: best[ex.id] });
  const isResting = (ex: Exercise) => !!restOf[ex.id] && !forced.has(ex.id);
  const active = rows.filter(r => !isResting(r.ex));
  const tray = useMemo(() => {
    const q = query.trim().toUpperCase();
    // A catalogue lift that's the same movement on the same kit as one already in
    // (BACK SQUAT next to SQUAT) would resolve to that same exercise — leave it out.
    const sig = (n: string) => { const p = patternOf(n); return `${p}|${equipmentOf(n, p)}`; };
    const have = new Set(rows.map(r => sig(r.ex.name)));
    const base = (focus ? suggestFor(focus, library, inSession) : suggestFor('full', library, inSession))
      .filter(p => p.mine || !have.has(sig(p.name)));
    // Only lifts whose muscles are recovered — unless you're searching for something specific.
    return (q ? base.filter(p => p.name.includes(q)) : base.filter(p => liftReady(p, sessions, at))).slice(0, q ? 20 : 14);
  }, [focus, library, rows, query, sessions, at]);
  const minutes = Math.round(active.reduce((a, r) => a + Math.max(1, r.ex.sets + (today?.setDelta ?? 0)), 0) * 2.5);
  const easy = (today?.setDelta ?? 0) < 0;

  /** Swaps for a lift: same muscles, recovered by session time. A resting lift's own muscles are
   *  tired, so it gets recovered lifts that fit the day instead. */
  function swapsFor(ex: Exercise): Choice[] {
    if (isResting(ex)) return suggestFor(focus ?? 'full', library, inSession).filter(p => liftReady(p, sessions, at)).slice(0, 6);
    const same = alternativesFor(ex, library, inSession, 12).filter(p => liftReady(p, sessions, at));
    return same.length ? same.slice(0, 6) : alternativesFor(ex, library, inSession);
  }

  async function resolve(p: Choice): Promise<Exercise> {
    return library.find(e => e.name.toUpperCase() === p.name.toUpperCase()) ?? exerciseFor(p.name, p.muscleGroups);
  }

  async function add(p: Choice) {
    if (!template || busy.current) return;
    busy.current = true;
    Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Light);
    const ex = await resolve(p);
    if (rows.some(r => r.ex.id === ex.id)) { busy.current = false; return; }
    await addExerciseToTemplate(template.id, ex.id);
    animate();
    await loadTemplate(template.id);
    setQuery('');
    busy.current = false;
  }

  async function addCustom() {
    const name = query.trim().toUpperCase();
    if (!name) return;
    await add({ name, muscleGroups: [], fit: 0, mine: false });
  }

  async function remove(r: Row) {
    if (!template) return;
    Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Light);
    await removeExerciseFromTemplate(r.jid);
    animate();
    await loadTemplate(template.id);
  }

  async function swap(r: Row, p: Choice) {
    if (!template || busy.current) return;
    busy.current = true;
    Haptics.selectionAsync();
    const ex = await resolve(p);
    await replaceExerciseInTemplate(r.jid, ex.id);
    animate();
    setSwapping(null);
    await loadTemplate(template.id);
    busy.current = false;
  }

  // Steppers can fire many times a second (hold, scrub): show at once, save once it settles.
  const pending = useRef<Record<string, { patch: LiftEdit; timer: ReturnType<typeof setTimeout> }>>({});
  function patch(ex: Exercise, next: LiftEdit) {
    setRows(rs => rs.map(r => (r.ex.id === ex.id ? { ...r, ex: { ...r.ex, ...next } } : r)));
    const cur = pending.current[ex.id];
    if (cur) clearTimeout(cur.timer);
    const merged = { ...(cur?.patch ?? {}), ...next };
    pending.current[ex.id] = { patch: merged, timer: setTimeout(() => { delete pending.current[ex.id]; void updateExercise(ex.id, merged); }, 450) };
  }
  // Leaving mid-scrub still saves.
  useEffect(() => () => {
    for (const [id, p] of Object.entries(pending.current)) { clearTimeout(p.timer); void updateExercise(id, p.patch); }
  }, []);

  async function sendToPuck(ex: Exercise) {
    setPuck(ex.id);
    const ok = await bleBridge.sendToPuck(ex.id, ex.name, ex.weightKg).catch(() => false);
    if (!ok) {
      setPuck(null);
      Alert.alert('Puck not connected', 'Turn the puck on and keep it near your phone, then try again.', [
        { text: 'OK', style: 'cancel' },
        { text: 'Open Puck', onPress: () => router.push('/ble-bridge') },
      ]);
      return;
    }
    Haptics.notificationAsync(Haptics.NotificationFeedbackType.Success);
  }

  async function finish() {
    if (!template) return;
    const refresh = () => loadCoach().then(c => { setToday(c.today); setSessions(c.sessions); });
    if (done) {
      await unmarkDoneToday(template.id);
      Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Light);
      setDone(false);
      void refresh();
      return;
    }
    // Lifts that rested for a tired muscle aren't counted as trained.
    await markDoneToday(template.id, rows.filter(r => isResting(r.ex)).map(r => r.ex.id));
    Haptics.notificationAsync(Haptics.NotificationFeedbackType.Success);
    animate();
    setDone(true);
    void refresh();
  }

  function newTemplate() {
    Alert.prompt?.('New workout', 'Name it — e.g. ARMS', async name => {
      if (!name?.trim()) return;
      const t = await createTemplate(name.trim(), '#FFFFFF');
      await choose({ templateId: t.id });
    });
  }

  const title = template?.name ?? (focus ? FOCUS_TITLE[focus] : '');
  const isPick = !!today && focus === today.focus;

  return (
    <SafeAreaView style={st.safe} edges={['top']}>
      <ScreenHeader title="LOG WORKOUT" />

      <ScrollView contentContainerStyle={{ paddingBottom: 120 + insets.bottom }} keyboardShouldPersistTaps="handled" showsVerticalScrollIndicator={false}>
        {/* ── focus chips ── */}
        <ScrollView horizontal showsHorizontalScrollIndicator={false} contentContainerStyle={st.focusRow}>
          {FOCI.map(f => {
            const on = sel && 'focus' in sel && sel.focus === f;
            return (
              <Pressable key={f} onPress={() => !on && choose({ focus: f })} style={[st.focusChip, on && st.focusChipOn]}>
                {today?.focus === f && <View style={[st.pickDot, on && { backgroundColor: C.onHot }]} />}
                <Text style={[st.focusText, on && st.focusTextOn]}>{SHORT[f]}</Text>
              </Pressable>
            );
          })}
          {custom.map(t => {
            const on = sel && 'templateId' in sel && sel.templateId === t.id;
            return (
              <Pressable key={t.id} onPress={() => !on && choose({ templateId: t.id })} style={[st.focusChip, on && st.focusChipOn]}>
                <Text style={[st.focusText, on && st.focusTextOn]}>{t.name}</Text>
              </Pressable>
            );
          })}
          {Platform.OS === 'ios' && (
            <Pressable onPress={newTemplate} style={[st.focusChip, st.focusChipNew]} accessibilityLabel="New workout">
              <MaterialCommunityIcons name="plus" size={14} color={C.dim} />
            </Pressable>
          )}
        </ScrollView>

        {/* ── hero ── */}
        <View style={st.hero}>
          <Text style={st.title} numberOfLines={1} adjustsFontSizeToFit minimumFontScale={0.6}>{title}</Text>
          <Text style={st.meta}>{`${active.length} LIFTS${rows.length > active.length ? ` · ${rows.length - active.length} RESTING` : ''} · ~${minutes} MIN${focus && today?.freshBy[focus] != null ? ` · MUSCLES ${today.freshBy[focus]}% FRESH` : ''}`}</Text>
          {today && (
            isPick
              ? <Text style={st.coach}>{`${LEVEL[today.readiness.level].word} ${today.readiness.score} · ${today.reasons[0] ?? LEVEL[today.readiness.level].dose}`}</Text>
              : <Pressable onPress={() => choose({ focus: today.focus })}>
                  <Text style={st.coach}>{`Coach picks ${today.title} today — tap to switch`}</Text>
                </Pressable>
          )}
          {easy && (
            <View style={st.easy}>
              <MaterialCommunityIcons name="feather" size={14} color={C.ink} />
              <Text style={st.easyText}>EASY DAY · ONE SET LESS, STOP TWO REPS SHORT</Text>
            </View>
          )}
        </View>

        {/* ── session ── */}
        <Text style={st.label}>SESSION</Text>
        <View style={st.stack}>
          {rows.length === 0 && <Text style={st.empty}>Empty — tap a lift below to drop it in.</Text>}
          {rows.map((r, i) => (
            <LiftChip
              key={r.jid}
              index={i}
              row={r}
              sets={Math.max(1, r.ex.sets + (today?.setDelta ?? 0))}
              logged={logged[r.ex.id] ?? 0}
              open={open === r.jid}
              swapping={swapping === r.jid}
              resting={isResting(r.ex) ? restOf[r.ex.id] : null}
              guide={guideOf(r.ex)}
              bestE1rm={best[r.ex.id]}
              onForce={() => { animate(); setForced(f => new Set([...f, r.ex.id])); }}
              alternatives={swapping === r.jid ? swapsFor(r.ex) : []}
              unit={unitSystem}
              puckSent={puck === r.ex.id}
              onToggle={() => { animate(); setOpen(o => (o === r.jid ? null : r.jid)); setSwapping(null); }}
              onSwapToggle={() => { animate(); setSwapping(s => (s === r.jid ? null : r.jid)); }}
              onSwap={p => swap(r, p)}
              onRemove={() => remove(r)}
              onPatch={next => patch(r.ex, next)}
              onPuck={() => sendToPuck(r.ex)}
              onHowTo={() => setHowTo(r.ex)}
              onHistory={() => template && router.push({ pathname: '/workout-detail', params: { templateId: template.id, exerciseId: r.ex.id } })}
            />
          ))}
        </View>

        {/* ── tray ── */}
        <View style={st.trayHead}>
          <Text style={[st.label, { marginBottom: 0 }]}>ADD</Text>
          <View style={st.search}>
            <MaterialCommunityIcons name="magnify" size={15} color={C.dim} />
            <TextInput
              value={query} onChangeText={setQuery} placeholder="SEARCH OR TYPE A NEW ONE" placeholderTextColor={C.faint}
              style={st.searchInput} autoCapitalize="characters" autoCorrect={false} returnKeyType="done" onSubmitEditing={addCustom}
            />
          </View>
        </View>
        <View style={st.tray}>
          {tray.length === 0 && !query.trim() && (
            <Text style={st.empty}>
              {today && focus !== today.focus
                ? `Nothing for these muscles is recovered yet — ${today.title} is ready.`
                : 'Nothing else here is recovered yet.'}
            </Text>
          )}
          {tray.map(p => (
            <Pressable key={p.name} onPress={() => add(p)} style={({ pressed }) => [st.trayChip, pressed && { backgroundColor: C.raised }]}>
              <MaterialCommunityIcons name="plus" size={13} color={p.mine ? C.hot : C.dim} />
              <Text style={[st.trayText, p.mine && { color: C.hot }]}>{p.name}</Text>
            </Pressable>
          ))}
          {!!query.trim() && !tray.some(p => p.name === query.trim().toUpperCase()) && (
            <Pressable onPress={addCustom} style={[st.trayChip, st.trayChipNew]}>
              <MaterialCommunityIcons name="plus" size={13} color={C.onHot} />
              <Text style={[st.trayText, { color: C.onHot }]}>{`ADD ${query.trim().toUpperCase()}`}</Text>
            </Pressable>
          )}
        </View>
      </ScrollView>

      {/* ── finish ── */}
      <View style={[st.footer, { paddingBottom: 12 + insets.bottom }]}>
        <Pressable onPress={finish} disabled={!done && !active.length} style={({ pressed }) => [st.finish, done && st.finishDone, !done && !active.length && { opacity: 0.4 }, pressed && { opacity: 0.8 }]}>
          <MaterialCommunityIcons name={done ? 'check-circle' : 'flag-checkered'} size={18} color={done ? C.onHot : C.onHot} />
          <Text style={st.finishText}>{done ? 'LOGGED TODAY · TAP TO UNDO' : 'FINISH SESSION'}</Text>
        </Pressable>
      </View>

      {howTo && (
        <ExerciseCard
          name={howTo.name}
          role={title}
          guide={guideOf(howTo)}
          bodyKg={bodyKg ?? profile.weightKg}
          onClose={() => setHowTo(null)}
        />
      )}
    </SafeAreaView>
  );
}

type LiftEdit = Partial<Pick<Exercise, 'sets' | 'reps' | 'weightKg'>>;

function LiftChip({
  index, row, sets, logged, open, swapping, alternatives, unit, puckSent, resting, onForce, guide, bestE1rm,
  onToggle, onSwapToggle, onSwap, onRemove, onPatch, onPuck, onHowTo, onHistory,
}: {
  index: number; row: Row; sets: number; logged: number; open: boolean; swapping: boolean; alternatives: Choice[];
  unit: 'metric' | 'imperial'; puckSent: boolean;
  /** Set when a main muscle won't be recovered — the lift sits this session out. */
  resting: Resting<Exercise> | null; onForce: () => void;
  guide: Guide; bestE1rm?: number;
  onToggle: () => void; onSwapToggle: () => void; onSwap: (p: Choice) => void; onRemove: () => void;
  onPatch: (p: LiftEdit) => void; onPuck: () => void; onHowTo: () => void; onHistory: () => void;
}) {
  const { ex } = row;
  const pop = useRef(new Animated.Value(0.92)).current;
  useEffect(() => { Animated.spring(pop, { toValue: 1, ...SPRING.pop }).start(); }, []);
  const kit = equipmentOf(ex.name, patternOf(ex.name));
  const range = repRange(ex.reps);
  const weight = ex.weightKg > 0 ? formatWeightWithUnit(ex.weightKg, unit) : 'BODYWEIGHT';
  const e1 = e1rmFor(guide, bestE1rm);
  const diff = e1 && ex.weightKg > 0 ? difficulty(ex.weightKg, range[1], e1.kg) : null;
  const recReps = `${guide.reps[0]}-${guide.reps[1]}`;
  const recKg = snapWeight(guide.startKg ?? 0, kit, unit);
  const onRec = ex.sets === guide.sets && ex.reps === recReps && Math.abs(ex.weightKg - recKg) < 0.01;

  return (
    <Animated.View style={[st.chip, open && st.chipOpen, resting && st.chipResting, { transform: [{ scale: pop }] }]}>
      <Pressable onPress={onToggle} style={st.chipHead}>
        <Text style={st.chipIndex}>{String(index + 1).padStart(2, '0')}</Text>
        <View style={{ flex: 1, gap: 3 }}>
          <Text style={[st.chipName, resting && { color: C.dim }]} numberOfLines={1}>{ex.name}</Text>
          <Text style={st.chipMeta} numberOfLines={1}>{`${sets} × ${ex.reps} · ${weight}`}</Text>
        </View>
        <Pressable onPress={onSwapToggle} hitSlop={8} style={[st.iconBtn, swapping && st.iconBtnOn]} accessibilityLabel="Swap">
          <MaterialCommunityIcons name="swap-horizontal" size={16} color={swapping ? C.onHot : C.ink} />
        </Pressable>
        <Pressable onPress={onRemove} hitSlop={8} style={st.iconBtn} accessibilityLabel="Remove">
          <MaterialCommunityIcons name="close" size={16} color={C.dim} />
        </Pressable>
      </Pressable>

      {resting && (
        <View style={st.restRow}>
          <MaterialCommunityIcons name="sleep" size={13} color={C.alert} />
          <Text style={st.restText} numberOfLines={1}>
            {`RESTING · ${muscleWord(resting.muscle)} ${resting.pct}%${resting.readyAt ? ` · BACK ${dayWord(resting.readyAt, new Date())}` : ''}`}
          </Text>
          <Pressable onPress={onForce} hitSlop={6}><Text style={st.force}>TRAIN ANYWAY</Text></Pressable>
        </View>
      )}

      {!resting && <View style={st.chipFoot}>
        <View style={st.tags}>
          {topMuscles(ex).map(m => <Text key={m} style={st.tag}>{m}</Text>)}
        </View>
        <View style={st.setDots}>
          {Array.from({ length: Math.max(sets, logged) }, (_, i) => (
            <View key={i} style={[st.setDot, i < logged && st.setDotOn]} />
          ))}
        </View>
      </View>}

      {swapping && (
        <ScrollView horizontal showsHorizontalScrollIndicator={false} contentContainerStyle={st.alts}>
          {alternatives.length === 0 && <Text style={st.empty}>Nothing close — add one from the tray.</Text>}
          {alternatives.map(p => (
            <Pressable key={p.name} onPress={() => onSwap(p)} style={({ pressed }) => [st.alt, pressed && { backgroundColor: C.raised }]}>
              <MaterialCommunityIcons name="swap-horizontal" size={12} color={C.dim} />
              <Text style={st.altText}>{p.name}</Text>
            </Pressable>
          ))}
        </ScrollView>
      )}

      {open && (
        <View style={st.panel}>
          <DifficultyBar d={diff} measured={!!e1?.measured} />
          <View style={st.rec}>
            <Text style={st.recText} numberOfLines={1}>
              {`RECOMMENDED ${guide.sets} × ${recReps} · ${guide.startKg == null ? 'BODYWEIGHT' : formatWeightWithUnit(recKg, unit)}${guide.perHand ? ' EACH' : ''}`}
            </Text>
            {onRec
              ? <MaterialCommunityIcons name="check-circle" size={16} color={C.live} />
              : (
                <Pressable onPress={() => { Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Medium); onPatch({ sets: guide.sets, reps: recReps, weightKg: recKg }); }} hitSlop={8} style={({ pressed }) => [st.recBtn, pressed && { transform: [{ scale: 0.92 }] }]}>
                  <Text style={st.recBtnText}>USE</Text>
                </Pressable>
              )}
          </View>
          <View style={st.steppers}>
            <Stepper label="SETS" value={`${ex.sets}`} onStep={d => onPatch({ sets: Math.max(1, Math.min(10, ex.sets + d)) })} />
            <Stepper label="REPS" value={ex.reps} onStep={d => onPatch({ reps: shiftReps(ex.reps, d) })} />
            <Stepper label={unit === 'imperial' ? 'WEIGHT LB' : 'WEIGHT KG'} value={formatWeightFromKg(ex.weightKg, unit)}
              onStep={d => onPatch({ weightKg: nextWeight(ex.weightKg, d, kit, unit) })} />
          </View>
          <View style={st.actions}>
            <Pressable onPress={onPuck} style={({ pressed }) => [st.action, st.actionHot, pressed && { opacity: 0.8 }]}>
              <MaterialCommunityIcons name={puckSent ? 'check' : 'send'} size={14} color={C.onHot} />
              <Text style={[st.actionText, { color: C.onHot }]}>{puckSent ? 'ON PUCK' : 'SEND TO PUCK'}</Text>
            </Pressable>
            <Pressable onPress={onHowTo} style={({ pressed }) => [st.action, pressed && { backgroundColor: C.raised }]}>
              <MaterialCommunityIcons name="play" size={14} color={C.ink} />
              <Text style={st.actionText}>HOW TO</Text>
            </Pressable>
            <Pressable onPress={onHistory} style={({ pressed }) => [st.action, pressed && { backgroundColor: C.raised }]}>
              <MaterialCommunityIcons name="chart-line" size={14} color={C.ink} />
              <Text style={st.actionText}>PB</Text>
            </Pressable>
          </View>
          {puckSent && <Text style={st.hint}>Countdown is on the puck. Hold it still, then lift — each set lights a dot.</Text>}
        </View>
      )}
    </Animated.View>
  );
}

const st = StyleSheet.create({
  safe: { flex: 1, backgroundColor: C.bg },
  focusRow: { gap: 6, paddingHorizontal: 16, paddingBottom: 4 },
  focusChip: { flexDirection: 'row', alignItems: 'center', gap: 6, height: 36, paddingHorizontal: 14, borderRadius: 18, borderWidth: 1, borderColor: C.line, backgroundColor: C.surface },
  focusChipOn: { backgroundColor: C.hot, borderColor: C.hot },
  focusChipNew: { borderStyle: 'dashed', paddingHorizontal: 12 },
  focusText: { fontFamily: F.dot, fontSize: 10, color: C.dim, letterSpacing: 1.2 },
  focusTextOn: { color: C.onHot },
  pickDot: { width: 6, height: 6, borderRadius: 3, backgroundColor: C.live },

  hero: { paddingHorizontal: 20, paddingTop: 16, paddingBottom: 18, gap: 4 },
  title: { fontFamily: F.dot, fontSize: 40, color: C.hot, letterSpacing: 1 },
  meta: { fontFamily: F.mono, fontSize: 11, color: C.dim, letterSpacing: 1 },
  coach: { fontFamily: F.mono, fontSize: 12, color: C.ink, lineHeight: 16, marginTop: 4 },
  easy: { flexDirection: 'row', alignItems: 'center', gap: 8, marginTop: 8, borderWidth: 1, borderColor: C.lineHi, borderRadius: 12, paddingHorizontal: 12, paddingVertical: 8, alignSelf: 'flex-start' },
  easyText: { fontFamily: F.dot, fontSize: 8, color: C.ink, letterSpacing: 1.2 },

  label: { fontFamily: F.dot, fontSize: 10, color: C.dim, letterSpacing: 3, paddingHorizontal: 20, marginBottom: 8 },
  stack: { paddingHorizontal: 16, gap: 8, marginBottom: 22 },
  empty: { fontFamily: F.mono, fontSize: 12, color: C.dim, paddingVertical: 10 },

  chip: { backgroundColor: C.surface, borderRadius: 18, borderWidth: 1, borderColor: C.line, paddingHorizontal: 14, paddingVertical: 12, gap: 8 },
  chipOpen: { borderColor: C.lineHi, backgroundColor: C.raised },
  chipResting: { backgroundColor: C.bg, borderStyle: 'dashed' },
  restRow: { flexDirection: 'row', alignItems: 'center', gap: 6, paddingLeft: 30 },
  restText: { flex: 1, fontFamily: F.dot, fontSize: 8, color: C.alert, letterSpacing: 1 },
  force: { fontFamily: F.dot, fontSize: 8, color: C.ink, letterSpacing: 1, textDecorationLine: 'underline' },
  chipHead: { flexDirection: 'row', alignItems: 'center', gap: 10 },
  chipIndex: { fontFamily: F.dot, fontSize: 11, color: C.faint, letterSpacing: 1, width: 20 },
  chipName: { fontFamily: F.dot, fontSize: 14, color: C.hot, letterSpacing: 0.8 },
  chipMeta: { fontFamily: F.mono, fontSize: 12, color: C.dim },
  iconBtn: { width: 32, height: 32, borderRadius: 16, borderWidth: 1, borderColor: C.line, alignItems: 'center', justifyContent: 'center' },
  iconBtnOn: { backgroundColor: C.hot, borderColor: C.hot },
  chipFoot: { flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between', paddingLeft: 30 },
  tags: { flexDirection: 'row', gap: 4 },
  tag: { fontFamily: F.dot, fontSize: 7, color: C.dim, letterSpacing: 1, borderWidth: 1, borderColor: C.line, borderRadius: 6, paddingHorizontal: 6, paddingVertical: 3, overflow: 'hidden' },
  setDots: { flexDirection: 'row', gap: 4 },
  setDot: { width: 8, height: 8, borderRadius: 4, borderWidth: 1, borderColor: C.lineHi },
  setDotOn: { backgroundColor: C.live, borderColor: C.live },

  alts: { gap: 6, paddingLeft: 30 },
  alt: { flexDirection: 'row', alignItems: 'center', gap: 5, height: 30, paddingHorizontal: 10, borderRadius: 15, borderWidth: 1, borderColor: C.lineHi, backgroundColor: C.bg },
  altText: { fontFamily: F.dot, fontSize: 8, color: C.ink, letterSpacing: 1 },

  panel: { gap: 10, paddingTop: 4 },
  steppers: { flexDirection: 'row', gap: 6 },
  rec: { flexDirection: 'row', alignItems: 'center', gap: 8, borderWidth: 1, borderColor: C.line, borderRadius: 12, paddingLeft: 10, paddingRight: 6, height: 38, backgroundColor: C.bg },
  recText: { flex: 1, fontFamily: F.dot, fontSize: 8, color: C.ink, letterSpacing: 1 },
  recBtn: { height: 26, paddingHorizontal: 12, borderRadius: 13, backgroundColor: C.hot, justifyContent: 'center' },
  recBtnText: { fontFamily: F.dot, fontSize: 9, color: C.onHot, letterSpacing: 1.5 },
  actions: { flexDirection: 'row', gap: 6 },
  action: { flex: 1, flexDirection: 'row', alignItems: 'center', justifyContent: 'center', gap: 6, height: 38, borderRadius: 12, borderWidth: 1, borderColor: C.lineHi },
  actionHot: { flex: 1.4, backgroundColor: C.hot, borderColor: C.hot },
  actionText: { fontFamily: F.dot, fontSize: 9, color: C.ink, letterSpacing: 1.2 },
  hint: { fontFamily: F.mono, fontSize: 11, color: C.dim, lineHeight: 15 },

  trayHead: { flexDirection: 'row', alignItems: 'center', gap: 10, paddingRight: 16, marginBottom: 10 },
  search: { flex: 1, flexDirection: 'row', alignItems: 'center', gap: 6, height: 34, borderRadius: 17, borderWidth: 1, borderColor: C.line, paddingHorizontal: 12, backgroundColor: C.surface },
  searchInput: { flex: 1, fontFamily: F.mono, fontSize: 12, color: C.ink, paddingVertical: 0 },
  tray: { flexDirection: 'row', flexWrap: 'wrap', gap: 6, paddingHorizontal: 16 },
  trayChip: { flexDirection: 'row', alignItems: 'center', gap: 5, height: 34, paddingHorizontal: 12, borderRadius: 17, borderWidth: 1, borderColor: C.line, backgroundColor: C.surface },
  trayChipNew: { backgroundColor: C.hot, borderColor: C.hot },
  trayText: { fontFamily: F.dot, fontSize: 9, color: C.dim, letterSpacing: 1 },

  footer: { position: 'absolute', left: 0, right: 0, bottom: 0, paddingHorizontal: 16, paddingTop: 12, backgroundColor: C.bg, borderTopWidth: 1, borderTopColor: C.line },
  finish: { flexDirection: 'row', alignItems: 'center', justifyContent: 'center', gap: 10, height: 54, borderRadius: 16, backgroundColor: C.hot },
  finishDone: { backgroundColor: C.live },
  finishText: { fontFamily: F.dot, fontSize: 12, color: C.onHot, letterSpacing: 2 },
});
