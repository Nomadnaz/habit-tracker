// Screen 7/10 — book. Interpretation note: the master spec's "book" screen
// isn't available in this repo to check verbatim (it's kept outside the repo
// per CLAUDE.md, too large to load). Read literally against the Library
// domain (books/movies/links, task 064) it wouldn't make sense this early —
// that domain doesn't exist yet and isn't part of the lean MVP spine. Built
// instead as a short "table of contents" feature-tour screen (what's inside
// the app), which is what a "book" metaphor most plausibly means in an
// onboarding sequence. Purely informational — no data collected.
import { View, Text, StyleSheet } from 'react-native';
import { useRouter } from 'expo-router';
import { MaterialCommunityIcons } from '@expo/vector-icons';
import OnboardingShell from '@/components/OnboardingShell';

const INK    = '#1A1714';
const MUTED  = '#8C857B';
const ORANGE = '#FF4D00';
const BORDER = '#E5E1DA';
const CARD   = '#FCFBF9';
const REG    = 'PixeloidSans_400Regular';
const BOLD   = 'PixeloidSans_700Bold';

const CHAPTERS: { icon: string; title: string; body: string }[] = [
  { icon: 'checkbox-marked-circle-outline', title: 'Habits', body: 'Streaks, heatmaps, and a Medication & Supplements tracker.' },
  { icon: 'dumbbell', title: 'Body', body: 'Workouts, personal bests, water, weight, and sleep in one hub.' },
  { icon: 'hiking', title: 'Activity', body: 'Track hikes, runs, and walks with a live route.' },
  { icon: 'food-apple', title: 'Fuel', body: 'Log meals manually or snap a photo for an instant estimate.' },
  { icon: 'chat-processing-outline', title: 'AI Coach', body: 'Ask questions, get a daily briefing, and let it handle small edits for you.' },
];

export default function Book() {
  const router = useRouter();
  return (
    <OnboardingShell step={7} title="What's inside" subtitle="A quick look at what you can do." onNext={() => router.push('/(onboarding)/connect')}>
      {CHAPTERS.map(c => (
        <View key={c.title} style={styles.row}>
          <MaterialCommunityIcons name={c.icon as any} size={22} color={ORANGE} />
          <View style={{ flex: 1 }}>
            <Text style={styles.title}>{c.title}</Text>
            <Text style={styles.body}>{c.body}</Text>
          </View>
        </View>
      ))}
    </OnboardingShell>
  );
}

const styles = StyleSheet.create({
  row: {
    flexDirection: 'row', gap: 12, padding: 14, borderRadius: 10,
    borderWidth: 1, borderColor: BORDER, backgroundColor: CARD, alignItems: 'flex-start',
  },
  title: { fontFamily: BOLD, fontSize: 12, color: INK },
  body: { fontFamily: REG, fontSize: 11, color: MUTED, marginTop: 2, lineHeight: 15 },
});
