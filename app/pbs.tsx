// ─────────────────────────────────────────────────────────────────────────
// PBS — from TRAIN's PBS box. Your heaviest PB up top in a lit box, then
// every lift you train: PB'd ones first, heaviest first. Tap a lift to see
// its last PBs and log a new one (kg or lb, as you read weights); a new best
// gets a green NEW PB. Same pb_log as the old exercise screen (lib/workout-data).
// ─────────────────────────────────────────────────────────────────────────

import { useCallback, useMemo, useState } from 'react';
import { LayoutAnimation, Platform, Pressable, ScrollView, StyleSheet, Text, TextInput, UIManager, View } from 'react-native';
import { SafeAreaView, useSafeAreaInsets } from 'react-native-safe-area-context';
import { useFocusEffect } from 'expo-router';
import { MaterialCommunityIcons } from '@expo/vector-icons';
import * as Haptics from 'expo-haptics';

import { getExercises, getJunctions, getPBLog, logPB, type Exercise, type PBEntry } from '@/lib/workout-data';
import { formatWeightWithUnit, parseWeightToKg, useUnitPreference, weightUnitLabel } from '@/lib/unit-preference';
import { shortDate } from '@/lib/history';
import { ScreenHeader } from '@/components/ScreenHeader';
import { Corners } from '@/components/Corners';
import { C, F } from '@/lib/theme';

if (Platform.OS === 'android') UIManager.setLayoutAnimationEnabledExperimental?.(true);
const animate = () => LayoutAnimation.configureNext(LayoutAnimation.create(220, 'easeInEaseOut', 'opacity'));


type Lift = { ex: Exercise; pbs: PBEntry[]; best: PBEntry | null };

export default function PBs() {
  const insets = useSafeAreaInsets();
  const { unitSystem } = useUnitPreference();
  const [lifts, setLifts] = useState<Lift[]>([]);
  const [open, setOpen] = useState<string | null>(null);
  const [draft, setDraft] = useState('');
  const [query, setQuery] = useState('');
  const [fresh, setFresh] = useState<string | null>(null);

  const load = useCallback(async () => {
    const [exs, jcts, log] = await Promise.all([getExercises(), getJunctions(), getPBLog()]);
    const trained = new Set(jcts.map(j => j.exerciseId));
    const list = exs
      .map(ex => {
        const pbs = log.filter(p => p.exerciseId === ex.id).sort((a, b) => b.date.localeCompare(a.date));
        const best = pbs.reduce<PBEntry | null>((b, p) => (!b || p.weightKg > b.weightKg ? p : b), null);
        return { ex, pbs, best };
      })
      .filter(l => l.best || trained.has(l.ex.id))
      .sort((a, b) => (b.best?.weightKg ?? -1) - (a.best?.weightKg ?? -1) || a.ex.name.localeCompare(b.ex.name));
    setLifts(list);
  }, []);
  useFocusEffect(useCallback(() => { void load(); }, [load]));

  const shown = useMemo(() => {
    const q = query.trim().toUpperCase();
    return q ? lifts.filter(l => l.ex.name.includes(q)) : lifts;
  }, [lifts, query]);
  const top = lifts.find(l => l.best);

  const toggle = (id: string) => { void Haptics.selectionAsync(); animate(); setDraft(''); setOpen(o => (o === id ? null : id)); };

  async function save(l: Lift) {
    const kg = parseWeightToKg(draft.replace(',', '.'), unitSystem);
    if (kg == null || kg <= 0) return;
    const record = !l.best || kg > l.best.weightKg;
    await logPB(l.ex.id, kg);
    void Haptics.notificationAsync(Haptics.NotificationFeedbackType.Success);
    animate();
    setDraft('');
    setFresh(record ? l.ex.id : null);
    await load();
  }

  return (
    <SafeAreaView style={st.safe} edges={['top']}>
      <ScreenHeader title="PBS" />
      <ScrollView contentContainerStyle={{ paddingHorizontal: 16, paddingBottom: 40 + insets.bottom, gap: 10 }} keyboardShouldPersistTaps="handled" showsVerticalScrollIndicator={false}>
        <View style={st.hero}>
          <Corners color={top ? C.live : C.lineHi} size={12} />
          <Text style={st.eyebrow}>BEST LIFT</Text>
          {top?.best ? (
            <>
              <Text style={st.heroValue}>{formatWeightWithUnit(top.best.weightKg, unitSystem)}</Text>
              <Text style={st.heroSub}>{`${top.ex.name}  ·  ${shortDate(top.best.date)}`}</Text>
            </>
          ) : (
            <>
              <Text style={[st.heroValue, { color: C.dim }]}>--</Text>
              <Text style={st.heroSub}>NO PBS YET  ·  TAP A LIFT BELOW TO SET ONE</Text>
            </>
          )}
        </View>

        <View style={st.search}>
          <MaterialCommunityIcons name="magnify" size={15} color={C.dim} />
          <TextInput value={query} onChangeText={setQuery} placeholder="FIND A LIFT" placeholderTextColor={C.faint}
            style={st.searchInput} autoCapitalize="characters" autoCorrect={false} />
        </View>

        {shown.map(l => {
          const isOpen = open === l.ex.id;
          return (
            <Pressable key={l.ex.id} onPress={() => toggle(l.ex.id)} style={[st.row, isOpen && st.rowOpen]}>
              {isOpen && <Corners color={C.live} />}
              <View style={st.rowHead}>
                <Text style={st.name} numberOfLines={1}>{l.ex.name}</Text>
                {fresh === l.ex.id && <Text style={st.newTag}>NEW PB</Text>}
                <Text style={[st.best, !l.best && { color: C.faint }]}>{l.best ? formatWeightWithUnit(l.best.weightKg, unitSystem) : 'NO PB'}</Text>
              </View>
              {l.best && <Text style={st.date}>{`SET ${shortDate(l.best.date)}${l.pbs.length > 1 ? `  ·  ${l.pbs.length} LOGGED` : ''}`}</Text>}

              {isOpen && (
                <View style={st.panel}>
                  {l.pbs.length > 0 && (
                    <View style={st.past}>
                      {l.pbs.slice(0, 4).map(p => (
                        <View key={p.id} style={st.pastChip}>
                          <Text style={st.pastVal}>{formatWeightWithUnit(p.weightKg, unitSystem)}</Text>
                          <Text style={st.pastDate}>{shortDate(p.date)}</Text>
                        </View>
                      ))}
                    </View>
                  )}
                  <View style={st.entry}>
                    <TextInput
                      value={draft}
                      onChangeText={setDraft}
                      placeholder={`NEW PB ${weightUnitLabel(unitSystem)}`}
                      placeholderTextColor={C.faint}
                      keyboardType="decimal-pad"
                      autoFocus
                      style={st.input}
                      returnKeyType="done"
                      onSubmitEditing={() => save(l)}
                    />
                    <Pressable onPress={() => save(l)} style={({ pressed }) => [st.save, pressed && { opacity: 0.8 }]}>
                      <Text style={st.saveText}>SAVE</Text>
                    </Pressable>
                  </View>
                </View>
              )}
            </Pressable>
          );
        })}
        {!shown.length && <Text style={st.empty}>No lifts match.</Text>}
      </ScrollView>
    </SafeAreaView>
  );
}

