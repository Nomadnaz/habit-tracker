// ─────────────────────────────────────────────────────────────────────────
// TODAY — your twin's plan for the day, on a deck of modules.
//
// The twin (lib/twin.ts) reads your goal, body, recovery, readiness, sleep,
// food, water and steps and sets today's targets plus the week ahead; the
// targets are written back so every other screen shows the same numbers
// (lib/twin-data.ts). Up top: the goal and a one-line brief. Below: modules
// you arrange yourself — the deck key (or holding a module) puts it in edit:
// × ejects a module to the bay, tap two to swap, tap one in the bay to slot
// it in. Tapping a module opens how its number was worked out.
// ─────────────────────────────────────────────────────────────────────────

import { useCallback, useEffect, useRef, useState } from 'react';
import {
  Animated, LayoutAnimation, Platform, Pressable, RefreshControl, ScrollView, StyleSheet, Text, UIManager, View,
  useWindowDimensions,
} from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';
import { useFocusEffect, useRouter } from 'expo-router';
import { MaterialCommunityIcons } from '@expo/vector-icons';
import * as Haptics from 'expo-haptics';

import { C, F, SPRING, numFace } from '@/lib/theme';
import { addWater, logWeight, onHealthSync, pullRemoteBody, refreshAppleHealthIfConnected, saveBodyProfile } from '@/lib/body-data';
import { cachedView, loadToday, setGoal, type TodayView } from '@/lib/twin-data';
import { directive, goalWord, paceWord, type TwinGoal, type TwinInput } from '@/lib/twin';
import { ALL_MODULES, DEFAULT_DECK, MODULES, getDeck, saveDeck, type ModuleId } from '@/lib/today-deck';
import { Deck, type DeckActions, type SheetKind } from '@/components/today/Deck';
import { TodaySheet, type You } from '@/components/today/Sheets';
import { Pixel } from '@/components/today/bits';
import { TypeLine } from '@/components/TypeLine';

if (Platform.OS === 'android' && UIManager.setLayoutAnimationEnabledExperimental) {
  UIManager.setLayoutAnimationEnabledExperimental(true);
}

const DAYS = ['SUN', 'MON', 'TUE', 'WED', 'THU', 'FRI', 'SAT'];
const MONTHS = ['JAN', 'FEB', 'MAR', 'APR', 'MAY', 'JUN', 'JUL', 'AUG', 'SEP', 'OCT', 'NOV', 'DEC'];
const PAD = 16;

// Modules slide to their new slots with a little bounce.
const reslot = () => LayoutAnimation.configureNext({
  duration: 360,
  create: { type: 'easeInEaseOut', property: 'scaleXY' },
  update: { type: 'spring', springDamping: 0.7 },
  delete: { type: 'easeInEaseOut', property: 'scaleXY', duration: 180 },
});

