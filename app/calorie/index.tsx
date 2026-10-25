// ─────────────────────────────────────────────────────────────────────────
// CALORIE DASHBOARD — "FUEL"
// Cal AI-style split: this is the slim dashboard only (summary, quick-add,
// today's meal list). Capture and the confirm/edit form are their own
// dedicated screens (calorie/capture.tsx, calorie/confirm.tsx), and past
// days live in calorie/history.tsx — matching Cal AI's dedicated-page
// structure instead of one screen with a camera flow and a bottom sheet
// bolted on.
// ─────────────────────────────────────────────────────────────────────────

import { useState, useCallback } from 'react';
import { View, Text, ScrollView, StyleSheet, TouchableOpacity, Pressable, Image } from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';
import { useRouter, useFocusEffect } from 'expo-router';
import { MaterialCommunityIcons } from '@expo/vector-icons';
import * as Haptics from 'expo-haptics';

import {
  getMealsForDate, addMeal, deleteMeal, getRecentMeals, pullRemoteMeals,
  getTargets, dailyTotals, todayKey, MEAL_TYPES,
  type Meal, type NutritionTargets,
} from '@/lib/meals-data';

import { C, F } from '@/lib/theme';
import { removeWithUndo, usePendingRemovals } from '@/lib/undo';
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

export default function CalorieScreen() {
  const router = useRouter();
  const dk = todayKey();

  const [meals, setMeals] = useState<Meal[]>([]);
  const [targets, setTargets] = useState<NutritionTargets | null>(null);
  const [recent, setRecent] = useState<Meal[]>([]);
  const gone = usePendingRemovals();

  const refresh = useCallback(async () => {
    // Show local first so the screen is instant and works offline, exactly as
    // before. Then pull anything the SERVER has for this day that we don't --
    // meals logged by the voice device land straight in Supabase and would
    // otherwise never appear here (this layer used to be push-only).
    const [m, t, r] = await Promise.all([getMealsForDate(dk), getTargets(), getRecentMeals()]);
    setMeals(m);
    setTargets(t);
    setRecent(r);

    if (await pullRemoteMeals(dk)) {
      const [m2, r2] = await Promise.all([getMealsForDate(dk), getRecentMeals()]);
      setMeals(m2);
      setRecent(r2);
    }
  }, [dk]);

  useFocusEffect(useCallback(() => { refresh(); }, [refresh]));

  // A meal waiting on UNDO is already out of the list and the totals.
  const shown = meals.filter(m => !gone.has(m.id));
  const totals = dailyTotals(shown);
  const calGoal = targets?.calories ?? 2000;

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
        photoUri: m.photoUrl ?? '', loggedVia: m.loggedVia,
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

      <ScrollView contentContainerStyle={styles.scroll}>
        {/* Today's total, as big as the screen allows. */}
        <Pressable style={({ pressed }) => [styles.hero, pressed && { opacity: 0.85 }]} onPress={() => router.push({ pathname: '/calorie/goal', params: { key: 'calories' } })}>
          <Corners size={16} color={over ? C.alert : C.food} />
          <Text style={styles.eyebrow}>EATEN TODAY  ›</Text>
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

        <View style={styles.actions}>
          {([
            { label: 'SCAN', icon: 'barcode-scan', to: '/calorie/scan', primary: true },
            { label: 'SNAP', icon: 'camera', to: '/calorie/capture', primary: false },
            { label: 'ADD', icon: 'plus', to: '/calorie/confirm', primary: false },
          ] as const).map(a => (
            <Pressable key={a.label} onPress={() => router.push(a.to)}
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
                <TouchableOpacity key={m.id} style={styles.chip} onPress={() => quickAdd(m)} activeOpacity={0.8}>
                  <Text style={styles.chipName} numberOfLines={1}>{m.name}</Text>
                  <Text style={styles.chipKcal}>{`+ ${fmt(m.calories)} KCAL`}</Text>
                </TouchableOpacity>
              ))}
            </ScrollView>
          </>
        )}

        <Text style={styles.sectionLabel}>LOG</Text>
        {shown.length === 0 && <Text style={styles.empty}>Nothing logged yet today. Scan a barcode, snap a photo or add it by hand.</Text>}
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
                  <TouchableOpacity onPress={() => remove(m)} hitSlop={{ top: 10, bottom: 10, left: 10, right: 10 }} accessibilityLabel={`Delete ${m.name}`}>
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
