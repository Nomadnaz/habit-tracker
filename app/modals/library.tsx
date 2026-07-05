// ─────────────────────────────────────────────────────────────────────────
// LIBRARY MODAL (task 064) — Books/Movies/Links/Ideas as a segmented
// toggle inside one screen, not a new tab (same reasoning as Finance/
// Settings/Sleep/Goals this session — the tab bar is already crowded).
// Google Books/TMDB integration is NOT wired (no API keys) — manual entry
// only. Natural-language capture uses a plain heuristic classifier, not
// real book/movie metadata lookup — see lib/library-data.ts's header.
// ─────────────────────────────────────────────────────────────────────────

import { useCallback, useState } from 'react';
import { View, Text, ScrollView, StyleSheet, TouchableOpacity, TextInput } from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';
import { useFocusEffect, useRouter } from 'expo-router';
import { MaterialCommunityIcons } from '@expo/vector-icons';
import * as Haptics from 'expo-haptics';

import {
  getBooks, addBook, setBookStatus, getMovies, addMovie, markWatched,
  getLinks, addLink, getIdeas, addIdea, classifyCapture,
  type Book, type Movie, type SavedLink, type Idea,
} from '@/lib/library-data';

const ORANGE = '#FF4D00';
const INK    = '#1A1714';
const MUTED  = '#8C857B';
const BORDER = '#E5E1DA';
const CARD   = '#FCFBF9';
const BG     = '#F4F2EE';
const GREEN  = '#3B7A57';
const BOLD   = 'PixeloidSans_700Bold';
const REG    = 'PixeloidSans_400Regular';

type Section = 'books' | 'movies' | 'links' | 'ideas';

export default function LibraryModal() {
  const router = useRouter();
  const [section, setSection] = useState<Section>('books');
  const [capture, setCapture] = useState('');

  const [books, setBooks] = useState<Book[]>([]);
  const [movies, setMovies] = useState<Movie[]>([]);
  const [links, setLinks] = useState<SavedLink[]>([]);
  const [ideas, setIdeas] = useState<Idea[]>([]);

  const refresh = useCallback(async () => {
    const [b, m, l, i] = await Promise.all([getBooks(), getMovies(), getLinks(), getIdeas()]);
    setBooks(b); setMovies(m); setLinks(l); setIdeas(i);
  }, []);

  useFocusEffect(useCallback(() => { refresh(); }, [refresh]));

  async function submitCapture() {
    const text = capture.trim();
    if (!text) return;
    const type = classifyCapture(text);
    if (type === 'link') await addLink(text);
    else if (type === 'movie') await addMovie(text);
    else if (type === 'book') await addBook(text);
    else await addIdea(text);
    setCapture('');
    setSection(type === 'link' ? 'links' : type === 'movie' ? 'movies' : type === 'book' ? 'books' : 'ideas');
    Haptics.notificationAsync(Haptics.NotificationFeedbackType.Success);
    refresh();
  }

  return (
    <SafeAreaView style={styles.safe} edges={['top']}>
      <View style={styles.header}>
        <TouchableOpacity onPress={() => router.back()} hitSlop={12}>
          <MaterialCommunityIcons name="close" size={22} color={INK} />
        </TouchableOpacity>
        <Text style={styles.title}>LIBRARY</Text>
        <View style={{ width: 22 }} />
      </View>

      <View style={styles.captureRow}>
        <TextInput
          style={styles.captureInput}
          placeholder="Paste a link, or type a book/movie/idea…"
          placeholderTextColor={MUTED}
          value={capture}
          onChangeText={setCapture}
          onSubmitEditing={submitCapture}
        />
        <TouchableOpacity style={styles.captureBtn} onPress={submitCapture}>
          <MaterialCommunityIcons name="arrow-up" size={18} color="#FFFFFF" />
        </TouchableOpacity>
      </View>

      <View style={styles.segmentRow}>
        {(['books', 'movies', 'links', 'ideas'] as Section[]).map(s => (
          <TouchableOpacity key={s} style={[styles.segment, section === s && styles.segmentActive]} onPress={() => setSection(s)}>
            <Text style={[styles.segmentText, section === s && styles.segmentTextActive]}>{s.toUpperCase()}</Text>
          </TouchableOpacity>
        ))}
      </View>

      <ScrollView contentContainerStyle={styles.content}>
        {section === 'books' && (
          <>
            {books.length === 0 && <Text style={styles.empty}>No books yet.</Text>}
            {books.map(b => (
              <TouchableOpacity key={b.id} style={styles.row} onPress={() => setBookStatus(b.id, b.status === 'finished' ? 'to_read' : 'finished').then(refresh)}>
                <MaterialCommunityIcons name={b.status === 'finished' ? 'check-circle' : 'book-outline'} size={18} color={b.status === 'finished' ? GREEN : ORANGE} />
                <View style={{ flex: 1 }}>
                  <Text style={styles.rowLabel}>{b.title}</Text>
                  {b.author && <Text style={styles.rowSub}>{b.author}</Text>}
                </View>
              </TouchableOpacity>
            ))}
          </>
        )}
        {section === 'movies' && (
          <>
            <Text style={styles.tmdbNote}>Movie posters/metadata via TMDB are not wired up yet — manual entry only.</Text>
            {movies.length === 0 && <Text style={styles.empty}>No movies yet.</Text>}
            {movies.map(m => (
              <TouchableOpacity key={m.id} style={styles.row} onPress={() => markWatched(m.id).then(refresh)}>
                <MaterialCommunityIcons name={m.status === 'watched' ? 'check-circle' : 'movie-outline'} size={18} color={m.status === 'watched' ? GREEN : ORANGE} />
                <Text style={styles.rowLabel}>{m.title}{m.year ? ` (${m.year})` : ''}</Text>
              </TouchableOpacity>
            ))}
          </>
        )}
        {section === 'links' && (
          <>
            {links.length === 0 && <Text style={styles.empty}>No links saved yet.</Text>}
            {links.map(l => (
              <View key={l.id} style={styles.row}>
                <MaterialCommunityIcons name="link-variant" size={18} color={ORANGE} />
                <Text style={styles.rowLabel} numberOfLines={1}>{l.title || l.domain || l.url}</Text>
              </View>
            ))}
          </>
        )}
        {section === 'ideas' && (
          <>
            {ideas.length === 0 && <Text style={styles.empty}>No ideas captured yet.</Text>}
            {ideas.map(i => (
              <View key={i.id} style={styles.row}>
                <MaterialCommunityIcons name="lightbulb-outline" size={18} color={ORANGE} />
                <Text style={styles.rowLabel}>{i.content}</Text>
              </View>
            ))}
          </>
        )}
      </ScrollView>
    </SafeAreaView>
  );
}

