// ─────────────────────────────────────────────────────────────────────────
// ACTIVITY RECEIPT — the result screen app/(tabs)/activity.tsx lands on when
// you press STOP. The finished activity prints out of a receipt printer:
// the route draws on as a pixel line while the paper feeds, and the run's
// real numbers (distance, duration, pace, elevation, per-km splits) are the
// line items.
//
// app/activity-summary.tsx is still the full analytical view (elevation
// profile, full splits table) and is one tap away from here — this screen
// replaces it as the landing page, not as the record.
// ─────────────────────────────────────────────────────────────────────────

import { useEffect, useRef, useState } from 'react';
import { View, Text, ScrollView, StyleSheet, TouchableOpacity, Platform, Share, Alert } from 'react-native';
import * as Sharing from 'expo-sharing';
import * as Haptics from 'expo-haptics';
import { captureRef } from 'react-native-view-shot';
import { SafeAreaView } from 'react-native-safe-area-context';
import { useRouter, useLocalSearchParams } from 'expo-router';
import {
  ReceiptPrinter, ReceiptRule, RECEIPT_PAPER, RECEIPT_INK, RECEIPT_FADED, RECEIPT_BOLD, RECEIPT_REG, type ReceiptPrinterStage,
} from '@/components/ReceiptPrinter';
import { RouteMap } from '@/components/RouteMap';
import { TypeLine } from '@/components/TypeLine';
import {
  getActivityById, computeSplits, formatDuration, formatPace, formatDistance,
  type Activity,
} from '@/lib/activity-data';

import { C, F } from '@/lib/theme';
import { ScreenHeader } from '@/components/ScreenHeader';
const ORANGE = C.hot;
const MUTED  = C.dim;
const BOLD = F.mono;
const REG = F.mono;

const PROCESSING_MS = 1100;
const PRINTING_MS   = 1750;

const MONTHS = ['JAN', 'FEB', 'MAR', 'APR', 'MAY', 'JUN', 'JUL', 'AUG', 'SEP', 'OCT', 'NOV', 'DEC'];

function formatDate(iso: string): string {
  const d = new Date(iso);
  return `${MONTHS[d.getMonth()]} ${String(d.getDate()).padStart(2, '0')} ${d.getFullYear()}`;
}

function formatClock(iso: string): string {
  const d = new Date(iso);
  return `${String(d.getHours()).padStart(2, '0')}:${String(d.getMinutes()).padStart(2, '0')}`;
}

/** Deterministic bar widths from the activity id, so the same run always prints the same code. */
function barcodeBars(id: string): number[] {
  return Array.from({ length: 34 }, (_, i) => {
    const code = id.charCodeAt(i % id.length) + i * 7;
    return 1 + (code % 3);
  });
}

/** Holds the route back until the lines above it have typed out. */
function MapAfter({ delay, children }: { delay: number; children: (go: boolean) => React.ReactNode }) {
  const [go, setGo] = useState(false);
  useEffect(() => { const t = setTimeout(() => setGo(true), delay); return () => clearTimeout(t); }, [delay]);
  return <>{children(go)}</>;
}

