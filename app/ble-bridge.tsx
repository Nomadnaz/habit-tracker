import { useEffect, useState } from 'react';
import {
  View,
  Text,
  TouchableOpacity,
  StyleSheet,
  ScrollView,
  ActivityIndicator,
} from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';
import { useRouter } from 'expo-router';
import { bleBridge, type BridgeState } from '@/lib/ble-bridge';

import { C, F } from '@/lib/theme';
const COMPANION_TYPES = [
  { id: 'habitCoach', label: 'Habit Coach' },
  { id: 'life', label: 'Life & Schedule' },
  { id: 'gym', label: 'Gym' },
  { id: 'focus', label: 'Focus' },
];

const STATUS_LABELS: Record<string, string> = {
  idle: 'Disconnected',
  scanning: 'Scanning…',
  connecting: 'Connecting…',
  connected: 'Connected — listening',
  listening: 'Listening…',
  processing: 'Thinking…',
  error: 'Error',
};

const STATUS_COLORS: Record<string, string> = {
  idle: C.dim,
  scanning: C.hot,
  connecting: C.hot,
  connected: C.live,
  listening: C.live,
  processing: C.hot,
  error: C.alert,
};

export default function BleBridgeScreen() {
  const router = useRouter();
  const [state, setState] = useState<BridgeState>(() => ({
    status: 'idle',
    lastQuestion: '',
    lastAnswer: '',
    error: null,
    lastSyncAt: null,
  }));
  const [companion, setCompanion] = useState('habitCoach');

  useEffect(() => {
    return bleBridge.subscribe(setState);
  }, []);

  function handleConnect() {
    bleBridge.setCompanionType(companion);
    bleBridge.start();
  }

  function handleDisconnect() {
    bleBridge.stop();
  }

  const isActive = state.status !== 'idle' && state.status !== 'error';
  const isProcessing = state.status === 'scanning' || state.status === 'connecting' || state.status === 'processing';
  const dotColor = STATUS_COLORS[state.status] ?? C.dim;

  return (
    <SafeAreaView style={styles.container} edges={['top']}>
      {/* Header */}
      <View style={styles.header}>
        <TouchableOpacity onPress={() => router.back()} hitSlop={{ top: 8, bottom: 8, left: 8, right: 8 }}>
          <Text style={styles.backBtn}>← BACK</Text>
        </TouchableOpacity>
        <Text style={styles.title}>PUCK</Text>
      </View>

      <ScrollView contentContainerStyle={styles.body} keyboardShouldPersistTaps="handled">
        {/* Status */}
        <View style={styles.statusRow}>
          <View style={[styles.dot, { backgroundColor: dotColor }]} />
          <Text style={[styles.statusText, { color: dotColor }]}>
            {STATUS_LABELS[state.status] ?? state.status}
          </Text>
          {isProcessing && <ActivityIndicator color={C.hot} style={{ marginLeft: 8 }} />}
        </View>

        {state.error ? <Text style={styles.errorText}>{state.error}</Text> : null}

        {isActive && state.lastSyncAt ? (
          <Text style={styles.hint}>
            Pages synced {new Date(state.lastSyncAt).toLocaleTimeString()}
          </Text>
        ) : null}

        {/* Companion selector (only when not connected) */}
        {!isActive && (
          <View style={styles.section}>
            <Text style={styles.label}>AI COMPANION</Text>
            <View style={styles.companionRow}>
              {COMPANION_TYPES.map(c => (
                <TouchableOpacity
                  key={c.id}
                  style={[styles.chip, companion === c.id && styles.chipActive]}
                  onPress={() => {
                    setCompanion(c.id);
                    bleBridge.setCompanionType(c.id);
                  }}
                >
                  <Text style={[styles.chipText, companion === c.id && styles.chipTextActive]}>
                    {c.label}
                  </Text>
                </TouchableOpacity>
              ))}
            </View>
          </View>
        )}

        {/* Connect / Disconnect */}
        <TouchableOpacity
          style={[styles.btn, isActive && styles.btnDisconnect]}
          onPress={isActive ? handleDisconnect : handleConnect}
        >
          <Text style={styles.btnText}>{isActive ? 'DISCONNECT' : 'CONNECT TO DEVICE'}</Text>
        </TouchableOpacity>

        {/* Last interaction */}
        {(state.lastQuestion || state.lastAnswer) ? (
          <View style={styles.section}>
            {state.lastQuestion ? (
              <>
                <Text style={styles.label}>YOU SAID</Text>
                <View style={styles.bubble}>
                  <Text style={styles.bubbleText}>{state.lastQuestion}</Text>
                </View>
              </>
            ) : null}
            {state.lastAnswer ? (
              <>
                <Text style={[styles.label, { marginTop: 12 }]}>AI REPLIED</Text>
                <View style={[styles.bubble, styles.bubbleAi]}>
                  <Text style={styles.bubbleText}>{state.lastAnswer}</Text>
                </View>
              </>
            ) : null}
          </View>
        ) : null}

        {/* Help text */}
        {state.status === 'connected' || state.status === 'listening' ? (
          <Text style={styles.hint}>
            Hold the BOOT button on the device and speak. Release to send.
          </Text>
        ) : null}

        {!isActive && (
          <Text style={styles.hint}>
            Make sure CompanionHUD is powered on and within Bluetooth range.
            This requires a dev build — not Expo Go.
          </Text>
        )}

        <TouchableOpacity onPress={() => router.push('/pair-device')}>
          <Text style={styles.linkText}>SET UP STANDALONE WI-FI →</Text>
        </TouchableOpacity>
      </ScrollView>
    </SafeAreaView>
  );
}

