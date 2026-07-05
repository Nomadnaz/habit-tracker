// ─────────────────────────────────────────────────────────────────────────
// GlobalSearch (task 074) — searches across pages, habits, goals, library
// (books/movies/links/ideas), finance (expenses/bills), workout templates,
// and tasks. Deliberately does NOT search journal/therapy (structurally
// impossible — those tables hold zero plaintext content anywhere, see
// migration 019_mental_health.sql) or mood content/raw email (excluded by
// this component simply never reading those stores, not by filtering
// results after the fact).
//
// "Trails" (trail_database) isn't searched — that table doesn't exist yet
// (FUTURE, task 067-adjacent per tasks/031's notes).
//
// Result taps navigate to the specific record where the target screen
// supports it (goals — via a highlightId param the Goals modal expands;
// tasks — via calendar/day's date param). For habits/library/finance/
// workouts, taps navigate to the section screen, not a specific row inside
// it — those screens don't have per-item deep-link support yet. Flagged
// here rather than silently claimed as complete.
// ─────────────────────────────────────────────────────────────────────────

import { useEffect, useMemo, useState } from 'react';
import { View, Text, TextInput, StyleSheet, TouchableOpacity, ScrollView } from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';
import { useRouter } from 'expo-router';
import { MaterialCommunityIcons } from '@expo/vector-icons';
import AsyncStorage from '@react-native-async-storage/async-storage';

const ORANGE = '#FF4D00';
const INK    = '#1A1714';
const MUTED  = '#8C857B';
const BORDER = '#E5E1DA';
const CARD   = '#FCFBF9';
const BG     = '#F4F2EE';
const BOLD   = 'PixeloidSans_700Bold';
const REG    = 'PixeloidSans_400Regular';

type ResultType = 'page' | 'habit' | 'goal' | 'book' | 'movie' | 'link' | 'idea' | 'expense' | 'bill' | 'workout' | 'task';
type SearchResult = { id: string; type: ResultType; title: string; subtitle?: string; navigate: () => void };

const PAGES: { title: string; route: string }[] = [
  { title: 'Habits', route: '/(tabs)/habits' },
  { title: 'Body', route: '/(tabs)/gym' },
  { title: 'Activity', route: '/(tabs)/activity' },
  { title: 'Goals', route: '/modals/goals' },
  { title: 'Finance', route: '/modals/finance' },
  { title: 'Library', route: '/modals/library' },
  { title: 'Mood', route: '/modals/mood' },
  { title: 'Sleep', route: '/modals/sleep-detail' },
  { title: 'Settings', route: '/settings' },
  { title: 'Workouts', route: '/workouts' },
];

async function loadJSON<T>(key: string, fallback: T): Promise<T> {
  try {
    const raw = await AsyncStorage.getItem(key);
    if (raw) return JSON.parse(raw);
  } catch { /* fall through */ }
  return fallback;
}

