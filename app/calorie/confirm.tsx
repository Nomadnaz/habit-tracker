// ─────────────────────────────────────────────────────────────────────────
// ADD / CONFIRM — the meal form, in the FUEL page's look: a big bracketed
// kcal figure, four macro boxes, square meal chips. Two ways in:
//   TYPE — key the numbers in yourself
//   AI   — describe it ("2 eggs, toast, flat white"); food-vision estimates
//          it and fills the same form, every number still editable
// One implementation also serves:
//   - post-capture (photoUri + AI estimate params, or just photoUri on
//     estimate failure — see calorie/capture.tsx)
//   - edit (editingId + the meal's current fields as params)
// ─────────────────────────────────────────────────────────────────────────

import { useRef, useState } from 'react';
import {
  View, Text, ScrollView, StyleSheet, Pressable, TextInput, Image, KeyboardAvoidingView, Platform,
  ActivityIndicator,
} from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';
import { useRouter, useLocalSearchParams } from 'expo-router';
import { MaterialCommunityIcons } from '@expo/vector-icons';
import * as Haptics from 'expo-haptics';

import { addMeal, updateMeal, todayKey, guessMealType, MEAL_TYPES, type Meal, type MealType } from '@/lib/meals-data';
import { estimateMealFromText } from '@/lib/foodVision';
import { C, F } from '@/lib/theme';
import { hit } from '@/lib/hit';
import { ScreenHeader } from '@/components/ScreenHeader';
import { Corners } from '@/components/Corners';

type Mode = 'type' | 'ai';

function str(v: string | string[] | undefined): string {
  return Array.isArray(v) ? (v[0] ?? '') : (v ?? '');
}

function num(s: string): number {
  const n = parseFloat(s);
  return Number.isFinite(n) && n >= 0 ? n : 0;
}

/** Blank stays blank; numbers come back as plain strings for the inputs. */
const field = (n: number) => (n > 0 ? String(n) : '');

const EXAMPLES = ['2 eggs on toast', 'Chicken burrito bowl', 'Protein shake with milk', 'Large flat white'];

