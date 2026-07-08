import { useEffect, useState } from 'react';
import {
  View,
  Text,
  TextInput,
  TouchableOpacity,
  StyleSheet,
  ScrollView,
  ActivityIndicator,
} from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';
import { useRouter } from 'expo-router';
import { bleBridge, type BridgeState } from '@/lib/ble-bridge';
import { supabase, SUPABASE_URL, SUPABASE_ANON_KEY } from '@/lib/supabase';

/**
 * Pair the Companion HUD for standalone Wi-Fi mode.
 *
 * Flow: connect over BLE (reuses the bridge singleton) → user enters home
 * Wi-Fi credentials + their account password → mint a NEW, device-owned
 * Supabase session via the password grant (independent refresh-token chain,
 * so revoking the device never logs the phone out) → write everything to the
 * encrypted provisioning characteristic (OS shows its bonding prompt on
 * first write) → device connects to Wi-Fi and syncs on its own.
 */
export default function PairDeviceScreen() {
  const router = useRouter();
  const [bridge, setBridge] = useState<BridgeState | null>(null);
  const [ssid, setSsid] = useState('');
  const [psk, setPsk] = useState('');
  const [accountPassword, setAccountPassword] = useState('');
  const [busy, setBusy] = useState(false);
  const [done, setDone] = useState(false);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => bleBridge.subscribe(setBridge), []);

  const connected =
    bridge?.status === 'connected' || bridge?.status === 'listening' || bridge?.status === 'processing';

  async function mintDeviceRefreshToken(): Promise<string> {
    const { data: { session } } = await supabase.auth.getSession();
    const email = session?.user?.email;
    if (!email) throw new Error('Not signed in.');

    // Raw fetch on purpose: supabase.auth.signInWithPassword would replace
    // the app's own stored session. This creates a parallel session whose
    // refresh token belongs to the device alone.
    const res = await fetch(`${SUPABASE_URL}/auth/v1/token?grant_type=password`, {
      method: 'POST',
      headers: { apikey: SUPABASE_ANON_KEY, 'Content-Type': 'application/json' },
      body: JSON.stringify({ email, password: accountPassword }),
    });
    if (!res.ok) {
      throw new Error(res.status === 400 ? 'Wrong account password.' : `Auth failed (${res.status}).`);
    }
    const json = await res.json();
    if (!json.refresh_token) throw new Error('No refresh token in auth response.');
    return json.refresh_token as string;
  }

  async function handlePair() {
    setError(null);
    setBusy(true);
    try {
      const refreshToken = await mintDeviceRefreshToken();
      await bleBridge.provisionDevice({ ssid: ssid.trim(), psk, refreshToken });
      setAccountPassword('');
      setDone(true);
    } catch (e: any) {
      setError(e?.message ?? 'Pairing failed.');
    } finally {
      setBusy(false);
    }
  }

  const canPair = connected && ssid.trim().length > 0 && accountPassword.length > 0 && !busy;

  return (
    <SafeAreaView style={styles.container} edges={['top']}>
      <View style={styles.header}>
        <TouchableOpacity onPress={() => router.back()} hitSlop={{ top: 8, bottom: 8, left: 8, right: 8 }}>
          <Text style={styles.backBtn}>← BACK</Text>
        </TouchableOpacity>
        <Text style={styles.title}>PAIR DEVICE</Text>
      </View>

      <ScrollView contentContainerStyle={styles.body} keyboardShouldPersistTaps="handled">
        {done ? (
          <>
            <Text style={styles.doneText}>
              Device provisioned. It will join your Wi-Fi and sync on its own —
            the phone is now optional.
            </Text>
            <TouchableOpacity style={styles.btn} onPress={() => router.back()}>
              <Text style={styles.btnText}>DONE</Text>
            </TouchableOpacity>
          </>
        ) : (
          <>
            <Text style={styles.step}>
              1 · CONNECT{connected ? '  ✓' : ''}
            </Text>
            {!connected ? (
              <TouchableOpacity style={styles.btn} onPress={() => bleBridge.start()}>
                <Text style={styles.btnText}>
                  {bridge?.status === 'scanning' || bridge?.status === 'connecting'
                    ? 'CONNECTING…'
                    : 'CONNECT TO DEVICE'}
                </Text>
              </TouchableOpacity>
            ) : null}
            {bridge?.error ? <Text style={styles.errorText}>{bridge.error}</Text> : null}

            <Text style={styles.step}>2 · HOME WI-FI</Text>
            <TextInput
              style={styles.input}
              placeholder="Wi-Fi network name (SSID)"
              placeholderTextColor="#555"
              autoCapitalize="none"
              autoCorrect={false}
              value={ssid}
              onChangeText={setSsid}
            />
            <TextInput
              style={styles.input}
              placeholder="Wi-Fi password"
              placeholderTextColor="#555"
              autoCapitalize="none"
              secureTextEntry
              value={psk}
              onChangeText={setPsk}
            />

            <Text style={styles.step}>3 · CONFIRM ACCOUNT</Text>
            <Text style={styles.hint}>
              Your account password mints a separate login just for the device,
              so you can revoke it later without signing out of this phone.
            </Text>
            <TextInput
              style={styles.input}
              placeholder="Account password"
              placeholderTextColor="#555"
              autoCapitalize="none"
              secureTextEntry
              value={accountPassword}
              onChangeText={setAccountPassword}
            />

            <TouchableOpacity
              style={[styles.btn, !canPair && styles.btnDisabled]}
              disabled={!canPair}
              onPress={handlePair}
            >
              {busy ? <ActivityIndicator color="#FFF" /> : <Text style={styles.btnText}>PAIR</Text>}
            </TouchableOpacity>

            {error ? <Text style={styles.errorText}>{error}</Text> : null}

            <Text style={styles.hint}>
              Your phone may show a Bluetooth pairing prompt — accept it. That
              bonding step is what encrypts the credentials in transit.
            </Text>
          </>
        )}
      </ScrollView>
    </SafeAreaView>
  );
}

