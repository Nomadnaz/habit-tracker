// One fuel goal on its own: today against the goal, EDIT to change the goal,
// and a month calendar of how each day went — hit, halfway, missed or not
// logged (rules in lib/fuel-goals.ts). Opened by tapping the kcal hero or a
// macro on FUEL (app/calorie/index.tsx) with ?key=calories|proteinG|….

import { useCallback, useState } from 'react';
import { Pressable, ScrollView, StyleSheet, Text, TextInput, View } from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';
import { useFocusEffect, useLocalSearchParams } from 'expo-router';
import { MaterialCommunityIcons } from '@expo/vector-icons';
import * as Haptics from 'expo-haptics';

import { getMealMap, getTargets, saveTargets, todayKey, type Meal, type NutritionTargets } from '@/lib/meals-data';
import { FUEL_GOALS, monthDays, streak, tally, type DayStatus, type FuelKey, type GoalDay } from '@/lib/fuel-goals';
import { ScreenHeader } from '@/components/ScreenHeader';
import { Corners } from '@/components/Corners';
import { C, F } from '@/lib/theme';
import { TAP, hit } from '@/lib/hit';

const TONE: Record<DayStatus, string> = { hit: C.live, half: C.food, miss: C.alert, none: C.ghost };
const WORD: Record<DayStatus, string> = { hit: 'HIT', half: 'HALFWAY', miss: 'MISSED', none: 'NOT LOGGED' };
const DOW = ['M', 'T', 'W', 'T', 'F', 'S', 'S'];
const MONTHS = ['JANUARY', 'FEBRUARY', 'MARCH', 'APRIL', 'MAY', 'JUNE', 'JULY', 'AUGUST', 'SEPTEMBER', 'OCTOBER', 'NOVEMBER', 'DECEMBER'];
/** A heatmap shade: the day's colour, stronger the more of the goal it reached.
 *  Over the goal (a miss or a sugar overshoot) is full strength. */
function heat(status: DayStatus, pct: number): string {
  const a = pct > 1 ? 1 : 0.28 + 0.72 * Math.max(0, pct);
  return TONE[status] + Math.round(a * 255).toString(16).padStart(2, '0');
}
const fmt = (n: number) => Math.round(n).toLocaleString('en-US');
const KEYS = Object.keys(FUEL_GOALS) as FuelKey[];

