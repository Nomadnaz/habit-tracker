// ─────────────────────────────────────────────────────────────────────────
// CALORIE DASHBOARD — "FUEL"
// Cal AI-style split: this is the slim dashboard only (summary, quick-add,
// the day's meal list). Capture and the confirm/edit form are their own
// dedicated screens (calorie/capture.tsx, calorie/confirm.tsx) — matching
// Cal AI's dedicated-page structure instead of one screen with a camera flow
// and a bottom sheet bolted on. ‹ › under the header steps back through
// past days (or open it on one with a `date` param): that day's meals and
// water can be added, edited and removed, and SCAN / SNAP / ADD / AGAIN log
// to it.
// ─────────────────────────────────────────────────────────────────────────

import { useState, useCallback, useEffect, useRef } from 'react';
import { View, Text, ScrollView, StyleSheet, TouchableOpacity, Pressable, Image } from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';
import { useRouter, useFocusEffect, useLocalSearchParams } from 'expo-router';
import { MaterialCommunityIcons } from '@expo/vector-icons';
import * as Haptics from 'expo-haptics';

import {
  getMealsForDate, addMeal, deleteMeal, getRecentMeals, pullRemoteMeals,
  getTargets, dailyTotals, todayKey, MEAL_TYPES,
  type Meal, type NutritionTargets,
} from '@/lib/meals-data';
import { addWater, deleteWaterEntry, loadBodyData, pullRemoteBody, waterOn, type BodyData } from '@/lib/body-data';
import { addDaysToKey, fromDateKey } from '@/lib/dateKey';

import { C, F, MOD, TNUM } from '@/lib/theme';
import { hit, TAP } from '@/lib/hit';
import { removeWithUndo, usePendingRemovals } from '@/lib/undo';
import { useRevalidate } from '@/lib/revalidate';
import { ScreenHeader, HeaderIcon } from '@/components/ScreenHeader';
import { Corners } from '@/components/Corners';

type MacroKey = 'proteinG' | 'carbsG' | 'fatG' | 'sugarG';
// Protein is a floor (green once reached); sugar is a limit (red past it);
// carbs and fat are the plan, so food orange, red only when well over.
const MACROS: { key: MacroKey; label: string; kind: 'floor' | 'limit' | 'plan' }[] = [
  { key: 'proteinG', label: 'PROTEIN', kind: 'floor' },
  { key: 'carbsG',   label: 'CARBS',   kind: 'plan' },
  { key: 'fatG',     label: 'FAT',     kind: 'plan' },
  { key: 'sugarG',   label: 'SUGAR',   kind: 'limit' },
];

function macroColor(kind: 'floor' | 'limit' | 'plan', value: number, goal: number): string {
  if (goal <= 0) return C.food;
  if (kind === 'floor') return value >= goal ? C.live : C.food;
  if (kind === 'limit') return value > goal ? C.alert : C.food;
  return value > goal * 1.15 ? C.alert : C.food;
}

/** A row of square cells filled to value/goal — the puck's dot bar. */
function DotBar({ value, goal, color, cells = 24 }: { value: number; goal: number; color: string; cells?: number }) {
  const lit = goal > 0 ? Math.min(cells, Math.round((value / goal) * cells)) : 0;
  return (
    <View style={styles.dots}>
      {Array.from({ length: cells }, (_, i) => (
        <View key={i} style={[styles.dot, { backgroundColor: i < lit ? color : C.ghost }]} />
      ))}
    </View>
  );
}

const fmt = (n: number) => Math.round(n).toLocaleString('en-US');

const DOW = ['SUN', 'MON', 'TUE', 'WED', 'THU', 'FRI', 'SAT'];
const MON = ['JAN', 'FEB', 'MAR', 'APR', 'MAY', 'JUN', 'JUL', 'AUG', 'SEP', 'OCT', 'NOV', 'DEC'];
/** TODAY, YESTERDAY, else e.g. MON 26 OCT. */
function dayWord(key: string): string {
  const today = todayKey();
  if (key === today) return 'TODAY';
  if (key === addDaysToKey(today, -1)) return 'YESTERDAY';
  const d = fromDateKey(key);
  return d ? `${DOW[d.getDay()]} ${String(d.getDate()).padStart(2, '0')} ${MON[d.getMonth()]}` : key;
}