export default function TodayScreen() {
  const router = useRouter();
  const { width } = useWindowDimensions();
  const [view, setView] = useState<TodayView | null>(null);
  const [input, setInput] = useState<TwinInput | null>(null);
  const [failed, setFailed] = useState(false);
  const [deck, setDeck] = useState<ModuleId[]>(DEFAULT_DECK);
  const [editing, setEditing] = useState(false);
  const [selected, setSelected] = useState<ModuleId | null>(null);
  const [sheet, setSheet] = useState<SheetKind | null>(null);
  const [refreshing, setRefreshing] = useState(false);
  const bay = useRef(new Animated.Value(0)).current;

  const load = useCallback(async () => {
    try {
      const r = await loadToday();
      setView(r.view);
      setInput(r.input);
      setFailed(false);
    } catch (e) {
      console.warn('[today] twin failed', e);
      setFailed(true);
    }
  }, []);

  useEffect(() => {
    void getDeck().then(setDeck);
    void cachedView().then(v => { if (v) setView(cur => cur ?? v); });
  }, []);

  useFocusEffect(useCallback(() => {
    void load();
    // Logged on the puck → server-side; Health → newer steps/sleep/HRV. Either one re-plans.
    void pullRemoteBody().then(found => { if (found) void load(); });
    void refreshAppleHealthIfConnected();
    // Any Health sync while TODAY is open (watch sample, poll, this one) re-plans.
    return onHealthSync(() => void load());
  }, [load]));

  useEffect(() => {
    Animated.spring(bay, { toValue: editing ? 1 : 0, ...SPRING.settle }).start();
  }, [editing]);

  const commit = (next: ModuleId[]) => { setDeck(next); void saveDeck(next); };

  const toggleEdit = () => {
    void Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Medium);
    setSelected(null);
    setEditing(e => !e);
  };

  const hold = (id: ModuleId) => {
    void Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Heavy);
    setEditing(true);
    setSelected(id);
  };

  const select = (id: ModuleId) => {
    if (!selected) { void Haptics.selectionAsync(); setSelected(id); return; }
    if (selected === id) { setSelected(null); return; }
    reslot();
    const next = [...deck];
    const a = next.indexOf(selected), b = next.indexOf(id);
    [next[a], next[b]] = [next[b], next[a]];
    commit(next);
    setSelected(null);
    void Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Medium);
  };

  const eject = (id: ModuleId) => {
    reslot();
    commit(deck.filter(m => m !== id));
    if (selected === id) setSelected(null);
    void Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Light);
  };

  const slotIn = (id: ModuleId) => {
    reslot();
    const next = [...deck];
    next.splice(selected ? next.indexOf(selected) + 1 : next.length, 0, id);
    commit(next);
    void Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Light);
  };

  const reset = () => { reslot(); commit(DEFAULT_DECK); setSelected(null); void Haptics.selectionAsync(); };

  const act: DeckActions = {
    open: setSheet,
    go: (pathname, params) => router.push((params ? { pathname, params } : pathname) as never),
    addWater: ml => {
      void Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Light);
      setView(v => (v ? { ...v, now: { ...v.now, waterMl: v.now.waterMl + ml } } : v));
      void addWater(ml);
    },
  };

  const changeGoal = async (g: TwinGoal, you: You | null) => {
    await setGoal(g);
    if (you) {
      await saveBodyProfile({ age: you.age, heightCm: you.heightCm, sex: you.sex, goalWeightKg: you.goalWeightKg });
      if (you.weightKg != null && you.weightKg !== view?.now.weightKg) await logWeight(you.weightKg);
    }
    await load();
  };

  const refresh = async () => {
    setRefreshing(true);
    await refreshAppleHealthIfConnected().catch(() => null);
    await load();
    setRefreshing(false);
  };

  const n = new Date();
  const spare = ALL_MODULES.filter(m => !deck.includes(m));
  const t = view?.twin;

  return (
    <SafeAreaView style={st.container} edges={['top']}>
      <ScrollView
        contentContainerStyle={{ paddingHorizontal: PAD, paddingBottom: editing ? 170 : 40 }}
        showsVerticalScrollIndicator={false}
        refreshControl={<RefreshControl refreshing={refreshing} onRefresh={refresh} tintColor={C.dim} />}
      >
        {/* ── Header ───────────────────────────────────── */}
        <View style={st.header}>
          <View style={{ flex: 1 }}>
            <Text style={st.eyebrow}>{`${DAYS[n.getDay()]} ${String(n.getDate()).padStart(2, '0')} ${MONTHS[n.getMonth()]}`}</Text>
            <Text style={st.title}>TODAY</Text>
          </View>
          <Pressable onPress={toggleEdit} hitSlop={8} style={[st.headKey, editing && st.headKeyOn]} accessibilityLabel={editing ? 'Done arranging' : 'Arrange modules'}>
            {editing
              ? <Text style={st.headKeyText}>DONE</Text>
              : <MaterialCommunityIcons name="view-grid-plus-outline" size={18} color={C.ink} />}
          </Pressable>
          {!editing && (
            <Pressable onPress={() => router.push('/settings')} hitSlop={8} style={st.headKey} accessibilityLabel="Settings">
              <MaterialCommunityIcons name="cog-outline" size={18} color={C.dim} />
            </Pressable>
          )}
        </View>

        {/* ── The twin: goal + the day in a line ───────── */}
        {view && t ? (
          <Pressable onPress={() => setSheet('goal')} style={({ pressed }) => [st.twin, pressed && { backgroundColor: C.raised }]}>
            <View style={st.twinHead}>
              <Pixel tone={C.live} blink />
              <Text style={st.twinWord}>TWIN</Text>
              <View style={st.goalChip}><Text style={st.goalChipText}>{goalWord(t.goal.id)}</Text></View>
              <View style={[st.goalChip, st.paceChip]}><Text style={[st.goalChipText, { color: C.dim }]}>{paceWord(t.goal.pace)}</Text></View>
              <View style={{ flex: 1 }} />
              <Text style={[st.outlook, numFace(t.outlook.headline, 12)]} numberOfLines={1}>{t.outlook.headline}</Text>
              <MaterialCommunityIcons name="chevron-right" size={16} color={C.dim} />
            </View>
            <TypeLine text={directive(t, view.today)} style={st.directive} numberOfLines={3} speed={12} delay={200} cursor={C.live} />
            {t.assumed.length > 0 && (
              <Text style={st.assumed}>Guessing your {t.assumed.join(', ')} — tap to set them for exact targets</Text>
            )}
          </Pressable>
        ) : (
          <View style={st.twin}>
            <View style={st.twinHead}>
              <Pixel tone={failed ? C.alert : C.hot} blink={!failed} />
              <Text style={st.twinWord}>TWIN</Text>
            </View>
            <Text style={st.directive}>{failed ? "Couldn't build today. Pull down to try again." : 'Reading your body, sleep, training and food…'}</Text>
          </View>
        )}

        {/* ── The deck ─────────────────────────────────── */}
        {view && (
          <Deck
            deck={deck} view={view} width={width - PAD * 2}
            editing={editing} selected={selected}
            onSelect={select} onEject={eject} onHold={hold} act={act}
          />
        )}
        {view && deck.length === 0 && !editing && (
          <Pressable onPress={toggleEdit} style={st.empty}>
            <Text style={st.emptyText}>DECK EMPTY — TAP TO SLOT MODULES IN</Text>
          </Pressable>
        )}
      </ScrollView>

      {/* ── Module bay (edit mode) ─────────────────────── */}
      <Animated.View
        pointerEvents={editing ? 'auto' : 'none'}
        style={[st.bay, { opacity: bay, transform: [{ translateY: bay.interpolate({ inputRange: [0, 1], outputRange: [160, 0] }) }] }]}
      >
        <View style={st.bayHead}>
          <Text style={st.bayWord}>MODULE BAY</Text>
          <Text style={st.bayHint} numberOfLines={1}>
            {selected ? `tap a module to swap with ${MODULES[selected].word.toLowerCase()}` : 'hold or tap a module to move it'}
          </Text>
          <Pressable onPress={reset} hitSlop={8}><Text style={st.bayReset}>RESET</Text></Pressable>
        </View>
        <ScrollView horizontal showsHorizontalScrollIndicator={false} contentContainerStyle={st.bayRow}>
          {spare.length === 0 && <Text style={st.bayHint}>Every module is on the deck.</Text>}
          {spare.map(id => (
            <Pressable key={id} onPress={() => slotIn(id)} style={({ pressed }) => [st.bayKey, pressed && st.bayKeyOn]}>
              <MaterialCommunityIcons name="plus" size={12} color={C.ink} />
              <Text style={st.bayKeyText}>{MODULES[id].word}</Text>
            </Pressable>
          ))}
        </ScrollView>
      </Animated.View>

      {view && (
        <TodaySheet kind={sheet} view={view} input={input} act={act} onClose={() => setSheet(null)} onGoal={(g, you) => void changeGoal(g, you)} />
      )}
    </SafeAreaView>
  );
}

