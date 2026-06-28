// ─────────────────────────────────────────────────────────────────────────
// CALORIE PAGE — "FUEL"
// Manual + snap-a-picture meal logging. Manual logging is the base; the photo
// flow (capture → compress → AI estimate → confirm → save) is an accelerator
// on top of it and degrades to manual on any failure. Data + totals live in
// lib/meals-data.ts; the AI estimate goes through lib/foodVision.ts.
// ─────────────────────────────────────────────────────────────────────────

import { useState, useCallback } from 'react';
import {
  View, Text, ScrollView, StyleSheet, TouchableOpacity, TextInput,
  Modal, Pressable, ActivityIndicator, Image, Alert, KeyboardAvoidingView, Platform,
} from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';
import { useRouter, useFocusEffect } from 'expo-router';
import { MaterialCommunityIcons } from '@expo/vector-icons';
import * as Haptics from 'expo-haptics';
import * as ImagePicker from 'expo-image-picker';
import * as ImageManipulator from 'expo-image-manipulator';

import {
  getMealsForDate, addMeal, updateMeal, deleteMeal, getRecentMeals,
  getTargets, dailyTotals, todayKey, MEAL_TYPES,
  type Meal, type MealType, type NutritionTargets,
} from '@/lib/meals-data';
import { estimateMealFromPhoto } from '@/lib/foodVision';

// ── Design tokens (identical to BODY / STEPS pages) ─────────────────────────
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

type EditorState = {
  visible: boolean;
  editingId: string | null;
  name: string;
  mealType: MealType;
  calories: string;
  proteinG: string;
  carbsG: string;
  fatG: string;
  photoUri?: string;
  source: 'manual' | 'ai' | 'mock';
};

