// ─────────────────────────────────────────────────────────────────────────
// BriefingCard — daily briefing card for the Today screen (task 018).
// Loads a cached briefing from AsyncStorage instantly; a manual refresh
// button calls the daily-briefing Edge Function (task 019) and re-caches.
// ─────────────────────────────────────────────────────────────────────────

import { useCallback, useEffect, useState } from 'react';
import { View, Text, StyleSheet, TouchableOpacity, ActivityIndicator, LayoutAnimation } from 'react-native';
import AsyncStorage from '@react-native-async-storage/async-storage';
import { MaterialCommunityIcons } from '@expo/vector-icons';

import { supabase } from '@/lib/supabase';
import { toDateKey } from '@/lib/dateKey';

import { C, F } from '@/lib/theme';
const REG = F.mono;

type CachedBriefing = { briefing: string; generatedAt: string };

function cacheKey(dateKey: string) {
  return `@habittracker_briefing_${dateKey}`;
}

export default function BriefingCard() {
  const [cached, setCached] = useState<CachedBriefing | null>(null);
  const [loading, setLoading] = useState(false);
  const [loadedCache, setLoadedCache] = useState(false);
  const [open, setOpen] = useState(false);
  // Shown in place of the briefing when GET fails, so the tap never just does nothing.
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    (async () => {
      try {
        const raw = await AsyncStorage.getItem(cacheKey(toDateKey(new Date())));
        if (raw) setCached(JSON.parse(raw) as CachedBriefing);
      } catch { /* ignore, treat as empty */ }
      setLoadedCache(true);
    })();
  }, []);

  const refresh = useCallback(async () => {
    setLoading(true);
    setError(null);
    try {
      const { data: { session } } = await supabase.auth.getSession();
      if (!session) { setError('Sign in to get a briefing.'); return; }
      const { data, error } = await supabase.functions.invoke('daily-briefing', {
        // Lets the server resolve TODAY/tomorrow in local time instead of
        // UTC — see supabase/functions/_shared/localDate.ts (audit 2026-07-06).
        body: { tzOffsetMinutes: new Date().getTimezoneOffset() },
        headers: { Authorization: `Bearer ${session.access_token}` },
      });
      if (error || !data?.briefing) { setError("Couldn't reach the server. Tap to retry."); return; }
      const next: CachedBriefing = { briefing: data.briefing, generatedAt: data.generatedAt };
      setCached(next);
      await AsyncStorage.setItem(cacheKey(toDateKey(new Date())), JSON.stringify(next));
    } catch {
      setError("Couldn't reach the server. Tap to retry.");
    } finally {
      setLoading(false);
    }
  }, []);

  if (!loadedCache) return null;

  // One line until there is a briefing: the whole row is the GET button. Once
  // there is one it shows two lines; tap to read it all.
  if (!cached) {
    return (
      <TouchableOpacity style={[styles.card, styles.row]} activeOpacity={0.7} onPress={refresh} disabled={loading}>
        <View style={styles.dot} />
        <Text style={styles.title}>BRIEFING</Text>
        <Text style={[styles.empty, error && { color: C.alert }]} numberOfLines={1}>
          {loading ? 'Generating…' : error ?? 'Get today\'s briefing'}
        </Text>
        {loading ? <ActivityIndicator size="small" color={C.hot} /> : <MaterialCommunityIcons name="chevron-right" size={16} color={C.dim} />}
      </TouchableOpacity>
    );
  }

  return (
    <TouchableOpacity
      style={styles.card}
      activeOpacity={0.85}
      onPress={() => { LayoutAnimation.configureNext(LayoutAnimation.Presets.spring); setOpen(o => !o); }}
    >
      <View style={styles.row}>
        <View style={styles.dot} />
        <Text style={[styles.title, { flex: 1 }]}>BRIEFING</Text>
        <Text style={styles.timestamp}>
          {new Date(cached.generatedAt).toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' })}
        </Text>
        <TouchableOpacity onPress={refresh} disabled={loading} hitSlop={12} style={styles.refreshBtn}>
          {loading ? <ActivityIndicator size="small" color={C.hot} /> : <MaterialCommunityIcons name="refresh" size={16} color={C.dim} />}
        </TouchableOpacity>
      </View>
      <Text style={styles.body} numberOfLines={open ? undefined : 2}>{cached.briefing}</Text>
      {!!error && <Text style={styles.errorText}>{error}</Text>}
    </TouchableOpacity>
  );
}

const styles = StyleSheet.create({
  card: {
    backgroundColor: C.surface, borderRadius: 16, borderWidth: 1, borderColor: C.line,
    paddingHorizontal: 14, paddingVertical: 12, marginHorizontal: 16, marginBottom: 10, gap: 6, minHeight: 46,
  },
  row: { flexDirection: 'row', alignItems: 'center', gap: 8 },
  dot: { width: 5, height: 5, backgroundColor: C.hot },
  title: { fontFamily: F.dot, fontSize: 11, color: C.ink, letterSpacing: 2 },
  refreshBtn: { paddingHorizontal: 2 },
  body: { fontFamily: REG, fontSize: 13, color: C.ink, lineHeight: 19 },
  timestamp: { fontFamily: F.dot, fontSize: 10, color: C.faint, letterSpacing: 1 },
  empty: { flex: 1, fontFamily: REG, fontSize: 12, color: C.dim, textAlign: 'right' },
  errorText: { fontFamily: REG, fontSize: 12, color: C.alert },
});