const st = StyleSheet.create({
  container: { flex: 1, backgroundColor: C.bg },

  header: { flexDirection: 'row', alignItems: 'flex-end', gap: 8, paddingTop: 8, paddingBottom: 14 },
  eyebrow: { fontFamily: F.dot, fontSize: 11, color: C.dim, letterSpacing: 3 },
  title: { fontFamily: F.dot, fontSize: 40, color: C.ink, letterSpacing: 2, marginTop: 2 },
  headKey: { minWidth: 36, height: 36, paddingHorizontal: 9, borderRadius: 18, borderWidth: 1, borderColor: C.line, alignItems: 'center', justifyContent: 'center', marginBottom: 4 },
  headKeyOn: { backgroundColor: C.hot, borderColor: C.hot, paddingHorizontal: 14 },
  headKeyText: { fontFamily: F.dot, fontSize: 11, color: C.onHot, letterSpacing: 2 },

  twin: { borderWidth: 1, borderColor: C.lineHi, borderRadius: 18, padding: 13, gap: 10, marginBottom: 10, backgroundColor: C.bg },
  twinHead: { flexDirection: 'row', alignItems: 'center', gap: 7 },
  twinWord: { fontFamily: F.dot, fontSize: 9, color: C.live, letterSpacing: 2.5, marginRight: 4 },
  goalChip: { borderRadius: 6, backgroundColor: C.hot, paddingHorizontal: 7, paddingVertical: 3 },
  paceChip: { backgroundColor: C.bg, borderWidth: 1, borderColor: C.lineHi, paddingVertical: 2 },
  goalChipText: { fontFamily: F.dot, fontSize: 9, color: C.onHot, letterSpacing: 1.5 },
  outlook: { fontFamily: F.dot, fontSize: 12, color: C.hot, letterSpacing: 1, flexShrink: 1 },
  directive: { fontFamily: F.mono, fontSize: 13, color: C.ink, lineHeight: 18 },
  assumed: { fontFamily: F.mono, fontSize: 10, color: C.dim },

  empty: { borderWidth: 1, borderStyle: 'dashed', borderColor: C.lineHi, borderRadius: 18, paddingVertical: 28, alignItems: 'center' },
  emptyText: { fontFamily: F.dot, fontSize: 10, color: C.dim, letterSpacing: 2 },

  bay: { position: 'absolute', left: 10, right: 10, bottom: 10, borderRadius: 20, borderWidth: 1, borderColor: C.lineHi, backgroundColor: C.surface, paddingVertical: 12, gap: 10 },
  bayHead: { flexDirection: 'row', alignItems: 'center', gap: 10, paddingHorizontal: 14 },
  bayWord: { fontFamily: F.dot, fontSize: 9, color: C.hot, letterSpacing: 2.5 },
  bayHint: { flex: 1, fontFamily: F.mono, fontSize: 10, color: C.dim },
  bayReset: { fontFamily: F.dot, fontSize: 9, color: C.dim, letterSpacing: 2 },
  bayRow: { gap: 8, paddingHorizontal: 14 },
  bayKey: { flexDirection: 'row', alignItems: 'center', gap: 5, height: 34, paddingHorizontal: 12, borderRadius: 17, borderWidth: 1, borderColor: C.lineHi, backgroundColor: C.raised },
  bayKeyOn: { backgroundColor: C.hot, borderColor: C.hot },
  bayKeyText: { fontFamily: F.dot, fontSize: 10, color: C.ink, letterSpacing: 1.5 },
});