export default function ConfirmScreen() {
  const router = useRouter();
  const params = useLocalSearchParams<{
    editingId?: string; name?: string; mealType?: string; calories?: string;
    proteinG?: string; carbsG?: string; fatG?: string; sugarG?: string; photoUri?: string; source?: string;
    loggedVia?: string; mode?: string; date?: string;
  }>();
  // The day it's logged to: the one FUEL was showing, today by default.
  const date = str(params.date) || todayKey();

  const editingId = str(params.editingId) || null;
  const photoUri = str(params.photoUri) || undefined;
  const initialMealType = str(params.mealType) as MealType;
  // Editing, or confirming a photo, is always the form; a fresh add can be either.
  const canSwitch = !editingId && !photoUri;

  const [mode, setMode] = useState<Mode>(canSwitch && str(params.mode) === 'ai' ? 'ai' : 'type');
  const [estimated, setEstimated] = useState(str(params.source) === 'ai');
  const [name, setName] = useState(str(params.name));
  const [mealType, setMealType] = useState<MealType>(MEAL_TYPES.includes(initialMealType) ? initialMealType : guessMealType());
  const [calories, setCalories] = useState(str(params.calories));
  const [proteinG, setProteinG] = useState(str(params.proteinG));
  const [carbsG, setCarbsG] = useState(str(params.carbsG));
  const [fatG, setFatG] = useState(str(params.fatG));
  const [sugarG, setSugarG] = useState(str(params.sugarG));
  const [aiFromText, setAiFromText] = useState(false);
  const [saving, setSaving] = useState(false);

  const [prompt, setPrompt] = useState('');
  const [thinking, setThinking] = useState(false);
  const [aiError, setAiError] = useState(false);
  const promptRef = useRef<TextInput>(null);

  // 4 / 4 / 9 kcal per gram — offered when the macros are in but kcal isn't.
  const fromMacros = Math.round(num(proteinG) * 4 + num(carbsG) * 4 + num(fatG) * 9);
  const kcal = num(calories);
  const canLog = kcal > 0 || fromMacros > 0;

  async function estimate() {
    if (thinking || !prompt.trim()) return;
    setThinking(true);
    setAiError(false);
    const r = await estimateMealFromText(prompt);
    setThinking(false);
    if (!r) { setAiError(true); return; }
    void Haptics.notificationAsync(Haptics.NotificationFeedbackType.Success);
    setName(r.name);
    setCalories(field(r.calories));
    setProteinG(field(r.proteinG));
    setCarbsG(field(r.carbsG));
    setFatG(field(r.fatG));
    setSugarG(field(r.sugarG));
    setEstimated(true);
    setAiFromText(true);
    setMode('type');
  }

  async function save() {
    if (!canLog || saving) return;
    setSaving(true);
    const loggedVia: Meal['loggedVia'] = photoUri ? 'photo'
      : aiFromText ? 'ai_text'
      : editingId ? ((str(params.loggedVia) as Meal['loggedVia']) || 'manual')
      : 'manual';
    const input = {
      date, mealType, name: name.trim() || 'Meal',
      calories: kcal > 0 ? kcal : fromMacros,
      proteinG: num(proteinG), carbsG: num(carbsG), fatG: num(fatG), sugarG: num(sugarG),
      photoUrl: photoUri, loggedVia,
    };
    if (editingId) {
      await updateMeal({ ...input, id: editingId, createdAt: new Date().toISOString() });
    } else {
      await addMeal(input);
    }
    void Haptics.notificationAsync(Haptics.NotificationFeedbackType.Success);
    router.replace({ pathname: '/calorie', params: { date } });
  }

  function switchTo(m: Mode) {
    if (m === mode) return;
    void Haptics.selectionAsync();
    setMode(m);
    if (m === 'ai') setTimeout(() => promptRef.current?.focus(), 50);
  }

  return (
    <SafeAreaView style={st.container} edges={['top', 'bottom']}>
      <KeyboardAvoidingView behavior={Platform.OS === 'ios' ? 'padding' : undefined} style={{ flex: 1 }}>
        <ScreenHeader title={editingId ? 'EDIT MEAL' : 'ADD FOOD'} />

        {canSwitch && (
          <View style={st.modes}>
            {([
              { m: 'type', label: 'TYPE IT', icon: 'keyboard-outline' },
              { m: 'ai', label: 'AI', icon: 'auto-fix' },
            ] as const).map(x => {
              const on = mode === x.m;
              return (
                <Pressable key={x.m} onPress={() => switchTo(x.m)} style={[st.mode, on && st.modeOn]}>
                  <MaterialCommunityIcons name={x.icon} size={18} color={on ? C.onHot : C.dim} />
                  <Text style={[st.modeText, on && st.modeTextOn]}>{x.label}</Text>
                </Pressable>
              );
            })}
          </View>
        )}

        {mode === 'ai' ? (
          <ScrollView contentContainerStyle={st.content} keyboardShouldPersistTaps="handled">
            <View style={st.promptBox}>
              <Corners size={14} color={C.food} />
              <Text style={st.eyebrow}>WHAT DID YOU EAT?</Text>
              <TextInput
                ref={promptRef}
                style={st.promptInput} value={prompt} onChangeText={t => { setPrompt(t); setAiError(false); }}
                placeholder="e.g. 2 scrambled eggs, 2 slices of buttered toast and a flat white"
                placeholderTextColor={C.faint} multiline autoFocus={str(params.mode) === 'ai'}
                returnKeyType="done" blurOnSubmit onSubmitEditing={estimate}
              />
            </View>
            <Text style={st.hint}>Say how much where you can — "200g", "a large bowl", "2 slices". Everything you list is added together.</Text>

            {!prompt && (
              <View style={st.chips}>
                {EXAMPLES.map(e => (
                  <Pressable key={e} hitSlop={hit(60, 40)} style={st.chip} onPress={() => setPrompt(e)}>
                    <Text style={st.chipText}>{e.toUpperCase()}</Text>
                  </Pressable>
                ))}
              </View>
            )}

            {aiError && (
              <View style={st.error}>
                <Text style={st.errorText}>Couldn't estimate that. Check your connection, or switch to TYPE IT.</Text>
              </View>
            )}

            <Pressable style={[st.primary, (!prompt.trim() || thinking) && { opacity: 0.4 }]} onPress={estimate} disabled={!prompt.trim() || thinking}>
              {thinking
                ? <><ActivityIndicator color={C.onHot} /><Text style={st.primaryText}>ESTIMATING</Text></>
                : <><MaterialCommunityIcons name="auto-fix" size={18} color={C.onHot} /><Text style={st.primaryText}>ESTIMATE</Text></>}
            </Pressable>
            <Text style={st.source}>YOU CAN CHECK AND CHANGE EVERY NUMBER BEFORE IT'S LOGGED</Text>
          </ScrollView>
        ) : (
          <>
            <ScrollView contentContainerStyle={st.content} keyboardShouldPersistTaps="handled">
              {estimated && (
                <View style={st.banner}>
                  <MaterialCommunityIcons name="auto-fix" size={14} color={C.food} />
                  <Text style={st.bannerText}>AI ESTIMATE · TAP ANY NUMBER TO ADJUST</Text>
                  {aiFromText && (
                    <Pressable onPress={() => switchTo('ai')} hitSlop={hit(40, 12, 8)}>
                      <Text style={st.bannerLink}>REDO</Text>
                    </Pressable>
                  )}
                </View>
              )}

              {photoUri && <Image source={{ uri: photoUri }} style={st.photo} />}

              <TextInput
                style={st.name} value={name} onChangeText={setName}
                placeholder="Name it" placeholderTextColor={C.faint} multiline blurOnSubmit
              />

              <View style={st.kcalBox}>
                <Corners size={16} color={C.food} />
                <TextInput
                  style={st.kcal} value={calories} onChangeText={setCalories}
                  keyboardType="number-pad" placeholder={fromMacros > 0 ? String(fromMacros) : '0'}
                  placeholderTextColor={C.faint} selectTextOnFocus
                />
                <Text style={st.kcalUnit}>KCAL</Text>
                {kcal === 0 && fromMacros > 0 && (
                  <Text style={st.kcalHint}>{`${fromMacros} FROM MACROS · TYPE TO OVERRIDE`}</Text>
                )}
              </View>

              <View style={st.grid}>
                {([
                  ['PROTEIN', proteinG, setProteinG],
                  ['CARBS', carbsG, setCarbsG],
                  ['FAT', fatG, setFatG],
                  ['SUGAR', sugarG, setSugarG],
                ] as const).map(([label, value, set]) => (
                  <View key={label} style={st.cell}>
                    <Corners size={8} color={C.lineHi} />
                    <Text style={st.cellLabel}>{`${label} · G`}</Text>
                    <TextInput
                      style={st.cellInput} value={value} onChangeText={set}
                      keyboardType="decimal-pad" placeholder="0" placeholderTextColor={C.faint} selectTextOnFocus
                    />
                  </View>
                ))}
              </View>

              <Text style={st.label}>MEAL</Text>
              <View style={st.chips}>
                {MEAL_TYPES.map(t => (
                  <Pressable key={t} hitSlop={hit(60, 40)} onPress={() => setMealType(t)} style={[st.chip, st.chipFlex, mealType === t && st.chipOn]}>
                    <Text style={[st.chipText, mealType === t && st.chipTextOn]}>{t.toUpperCase()}</Text>
                  </Pressable>
                ))}
              </View>
            </ScrollView>

            <View style={st.actions}>
              <Pressable style={st.cancel} onPress={() => router.back()}>
                <Text style={st.cancelText}>CANCEL</Text>
              </Pressable>
              <Pressable style={[st.save, !canLog && { opacity: 0.4 }]} onPress={save} disabled={!canLog || saving}>
                <Text style={st.primaryText}>{editingId ? 'SAVE' : 'LOG IT'}</Text>
              </Pressable>
            </View>
          </>
        )}
      </KeyboardAvoidingView>
    </SafeAreaView>
  );
}