const st = StyleSheet.create({
  safe: { flex: 1, backgroundColor: C.bg },
  hero: { backgroundColor: C.surface, paddingVertical: 18, paddingHorizontal: 18, gap: 4, marginBottom: 4 },
  eyebrow: { fontFamily: F.mono, fontSize: 10, letterSpacing: 2, color: C.dim },
  heroValue: { fontFamily: F.dot, fontSize: 40, color: C.live, letterSpacing: 1 },
  heroSub: { fontFamily: F.mono, fontSize: 11, letterSpacing: 1, color: C.ink },
  search: { flexDirection: 'row', alignItems: 'center', gap: 6, height: 38, borderWidth: 1, borderColor: C.line, paddingHorizontal: 12, backgroundColor: C.surface },
  searchInput: { flex: 1, fontFamily: F.mono, fontSize: 12, color: C.ink, paddingVertical: 0 },
  row: { backgroundColor: C.surface, borderWidth: 1, borderColor: C.line, paddingHorizontal: 14, paddingVertical: 12, gap: 4 },
  rowOpen: { backgroundColor: C.raised, borderColor: 'transparent' },
  rowHead: { flexDirection: 'row', alignItems: 'center', gap: 8 },
  name: { flex: 1, fontFamily: F.dot, fontSize: 13, color: C.ink, letterSpacing: 0.8 },
  newTag: { fontFamily: F.mono, fontSize: 9, letterSpacing: 2, color: C.onHot, backgroundColor: C.live, paddingHorizontal: 5, paddingVertical: 1, overflow: 'hidden' },
  best: { fontFamily: F.dot, fontSize: 15, color: C.live },
  date: { fontFamily: F.mono, fontSize: 10, letterSpacing: 1, color: C.dim },
  panel: { gap: 10, marginTop: 8 },
  past: { flexDirection: 'row', flexWrap: 'wrap', gap: 6 },
  pastChip: { borderWidth: 1, borderColor: C.lineHi, paddingHorizontal: 8, paddingVertical: 5, alignItems: 'center' },
  pastVal: { fontFamily: F.dot, fontSize: 11, color: C.ink },
  pastDate: { fontFamily: F.mono, fontSize: 9, color: C.dim, marginTop: 2 },
  entry: { flexDirection: 'row', gap: 8 },
  input: { flex: 1, height: 42, borderWidth: 1, borderColor: C.live, paddingHorizontal: 12, fontFamily: F.dot, fontSize: 16, color: C.ink, backgroundColor: C.bg },
  save: { height: 42, paddingHorizontal: 18, backgroundColor: C.live, alignItems: 'center', justifyContent: 'center' },
  saveText: { fontFamily: F.dot, fontSize: 11, letterSpacing: 1.5, color: C.onHot },
  empty: { fontFamily: F.mono, fontSize: 12, color: C.dim, paddingVertical: 10 },
});
