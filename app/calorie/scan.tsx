// ─────────────────────────────────────────────────────────────────────────
// SCAN — barcode to food log. Point the camera at a packet's barcode, the
// label's numbers come from Open Food Facts (lib/barcode-food.ts), pick how
// much you had (a serving, 100 g, or any amount) and log it. Totals are the
// label's per-100 figures scaled to that amount, sugar included.
// ─────────────────────────────────────────────────────────────────────────

import { useEffect, useRef, useState } from 'react';
import {
  View, Text, StyleSheet, Pressable, TextInput, ActivityIndicator, Animated, Easing, ScrollView,
  KeyboardAvoidingView, Platform,
} from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';
import { useRouter, useLocalSearchParams } from 'expo-router';
import { CameraView, useCameraPermissions, type BarcodeScanningResult } from 'expo-camera';
import AsyncStorage from '@react-native-async-storage/async-storage';
import * as Haptics from 'expo-haptics';

import { fetchProduct, portionOf, type FoodProduct } from '@/lib/barcode-food';
import { addMeal, guessMealType, todayKey, MEAL_TYPES, type MealType } from '@/lib/meals-data';
import { C, F } from '@/lib/theme';
import { hit } from '@/lib/hit';
import { ScreenHeader } from '@/components/ScreenHeader';
import { Corners } from '@/components/Corners';

const CACHE_KEY = '@barcode_foods'; // Record<barcode, FoodProduct>

async function cached(code: string): Promise<FoodProduct | null> {
  try { return (JSON.parse((await AsyncStorage.getItem(CACHE_KEY)) ?? '{}') as Record<string, FoodProduct>)[code] ?? null; }
  catch { return null; }
}
async function remember(p: FoodProduct) {
  try {
    const all = JSON.parse((await AsyncStorage.getItem(CACHE_KEY)) ?? '{}') as Record<string, FoodProduct>;
    all[p.code] = p;
    await AsyncStorage.setItem(CACHE_KEY, JSON.stringify(all));
  } catch { /* the cache is a convenience */ }
}

type State =
  | { kind: 'scanning' }
  | { kind: 'looking'; code: string }
  | { kind: 'found'; product: FoodProduct }
  | { kind: 'missing'; code: string }
  | { kind: 'offline'; code: string };

const g = (x: number) => (Number.isInteger(x) ? String(x) : x.toFixed(1));

export default function ScanScreen() {
  const router = useRouter();
  const date = String(useLocalSearchParams<{ date?: string }>().date ?? '') || todayKey(); // the day FUEL was showing
  const [perm, requestPerm] = useCameraPermissions();
  const [state, setState] = useState<State>({ kind: 'scanning' });
  const locked = useRef(false); // the camera fires many times per code

  async function lookup(code: string) {
    setState({ kind: 'looking', code });
    const hit = await cached(code);
    if (hit) { setState({ kind: 'found', product: hit }); return; }
    const r = await fetchProduct(code);
    if (r.status === 'found') { void remember(r.product); setState({ kind: 'found', product: r.product }); }
    else setState({ kind: r.status, code });
  }

  function onScan(e: BarcodeScanningResult) {
    if (locked.current || !e.data) return;
    locked.current = true;
    void Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Medium);
    void lookup(e.data);
  }

  function again() {
    locked.current = false;
    setState({ kind: 'scanning' });
  }

  if (!perm) return <SafeAreaView style={st.container} />;
  if (!perm.granted) {
    return (
      <SafeAreaView style={st.container} edges={['top']}>
        <ScreenHeader title="SCAN" />
        <View style={st.center}>
          <Text style={st.big}>CAMERA</Text>
          <Text style={st.copy}>Scanning a barcode needs the camera. Nothing is recorded — it only reads the code.</Text>
          <Pressable style={st.primary} onPress={requestPerm}><Text style={st.primaryText}>ALLOW CAMERA</Text></Pressable>
        </View>
      </SafeAreaView>
    );
  }

  return (
    <View style={st.container}>
      {state.kind !== 'found' && (
        <CameraView
          style={StyleSheet.absoluteFill}
          facing="back"
          barcodeScannerSettings={{ barcodeTypes: ['ean13', 'ean8', 'upc_a', 'upc_e'] }}
          onBarcodeScanned={state.kind === 'scanning' ? onScan : undefined}
        />
      )}
      <SafeAreaView style={StyleSheet.absoluteFill} edges={['top', 'bottom']} pointerEvents="box-none">
        <ScreenHeader title="SCAN" />
        {state.kind === 'scanning' && <Viewfinder />}
        {state.kind === 'looking' && (
          <View style={st.center}>
            <ActivityIndicator color={C.hot} />
            <Text style={st.code}>{state.code}</Text>
          </View>
        )}
        {state.kind === 'missing' && (
          <Notice title="NOT FOUND" code={state.code}
            copy="This barcode isn't in the food database yet. Add it by hand — the label's numbers are all you need."
            action="ADD MANUALLY" onAction={() => router.replace({ pathname: '/calorie/confirm', params: { date } })} onAgain={again} />
        )}
        {state.kind === 'offline' && (
          <Notice title="NO CONNECTION" code={state.code}
            copy="Couldn't reach the food database. Check your connection and try again."
            action="TRY AGAIN" onAction={() => void lookup(state.code)} onAgain={again} />
        )}
        {state.kind === 'found' && <ProductPanel product={state.product} date={date} onAgain={again} onLogged={() => router.replace({ pathname: '/calorie', params: { date } })} />}
      </SafeAreaView>
    </View>
  );
}

