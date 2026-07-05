// ─────────────────────────────────────────────────────────────────────────
// LIBRARY — LOCAL DATA LAYER, manual entry only (task 064)
// ─────────────────────────────────────────────────────────────────────────
// Google Books / TMDB integration is NOT implemented — no API keys exist
// for either (system-model.md lists TMDB/Google Books as a "slow external
// clock" to start, not something this session can wire without credentials).
// classifyCapture() is a plain heuristic (URL regex + keyword matching), not
// real classification against book/movie metadata — flagged clearly so it
// isn't mistaken for the Google Books/TMDB-backed disambiguation the full
// feature implies.
// ─────────────────────────────────────────────────────────────────────────

import AsyncStorage from '@react-native-async-storage/async-storage';
import { supabase } from './supabase';

function genId() { return Math.random().toString(36).slice(2) + Date.now().toString(36); }
async function getUid(): Promise<string | null> {
  const { data } = await supabase.auth.getUser();
  return data.user?.id ?? null;
}
function bg(fn: () => Promise<unknown>) { fn().catch(() => {}); }

const BOOKS_KEY = '@library_books';
const MOVIES_KEY = '@library_movies';
const LINKS_KEY = '@library_links';
const IDEAS_KEY = '@library_ideas';

export type BookStatus = 'to_read' | 'reading' | 'finished';
export type Book = { id: string; title: string; author?: string; status: BookStatus; currentPage: number; totalPages?: number; createdAt: string };

export type MovieStatus = 'to_watch' | 'watched';
export type Movie = { id: string; title: string; year?: number; status: MovieStatus; rating?: number; createdAt: string };

export type SavedLink = { id: string; url: string; title?: string; domain?: string; createdAt: string };
export type Idea = { id: string; content: string; createdAt: string };

async function loadList<T>(key: string): Promise<T[]> {
  try {
    const raw = await AsyncStorage.getItem(key);
    if (raw) return JSON.parse(raw);
  } catch { /* fall through */ }
  return [];
}
async function saveList<T>(key: string, list: T[]): Promise<void> {
  await AsyncStorage.setItem(key, JSON.stringify(list));
}

// ── Books ────────────────────────────────────────────────────────────────────

export async function getBooks(): Promise<Book[]> { return loadList<Book>(BOOKS_KEY); }

export async function addBook(title: string, author?: string): Promise<Book> {
  const book: Book = { id: genId(), title, author, status: 'to_read', currentPage: 0, createdAt: new Date().toISOString() };
  const list = await getBooks();
  await saveList(BOOKS_KEY, [...list, book]);
  bg(async () => {
    const userId = await getUid();
    if (!userId) return;
    await supabase.from('books').insert({ id: book.id, user_id: userId, title, author: author ?? null, status: 'to_read', current_page: 0 });
  });
  return book;
}

export async function setBookStatus(id: string, status: BookStatus): Promise<void> {
  const list = await getBooks();
  await saveList(BOOKS_KEY, list.map(b => (b.id === id ? { ...b, status } : b)));
  bg(async () => {
    await supabase.from('books').update({
      status, finished_at: status === 'finished' ? new Date().toISOString() : null,
    }).eq('id', id);
  });
}

// ── Movies ───────────────────────────────────────────────────────────────────

export async function getMovies(): Promise<Movie[]> { return loadList<Movie>(MOVIES_KEY); }

export async function addMovie(title: string, year?: number): Promise<Movie> {
  const movie: Movie = { id: genId(), title, year, status: 'to_watch', createdAt: new Date().toISOString() };
  const list = await getMovies();
  await saveList(MOVIES_KEY, [...list, movie]);
  bg(async () => {
    const userId = await getUid();
    if (!userId) return;
    await supabase.from('movies').insert({ id: movie.id, user_id: userId, title, year: year ?? null, status: 'to_watch' });
  });
  return movie;
}

export async function markWatched(id: string, rating?: number): Promise<void> {
  const list = await getMovies();
  await saveList(MOVIES_KEY, list.map(m => (m.id === id ? { ...m, status: 'watched' as MovieStatus, rating } : m)));
  bg(async () => {
    await supabase.from('movies').update({
      status: 'watched', rating: rating ?? null, date_watched: new Date().toISOString().slice(0, 10),
    }).eq('id', id);
  });
}

// ── Links ────────────────────────────────────────────────────────────────────

export async function getLinks(): Promise<SavedLink[]> { return loadList<SavedLink>(LINKS_KEY); }

export async function addLink(url: string, title?: string): Promise<SavedLink> {
  let domain: string | undefined;
  try { domain = new URL(url).hostname; } catch { /* not a valid URL, leave domain undefined */ }
  const link: SavedLink = { id: genId(), url, title, domain, createdAt: new Date().toISOString() };
  const list = await getLinks();
  await saveList(LINKS_KEY, [...list, link]);
  bg(async () => {
    const userId = await getUid();
    if (!userId) return;
    await supabase.from('saved_links').insert({ id: link.id, user_id: userId, url, title: title ?? null, domain: domain ?? null });
  });
  return link;
}

// ── Ideas ────────────────────────────────────────────────────────────────────

export async function getIdeas(): Promise<Idea[]> { return loadList<Idea>(IDEAS_KEY); }

export async function addIdea(content: string): Promise<Idea> {
  const idea: Idea = { id: genId(), content, createdAt: new Date().toISOString() };
  const list = await getIdeas();
  await saveList(IDEAS_KEY, [...list, idea]);
  bg(async () => {
    const userId = await getUid();
    if (!userId) return;
    await supabase.from('ideas').insert({ id: idea.id, user_id: userId, content });
  });
  return idea;
}

// ── Natural-language capture (heuristic, not real classification) ────────────

export type CaptureType = 'link' | 'movie' | 'book' | 'idea';

const URL_RE = /^https?:\/\/\S+$/i;

/**
 * Plain heuristic: URL regex first, then keyword matching, defaulting to
 * 'idea' for anything freeform. This is NOT Google Books/TMDB-backed
 * disambiguation — see this file's header comment.
 */
export function classifyCapture(text: string): CaptureType {
  const trimmed = text.trim();
  if (URL_RE.test(trimmed)) return 'link';
  const lower = trimmed.toLowerCase();
  if (/\b(movie|film|watch)\b/.test(lower)) return 'movie';
  if (/\b(book|read|novel)\b/.test(lower)) return 'book';
  // Short, title-like phrases default to 'book' (the more common capture);
  // longer freeform text defaults to 'idea'.
  return trimmed.split(/\s+/).length <= 6 ? 'book' : 'idea';
}
