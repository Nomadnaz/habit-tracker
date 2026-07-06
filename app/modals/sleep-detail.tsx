// ─────────────────────────────────────────────────────────────────────────
// SLEEP DETAIL MODAL (task 036) — manual sleep log (bedtime/wake/quality),
// the Phone Down Challenge (manual entry — iOS Sleep Focus auto-detection
// is device-gated, task 042 territory), and a weekly hours chart. Data in
// lib/sleep-data.ts (local-first, same pattern as lib/habits-data.ts).
// ─────────────────────────────────────────────────────────────────────────

import { useCallback, useState } from 'react';
import { View, Text, ScrollView, StyleSheet, TouchableOpacity, TextInput, Platform } from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';
import { useFocusEffect, useRouter } from 'expo-router';
import { MaterialCommunityIcons } from '@expo/vector-icons';
import * as Haptics from 'expo-haptics';

import {
  getSleepLog, logSleep, getRecentSleepLogs,
  getPhoneDownTarget, setPhoneDownTarget, logPhoneDown, getRecentPhoneLogs, computeChallengeStreak,
  type SleepLog, type PhoneLog,
} from '@/lib/sleep-data';
import { toDateKey } from '@/lib/dateKey';
import ChatScreen from '@/components/ChatScreen';

const ORANGE = '#FF4D00';
const INK    = '#1A1714';
const MUTED  = '#8C857B';
const BORDER = '#E5E1DA';
const CARD   = '#FCFBF9';
const BG     = '#F4F2EE';
const GREEN  = '#3B7A57';
const RED    = '#C0432B';
const AMBER  = '#C98A1B';
const BOLD   = 'PixeloidSans_700Bold';
const REG    = 'PixeloidSans_400Regular';

const RESULT_COLOR = { pass: GREEN, close: AMBER, fail: RED } as const;

function WeeklyBars({ logs }: { logs: SleepLog[] }) {
  const max = Math.max(8, ...logs.map(l => l.totalHours ?? 0));
  return (
    <View style={styles.barsRow}>
      {logs.map(l => (
        <View key={l.date} style={styles.barCol}>
          <View style={styles.barTrack}>
            <View style={[styles.barFill, { height: `${Math.min(100, ((l.totalHours ?? 0) / max) * 100)}%` }]} />
          </View>
          <Text style={styles.barLabel}>{l.date.slice(8)}</Text>
        </View>
      ))}
    </View>
  );
}

export default function SleepDetailModal() {
  const router = useRouter();
  const today = toDateKey(new Date());

  const [tonight, setTonight] = useState<SleepLog | null>(null);
  const [bedtime, setBedtime] = useState('');
  const [wakeTime, setWakeTime] = useState('');
  const [quality, setQuality] = useState(3);
  const [weekly, setWeekly] = useState<SleepLog[]>([]);

  const [target, setTarget] = useState('22:30');
  const [phoneDownTime, setPhoneDownTime] = useState('');
  const [recentPhone, setRecentPhone] = useState<PhoneLog[]>([]);
  const [challengeStreak, setChallengeStreak] = useState(0);
  const [chatOpen, setChatOpen] = useState(false);

  const refresh = useCallback(async () => {
    const [log, week, t, phoneLogs] = await Promise.all([
      getSleepLog(today), getRecentSleepLogs(7), getPhoneDownTarget(), getRecentPhoneLogs(30),
    ]);
    setTonight(log);
    setBedtime(log?.bedtime ?? '');
    setWakeTime(log?.wakeTime ?? '');
    setQuality(log?.qualityScore ?? 3);
    setWeekly(week);
    setTarget(t);
    setRecentPhone(phoneLogs);
    setChallengeStreak(computeChallengeStreak(phoneLogs));
  }, [today]);

  useFocusEffect(useCallback(() => { refresh(); }, [refresh]));

  async function saveSleep() {
    if (!bedtime.trim() || !wakeTime.trim()) return;
    await logSleep({ date: today, bedtime: bedtime.trim(), wakeTime: wakeTime.trim(), qualityScore: quality });
    Haptics.notificationAsync(Haptics.NotificationFeedbackType.Success);
    refresh();
  }

  async function savePhoneDown() {
    if (!phoneDownTime.trim()) return;
    await logPhoneDown(today, phoneDownTime.trim());
    Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Medium);
    setPhoneDownTime('');
    refresh();
  }

  const todayResult = recentPhone.find(l => l.date === today)?.challengeResult;

  return (
    <SafeAreaView style={styles.safe} edges={['top']}>
      <View style={styles.header}>
        <TouchableOpacity onPress={() => router.back()} hitSlop={12}>
          <MaterialCommunityIcons name="close" size={22} color={INK} />
        </TouchableOpacity>
        <Text style={styles.title}>SLEEP</Text>
        <TouchableOpacity onPress={() => setChatOpen(true)} hitSlop={12}>
          <MaterialCommunityIcons name="chat-processing-outline" size={20} color={ORANGE} />
        </TouchableOpacity>
      </View>

      <ScrollView contentContainerStyle={styles.content}>
        {/* ── Phone Down Challenge ─────────────────────── */}
        <View style={styles.card}>
          <Text style={styles.cardTitle}>PHONE DOWN CHALLENGE</Text>
          <Text style={styles.sub}>Target: put your phone down by {target}</Text>

          {todayResult && (
            <View style={[styles.resultPill, { backgroundColor: RESULT_COLOR[todayResult] }]}>
              <Text style={styles.resultPillText}>{todayResult.toUpperCase()} · {challengeStreak} day streak</Text>
            </View>
          )}

          <View style={styles.row}>
            <TextInput
              style={[styles.input, { flex: 1 }]}
              placeholder="Phone down time (HH:MM)"
              placeholderTextColor={MUTED}
              value={phoneDownTime}
              onChangeText={setPhoneDownTime}
              keyboardType={Platform.OS === 'ios' ? 'numbers-and-punctuation' : 'default'}
            />
            <TouchableOpacity style={styles.smallBtn} onPress={savePhoneDown}>
              <Text style={styles.smallBtnText}>LOG</Text>
            </TouchableOpacity>
          </View>

          <View style={styles.row}>
            <TextInput
              style={[styles.input, { flex: 1 }]}
              placeholder="Target time (HH:MM)"
              placeholderTextColor={MUTED}
              value={target}
              onChangeText={setTarget}
            />
            <TouchableOpacity style={styles.smallBtnOutline} onPress={() => setPhoneDownTarget(target.trim() || '22:30')}>
              <Text style={styles.smallBtnOutlineText}>SET</Text>
            </TouchableOpacity>
          </View>
        </View>

        {/* ── Tonight's log ─────────────────────────────── */}
        <View style={styles.card}>
          <Text style={styles.cardTitle}>LOG A NIGHT</Text>
          <View style={styles.row}>
            <TextInput
              style={[styles.input, { flex: 1 }]}
              placeholder="Bedtime (HH:MM)"
              placeholderTextColor={MUTED}
              value={bedtime}
              onChangeText={setBedtime}
            />
            <TextInput
              style={[styles.input, { flex: 1 }]}
              placeholder="Wake time (HH:MM)"
              placeholderTextColor={MUTED}
              value={wakeTime}
              onChangeText={setWakeTime}
            />
          </View>
          <Text style={styles.sub}>Quality</Text>
          <View style={styles.qualityRow}>
            {[1, 2, 3, 4, 5].map(n => (
              <TouchableOpacity key={n} onPress={() => setQuality(n)}>
                <MaterialCommunityIcons
                  name={n <= quality ? 'star' : 'star-outline'}
                  size={26}
                  color={ORANGE}
                />
              </TouchableOpacity>
            ))}
          </View>
          {tonight?.totalHours != null && (
            <Text style={styles.sub}>Total: {tonight.totalHours}h</Text>
          )}
          <TouchableOpacity style={styles.saveBtn} onPress={saveSleep}>
            <Text style={styles.saveBtnText}>SAVE</Text>
          </TouchableOpacity>
        </View>

        {/* ── Weekly chart ──────────────────────────────── */}
        <View style={styles.card}>
          <Text style={styles.cardTitle}>THIS WEEK</Text>
          {weekly.length === 0 ? (
            <Text style={styles.empty}>No nights logged yet.</Text>
          ) : (
            <WeeklyBars logs={weekly} />
          )}
        </View>
      </ScrollView>

      <ChatScreen
        visible={chatOpen}
        onClose={() => setChatOpen(false)}
        companionType="sleep"
        onTasksUpdated={refresh}
      />
    </SafeAreaView>
  );
}

