// Screen 4/10 — targets. Prefilled with lib/meals-data.ts's existing
// DEFAULT_TARGETS so this screen is just "confirm or adjust", not blank.
import { useState } from 'react';
import { View, Text, TextInput, StyleSheet } from 'react-native';
import { useRouter } from 'expo-router';
import OnboardingShell from '@/components/OnboardingShell';
import { updateAnswers } from '@/lib/onboarding-data';

const INK    = '#1A1714';
const MUTED  = '#8C857B';
const BORDER = '#E5E1DA';
const CARD   = '#FCFBF9';
const REG    = 'PixeloidSans_400Regular';
const BOLD   = 'PixeloidSans_700Bold';

export default function Targets() {
  const router = useRouter();
  const [calories, setCalories] = useState('2000');
  const [proteinG, setProteinG] = useState('150');
  const [carbsG, setCarbsG] = useState('200');
  const [fatG, setFatG] = useState('65');
  const [waterMl, setWaterMl] = useState('3000');

  async function next() {
    await updateAnswers({
      targets: {
        calories: parseInt(calories, 10) || 2000,
        proteinG: parseInt(proteinG, 10) || 150,
        carbsG: parseInt(carbsG, 10) || 200,
        fatG: parseInt(fatG, 10) || 65,
        waterMl: parseInt(waterMl, 10) || 3000,
      },
    });
    router.push('/(onboarding)/first-habit');
  }

  return (
    <OnboardingShell step={4} title="Set your daily targets" subtitle="Sensible defaults are filled in — adjust anything you like." onNext={next}>
      <Field label="Calories" value={calories} onChangeText={setCalories} />
      <Field label="Protein (g)" value={proteinG} onChangeText={setProteinG} />
      <Field label="Carbs (g)" value={carbsG} onChangeText={setCarbsG} />
      <Field label="Fat (g)" value={fatG} onChangeText={setFatG} />
      <Field label="Water (ml)" value={waterMl} onChangeText={setWaterMl} />
    </OnboardingShell>
  );
}

function Field({ label, value, onChangeText }: { label: string; value: string; onChangeText: (v: string) => void }) {
  return (
    <View style={styles.field}>
      <Text style={styles.label}>{label}</Text>
      <TextInput style={styles.input} value={value} onChangeText={onChangeText} keyboardType="number-pad" />
    </View>
  );
}

const styles = StyleSheet.create({
  field: {
    flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between',
    borderWidth: 1, borderColor: BORDER, borderRadius: 10, padding: 12, backgroundColor: CARD,
  },
  label: { fontFamily: REG, fontSize: 13, color: INK },
  input: { fontFamily: BOLD, fontSize: 14, color: INK, minWidth: 70, textAlign: 'right' },
});