export default function ActivityReceiptScreen() {
  const router = useRouter();
  const { id } = useLocalSearchParams<{ id?: string | string[] }>();
  const activityId = Array.isArray(id) ? (id[0] ?? '') : (id ?? '');

  const [activity, setActivity] = useState<Activity | null>(null);
  const [notFound, setNotFound] = useState(false);
  const [stage, setStage] = useState<ReceiptPrinterStage>('processing');
  const [mapWidth, setMapWidth] = useState(0);
  // The paper types out, then the route draws, then the splits type under it.
  const [drawn, setDrawn] = useState(false);
  const [typed, setTyped] = useState(false);
  const timers = useRef<ReturnType<typeof setTimeout>[]>([]);
  const paper = useRef<View>(null);
  const [sharing, setSharing] = useState(false);

  // The printed receipt as an image, into the share sheet.
  async function share() {
    if (!activity || sharing) return;
    setSharing(true);
    Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Light);
    try {
      if (Platform.OS !== 'web' && paper.current && (await Sharing.isAvailableAsync())) {
        const uri = await captureRef(paper, { format: 'png', quality: 1, result: 'tmpfile' });
        await Sharing.shareAsync(uri, { mimeType: 'image/png', UTI: 'public.png', dialogTitle: 'Route receipt' });
      } else {
        await Share.share({ message: `${activity.type.toUpperCase()} · ${formatDistance(activity.distanceM)} in ${formatDuration(activity.durationSecs)} · ${formatPace(activity.avgPacePerKm)}` });
      }
    } catch (e: any) {
      if (!/cancel/i.test(String(e?.message))) Alert.alert('Could not share', String(e?.message ?? e));
    }
    setSharing(false);
  }

  useEffect(() => {
    if (!activityId) { setNotFound(true); return; }
    getActivityById(activityId).then(a => (a ? setActivity(a) : setNotFound(true)));
  }, [activityId]);

  // Run the print cycle once the activity is actually loaded, so the paper
  // never feeds out blank.
  useEffect(() => {
    if (!activity) return;
    print();
    return () => { timers.current.forEach(clearTimeout); timers.current = []; };
  }, [activity]);

  function print() {
    timers.current.forEach(clearTimeout);
    timers.current = [];
    setStage('processing');
    setDrawn(false);
    setTyped(false);
    timers.current.push(setTimeout(() => setStage('printing'), PROCESSING_MS));
    timers.current.push(setTimeout(() => setStage('complete'), PROCESSING_MS + PRINTING_MS));
  }

  if (notFound) {
    return (
      <SafeAreaView style={s.container} edges={['top']}>
        <ScreenHeader title="RECEIPT" />
        <Text style={s.empty}>Activity not found.</Text>
      </SafeAreaView>
    );
  }

  if (!activity) return <SafeAreaView style={s.container} edges={['top']} />;

  const splits = computeSplits(activity.waypoints);
  const type = activity.type.toUpperCase();
  const printed = stage === 'complete';

  return (
    <SafeAreaView style={s.container} edges={['top']}>
      <ScreenHeader title={`${type} RECEIPT`} />

      <ScrollView contentContainerStyle={s.content}>
        <ReceiptPrinter.Root stage={stage} feedMotion="stepped">
          <ReceiptPrinter.Machine>
            <ReceiptPrinter.Header>
              <ReceiptPrinter.Status>
                {stage === 'processing' ? 'Saving your activity'
                  : stage === 'printing' ? 'Printing your receipt'
                  : 'Activity saved'}
              </ReceiptPrinter.Status>
              <View style={s.plate}>
                <Text style={s.plateText}>HT-1 · GPS</Text>
              </View>
            </ReceiptPrinter.Header>

            <ReceiptPrinter.Screen>
              <View style={s.screenRow}>
                <Text style={s.screenLabel}>{type}</Text>
                <Text style={s.screenLabel}>{formatDate(activity.startTime)}</Text>
              </View>
              <View style={s.screenTotal}>
                <Text style={s.screenBig}>{formatDistance(activity.distanceM)}</Text>
                <Text style={s.screenLabel}>{formatDuration(activity.durationSecs)}</Text>
              </View>
              <View style={s.meter}>
                <View style={[s.meterFill, { width: printed ? '100%' : stage === 'printing' ? '68%' : '22%' }]} />
              </View>
            </ReceiptPrinter.Screen>
          </ReceiptPrinter.Machine>

          <ReceiptPrinter.Output>
            <ReceiptPrinter.Paper>
              <View ref={paper} collapsable={false} style={s.capture}>
                {stage !== 'processing' && (() => {
                  // One clock for the typing: each line starts when the last one's done.
                  let t = 0;
                  const at = (text: string, speed = 16) => { const d = t; t += text.length * speed + 50; return d; };
                  const stamp = `${formatDate(activity.startTime)} · ${formatClock(activity.startTime)}`;
                  const stats: [string, string][] = [
                    ['TIME', formatDuration(activity.durationSecs)],
                    ['PACE', formatPace(activity.avgPacePerKm).replace('/km', '')],
                    ['ELEV', `${activity.elevationGainM}M`],
                  ];
                  const head = [
                    <TypeLine key="b" text="PUCK" style={s.brand} delay={at('PUCK', 40)} speed={40} />,
                    <TypeLine key="r" text="ROUTE RECEIPT" style={s.brandSub} delay={at('ROUTE RECEIPT', 14)} speed={14} />,
                    <TypeLine key="s" text={stamp} style={s.brandSub} delay={at(stamp, 14)} speed={14} />,
                  ];
                  const dDist = at(formatDistance(activity.distanceM), 45);
                  const dStats = stats.map(([l, v]) => at(`${l}${v}`, 22));
                  const mapAt = t;
                  return (
                    <>
                      <View style={s.paperHead}>{head}</View>
                      <ReceiptRule />
                      <View style={s.hero}>
                        <Text style={s.heroType}>{type}</Text>
                        <TypeLine text={formatDistance(activity.distanceM).toUpperCase()} style={s.heroDist} delay={dDist} speed={45} />
                      </View>
                      <View style={s.statRow}>
                        {stats.map(([l, v], i) => (
                          <View key={l} style={[s.statCell, i > 0 && s.statRule]}>
                            <Text style={s.statLabel}>{l}</Text>
                            <TypeLine text={v} style={s.statValue} delay={dStats[i]} speed={22} />
                          </View>
                        ))}
                      </View>
                      <View style={s.mapWrap} onLayout={e => setMapWidth(Math.round(e.nativeEvent.layout.width))}>
                        {mapWidth > 0 && (
                          <MapAfter delay={mapAt}>
                            {go => (
                              <RouteMap waypoints={activity.waypoints} width={mapWidth} height={Math.round(mapWidth * 0.78)} playing={go}
                                durationMs={1700} legend onDrawn={() => setDrawn(true)} />
                            )}
                          </MapAfter>
                        )}
                      </View>
                      {drawn && (() => {
                        let u = 0;
                        const next = (text: string, speed = 14) => { const d = u; u += text.length * speed + 40; return d; };
                        const fastest = splits.length ? Math.min(...splits.map(x => x.paceSecPerKm)) : 0;
                        const slowest = splits.length ? Math.max(...splits.map(x => x.paceSecPerKm)) : 0;
                        const total = `TOTAL ${formatDistance(activity.distanceM).toUpperCase()}`;
                        return (
                          <>
                            <Text style={s.section}>SPLITS</Text>
                            {splits.length === 0
                              ? <TypeLine text="Too short for a split." style={s.paperNote} delay={next('Too short for a split.')} />
                              : (
                                <View style={s.splits}>
                                  {splits.map(sp => {
                                    const label = `KM ${sp.km}`, pace = formatPace(sp.paceSecPerKm).replace('/km', '');
                                    const d = next(label + pace);
                                    const w = slowest > fastest ? 0.35 + 0.65 * (1 - (sp.paceSecPerKm - fastest) / (slowest - fastest)) : 1;
                                    return (
                                      <View key={sp.km} style={s.split}>
                                        <TypeLine text={label} style={s.splitKm} delay={d} speed={14} />
                                        <View style={s.splitBarTrack}><View style={[s.splitBar, { width: `${Math.round(w * 100)}%` }]} /></View>
                                        <TypeLine text={pace} style={s.splitPace} delay={d + label.length * 14} speed={14} />
                                      </View>
                                    );
                                  })}
                                </View>
                              )}
                            <ReceiptRule />
                            <TypeLine text={total} style={s.total} delay={next(total, 20)} speed={20} onDone={() => setTyped(true)} />
                            <View style={s.paperFoot}>
                              <View style={s.barcode}>
                                {barcodeBars(activity.id).map((bw, i) => (
                                  <View key={i} style={[s.bar, { width: bw }]} />
                                ))}
                              </View>
                              <Text style={s.footText}>{activity.id.toUpperCase()}</Text>
                            </View>
                          </>
                        );
                      })()}
                    </>
                  );
                })()}
              </View>
            </ReceiptPrinter.Paper>
          </ReceiptPrinter.Output>
        </ReceiptPrinter.Root>

        <View style={s.actions}>
          <TouchableOpacity style={[s.primaryBtn, !(printed && typed) && { opacity: 0.5 }]} onPress={share} disabled={!(printed && typed) || sharing}>
            <Text style={s.primaryBtnText}>{sharing ? 'SHARING' : 'SHARE RECEIPT'}</Text>
          </TouchableOpacity>
          <TouchableOpacity style={s.secondaryBtn} onPress={() => router.back()}>
            <Text style={s.secondaryBtnText}>DONE</Text>
          </TouchableOpacity>
          <View style={s.secondaryRow}>
            <TouchableOpacity
              style={s.secondaryBtn}
              onPress={() => router.push({ pathname: '/activity-summary', params: { id: activity.id } })}
            >
              <Text style={s.secondaryBtnText}>FULL SUMMARY</Text>
            </TouchableOpacity>
            <TouchableOpacity style={s.secondaryBtn} onPress={print} disabled={!printed}>
              <Text style={[s.secondaryBtnText, !printed && s.secondaryBtnTextOff]}>PRINT AGAIN</Text>
            </TouchableOpacity>
          </View>
        </View>
      </ScrollView>
    </SafeAreaView>
  );
}