export default function FuelGoal() {
  const params = useLocalSearchParams<{ key?: string }>();
  const key: FuelKey = KEYS.includes(params.key as FuelKey) ? (params.key as FuelKey) : 'calories';
  const g = FUEL_GOALS[key];

  const [targets, setTargets] = useState<NutritionTargets | null>(null);
  const [map, setMap] = useState<Record<string, Meal[]>>({});
  const [month, setMonth] = useState(() => { const d = new Date(); return new Date(d.getFullYear(), d.getMonth(), 1); });
  const [picked, setPicked] = useState<GoalDay | null>(null);
  const [editing, setEditing] = useState(false);
  const [draft, setDraft] = useState('');

  useFocusEffect(useCallback(() => {
    Promise.all([getTargets(), getMealMap()]).then(([t, m]) => { setTargets(t); setMap(m); });
  }, []));

  if (!targets) return <SafeAreaView style={st.safe} />;

  const goal = targets[key];
  const today = (map[todayKey()] ?? []).reduce((a, m) => a + (Number(m[key]) || 0), 0);
  const pct = goal > 0 ? today / goal : 0;
  const days = monthDays(map, key, goal, month);
  const counts = tally(days);
  const run = streak(map, key, goal);
  const now = new Date();
  const isThisMonth = month.getFullYear() === now.getFullYear() && month.getMonth() === now.getMonth();
  const over = g.kind === 'limit' ? today > goal : g.kind === 'plan' && pct > 1.15;
  const tone = over ? C.alert : pct >= (g.kind === 'plan' ? 0.9 : 1) ? C.live : C.hot;
  const leftWord = g.kind === 'limit'
    ? (today > goal ? `${fmt(today - goal)} ${g.unit} OVER` : `${fmt(goal - today)} ${g.unit} TO SPARE`)
    : (today >= goal ? (over ? `${fmt(today - goal)} ${g.unit} OVER` : 'GOAL HIT') : `${fmt(goal - today)} ${g.unit} TO GO`);

  function shiftMonth(by: number) {
    setPicked(null);
    setMonth(m => new Date(m.getFullYear(), m.getMonth() + by, 1));
  }

  function startEdit() { setDraft(String(goal)); setEditing(true); }
  function nudge(by: number) {
    const n = Math.max(g.min, Math.min(g.max, (parseInt(draft, 10) || goal) + by));
    Haptics.selectionAsync();
    setDraft(String(n));
  }
  async function save() {
    const n = Math.round(parseInt(draft, 10));
    if (!Number.isFinite(n)) return setEditing(false);
    const next = { ...targets!, [key]: Math.max(g.min, Math.min(g.max, n)) };
    await saveTargets(next);
    setTargets(next);
    setEditing(false);
    Haptics.notificationAsync(Haptics.NotificationFeedbackType.Success);
  }

  // Monday-first grid: blanks before the 1st.
  const lead = (days[0].date.getDay() + 6) % 7;
  const cells: (GoalDay | null)[] = [...Array(lead).fill(null), ...days];
  while (cells.length % 7) cells.push(null);

  return (
    <SafeAreaView style={st.safe} edges={['top']}>
      <ScreenHeader title={g.word} />
      <ScrollView contentContainerStyle={st.scroll} keyboardShouldPersistTaps="handled">

        {/* Today against the goal. */}
        <View style={st.hero}>
          <Corners size={16} color={tone === C.hot ? C.food : tone} />
          <Text style={st.eyebrow}>TODAY</Text>
          <Text style={[st.big, { color: tone }]} numberOfLines={1} adjustsFontSizeToFit>{fmt(today)}</Text>
          <Text style={st.of}>{`OF ${fmt(goal)} ${g.unit}${g.kind === 'limit' ? ' · LIMIT' : ''}`}</Text>
          <View style={st.bar}>
            {Array.from({ length: 30 }, (_, i) => (
              <View key={i} style={[st.barCell, { backgroundColor: i < Math.min(30, Math.round(pct * 30)) ? (tone === C.hot ? C.food : tone) : C.ghost }]} />
            ))}
          </View>
          <Text style={[st.left, over && { color: C.alert }]}>{leftWord}</Text>
        </View>

        {/* The goal and its edit. */}
        <View style={st.card}>
          <View style={st.goalRow}>
            <View style={{ flex: 1 }}>
              <Text style={st.label}>{g.kind === 'limit' ? 'DAILY LIMIT' : 'DAILY GOAL'}</Text>
              {!editing && <Text style={st.goalVal}>{fmt(goal)}<Text style={st.goalUnit}>{` ${g.unit}`}</Text></Text>}
            </View>
            {!editing && (
              <Pressable onPress={startEdit} style={({ pressed }) => [st.edit, pressed && { opacity: 0.7 }]} hitSlop={hit(100, 34, 6)}>
                <MaterialCommunityIcons name="pencil" size={14} color={C.onHot} />
                <Text style={st.editText}>EDIT</Text>
              </Pressable>
            )}
          </View>
          {editing && (
            <>
              <View style={st.stepper}>
                <Pressable onPress={() => nudge(-g.step)} style={st.stepKey} hitSlop={6}><Text style={st.stepText}>−</Text></Pressable>
                <TextInput
                  style={st.input} value={draft} onChangeText={t => setDraft(t.replace(/[^0-9]/g, ''))}
                  keyboardType="number-pad" selectTextOnFocus autoFocus maxLength={5} returnKeyType="done" onSubmitEditing={save}
                />
                <Pressable onPress={() => nudge(g.step)} style={st.stepKey} hitSlop={6}><Text style={st.stepText}>+</Text></Pressable>
              </View>
              <Text style={st.hint}>{`${g.unit} per day · ${fmt(g.min)}–${fmt(g.max)}`}</Text>
              <View style={st.editRow}>
                <Pressable onPress={() => setEditing(false)} style={[st.btn, st.btnGhost]}><Text style={[st.btnText, { color: C.ink }]}>CANCEL</Text></Pressable>
                <Pressable onPress={save} style={st.btn}><Text style={st.btnText}>SAVE GOAL</Text></Pressable>
              </View>
            </>
          )}
          <Text style={st.rule}>{g.rule}</Text>
        </View>

        {/* The month. */}
        <View style={st.card}>
          <View style={st.monthRow}>
            <Pressable onPress={() => shiftMonth(-1)} hitSlop={hit(22)} accessibilityLabel="Previous month"><MaterialCommunityIcons name="chevron-left" size={22} color={C.ink} /></Pressable>
            <Text style={st.month}>{`${MONTHS[month.getMonth()]} ${month.getFullYear()}`}</Text>
            <Pressable onPress={() => !isThisMonth && shiftMonth(1)} hitSlop={hit(22)} disabled={isThisMonth} accessibilityLabel="Next month">
              <MaterialCommunityIcons name="chevron-right" size={22} color={isThisMonth ? C.faint : C.ink} />
            </Pressable>
          </View>

          {/* The month at a glance: one strip split by how the days went. */}
          <View style={st.strip}>
            {(['hit', 'half', 'miss', 'none'] as const).filter(s => counts[s] > 0).map(s => (
              <View key={s} style={{ flex: counts[s], backgroundColor: s === 'none' ? C.raised : TONE[s] }} />
            ))}
          </View>
          <View style={st.legend}>
            {(['hit', 'half', 'miss', 'none'] as const).map(s => (
              <View key={s} style={st.legendItem}>
                <View style={[st.legendDot, { backgroundColor: s === 'none' ? C.raised : TONE[s] }]} />
                <Text style={st.legendText}><Text style={{ color: C.ink }}>{counts[s]}</Text>{` ${WORD[s]}`}</Text>
              </View>
            ))}
          </View>

          <View style={st.week}>{DOW.map((d, i) => <Text key={i} style={st.dow}>{d}</Text>)}</View>
          <View style={st.grid}>
            {cells.map((d, i) => {
              if (!d) return <View key={i} style={st.cellWrap} />;
              const isToday = d.key === todayKey();
              const on = picked?.key === d.key;
              return (
                <Pressable key={i} style={st.cellWrap} onPress={() => !d.future && setPicked(on ? null : d)}>
                  <View style={[
                    st.cell,
                    { backgroundColor: d.future ? 'transparent' : d.status === 'none' ? C.raised : heat(d.status, goal > 0 ? d.value / goal : 0) },
                    d.future && { borderWidth: 1, borderColor: C.line },
                    isToday && st.cellToday,
                    on && st.cellOn,
                  ]}>
                    <Text style={[st.cellNum, { color: d.future || d.status === 'none' ? C.faint : C.onHot }]}>{d.date.getDate()}</Text>
                  </View>
                </Pressable>
              );
            })}
          </View>

          {picked ? (
            <View style={st.picked}>
              <View style={[st.pickedDot, { backgroundColor: TONE[picked.status] }]} />
              <Text style={st.pickedText}>
                {`${picked.date.toLocaleDateString('en-GB', { weekday: 'short', day: 'numeric', month: 'short' }).toUpperCase()} · `}
                {picked.status === 'none' && picked.value === 0 ? 'NOTHING LOGGED' : `${fmt(picked.value)} OF ${fmt(goal)} ${g.unit} · ${WORD[picked.status]}`}
              </Text>
            </View>
          ) : (
            <Text style={st.tapHint}>Tap a day to see it.</Text>
          )}
        </View>

        <View style={st.streak}>
          <Text style={st.streakNum}>{run}</Text>
          <Text style={st.streakWord}>{run === 1 ? 'DAY IN A ROW ON TARGET' : 'DAYS IN A ROW ON TARGET'}</Text>
        </View>
        <View style={{ height: 40 }} />
      </ScrollView>
    </SafeAreaView>
  );
}

