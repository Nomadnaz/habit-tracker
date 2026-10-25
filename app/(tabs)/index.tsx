// ─────────────────────────────────────────────────────────────────────────
// BODY — the home screen: the 3D muscle map with the whole day hung round
// it. TODAY's modules (steps, water, fuel, sleep, heart, readiness, the
// session…) are readouts in slots either side of the figure, each with a
// line to a point on the body you choose (lib/body-hud.ts). EDIT arranges
// them: tap the body for the point, turn the revolver for the module, tap a
// slot for where it hangs. Everything comes from the twin (lib/twin.ts),
// which also writes today's targets back for every other screen. The lines
// stay hidden: tap a readout and its line draws out to the body, then it
// opens; a sheet dims the screen with the readout still lit above it.
//
// The figure is always coloured by the gauge (bottom right): RECOVERY reds
// the worn muscles, READY lights the fresh ones green. Under it: the
// modules left off the body, your targets, and Apple Health. Spin the
// figure, pinch in, tap a zone → its muscles; tap a muscle → recovery, a
// GOAL and GO (lifts that work it).
// ─────────────────────────────────────────────────────────────────────────

import { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import {
  View, Text, StyleSheet, ScrollView, Pressable, RefreshControl, useWindowDimensions, Platform, Alert, ActivityIndicator,
} from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';
import { useFocusEffect, useRouter } from 'expo-router';
import { MaterialCommunityIcons } from '@expo/vector-icons';
import * as Haptics from 'expo-haptics';
import { onWrite } from '@/lib/postWrite';
import { useRevalidate } from '@/lib/revalidate';
import { C, F, numFace } from '@/lib/theme';
import { TAP, hit } from '@/lib/hit';
import { REGIONS, loadBodyMap, saveBodyMap, type BodyMap } from '@/lib/body-map';
import { BodyStage, LINE_MS, TONE, type Box, type Facing, type Paint, type StageEdit, type StagePin } from '@/components/body/BodyStage';
import { ZONE_BY_ID, ZONE_OF, MUSCLES } from '@/lib/body-mesh';
import { getExercises, getTrainingSessions, type Exercise } from '@/lib/workout-data';
import {
  baseOf, hasBattery, muscleStatus, withIntensity, cardioSessions, RECOVERY_MUSCLES, type Session, type Run,
} from '@/lib/muscle-recovery';
import { RecoveryThermo, useRecoveryMix, type GaugeMode } from '@/components/body/RecoveryToggle';
import { TypeLine } from '@/components/TypeLine';
import { getActivitiesInRange } from '@/lib/activity-data';
import { guideFor, goalOf } from '@/lib/exercise-guide';
import { WaterSheet, WeightSheet } from '@/components/BodyLogSheets';
import {
  addWater, loadBodyData, logWeight, onHealthSync, pullRemoteBody, refreshAppleHealthIfConnected, saveBodyProfile,
  latestWeight, getBodyProfile, type BodyData, type BodyProfile,
} from '@/lib/body-data';
import { connectAndSyncAppleHealth, probeHeart } from '@/lib/apple-health';
import { getTodayMood } from '@/lib/mood-data';
import { cachedView, loadToday, setGoal, type TodayView } from '@/lib/twin-data';
import { directive, goalWord, paceWord, type TwinGoal, type TwinInput } from '@/lib/twin';
import {
  DEFAULT_PINS, HOME_SPOT, MODULES, ALL_MODULES, freeSlots, getPins, move, offBody, place, remove, repoint, savePins,
  slotSide, swapModule, type HudModule, type Pin, type Spot,
} from '@/lib/body-hud';
import { readoutOf, ReadoutNode, ReadoutRow, type ReadoutActs, type ReadoutData } from '@/components/body/Readouts';
import { EditPanel, type Draft } from '@/components/body/EditPanel';
import type { RevolverItem } from '@/components/body/Revolver';
import {
  AssignPanel, CategoryEditor, GoSheet, LensCaption, bestE1rm, readyCaption, recoveryCaption,
} from '@/components/body/BodyPanels';
import { TodaySheet, type SheetKind, type You } from '@/components/today/Sheets';
import { Pixel } from '@/components/today/bits';
import { BALANCE } from '@/lib/text-wrap';

const DAYS = ['SUN', 'MON', 'TUE', 'WED', 'THU', 'FRI', 'SAT'];
const MONTHS = ['JAN', 'FEB', 'MAR', 'APR', 'MAY', 'JUN', 'JUL', 'AUG', 'SEP', 'OCT', 'NOV', 'DEC'];

/** Taken within the last `hours` (pre-timestamp readings count as fresh). */
const fresh = (at: string | null | undefined, hours: number) => at === undefined || (!!at && Date.now() - Date.parse(at) < hours * 3_600_000);
const agoWords = (at: string) => {
  const m = Math.max(1, Math.round((Date.now() - Date.parse(at)) / 60_000));
  const [n, u] = m < 60 ? [m, 'minute'] : m < 2880 ? [Math.round(m / 60), 'hour'] : [Math.round(m / 1440), 'day'];
  return `${n} ${u}${n === 1 ? '' : 's'} ago`;
};

export default function BodyScreen() {
  const router = useRouter();
  const { width } = useWindowDimensions();
  // The figure.
  const [map, setMap] = useState<BodyMap | null>(null);
  const [zone, setZone] = useState<string | null>(null);
  const [selected, setSelected] = useState<string | null>(null);
  const [focused, setFocused] = useState(true);
  const [going, setGoing] = useState(false);
  const [library, setLibrary] = useState<Exercise[]>([]);
  const [side, setSide] = useState<Facing>('front');
  const [stageZoomed, setStageZoomed] = useState(false);
  const [catEditing, setCatEditing] = useState(false);
  const [sessions, setSessions] = useState<Session[]>([]);
  const [appRuns, setAppRuns] = useState<Run[]>([]);
  const [gauge, setGauge] = useState<GaugeMode>('worn');
  const [visits, setVisits] = useState(0);
  const [mix, setMix] = useState(0);
  // The paint, gauge and caption all come in again on every visit and switch.
  const play = `${visits}-${gauge}`;
  useRecoveryMix(play, setMix);
  const [lit, setLit] = useState<{ key: string; t0: number } | null>(null);
  // The tapped readout, drawn again above a sheet's dimmed backdrop.
  const [spot, setSpot] = useState<{ id: HudModule; box: Box } | null>(null);
  const tapped = useRef<{ id: HudModule; box: Box } | null>(null);
  // The day.
  const [body, setBody] = useState<BodyData | null>(null);
  const [profile, setProfile] = useState<BodyProfile>({ heightCm: null, sex: null, weightKg: null });
  const [view, setView] = useState<TodayView | null>(null);
  const [input, setInput] = useState<TwinInput | null>(null);
  const [failed, setFailed] = useState(false);
  const [mood, setMood] = useState<number | null>(null);
  const [sheet, setSheet] = useState<SheetKind | null>(null);
  const [logSheet, setLogSheet] = useState<'water' | 'weight' | null>(null);
  const [healthSyncing, setHealthSyncing] = useState(false);
  const [refreshing, setRefreshing] = useState(false);
  // The readouts round the figure.
  const [pins, setPins] = useState<Pin[]>(DEFAULT_PINS);
  const [arranging, setArranging] = useState(false);
  const [draft, setDraft] = useState<Draft>({});
  const [pinOn, setPinOn] = useState<HudModule | null>(null);

  const loadTwin = useCallback(async () => {
    try {
      const r = await loadToday();
      setView(r.view);
      setInput(r.input);
      setFailed(false);
    } catch (e) {
      console.warn('[body] twin failed', e);
      setFailed(true);
    }
  }, []);

  useEffect(() => {
    loadBodyMap().then(setMap);
    void getPins().then(setPins);
    void cachedView().then(v => { if (v) setView(cur => cur ?? v); });
  }, []);

  useFocusEffect(useCallback(() => {
    void loadTwin();
    // Logged on the puck → server-side; pull, then re-read and re-plan.
    void pullRemoteBody().then(found => { if (found) { loadBodyData().then(setBody); void loadTwin(); } });
    // Every Health sync (this one, a watch sample landing, the 2-min poll) re-renders and re-plans.
    const off = onHealthSync(d => { setBody(d); void loadTwin(); });
    // Something logged from the chat overlay never refocuses this tab.
    const offWrite = onWrite(e => {
      if (e === 'workout') void getTrainingSessions().then(setSessions).catch(() => {});
      if (e === 'mood') void getTodayMood().then(m => setMood(m?.moodScore ?? null));
      if (e === 'meal' || e === 'water' || e === 'weight' || e === 'sleep' || e === 'workout') void loadTwin();
    });
    loadBodyData().then(d => {
      setBody(d);
      if (d.appleHealthConnected) void refreshAppleHealthIfConnected();
    });
    void getTodayMood().then(m => setMood(m?.moodScore ?? null));
    void getTrainingSessions().then(setSessions).catch(() => {});
    void getExercises().then(setLibrary);
    void getBodyProfile().then(setProfile);
    // Runs tracked in the app count as leg training too (watch runs come with Apple Health).
    void getActivitiesInRange(new Date(Date.now() - 14 * 86_400_000).toISOString(), new Date().toISOString())
      .then(a => setAppRuns(a.filter(x => x.type === 'run').map(x => ({ start: Date.parse(x.startTime), end: Date.parse(x.endTime), distanceM: x.distanceM }))))
      .catch(() => {});
    setVisits(v => v + 1);
    setFocused(true);
    return () => { off(); offWrite(); setFocused(false); };
  }, [loadTwin]));

  // Back from the background or back online with BODY showing: pull what the
  // puck logged meanwhile, re-read and re-plan (Health re-syncs on its own).
  useRevalidate(() => {
    void pullRemoteBody().then(found => { if (found) loadBodyData().then(setBody); });
    void getTodayMood().then(m => setMood(m?.moodScore ?? null));
    void getTrainingSessions().then(setSessions).catch(() => {});
    void loadTwin();
  });

  async function refresh() {
    setRefreshing(true);
    await refreshAppleHealthIfConnected().catch(() => null);
    await loadTwin();
    setRefreshing(false);
  }

  async function syncAppleHealth() {
    if (healthSyncing) return;
    setHealthSyncing(true);
    const result = await connectAndSyncAppleHealth(56);
    setHealthSyncing(false);
    if (result.ok && result.data) { setBody(result.data); Haptics.notificationAsync(Haptics.NotificationFeedbackType.Success); return; }
    Alert.alert('Apple Health', result.error ?? 'Could not connect to Apple Health.');
  }

  // HEART: ask for every watch permission (iOS only shows the ones not yet
  // decided), re-read, and if a reading is missing or old, find out why.
  // iOS hides a denied read, so the newest sample Health will give us *ever*
  // tells "access off" (none at all) from "watch not syncing" (an old one).
  async function checkHeart() {
    if (Platform.OS !== 'ios') { router.push('/settings/wearables'); return; }
    if (healthSyncing) return;
    setHealthSyncing(true);
    const result = await connectAndSyncAppleHealth(56, true);
    if (!result.ok || !result.data) { setHealthSyncing(false); Alert.alert('Apple Health', result.error ?? 'Could not connect to Apple Health.'); return; }
    setBody(result.data);
    const h = result.data.heart;
    if (h?.bpm != null && fresh(h.bpmAt, 2) && h.hrvMs != null && fresh(h.hrvAt, 24 * 7)) { setHealthSyncing(false); Haptics.notificationAsync(Haptics.NotificationFeedbackType.Success); return; }
    const probe = await probeHeart();
    setHealthSyncing(false);
    const turnOn = 'iPhone Settings → Privacy & Security → Health → habit-tracker, and turn on Heart Rate, Heart Rate Variability and Resting Heart Rate';
    const lines: string[] = [];
    if (!probe.hr) {
      lines.push(`Apple Health gives habit-tracker no heart rate at all. With a watch on, that means its access is off (iOS shows an app without access an empty Health, not an error). Open ${turnOn}.`);
      lines.push('If the Health app itself shows no heart rate (Browse → Heart), the watch isn\'t syncing to this iPhone: check it\'s paired in the Watch app with Bluetooth on.');
    } else {
      if (!fresh(probe.hr.at, 2)) lines.push(`The newest heart rate in Health is from ${agoWords(probe.hr.at)} (${probe.hr.source}). The watch hasn't sent a newer one: keep it unlocked on your wrist with Bluetooth on, and open the Health app once to nudge a sync.`);
      if (!probe.hrv) lines.push(`Heart rate comes through but there's no HRV at all. The watch measures HRV a few times a day and overnight; a one-minute Mindfulness session records one now. If you've done that, open ${turnOn}.`);
      else if (!fresh(probe.hrv.at, 24 * 7)) lines.push(`The newest HRV is from ${agoWords(probe.hrv.at)}. A one-minute Mindfulness session on the watch records a new one.`);
    }
    if (!lines.length) { Haptics.notificationAsync(Haptics.NotificationFeedbackType.Success); return; }
    Alert.alert(!probe.hr ? 'No heart data reaches the app' : !fresh(probe.hr.at, 2) ? 'Heart rate is out of date' : 'No recent HRV', lines.join('\n\n'));
  }

  const changeGoal = async (g: TwinGoal, you: You | null) => {
    await setGoal(g);
    if (you) {
      await saveBodyProfile({ age: you.age, heightCm: you.heightCm, sex: you.sex, goalWeightKg: you.goalWeightKg });
      if (you.weightKg != null && you.weightKg !== view?.now.weightKg) await logWeight(you.weightKg);
    }
    await loadTwin();
  };

  const update = useCallback((fn: (m: BodyMap) => BodyMap) => {
    setMap(prev => {
      if (!prev) return prev;
      const n = fn(prev);
      saveBodyMap(n);
      return n;
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

  // ── arranging the readouts ─────────────────────────────────────────────
  const commit = (n: Pin[]) => { setPins(n); void savePins(n); };
  const startArranging = (on: HudModule | null = null) => {
    void Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Medium);
    setZone(null); setSelected(null); setLit(null);
    setDraft({});
    setPinOn(on);
    setArranging(true);
  };
  const stopArranging = () => { setArranging(false); setDraft({}); setPinOn(null); };
  /** Fills in one more of point / module / slot; with all three, places it. */
  const fill = (d: Draft) => {
    if (d.id && d.slot != null && d.spot) {
      commit(place(pins, d.id, d.slot, d.spot));
      setDraft({});
      void Haptics.notificationAsync(Haptics.NotificationFeedbackType.Success);
    } else setDraft(d);
  };
  const onSpot = (s: Spot) => {
    if (pinOn) { commit(repoint(pins, pinOn, s)); return; }
    fill({ ...draft, spot: { at: s.at, n: s.n } });
  };
  const onSlot = (slot: number) => {
    void Haptics.selectionAsync();
    if (pinOn) { commit(move(pins, pinOn, slot)); return; }
    fill({ ...draft, slot });
  };
  const tapPin = (p: Pin) => {
    void Haptics.selectionAsync();
    if (pinOn && pinOn !== p.id) { commit(move(pins, pinOn, p.slot)); setPinOn(null); return; } // swap the two
    if (!pinOn && draft.id) { fill({ ...draft, slot: p.slot }); return; } // replace it with the new one
    setDraft({});
    setPinOn(on => (on === p.id ? null : p.id));
  };

  // Each muscle's battery, for the RECOVERY paint — once per data change, not per fade frame.
  const recPct = useMemo(() => {
    const t = Date.now();
    const worn = [...withIntensity(sessions), ...cardioSessions(body?.stepsHistory ?? {}, [...(body?.runs ?? []), ...appRuns], t)];
    return Object.fromEntries(RECOVERY_MUSCLES.map(m => [m, muscleStatus(m, worn, t).pct]));
  }, [sessions, body, appRuns]);

  // Overall wear for the thermometer: the average muscle's drain.
  const overallWorn = useMemo(() => {
    const v = Object.values(recPct);
    return v.length ? v.reduce((a, p) => a + (1 - p / 100), 0) / v.length : 0;
  }, [recPct]);

  if (!map) return <SafeAreaView style={st.safe} />;

  // Everything that wears muscles: lifts (lighter days count for less), and
  // runs and long walking days from the watch, Apple Health and the app.
  const now = Date.now();
  const runs = [...(body?.runs ?? []), ...appRuns];
  const worn = [...withIntensity(sessions), ...cardioSessions(body?.stepsHistory ?? {}, runs, now)];
  const selBase = selected ? baseOf(selected) : null;
  const status = selBase ? muscleStatus(selBase, worn, now) : null;
  const battery = selBase && status && hasBattery(selBase) ? status.pct : null;
  const batteryOf = (id: string) => (hasBattery(baseOf(id)) ? muscleStatus(baseOf(id), worn, now).pct : null);

  // The figure's colours, faded in by `mix`: RECOVERY reds the worn
  // muscles (the most worn glow); READY lights the fresh ones green.
  const paint: Record<string, Paint> | null = mix > 0.01 ? {} : null;
  if (paint) {
    for (const m of MUSCLES) {
      const b = baseOf(m.id);
      if (!hasBattery(b)) continue;
      const fresh = (recPct[b] ?? 100) / 100;
      if (gauge === 'worn') {
        const w = 1 - fresh;
        paint[m.id] = { tone: C.alert, t: w * mix, glow: w > 0.08 ? Math.pow(w, 1.3) * mix : 0 };
      } else {
        const r = Math.pow(Math.max(0, (fresh - 0.4) / 0.6), 1.5);
        paint[m.id] = { tone: C.live, t: r * mix, glow: fresh >= 0.95 ? 0.3 * mix : 0 };
      }
    }
  }
  const lensInfo = gauge === 'worn' ? recoveryCaption(worn, runs, body?.stepsHistory ?? {}, now) : readyCaption(recPct);
  // A framed zone's battery: the average of its muscles that have one.
  const zonePcts = zone ? ZONE_BY_ID[zone].muscles.map(batteryOf).filter((p): p is number => p != null) : [];
  const zoneBattery = zonePcts.length ? Math.round(zonePcts.reduce((a, b) => a + b, 0) / zonePcts.length) : null;

  // ── readouts ───────────────────────────────────────────────────────────
  // A sheet opened by a readout on the figure spotlights it; from anywhere else, nothing.
  const sheetFrom = () => { setSpot(tapped.current); tapped.current = null; };
  const act: ReadoutActs = {
    open: k => { sheetFrom(); setSheet(k); },
    go: (pathname, params) => router.push((params ? { pathname, params } : pathname) as never),
    water: () => { sheetFrom(); if (view) setSheet('water'); else setLogSheet('water'); },
    weight: () => { sheetFrom(); setLogSheet('weight'); },
    heart: () => void checkHeart(),
    recovery: () => setGauge(g => (g === 'worn' ? 'ready' : 'worn')),
  };
  const data: ReadoutData = { view, body, mood };
  const stagePins: StagePin[] = pins.map(p => {
    const r = readoutOf(p.id, data, act);
    return {
      key: p.id, slot: p.slot, at: p.at, n: p.n, tone: r.tone, on: arranging && pinOn === p.id,
      node: <ReadoutNode r={r} right={slotSide(p.slot) === 'r'} />,
      // Its line draws out to the body, then it opens.
      onPress: arranging ? () => tapPin(p) : box => {
        void Haptics.selectionAsync();
        setLit({ key: p.id, t0: Date.now() });
        tapped.current = box ? { id: p.id, box } : null;
        setTimeout(() => { r.onPress(); tapped.current = null; }, LINE_MS + 40);
      },
      onLongPress: () => startArranging(p.id),
    };
  });
  const stageEdit: StageEdit | null = arranging ? {
    free: freeSlots(pins), slotOn: draft.slot ?? null, marker: pinOn ? null : draft.spot ?? null, onSlot, onSpot,
  } : null;
  const item = (id: HudModule): RevolverItem => {
    const r = readoutOf(id, data, act);
    return { key: id, word: r.word, tone: r.tone, meta: MODULES[id].blurb, value: r.value.length <= 8 ? `${r.value}${r.unit && r.value ? ` ${r.unit}` : ''}` : '' };
  };
  const spare = offBody(pins);
  const spotR = spot ? readoutOf(spot.id, data, act) : null;
  const spotNode = spot && spotR ? (
    <View pointerEvents="none" style={[st.spot, { left: spot.box.x, top: spot.box.y, width: spot.box.w, minHeight: spot.box.h, borderColor: spotR.tone, shadowColor: spotR.tone }]}>
      <View style={[StyleSheet.absoluteFill, { backgroundColor: spotR.tone, opacity: 0.1, borderRadius: 7, borderCurve: 'continuous' }]} />
      <ReadoutNode r={spotR} right={slotSide(pins.find(p => p.id === spot.id)?.slot ?? 0) === 'r'} />
    </View>
  ) : null;

  const stageH = Math.min(580, Math.round(width * 1.36));
  const targets = REGIONS.filter(r => map.marks[r.id]).sort((a, b) =>
    map.categories.findIndex(c => c.id === map.marks[a.id].category) - map.categories.findIndex(c => c.id === map.marks[b.id].category));
  const n = new Date();
  const t = view?.twin;

  return (
    <SafeAreaView style={st.safe} edges={['top']}>
      <ScrollView
        contentContainerStyle={{ paddingBottom: arranging ? 330 : selected ? 440 : zone ? 200 : 40 }}
        showsVerticalScrollIndicator={false}
        scrollEnabled={!stageZoomed}
        keyboardShouldPersistTaps="handled"
        refreshControl={<RefreshControl refreshing={refreshing} onRefresh={refresh} tintColor={C.dim} />}
      >
        <View style={st.header}>
          <View style={{ flex: 1 }}>
            <Text style={st.eyebrow}>{`${DAYS[n.getDay()]} ${String(n.getDate()).padStart(2, '0')} ${MONTHS[n.getMonth()]}`}</Text>
            <Text style={st.title}>BODY</Text>
          </View>
          <View style={st.headerRight}>
            <Pressable onPress={() => (arranging ? stopArranging() : startArranging())} hitSlop={8} style={[st.key, arranging && st.keyOn]}
              accessibilityLabel={arranging ? 'Done arranging' : 'Arrange readouts'}>
              <Text style={[st.keyText, arranging && { color: C.onHot }]}>{arranging ? 'DONE' : 'EDIT'}</Text>
            </Pressable>
            {!arranging && (
              <Pressable onPress={() => router.push('/settings')} hitSlop={8} style={st.iconBtn} accessibilityLabel="Settings">
                <MaterialCommunityIcons name="cog-outline" size={17} color={C.ink} />
              </Pressable>
            )}
          </View>
        </View>

        {/* ── the twin: goal + the day in a line ── */}
        {!arranging && (view && t ? (
          <Pressable onPress={() => act.open('goal')} style={({ pressed }) => [st.twin, pressed && { opacity: 0.7 }]}>
            <View style={st.twinHead}>
              <Pixel tone={C.live} blink />
              <Text style={st.twinWord}>TWIN</Text>
              <View style={st.goalChip}><Text style={st.goalChipText}>{goalWord(t.goal.id)}</Text></View>
              <Text style={st.pace}>{paceWord(t.goal.pace)}</Text>
              <View style={{ flex: 1 }} />
              <Text style={[st.outlook, numFace(t.outlook.headline, 12)]} numberOfLines={1}>{t.outlook.headline}</Text>
            </View>
            <TypeLine text={directive(t, view.today)} style={st.directive} numberOfLines={2} speed={12} delay={200} cursor={C.live} />
          </Pressable>
        ) : (
          <View style={st.twin}>
            <View style={st.twinHead}>
              <Pixel tone={failed ? C.alert : C.hot} blink={!failed} />
              <Text style={st.twinWord}>TWIN</Text>
            </View>
            <Text style={st.directive}>{failed ? "Couldn't build today. Pull down to try again." : 'Reading your body, sleep, training and food…'}</Text>
          </View>
        ))}

        {arranging ? <View style={st.lensSpacer} /> : <LensCaption key={play} info={lensInfo} />}

        <View>
          <BodyStage
            width={width}
            height={stageH}
            map={map}
            facing={side}
            zone={zone}
            selected={selected}
            filter={null}
            active={focused && !arranging}
            battery={selected ? battery : zoneBattery}
            onPick={pick}
            onHome={home}
            onFacing={setSide}
            onZoomed={setStageZoomed}
            pins={stagePins}
            edit={stageEdit}
            lit={arranging ? null : lit}
            paint={paint}
            showGoals={false}
            dimRest={false}
          />
          {/* RECOVERY: a dot that grows into a thermometer of overall wear; muscles fade white → red and the worn ones glow. */}
          {!arranging && (
            <RecoveryThermo mode={gauge} worn={overallWorn} play={play} onToggle={() => setGauge(g => (g === 'worn' ? 'ready' : 'worn'))}
              style={[st.recovery, { right: stageZoomed || zone ? 64 : 12 }]} />
          )}
        </View>

        <Text style={st.hint} {...BALANCE}>{arranging ? 'TAP THE BODY TO SET A LINE · DRAG TO TURN' : 'TAP A READOUT TO OPEN IT · HOLD TO MOVE'}</Text>

        {!arranging && (
          <>
            {spare.length > 0 && (
              <>
                <View style={st.section}>
                  <Text style={st.sectionTitle}>OFF THE BODY</Text>
                  <Pressable onPress={() => startArranging()} hitSlop={hit(56, 12, 8)}><Text style={st.sectionLink}>PIN ONE</Text></Pressable>
                </View>
                {spare.map((id, i) => <ReadoutRow key={id} r={readoutOf(id, data, act)} index={i} />)}
              </>
            )}

            <View style={st.section}>
              <Text style={st.sectionTitle}>{`TARGETS · ${targets.length}`}</Text>
              <Pressable onPress={() => setCatEditing(true)} hitSlop={hit(72, 12, 8)}><Text style={st.sectionLink}>EDIT GOALS</Text></Pressable>
            </View>
            {targets.length === 0 && <Text style={st.empty} {...BALANCE}>Tap a muscle on the figure and give it a GOAL.</Text>}
            {targets.map((r, i) => {
              const mk = map.marks[r.id];
              const cat = map.categories.find(c => c.id === mk.category);
              return (
                <Pressable key={r.id} onPress={() => select(r.id)} style={({ pressed }) => [st.rule, i === 0 && { borderTopWidth: 0 }, pressed && { backgroundColor: C.surface }]}>
                  <Text style={st.ruleIdx}>{String(i + 1).padStart(2, '0')}</Text>
                  <View style={{ flex: 1 }}>
                    <Text style={st.ruleLabel}>{r.name}</Text>
                    {!!mk.note && <Text style={st.ruleSub} numberOfLines={1}>{mk.note}</Text>}
                  </View>
                  <Text style={[st.ruleTag, cat && { color: TONE[cat.tone] }]}>{cat?.name ?? ''}</Text>
                </Pressable>
              );
            })}

            {body && (
              <>
                <View style={st.section}><Text style={st.sectionTitle}>MORE</Text></View>
                {Platform.OS === 'ios' && (
                  <Pressable onPress={syncAppleHealth} style={({ pressed }) => [st.rule, { borderTopWidth: 0 }, pressed && { backgroundColor: C.surface }]}>
                    <View style={{ flex: 1 }}>
                      <Text style={st.ruleLabel}>APPLE HEALTH</Text>
                      <Text style={st.ruleSub}>
                        {body.appleHealthLastSync
                          ? `Synced ${new Date(body.appleHealthLastSync).toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' })}`
                          : body.appleHealthConnected ? 'Tap to sync' : 'Connect steps, sleep and weight'}
                      </Text>
                    </View>
                    {healthSyncing ? <ActivityIndicator size="small" color={C.hot} /> : <MaterialCommunityIcons name="sync" size={16} color={C.dim} />}
                  </Pressable>
                )}
                <Pressable onPress={() => router.push('/modals/cycle-tracking')} style={({ pressed }) => [st.rule, Platform.OS !== 'ios' && { borderTopWidth: 0 }, pressed && { backgroundColor: C.surface }]}>
                  <View style={{ flex: 1 }}>
                    <Text style={st.ruleLabel}>CYCLE TRACKING</Text>
                    <Text style={st.ruleSub}>Private, off by default</Text>
                  </View>
                  <MaterialCommunityIcons name="arrow-right" size={16} color={C.dim} />
                </Pressable>
              </>
            )}

            <Text style={st.credit}>Anatomy model: Z-Anatomy (CC BY-SA 4.0), from BodyParts3D © DBCLS (CC BY 4.0).</Text>
          </>
        )}
      </ScrollView>

      {arranging && (
        <EditPanel
          draft={draft}
          pinOn={pinOn}
          items={spare.map(item)}
          swapItems={ALL_MODULES.filter(m => m !== pinOn).map(item)}
          onPick={id => fill({ ...draft, id })}
          onSwap={id => { if (pinOn) { commit(swapModule(pins, pinOn, id)); setPinOn(id); } }}
          onUseHome={() => draft.id && fill({ ...draft, spot: HOME_SPOT[draft.id] })}
          onRemove={() => { if (pinOn) { commit(remove(pins, pinOn)); setPinOn(null); void Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Light); } }}
          onDeselect={() => setPinOn(null)}
          onReset={() => { commit(DEFAULT_PINS); setDraft({}); setPinOn(null); void Haptics.selectionAsync(); }}
          onDone={stopArranging}
        />
      )}

      {!arranging && (
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
          onNewCategory={() => setCatEditing(true)}
          onGo={() => setGoing(true)}
        />
      )}

      <GoSheet
        visible={going && !!selected}
        regionId={selected}
        status={status}
        library={library}
        guide={name => guideFor(name, {
          goal: goalOf(selected && map.marks[selected] ? map.categories.find(c => c.id === map.marks[selected].category)?.name : null),
          bodyKg: (body && latestWeight(body)) || profile.weightKg,
          heightCm: profile.heightCm,
          sex: profile.sex,
          bestE1rmKg: bestE1rm(name, worn, library),
        })}
        bodyKg={(body && latestWeight(body)) || profile.weightKg}
        onClose={() => setGoing(false)}
      />

      <CategoryEditor
        visible={catEditing}
        categories={map.categories}
        onClose={() => setCatEditing(false)}
        onChange={categories => update(m => {
          const ids = new Set(categories.map(c => c.id));
          const marks = Object.fromEntries(Object.entries(m.marks).filter(([, v]) => ids.has(v.category)));
          return { categories, marks };
        })}
      />

      {body && (
        <>
          <WaterSheet visible={logSheet === 'water'} spot={spotNode} data={body} onData={d => { setBody(d); void loadTwin(); }} onClose={() => setLogSheet(null)} />
          <WeightSheet visible={logSheet === 'weight'} spot={spotNode} data={body} onData={d => { setBody(d); void loadTwin(); }} onClose={() => setLogSheet(null)} />
        </>
      )}
      {view && (
        <TodaySheet
          kind={sheet} view={view} input={input} spot={spotNode}
          act={{
            open: setSheet,
            go: act.go,
            addWater: ml => {
              void Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Light);
              setView(v => (v ? { ...v, now: { ...v.now, waterMl: v.now.waterMl + ml } } : v));
              void addWater(ml);
            },
          }}
          onClose={() => setSheet(null)}
          onGoal={(g, you) => void changeGoal(g, you)}
        />
      )}
    </SafeAreaView>
  );
}

const st = StyleSheet.create({
  safe: { flex: 1, backgroundColor: C.bg },
  header: { flexDirection: 'row', alignItems: 'flex-end', paddingHorizontal: 20, paddingTop: 10, marginBottom: 8 },
  headerRight: { flexDirection: 'row', alignItems: 'center', gap: 8, marginBottom: 4 },
  eyebrow: { fontFamily: F.dot, fontSize: 10, color: C.dim, letterSpacing: 3 },
  title: { fontFamily: F.dot, fontSize: 40, color: C.ink, letterSpacing: 2, marginTop: 4 },
  key: { height: 38, paddingHorizontal: 12, borderRadius: 19, borderWidth: 1, borderColor: C.lineHi, alignItems: 'center', justifyContent: 'center' },
  keyOn: { backgroundColor: C.hot, borderColor: C.hot },
  keyText: { fontFamily: F.dot, fontSize: 10, color: C.ink, letterSpacing: 2 },
  iconBtn: { width: 38, height: 38, borderRadius: 19, borderWidth: 1, borderColor: C.lineHi, alignItems: 'center', justifyContent: 'center' },
  // The tapped readout over a sheet's backdrop: solid, ringed in its colour.
  spot: { position: 'absolute', padding: 4, borderWidth: 1, borderRadius: 8, borderCurve: 'continuous', backgroundColor: C.bg, shadowOpacity: 0.6, shadowRadius: 12, shadowOffset: { width: 0, height: 0 } },

  twin: { marginHorizontal: 20, gap: 6, paddingBottom: 4 },
  twinHead: { flexDirection: 'row', alignItems: 'center', gap: 7 },
  twinWord: { fontFamily: F.dot, fontSize: 9, color: C.live, letterSpacing: 2.5, marginRight: 2 },
  goalChip: { borderRadius: 5, borderCurve: 'continuous', backgroundColor: C.hot, paddingHorizontal: 6, paddingVertical: 2 },
  goalChipText: { fontFamily: F.dot, fontSize: 8, color: C.onHot, letterSpacing: 1.5 },
  pace: { fontFamily: F.dot, fontSize: 8, color: C.dim, letterSpacing: 1.5 },
  outlook: { color: C.hot, letterSpacing: 1, flexShrink: 1 },
  directive: { fontFamily: F.mono, fontSize: 12, color: C.dim, lineHeight: 17 },

  lensSpacer: { height: 12 },
  recovery: { position: 'absolute', bottom: 12 },
  hint: { fontFamily: F.mono, fontSize: 10, color: C.faint, letterSpacing: 1, textAlign: 'center', marginTop: 2, marginBottom: 10 },

  section: { flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between', marginHorizontal: 20, marginTop: 24, marginBottom: 4 },
  sectionTitle: { fontFamily: F.dot, fontSize: 11, color: C.dim, letterSpacing: 3 },
  sectionLink: { fontFamily: F.dot, fontSize: 9, color: C.ink, letterSpacing: 2 },
  empty: { fontFamily: F.mono, fontSize: 12, color: C.faint, marginHorizontal: 20, marginTop: 6 },
  rule: { flexDirection: 'row', alignItems: 'center', gap: 12, minHeight: TAP, paddingVertical: 12, paddingHorizontal: 20, borderTopWidth: 1, borderTopColor: C.line },
  ruleIdx: { fontFamily: F.dot, fontSize: 11, color: C.faint, width: 20 },
  ruleLabel: { fontFamily: F.dot, fontSize: 12, color: C.ink, letterSpacing: 1.5 },
  ruleSub: { fontFamily: F.mono, fontSize: 11, color: C.dim, marginTop: 3 },
  ruleTag: { fontFamily: F.dot, fontSize: 10, color: C.dim, letterSpacing: 1.5 },
  credit: { fontFamily: F.mono, fontSize: 9, color: C.faint, textAlign: 'center', marginHorizontal: 24, marginTop: 24, lineHeight: 13 },
});
