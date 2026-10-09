// Screen 8/10 — connect. Only HealthKit is live (task 062 acceptance
// criterion) — everything else is gated behind featureFlags and rendered
// disabled/"coming soon" rather than omitted, so the screen communicates
// what's on the roadmap without offering a broken tap target.
import { useState } from 'react';
import { View, Text, StyleSheet, TouchableOpacity, ActivityIndicator, Alert } from 'react-native';
import { useRouter } from 'expo-router';
import { MaterialCommunityIcons } from '@expo/vector-icons';
import OnboardingShell from '@/components/OnboardingShell';
import { updateAnswers } from '@/lib/onboarding-data';
import { connectAndSyncAppleHealth, isAppleHealthSupported } from '@/lib/apple-health';
import { featureFlags } from '@/lib/featureFlags';

import { C, F } from '@/lib/theme';
const MUTED  = C.dim;
const GREEN  = C.live;
const REG = F.mono;
const BOLD = F.mono;

const COMING_SOON: { icon: string; label: string }[] = [
  { icon: 'gmail', label: 'Gmail' },
  { icon: 'calendar', label: 'Google Calendar' },
  { icon: 'watch-variant', label: 'Garmin / Whoop' },
];

export default function Connect() {
  const router = useRouter();
  const [connecting, setConnecting] = useState(false);
  const [connected, setConnected] = useState(false);

  async function connectHealthKit() {
    setConnecting(true);
    const result = await connectAndSyncAppleHealth();
    setConnecting(false);
    if (result.ok) {
      setConnected(true);
      await updateAnswers({ healthKitConnected: true });
    } else {
      Alert.alert('Could not connect', result.error ?? 'Try again from the Body tab later.');
    }
  }

  return (
    <OnboardingShell step={8} title="Connect your data" subtitle="Optional — you can always do this later from the Body tab." onNext={() => router.push('/(onboarding)/account')}>
      {featureFlags.healthKitConnect && (
        <TouchableOpacity
          style={[styles.row, connected && styles.rowConnected]}
          onPress={connectHealthKit}
          disabled={connecting || connected || !isAppleHealthSupported()}
        >
          <MaterialCommunityIcons name="heart-pulse" size={22} color={connected ? C.live : C.hot} />
          <Text style={styles.label}>Apple Health</Text>
          {connecting ? <ActivityIndicator size="small" color={C.hot} /> : (
            <Text style={[styles.status, connected && styles.statusConnected]}>
              {connected ? 'CONNECTED' : isAppleHealthSupported() ? 'CONNECT' : 'NEEDS DEV BUILD'}
            </Text>
          )}
        </TouchableOpacity>
      )}
      {COMING_SOON.map(c => (
        <View key={c.label} style={[styles.row, styles.rowDisabled]}>
          <MaterialCommunityIcons name={c.icon as any} size={22} color={C.dim} />
          <Text style={[styles.label, styles.labelDisabled]}>{c.label}</Text>
          <Text style={styles.status}>COMING SOON</Text>
        </View>
      ))}
    </OnboardingShell>
  );
}

const styles = StyleSheet.create({
  row: {
    flexDirection: 'row', alignItems: 'center', gap: 12, padding: 14,
    borderRadius: 10, borderWidth: 1, borderColor: C.line, backgroundColor: C.surface,
  },
  rowConnected: { borderColor: GREEN },
  rowDisabled: { opacity: 0.5 },
  label: { fontFamily: REG, fontSize: 13, color: C.ink, flex: 1 },
  labelDisabled: { color: MUTED },
  status: { fontFamily: BOLD, fontSize: 10, color: C.hot },
  statusConnected: { color: GREEN },
});
