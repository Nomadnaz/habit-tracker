// ─────────────────────────────────────────────────────────────────────────
// WEARABLES — the universal connector (lib/wearables.ts). Pick the device,
// turn on its Apple Health sharing, allow access here, and the check shows
// exactly which of its readings arrived. From then on TRAIN's readiness
// reads HRV, resting HR, sleep stages and breathing rate from that device.
// ─────────────────────────────────────────────────────────────────────────

import { useCallback, useState } from 'react';
import { ActivityIndicator, Alert, LayoutAnimation, Linking, Pressable, ScrollView, StyleSheet, Text, View } from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';
import { useFocusEffect } from 'expo-router';
import { MaterialCommunityIcons } from '@expo/vector-icons';
import * as Haptics from 'expo-haptics';

import { checkWearableData } from '@/lib/apple-health';
import { getWearable, METRIC_LABEL, setWearable, WEARABLES, wearableById, type Metric, type WearableId, type WearableLink } from '@/lib/wearables';
import type { Seen } from '@/lib/vitals';
import { C, F } from '@/lib/theme';
import { ScreenHeader } from '@/components/ScreenHeader';

const METRICS: Metric[] = ['hrv', 'rhr', 'sleep', 'resp'];

function ago(iso: string): string {
  const h = (Date.now() - Date.parse(iso)) / 3_600_000;
  if (h < 1) return 'JUST NOW';
  if (h < 48) return `${Math.round(h)}H AGO`;
  return `${Math.round(h / 24)}D AGO`;
}

/** Newest sample per metric from one device. */
function foundFor(id: WearableId, seen: Seen): WearableLink['found'] {
  const re = wearableById(id)?.source;
  const out: WearableLink['found'] = {};
  for (const s of seen) if (re?.test(s.source) && (!out[s.metric] || s.last > out[s.metric]!)) out[s.metric] = s.last;
  return out;
}

