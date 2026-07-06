// ─────────────────────────────────────────────────────────────────────────
// BriefingCard — daily briefing card for the Today screen (task 018).
// Loads a cached briefing from AsyncStorage instantly; a manual refresh
// button calls the daily-briefing Edge Function (task 019) and re-caches.
// ─────────────────────────────────────────────────────────────────────────

import { useCallback, useEffect, useState } from 'react';
import { View, Text, StyleSheet, TouchableOpacity, ActivityIndicator } from 'react-native';
import AsyncStorage from '@react-native-async-storage/async-storage';
import { MaterialCommunityIcons } from '@expo/vector-icons';

import { supabase } from '@/lib/supabase';
import { toDateKey } from '@/lib/dateKey';

const ORANGE = '#FF4D00';
const INK    = '#1A1714';
const MUTED  = '#8C857B';
const BORDER = '#E5E1DA';
const CARD   = '#FCFBF9';
const BOLD   = 'PixeloidSans_700Bold';
const REG    = 'PixeloidSans_400Regular';

type CachedBriefing = { briefing: string; generatedAt: string };

function cacheKey(dateKey: string) {
  return `@habittracker_briefing_${dateKey}`;
}

export default function BriefingCard() {
  const [cached, setCached] = useState<CachedBriefing | null>(null);
  const [loading, setLoading] = useState(false);
  const [loadedCache, setLoadedCache] = useState(false);

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

  return (
    <View style={styles.card}>
      <View style={styles.row}>
        <MaterialCommunityIcons name="newspaper-variant-outline" size={16} color={ORANGE} />
        <Text style={styles.title}>DAILY BRIEFING</Text>
        <TouchableOpacity onPress={refresh} disabled={loading} hitSlop={10} style={styles.refreshBtn}>
          {loading ? <ActivityIndicator size="small" color={ORANGE} /> : (
            <MaterialCommunityIcons name="refresh" size={16} color={ORANGE} />
          )}
        </TouchableOpacity>
      </View>

      {cached ? (
        <>
          <Text style={styles.body}>{cached.briefing}</Text>
          <Text style={styles.timestamp}>
            Updated {new Date(cached.generatedAt).toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' })}
          </Text>
        </>
      ) : (
        <>
          <Text style={styles.empty}>No briefing yet today.</Text>
          <TouchableOpacity style={styles.getBtn} onPress={refresh} disabled={loading}>
            <Text style={styles.getBtnText}>{loading ? 'GENERATING…' : 'GET DAILY BRIEFING'}</Text>
          </TouchableOpacity>
        </>
      )}
    </View>
  );
}

const styles = StyleSheet.create({
  card: {
    backgroundColor: CARD, borderRadius: 12, borderWidth: 1, borderColor: BORDER,
    padding: 12, marginHorizontal: 16, marginBottom: 10, gap: 6,
  },
  row: { flexDirection: 'row', alignItems: 'center', gap: 6 },
  title: { fontFamily: BOLD, fontSize: 10, color: INK, flex: 1 },
  refreshBtn: { padding: 2 },
  body: { fontFamily: REG, fontSize: 11, color: INK, lineHeight: 16 },
  timestamp: { fontFamily: REG, fontSize: 9, color: MUTED },
  empty: { fontFamily: REG, fontSize: 11, color: MUTED },
  getBtn: {
    backgroundColor: ORANGE, borderRadius: 8, paddingVertical: 8, alignItems: 'center', marginTop: 2,
  },
  getBtnText: { fontFamily: BOLD, fontSize: 10, color: '#FFFFFF' },
});
