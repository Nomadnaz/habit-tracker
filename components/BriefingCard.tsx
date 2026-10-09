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
    try {
      const { data: { session } } = await supabase.auth.getSession();
      if (!session) return;
      const { data, error } = await supabase.functions.invoke('daily-briefing', {
        // Lets the server resolve TODAY/tomorrow in local time instead of
        // UTC — see supabase/functions/_shared/localDate.ts (audit 2026-07-06).
        body: { tzOffsetMinutes: new Date().getTimezoneOffset() },
        headers: { Authorization: `Bearer ${session.access_token}` },
      });
      if (error || !data?.briefing) return;
      const next: CachedBriefing = { briefing: data.briefing, generatedAt: data.generatedAt };
      setCached(next);
      await AsyncStorage.setItem(cacheKey(toDateKey(new Date())), JSON.stringify(next));
    } finally {
      setLoading(false);
    }
  }, []);

  if (!loadedCache) return null;

  // Collapsed to two lines so TODAY's wheel keeps its room; tap to read it all.
  return (
    <TouchableOpacity
      style={styles.card}
      activeOpacity={0.85}
      disabled={!cached}
      onPress={() => { LayoutAnimation.configureNext(LayoutAnimation.Presets.spring); setOpen(o => !o); }}
    >
      <View style={styles.row}>
        <View style={styles.dot} />
        <Text style={styles.title}>BRIEFING</Text>
        {cached && (
          <Text style={styles.timestamp}>
            {new Date(cached.generatedAt).toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' })}
          </Text>
        )}
        <TouchableOpacity onPress={refresh} disabled={loading} hitSlop={10} style={styles.refreshBtn}>
          {loading ? <ActivityIndicator size="small" color={C.hot} /> : cached ? (
            <MaterialCommunityIcons name="refresh" size={15} color={C.dim} />
          ) : (
            <Text style={styles.getBtnText}>GET</Text>
          )}
        </TouchableOpacity>
      </View>
      {cached ? (
        <Text style={styles.body} numberOfLines={open ? undefined : 2}>{cached.briefing}</Text>
      ) : (
        <Text style={styles.empty}>{loading ? 'Generating…' : 'No briefing yet today.'}</Text>
      )}
    </TouchableOpacity>
  );
}

const styles = StyleSheet.create({
  card: {
    backgroundColor: C.surface, borderRadius: 16, borderWidth: 1, borderColor: C.line,
    paddingHorizontal: 14, paddingVertical: 12, marginHorizontal: 16, marginBottom: 12, gap: 6,
  },
  row: { flexDirection: 'row', alignItems: 'center', gap: 8 },
  dot: { width: 5, height: 5, backgroundColor: C.hot },
  title: { fontFamily: F.dot, fontSize: 11, color: C.ink, letterSpacing: 2, flex: 1 },
  refreshBtn: { paddingHorizontal: 2 },
  body: { fontFamily: REG, fontSize: 13, color: C.ink, lineHeight: 19 },
  timestamp: { fontFamily: F.dot, fontSize: 10, color: C.faint, letterSpacing: 1 },
  empty: { fontFamily: REG, fontSize: 12, color: C.dim },
  getBtnText: { fontFamily: F.dot, fontSize: 11, color: C.hot, letterSpacing: 2 },
});