export default function CalorieScreen() {
  const router = useRouter();
  const params = useLocalSearchParams<{ date?: string }>();
  const [dk, setDk] = useState(() => (params.date && fromDateKey(params.date) ? params.date : todayKey()));
  useEffect(() => { if (params.date && fromDateKey(params.date)) setDk(params.date); }, [params.date]);
  const isToday = dk === todayKey();
  const word = dayWord(dk);
  const shownDay = useRef(dk); // a slow read for a day you've stepped away from doesn't land
  shownDay.current = dk;

  const [meals, setMeals] = useState<Meal[]>([]);
  const [body, setBody] = useState<BodyData | null>(null);
  const [targets, setTargets] = useState<NutritionTargets | null>(null);
  const [recent, setRecent] = useState<Meal[]>([]);
  const gone = usePendingRemovals();

  const refresh = useCallback(async () => {
    // Show local first so the screen is instant and works offline, exactly as
    // before. Then pull anything the SERVER has for this day that we don't --
    // meals logged by the voice device land straight in Supabase and would
    // otherwise never appear here (this layer used to be push-only).
    const [m, t, r, b] = await Promise.all([getMealsForDate(dk), getTargets(), getRecentMeals(), loadBodyData()]);
    if (shownDay.current !== dk) return;
    setMeals(m);
    setTargets(t);
    setRecent(r);
    setBody(b);

    void pullRemoteBody().then(async got => { if (got && shownDay.current === dk) setBody(await loadBodyData()); });
    if (await pullRemoteMeals(dk)) {
      const [m2, r2] = await Promise.all([getMealsForDate(dk), getRecentMeals()]);
      if (shownDay.current !== dk) return;
      setMeals(m2);
      setRecent(r2);
    }
  }, [dk]);

  function step(delta: number) {
    if (delta > 0 && isToday) return;
    void Haptics.selectionAsync();
    setMeals([]);
    setDk(k => addDaysToKey(k, delta));
  }

  useFocusEffect(useCallback(() => { refresh(); }, [refresh]));
  useRevalidate(() => { void refresh(); }); // back from the background or back online: pull again

  // A meal waiting on UNDO is already out of the list and the totals.
  const shown = meals.filter(m => !gone.has(m.id));
  const totals = dailyTotals(shown);
  const calGoal = targets?.calories ?? 2000;
  // The day's water; an entry waiting on UNDO is already out.
  const water = body ? waterOn(body, dk).filter(w => !gone.has(`water:${w.at}`)) : [];
  const waterMl = water.reduce((a, w) => a + w.amountMl, 0);
  const waterGoal = body?.waterGoalMl ?? 3000;

  async function drink(ml: number) {
    Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Light);
    setBody({ ...(await addWater(ml, dk)) });
  }

  function undrink() {
    const last = water[water.length - 1];
    if (!last) return;
    Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Light);
    removeWithUndo({ key: `water:${last.at}`, label: `${last.amountMl} ML REMOVED`, commit: () => deleteWaterEntry(last.at), after: refresh });
  }

  async function quickAdd(m: Meal) {
    Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Light);
    await addMeal({
      date: dk, mealType: m.mealType, name: m.name, calories: m.calories,
      proteinG: m.proteinG, carbsG: m.carbsG, fatG: m.fatG, sugarG: m.sugarG ?? 0, loggedVia: 'quick_add',
    });
    refresh();
  }

  function remove(m: Meal) {
    Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Light);
    removeWithUndo({ key: m.id, label: `${m.name.toUpperCase()} DELETED`, commit: () => deleteMeal(dk, m.id), after: refresh });
  }

  function openEdit(m: Meal) {
    router.push({
      pathname: '/calorie/confirm',
      params: {
        editingId: m.id, name: m.name, mealType: m.mealType,
        calories: String(m.calories), proteinG: String(m.proteinG),
        carbsG: String(m.carbsG), fatG: String(m.fatG), sugarG: String(m.sugarG ?? 0),
        photoUri: m.photoUrl ?? '', loggedVia: m.loggedVia, date: m.date,
      },
    });
  }

  const left = calGoal - totals.calories;
  const over = left < 0;

  return (
    <SafeAreaView style={styles.container} edges={['top']}>
      <ScreenHeader title="FUEL"
        right={<HeaderIcon icon="history" label="History" onPress={() => router.push('/calorie/history')} />}
      />

      <View style={styles.dayBar}>
        <Pressable onPress={() => step(-1)} style={({ pressed }) => [styles.dayStep, pressed && { backgroundColor: C.raised }]} accessibilityLabel="Previous day">
          <MaterialCommunityIcons name="chevron-left" size={22} color={C.ink} />
        </Pressable>
        <Pressable onPress={() => { if (!isToday) { void Haptics.selectionAsync(); setMeals([]); setDk(todayKey()); } }} disabled={isToday} style={styles.dayMid} accessibilityLabel={isToday ? 'Today' : `${word}, tap to go back to today`}>
          <Text style={styles.dayWord}>{word}</Text>
          {!isToday && <Text style={styles.dayBack}>BACK TO TODAY</Text>}
        </Pressable>
        <Pressable onPress={() => step(1)} disabled={isToday} style={({ pressed }) => [styles.dayStep, isToday && { opacity: 0.2 }, pressed && { backgroundColor: C.raised }]} accessibilityLabel="Next day">
          <MaterialCommunityIcons name="chevron-right" size={22} color={C.ink} />
        </Pressable>
      </View>

      <ScrollView contentContainerStyle={styles.scroll}>
        {/* Today's total, as big as the screen allows. */}
        <Pressable style={({ pressed }) => [styles.hero, pressed && { opacity: 0.85 }]} onPress={() => router.push({ pathname: '/calorie/goal', params: { key: 'calories' } })}>
          <Corners size={16} color={over ? C.alert : C.food} />
          <Text style={styles.eyebrow}>{`EATEN ${isToday ? 'TODAY' : word}  ›`}</Text>
          <Text style={styles.kcal} numberOfLines={1} adjustsFontSizeToFit>{fmt(totals.calories)}</Text>
          <Text style={styles.kcalUnit}>{`KCAL OF ${fmt(calGoal)}`}</Text>
          <DotBar value={totals.calories} goal={calGoal} color={over ? C.alert : C.food} cells={30} />
          <Text style={[styles.left, over && { color: C.alert }]}>{over ? `${fmt(-left)} OVER` : `${fmt(left)} LEFT`}</Text>
        </Pressable>

        <View style={styles.grid}>
          {MACROS.map(m => {
            const val = totals[m.key];
            const goal = targets ? targets[m.key] : 0;
            const color = macroColor(m.kind, val, goal);
            return (
              <Pressable key={m.key} style={({ pressed }) => [styles.cell, pressed && { opacity: 0.85 }]} onPress={() => router.push({ pathname: '/calorie/goal', params: { key: m.key } })}>
                <Corners size={8} color={C.lineHi} />
                <Text style={styles.cellLabel}>{m.kind === 'limit' ? `${m.label} · LIMIT  ›` : `${m.label}  ›`}</Text>
                <Text style={[styles.cellVal, color === C.alert && { color: C.alert }]}>
                  {fmt(val)}<Text style={styles.cellUnit}>{` / ${fmt(goal)}G`}</Text>
                </Text>
                <DotBar value={val} goal={goal} color={color} cells={14} />
              </Pressable>
            );
          })}
        </View>

        <View style={styles.water}>
          <Corners size={8} color={C.lineHi} />
          <View style={styles.waterHead}>
            <Text style={styles.cellLabel}>WATER</Text>
            <Text style={[styles.waterVal, TNUM]}>
              {(waterMl / 1000).toFixed(2)}<Text style={styles.cellUnit}>{` / ${(waterGoal / 1000).toFixed(1)} L`}</Text>
            </Text>
          </View>
          <DotBar value={waterMl} goal={waterGoal} color={MOD.water} cells={30} />
          <View style={styles.waterRow}>
            <Pressable onPress={undrink} disabled={!water.length} style={({ pressed }) => [styles.waterKey, !water.length && { opacity: 0.25 }, pressed && { backgroundColor: C.raised }]} accessibilityLabel="Remove the last water">
              <MaterialCommunityIcons name="minus" size={18} color={C.ink} />
            </Pressable>
            {[250, 500, 750].map(ml => (
              <Pressable key={ml} onPress={() => void drink(ml)} style={({ pressed }) => [styles.waterKey, { flex: 1 }, pressed && { backgroundColor: C.raised }]} accessibilityLabel={`Add ${ml} millilitres`}>
                <Text style={styles.waterKeyText}>{`+${ml}`}</Text>
              </Pressable>
            ))}
          </View>
        </View>

        <View style={styles.actions}>
          {([
            { label: 'SCAN', icon: 'barcode-scan', to: '/calorie/scan', primary: true },
            { label: 'SNAP', icon: 'camera', to: '/calorie/capture', primary: false },
            { label: 'ADD', icon: 'plus', to: '/calorie/confirm', primary: false },
          ] as const).map(a => (
            <Pressable key={a.label} onPress={() => router.push({ pathname: a.to, params: { date: dk } })}
              style={({ pressed }) => [styles.action, a.primary && styles.actionPrimary, pressed && { opacity: 0.8 }]}>
              <MaterialCommunityIcons name={a.icon} size={22} color={a.primary ? C.onHot : C.ink} />
              <Text style={[styles.actionText, a.primary && { color: C.onHot }]}>{a.label}</Text>
            </Pressable>
          ))}
        </View>

        {recent.length > 0 && (
          <>
            <Text style={styles.sectionLabel}>AGAIN</Text>
            <ScrollView horizontal showsHorizontalScrollIndicator={false} contentContainerStyle={styles.chipRow}>
              {recent.map(m => (
                <TouchableOpacity key={m.id} style={styles.chip} onPress={() => quickAdd(m)} activeOpacity={0.8} hitSlop={hit(100, 36)}>
                  <Text style={styles.chipName} numberOfLines={1}>{m.name}</Text>
                  <Text style={styles.chipKcal}>{`+ ${fmt(m.calories)} KCAL`}</Text>
                </TouchableOpacity>
              ))}
            </ScrollView>
          </>
        )}

        <Text style={styles.sectionLabel}>LOG</Text>
        {shown.length === 0 && <Text style={styles.empty}>{isToday
          ? 'Nothing logged yet today. Scan a barcode, snap a photo or add it by hand.'
          : `Nothing logged for ${word.toLowerCase()}. Anything you add here goes on that day.`}</Text>}
        {MEAL_TYPES.map(type => {
          const group = shown.filter(m => m.mealType === type);
          if (group.length === 0) return null;
          const groupKcal = group.reduce((sum, m) => sum + m.calories, 0);
          return (
            <View key={type} style={styles.group}>
              <View style={styles.groupHead}>
                <Text style={styles.groupTitle}>{type.toUpperCase()}</Text>
                <Text style={styles.groupKcal}>{`${fmt(groupKcal)} KCAL`}</Text>
              </View>
              {group.map(m => (
                <Pressable key={m.id} style={({ pressed }) => [styles.mealRow, pressed && { backgroundColor: C.raised }]} onPress={() => openEdit(m)}>
                  {m.photoUrl
                    ? <Image source={{ uri: m.photoUrl }} style={styles.mealThumb} />
                    : <View style={[styles.mealThumb, styles.mealThumbEmpty]}>
                        <MaterialCommunityIcons name={m.loggedVia === 'barcode' ? 'barcode' : m.loggedVia === 'ai_text' ? 'auto-fix' : 'silverware-fork-knife'} size={16} color={C.faint} />
                      </View>}
                  <View style={{ flex: 1 }}>
                    <Text style={styles.mealName} numberOfLines={1}>{m.name}</Text>
                    <Text style={styles.mealMacros}>
                      {`P ${fmt(m.proteinG)} · C ${fmt(m.carbsG)} · F ${fmt(m.fatG)} · S ${fmt(m.sugarG ?? 0)}`}
                    </Text>
                  </View>
                  <Text style={styles.mealKcal}>{fmt(m.calories)}</Text>
                  <TouchableOpacity onPress={() => remove(m)} hitSlop={hit(16)} accessibilityLabel={`Delete ${m.name}`}>
                    <MaterialCommunityIcons name="close" size={16} color={C.faint} />
                  </TouchableOpacity>
                </Pressable>
              ))}
            </View>
          );
        })}
        <View style={{ height: 40 }} />
      </ScrollView>
    </SafeAreaView>
  );
}

