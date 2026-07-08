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
import { View, Text, ScrollView, StyleSheet, TouchableOpacity, Pressable, Image, Alert } from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';
import { useRouter, useFocusEffect } from 'expo-router';
import { MaterialCommunityIcons } from '@expo/vector-icons';
import * as Haptics from 'expo-haptics';

import {
  getMealsForDate, addMeal, deleteMeal, getRecentMeals,
  getTargets, dailyTotals, todayKey, MEAL_TYPES,
  type Meal, type NutritionTargets,
} from '@/lib/meals-data';
import ChatScreen from '@/components/ChatScreen';

const ORANGE = '#FF4D00';
const INK    = '#1A1714';
const MUTED  = '#8C857B';
const FAINT  = '#C7C1B8';
const BORDER = '#E5E1DA';
const CARD   = '#FCFBF9';
const BG     = '#F4F2EE';
const BOLD   = 'PixeloidSans_700Bold';
const REG    = 'PixeloidSans_400Regular';

const MACROS = [
  { key: 'proteinG' as const, label: 'PROTEIN', tKey: 'proteinG' as const, color: '#C0432B' },
  { key: 'carbsG'   as const, label: 'CARBS',   tKey: 'carbsG'   as const, color: '#3B7A57' },
  { key: 'fatG'     as const, label: 'FAT',     tKey: 'fatG'     as const, color: '#C98A1B' },
];

function ProgressBar({ value, goal, color }: { value: number; goal: number; color: string }) {
  const pct = goal > 0 ? Math.min(1, value / goal) : 0;
  return (
    <View style={styles.track}>
      <View style={[styles.fill, { width: `${pct * 100}%`, backgroundColor: color }]} />
    </View>
  );
}