const styles = StyleSheet.create({
  container: { flex: 1, backgroundColor: C.bg },
  header: {
    flexDirection: 'row',
    alignItems: 'center',
    paddingHorizontal: 16,
    paddingVertical: 12,
    borderBottomWidth: 1,
    borderBottomColor: '#2A2A2A',
    gap: 16,
  },
  backBtn: { color: C.hot, fontFamily: F.mono, fontSize: 12 },
  title: { color: C.hot, fontFamily: F.dot, fontSize: 14, letterSpacing: 2 },
  body: { padding: 20, gap: 20 },
  statusRow: { flexDirection: 'row', alignItems: 'center', gap: 8 },
  dot: { width: 10, height: 10, borderRadius: 5 },
  statusText: { fontFamily: F.mono, fontSize: 12 },
  errorText: { color: C.alert, fontFamily: F.mono, fontSize: 12 },
  section: { gap: 8 },
  label: { color: C.dim, fontFamily: F.mono, fontSize: 10, letterSpacing: 1 },
  companionRow: { flexDirection: 'row', flexWrap: 'wrap', gap: 8 },
  chip: {
    borderWidth: 1, borderColor: '#2A2A2A', borderRadius: 4,
    paddingHorizontal: 12, paddingVertical: 6,
  },
  chipActive: { borderColor: C.hot, backgroundColor: C.raised },
  chipText: { color: C.dim, fontFamily: F.mono, fontSize: 11 },
  chipTextActive: { color: C.hot },
  btn: {
    backgroundColor: C.hot, borderRadius: 4,
    paddingVertical: 14, alignItems: 'center',
  },
  btnDisconnect: { backgroundColor: C.raised, borderWidth: 1, borderColor: C.hot },
  btnText: { color: C.onHot, fontFamily: F.dot, fontSize: 12, letterSpacing: 1 },
  bubble: {
    backgroundColor: C.hot, borderRadius: 4, borderWidth: 1,
    borderColor: '#2A2A2A', padding: 12,
  },
  bubbleAi: { borderColor: C.hot, backgroundColor: C.surface },
  bubbleText: { color: C.ink, fontFamily: F.mono, fontSize: 12, lineHeight: 18 },
  hint: { color: C.faint, fontFamily: F.mono, fontSize: 11, lineHeight: 16 },
  linkText: { color: C.hot, fontFamily: F.mono, fontSize: 11, letterSpacing: 1 },
});