export default function Wearables() {
  const [link, setLink] = useState<WearableLink | null>(null);
  const [picked, setPicked] = useState<WearableId | null>(null);
  const [checking, setChecking] = useState(false);
  const [result, setResult] = useState<{ id: WearableId; found: WearableLink['found']; others: string[] } | null>(null);

  useFocusEffect(useCallback(() => { void getWearable().then(setLink); }, []));

  function pick(id: WearableId) {
    Haptics.selectionAsync();
    LayoutAnimation.easeInEaseOut();
    setPicked(p => (p === id ? null : id));
    setResult(null);
  }

  async function check(id: WearableId) {
    setChecking(true);
    // Save first so the sync that follows prefers this device's samples.
    await setWearable({ id, connectedAt: link?.id === id ? link.connectedAt : new Date().toISOString(), found: link?.id === id ? link.found : {} });
    const r = await checkWearableData();
    setChecking(false);
    if (!r.ok) {
      await setWearable(link);
      Alert.alert('Apple Health', r.error ?? 'Could not read Apple Health.');
      return;
    }
    const found = foundFor(id, r.seen);
    const others = [...new Set(r.seen.map(s => s.source).filter(s => !wearableById(id)?.source.test(s)))];
    LayoutAnimation.easeInEaseOut();
    setResult({ id, found, others });
    if (Object.keys(found).length) {
      const next = { id, connectedAt: link?.id === id ? link.connectedAt : new Date().toISOString(), found };
      await setWearable(next);
      setLink(next);
      Haptics.notificationAsync(Haptics.NotificationFeedbackType.Success);
    } else {
      await setWearable(link);
    }
  }

  function disconnect() {
    Alert.alert('Disconnect?', 'The coach goes back to reading whatever Apple Health has, from any source.', [
      { text: 'Cancel', style: 'cancel' },
      { text: 'Disconnect', style: 'destructive', onPress: async () => { await setWearable(null); LayoutAnimation.easeInEaseOut(); setLink(null); setResult(null); } },
    ]);
  }

  const current = wearableById(link?.id);

  return (
    <SafeAreaView style={st.safe} edges={['top']}>
      <ScreenHeader title="WEARABLES" />
      <ScrollView contentContainerStyle={st.content}>

        {current && link ? (
          <View style={st.status}>
            <View style={st.statusHead}>
              <View style={st.badge}><MaterialCommunityIcons name={current.icon as any} size={22} color={C.onHot} /></View>
              <View style={{ flex: 1 }}>
                <Text style={st.statusEyebrow}>CONNECTED</Text>
                <Text style={st.statusName}>{current.name}</Text>
              </View>
              <View style={st.liveDot} />
            </View>
            <View style={st.metrics}>
              {METRICS.map(m => (
                <View key={m} style={[st.metric, link.found[m] && st.metricOn]}>
                  <MaterialCommunityIcons name={link.found[m] ? 'check' : 'minus'} size={13} color={link.found[m] ? C.live : C.faint} />
                  <Text style={st.metricLabel}>{METRIC_LABEL[m]}</Text>
                  <Text style={st.metricAgo}>{link.found[m] ? ago(link.found[m]!) : 'NONE'}</Text>
                </View>
              ))}
            </View>
            <View style={st.row}>
              <Pressable onPress={() => check(current.id)} style={({ pressed }) => [st.btn, st.btnHot, pressed && { opacity: 0.8 }]} disabled={checking}>
                {checking ? <ActivityIndicator color={C.onHot} /> : <Text style={[st.btnText, { color: C.onHot }]}>CHECK AGAIN</Text>}
              </Pressable>
              <Pressable onPress={disconnect} style={({ pressed }) => [st.btn, pressed && { backgroundColor: C.raised }]}>
                <Text style={st.btnText}>DISCONNECT</Text>
              </Pressable>
            </View>
          </View>
        ) : (
          <View style={st.hero}>
            <MaterialCommunityIcons name="watch-variant" size={28} color={C.hot} />
            <Text style={st.heroTitle}>CONNECT WEARABLE</Text>
            <Text style={st.heroSub}>
              HRV, resting heart rate, sleep and breathing rate from your ring, strap or watch make TRAIN's readiness
              and muscle picks much sharper. Pick yours below.
            </Text>
          </View>
        )}

        <Text style={st.label}>{current ? 'SWITCH DEVICE' : 'PICK YOUR DEVICE'}</Text>
        <View style={st.grid}>
          {WEARABLES.map(w => {
            const on = picked === w.id;
            const mine = link?.id === w.id;
            return (
              <Pressable key={w.id} onPress={() => pick(w.id)} style={[st.tile, on && st.tileOn, !w.setup && { opacity: 0.5 }]}>
                <View style={st.tileTop}>
                  <MaterialCommunityIcons name={w.icon as any} size={20} color={on ? C.onHot : C.ink} />
                  {mine && <View style={[st.liveDot, on && { backgroundColor: C.onHot }]} />}
                </View>
                <Text style={[st.tileName, on && { color: C.onHot }]} numberOfLines={1} adjustsFontSizeToFit>{w.name}</Text>
                <Text style={[st.tileKind, on && { color: 'rgba(0,0,0,0.55)' }]}>{w.kind}</Text>
              </Pressable>
            );
          })}
        </View>

        {picked && (() => {
          const w = wearableById(picked)!;
          if (!w.setup) {
            return (
              <View style={st.panel}>
                <Text style={st.panelText}>
                  {w.name} doesn't share its data with Apple Health, so there's no way to read it on iPhone yet.
                </Text>
              </View>
            );
          }
          const r = result?.id === w.id ? result : null;
          return (
            <View style={st.panel}>
              <View style={st.step}>
                <Text style={st.stepNum}>01</Text>
                <Text style={st.panelText}>{w.setup}</Text>
              </View>
              <View style={st.step}>
                <Text style={st.stepNum}>02</Text>
                <Text style={st.panelText}>Allow access on the next screen — tick everything so heart, sleep and breathing all come through.</Text>
              </View>
              <Pressable onPress={() => check(w.id)} style={({ pressed }) => [st.connect, pressed && { opacity: 0.85 }]} disabled={checking}>
                {checking ? <ActivityIndicator color={C.onHot} /> : (
                  <>
                    <MaterialCommunityIcons name="link-variant" size={18} color={C.onHot} />
                    <Text style={st.connectText}>{`CONNECT ${w.name}`}</Text>
                  </>
                )}
              </Pressable>

              {r && (Object.keys(r.found).length ? (
                <View style={st.found}>
                  <Text style={st.foundTitle}>{`FOUND FROM ${w.name}`}</Text>
                  {METRICS.map(m => (
                    <Text key={m} style={[st.foundRow, !r.found[m] && { color: C.faint }]}>
                      {`${r.found[m] ? '+' : '-'} ${METRIC_LABEL[m]}${r.found[m] ? `  ${ago(r.found[m]!)}` : '  not shared yet'}`}
                    </Text>
                  ))}
                </View>
              ) : (
                <View style={st.found}>
                  <Text style={[st.foundTitle, { color: C.alert }]}>{`NOTHING FROM ${w.name} YET`}</Text>
                  <Text style={st.panelText}>
                    {`Open the ${w.name.toLowerCase()} app once so it syncs to Apple Health, then connect again.`}
                    {r.others.length ? ` Apple Health has data from: ${r.others.slice(0, 4).join(', ')}.` : ''}
                  </Text>
                  <Pressable onPress={() => Linking.openURL('x-apple-health://')}>
                    <Text style={st.link}>OPEN THE HEALTH APP ›</Text>
                  </Pressable>
                </View>
              ))}
            </View>
          );
        })()}

        <Text style={st.note}>
          Readings stay on this phone. Only the connected device's numbers are used, so a ring's overnight HRV is never
          averaged with a watch's daytime checks.
        </Text>
      </ScrollView>
    </SafeAreaView>
  );
}