const EMPTY_EDITOR: EditorState = {
  visible: false, editingId: null, name: '', mealType: 'snack',
  calories: '', proteinG: '', carbsG: '', fatG: '', photoUri: undefined, source: 'manual',
};

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
  const [editor, setEditor] = useState<EditorState>(EMPTY_EDITOR);
  const [busy, setBusy] = useState(false);

  const refresh = useCallback(async () => {
    const [m, t, r] = await Promise.all([getMealsForDate(dk), getTargets(), getRecentMeals()]);
    setMeals(m);
    setTargets(t);
    setRecent(r);
  }, [dk]);

  useFocusEffect(useCallback(() => { refresh(); }, [refresh]));

  const totals = dailyTotals(meals);

  // ── Editor open helpers ────────────────────────────────────────────────────
  function openManual() {
    Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Light);
    setEditor({ ...EMPTY_EDITOR, visible: true });
  }

  function openEdit(m: Meal) {
    setEditor({
      visible: true, editingId: m.id, name: m.name, mealType: m.mealType,
      calories: String(m.calories), proteinG: String(m.proteinG),
      carbsG: String(m.carbsG), fatG: String(m.fatG), photoUri: m.photoUrl, source: 'manual',
    });
  }

  // ── Snap flow ───────────────────────────────────────────────────────────────
  function snap() {
    Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Medium);
    Alert.alert('Add a meal photo', undefined, [
      { text: 'Take Photo', onPress: () => pickImage('camera') },
      { text: 'Choose from Library', onPress: () => pickImage('library') },
      { text: 'Cancel', style: 'cancel' },
    ]);
  }

  async function pickImage(from: 'camera' | 'library') {
    try {
      let result: ImagePicker.ImagePickerResult;
      if (from === 'camera') {
        const perm = await ImagePicker.requestCameraPermissionsAsync();
        if (!perm.granted) {
          Alert.alert('Camera access needed', 'Enable camera access in Settings to snap a meal.');
          return;
        }
        result = await ImagePicker.launchCameraAsync({ mediaTypes: ['images'], quality: 1 });
      } else {
        result = await ImagePicker.launchImageLibraryAsync({ mediaTypes: ['images'], quality: 1 });
      }
      if (result.canceled || !result.assets?.[0]) return;
      await processImage(result.assets[0].uri);
    } catch {
      Alert.alert('Could not open the photo', 'Try again or add the meal manually.');
    }
  }

  async function processImage(uri: string) {
    setBusy(true);
    try {
      // Compress to a small JPEG (<~1MB) and get base64 for the vision call.
      const compressed = await ImageManipulator.manipulateAsync(
        uri,
        [{ resize: { width: 1024 } }],
        { compress: 0.6, format: ImageManipulator.SaveFormat.JPEG, base64: true },
      );
      const estimate = await estimateMealFromPhoto(compressed.base64 ?? '');
      setEditor({
        visible: true, editingId: null, name: estimate.name,
        mealType: guessMealType(), calories: String(estimate.calories),
        proteinG: String(estimate.proteinG), carbsG: String(estimate.carbsG),
        fatG: String(estimate.fatG), photoUri: compressed.uri, source: estimate.source,
      });
    } catch {
      // Manipulation failed — fall back to a manual entry with the photo attached.
      setEditor({ ...EMPTY_EDITOR, visible: true, photoUri: uri });
    } finally {
      setBusy(false);
    }
  }

  // ── Save / delete ───────────────────────────────────────────────────────────
  async function save() {
    const name = editor.name.trim() || 'Meal';
    const input = {
      date: dk, mealType: editor.mealType, name,
      calories: num(editor.calories), proteinG: num(editor.proteinG),
      carbsG: num(editor.carbsG), fatG: num(editor.fatG),
      photoUrl: editor.photoUri,
      loggedVia: (editor.photoUri ? 'photo' : 'manual') as Meal['loggedVia'],
    };
    if (editor.editingId) {
      await updateMeal({ ...input, id: editor.editingId, createdAt: new Date().toISOString() });
    } else {
      await addMeal(input);
    }
    Haptics.notificationAsync(Haptics.NotificationFeedbackType.Success);
    setEditor(EMPTY_EDITOR);
    refresh();
  }

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

  // ── Render ──────────────────────────────────────────────────────────────────
  const calGoal = targets?.calories ?? 2000;

  return (
    <SafeAreaView style={styles.container} edges={['top']}>
      {/* Header */}
      <View style={styles.header}>
        <TouchableOpacity onPress={() => router.back()} hitSlop={{ top: 10, bottom: 10, left: 10, right: 10 }}>
          <MaterialCommunityIcons name="chevron-left" size={26} color={ORANGE} />
        </TouchableOpacity>
        <Text style={styles.title}>FUEL</Text>
        <View style={{ width: 26 }} />
      </View>

      <ScrollView contentContainerStyle={styles.scroll} keyboardShouldPersistTaps="handled">
        {/* Summary card */}
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

        {/* Actions */}
        <View style={styles.actionRow}>
          <TouchableOpacity style={[styles.actionBtn, styles.actionPrimary]} onPress={snap} activeOpacity={0.85}>
            <MaterialCommunityIcons name="camera" size={18} color="#FFF" />
            <Text style={styles.actionPrimaryText}>SNAP A MEAL</Text>
          </TouchableOpacity>
          <TouchableOpacity style={[styles.actionBtn, styles.actionGhost]} onPress={openManual} activeOpacity={0.85}>
            <MaterialCommunityIcons name="plus" size={18} color={ORANGE} />
            <Text style={styles.actionGhostText}>ADD MANUALLY</Text>
          </TouchableOpacity>
        </View>

        {/* Quick add */}
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

        {/* Meals grouped by type */}
        <Text style={styles.sectionLabel}>TODAY</Text>
        {meals.length === 0 && <Text style={styles.empty}>No meals logged yet. Snap one or add it manually.</Text>}
        {MEAL_TYPES.map(type => {
          const group = meals.filter(m => m.mealType === type);
          if (group.length === 0) return null;
          const groupKcal = group.reduce((s, m) => s + m.calories, 0);
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

      {/* Busy overlay while estimating */}
      {busy && (
        <View style={styles.busyOverlay}>
          <ActivityIndicator color={ORANGE} size="large" />
          <Text style={styles.busyText}>ESTIMATING…</Text>
        </View>
      )}

      {/* Editor modal */}
      <Modal visible={editor.visible} animationType="slide" transparent onRequestClose={() => setEditor(EMPTY_EDITOR)}>
        <KeyboardAvoidingView behavior={Platform.OS === 'ios' ? 'padding' : undefined} style={styles.modalWrap}>
          <Pressable style={styles.modalBackdrop} onPress={() => setEditor(EMPTY_EDITOR)} />
          <View style={styles.sheet}>
            <View style={styles.sheetHandle} />
            <Text style={styles.sheetTitle}>{editor.editingId ? 'EDIT MEAL' : 'LOG MEAL'}</Text>

            {editor.source !== 'manual' && (
              <View style={styles.estimateBanner}>
                <MaterialCommunityIcons name="auto-fix" size={14} color={ORANGE} />
                <Text style={styles.estimateText}>
                  AI ESTIMATE — TAP ANY NUMBER TO ADJUST
                  {editor.source === 'mock' ? '  (demo — vision not connected yet)' : ''}
                </Text>
              </View>
            )}

            {editor.photoUri && <Image source={{ uri: editor.photoUri }} style={styles.sheetPhoto} />}

            <ScrollView keyboardShouldPersistTaps="handled">
              <Text style={styles.fieldLabel}>NAME</Text>
              <TextInput
                style={styles.input} value={editor.name}
                onChangeText={t => setEditor(e => ({ ...e, name: t }))}
                placeholder="e.g. Chicken & rice" placeholderTextColor={FAINT}
              />

              <Text style={styles.fieldLabel}>MEAL</Text>
              <View style={styles.typeRow}>
                {MEAL_TYPES.map(t => (
                  <TouchableOpacity
                    key={t}
                    style={[styles.typePill, editor.mealType === t && styles.typePillActive]}
                    onPress={() => setEditor(e => ({ ...e, mealType: t }))}
                  >
                    <Text style={[styles.typePillText, editor.mealType === t && styles.typePillTextActive]}>
                      {t.toUpperCase()}
                    </Text>
                  </TouchableOpacity>
                ))}
              </View>

              <View style={styles.numGrid}>
                <NumField label="CALORIES" value={editor.calories} onChange={v => setEditor(e => ({ ...e, calories: v }))} />
                <NumField label="PROTEIN g" value={editor.proteinG} onChange={v => setEditor(e => ({ ...e, proteinG: v }))} />
                <NumField label="CARBS g" value={editor.carbsG} onChange={v => setEditor(e => ({ ...e, carbsG: v }))} />
                <NumField label="FAT g" value={editor.fatG} onChange={v => setEditor(e => ({ ...e, fatG: v }))} />
              </View>
            </ScrollView>

            <View style={styles.sheetActions}>
              <TouchableOpacity style={styles.cancelBtn} onPress={() => setEditor(EMPTY_EDITOR)}>
                <Text style={styles.cancelText}>CANCEL</Text>
              </TouchableOpacity>
              <TouchableOpacity style={styles.saveBtn} onPress={save}>
                <Text style={styles.saveText}>{editor.editingId ? 'SAVE' : 'LOG IT'}</Text>
              </TouchableOpacity>
            </View>
          </View>
        </KeyboardAvoidingView>
      </Modal>
    </SafeAreaView>
  );
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

function num(s: string): number {
  const n = parseFloat(s);
  return Number.isFinite(n) && n >= 0 ? n : 0;
}

// Rough time-of-day guess so a snapped meal lands in a sensible group.
function guessMealType(): MealType {
  const h = new Date().getHours();
  if (h < 11) return 'breakfast';
  if (h < 15) return 'lunch';
  if (h < 21) return 'dinner';
  return 'snack';
}

const styles = StyleSheet.create({
  container: { flex: 1, backgroundColor: BG },
  header: {
    flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between',
    paddingHorizontal: 16, paddingVertical: 12,
  },
  title: { fontFamily: BOLD, fontSize: 18, color: INK, letterSpacing: 2 },
  scroll: { paddingHorizontal: 16, paddingBottom: 20 },

  card: {
    backgroundColor: CARD, borderWidth: 1, borderColor: BORDER, borderRadius: 14,
    padding: 16, marginBottom: 14,
  },
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

  busyOverlay: { ...StyleSheet.absoluteFillObject, backgroundColor: 'rgba(244,242,238,0.85)', alignItems: 'center', justifyContent: 'center', gap: 10 },
  busyText: { fontFamily: BOLD, fontSize: 12, color: INK, letterSpacing: 2 },

  modalWrap: { flex: 1, justifyContent: 'flex-end' },
  modalBackdrop: { ...StyleSheet.absoluteFillObject, backgroundColor: 'rgba(0,0,0,0.35)' },
  sheet: { backgroundColor: BG, borderTopLeftRadius: 20, borderTopRightRadius: 20, padding: 18, maxHeight: '88%' },
  sheetHandle: { alignSelf: 'center', width: 40, height: 4, borderRadius: 2, backgroundColor: BORDER, marginBottom: 12 },
  sheetTitle: { fontFamily: BOLD, fontSize: 14, color: INK, letterSpacing: 2, marginBottom: 12 },
  estimateBanner: { flexDirection: 'row', alignItems: 'center', gap: 6, backgroundColor: '#FFF1EC', borderRadius: 8, padding: 8, marginBottom: 12 },
  estimateText: { flex: 1, fontFamily: REG, fontSize: 10, color: '#A33C22', letterSpacing: 0.5 },
  sheetPhoto: { width: '100%', height: 150, borderRadius: 12, marginBottom: 12 },

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

  sheetActions: { flexDirection: 'row', gap: 10, marginTop: 6 },
  cancelBtn: { flex: 1, alignItems: 'center', justifyContent: 'center', height: 48, borderRadius: 12, borderWidth: 1.5, borderColor: BORDER },
  cancelText: { fontFamily: BOLD, fontSize: 12, color: MUTED, letterSpacing: 1 },
  saveBtn: { flex: 2, alignItems: 'center', justifyContent: 'center', height: 48, borderRadius: 12, backgroundColor: ORANGE },
  saveText: { fontFamily: BOLD, fontSize: 13, color: '#FFF', letterSpacing: 1 },
});
