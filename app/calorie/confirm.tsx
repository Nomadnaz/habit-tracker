// ─────────────────────────────────────────────────────────────────────────
// CONFIRM — the editable meal form, as its own full page (Cal AI's dedicated
// confirm screen) instead of a bottom sheet. One implementation serves:
//   - post-capture (photoUri + AI estimate params, or just photoUri on
//     estimate failure — see calorie/capture.tsx)
//   - manual add (no params)
//   - edit (editingId + the meal's current fields as params)
// ─────────────────────────────────────────────────────────────────────────

import { useState } from 'react';
import {
  View, Text, ScrollView, StyleSheet, TouchableOpacity, TextInput, Image, KeyboardAvoidingView, Platform,
} from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';
import { useRouter, useLocalSearchParams } from 'expo-router';
import { MaterialCommunityIcons } from '@expo/vector-icons';
import * as Haptics from 'expo-haptics';

import { addMeal, updateMeal, todayKey, MEAL_TYPES, type MealType } from '@/lib/meals-data';

const ORANGE = '#FF4D00';
const INK    = '#1A1714';
const MUTED  = '#8C857B';
const FAINT  = '#C7C1B8';
const BORDER = '#E5E1DA';
const CARD   = '#FCFBF9';
const BG     = '#F4F2EE';
const BOLD   = 'PixeloidSans_700Bold';
const REG    = 'PixeloidSans_400Regular';

function str(v: string | string[] | undefined): string {
  return Array.isArray(v) ? (v[0] ?? '') : (v ?? '');
}

function num(s: string): number {
  const n = parseFloat(s);
  return Number.isFinite(n) && n >= 0 ? n : 0;
}

function NumField({ label, value, onChange }: { label: string; value: string; onChange: (v: string) => void }) {
  return (
    <View style={styles.numCell}>
      <Text style={styles.fieldLabel}>{label}</Text>
      <TextInput
        style={styles.input} value={value} onChangeText={onChange}
        keyboardType="number-pad" placeholder="0" placeholderTextColor={FAINT}
      />
    </View>
  );
}

export default function ConfirmScreen() {
  const router = useRouter();
  const params = useLocalSearchParams<{
    editingId?: string; name?: string; mealType?: string; calories?: string;
    proteinG?: string; carbsG?: string; fatG?: string; photoUri?: string; source?: string;
  }>();

  const editingId = str(params.editingId) || null;
  const isAiEstimate = str(params.source) === 'ai';
  const initialMealType = (str(params.mealType) as MealType) || 'snack';

  const [name, setName] = useState(str(params.name));
  const [mealType, setMealType] = useState<MealType>(MEAL_TYPES.includes(initialMealType) ? initialMealType : 'snack');
  const [calories, setCalories] = useState(str(params.calories));
  const [proteinG, setProteinG] = useState(str(params.proteinG));
  const [carbsG, setCarbsG] = useState(str(params.carbsG));
  const [fatG, setFatG] = useState(str(params.fatG));
  const photoUri = str(params.photoUri) || undefined;

  async function save() {
    const dk = todayKey();
    const input = {
      date: dk, mealType, name: name.trim() || 'Meal',
      calories: num(calories), proteinG: num(proteinG), carbsG: num(carbsG), fatG: num(fatG),
      photoUrl: photoUri,
      loggedVia: (photoUri ? 'photo' : 'manual') as 'photo' | 'manual',
    };
    if (editingId) {
      await updateMeal({ ...input, id: editingId, createdAt: new Date().toISOString() });
    } else {
      await addMeal(input);
    }
    Haptics.notificationAsync(Haptics.NotificationFeedbackType.Success);
    router.replace('/calorie');
  }

  return (
    <SafeAreaView style={styles.container} edges={['top']}>
      <KeyboardAvoidingView behavior={Platform.OS === 'ios' ? 'padding' : undefined} style={{ flex: 1 }}>
        <View style={styles.header}>
          <TouchableOpacity onPress={() => router.back()} hitSlop={{ top: 10, bottom: 10, left: 10, right: 10 }}>
            <MaterialCommunityIcons name="chevron-left" size={26} color={ORANGE} />
          </TouchableOpacity>
          <Text style={styles.title}>{editingId ? 'EDIT MEAL' : 'LOG MEAL'}</Text>
          <View style={{ width: 26 }} />
        </View>

        <ScrollView contentContainerStyle={styles.content} keyboardShouldPersistTaps="handled">
          {isAiEstimate && (
            <View style={styles.estimateBanner}>
              <MaterialCommunityIcons name="auto-fix" size={14} color={ORANGE} />
              <Text style={styles.estimateText}>AI ESTIMATE — TAP ANY NUMBER TO ADJUST</Text>
            </View>
          )}

          {photoUri && <Image source={{ uri: photoUri }} style={styles.photo} />}

          <Text style={styles.fieldLabel}>NAME</Text>
          <TextInput
            style={styles.input} value={name} onChangeText={setName}
            placeholder="e.g. Chicken & rice" placeholderTextColor={FAINT}
          />

          <Text style={styles.fieldLabel}>MEAL</Text>
          <View style={styles.typeRow}>
            {MEAL_TYPES.map(t => (
              <TouchableOpacity
                key={t}
                style={[styles.typePill, mealType === t && styles.typePillActive]}
                onPress={() => setMealType(t)}
              >
                <Text style={[styles.typePillText, mealType === t && styles.typePillTextActive]}>
                  {t.toUpperCase()}
                </Text>
              </TouchableOpacity>
            ))}
          </View>

          <View style={styles.numGrid}>
            <NumField label="CALORIES" value={calories} onChange={setCalories} />
            <NumField label="PROTEIN g" value={proteinG} onChange={setProteinG} />
            <NumField label="CARBS g" value={carbsG} onChange={setCarbsG} />
            <NumField label="FAT g" value={fatG} onChange={setFatG} />
          </View>
        </ScrollView>

        <View style={styles.actions}>
          <TouchableOpacity style={styles.cancelBtn} onPress={() => router.back()}>
            <Text style={styles.cancelText}>CANCEL</Text>
          </TouchableOpacity>
          <TouchableOpacity style={styles.saveBtn} onPress={save}>
            <Text style={styles.saveText}>{editingId ? 'SAVE' : 'LOG IT'}</Text>
          </TouchableOpacity>
        </View>
      </KeyboardAvoidingView>
    </SafeAreaView>
  );
}