/** Bracketed window with a sweeping line: where to hold the barcode. */
function Viewfinder() {
  const sweep = useRef(new Animated.Value(0)).current;
  useEffect(() => {
    const loop = Animated.loop(Animated.sequence([
      Animated.timing(sweep, { toValue: 1, duration: 1400, easing: Easing.inOut(Easing.quad), useNativeDriver: true }),
      Animated.timing(sweep, { toValue: 0, duration: 1400, easing: Easing.inOut(Easing.quad), useNativeDriver: true }),
    ]));
    loop.start();
    return () => loop.stop();
  }, [sweep]);
  return (
    <View style={st.center} pointerEvents="none">
      <View style={st.window}>
        <Corners size={26} weight={3} color={C.hot} />
        <Animated.View style={[st.sweep, { transform: [{ translateY: sweep.interpolate({ inputRange: [0, 1], outputRange: [10, 150] }) }] }]} />
      </View>
      <Text style={st.hint}>POINT AT A BARCODE</Text>
    </View>
  );
}

function Notice({ title, code, copy, action, onAction, onAgain }: {
  title: string; code: string; copy: string; action: string; onAction: () => void; onAgain: () => void;
}) {
  return (
    <View style={st.sheetWrap}>
      <View style={st.sheet}>
        <Text style={st.big}>{title}</Text>
        <Text style={st.code}>{code}</Text>
        <Text style={st.copy}>{copy}</Text>
        <Pressable style={st.primary} onPress={onAction}><Text style={st.primaryText}>{action}</Text></Pressable>
        <Pressable style={st.ghost} onPress={onAgain}><Text style={st.ghostText}>SCAN AGAIN</Text></Pressable>
      </View>
    </View>
  );
}

