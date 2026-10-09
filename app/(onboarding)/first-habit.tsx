// Screen 5/10 — first-habit. Skippable: creating a habit here is a head
// start, not a requirement (the Habits tab's own + button covers it later).
import { useState } from 'react';
import { View, Text, TextInput, StyleSheet, TouchableOpacity } from 'react-native';
import { useRouter } from 'expo-router';
import OnboardingShell from '@/components/OnboardingShell';
import { updateAnswers } from '@/lib/onboarding-data';
import type { Frequency } from '@/lib/habits-data';

import { C, F } from '@/lib/theme';
const ORANGE = C.hot;
const REG = F.mono;
const BOLD = F.mono;

const SUGGESTIONS = ['Drink more water', 'Read 10 pages', 'Stretch', 'Walk 10 minutes', 'Meditate'];

export default function FirstHabit() {
  const router = useRouter();
  const [name, setName] = useState('');
  const [frequency, setFrequency] = useState<Frequency>('daily');

  async function next() {
    if (name.trim()) await updateAnswers({ firstHabit: { name: name.trim(), frequency } });
    router.push('/(onboarding)/skills');
  }

  return (
    <OnboardingShell
      step={5}
      title="Pick your first habit"
      subtitle="One small thing you want to do consistently. You can add more later."
      onNext={next}
      nextLabel={name.trim() ? 'CONTINUE' : 'SKIP FOR NOW'}
    >
      <TextInput style={styles.input} placeholder="e.g. Read 10 pages" placeholderTextColor={C.dim} value={name} onChangeText={setName} autoFocus />
      <View style={styles.chipRow}>
        {SUGGESTIONS.map(s => (
          <TouchableOpacity key={s} style={styles.chip} onPress={() => setName(s)}>
            <Text style={styles.chipText}>{s}</Text>
          </TouchableOpacity>
        ))}
      </View>
      <View style={styles.freqRow}>
        {(['daily', 'weekly'] as Frequency[]).map(f => (
          <TouchableOpacity key={f} style={[styles.freqChip, frequency === f && styles.freqChipActive]} onPress={() => setFrequency(f)}>
            <Text style={[styles.freqChipText, frequency === f && styles.freqChipTextActive]}>{f.toUpperCase()}</Text>
          </TouchableOpacity>
        ))}
      </View>
    </OnboardingShell>
  );
}

const styles = StyleSheet.create({
  input: {
    borderWidth: 1, borderColor: C.line, borderRadius: 10, padding: 14,
    fontFamily: REG, fontSize: 13, color: C.ink, backgroundColor: C.surface,
  },
  chipRow: { flexDirection: 'row', flexWrap: 'wrap', gap: 8 },
  chip: { paddingVertical: 8, paddingHorizontal: 12, borderRadius: 8, borderWidth: 1, borderColor: C.line },
  chipText: { fontFamily: REG, fontSize: 12, color: C.dim },
  freqRow: { flexDirection: 'row', gap: 8 },
  freqChip: { flex: 1, paddingVertical: 10, borderRadius: 8, borderWidth: 1, borderColor: C.line, alignItems: 'center' },
  freqChipActive: { backgroundColor: ORANGE, borderColor: C.hot },
  freqChipText: { fontFamily: BOLD, fontSize: 12, color: C.ink },
  freqChipTextActive: { color: C.surface },
});
