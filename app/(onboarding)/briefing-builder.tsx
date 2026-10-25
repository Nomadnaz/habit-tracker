// Screen 9/10 — briefing-builder. Which sources feed the daily briefing
// (components/BriefingCard.tsx, tasks 018+019) — module keys match
// buildContext's source keys directly (see tasks/019 notes). Saves the
// choice into the local answers and moves on to the account step (screen
// 10), which is now last so every answer exists before there's a session to
// flush them against.
import { useState } from 'react';
import { View, Text, StyleSheet, TouchableOpacity, ActivityIndicator } from 'react-native';
import { useRouter } from 'expo-router';
import OnboardingShell from '@/components/OnboardingShell';
import { updateAnswers } from '@/lib/onboarding-data';

import { C, F } from '@/lib/theme';
const ORANGE = C.hot;
const REG = F.mono;
const BOLD = F.mono;

const MODULES: { key: string; label: string }[] = [
  { key: 'tasks', label: 'Tasks & schedule' },
  { key: 'habit_logs', label: 'Habits' },
  { key: 'workout_done_log', label: 'Workouts' },
  { key: 'meals', label: 'Nutrition' },
  { key: 'activities', label: 'Activity (hike/run/walk)' },
  { key: 'sleep_logs', label: 'Sleep' },
];

export default function BriefingBuilder() {
  const router = useRouter();
  const [selected, setSelected] = useState<string[]>(['tasks', 'habit_logs']);
  const [finishing, setFinishing] = useState(false);

  function toggle(key: string) {
    setSelected(s => (s.includes(key) ? s.filter(k => k !== key) : [...s, key]));
  }

  async function finish() {
    setFinishing(true);
    await updateAnswers({ briefingModules: selected });
    setFinishing(false);
    router.push('/(onboarding)/account');
  }

  return (
    <OnboardingShell
      step={9}
      title="Build your daily briefing"
      subtitle="Pick what feeds your morning summary. You can change this anytime."
      onNext={finish}
      nextLabel={finishing ? 'SAVING…' : 'CONTINUE'}
      nextDisabled={finishing}
    >
      {MODULES.map(m => {
        const active = selected.includes(m.key);
        return (
          <TouchableOpacity key={m.key} style={[styles.row, active && styles.rowActive]} onPress={() => toggle(m.key)}>
            <Text style={[styles.label, active && styles.labelActive]}>{m.label}</Text>
          </TouchableOpacity>
        );
      })}
      {finishing && <ActivityIndicator color={C.hot} style={{ marginTop: 8 }} />}
    </OnboardingShell>
  );
}

const styles = StyleSheet.create({
  row: {
    padding: 14, borderRadius: 10, borderCurve: 'continuous', borderWidth: 1, borderColor: C.line, backgroundColor: C.surface,
  },
  rowActive: { backgroundColor: ORANGE, borderColor: C.hot },
  label: { fontFamily: REG, fontSize: 13, color: C.ink },
  labelActive: { color: C.surface, fontFamily: BOLD },
});
