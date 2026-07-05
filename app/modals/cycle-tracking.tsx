// ─────────────────────────────────────────────────────────────────────────
// CYCLE TRACKING MODAL (task 067) — opt-in only, hidden by default.
// Face ID gate is NOT implemented — see lib/cycle-data.ts's header comment.
// ─────────────────────────────────────────────────────────────────────────

import { useCallback, useState } from 'react';
import { View, Text, ScrollView, StyleSheet, TouchableOpacity, TextInput, Switch } from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';
import { useFocusEffect, useRouter } from 'expo-router';
import { MaterialCommunityIcons } from '@expo/vector-icons';

import {
  isOptedIn, setOptedIn, getSettings, saveSettings, getRecentLogs, addLog, predictNextPeriod,
  type CycleSettings, type CycleLog, type CycleLogType,
} from '@/lib/cycle-data';
import { toDateKey } from '@/lib/dateKey';

const ORANGE = '#FF4D00';
const INK    = '#1A1714';
const MUTED  = '#8C857B';
const BORDER = '#E5E1DA';
const CARD   = '#FCFBF9';
const BG     = '#F4F2EE';
const BOLD   = 'PixeloidSans_700Bold';
const REG    = 'PixeloidSans_400Regular';

export default function CycleTrackingModal() {
  const router = useRouter();
  const [optedIn, setOptedInState] = useState<boolean | null>(null);
  const [settings, setSettings] = useState<CycleSettings | null>(null);
  const [logs, setLogs] = useState<CycleLog[]>([]);

  const refresh = useCallback(async () => {
    const [opted, s, l] = await Promise.all([isOptedIn(), getSettings(), getRecentLogs()]);
    setOptedInState(opted);
    setSettings(s);
    setLogs(l);
  }, []);

  useFocusEffect(useCallback(() => { refresh(); }, [refresh]));

  async function enable() {
    await setOptedIn(true);
    refresh();
  }

  async function logPeriodToday() {
    await addLog({ date: toDateKey(new Date()), type: 'period', flowIntensity: 'medium' });
    refresh();
  }

  if (optedIn === null) return null;

  if (!optedIn) {
    return (
      <SafeAreaView style={styles.safe} edges={['top']}>
        <View style={styles.header}>
          <TouchableOpacity onPress={() => router.back()} hitSlop={12}>
            <MaterialCommunityIcons name="close" size={22} color={INK} />
          </TouchableOpacity>
          <Text style={styles.title}>CYCLE TRACKING</Text>
          <View style={{ width: 22 }} />
        </View>
        <View style={styles.optInWrap}>
          <MaterialCommunityIcons name="calendar-heart" size={40} color={ORANGE} />
          <Text style={styles.optInText}>Cycle tracking is opt-in and hidden from everyone else, including the AI companions — nothing here is shared unless you turn it on.</Text>
          <TouchableOpacity style={styles.saveBtn} onPress={enable}>
            <Text style={styles.saveBtnText}>TURN ON CYCLE TRACKING</Text>
          </TouchableOpacity>
        </View>
      </SafeAreaView>
    );
  }

  const nextPeriod = settings ? predictNextPeriod(settings) : null;

  return (
    <SafeAreaView style={styles.safe} edges={['top']}>
      <View style={styles.header}>
        <TouchableOpacity onPress={() => router.back()} hitSlop={12}>
          <MaterialCommunityIcons name="close" size={22} color={INK} />
        </TouchableOpacity>
        <Text style={styles.title}>CYCLE TRACKING</Text>
        <View style={{ width: 22 }} />
      </View>

      <ScrollView contentContainerStyle={styles.content}>
        <View style={styles.card}>
          {nextPeriod ? (
            <Text style={styles.predictText}>Next period predicted around {nextPeriod}</Text>
          ) : (
            <Text style={styles.predictText}>Log your last period to start predictions.</Text>
          )}
          <TouchableOpacity style={styles.saveBtn} onPress={logPeriodToday}>
            <Text style={styles.saveBtnText}>LOG PERIOD TODAY</Text>
          </TouchableOpacity>
        </View>

        {settings && (
          <View style={styles.card}>
            <Text style={styles.label}>AVERAGE CYCLE LENGTH: {settings.averageCycleLength} days</Text>
            <TextInput
              style={styles.input}
              keyboardType="number-pad"
              defaultValue={String(settings.averageCycleLength)}
              onEndEditing={e => {
                const v = parseInt(e.nativeEvent.text, 10);
                if (!Number.isNaN(v)) saveSettings({ ...settings, averageCycleLength: v }).then(refresh);
              }}
            />
            <View style={styles.row}>
              <Text style={styles.label}>TRYING TO CONCEIVE</Text>
              <Switch
                value={settings.tryingToConceive}
                onValueChange={v => saveSettings({ ...settings, tryingToConceive: v }).then(refresh)}
                trackColor={{ true: ORANGE }}
              />
            </View>
          </View>
        )}

        <Text style={styles.sectionLabel}>RECENT LOGS</Text>
        {logs.length === 0 && <Text style={styles.empty}>Nothing logged yet.</Text>}
        {logs.map(l => (
          <View key={l.id} style={styles.logRow}>
            <Text style={styles.logText}>{l.date} — {l.type}{l.flowIntensity ? ` (${l.flowIntensity})` : ''}</Text>
          </View>
        ))}

        <TouchableOpacity onPress={() => setOptedIn(false).then(refresh)} style={{ marginTop: 20 }}>
          <Text style={styles.turnOff}>Turn off cycle tracking</Text>
        </TouchableOpacity>
      </ScrollView>
    </SafeAreaView>
  );
}

const styles = StyleSheet.create({
  safe: { flex: 1, backgroundColor: BG },
  header: { flexDirection: 'row', justifyContent: 'space-between', alignItems: 'center', paddingHorizontal: 20, paddingTop: 8, paddingBottom: 12 },
  title: { fontFamily: BOLD, fontSize: 14, color: INK },
  optInWrap: { flex: 1, alignItems: 'center', justifyContent: 'center', paddingHorizontal: 32, gap: 16 },
  optInText: { fontFamily: REG, fontSize: 13, color: MUTED, textAlign: 'center', lineHeight: 19 },
  content: { paddingHorizontal: 16, paddingBottom: 32, gap: 12 },
  card: { backgroundColor: CARD, borderRadius: 12, borderWidth: 1, borderColor: BORDER, padding: 14, gap: 10 },
  predictText: { fontFamily: REG, fontSize: 12, color: INK },
  label: { fontFamily: BOLD, fontSize: 11, color: INK },
  input: { borderWidth: 1, borderColor: BORDER, borderRadius: 8, padding: 10, fontFamily: REG, fontSize: 12, color: INK },
  row: { flexDirection: 'row', justifyContent: 'space-between', alignItems: 'center' },
  sectionLabel: { fontFamily: BOLD, fontSize: 11, color: MUTED },
  empty: { fontFamily: REG, fontSize: 12, color: MUTED },
  logRow: { backgroundColor: CARD, borderRadius: 8, borderWidth: 1, borderColor: BORDER, padding: 10 },
  logText: { fontFamily: REG, fontSize: 11, color: INK, textTransform: 'capitalize' },
  saveBtn: { backgroundColor: ORANGE, borderRadius: 10, paddingVertical: 14, alignItems: 'center' },
  saveBtnText: { fontFamily: BOLD, fontSize: 12, color: '#FFFFFF' },
  turnOff: { fontFamily: REG, fontSize: 11, color: MUTED, textAlign: 'center', textDecorationLine: 'underline' },
});
