// ─────────────────────────────────────────────────────────────────────────
// HISTORY — browsable past days (Cal AI's history screen). Same
// day-forward/back idiom as app/calendar/day.tsx. Reads only existing
// lib/meals-data.ts functions — no new data layer.
// ─────────────────────────────────────────────────────────────────────────

import { useState, useCallback } from 'react';
import { View, Text, ScrollView, StyleSheet, TouchableOpacity, Image } from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';
import { useRouter, useFocusEffect } from 'expo-router';
import { MaterialCommunityIcons } from '@expo/vector-icons';
import { toDateKey, addDaysToKey, fromDateKey } from '@/lib/dateKey';
import { getMealsForDate, dailyTotals, MEAL_TYPES, type Meal } from '@/lib/meals-data';

const ORANGE = '#FF4D00';
const INK    = '#1A1714';
const MUTED  = '#8C857B';
const FAINT  = '#C7C1B8';
const BORDER = '#E5E1DA';
const CARD   = '#FCFBF9';
const BG     = '#F4F2EE';
const BOLD   = 'PixeloidSans_700Bold';
const REG    = 'PixeloidSans_400Regular';

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
  const router = useRouter();
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
      <View style={s.header}>
        <TouchableOpacity onPress={() => router.back()} hitSlop={{ top: 10, bottom: 10, left: 10, right: 10 }}>
          <MaterialCommunityIcons name="chevron-left" size={26} color={ORANGE} />
        </TouchableOpacity>
        <Text style={s.title}>HISTORY</Text>
        <View style={{ width: 26 }} />
      </View>

      <View style={s.dateNav}>
        <TouchableOpacity onPress={() => setDateKey(k => addDaysToKey(k, -1))} hitSlop={10}>
          <MaterialCommunityIcons name="chevron-left" size={22} color={INK} />
        </TouchableOpacity>
        <Text style={s.dateLabel}>{formatDateLabel(dateKey)}</Text>
        <TouchableOpacity
          onPress={() => !isToday && setDateKey(k => addDaysToKey(k, 1))}
          hitSlop={10}
          disabled={isToday}
        >
          <MaterialCommunityIcons name="chevron-right" size={22} color={isToday ? FAINT : INK} />
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
                    : <View style={[s.mealThumb, s.mealThumbEmpty]}><MaterialCommunityIcons name="silverware-fork-knife" size={16} color={FAINT} /></View>}
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
  container: { flex: 1, backgroundColor: BG },
  header: { flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between', paddingHorizontal: 16, paddingVertical: 12 },
  title: { fontFamily: BOLD, fontSize: 16, color: INK, letterSpacing: 1 },
  dateNav: { flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between', paddingHorizontal: 24, paddingBottom: 12 },
  dateLabel: { fontFamily: BOLD, fontSize: 14, color: INK, letterSpacing: 1 },
  content: { paddingHorizontal: 16, paddingBottom: 32 },

  totalsCard: { backgroundColor: CARD, borderWidth: 1, borderColor: BORDER, borderRadius: 14, padding: 16, marginBottom: 16, alignItems: 'center' },
  totalsBig: { fontFamily: BOLD, fontSize: 24, color: ORANGE },
  totalsUnit: { fontFamily: REG, fontSize: 12, color: MUTED },
  totalsMacros: { fontFamily: REG, fontSize: 11, color: MUTED, marginTop: 6 },

  empty: { fontFamily: REG, fontSize: 13, color: MUTED, paddingVertical: 12, textAlign: 'center' },

  group: { marginBottom: 14 },
  groupTitle: { fontFamily: BOLD, fontSize: 11, color: MUTED, letterSpacing: 1, marginBottom: 6 },
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