const st = StyleSheet.create({
  safe: { flex: 1, backgroundColor: C.bg },
  content: { paddingHorizontal: 16, paddingBottom: 40, gap: 14 },
  hero: { backgroundColor: C.surface, borderRadius: 22, borderWidth: 1, borderColor: C.line, padding: 18, gap: 8 },
  heroTitle: { fontFamily: F.dot, fontSize: 26, color: C.hot, letterSpacing: 1 },
  heroSub: { fontFamily: F.mono, fontSize: 12, color: C.dim, lineHeight: 17 },

  status: { backgroundColor: C.surface, borderRadius: 22, borderWidth: 1, borderColor: C.lineHi, padding: 16, gap: 12 },
  statusHead: { flexDirection: 'row', alignItems: 'center', gap: 12 },
  badge: { width: 44, height: 44, borderRadius: 22, backgroundColor: C.hot, alignItems: 'center', justifyContent: 'center' },
  statusEyebrow: { fontFamily: F.dot, fontSize: 9, color: C.live, letterSpacing: 2 },
  statusName: { fontFamily: F.dot, fontSize: 20, color: C.hot, letterSpacing: 1, marginTop: 2 },
  liveDot: { width: 8, height: 8, borderRadius: 4, backgroundColor: C.live },
  metrics: { flexDirection: 'row', gap: 6 },
  metric: { flex: 1, borderRadius: 12, borderWidth: 1, borderColor: C.line, padding: 8, gap: 3, backgroundColor: C.bg },
  metricOn: { borderColor: C.lineHi },
  metricLabel: { fontFamily: F.dot, fontSize: 7, color: C.ink, letterSpacing: 1 },
  metricAgo: { fontFamily: F.dot, fontSize: 7, color: C.dim, letterSpacing: 1 },
  row: { flexDirection: 'row', gap: 8 },
  btn: { flex: 1, height: 42, borderRadius: 14, borderWidth: 1, borderColor: C.lineHi, alignItems: 'center', justifyContent: 'center' },
  btnHot: { backgroundColor: C.hot, borderColor: C.hot },
  btnText: { fontFamily: F.dot, fontSize: 10, color: C.ink, letterSpacing: 1.5 },

  label: { fontFamily: F.dot, fontSize: 10, color: C.dim, letterSpacing: 3, marginTop: 4 },
  grid: { flexDirection: 'row', flexWrap: 'wrap', gap: 8 },
  tile: { width: '48.5%', backgroundColor: C.surface, borderRadius: 18, borderWidth: 1, borderColor: C.line, padding: 14, gap: 4 },
  tileOn: { backgroundColor: C.hot, borderColor: C.hot },
  tileTop: { flexDirection: 'row', justifyContent: 'space-between', alignItems: 'center', marginBottom: 8 },
  tileName: { fontFamily: F.dot, fontSize: 14, color: C.hot, letterSpacing: 1 },
  tileKind: { fontFamily: F.dot, fontSize: 8, color: C.dim, letterSpacing: 1.5 },

  panel: { backgroundColor: C.surface, borderRadius: 18, borderWidth: 1, borderColor: C.lineHi, padding: 16, gap: 12 },
  step: { flexDirection: 'row', gap: 12 },
  stepNum: { fontFamily: F.dot, fontSize: 12, color: C.faint, letterSpacing: 1, width: 20 },
  panelText: { flex: 1, fontFamily: F.mono, fontSize: 12, color: C.ink, lineHeight: 17 },
  connect: { flexDirection: 'row', alignItems: 'center', justifyContent: 'center', gap: 10, height: 52, borderRadius: 14, backgroundColor: C.hot },
  connectText: { fontFamily: F.dot, fontSize: 12, color: C.onHot, letterSpacing: 1.5 },
  found: { gap: 6, borderTopWidth: 1, borderTopColor: C.line, paddingTop: 12 },
  foundTitle: { fontFamily: F.dot, fontSize: 9, color: C.live, letterSpacing: 2 },
  foundRow: { fontFamily: F.mono, fontSize: 12, color: C.ink },
  link: { fontFamily: F.dot, fontSize: 9, color: C.hot, letterSpacing: 1.5, marginTop: 4 },
  note: { fontFamily: F.mono, fontSize: 11, color: C.faint, lineHeight: 16, marginTop: 4 },
});
