// ─────────────────────────────────────────────────────────────────────────
// HISTORY — browsable past days (Cal AI's history screen). Same
// day-forward/back idiom as app/calendar/day.tsx. Reads only existing
// lib/meals-data.ts functions — no new data layer.
// ─────────────────────────────────────────────────────────────────────────

import { useState, useCallback } from 'react';
import { View, Text, ScrollView, StyleSheet, TouchableOpacity, Image } from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';
import { useFocusEffect } from 'expo-router';
import { MaterialCommunityIcons } from '@expo/vector-icons';
import { toDateKey, addDaysToKey, fromDateKey } from '@/lib/dateKey';
import { getMealsForDate, dailyTotals, MEAL_TYPES, type Meal } from '@/lib/meals-data';

import { C, F } from '@/lib/theme';
import { hit } from '@/lib/hit';
import { ScreenHeader } from '@/components/ScreenHeader';
const CARD   = C.surface;
const BOLD = F.mono;
const REG = F.mono;

const MONTHS = ['JAN', 'FEB', 'MAR', 'APR', 'MAY', 'JUN', 'JUL', 'AUG', 'SEP', 'OCT', 'NOV', 'DEC'];

function formatDateLabel(dateKey: string): string {
  const d = fromDateKey(dateKey);
  if (!d) return dateKey;
  const today = toDateKey(new Date());
  const yesterday = addDaysToKey(today, -1);
  if (dateKey === today) return 'TODAY';
  if (dateKey === yesterday) return 'YESTERDAY';
  return `${MONTHS[d.getMonth()]} ${d.getDate()}`;
}

export default function CalorieHistoryScreen() {
  const [dateKey, setDateKey] = useState(toDateKey(new Date()));
  const [meals, setMeals] = useState<Meal[]>([]);

  const refresh = useCallback(async (key: string) => {
    setMeals(await getMealsForDate(key));
  }, []);

  useFocusEffect(useCallback(() => { refresh(dateKey); }, [dateKey, refresh]));

  const totals = dailyTotals(meals);
  const isToday = dateKey === toDateKey(new Date());

  return (
    <SafeAreaView style={s.container} edges={['top']}>
      <ScreenHeader title="MEAL HISTORY" />

      <View style={s.dateNav}>
        <TouchableOpacity onPress={() => setDateKey(k => addDaysToKey(k, -1))} hitSlop={hit(22)} accessibilityLabel="Previous day">
          <MaterialCommunityIcons name="chevron-left" size={22} color={C.ink} />
        </TouchableOpacity>
        <Text style={s.dateLabel}>{formatDateLabel(dateKey)}</Text>
        <TouchableOpacity
          onPress={() => !isToday && setDateKey(k => addDaysToKey(k, 1))}
          hitSlop={hit(22)}
          disabled={isToday}
          accessibilityLabel="Next day"
        >
          <MaterialCommunityIcons name="chevron-right" size={22} color={isToday ? C.faint : C.ink} />
        </TouchableOpacity>
      </View>

      <ScrollView contentContainerStyle={s.content}>
        <View style={s.totalsCard}>
          <Text style={s.totalsBig}>{totals.calories.toLocaleString()} <Text style={s.totalsUnit}>KCAL</Text></Text>
          <Text style={s.totalsMacros}>
            P {Math.round(totals.proteinG)}g  ·  C {Math.round(totals.carbsG)}g  ·  F {Math.round(totals.fatG)}g
          </Text>
        </View>

        {meals.length === 0 && <Text style={s.empty}>No meals logged this day.</Text>}
        {MEAL_TYPES.map(type => {
          const group = meals.filter(m => m.mealType === type);
          if (group.length === 0) return null;
          return (
            <View key={type} style={s.group}>
              <Text style={s.groupTitle}>{type.toUpperCase()}</Text>
              {group.map(m => (
                <View key={m.id} style={s.mealRow}>
                  {m.photoUrl
                    ? <Image source={{ uri: m.photoUrl }} style={s.mealThumb} />
                    : <View style={[s.mealThumb, s.mealThumbEmpty]}><MaterialCommunityIcons name="silverware-fork-knife" size={16} color={C.faint} /></View>}
                  <View style={{ flex: 1 }}>
                    <Text style={s.mealName} numberOfLines={1}>{m.name}</Text>
                    <Text style={s.mealMacros}>P {Math.round(m.proteinG)}  ·  C {Math.round(m.carbsG)}  ·  F {Math.round(m.fatG)}</Text>
                  </View>
                  <Text style={s.mealKcal}>{m.calories}</Text>
                </View>
              ))}
            </View>
          );
        })}
      </ScrollView>
    </SafeAreaView>
  );
}

const s = StyleSheet.create({
  container: { flex: 1, backgroundColor: C.bg },
  dateNav: { flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between', paddingHorizontal: 24, paddingBottom: 12 },
  dateLabel: { fontFamily: BOLD, fontSize: 14, color: C.ink, letterSpacing: 1 },
  content: { paddingHorizontal: 16, paddingBottom: 32 },

  totalsCard: { backgroundColor: CARD, borderWidth: 1, borderColor: C.line, borderRadius: 14, borderCurve: 'continuous', padding: 16, marginBottom: 16, alignItems: 'center' },
  totalsBig: { fontFamily: F.dot, fontSize: 24, color: C.hot },
  totalsUnit: { fontFamily: REG, fontSize: 12, color: C.dim },
  totalsMacros: { fontFamily: REG, fontSize: 12, color: C.dim, marginTop: 6 },

  empty: { fontFamily: REG, fontSize: 13, color: C.dim, paddingVertical: 12, textAlign: 'center' },

  group: { marginBottom: 14 },
  groupTitle: { fontFamily: F.dot, fontSize: 12, color: C.dim, letterSpacing: 1, marginBottom: 6 },
  mealRow: {
    flexDirection: 'row', alignItems: 'center', gap: 10, backgroundColor: C.surface,
    borderWidth: 1, borderColor: C.line, borderRadius: 12, borderCurve: 'continuous', padding: 10, marginBottom: 6,
  },
  mealThumb: { width: 38, height: 38, borderRadius: 8, borderCurve: 'continuous', backgroundColor: C.surface },
  mealThumbEmpty: { alignItems: 'center', justifyContent: 'center' },
  mealName: { fontFamily: REG, fontSize: 14, color: C.ink },
  mealMacros: { fontFamily: REG, fontSize: 12, color: C.dim, marginTop: 2 },
  mealKcal: { fontFamily: BOLD, fontSize: 15, color: C.ink },
});
