// Screen 6/10 — skills. Interpretation note: the master spec's "skills"
// onboarding screen maps to the app's RPG-flavoured skill-tree gamification
// (the TREE tab, currently a 16-line stub — no tree-building logic exists
// yet to wire this into). Built as a lightweight "which skills do you want
// to level up" preference, stored in the local answers blob only. Nothing
// reads it yet; it's here so the tree feature has real seed data once it's
// built, rather than nothing.
import { useState } from 'react';
import { View, Text, StyleSheet, TouchableOpacity } from 'react-native';
import { useRouter } from 'expo-router';
import OnboardingShell from '@/components/OnboardingShell';
import { updateAnswers } from '@/lib/onboarding-data';

const INK    = '#1A1714';
const MUTED  = '#8C857B';
const ORANGE = '#FF4D00';
const BORDER = '#E5E1DA';
const CARD   = '#FCFBF9';
const REG    = 'PixeloidSans_400Regular';
const BOLD   = 'PixeloidSans_700Bold';

const SKILLS = ['Strength', 'Endurance', 'Discipline', 'Mindfulness', 'Creativity', 'Knowledge'];

export default function Skills() {
  const router = useRouter();
  const [selected, setSelected] = useState<string[]>([]);

  function toggle(s: string) {
    setSelected(cur => (cur.includes(s) ? cur.filter(x => x !== s) : [...cur, s]));
  }

  async function next() {
    await updateAnswers({ skills: selected });
    router.push('/(onboarding)/book');
  }

  return (
    <OnboardingShell step={6} title="Which skills matter to you?" subtitle="Your habit tree will grow branches for these over time." onNext={next}>
      <View style={styles.chipRow}>
        {SKILLS.map(s => {
          const active = selected.includes(s);
          return (
            <TouchableOpacity key={s} style={[styles.chip, active && styles.chipActive]} onPress={() => toggle(s)}>
              <Text style={[styles.chipText, active && styles.chipTextActive]}>{s}</Text>
            </TouchableOpacity>
          );
        })}
      </View>
    </OnboardingShell>
  );
}

const styles = StyleSheet.create({
  chipRow: { flexDirection: 'row', flexWrap: 'wrap', gap: 8 },
  chip: { paddingVertical: 10, paddingHorizontal: 14, borderRadius: 10, borderWidth: 1, borderColor: BORDER, backgroundColor: CARD },
  chipActive: { backgroundColor: ORANGE, borderColor: ORANGE },
  chipText: { fontFamily: REG, fontSize: 12, color: MUTED },
  chipTextActive: { color: '#FFFFFF', fontFamily: BOLD },
});
