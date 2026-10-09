// ─────────────────────────────────────────────────────────────────────────
// SETTINGS (task 020, minimal) — API-key toggle (own key vs app credits) +
// a list of companions leading to per-companion name/photo setup. Full
// Privacy Centre is task 070 — not built here.
//
// Reachable via the gear icon in the Today header, not a tab — system-model.md's
// nav decision is "Profile via header icon", not a Settings/Profile tab; the
// task file's suggested app/(tabs)/settings.tsx would have made an already
// crowded tab bar worse for no benefit. See tasks/020 notes.
// ─────────────────────────────────────────────────────────────────────────

import { useCallback, useState } from 'react';
import { View, Text, StyleSheet, TouchableOpacity, TextInput, Switch, ActivityIndicator, Alert } from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';
import { ScrollView } from 'react-native';
import { useRouter, useFocusEffect } from 'expo-router';
import { MaterialCommunityIcons } from '@expo/vector-icons';

import { supabase } from '@/lib/supabase';
import { companions } from '@/lib/companions';
import { exportToObsidian } from '@/lib/obsidianExport';

import { C, F } from '@/lib/theme';
const ORANGE = C.hot;
const CARD   = C.surface;
const BOLD = F.mono;
const REG = F.mono;

export default function Settings() {
  const router = useRouter();
  const [useOwnKey, setUseOwnKey] = useState(false);
  const [apiKeyInput, setApiKeyInput] = useState('');
  const [hasKey, setHasKey] = useState(false);
  const [busy, setBusy] = useState(false);
  const [loaded, setLoaded] = useState(false);
  const [exporting, setExporting] = useState(false);

  async function handleExport() {
    setExporting(true);
    try {
      await exportToObsidian();
    } catch (err) {
      Alert.alert('Export failed', err instanceof Error ? err.message : 'Try again in a moment.');
    } finally {
      setExporting(false);
    }
  }

  const refresh = useCallback(async () => {
    try {
      const { data: { session } } = await supabase.auth.getSession();
      if (!session) return;
      const { data, error } = await supabase.functions.invoke('save-api-key', {
        method: 'GET',
        headers: { Authorization: `Bearer ${session.access_token}` },
      });
      if (!error && data) {
        setHasKey(!!data.hasKey);
        setUseOwnKey(!!data.hasKey);
      }
    } finally {
      setLoaded(true);
    }
  }, []);

  useFocusEffect(useCallback(() => { refresh(); }, [refresh]));

  async function save() {
    setBusy(true);
    try {
      const { data: { session } } = await supabase.auth.getSession();
      if (!session) return;
      const { data, error } = await supabase.functions.invoke('save-api-key', {
        body: { apiKey: useOwnKey ? apiKeyInput.trim() : null },
        headers: { Authorization: `Bearer ${session.access_token}` },
      });
      if (error) throw error;
      setHasKey(!!data?.hasKey);
      setApiKeyInput('');
      Alert.alert(useOwnKey ? 'Key saved' : 'Reverted to app credits');
    } catch {
      Alert.alert('Could not save', 'Try again in a moment.');
    } finally {
      setBusy(false);
    }
  }

  if (!loaded) {
    return (
      <SafeAreaView style={styles.safe}>
        <ActivityIndicator style={{ marginTop: 40 }} color={C.hot} />
      </SafeAreaView>
    );
  }

  return (
    <SafeAreaView style={styles.safe} edges={['top']}>
      <View style={styles.header}>
        <TouchableOpacity onPress={() => router.back()} hitSlop={12}>
          <MaterialCommunityIcons name="close" size={22} color={C.ink} />
        </TouchableOpacity>
        <Text style={styles.title}>SETTINGS</Text>
        <View style={{ width: 22 }} />
      </View>

      <ScrollView contentContainerStyle={styles.content}>
        <View style={styles.card}>
          <View style={styles.row}>
            <Text style={styles.cardTitle}>USE MY OWN ANTHROPIC API KEY</Text>
            <Switch value={useOwnKey} onValueChange={setUseOwnKey} trackColor={{ true: ORANGE }} />
          </View>
          <Text style={styles.sub}>
            {hasKey ? 'A key is currently saved (encrypted).' : 'Currently using app credits.'}
          </Text>
          {useOwnKey && (
            <TextInput
              style={styles.input}
              placeholder="sk-ant-…"
              placeholderTextColor={C.dim}
              value={apiKeyInput}
              onChangeText={setApiKeyInput}
              autoCapitalize="none"
              secureTextEntry
            />
          )}
          <TouchableOpacity style={styles.saveBtn} onPress={save} disabled={busy}>
            <Text style={styles.saveBtnText}>{busy ? 'SAVING…' : 'SAVE'}</Text>
          </TouchableOpacity>
        </View>

        <Text style={styles.sectionLabel}>COMPANIONS</Text>
        {Object.entries(companions).map(([type, cfg]) => (
          <TouchableOpacity
            key={type}
            style={styles.companionRow}
            onPress={() => router.push({ pathname: '/settings/companion-persona', params: { companionType: type } })}
          >
            <MaterialCommunityIcons name="account-circle-outline" size={22} color={C.hot} />
            <Text style={styles.companionLabel}>{cfg.defaultName} ({type})</Text>
            <MaterialCommunityIcons name="chevron-right" size={18} color={C.dim} />
          </TouchableOpacity>
        ))}

        <Text style={styles.sectionLabel}>SECOND BRAIN</Text>
        <TouchableOpacity style={styles.companionRow} onPress={handleExport} disabled={exporting}>
          <MaterialCommunityIcons name="brain" size={22} color={C.hot} />
          <Text style={styles.companionLabel}>
            {exporting ? 'Preparing export…' : 'Export to Obsidian (.zip)'}
          </Text>
          {exporting
            ? <ActivityIndicator size="small" color={C.hot} />
            : <MaterialCommunityIcons name="chevron-right" size={18} color={C.dim} />}
        </TouchableOpacity>

        <Text style={styles.sectionLabel}>CONNECTED DEVICES</Text>
        <TouchableOpacity style={styles.companionRow} onPress={() => router.push('/ble-bridge')}>
          <MaterialCommunityIcons name="bluetooth" size={22} color={C.hot} />
          <Text style={styles.companionLabel}>Companion HUD (BLE bridge)</Text>
          <MaterialCommunityIcons name="chevron-right" size={18} color={C.dim} />
        </TouchableOpacity>

        <Text style={styles.sectionLabel}>PRIVACY</Text>
        <TouchableOpacity style={styles.companionRow} onPress={() => router.push('/modals/cycle-tracking')}>
          <MaterialCommunityIcons name="calendar-heart" size={22} color={C.hot} />
          <Text style={styles.companionLabel}>Cycle tracking (off by default)</Text>
          <MaterialCommunityIcons name="chevron-right" size={18} color={C.dim} />
        </TouchableOpacity>
      </ScrollView>
    </SafeAreaView>
  );
}