const styles = StyleSheet.create({
  container: { flex: 1, backgroundColor: C.bg },
  scroll: { paddingHorizontal: 16, paddingBottom: 20 },

  dayBar: { flexDirection: 'row', alignItems: 'center', marginHorizontal: 16, marginBottom: 6, borderWidth: 1, borderColor: C.line, borderRadius: 12, borderCurve: 'continuous' },
  dayStep: { width: TAP + 8, height: TAP, alignItems: 'center', justifyContent: 'center', borderRadius: 12, borderCurve: 'continuous' },
  dayMid: { flex: 1, minHeight: TAP, alignItems: 'center', justifyContent: 'center' },
  dayWord: { fontFamily: F.dot, fontSize: 14, color: C.ink, letterSpacing: 2 },
  dayBack: { fontFamily: F.dot, fontSize: 8, color: C.dim, letterSpacing: 1.5, marginTop: 3 },

  water: { backgroundColor: C.surface, padding: 14, marginTop: 8 },
  waterHead: { flexDirection: 'row', justifyContent: 'space-between', alignItems: 'baseline', marginBottom: 10 },
  waterVal: { fontFamily: F.dot, fontSize: 22, color: C.ink },
  waterRow: { flexDirection: 'row', gap: 8, marginTop: 12 },
  waterKey: { minWidth: TAP, minHeight: TAP, alignItems: 'center', justifyContent: 'center', borderWidth: 1, borderColor: C.lineHi },
  waterKeyText: { fontFamily: F.dot, fontSize: 13, color: C.ink, letterSpacing: 1 },

  hero: { backgroundColor: C.surface, alignItems: 'center', paddingTop: 18, paddingBottom: 16, paddingHorizontal: 18, marginTop: 4 },
  eyebrow: { fontFamily: F.mono, fontSize: 11, color: C.dim, letterSpacing: 2 },
  kcal: { fontFamily: F.dot, fontSize: 96, lineHeight: 104, color: C.ink, marginTop: 6 },
  kcalUnit: { fontFamily: F.dot, fontSize: 13, color: C.dim, letterSpacing: 2, marginBottom: 14 },
  left: { fontFamily: F.dot, fontSize: 18, color: C.ink, letterSpacing: 1, marginTop: 12 },

  dots: { flexDirection: 'row', gap: 3, alignSelf: 'stretch' },
  dot: { flex: 1, height: 8 },

  grid: { flexDirection: 'row', flexWrap: 'wrap', gap: 8, marginTop: 8 },
  cell: { width: '48.6%', flexGrow: 1, backgroundColor: C.surface, padding: 14 },
  cellLabel: { fontFamily: F.mono, fontSize: 10, color: C.dim, letterSpacing: 1.5 },
  cellVal: { fontFamily: F.dot, fontSize: 34, color: C.ink, marginTop: 6, marginBottom: 10 },
  cellUnit: { fontFamily: F.dot, fontSize: 12, color: C.faint },

  actions: { flexDirection: 'row', gap: 8, marginTop: 8, marginBottom: 18 },
  action: { flex: 1, height: 72, alignItems: 'center', justifyContent: 'center', gap: 6, backgroundColor: C.surface, borderWidth: 1, borderColor: C.line },
  actionPrimary: { backgroundColor: C.hot, borderColor: C.hot },
  actionText: { fontFamily: F.dot, fontSize: 12, color: C.ink, letterSpacing: 2 },

  sectionLabel: { fontFamily: F.dot, fontSize: 12, color: C.dim, letterSpacing: 2, marginBottom: 12, marginTop: 6 },

  chipRow: { gap: 8, paddingBottom: 16 },
  chip: { backgroundColor: C.surface, borderWidth: 1, borderColor: C.line, paddingHorizontal: 12, paddingVertical: 10, maxWidth: 160 },
  chipName: { fontFamily: F.mono, fontSize: 12, color: C.ink },
  chipKcal: { fontFamily: F.dot, fontSize: 11, color: C.food, marginTop: 4, letterSpacing: 1 },

  empty: { fontFamily: F.mono, fontSize: 13, color: C.dim, paddingVertical: 12, lineHeight: 19 },

  group: { marginBottom: 14 },
  groupHead: { flexDirection: 'row', justifyContent: 'space-between', alignItems: 'baseline', paddingBottom: 6, marginBottom: 6, borderBottomWidth: 1, borderBottomColor: C.line },
  groupTitle: { fontFamily: F.dot, fontSize: 13, color: C.ink, letterSpacing: 1.5 },
  groupKcal: { fontFamily: F.dot, fontSize: 13, color: C.dim },
  mealRow: { flexDirection: 'row', alignItems: 'center', gap: 10, backgroundColor: C.surface, padding: 10, marginBottom: 4 },
  mealThumb: { width: 40, height: 40, backgroundColor: C.raised },
  mealThumbEmpty: { alignItems: 'center', justifyContent: 'center' },
  mealName: { fontFamily: F.mono, fontSize: 14, color: C.ink },
  mealMacros: { fontFamily: F.mono, fontSize: 11, color: C.dim, marginTop: 3 },
  mealKcal: { fontFamily: F.dot, fontSize: 20, color: C.ink },
});