const st = StyleSheet.create({
  safe: { flex: 1, backgroundColor: C.bg },
  scroll: { paddingHorizontal: 16, paddingBottom: 20, gap: 8 },

  hero: { backgroundColor: C.surface, alignItems: 'center', paddingTop: 18, paddingBottom: 16, paddingHorizontal: 18, marginTop: 4 },
  eyebrow: { fontFamily: F.mono, fontSize: 11, color: C.dim, letterSpacing: 2 },
  big: { fontFamily: F.dot, fontSize: 96, lineHeight: 104, marginTop: 6 },
  of: { fontFamily: F.dot, fontSize: 13, color: C.dim, letterSpacing: 2, marginBottom: 14 },
  bar: { flexDirection: 'row', gap: 3, alignSelf: 'stretch' },
  barCell: { flex: 1, height: 8 },
  left: { fontFamily: F.dot, fontSize: 18, color: C.ink, letterSpacing: 1, marginTop: 12 },

  card: { backgroundColor: C.surface, padding: 16, gap: 12 },
  goalRow: { flexDirection: 'row', alignItems: 'center' },
  label: { fontFamily: F.dot, fontSize: 10, color: C.dim, letterSpacing: 2 },
  goalVal: { fontFamily: F.dot, fontSize: 40, color: C.ink, marginTop: 4 },
  goalUnit: { fontFamily: F.dot, fontSize: 14, color: C.faint },
  edit: { flexDirection: 'row', alignItems: 'center', gap: 6, backgroundColor: C.hot, paddingHorizontal: 14, paddingVertical: 10, borderRadius: 10, borderCurve: 'continuous' },
  editText: { fontFamily: F.dot, fontSize: 11, color: C.onHot, letterSpacing: 2 },
  stepper: { flexDirection: 'row', alignItems: 'center', gap: 10 },
  stepKey: { width: 56, height: 56, borderRadius: 12, borderCurve: 'continuous', borderWidth: 1, borderColor: C.lineHi, alignItems: 'center', justifyContent: 'center' },
  stepText: { fontFamily: F.dot, fontSize: 26, color: C.ink },
  input: { flex: 1, minWidth: 0, height: 56, borderRadius: 12, borderCurve: 'continuous', backgroundColor: C.bg, borderWidth: 1, borderColor: C.lineHi, textAlign: 'center', fontFamily: F.dot, fontSize: 32, color: C.hot },
  hint: { fontFamily: F.mono, fontSize: 11, color: C.dim, textAlign: 'center' },
  editRow: { flexDirection: 'row', gap: 8 },
  btn: { flex: 1, backgroundColor: C.hot, borderRadius: 12, borderCurve: 'continuous', minHeight: TAP, justifyContent: 'center', paddingVertical: 14, alignItems: 'center' },
  btnGhost: { backgroundColor: 'transparent', borderWidth: 1, borderColor: C.lineHi },
  btnText: { fontFamily: F.dot, fontSize: 12, color: C.onHot, letterSpacing: 2 },
  rule: { fontFamily: F.mono, fontSize: 11, color: C.faint, lineHeight: 16 },

  monthRow: { flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between' },
  month: { fontFamily: F.dot, fontSize: 14, color: C.ink, letterSpacing: 2 },
  strip: { flexDirection: 'row', height: 6, gap: 2, borderRadius: 3, overflow: 'hidden' },
  week: { flexDirection: 'row' },
  dow: { flex: 1, textAlign: 'center', fontFamily: F.dot, fontSize: 9, color: C.faint, letterSpacing: 1 },
  grid: { flexDirection: 'row', flexWrap: 'wrap', marginTop: -4 },
  cellWrap: { width: `${100 / 7}%`, aspectRatio: 1, padding: 2 },
  cell: { flex: 1, borderRadius: 4, borderCurve: 'continuous', padding: 4 },
  cellToday: { borderWidth: 2, borderColor: C.hot },
  cellOn: { transform: [{ scale: 1.08 }], borderWidth: 2, borderColor: C.hot },
  cellNum: { fontFamily: F.dot, fontSize: 8, opacity: 0.75 },
  picked: { flexDirection: 'row', alignItems: 'center', gap: 8 },
  pickedDot: { width: 8, height: 8 },
  pickedText: { fontFamily: F.dot, fontSize: 11, color: C.ink, letterSpacing: 1, flexShrink: 1 },
  tapHint: { fontFamily: F.mono, fontSize: 11, color: C.faint },
  legend: { flexDirection: 'row', flexWrap: 'wrap', columnGap: 14, rowGap: 6 },
  legendItem: { flexDirection: 'row', alignItems: 'center', gap: 6 },
  legendDot: { width: 8, height: 8, borderRadius: 2 },
  legendText: { fontFamily: F.dot, fontSize: 8, color: C.dim, letterSpacing: 1.2 },

  streak: { backgroundColor: C.surface, padding: 16, flexDirection: 'row', alignItems: 'center', gap: 12 },
  streakNum: { fontFamily: F.dot, fontSize: 34, color: C.live },
  streakWord: { fontFamily: F.dot, fontSize: 10, color: C.dim, letterSpacing: 1.6, flexShrink: 1 },
});