const styles = StyleSheet.create({
  safe: { flex: 1, backgroundColor: C.bg },
  header: {
    flexDirection: 'row', justifyContent: 'space-between', alignItems: 'center',
    paddingHorizontal: 20, paddingTop: 8, paddingBottom: 12,
  },
  title: { fontFamily: BOLD, fontSize: 16, color: C.ink },
  content: { paddingHorizontal: 16, paddingBottom: 32, gap: 12 },
  card: { backgroundColor: CARD, borderRadius: 12, borderWidth: 1, borderColor: C.line, padding: 14, gap: 10 },
  row: { flexDirection: 'row', justifyContent: 'space-between', alignItems: 'center' },
  cardTitle: { fontFamily: BOLD, fontSize: 12, color: C.ink, flex: 1 },
  sub: { fontFamily: REG, fontSize: 12, color: C.dim },
  input: { borderWidth: 1, borderColor: C.line, borderRadius: 10, padding: 12, fontFamily: REG, fontSize: 12, color: C.ink },
  saveBtn: { backgroundColor: ORANGE, borderRadius: 10, paddingVertical: 10, alignItems: 'center' },
  saveBtnText: { fontFamily: BOLD, fontSize: 12, color: C.onHot },
  sectionLabel: { fontFamily: BOLD, fontSize: 12, color: C.dim, marginTop: 4 },
  companionRow: {
    flexDirection: 'row', alignItems: 'center', gap: 10, padding: 12,
    borderRadius: 10, borderWidth: 1, borderColor: C.line, backgroundColor: C.surface,
  },
  companionLabel: { fontFamily: REG, fontSize: 12, color: C.ink, flex: 1 },
});
