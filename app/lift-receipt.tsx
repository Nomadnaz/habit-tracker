// ─────────────────────────────────────────────────────────────────────────
// LIFT RECEIPT — opens by itself when the puck finishes a set
// (lib/use-lift-receipts.ts) and prints the session out of the receipt
// printer: the exercise and weight, each rep's height and speed as curves
// (components/RepChart.tsx), every set, the totals, and your heart rate at
// the start, finish and peak from Apple Health. Another set of the same
// exercise reprints it with that set added.
//
// NEXT SET sends the exercise back to the puck. FINISH asks for an optional
// proof photo (the stack or the plates), puts it on the receipt, then opens
// the share sheet with the receipt as an image.
// ─────────────────────────────────────────────────────────────────────────

import { useEffect, useRef, useState } from 'react';
import { View, Text, ScrollView, StyleSheet, Pressable, Image, Platform, Share, Alert } from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';
import { useLocalSearchParams, useRouter } from 'expo-router';
import * as Haptics from 'expo-haptics';
import * as ImagePicker from 'expo-image-picker';
import * as Sharing from 'expo-sharing';
import { captureRef } from 'react-native-view-shot';
import {
  ReceiptPrinter, ReceiptRow, ReceiptRule, RECEIPT_INK, RECEIPT_FADED, RECEIPT_PAPER, RECEIPT_BOLD, RECEIPT_REG,
  type ReceiptPrinterStage,
} from '@/components/ReceiptPrinter';
import { RepChart } from '@/components/RepChart';
import { ScreenHeader } from '@/components/ScreenHeader';
import { C, F } from '@/lib/theme';
import { TAP } from '@/lib/hit';
import {
  getLiftSession, onLiftSession, setOpenReceipt, updateLiftSession, sessionStats, sessionSpan,
  type LiftSession,
} from '@/lib/lift-sessions';
import { heartRateBetween } from '@/lib/apple-health';
import { bleBridge } from '@/lib/ble-bridge';

const PROCESSING_MS = 900;
const PRINTING_MS = 1750;
const MONTHS = ['JAN', 'FEB', 'MAR', 'APR', 'MAY', 'JUN', 'JUL', 'AUG', 'SEP', 'OCT', 'NOV', 'DEC'];

const two = (n: number) => String(n).padStart(2, '0');
const stamp = (ms: number) => { const d = new Date(ms); return `${MONTHS[d.getMonth()]} ${two(d.getDate())} ${d.getFullYear()} · ${two(d.getHours())}:${two(d.getMinutes())}`; };
const clock = (ms: number) => { const d = new Date(ms); return `${two(d.getHours())}:${two(d.getMinutes())}`; };
const kg = (v: number) => `${Number.isInteger(v) ? v : v.toFixed(1)} KG`;

type Heart = { start: number | null; end: number | null; peak: number | null };

/** Heart rate nearest the start and the end (within 10 min), and the highest in between. */
async function heartFor(s: LiftSession): Promise<Heart> {
  const { start, end } = sessionSpan(s);
  const xs = await heartRateBetween(start - 10 * 60_000, end + 10 * 60_000);
  const near = (t: number) => {
    const best = xs.reduce<{ bpm: number; d: number } | null>((b, x) => {
      const d = Math.abs(x.at - t);
      return d <= 10 * 60_000 && (!b || d < b.d) ? { bpm: x.bpm, d } : b;
    }, null);
    return best?.bpm ?? null;
  };
  const during = xs.filter(x => x.at >= start - 60_000 && x.at <= end + 2 * 60_000).map(x => x.bpm);
  return { start: near(start), end: near(end), peak: during.length ? Math.max(...during) : null };
}

function barcode(id: string): number[] {
  return Array.from({ length: 34 }, (_, i) => 1 + ((id.charCodeAt(i % id.length) + i * 7) % 3));
}

