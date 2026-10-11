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
import { ScreenHeader } from '@/components/ScreenHeader';
import { Board, BoardRow } from '@/components/Board';
const ORANGE = C.hot;
const CARD   = C.surface;
const BOLD = F.mono;
const REG = F.mono;

const ARROW = <MaterialCommunityIcons name="chevron-right" size={18} color={C.dim} />;

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
      <ScreenHeader title="SETTINGS" close />

      <ScrollView contentContainerStyle={styles.content}>
        <View style={[styles.card, { marginHorizontal: 16 }]}>
          <View style={styles.row}>
            <Text style={styles.cardTitle}>USE MY OWN ANTHROPIC API KEY</Text>
            <Switch value={useOwnKey} onValueChange={setUseOwnKey} trackColor={{ false: C.lineHi, true: C.live }} thumbColor={C.hot} ios_backgroundColor={C.lineHi} />
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

        <Board title="COMPANIONS">
          {Object.entries(companions).map(([type, cfg], i, all) => (
            <BoardRow
              key={type}
              index={i + 1}
              label={cfg.defaultName.toUpperCase()}
              sub={type}
              last={i === all.length - 1}
              right={ARROW}
              onPress={() => router.push({ pathname: '/settings/companion-persona', params: { companionType: type } })}
            />
          ))}
        </Board>

        <Board title="DATA">
          <BoardRow
            index={1}
            label="EXPORT TO OBSIDIAN"
            sub={exporting ? 'Preparing export…' : 'Your second brain as a .zip'}
            right={exporting ? <ActivityIndicator size="small" color={C.hot} /> : ARROW}
            onPress={exporting ? undefined : handleExport}
          />
          <BoardRow index={2} label="PUCK DEVICE" sub="Bluetooth bridge to the puck" right={ARROW} onPress={() => router.push('/ble-bridge')} />
          <BoardRow index={3} label="CYCLE TRACKING" sub="Private, off by default" right={ARROW} last onPress={() => router.push('/modals/cycle-tracking')} />
        </Board>
      </ScrollView>
    </SafeAreaView>
  );
}

const styles = StyleSheet.create({
  safe: { flex: 1, backgroundColor: C.bg },
  content: { paddingBottom: 40 },
  card: { backgroundColor: CARD, borderRadius: 12, borderWidth: 1, borderColor: C.line, padding: 14, gap: 10 },
  row: { flexDirection: 'row', justifyContent: 'space-between', alignItems: 'center' },
  cardTitle: { fontFamily: BOLD, fontSize: 12, color: C.ink, flex: 1 },
  sub: { fontFamily: REG, fontSize: 12, color: C.dim },
  input: { borderWidth: 1, borderColor: C.line, borderRadius: 10, padding: 12, fontFamily: REG, fontSize: 12, color: C.ink },
  saveBtn: { backgroundColor: ORANGE, borderRadius: 10, paddingVertical: 10, alignItems: 'center' },
  saveBtnText: { fontFamily: BOLD, fontSize: 12, color: C.onHot },
});