const styles = StyleSheet.create({
  safe: { flex: 1, backgroundColor: BG },
  header: { flexDirection: 'row', justifyContent: 'space-between', alignItems: 'center', paddingHorizontal: 20, paddingTop: 8, paddingBottom: 12 },
  title: { fontFamily: BOLD, fontSize: 16, color: INK },
  captureRow: { flexDirection: 'row', gap: 8, paddingHorizontal: 16, marginBottom: 10 },
  captureInput: { flex: 1, borderWidth: 1, borderColor: BORDER, borderRadius: 10, padding: 12, fontFamily: REG, fontSize: 12, color: INK, backgroundColor: CARD },
  captureBtn: { backgroundColor: ORANGE, borderRadius: 10, width: 44, alignItems: 'center', justifyContent: 'center' },
  segmentRow: { flexDirection: 'row', paddingHorizontal: 16, gap: 6, marginBottom: 12 },
  segment: { flex: 1, paddingVertical: 8, borderRadius: 8, borderWidth: 1, borderColor: BORDER, alignItems: 'center' },
  segmentActive: { backgroundColor: ORANGE, borderColor: ORANGE },
  segmentText: { fontFamily: REG, fontSize: 9, color: MUTED },
  segmentTextActive: { color: '#FFFFFF' },
  content: { paddingHorizontal: 16, paddingBottom: 32, gap: 8 },
  empty: { fontFamily: REG, fontSize: 12, color: MUTED, textAlign: 'center', marginTop: 20 },
  tmdbNote: { fontFamily: REG, fontSize: 9, color: MUTED, marginBottom: 4 },
  row: { flexDirection: 'row', alignItems: 'center', gap: 10, backgroundColor: CARD, borderRadius: 10, borderWidth: 1, borderColor: BORDER, padding: 12 },
  rowLabel: { fontFamily: REG, fontSize: 12, color: INK, flex: 1 },
  rowSub: { fontFamily: REG, fontSize: 10, color: MUTED, marginTop: 2 },
});
