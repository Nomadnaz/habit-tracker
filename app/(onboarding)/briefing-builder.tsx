// Screen 10/10 — briefing-builder. Which sources feed the daily briefing
// (components/BriefingCard.tsx, tasks 018+019) — module keys match
// buildContext's source keys directly (see tasks/019 notes). This is the
// true end of onboarding: finishing here calls flushOnboardingIfNeeded(),
// which writes user_profiles/nutrition_targets/first habit/briefing_preferences
// all at once and marks onboarding_complete, then explicitly routes to
// (tabs) — app/_layout.tsx deliberately does NOT auto-redirect out of
// (onboarding) on session alone, since signUp() on the account screen makes
// a session appear one screen before this one is even shown.
import { useState } from 'react';
import { View, Text, StyleSheet, TouchableOpacity, ActivityIndicator } from 'react-native';
import { useRouter } from 'expo-router';
import OnboardingShell from '@/components/OnboardingShell';
import { updateAnswers, flushOnboardingIfNeeded } from '@/lib/onboarding-data';

const INK    = '#1A1714';
const MUTED  = '#8C857B';
const ORANGE = '#FF4D00';
const BORDER = '#E5E1DA';
const CARD   = '#FCFBF9';
const REG    = 'PixeloidSans_400Regular';
const BOLD   = 'PixeloidSans_700Bold';

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
    await flushOnboardingIfNeeded();
    router.replace('/(tabs)');
  }

  return (
    <OnboardingShell
      step={10}
      title="Build your daily briefing"
      subtitle="Pick what feeds your morning summary. You can change this anytime."
      onNext={finish}
      nextLabel={finishing ? 'FINISHING…' : 'FINISH'}
      nextDisabled={finishing}
      showBack={false}
    >
      {MODULES.map(m => {
        const active = selected.includes(m.key);
        return (
          <TouchableOpacity key={m.key} style={[styles.row, active && styles.rowActive]} onPress={() => toggle(m.key)}>
            <Text style={[styles.label, active && styles.labelActive]}>{m.label}</Text>
          </TouchableOpacity>
        );
      })}
      {finishing && <ActivityIndicator color={ORANGE} style={{ marginTop: 8 }} />}
    </OnboardingShell>
  );
}

const styles = StyleSheet.create({
  row: {
    padding: 14, borderRadius: 10, borderWidth: 1, borderColor: BORDER, backgroundColor: CARD,
  },
  rowActive: { backgroundColor: ORANGE, borderColor: ORANGE },
  label: { fontFamily: REG, fontSize: 13, color: INK },
  labelActive: { color: '#FFFFFF', fontFamily: BOLD },
});