function ProductPanel({ product: p, date, onAgain, onLogged }: { product: FoodProduct; date: string; onAgain: () => void; onLogged: () => void }) {
  const [amount, setAmount] = useState(String(p.servingG ?? 100));
  const [mealType, setMealType] = useState<MealType>(guessMealType());
  const [saving, setSaving] = useState(false);
  const qty = Math.max(0, parseFloat(amount) || 0);
  const n = portionOf(p, qty);
  const presets = [
    ...(p.servingG ? [{ label: `1 SERVING`, value: p.servingG }] : []),
    { label: `100 ${p.unit.toUpperCase()}`, value: 100 },
    ...(p.servingG && p.servingG * 2 !== 100 ? [{ label: `2 SERVINGS`, value: p.servingG * 2 }] : []),
  ];
  const step = (d: number) => setAmount(a => String(Math.max(0, Math.round((parseFloat(a) || 0) + d))));

  async function log() {
    if (saving || qty <= 0) return;
    setSaving(true);
    await addMeal({
      date, mealType,
      name: `${p.name}${p.brand && !p.name.toLowerCase().includes(p.brand.toLowerCase()) ? ` (${p.brand})` : ''} · ${g(qty)}${p.unit}`,
      calories: n.calories, proteinG: n.proteinG, carbsG: n.carbsG, fatG: n.fatG, sugarG: n.sugarG,
      loggedVia: 'barcode',
    });
    void Haptics.notificationAsync(Haptics.NotificationFeedbackType.Success);
    onLogged();
  }

  return (
    <KeyboardAvoidingView behavior={Platform.OS === 'ios' ? 'padding' : undefined} style={{ flex: 1 }}>
      <ScrollView contentContainerStyle={st.panel} keyboardShouldPersistTaps="handled">
        {p.brand && <Text style={st.brand}>{p.brand.toUpperCase()}</Text>}
        <Text style={st.name}>{p.name}</Text>
        {p.servingLabel && <Text style={st.sub}>{`SERVING ${p.servingLabel}`}</Text>}

        <View style={st.kcalBox}>
          <Corners size={14} color={C.food} />
          <Text style={st.kcal}>{n.calories.toLocaleString('en-US')}</Text>
          <Text style={st.kcalUnit}>KCAL</Text>
        </View>

        <View style={st.grid}>
          {([['PROTEIN', n.proteinG], ['CARBS', n.carbsG], ['FAT', n.fatG], ['SUGAR', n.sugarG]] as const).map(([k, v]) => (
            <View key={k} style={st.cell}>
              <Corners size={8} color={C.lineHi} />
              <Text style={st.cellVal}>{g(v)}<Text style={st.cellUnit}>G</Text></Text>
              <Text style={st.cellLabel}>{k}</Text>
            </View>
          ))}
        </View>

        <Text style={st.label}>HOW MUCH</Text>
        <View style={st.amountRow}>
          <Pressable style={st.stepBtn} onPress={() => step(-10)} hitSlop={6}><Text style={st.stepText}>−</Text></Pressable>
          <View style={st.amountBox}>
            <TextInput style={st.amountInput} value={amount} onChangeText={setAmount} keyboardType="decimal-pad" selectTextOnFocus />
            <Text style={st.amountUnit}>{p.unit.toUpperCase()}</Text>
          </View>
          <Pressable style={st.stepBtn} onPress={() => step(10)} hitSlop={6}><Text style={st.stepText}>+</Text></Pressable>
        </View>
        <View style={st.chips}>
          {presets.map(x => {
            const on = qty === x.value;
            return (
              <Pressable key={x.label} hitSlop={hit(60, 40)} onPress={() => setAmount(String(x.value))} style={[st.chip, on && st.chipOn]}>
                <Text style={[st.chipText, on && st.chipTextOn]}>{`${x.label} · ${g(x.value)}${p.unit.toUpperCase()}`}</Text>
              </Pressable>
            );
          })}
        </View>

        <Text style={st.label}>MEAL</Text>
        <View style={st.chips}>
          {MEAL_TYPES.map(t => (
            <Pressable key={t} hitSlop={hit(60, 40)} onPress={() => setMealType(t)} style={[st.chip, st.chipFlex, mealType === t && st.chipOn]}>
              <Text style={[st.chipText, mealType === t && st.chipTextOn]}>{t.toUpperCase()}</Text>
            </Pressable>
          ))}
        </View>

        <Pressable style={[st.primary, qty <= 0 && { opacity: 0.4 }]} onPress={log} disabled={qty <= 0 || saving}>
          <Text style={st.primaryText}>LOG IT</Text>
        </Pressable>
        <Pressable style={st.ghost} onPress={onAgain}><Text style={st.ghostText}>SCAN SOMETHING ELSE</Text></Pressable>
        <Text style={st.source}>NUTRITION FROM OPEN FOOD FACTS · PER 100{p.unit.toUpperCase()} × AMOUNT</Text>
      </ScrollView>
    </KeyboardAvoidingView>
  );
}