const styles = StyleSheet.create({
  container: { flex: 1, backgroundColor: '#0A0A0A' },
  header: {
    flexDirection: 'row',
    alignItems: 'center',
    paddingHorizontal: 16,
    paddingVertical: 12,
    borderBottomWidth: 1,
    borderBottomColor: '#2A2A2A',
    gap: 16,
  },
  backBtn: { color: '#FF4D00', fontFamily: 'SpaceMono_400Regular', fontSize: 12 },
  title: { color: '#FF4D00', fontFamily: 'SpaceMono_700Bold', fontSize: 14, letterSpacing: 2 },
  body: { padding: 20, gap: 14 },
  step: { color: '#888', fontFamily: 'SpaceMono_700Bold', fontSize: 11, letterSpacing: 1, marginTop: 8 },
  input: {
    backgroundColor: '#1A1A1A', borderRadius: 4, borderWidth: 1, borderColor: '#2A2A2A',
    color: '#EEE', fontFamily: 'SpaceMono_400Regular', fontSize: 13,
    paddingHorizontal: 12, paddingVertical: 10,
  },
  btn: {
    backgroundColor: '#FF4D00', borderRadius: 4,
    paddingVertical: 14, alignItems: 'center', marginTop: 4,
  },
  btnDisabled: { opacity: 0.4 },
  btnText: { color: '#FFF', fontFamily: 'SpaceMono_700Bold', fontSize: 12, letterSpacing: 1 },
  errorText: { color: '#FF3B30', fontFamily: 'SpaceMono_400Regular', fontSize: 12 },
  doneText: { color: '#00CC66', fontFamily: 'SpaceMono_400Regular', fontSize: 13, lineHeight: 20 },
  hint: { color: '#444', fontFamily: 'SpaceMono_400Regular', fontSize: 11, lineHeight: 16 },
});