const s = StyleSheet.create({
  container: { flex: 1, backgroundColor: C.bg },
  content: { paddingHorizontal: 16, paddingBottom: 40, alignItems: 'center' },
  empty: { fontFamily: REG, fontSize: 12, color: C.dim, paddingHorizontal: 16 },

  plate: { alignItems: 'flex-end', paddingTop: 3 },
  plateText: { fontFamily: REG, fontSize: 9, color: C.dim, letterSpacing: 1 },

  screenRow: { flexDirection: 'row', justifyContent: 'space-between' },
  screenLabel: { fontFamily: REG, fontSize: 10, color: C.dim, letterSpacing: 1 },
  screenTotal: { flexDirection: 'row', alignItems: 'baseline', justifyContent: 'space-between', marginTop: 8 },
  screenBig: { fontFamily: F.num, fontSize: 22, color: C.bg },
  meter: { height: 4, borderRadius: 2, backgroundColor: 'rgba(244,242,238,0.18)', marginTop: 10, overflow: 'hidden' },
  meterFill: { height: 4, borderRadius: 2, backgroundColor: C.hot },

  capture: { backgroundColor: RECEIPT_PAPER, gap: 12 },
  paperHead: { alignItems: 'center', gap: 4 },
  brand: { fontFamily: RECEIPT_BOLD, fontSize: 22, color: RECEIPT_INK, letterSpacing: 4 },
  brandSub: { fontFamily: RECEIPT_BOLD, fontSize: 11, color: RECEIPT_FADED, letterSpacing: 1 },
  hero: { alignItems: 'center', gap: 2 },
  heroType: { fontFamily: RECEIPT_BOLD, fontSize: 12, color: RECEIPT_FADED, letterSpacing: 3 },
  heroDist: { fontFamily: RECEIPT_BOLD, fontSize: 40, color: RECEIPT_INK, letterSpacing: 1 },
  statRow: { flexDirection: 'row', borderTopWidth: 2, borderBottomWidth: 2, borderColor: RECEIPT_INK, paddingVertical: 8 },
  statCell: { flex: 1, alignItems: 'center', gap: 3 },
  statRule: { borderLeftWidth: 1, borderLeftColor: RECEIPT_FADED },
  statLabel: { fontFamily: RECEIPT_BOLD, fontSize: 10, color: RECEIPT_FADED, letterSpacing: 1.5 },
  statValue: { fontFamily: RECEIPT_BOLD, fontSize: 17, color: RECEIPT_INK },
  mapWrap: { borderRadius: 8, overflow: 'hidden', backgroundColor: C.bg },
  section: { fontFamily: RECEIPT_BOLD, fontSize: 12, color: RECEIPT_INK, letterSpacing: 2 },
  paperNote: { fontFamily: RECEIPT_REG, fontSize: 12, color: RECEIPT_INK },
  splits: { gap: 6 },
  split: { flexDirection: 'row', alignItems: 'center', gap: 10 },
  splitKm: { fontFamily: RECEIPT_BOLD, fontSize: 12, color: RECEIPT_INK, width: 64 },
  splitBarTrack: { flex: 1, height: 6, backgroundColor: 'rgba(26,23,20,0.08)', borderRadius: 1 },
  splitBar: { height: 6, backgroundColor: RECEIPT_INK, borderRadius: 1 },
  splitPace: { fontFamily: RECEIPT_BOLD, fontSize: 13, color: RECEIPT_INK, width: 46, textAlign: 'right' },
  total: { fontFamily: RECEIPT_BOLD, fontSize: 16, color: RECEIPT_INK, letterSpacing: 1.5, alignSelf: 'center' },
  paperFoot: { alignItems: 'center', gap: 6, marginTop: 2 },
  footText: { fontFamily: RECEIPT_REG, fontSize: 9, color: RECEIPT_FADED, letterSpacing: 1 },
  barcode: { flexDirection: 'row', alignItems: 'flex-end', gap: 2, height: 30 },
  bar: { height: '100%', backgroundColor: RECEIPT_INK },

  actions: { width: '100%', marginTop: 22, gap: 10 },
  primaryBtn: { backgroundColor: ORANGE, borderRadius: 10, paddingVertical: 14, alignItems: 'center' },
  primaryBtnText: { fontFamily: BOLD, fontSize: 13, color: C.onHot },
  secondaryRow: { flexDirection: 'row', gap: 10 },
  secondaryBtn: { flex: 1, borderRadius: 10, borderWidth: 1, borderColor: C.line, paddingVertical: 12, alignItems: 'center' },
  secondaryBtnText: { fontFamily: BOLD, fontSize: 12, color: C.ink },
  secondaryBtnTextOff: { color: MUTED },
});