export default function CalorieScreen() {
  const router = useRouter();
  const dk = todayKey();

  const [meals, setMeals] = useState<Meal[]>([]);
  const [targets, setTargets] = useState<NutritionTargets | null>(null);
  const [recent, setRecent] = useState<Meal[]>([]);
  const [chatOpen, setChatOpen] = useState(false);

  const refresh = useCallback(async () => {
    const [m, t, r] = await Promise.all([getMealsForDate(dk), getTargets(), getRecentMeals()]);
    setMeals(m);
    setTargets(t);
    setRecent(r);
  }, [dk]);

  useFocusEffect(useCallback(() => { refresh(); }, [refresh]));

  const totals = dailyTotals(meals);
  const calGoal = targets?.calories ?? 2000;

  async function quickAdd(m: Meal) {
    Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Light);
    await addMeal({
      date: dk, mealType: m.mealType, name: m.name, calories: m.calories,
      proteinG: m.proteinG, carbsG: m.carbsG, fatG: m.fatG, loggedVia: 'quick_add',
    });
    refresh();
  }

  function confirmDelete(m: Meal) {
    Alert.alert('Delete meal?', m.name, [
      { text: 'Cancel', style: 'cancel' },
      { text: 'Delete', style: 'destructive', onPress: async () => { await deleteMeal(dk, m.id); refresh(); } },
    ]);
  }

  function openEdit(m: Meal) {
    router.push({
      pathname: '/calorie/confirm',
      params: {
        editingId: m.id, name: m.name, mealType: m.mealType,
        calories: String(m.calories), proteinG: String(m.proteinG),
        carbsG: String(m.carbsG), fatG: String(m.fatG), photoUri: m.photoUrl ?? '',
      },
    });
  }

  return (
    <SafeAreaView style={styles.container} edges={['top']}>
      <View style={styles.header}>
        <TouchableOpacity onPress={() => router.back()} hitSlop={{ top: 10, bottom: 10, left: 10, right: 10 }}>
          <MaterialCommunityIcons name="chevron-left" size={26} color={ORANGE} />
        </TouchableOpacity>
        <Text style={styles.title}>FUEL</Text>
        <View style={styles.headerRight}>
          <TouchableOpacity onPress={() => router.push('/calorie/history')} hitSlop={{ top: 10, bottom: 10, left: 10, right: 10 }}>
            <MaterialCommunityIcons name="history" size={20} color={ORANGE} />
          </TouchableOpacity>
          <TouchableOpacity onPress={() => setChatOpen(true)} hitSlop={{ top: 10, bottom: 10, left: 10, right: 10 }}>
            <MaterialCommunityIcons name="chat-processing-outline" size={22} color={ORANGE} />
          </TouchableOpacity>
        </View>
      </View>

      <ScrollView contentContainerStyle={styles.scroll}>
        <View style={styles.card}>
          <View style={styles.calRow}>
            <Text style={styles.calBig}>{totals.calories.toLocaleString()}</Text>
            <Text style={styles.calGoal}>/ {calGoal.toLocaleString()} KCAL</Text>
          </View>
          <ProgressBar value={totals.calories} goal={calGoal} color={ORANGE} />

          <View style={styles.macroGrid}>
            {MACROS.map(macro => {
              const val = totals[macro.key];
              const goal = targets ? targets[macro.tKey] : 0;
              return (
                <View key={macro.key} style={styles.macroCell}>
                  <Text style={styles.macroLabel}>{macro.label}</Text>
                  <Text style={styles.macroVal}>{Math.round(val)}<Text style={styles.macroGoal}>/{goal}g</Text></Text>
                  <ProgressBar value={val} goal={goal} color={macro.color} />
                </View>
              );
            })}
          </View>
        </View>

        <View style={styles.actionRow}>
          <TouchableOpacity
            style={[styles.actionBtn, styles.actionPrimary]}
            onPress={() => router.push('/calorie/capture')}
            activeOpacity={0.85}
          >
            <MaterialCommunityIcons name="camera" size={18} color="#FFF" />
            <Text style={styles.actionPrimaryText}>SNAP A MEAL</Text>
          </TouchableOpacity>
          <TouchableOpacity
            style={[styles.actionBtn, styles.actionGhost]}
            onPress={() => router.push('/calorie/confirm')}
            activeOpacity={0.85}
          >
            <MaterialCommunityIcons name="plus" size={18} color={ORANGE} />
            <Text style={styles.actionGhostText}>ADD MANUALLY</Text>
          </TouchableOpacity>
        </View>

        {recent.length > 0 && (
          <>
            <Text style={styles.sectionLabel}>QUICK ADD</Text>
            <ScrollView horizontal showsHorizontalScrollIndicator={false} contentContainerStyle={styles.chipRow}>
              {recent.map(m => (
                <TouchableOpacity key={m.id} style={styles.chip} onPress={() => quickAdd(m)} activeOpacity={0.8}>
                  <Text style={styles.chipName} numberOfLines={1}>{m.name}</Text>
                  <Text style={styles.chipKcal}>{m.calories} KCAL</Text>
                </TouchableOpacity>
              ))}
            </ScrollView>
          </>
        )}

        <Text style={styles.sectionLabel}>TODAY</Text>
        {meals.length === 0 && <Text style={styles.empty}>No meals logged yet. Snap one or add it manually.</Text>}
        {MEAL_TYPES.map(type => {
          const group = meals.filter(m => m.mealType === type);
          if (group.length === 0) return null;
          const groupKcal = group.reduce((sum, m) => sum + m.calories, 0);
          return (
            <View key={type} style={styles.group}>
              <View style={styles.groupHead}>
                <Text style={styles.groupTitle}>{type.toUpperCase()}</Text>
                <Text style={styles.groupKcal}>{groupKcal} KCAL</Text>
              </View>
              {group.map(m => (
                <Pressable key={m.id} style={styles.mealRow} onPress={() => openEdit(m)}>
                  {m.photoUrl
                    ? <Image source={{ uri: m.photoUrl }} style={styles.mealThumb} />
                    : <View style={[styles.mealThumb, styles.mealThumbEmpty]}><MaterialCommunityIcons name="silverware-fork-knife" size={16} color={FAINT} /></View>}
                  <View style={{ flex: 1 }}>
                    <Text style={styles.mealName} numberOfLines={1}>{m.name}</Text>
                    <Text style={styles.mealMacros}>P {Math.round(m.proteinG)}  ·  C {Math.round(m.carbsG)}  ·  F {Math.round(m.fatG)}</Text>
                  </View>
                  <Text style={styles.mealKcal}>{m.calories}</Text>
                  <TouchableOpacity onPress={() => confirmDelete(m)} hitSlop={{ top: 8, bottom: 8, left: 8, right: 8 }}>
                    <MaterialCommunityIcons name="close" size={16} color={MUTED} />
                  </TouchableOpacity>
                </Pressable>
              ))}
            </View>
          );
        })}
        <View style={{ height: 40 }} />
      </ScrollView>

      <ChatScreen visible={chatOpen} onClose={() => setChatOpen(false)} companionType="calorie" onTasksUpdated={refresh} />
    </SafeAreaView>
  );
}

