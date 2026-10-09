// Screen 3/10 — goals. Multi-select chips, purely informational for now
// (no table reads this yet — it's a light personalization signal, stored in
// the same local answers blob as everything else and folded into
// user_profiles indirectly via nothing yet; kept simple rather than adding a
// column no screen reads).
import { useState } from 'react';
import { View, Text, StyleSheet, TouchableOpacity } from 'react-native';
import { useRouter } from 'expo-router';
import { MaterialCommunityIcons } from '@expo/vector-icons';
import OnboardingShell from '@/components/OnboardingShell';
import { updateAnswers } from '@/lib/onboarding-data';

import { C, F } from '@/lib/theme';
const ORANGE = C.hot;
const REG = F.mono;
const BOLD = F.mono;

const GOALS: { key: string; label: string; icon: string }[] = [
  { key: 'fitness', label: 'Get fitter', icon: 'dumbbell' },
  { key: 'nutrition', label: 'Eat better', icon: 'food-apple' },
  { key: 'sleep', label: 'Sleep better', icon: 'moon-waning-crescent' },
  { key: 'focus', label: 'Focus deeper', icon: 'timer-sand' },
  { key: 'habits', label: 'Build habits', icon: 'checkbox-marked-circle-outline' },
  { key: 'activity', label: 'Move more outdoors', icon: 'hiking' },
];

export default function Goals() {
  const router = useRouter();
  const [selected, setSelected] = useState<string[]>([]);

  function toggle(key: string) {
    setSelected(s => (s.includes(key) ? s.filter(k => k !== key) : [...s, key]));
  }

  async function next() {
    await updateAnswers({ goals: selected });
    router.push('/(onboarding)/targets');
  }

  return (
    <OnboardingShell step={3} title="What are you here for?" subtitle="Pick as many as you like." onNext={next}>
      {GOALS.map(g => {
        const active = selected.includes(g.key);
        return (
          <TouchableOpacity key={g.key} style={[styles.row, active && styles.rowActive]} onPress={() => toggle(g.key)}>
            <MaterialCommunityIcons name={g.icon as any} size={20} color={active ? C.onHot : C.hot} />
            <Text style={[styles.label, active && styles.labelActive]}>{g.label}</Text>
          </TouchableOpacity>
        );
      })}
    </OnboardingShell>
  );
}

const styles = StyleSheet.create({
  row: {
    flexDirection: 'row', alignItems: 'center', gap: 12, padding: 14,
    borderRadius: 10, borderWidth: 1, borderColor: C.line, backgroundColor: C.surface,
  },
  rowActive: { backgroundColor: ORANGE, borderColor: C.hot },
  label: { fontFamily: REG, fontSize: 13, color: C.ink },
  labelActive: { color: C.surface, fontFamily: BOLD },
});