export default function LiftReceiptScreen() {
  const router = useRouter();
  const { id } = useLocalSearchParams<{ id?: string }>();
  const [session, setSession] = useState<LiftSession | null>(null);
  const [missing, setMissing] = useState(false);
  const [stage, setStage] = useState<ReceiptPrinterStage>('processing');
  const [setIdx, setSetIdx] = useState<number | null>(null); // which set's curve; null = the latest
  const [heart, setHeart] = useState<Heart | null>(null);
  const [chartW, setChartW] = useState(0);
  const [finish, setFinish] = useState<'idle' | 'ask' | 'sharing'>('idle');
  const [sent, setSent] = useState(false);
  const paper = useRef<View>(null);
  const timers = useRef<ReturnType<typeof setTimeout>[]>([]);

  // This receipt is the one on screen: new sets for it land here.
  useEffect(() => {
    if (!id) { setMissing(true); return; }
    setOpenReceipt(id);
    getLiftSession(id).then(x => { setSession(x); setMissing(!x); });
    const off = onLiftSession((s, kind) => {
      if (s.id !== id) return;
      setSession(s);
      if (kind === 'set') { setSetIdx(null); setSent(false); }
    });
    return () => { off(); setOpenReceipt(null); };
  }, [id]);

  // Print (again) whenever a set is added.
  const nSets = session?.sets.length ?? 0;
  useEffect(() => {
    if (!session) return;
    timers.current.forEach(clearTimeout);
    setStage('processing');
    timers.current = [
      setTimeout(() => setStage('printing'), PROCESSING_MS),
      setTimeout(() => setStage('complete'), PROCESSING_MS + PRINTING_MS),
    ];
    void heartFor(session).then(setHeart);
    return () => timers.current.forEach(clearTimeout);
  }, [nSets]);

  // A deleted lift or a stale link: say so rather than sit blank.
  if (!session) return (
    <SafeAreaView style={s.container} edges={['top']}>
      <ScreenHeader title="LIFT RECEIPT" />
      {missing && <Text style={s.missing}>This lift isn't on this phone any more.</Text>}
    </SafeAreaView>
  );

  const st = sessionStats(session);
  const { start, end } = sessionSpan(session);
  const shownIdx = setIdx ?? session.sets.length - 1;
  const shown = session.sets[shownIdx];
  const reps = shown.repData;
  const top = session.sets.reduce((a, b) => (b.weightKg > a.weightKg ? b : a));
  const printed = stage === 'complete';
  const mins = Math.max(1, Math.round((end - start) / 60_000));

  async function nextSet() {
    if (!session?.exerciseId) return;
    const ok = await bleBridge.sendToPuck(session.exerciseId, session.name, shown.weightKg).catch(() => false);
    if (!ok) { Alert.alert('Puck not connected', 'Turn the puck on and keep it near your phone, then try again.'); return; }
    Haptics.notificationAsync(Haptics.NotificationFeedbackType.Success);
    setSent(true);
  }

  async function addPhoto(from: 'camera' | 'library') {
    const perm = from === 'camera' ? await ImagePicker.requestCameraPermissionsAsync() : { granted: true };
    if (!perm.granted) return;
    const res = from === 'camera'
      ? await ImagePicker.launchCameraAsync({ quality: 0.7, allowsEditing: true, aspect: [4, 3] })
      : await ImagePicker.launchImageLibraryAsync({ quality: 0.7, allowsEditing: true, aspect: [4, 3], mediaTypes: ['images'] });
    if (res.canceled || !res.assets?.[0]) return;
    const next = await updateLiftSession(session!.id, { photoUri: res.assets[0].uri });
    if (next) setSession(next);
    await share();
  }

  // The receipt as an image, straight into the share sheet.
  async function share() {
    setFinish('sharing');
    // Let the photo (if one was just added) render before the capture.
    await new Promise(r => setTimeout(r, 350));
    try {
      if (Platform.OS !== 'web' && paper.current && (await Sharing.isAvailableAsync())) {
        const uri = await captureRef(paper, { format: 'png', quality: 1, result: 'tmpfile' });
        await Sharing.shareAsync(uri, { mimeType: 'image/png', UTI: 'public.png', dialogTitle: `${session!.name} receipt` });
      } else {
        await Share.share({ message: `${session!.name} · ${kg(top.weightKg)} x ${top.reps} · ${st.reps} reps over ${st.sets} sets` });
      }
    } catch (e: any) {
      if (!/cancel/i.test(String(e?.message))) Alert.alert('Could not share', String(e?.message ?? e));
    }
    setFinish('idle');
  }

  return (
    <SafeAreaView style={s.container} edges={['top']}>
      <ScreenHeader title="LIFT RECEIPT" />
      <ScrollView contentContainerStyle={s.content}>
        <ReceiptPrinter.Root stage={stage} feedMotion="stepped">
          <ReceiptPrinter.Machine>
            <ReceiptPrinter.Header>
              <ReceiptPrinter.Status>
                {stage === 'processing' ? 'Reading the puck' : stage === 'printing' ? 'Printing your set' : `Set ${session.sets.length} saved`}
              </ReceiptPrinter.Status>
              <View style={s.plate}><Text style={s.plateText}>PUCK · LIFT</Text></View>
            </ReceiptPrinter.Header>
            <ReceiptPrinter.Screen>
              <View style={s.screenRow}>
                <Text style={s.screenLabel} numberOfLines={1}>{session.name}</Text>
                <Text style={s.screenLabel}>{`SET ${session.sets.length}`}</Text>
              </View>
              <View style={s.screenTotal}>
                <Text style={s.screenBig}>{`${shown.reps} REPS`}</Text>
                <Text style={s.screenLabel}>{kg(shown.weightKg)}</Text>
              </View>
            </ReceiptPrinter.Screen>
          </ReceiptPrinter.Machine>

          <ReceiptPrinter.Output>
            <ReceiptPrinter.Paper>
              <View ref={paper} collapsable={false} style={s.capture}>
                <View style={s.paperHead}>
                  <Text style={s.brand}>PUCK</Text>
                  <Text style={s.brandSub}>LIFT RECEIPT</Text>
                  <Text style={s.brandSub}>{stamp(start)}</Text>
                </View>

                {session.photoUri && (
                  <>
                    <ReceiptRule />
                    <Image source={{ uri: session.photoUri }} style={s.photo} />
                    <Text style={s.photoCap}>PROOF</Text>
                  </>
                )}

                <ReceiptRule />
                <Text style={s.exercise}>{session.name}</Text>
                <Text style={s.topSet}>{`TOP SET  ${kg(top.weightKg)} x ${top.reps}`}</Text>

                <ReceiptRule />
                <View style={s.sectionRow}>
                  <Text style={s.section}>REP CURVE</Text>
                  {session.sets.length > 1 && (
                    <View style={s.setTabs}>
                      {session.sets.map((_, i) => (
                        <Pressable key={i} onPress={() => setSetIdx(i)} style={s.setCell} accessibilityLabel={`Set ${i + 1}`} accessibilityState={{ selected: i === shownIdx }}>
                          <View style={[s.setTab, i === shownIdx && s.setTabOn]}>
                            <Text style={[s.setTabText, i === shownIdx && s.setTabTextOn]}>{String(i + 1)}</Text>
                          </View>
                        </Pressable>
                      ))}
                    </View>
                  )}
                </View>
                <View onLayout={e => setChartW(Math.round(e.nativeEvent.layout.width))}>
                  {reps
                    ? <RepChart reps={reps} total={shown.reps} width={chartW} play={stage !== 'processing'} />
                    : <Text style={s.note}>Rep-by-rep data didn't come through for this set — the totals below are from the puck.</Text>}
                </View>
                {reps && reps.length < shown.reps && (
                  <Text style={s.note}>{`${reps.length} of ${shown.reps} reps came through — the rest were lost over Bluetooth.`}</Text>
                )}

                {reps && (
                  <>
                    <View style={[s.table, { marginTop: 10 }]}>
                      {['REP', 'HEIGHT', 'PEAK', 'AVG', 'TIME'].map(h => <Text key={h} style={[s.th, h === 'REP' && s.cRep]}>{h}</Text>)}
                    </View>
                    {reps.map((r, i) => (
                      <View key={i} style={s.table}>
                        <Text style={[s.td, s.cRep]}>{String(r.n ?? i + 1)}</Text>
                        <Text style={s.td}>{`${r.romCm.toFixed(1)}cm`}</Text>
                        <Text style={s.td}>{r.peakMps.toFixed(2)}</Text>
                        <Text style={s.td}>{r.meanMps.toFixed(2)}</Text>
                        <Text style={s.td}>{`${(r.durMs / 1000).toFixed(1)}s`}</Text>
                      </View>
                    ))}
                  </>
                )}

                <ReceiptRule />
                {session.sets.map((x, i) => (
                  <ReceiptRow key={i} label={`SET ${i + 1}  ${clock(Date.parse(x.at))}`} value={`${kg(x.weightKg)} x ${x.reps}`} />
                ))}

                <ReceiptRule />
                <ReceiptRow label="VOLUME" value={kg(Math.round(st.volumeKg))} />
                <ReceiptRow label="EST 1RM" value={kg(Math.round(st.est1RmKg * 10) / 10)} />
                {st.bestRomCm != null && <ReceiptRow label="BEST HEIGHT" value={`${st.bestRomCm.toFixed(1)} CM`} />}
                {st.peakMps != null && <ReceiptRow label="PEAK SPEED" value={`${st.peakMps.toFixed(2)} M/S`} />}
                {st.velocityLossPct != null && <ReceiptRow label="SPEED LOSS (LAST SET)" value={`${st.velocityLossPct}%`} />}
                {st.tutS != null && <ReceiptRow label="TIME UNDER TENSION" value={`${st.tutS.toFixed(1)} S`} />}
                <ReceiptRow label="SESSION" value={`${clock(start)}–${clock(end)} · ${mins} MIN`} />

                <ReceiptRule />
                <Text style={s.section}>HEART</Text>
                <ReceiptRow label="START" value={heart?.start != null ? `${heart.start} BPM` : '—'} />
                <ReceiptRow label="FINISH" value={heart?.end != null ? `${heart.end} BPM` : '—'} />
                <ReceiptRow label="PEAK" value={heart?.peak != null ? `${heart.peak} BPM` : '—'} />
                {heart && heart.start == null && heart.end == null && <Text style={s.note}>No watch readings around this session.</Text>}

                <ReceiptRule />
                <ReceiptRow label="TOTAL" value={`${st.reps} REPS · ${st.sets} SETS`} emphasis />
                <ReceiptRule />

                <View style={s.paperFoot}>
                  <Text style={s.footText}>MEASURED BY PUCK</Text>
                  <View style={s.barcode}>
                    {barcode(session.id).map((w, i) => <View key={i} style={[s.bar, { width: w }]} />)}
                  </View>
                  <Text style={s.footText}>{session.id.toUpperCase()}</Text>
                </View>
              </View>
            </ReceiptPrinter.Paper>
          </ReceiptPrinter.Output>
        </ReceiptPrinter.Root>

        {finish === 'ask' ? (
          <View style={s.ask}>
            <Text style={s.askTitle}>ADD PROOF</Text>
            <Text style={s.askSub}>A photo of the stack or the plates goes on the receipt. Optional.</Text>
            <View style={s.row}>
              <Pressable style={s.secondaryBtn} onPress={() => addPhoto('camera')}><Text style={s.secondaryBtnText}>TAKE PHOTO</Text></Pressable>
              <Pressable style={s.secondaryBtn} onPress={() => addPhoto('library')}><Text style={s.secondaryBtnText}>FROM PHOTOS</Text></Pressable>
            </View>
            <Pressable style={s.primaryBtn} onPress={share}><Text style={s.primaryBtnText}>SKIP · SHARE</Text></Pressable>
          </View>
        ) : (
          <View style={s.actions}>
            {session.exerciseId && (
              <Pressable style={[s.secondaryBtn, sent && { borderColor: C.live }]} onPress={nextSet} disabled={sent}>
                <Text style={[s.secondaryBtnText, sent && { color: C.live }]}>{sent ? 'SENT · GO' : 'NEXT SET'}</Text>
              </Pressable>
            )}
            <Pressable style={[s.primaryBtn, !printed && { opacity: 0.4 }]} disabled={!printed || finish === 'sharing'}
              onPress={() => (session.photoUri ? share() : setFinish('ask'))}>
              <Text style={s.primaryBtnText}>{finish === 'sharing' ? 'SHARING' : 'FINISH · SHARE'}</Text>
            </Pressable>
            <Pressable style={s.textBtn} onPress={() => router.back()}><Text style={s.textBtnText}>DONE</Text></Pressable>
          </View>
        )}
      </ScrollView>
    </SafeAreaView>
  );
}

const s = StyleSheet.create({
  missing: { fontFamily: F.mono, fontSize: 12, color: C.dim, paddingHorizontal: 20, paddingTop: 16 },
  container: { flex: 1, backgroundColor: C.bg },
  content: { paddingHorizontal: 16, paddingBottom: 48, alignItems: 'center' },

  plate: { alignItems: 'flex-end', paddingTop: 3 },
  plateText: { fontFamily: F.mono, fontSize: 9, color: C.dim, letterSpacing: 1 },
  screenRow: { flexDirection: 'row', justifyContent: 'space-between', gap: 8 },
  screenLabel: { fontFamily: F.mono, fontSize: 10, color: C.dim, letterSpacing: 1, flexShrink: 1 },
  screenTotal: { flexDirection: 'row', alignItems: 'baseline', justifyContent: 'space-between', marginTop: 8 },
  screenBig: { fontFamily: F.dot, fontSize: 22, color: C.ink },

  capture: { backgroundColor: RECEIPT_PAPER },
  paperHead: { alignItems: 'center', gap: 3 },
  brand: { fontFamily: RECEIPT_BOLD, fontSize: 14, color: RECEIPT_INK, letterSpacing: 3 },
  brandSub: { fontFamily: RECEIPT_REG, fontSize: 10, color: RECEIPT_INK, letterSpacing: 1 },
  photo: { width: '100%', aspectRatio: 4 / 3, backgroundColor: RECEIPT_FADED },
  photoCap: { fontFamily: RECEIPT_REG, fontSize: 8, color: RECEIPT_FADED, letterSpacing: 2, marginTop: 4, textAlign: 'center' },
  exercise: { fontFamily: RECEIPT_BOLD, fontSize: 18, color: RECEIPT_INK, textAlign: 'center' },
  topSet: { fontFamily: RECEIPT_REG, fontSize: 11, color: RECEIPT_INK, textAlign: 'center', marginTop: 4 },

  sectionRow: { flexDirection: 'row', justifyContent: 'space-between', alignItems: 'center', marginBottom: 8 },
  section: { fontFamily: RECEIPT_BOLD, fontSize: 10, color: RECEIPT_INK, letterSpacing: 1.5 },
  // Each 18 pt box sits in a full-size tap cell; the cells touch and overhang the row, so it doesn't grow.
  setTabs: { flexDirection: 'row', flexWrap: 'wrap', justifyContent: 'flex-end', marginRight: -(TAP - 18) / 2 },
  setCell: { width: TAP, height: TAP, marginVertical: -(TAP - 18) / 2, alignItems: 'center', justifyContent: 'center' },
  setTab: { minWidth: 18, height: 18, paddingHorizontal: 4, borderWidth: 1, borderColor: RECEIPT_INK, alignItems: 'center', justifyContent: 'center' },
  setTabOn: { backgroundColor: RECEIPT_INK },
  setTabText: { fontFamily: RECEIPT_REG, fontSize: 9, color: RECEIPT_INK },
  setTabTextOn: { color: RECEIPT_PAPER },
  note: { fontFamily: RECEIPT_REG, fontSize: 10, color: RECEIPT_FADED, lineHeight: 14 },

  table: { flexDirection: 'row', paddingVertical: 1.5 },
  th: { flex: 1, fontFamily: RECEIPT_BOLD, fontSize: 8, color: RECEIPT_FADED, textAlign: 'right' },
  td: { flex: 1, fontFamily: RECEIPT_REG, fontSize: 10, color: RECEIPT_INK, textAlign: 'right' },
  cRep: { flex: 0.6, textAlign: 'left' },

  paperFoot: { alignItems: 'center', gap: 8 },
  footText: { fontFamily: RECEIPT_REG, fontSize: 9, color: RECEIPT_INK, letterSpacing: 1 },
  barcode: { flexDirection: 'row', alignItems: 'flex-end', gap: 2, height: 26 },
  bar: { height: '100%', backgroundColor: RECEIPT_INK },

  actions: { width: '100%', marginTop: 22, gap: 10 },
  ask: { width: '100%', marginTop: 22, gap: 10, borderWidth: 1, borderColor: C.line, borderRadius: 16, borderCurve: 'continuous', padding: 16, backgroundColor: C.surface },
  askTitle: { fontFamily: F.dot, fontSize: 14, color: C.ink, letterSpacing: 1.5 },
  askSub: { fontFamily: F.mono, fontSize: 12, color: C.dim, lineHeight: 17 },
  row: { flexDirection: 'row', gap: 10 },
  primaryBtn: { backgroundColor: C.hot, borderRadius: 12, borderCurve: 'continuous', minHeight: TAP, justifyContent: 'center', paddingVertical: 14, alignItems: 'center' },
  primaryBtnText: { fontFamily: F.dot, fontSize: 13, color: C.onHot, letterSpacing: 1 },
  secondaryBtn: { flex: 1, borderRadius: 12, borderCurve: 'continuous', borderWidth: 1, borderColor: C.lineHi, minHeight: TAP, justifyContent: 'center', paddingVertical: 13, alignItems: 'center' },
  secondaryBtnText: { fontFamily: F.dot, fontSize: 12, color: C.ink, letterSpacing: 1 },
  textBtn: { alignItems: 'center', justifyContent: 'center', minHeight: TAP, paddingVertical: 8 },
  textBtnText: { fontFamily: F.dot, fontSize: 11, color: C.dim, letterSpacing: 1.5 },
});