const styles = StyleSheet.create({
  safe: { flex: 1, backgroundColor: BG },
  header: {
    flexDirection: 'row', justifyContent: 'space-between', alignItems: 'center',
    paddingHorizontal: 20, paddingTop: 8, paddingBottom: 12,
  },
  title: { fontFamily: BOLD, fontSize: 16, color: INK },
  content: { paddingHorizontal: 16, paddingBottom: 32, gap: 12 },
  card: {
    backgroundColor: CARD, borderRadius: 12, borderWidth: 1, borderColor: BORDER,
    padding: 14, gap: 10,
  },
  cardTitle: { fontFamily: BOLD, fontSize: 12, color: INK },
  sub: { fontFamily: REG, fontSize: 11, color: MUTED },
  row: { flexDirection: 'row', gap: 8, alignItems: 'center' },
  input: {
    borderWidth: 1, borderColor: BORDER, borderRadius: 10, padding: 10,
    fontFamily: REG, fontSize: 12, color: INK,
  },
  smallBtn: { backgroundColor: ORANGE, borderRadius: 10, paddingHorizontal: 14, paddingVertical: 10 },
  smallBtnText: { fontFamily: BOLD, fontSize: 11, color: '#FFFFFF' },
  smallBtnOutline: { borderWidth: 1, borderColor: BORDER, borderRadius: 10, paddingHorizontal: 14, paddingVertical: 10 },
  smallBtnOutlineText: { fontFamily: BOLD, fontSize: 11, color: INK },
  resultPill: { alignSelf: 'flex-start', paddingHorizontal: 10, paddingVertical: 4, borderRadius: 8 },
  resultPillText: { fontFamily: BOLD, fontSize: 10, color: '#FFFFFF' },
  qualityRow: { flexDirection: 'row', gap: 6 },
  saveBtn: { backgroundColor: ORANGE, borderRadius: 10, paddingVertical: 12, alignItems: 'center' },
  saveBtnText: { fontFamily: BOLD, fontSize: 12, color: '#FFFFFF' },
  empty: { fontFamily: REG, fontSize: 11, color: MUTED },
  barsRow: { flexDirection: 'row', gap: 8, height: 90, alignItems: 'flex-end' },
  barCol: { flex: 1, alignItems: 'center', gap: 4, height: '100%', justifyContent: 'flex-end' },
  barTrack: { width: 14, height: 70, backgroundColor: BORDER, borderRadius: 4, justifyContent: 'flex-end', overflow: 'hidden' },
  barFill: { width: '100%', backgroundColor: ORANGE, borderRadius: 4 },
  barLabel: { fontFamily: REG, fontSize: 8, color: MUTED },
});