const st = StyleSheet.create({
  container: { flex: 1, backgroundColor: C.bg },
  content: { paddingHorizontal: 16, paddingBottom: 24 },

  modes: { flexDirection: 'row', gap: 8, paddingHorizontal: 16, marginBottom: 12 },
  mode: { flex: 1, height: 48, flexDirection: 'row', gap: 8, alignItems: 'center', justifyContent: 'center', backgroundColor: C.surface, borderWidth: 1, borderColor: C.line },
  modeOn: { backgroundColor: C.hot, borderColor: C.hot },
  modeText: { fontFamily: F.dot, fontSize: 13, color: C.dim, letterSpacing: 2 },
  modeTextOn: { color: C.onHot },

  // AI
  promptBox: { backgroundColor: C.surface, padding: 18, minHeight: 190 },
  eyebrow: { fontFamily: F.mono, fontSize: 11, color: C.dim, letterSpacing: 2 },
  promptInput: { fontFamily: F.mono, fontSize: 19, lineHeight: 27, color: C.ink, marginTop: 12, minHeight: 120, textAlignVertical: 'top', padding: 0 },
  hint: { fontFamily: F.mono, fontSize: 12, color: C.dim, lineHeight: 18, marginTop: 10 },
  error: { borderWidth: 1, borderColor: C.alert, padding: 12, marginTop: 14 },
  errorText: { fontFamily: F.mono, fontSize: 12, color: C.alert, lineHeight: 18 },

  // TYPE
  banner: { flexDirection: 'row', alignItems: 'center', gap: 8, borderWidth: 1, borderColor: C.line, padding: 10, marginBottom: 12 },
  bannerText: { flex: 1, fontFamily: F.dot, fontSize: 11, color: C.dim, letterSpacing: 1 },
  bannerLink: { fontFamily: F.dot, fontSize: 11, color: C.food, letterSpacing: 1.5 },
  photo: { width: '100%', height: 180, marginBottom: 12 },

  name: { fontFamily: F.dot, fontSize: 22, lineHeight: 28, color: C.ink, paddingVertical: 8, borderBottomWidth: 1, borderBottomColor: C.lineHi },

  kcalBox: { marginTop: 14, paddingTop: 14, paddingBottom: 16, alignItems: 'center', backgroundColor: C.surface },
  kcal: { fontFamily: F.dot, fontSize: 84, lineHeight: 94, color: C.ink, minWidth: 140, textAlign: 'center', padding: 0 },
  kcalUnit: { fontFamily: F.dot, fontSize: 13, color: C.food, letterSpacing: 3 },
  kcalHint: { fontFamily: F.mono, fontSize: 10, color: C.faint, letterSpacing: 1, marginTop: 8 },

  grid: { flexDirection: 'row', flexWrap: 'wrap', gap: 8, marginTop: 8 },
  cell: { width: '48.6%', flexGrow: 1, backgroundColor: C.surface, padding: 14 },
  cellLabel: { fontFamily: F.mono, fontSize: 10, color: C.dim, letterSpacing: 1.5 },
  cellInput: { fontFamily: F.dot, fontSize: 34, color: C.ink, padding: 0, marginTop: 6 },

  label: { fontFamily: F.dot, fontSize: 11, color: C.dim, letterSpacing: 2, marginTop: 20, marginBottom: 0 },
  // 40 tall, 8 apart, grown to the full target by hit() without the rows' areas overlapping.
  chips: { flexDirection: 'row', flexWrap: 'wrap', gap: 8, marginTop: 10 },
  chip: { paddingHorizontal: 12, height: 40, justifyContent: 'center', alignItems: 'center', borderWidth: 1, borderColor: C.line, backgroundColor: C.surface },
  chipFlex: { flexGrow: 1 },
  chipOn: { backgroundColor: C.hot, borderColor: C.hot },
  chipText: { fontFamily: F.dot, fontSize: 11, color: C.dim, letterSpacing: 1 },
  chipTextOn: { color: C.onHot },

  primary: { height: 52, flexDirection: 'row', gap: 10, alignItems: 'center', justifyContent: 'center', backgroundColor: C.hot, marginTop: 20 },
  primaryText: { fontFamily: F.dot, fontSize: 14, color: C.onHot, letterSpacing: 2 },
  source: { fontFamily: F.mono, fontSize: 9, color: C.faint, letterSpacing: 1, textAlign: 'center', marginTop: 12 },

  actions: { flexDirection: 'row', gap: 8, paddingHorizontal: 16, paddingBottom: 12, paddingTop: 8 },
  cancel: { flex: 1, height: 52, alignItems: 'center', justifyContent: 'center', borderWidth: 1, borderColor: C.lineHi },
  cancelText: { fontFamily: F.dot, fontSize: 13, color: C.ink, letterSpacing: 2 },
  save: { flex: 2, height: 52, alignItems: 'center', justifyContent: 'center', backgroundColor: C.hot },
});
