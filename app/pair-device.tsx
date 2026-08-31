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
import { bleBridge, isDeviceProvisioned, type BridgeState } from '@/lib/ble-bridge';
import { supabase, SUPABASE_URL, SUPABASE_ANON_KEY } from '@/lib/supabase';

/**
 * Pair the Companion HUD for standalone Wi-Fi mode, and manage up to two
 * saved networks (device firmware caps it at 3 total — see wifi.c) so it
 * can get online without the phone wherever you actually use it, not just
 * at home.
 *
 * Flow: connect over BLE (reuses the bridge singleton) → save a network
 * (SSID/PSK, labelled "home" or "hotspot") → the FIRST save on a device also
 * mints it a device-owned Supabase login (independent refresh-token chain,
 * so revoking the device never logs the phone out) — every save after that
 * only needs the account password again if you want to re-mint that login,
 * which this screen never asks for once `isDeviceProvisioned()` says it's
 * already done. Both writes go to the same encrypted provisioning
 * characteristic (OS shows its bonding prompt on first use). The device
 * matches by SSID/label and updates in place, so re-adding "home" here after
 * a router password change just works.
 *
 * "Outdoor" here means your phone's Personal Hotspot — a gym itself almost
 * never has usable open Wi-Fi, but your hotspot has a fixed SSID/password
 * you control, so provisioning it once means the device gets online through
 * your phone passively (no app interaction) anywhere you carry it. iOS
 * doesn't expose the hotspot's credentials to third-party apps, so this
 * screen can't prefill them — see the inline hint.
 */
export default function PairDeviceScreen() {
  const router = useRouter();
  const [bridge, setBridge] = useState<BridgeState | null>(null);
  const [provisioned, setProvisioned] = useState(false);

  const [homeSsid, setHomeSsid] = useState('');
  const [homePsk, setHomePsk] = useState('');
  const [hotspotSsid, setHotspotSsid] = useState('');
  const [hotspotPsk, setHotspotPsk] = useState('');
  const [accountPassword, setAccountPassword] = useState('');

  const [busySlot, setBusySlot] = useState<'home' | 'hotspot' | null>(null);
  const [savedSlot, setSavedSlot] = useState<'home' | 'hotspot' | null>(null);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => bleBridge.subscribe(setBridge), []);
  useEffect(() => { isDeviceProvisioned().then(setProvisioned); }, []);

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

  async function handleSave(slot: 'home' | 'hotspot') {
    const ssid = (slot === 'home' ? homeSsid : hotspotSsid).trim();
    const psk = slot === 'home' ? homePsk : hotspotPsk;
    setError(null);
    setBusySlot(slot);
    try {
      const refreshToken = provisioned ? undefined : await mintDeviceRefreshToken();
      await bleBridge.provisionDevice({ ssid, psk, label: slot, refreshToken });
      setAccountPassword('');
      setProvisioned(true);
      setSavedSlot(slot);
    } catch (e: any) {
      setError(e?.message ?? 'Pairing failed.');
    } finally {
      setBusySlot(null);
    }
  }

  const needsPassword = !provisioned;
  const canSave = (slot: 'home' | 'hotspot') => {
    const ssid = (slot === 'home' ? homeSsid : hotspotSsid).trim();
    return connected && ssid.length > 0 && (!needsPassword || accountPassword.length > 0) && !busySlot;
  };

  return (
    <SafeAreaView style={styles.container} edges={['top']}>
      <View style={styles.header}>
        <TouchableOpacity onPress={() => router.back()} hitSlop={{ top: 8, bottom: 8, left: 8, right: 8 }}>
          <Text style={styles.backBtn}>← BACK</Text>
        </TouchableOpacity>
        <Text style={styles.title}>PAIR DEVICE</Text>
      </View>

      <ScrollView contentContainerStyle={styles.body} keyboardShouldPersistTaps="handled">
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

        {/* Home Wi-Fi */}
        <Text style={styles.step}>
          2 · HOME WI-FI{savedSlot === 'home' ? '  ✓ SAVED' : ''}
        </Text>
        <Text style={styles.hint}>Wherever the device normally sits and charges.</Text>
        <TextInput
          style={styles.input}
          placeholder="Wi-Fi network name (SSID)"
          placeholderTextColor="#555"
          autoCapitalize="none"
          autoCorrect={false}
          value={homeSsid}
          onChangeText={setHomeSsid}
        />
        <TextInput
          style={styles.input}
          placeholder="Wi-Fi password"
          placeholderTextColor="#555"
          autoCapitalize="none"
          secureTextEntry
          value={homePsk}
          onChangeText={setHomePsk}
        />
        <TouchableOpacity
          style={[styles.btn, !canSave('home') && styles.btnDisabled]}
          disabled={!canSave('home')}
          onPress={() => handleSave('home')}
        >
          {busySlot === 'home' ? <ActivityIndicator color="#FFF" /> : <Text style={styles.btnText}>SAVE HOME WI-FI</Text>}
        </TouchableOpacity>

        {/* Outdoor / hotspot */}
        <Text style={styles.step}>
          3 · OUTDOOR (OPTIONAL){savedSlot === 'hotspot' ? '  ✓ SAVED' : ''}
        </Text>
        <Text style={styles.hint}>
          Most gyms don't have usable Wi-Fi — your phone's Personal Hotspot does.
          Enable it in Settings → Personal Hotspot, then enter that name and
          password here. The device will connect through your phone whenever
          it's nearby and the hotspot is on, no app needed.
        </Text>
        <TextInput
          style={styles.input}
          placeholder="Hotspot name (SSID)"
          placeholderTextColor="#555"
          autoCapitalize="none"
          autoCorrect={false}
          value={hotspotSsid}
          onChangeText={setHotspotSsid}
        />
        <TextInput
          style={styles.input}
          placeholder="Hotspot password"
          placeholderTextColor="#555"
          autoCapitalize="none"
          secureTextEntry
          value={hotspotPsk}
          onChangeText={setHotspotPsk}
        />
        <TouchableOpacity
          style={[styles.btn, !canSave('hotspot') && styles.btnDisabled]}
          disabled={!canSave('hotspot')}
          onPress={() => handleSave('hotspot')}
        >
          {busySlot === 'hotspot' ? <ActivityIndicator color="#FFF" /> : <Text style={styles.btnText}>SAVE HOTSPOT</Text>}
        </TouchableOpacity>

        {needsPassword ? (
          <>
            <Text style={styles.step}>4 · CONFIRM ACCOUNT</Text>
            <Text style={styles.hint}>
              Needed once, for whichever network you save first — it mints a
              separate login just for the device, so you can revoke it later
              without signing out of this phone. Not asked again after that.
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
          </>
        ) : (
          <Text style={styles.doneText}>
            Device already has an account login — just add or update networks
            above.
          </Text>
        )}

        {error ? <Text style={styles.errorText}>{error}</Text> : null}

        <Text style={styles.hint}>
          Your phone may show a Bluetooth pairing prompt — accept it. That
          bonding step is what encrypts the credentials in transit. The
          device tries every saved network it can see and picks whichever is
          in range, home first.
        </Text>
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