export default function GlobalSearch({ onClose }: { onClose: () => void }) {
  const router = useRouter();
  const [query, setQuery] = useState('');
  const [index, setIndex] = useState<SearchResult[]>([]);

  useEffect(() => {
    (async () => {
      const results: SearchResult[] = [];

      for (const p of PAGES) {
        results.push({ id: `page-${p.route}`, type: 'page', title: p.title, navigate: () => router.push(p.route as any) });
      }

      const habits = await loadJSON<Array<{ id: string; name: string }>>('@habits', []);
      for (const h of habits) {
        results.push({ id: `habit-${h.id}`, type: 'habit', title: h.name, subtitle: 'Habit', navigate: () => router.push('/(tabs)/habits') });
      }

      const goals = await loadJSON<Array<{ id: string; title: string; status: string }>>('@goals', []);
      for (const g of goals.filter(g => g.status === 'active')) {
        results.push({
          id: `goal-${g.id}`, type: 'goal', title: g.title, subtitle: 'Goal',
          navigate: () => router.push({ pathname: '/modals/goals', params: { highlightId: g.id } }),
        });
      }

      const books = await loadJSON<Array<{ id: string; title: string }>>('@library_books', []);
      for (const b of books) results.push({ id: `book-${b.id}`, type: 'book', title: b.title, subtitle: 'Book', navigate: () => router.push('/modals/library') });

      const movies = await loadJSON<Array<{ id: string; title: string }>>('@library_movies', []);
      for (const m of movies) results.push({ id: `movie-${m.id}`, type: 'movie', title: m.title, subtitle: 'Movie', navigate: () => router.push('/modals/library') });

      const links = await loadJSON<Array<{ id: string; title?: string; url: string }>>('@library_links', []);
      for (const l of links) results.push({ id: `link-${l.id}`, type: 'link', title: l.title || l.url, subtitle: 'Link', navigate: () => router.push('/modals/library') });

      const ideas = await loadJSON<Array<{ id: string; content: string }>>('@library_ideas', []);
      for (const i of ideas) results.push({ id: `idea-${i.id}`, type: 'idea', title: i.content, subtitle: 'Idea', navigate: () => router.push('/modals/library') });

      const expenses = await loadJSON<Array<{ id: string; category: string; note?: string; amount: number }>>('@expenses', []);
      for (const e of expenses) results.push({ id: `expense-${e.id}`, type: 'expense', title: e.note || e.category, subtitle: `Expense · $${e.amount}`, navigate: () => router.push('/modals/finance') });

      const bills = await loadJSON<Array<{ id: string; name: string }>>('@bills', []);
      for (const b of bills) results.push({ id: `bill-${b.id}`, type: 'bill', title: b.name, subtitle: 'Bill', navigate: () => router.push('/modals/finance') });

      const templates = await loadJSON<Array<{ id: string; name: string; isArchived: boolean }>>('@wk_templates', []);
      for (const t of templates.filter(t => !t.isArchived)) {
        results.push({ id: `workout-${t.id}`, type: 'workout', title: t.name, subtitle: 'Workout', navigate: () => router.push('/workouts') });
      }

      const taskMap = await loadJSON<Record<string, Array<{ id: string; label: string; archived?: boolean }>>>('@tasks', {});
      for (const [date, tasks] of Object.entries(taskMap)) {
        for (const t of tasks.filter(t => !t.archived)) {
          results.push({
            id: `task-${t.id}`, type: 'task', title: t.label, subtitle: `Task · ${date}`,
            navigate: () => router.push({ pathname: '/calendar/day', params: { date } }),
          });
        }
      }

      setIndex(results);
    })();
  }, [router]);

  const filtered = useMemo(() => {
    const q = query.trim().toLowerCase();
    if (!q) return [];
    return index.filter(r => r.title.toLowerCase().includes(q)).slice(0, 40);
  }, [query, index]);

  return (
    <SafeAreaView style={styles.safe} edges={['top']}>
      <View style={styles.header}>
        <TextInput
          style={styles.input}
          placeholder="Search everything…"
          placeholderTextColor={MUTED}
          value={query}
          onChangeText={setQuery}
          autoFocus
        />
        <TouchableOpacity onPress={onClose} hitSlop={12}>
          <MaterialCommunityIcons name="close" size={22} color={INK} />
        </TouchableOpacity>
      </View>

      <ScrollView contentContainerStyle={styles.content}>
        {query.trim() === '' && <Text style={styles.empty}>Start typing to search habits, goals, books, movies, links, ideas, expenses, bills, workouts, and tasks.</Text>}
        {query.trim() !== '' && filtered.length === 0 && <Text style={styles.empty}>No matches.</Text>}
        {filtered.map(r => (
          <TouchableOpacity key={r.id} style={styles.row} onPress={() => { r.navigate(); onClose(); }}>
            <Text style={styles.rowTitle} numberOfLines={1}>{r.title}</Text>
            {r.subtitle && <Text style={styles.rowSub}>{r.subtitle}</Text>}
          </TouchableOpacity>
        ))}
      </ScrollView>
    </SafeAreaView>
  );
}

const styles = StyleSheet.create({
  safe: { flex: 1, backgroundColor: BG },
  header: { flexDirection: 'row', alignItems: 'center', gap: 10, paddingHorizontal: 16, paddingTop: 8, paddingBottom: 12 },
  input: { flex: 1, borderWidth: 1, borderColor: BORDER, borderRadius: 10, padding: 12, fontFamily: REG, fontSize: 13, color: INK, backgroundColor: CARD },
  content: { paddingHorizontal: 16, paddingBottom: 32, gap: 8 },
  empty: { fontFamily: REG, fontSize: 12, color: MUTED, textAlign: 'center', marginTop: 24, lineHeight: 18 },
  row: { backgroundColor: CARD, borderRadius: 10, borderWidth: 1, borderColor: BORDER, padding: 12 },
  rowTitle: { fontFamily: BOLD, fontSize: 12, color: INK },
  rowSub: { fontFamily: REG, fontSize: 10, color: MUTED, marginTop: 2 },
});