const styles = StyleSheet.create({
  container: { flex: 1, backgroundColor: BG },
  header: { flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between', paddingHorizontal: 16, paddingVertical: 12 },
  title: { fontFamily: BOLD, fontSize: 16, color: INK, letterSpacing: 1 },
  content: { paddingHorizontal: 18, paddingBottom: 20 },

  estimateBanner: { flexDirection: 'row', alignItems: 'center', gap: 6, backgroundColor: '#FFF1EC', borderRadius: 8, padding: 8, marginBottom: 12 },
  estimateText: { flex: 1, fontFamily: REG, fontSize: 10, color: '#A33C22', letterSpacing: 0.5 },
  photo: { width: '100%', height: 180, borderRadius: 12, marginBottom: 14 },

  fieldLabel: { fontFamily: REG, fontSize: 10, color: MUTED, letterSpacing: 1, marginBottom: 4 },
  input: {
    borderWidth: 1, borderColor: BORDER, borderRadius: 10, paddingHorizontal: 12, paddingVertical: 10,
    fontFamily: REG, fontSize: 15, color: INK, backgroundColor: CARD, marginBottom: 12,
  },
  typeRow: { flexDirection: 'row', gap: 6, marginBottom: 12 },
  typePill: { flex: 1, alignItems: 'center', paddingVertical: 8, borderRadius: 8, borderWidth: 1, borderColor: BORDER, backgroundColor: CARD },
  typePillActive: { backgroundColor: ORANGE, borderColor: ORANGE },
  typePillText: { fontFamily: REG, fontSize: 10, color: MUTED, letterSpacing: 0.5 },
  typePillTextActive: { color: '#FFF', fontFamily: BOLD },
  numGrid: { flexDirection: 'row', flexWrap: 'wrap', gap: 10 },
  numCell: { width: '47%' },

  actions: { flexDirection: 'row', gap: 10, paddingHorizontal: 18, paddingBottom: 18, paddingTop: 6 },
  cancelBtn: { flex: 1, alignItems: 'center', justifyContent: 'center', height: 48, borderRadius: 12, borderWidth: 1.5, borderColor: BORDER },
  cancelText: { fontFamily: BOLD, fontSize: 12, color: MUTED, letterSpacing: 1 },
  saveBtn: { flex: 2, alignItems: 'center', justifyContent: 'center', height: 48, borderRadius: 12, backgroundColor: ORANGE },
  saveText: { fontFamily: BOLD, fontSize: 13, color: '#FFF', letterSpacing: 1 },
});