const st = StyleSheet.create({
  container: { flex: 1, backgroundColor: C.bg },
  center: { flex: 1, alignItems: 'center', justifyContent: 'center', paddingHorizontal: 24, gap: 14 },

  window: { width: 280, height: 170, overflow: 'hidden' },
  sweep: { position: 'absolute', left: 14, right: 14, top: 0, height: 2, backgroundColor: C.live, opacity: 0.9 },
  hint: { fontFamily: F.dot, fontSize: 13, color: C.hot, letterSpacing: 2, marginTop: 8 },

  big: { fontFamily: F.dot, fontSize: 30, color: C.ink, letterSpacing: 1 },
  copy: { fontFamily: F.mono, fontSize: 13, color: C.dim, textAlign: 'center', lineHeight: 19 },
  code: { fontFamily: F.dot, fontSize: 12, color: C.dim, letterSpacing: 2 },

  sheetWrap: { flex: 1, justifyContent: 'flex-end', padding: 16 },
  sheet: { backgroundColor: C.surface, borderWidth: 1, borderColor: C.line, padding: 20, gap: 12, alignItems: 'center' },

  panel: { paddingHorizontal: 16, paddingBottom: 32, backgroundColor: C.bg, flexGrow: 1 },
  brand: { fontFamily: F.mono, fontSize: 11, color: C.dim, letterSpacing: 2, marginTop: 8 },
  name: { fontFamily: F.dot, fontSize: 24, color: C.ink, marginTop: 4 },
  sub: { fontFamily: F.mono, fontSize: 11, color: C.faint, letterSpacing: 1, marginTop: 4 },

  kcalBox: { marginTop: 18, paddingVertical: 18, alignItems: 'center', backgroundColor: C.surface },
  kcal: { fontFamily: F.dot, fontSize: 72, color: C.ink, lineHeight: 80 },
  kcalUnit: { fontFamily: F.dot, fontSize: 13, color: C.food, letterSpacing: 3 },

  grid: { flexDirection: 'row', gap: 8, marginTop: 8 },
  cell: { flex: 1, alignItems: 'center', paddingVertical: 14, backgroundColor: C.surface },
  cellVal: { fontFamily: F.dot, fontSize: 22, color: C.ink },
  cellUnit: { fontSize: 12, color: C.dim },
  cellLabel: { fontFamily: F.mono, fontSize: 10, color: C.dim, letterSpacing: 1.5, marginTop: 4 },

  label: { fontFamily: F.dot, fontSize: 11, color: C.dim, letterSpacing: 2, marginTop: 20, marginBottom: 8 },
  amountRow: { flexDirection: 'row', alignItems: 'center', gap: 8 },
  stepBtn: { width: 52, height: 52, alignItems: 'center', justifyContent: 'center', backgroundColor: C.raised },
  stepText: { fontFamily: F.dot, fontSize: 26, color: C.ink },
  amountBox: { flex: 1, height: 52, flexDirection: 'row', alignItems: 'center', justifyContent: 'center', gap: 6, borderWidth: 1, borderColor: C.lineHi },
  amountInput: { fontFamily: F.dot, fontSize: 28, color: C.ink, minWidth: 60, textAlign: 'center', padding: 0 },
  amountUnit: { fontFamily: F.dot, fontSize: 13, color: C.dim, letterSpacing: 1 },

  // 40 tall, 8 apart, grown to the full target by hit() without the rows' areas overlapping.
  chips: { flexDirection: 'row', flexWrap: 'wrap', gap: 8, marginTop: 8 },
  chip: { paddingHorizontal: 12, height: 40, justifyContent: 'center', alignItems: 'center', borderWidth: 1, borderColor: C.line, backgroundColor: C.surface },
  chipFlex: { flexGrow: 1 },
  chipOn: { backgroundColor: C.hot, borderColor: C.hot },
  chipText: { fontFamily: F.dot, fontSize: 11, color: C.dim, letterSpacing: 1 },
  chipTextOn: { color: C.onHot },

  primary: { alignSelf: 'stretch', height: 52, alignItems: 'center', justifyContent: 'center', backgroundColor: C.hot, marginTop: 22 },
  primaryText: { fontFamily: F.dot, fontSize: 14, color: C.onHot, letterSpacing: 2 },
  ghost: { alignSelf: 'stretch', height: 46, alignItems: 'center', justifyContent: 'center', marginTop: 4 },
  ghostText: { fontFamily: F.dot, fontSize: 12, color: C.dim, letterSpacing: 2 },
  source: { fontFamily: F.mono, fontSize: 9, color: C.faint, letterSpacing: 1, textAlign: 'center', marginTop: 10 },
});
