// Screen 2/10 — basics. Name is the only required field; age/sex/height/
// weight are all optional (skippable defaults exist everywhere downstream).
import { useState } from 'react';
import { View, Text, TextInput, StyleSheet, TouchableOpacity } from 'react-native';
import { useRouter } from 'expo-router';
import OnboardingShell from '@/components/OnboardingShell';
import { updateAnswers } from '@/lib/onboarding-data';

import { C, F } from '@/lib/theme';
const ORANGE = C.hot;
const REG = F.mono;
const BOLD = F.mono;

const SEXES = ['Female', 'Male', 'Other', 'Prefer not to say'];

export default function Basics() {
  const router = useRouter();
  const [name, setName] = useState('');
  const [age, setAge] = useState('');
  const [sex, setSex] = useState<string | null>(null);
  const [heightCm, setHeightCm] = useState('');
  const [weightKg, setWeightKg] = useState('');

  async function next() {
    await updateAnswers({
      name: name.trim() || undefined,
      age: age ? parseInt(age, 10) : undefined,
      sex: sex ?? undefined,
      heightCm: heightCm ? parseFloat(heightCm) : undefined,
      weightKg: weightKg ? parseFloat(weightKg) : undefined,
    });
    router.push('/(onboarding)/goals');
  }

  return (
    <OnboardingShell step={2} title="Tell us about you" subtitle="Everything here is optional except your name." onNext={next} nextDisabled={!name.trim()}>
      <TextInput style={styles.input} placeholder="Your name" placeholderTextColor={C.dim} value={name} onChangeText={setName} autoFocus />
      <TextInput style={styles.input} placeholder="Age (optional)" placeholderTextColor={C.dim} value={age} onChangeText={setAge} keyboardType="number-pad" />
      <View style={styles.chipRow}>
        {SEXES.map(s => (
          <TouchableOpacity key={s} style={[styles.chip, sex === s && styles.chipActive]} onPress={() => setSex(s)}>
            <Text style={[styles.chipText, sex === s && styles.chipTextActive]}>{s}</Text>
          </TouchableOpacity>
        ))}
      </View>
      <View style={styles.row}>
        <TextInput style={[styles.input, styles.half]} placeholder="Height (cm)" placeholderTextColor={C.dim} value={heightCm} onChangeText={setHeightCm} keyboardType="decimal-pad" />
        <TextInput style={[styles.input, styles.half]} placeholder="Weight (kg)" placeholderTextColor={C.dim} value={weightKg} onChangeText={setWeightKg} keyboardType="decimal-pad" />
      </View>
    </OnboardingShell>
  );
}

const styles = StyleSheet.create({
  input: {
    borderWidth: 1, borderColor: C.line, borderRadius: 10, padding: 14,
    fontFamily: REG, fontSize: 13, color: C.ink, backgroundColor: C.surface,
  },
  row: { flexDirection: 'row', gap: 10 },
  half: { flex: 1 },
  chipRow: { flexDirection: 'row', flexWrap: 'wrap', gap: 8 },
  chip: { paddingVertical: 8, paddingHorizontal: 12, borderRadius: 8, borderWidth: 1, borderColor: C.line },
  chipActive: { backgroundColor: ORANGE, borderColor: C.hot },
  chipText: { fontFamily: REG, fontSize: 12, color: C.dim },
  chipTextActive: { color: C.surface, fontFamily: BOLD },
});