const styles = StyleSheet.create({
  container: { flex: 1, backgroundColor: BG },
  header: { flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between', paddingHorizontal: 16, paddingVertical: 12 },
  headerRight: { flexDirection: 'row', gap: 16 },
  title: { fontFamily: BOLD, fontSize: 18, color: INK, letterSpacing: 2 },
  scroll: { paddingHorizontal: 16, paddingBottom: 20 },

  card: { backgroundColor: CARD, borderWidth: 1, borderColor: BORDER, borderRadius: 14, padding: 16, marginBottom: 14 },
  calRow: { flexDirection: 'row', alignItems: 'baseline', gap: 8, marginBottom: 8 },
  calBig: { fontFamily: BOLD, fontSize: 34, color: INK },
  calGoal: { fontFamily: REG, fontSize: 12, color: MUTED, letterSpacing: 1 },

  track: { height: 8, backgroundColor: '#ECE8E1', borderRadius: 4, overflow: 'hidden' },
  fill: { height: 8, borderRadius: 4 },

  macroGrid: { flexDirection: 'row', gap: 10, marginTop: 16 },
  macroCell: { flex: 1 },
  macroLabel: { fontFamily: REG, fontSize: 10, color: MUTED, letterSpacing: 1, marginBottom: 3 },
  macroVal: { fontFamily: BOLD, fontSize: 14, color: INK, marginBottom: 5 },
  macroGoal: { fontFamily: REG, fontSize: 10, color: FAINT },

  actionRow: { flexDirection: 'row', gap: 10, marginBottom: 18 },
  actionBtn: { flex: 1, flexDirection: 'row', alignItems: 'center', justifyContent: 'center', gap: 6, height: 46, borderRadius: 12 },
  actionPrimary: { backgroundColor: ORANGE },
  actionPrimaryText: { fontFamily: BOLD, fontSize: 12, color: '#FFF', letterSpacing: 1 },
  actionGhost: { borderWidth: 1.5, borderColor: ORANGE, backgroundColor: CARD },
  actionGhostText: { fontFamily: BOLD, fontSize: 12, color: ORANGE, letterSpacing: 1 },

  sectionLabel: { fontFamily: BOLD, fontSize: 11, color: MUTED, letterSpacing: 2, marginBottom: 8, marginTop: 4 },

  chipRow: { gap: 8, paddingBottom: 14 },
  chip: { backgroundColor: CARD, borderWidth: 1, borderColor: BORDER, borderRadius: 10, paddingHorizontal: 12, paddingVertical: 8, maxWidth: 140 },
  chipName: { fontFamily: REG, fontSize: 12, color: INK },
  chipKcal: { fontFamily: REG, fontSize: 10, color: MUTED, marginTop: 2 },

  empty: { fontFamily: REG, fontSize: 13, color: MUTED, paddingVertical: 12 },

  group: { marginBottom: 14 },
  groupHead: { flexDirection: 'row', justifyContent: 'space-between', marginBottom: 6 },
  groupTitle: { fontFamily: BOLD, fontSize: 12, color: INK, letterSpacing: 1 },
  groupKcal: { fontFamily: REG, fontSize: 11, color: MUTED },
  mealRow: {
    flexDirection: 'row', alignItems: 'center', gap: 10, backgroundColor: CARD,
    borderWidth: 1, borderColor: BORDER, borderRadius: 12, padding: 10, marginBottom: 6,
  },
  mealThumb: { width: 38, height: 38, borderRadius: 8, backgroundColor: '#ECE8E1' },
  mealThumbEmpty: { alignItems: 'center', justifyContent: 'center' },
  mealName: { fontFamily: REG, fontSize: 14, color: INK },
  mealMacros: { fontFamily: REG, fontSize: 11, color: MUTED, marginTop: 2 },
  mealKcal: { fontFamily: BOLD, fontSize: 15, color: INK },
});
