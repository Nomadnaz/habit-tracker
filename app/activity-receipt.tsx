// ─────────────────────────────────────────────────────────────────────────
// ACTIVITY RECEIPT — the result screen app/(tabs)/activity.tsx lands on when
// you press STOP, and what STEPS' run card opens. The finished run prints
// out of a slim receipt printer onto one screen of paper, in the receipt
// face (Pixeloid): the paper feeds out line by line as each line types,
// then the route draws itself on the block map (components/RouteMap.tsx),
// and each km's split prints the moment the route's head passes that km.
// TOTAL and the barcode print last; SHARE sends the paper as an image.
//
// The map is sized so the whole receipt fits the screen without scrolling;
// a long run's splits go into two columns.
//
// app/activity-summary.tsx is still the full analytical view and is one tap
// away from here — this screen is the landing page, not the record.
// ─────────────────────────────────────────────────────────────────────────

import { useEffect, useRef, useState } from 'react';
import {
  Animated, Easing, View, Text, ScrollView, StyleSheet, Pressable, Platform, Share, Alert,
} from 'react-native';
import * as Sharing from 'expo-sharing';
import * as Haptics from 'expo-haptics';
import { captureRef } from 'react-native-view-shot';
import { SafeAreaView } from 'react-native-safe-area-context';
import { useRouter, useLocalSearchParams } from 'expo-router';
import {
  ReceiptPrinter, RECEIPT_INK, RECEIPT_FADED, RECEIPT_RULE, RECEIPT_BOLD, RECEIPT_REG, type ReceiptPrinterStage,
} from '@/components/ReceiptPrinter';
import { RouteMap } from '@/components/RouteMap';
import { TypeLine } from '@/components/TypeLine';
import { prefetchRouteMap } from '@/lib/route-map';
import {
  getActivityById, computeSplits, formatDuration, formatPace, formatDistance,
  type Activity,
} from '@/lib/activity-data';

import { C, F } from '@/lib/theme';
import { TAP } from '@/lib/hit';
import { ScreenHeader } from '@/components/ScreenHeader';

const DAYS = ['SUN', 'MON', 'TUE', 'WED', 'THU', 'FRI', 'SAT'];
const MONTHS = ['JAN', 'FEB', 'MAR', 'APR', 'MAY', 'JUN', 'JUL', 'AUG', 'SEP', 'OCT', 'NOV', 'DEC'];
const PAD = 14;      // paper padding (top/sides)
const WELL = 12;     // paper inset from the printer's sides
const ROW_H = 13;    // one split row
const wait = (ms: number) => new Promise(r => setTimeout(r, ms));

function formatDate(iso: string): string {
  const d = new Date(iso);
  return `${DAYS[d.getDay()]} ${String(d.getDate()).padStart(2, '0')} ${MONTHS[d.getMonth()]} ${d.getFullYear()}`;
}
function formatClock(iso: string): string {
  const d = new Date(iso);
  return `${String(d.getHours()).padStart(2, '0')}:${String(d.getMinutes()).padStart(2, '0')}`;
}
const bare = (secs?: number) => formatPace(secs).replace('/km', '');

/** Deterministic bar widths from the activity id, so the same run always prints the same code. */
function barcodeBars(id: string): number[] {
  return Array.from({ length: 44 }, (_, i) => {
    const code = id.charCodeAt(i % id.length) + i * 7;
    return 1 + (code % 3);
  });
}

/** Label ……… value, the receipt way. */
function Leader({ label, value, go, strong, onDone }: { label: string; value: string; go: boolean; strong?: boolean; onDone?: () => void }) {
  return (
    <View style={s.leader}>
      <TypeLine text={label} style={strong ? s.leadLabelStrong : s.leadLabel} go={go} speed={22} />
      <Text style={[s.dots, { opacity: go ? 1 : 0 }]} numberOfLines={1} ellipsizeMode="clip">{'. '.repeat(60)}</Text>
      <TypeLine text={value} style={strong ? s.leadValueStrong : s.leadValue} go={go} delay={label.length * 22} speed={strong ? 40 : 26} onDone={onDone} />
    </View>
  );
}

/** A split's speed bar: grows in as its row prints. Longer = quicker. */
function SplitBar({ go, pct }: { go: boolean; pct: number }) {
  const w = useRef(new Animated.Value(0)).current;
  useEffect(() => {
    if (!go) { w.setValue(0); return; }
    Animated.timing(w, { toValue: pct, duration: 380, easing: Easing.out(Easing.cubic), useNativeDriver: false }).start();
  }, [go, pct]);
  return (
    <View style={s.barTrack}>
      <Animated.View style={[s.barFill, { width: w.interpolate({ inputRange: [0, 100], outputRange: ['0%', '100%'] }) }]} />
    </View>
  );
}

export default function ActivityReceiptScreen() {
  const router = useRouter();
  const { id } = useLocalSearchParams<{ id?: string | string[] }>();
  const activityId = Array.isArray(id) ? (id[0] ?? '') : (id ?? '');

  const [activity, setActivity] = useState<Activity | null>(null);
  const [notFound, setNotFound] = useState(false);
  const [stage, setStage] = useState<ReceiptPrinterStage>('processing');
  const [ready, setReady] = useState(false);     // map tiles warmed (or gave up)
  const [phase, setPhase] = useState(-1);        // lines started, top to bottom
  const [mapGo, setMapGo] = useState(false);
  const [kmShown, setKmShown] = useState(0);
  const [tail, setTail] = useState(false);       // TOTAL + barcode
  const [typed, setTyped] = useState(false);
  const [print, setPrint] = useState(0);         // reprint counter (remounts the map)
  const [sharing, setSharing] = useState(false);

  // Sizing: the map takes whatever height is left so the paper fits the screen.
  const [paperW, setPaperW] = useState(0);
  const [scrollH, setScrollH] = useState(0);
  const [contentH, setContentH] = useState(0);
  const [mapH, setMapH] = useState(0);
  const [fitted, setFitted] = useState(false);

  const boxes = useRef<Record<string, { y: number; height: number }>>({});
  const refs = useRef<Record<string, View | null>>({});
  const paperH = useRef(0);
  const revealed = useRef(0);
  const cover = useRef(new Animated.Value(0)).current;
  const timers = useRef<ReturnType<typeof setTimeout>[]>([]);
  const paper = useRef<View>(null);

  const reg = (key: string) => (r: View | null) => { refs.current[key] = r; };
  // Where each line sits on the paper, measured once the layout has settled.
  const measure = () => Promise.all(Object.entries(refs.current).map(([k, r]) => new Promise<void>(done => {
    if (!r || !paper.current) return done();
    r.measureLayout(paper.current as any, (_x, y, _w, h) => { boxes.current[k] = { y, height: h }; done(); }, () => done());
  })));
  const bottomOf = (key: string, extra = 0) => { const b = boxes.current[key]; return b ? PAD + b.y + b.height + extra : 0; };
  // The paper only ever feeds forward.
  const reveal = (y: number, ms = 220) => {
    if (y <= revealed.current) return;
    revealed.current = y;
    Animated.timing(cover, { toValue: y, duration: ms, easing: Easing.out(Easing.cubic), useNativeDriver: true }).start();
  };

  useEffect(() => {
    if (!activityId) { setNotFound(true); return; }
    getActivityById(activityId).then(a => (a ? setActivity(a) : setNotFound(true)));
  }, [activityId]);

  // "Saving your activity" lasts until the map's tiles are in (2.5 s at most),
  // so the route never draws over an empty map.
  useEffect(() => {
    if (!activity) return;
    let alive = true;
    const t0 = Date.now();
    void Promise.race([prefetchRouteMap(activity.waypoints), wait(2500)])
      .then(() => wait(Math.max(0, 800 - (Date.now() - t0))))
      .then(() => { if (alive) setReady(true); });
    return () => { alive = false; timers.current.forEach(clearTimeout); };
  }, [activity]);

  const mapW = Math.max(0, paperW - WELL * 2 - PAD * 2);
  // Until printing starts (the paper's hidden), keep fitting the map to the
  // height that's left: everything else is fixed, so this settles in a pass.
  useEffect(() => {
    if (fitted || !mapW || !scrollH || !contentH) return;
    const cur = mapH || Math.round(mapW * 0.62);
    const next = Math.round(Math.min(mapW * 0.95, Math.max(150, cur + scrollH - contentH)));
    if (!mapH || Math.abs(next - mapH) > 1) setMapH(next);
  }, [mapW, scrollH, contentH, mapH, fitted]);
  useEffect(() => { if (ready && mapH) setFitted(true); }, [ready, mapH]);

  useEffect(() => {
    if (ready && fitted) { const t = setTimeout(start, 120); return () => clearTimeout(t); }
  }, [ready, fitted, print]);

  if (notFound) {
    return (
      <SafeAreaView style={s.container} edges={['top']}>
        <ScreenHeader title="RECEIPT" />
        <Text style={s.empty}>Activity not found.</Text>
      </SafeAreaView>
    );
  }
  if (!activity) return <SafeAreaView style={s.container} edges={['top']} />;

  const a = activity;
  const type = a.type.toUpperCase();
  const splits = computeSplits(a.waypoints);
  const whole = splits.filter(sp => Number.isInteger(sp.km));
  const fastest = whole.length > 1 ? whole.reduce((p, q) => (q.paceSecPerKm < p.paceSecPerKm ? q : p)).km : -1;
  const slowestPace = splits.length ? Math.max(...splits.map(sp => sp.paceSecPerKm)) : 0;
  const quickestPace = splits.length ? Math.min(...splits.map(sp => sp.paceSecPerKm)) : 0;
  const rows = splits.length > 6 ? Math.ceil(splits.length / 2) : splits.length;
  const cols = splits.length > 6 ? [splits.slice(0, rows), splits.slice(rows)] : [splits];
  const hasRoute = a.waypoints.length > 1;

  const stamp = `${formatDate(a.startTime)}  ${formatClock(a.startTime)}-${formatClock(a.endTime)}`;
  const dist = formatDistance(a.distanceM).toUpperCase().replace('KM', ' KM').replace(/(\d)M$/, '$1 M');
  const stats: [string, string][] = [
    ['TIME', formatDuration(a.durationSecs)],
    ['AVG PACE', bare(a.avgPacePerKm)],
    ['ELEV', `${a.elevationGainM}M`],
  ];
  const statChars = Math.max(...stats.map(([, v]) => v.length));

  // The printing, in order: each line types as the paper feeds out to it.
  async function start() {
    timers.current.forEach(clearTimeout);
    timers.current = [];
    await measure();
    setStage('printing');
    const lines: [string, number][] = [
      ['brand', 4 * 60], ['sub', 13 * 16], ['stamp', stamp.length * 10],
      ['hero', 8 * 22 + dist.length * 40], ['stats', statChars * 26], ['map', 0],
    ];
    let t = 0;
    lines.forEach(([key, ms], i) => {
      timers.current.push(setTimeout(() => {
        setPhase(i);
        if (key !== 'map') { reveal(bottomOf(key, 5)); return; }
        // the map feeds out slower, like a picture printing, then the route goes
        reveal(bottomOf('splitsHead', 4), 700);
        if (hasRoute) timers.current.push(setTimeout(() => setMapGo(true), 720));
        else timers.current.push(setTimeout(finish, 720));
      }, t));
      t += ms + 80;
    });
  }

  function onKm(k: number) {
    setKmShown(k);
    Haptics.selectionAsync();
    reveal(bottomOf('grid', 0) - (boxes.current.grid?.height ?? 0) + Math.min(k, rows) * ROW_H + 2);
  }

  function finish() {
    setKmShown(splits.length);
    reveal(bottomOf('grid', 4));
    timers.current.push(setTimeout(() => {
      setTail(true);
      reveal(paperH.current + 2, 900);
    }, 320));
  }

  function onTotal() {
    setTyped(true);
    setStage('complete');
    Haptics.notificationAsync(Haptics.NotificationFeedbackType.Success);
  }

  function reprint() {
    if (stage !== 'complete') return;
    Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Light);
    timers.current.forEach(clearTimeout);
    revealed.current = 0;
    Animated.timing(cover, { toValue: 0, duration: 260, easing: Easing.in(Easing.cubic), useNativeDriver: true }).start(() => {
      setPhase(-1); setMapGo(false); setKmShown(0); setTail(false); setTyped(false);
      setStage('processing');
      timers.current.push(setTimeout(() => setPrint(p => p + 1), 500));
    });
  }

  // The printed receipt as an image, into the share sheet.
  async function share() {
    if (sharing) return;
    setSharing(true);
    Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Light);
    try {
      if (Platform.OS !== 'web' && paper.current && (await Sharing.isAvailableAsync())) {
        const uri = await captureRef(paper, { format: 'png', quality: 1, result: 'tmpfile' });
        await Sharing.shareAsync(uri, { mimeType: 'image/png', UTI: 'public.png', dialogTitle: 'Route receipt' });
      } else {
        await Share.share({ message: `${type} · ${formatDistance(a.distanceM)} in ${formatDuration(a.durationSecs)} · ${formatPace(a.avgPacePerKm)}` });
      }
    } catch (e: any) {
      if (!/cancel/i.test(String(e?.message))) Alert.alert('Could not share', String(e?.message ?? e));
    }
    setSharing(false);
  }

  const total = `${dist}`;

  return (
    <SafeAreaView style={s.container} edges={['top', 'bottom']}>
      <ScreenHeader title={`${type} RECEIPT`} />

      <ScrollView
        style={s.scroll}
        contentContainerStyle={s.content}
        onLayout={e => setScrollH(Math.round(e.nativeEvent.layout.height))}
        onContentSizeChange={(_, h) => setContentH(Math.round(h))}
        showsVerticalScrollIndicator={false}
      >
        <ReceiptPrinter.Root stage={stage}>
          <Pressable onPress={reprint} style={s.machineWrap}>
            <ReceiptPrinter.Machine style={s.machine}>
              <ReceiptPrinter.Header style={s.head}>
                <ReceiptPrinter.Status>
                  {stage === 'processing' ? 'Saving your activity'
                    : stage === 'printing' ? 'Printing your receipt'
                    : 'Saved · tap to print again'}
                </ReceiptPrinter.Status>
                <Text style={s.plate}>HT-1 · GPS</Text>
              </ReceiptPrinter.Header>
            </ReceiptPrinter.Machine>
          </Pressable>

          <View style={s.paperWell} onLayout={e => setPaperW(Math.round(e.nativeEvent.layout.width))}>
            <View onLayout={e => { paperH.current = Math.round(e.nativeEvent.layout.height); }}>
              <ReceiptPrinter.Paper style={s.paper}>
                <View ref={paper} collapsable={false} style={s.capture}>
                  <View ref={reg('brand')} collapsable={false} style={s.center}>
                    <TypeLine text="PUCK" style={s.brand} go={phase >= 0} speed={60} />
                  </View>
                  <View ref={reg('sub')} collapsable={false} style={s.center}>
                    <TypeLine text="ROUTE RECEIPT" style={s.sub} go={phase >= 1} speed={16} />
                  </View>
                  <View ref={reg('stamp')} collapsable={false} style={s.center}>
                    <TypeLine text={stamp} style={s.sub} go={phase >= 2} speed={10} />
                  </View>

                  <View style={s.rule} />
                  <View ref={reg('hero')} collapsable={false}>
                    <Leader label={type} value={dist} go={phase >= 3} strong />
                  </View>
                  <View ref={reg('stats')} collapsable={false} style={s.stats}>
                    {stats.map(([l, v], i) => (
                      <View key={l} style={[s.stat, i > 0 && s.statRule]}>
                        <Text style={[s.statLabel, { opacity: phase >= 4 ? 1 : 0 }]}>{l}</Text>
                        <TypeLine text={v} style={s.statValue} go={phase >= 4} speed={26} />
                      </View>
                    ))}
                  </View>

                  {hasRoute && (
                    <View ref={reg('map')} collapsable={false} style={[s.mapFrame, { height: mapH || Math.round(mapW * 0.62) }]}>
                      {mapW > 0 && (mapH > 0) && (
                        <RouteMap key={print} waypoints={a.waypoints} width={mapW} height={mapH} playing={mapGo}
                          hud onKm={onKm} onDrawn={finish} />
                      )}
                    </View>
                  )}

                  <View ref={reg('splitsHead')} collapsable={false} style={s.splitsHead}>
                    <Text style={s.section}>SPLITS</Text>
                    <Text style={s.sectionNote}>{splits.length ? 'PACE /KM' : 'TOO SHORT FOR A SPLIT'}</Text>
                  </View>
                  {splits.length > 0 && (
                    <View ref={reg('grid')} collapsable={false} style={s.grid}>
                      {cols.map((col, c) => (
                        <View key={c} style={s.col}>
                          {col.map((sp, r) => {
                            const idx = c * rows + r + 1;
                            const go = kmShown >= idx;
                            const pct = slowestPace > quickestPace ? 30 + 70 * (slowestPace - sp.paceSecPerKm) / (slowestPace - quickestPace) : 100;
                            const label = Number.isInteger(sp.km) ? String(sp.km).padStart(2, '0') : sp.km.toFixed(2);
                            return (
                              <View key={sp.km} style={s.split}>
                                <TypeLine text={label} style={s.splitKm} go={go} speed={18} />
                                <SplitBar go={go} pct={pct} />
                                <TypeLine text={`${bare(sp.paceSecPerKm)}${sp.km === fastest ? '*' : ' '}`} style={s.splitPace} go={go} delay={60} speed={22} />
                              </View>
                            );
                          })}
                        </View>
                      ))}
                    </View>
                  )}
                  {fastest > 0 && <Text style={[s.footnote, { opacity: kmShown >= splits.length && splits.length ? 1 : 0 }]}>* FASTEST KM</Text>}

                  <View style={s.rule} />
                  <Leader label="TOTAL" value={total} go={tail} strong onDone={onTotal} />
                  <View style={s.foot}>
                    <View style={s.barcode}>
                      {barcodeBars(a.id).map((bw, i) => <View key={i} style={[s.bar, { width: bw }]} />)}
                    </View>
                    <Text style={s.footText}>{`NO ${a.id.slice(-8).toUpperCase()} · THANK YOU FOR MOVING`}</Text>
                  </View>
                </View>
              </ReceiptPrinter.Paper>
            </View>
            {/* The unprinted part: slides away as the paper feeds out. */}
            <Animated.View pointerEvents="none" style={[s.cover, { transform: [{ translateY: cover }] }]} />
          </View>
        </ReceiptPrinter.Root>
      </ScrollView>

      <View style={s.actions}>
        <Pressable style={({ pressed }) => [s.primaryBtn, !typed && s.off, pressed && s.pressed]} onPress={share} disabled={!typed || sharing}>
          <Text style={s.primaryBtnText}>{sharing ? 'SHARING' : 'SHARE'}</Text>
        </Pressable>
        <Pressable style={({ pressed }) => [s.secondaryBtn, pressed && s.pressed]} onPress={() => router.push({ pathname: '/activity-summary', params: { id: a.id } })}>
          <Text style={s.secondaryBtnText}>SUMMARY</Text>
        </Pressable>
        <Pressable style={({ pressed }) => [s.secondaryBtn, pressed && s.pressed]} onPress={() => router.back()}>
          <Text style={s.secondaryBtnText}>DONE</Text>
        </Pressable>
      </View>
    </SafeAreaView>
  );
}

const s = StyleSheet.create({
  container: { flex: 1, backgroundColor: C.bg },
  scroll: { flex: 1 },
  content: { paddingHorizontal: 16, paddingBottom: 10 },
  empty: { fontFamily: F.mono, fontSize: 12, color: C.dim, paddingHorizontal: 16 },

  machineWrap: { width: '100%', zIndex: 2 },
  machine: { paddingBottom: 26 },
  head: { height: 24, alignItems: 'center' },
  plate: { fontFamily: RECEIPT_REG, fontSize: 9, color: C.dim, letterSpacing: 1 },

  // Tucked under the slot, a little narrower than the printer.
  paperWell: { width: '100%', paddingHorizontal: WELL, marginTop: -16, overflow: 'hidden', zIndex: 1 },
  paper: { paddingHorizontal: PAD, paddingTop: PAD, paddingBottom: 12 },
  cover: { position: 'absolute', left: 0, right: 0, top: 0, height: 4000, backgroundColor: C.bg },

  capture: { gap: 6 },
  center: { alignItems: 'center' },
  brand: { fontFamily: RECEIPT_BOLD, fontSize: 18, color: RECEIPT_INK, letterSpacing: 5 },
  sub: { fontFamily: RECEIPT_REG, fontSize: 9, color: RECEIPT_FADED, letterSpacing: 1.5 },
  rule: { borderTopWidth: 1, borderStyle: 'dashed', borderColor: RECEIPT_RULE, marginVertical: 3 },

  leader: { flexDirection: 'row', alignItems: 'baseline', gap: 4 },
  leadLabel: { fontFamily: RECEIPT_REG, fontSize: 10, color: RECEIPT_FADED },
  leadValue: { fontFamily: RECEIPT_BOLD, fontSize: 11, color: RECEIPT_INK },
  leadLabelStrong: { fontFamily: RECEIPT_BOLD, fontSize: 11, color: RECEIPT_INK, letterSpacing: 1.5 },
  leadValueStrong: { fontFamily: RECEIPT_BOLD, fontSize: 18, color: RECEIPT_INK },
  dots: { flex: 1, fontFamily: RECEIPT_REG, fontSize: 9, color: RECEIPT_RULE, letterSpacing: 0.5 },

  stats: { flexDirection: 'row', paddingVertical: 2 },
  stat: { flex: 1, alignItems: 'center', gap: 2 },
  statRule: { borderLeftWidth: 1, borderLeftColor: RECEIPT_RULE },
  statLabel: { fontFamily: RECEIPT_REG, fontSize: 8, color: RECEIPT_FADED, letterSpacing: 1 },
  statValue: { fontFamily: RECEIPT_BOLD, fontSize: 13, color: RECEIPT_INK },

  mapFrame: { marginTop: 4, borderRadius: 3, borderCurve: 'continuous', overflow: 'hidden', backgroundColor: C.bg },

  splitsHead: { flexDirection: 'row', justifyContent: 'space-between', alignItems: 'baseline', marginTop: 4 },
  section: { fontFamily: RECEIPT_BOLD, fontSize: 10, color: RECEIPT_INK, letterSpacing: 2 },
  sectionNote: { fontFamily: RECEIPT_REG, fontSize: 8, color: RECEIPT_FADED, letterSpacing: 1 },
  grid: { flexDirection: 'row', gap: 14 },
  col: { flex: 1 },
  split: { height: ROW_H, flexDirection: 'row', alignItems: 'center', gap: 6 },
  splitKm: { fontFamily: RECEIPT_REG, fontSize: 9, color: RECEIPT_FADED, width: 24 },
  barTrack: { flex: 1, height: 4, backgroundColor: 'rgba(26,23,20,0.07)' },
  barFill: { height: 4, backgroundColor: RECEIPT_INK },
  splitPace: { fontFamily: RECEIPT_BOLD, fontSize: 10, color: RECEIPT_INK, width: 36, textAlign: 'right' },
  footnote: { fontFamily: RECEIPT_REG, fontSize: 8, color: RECEIPT_FADED, letterSpacing: 1, alignSelf: 'flex-end' },

  foot: { alignItems: 'center', gap: 5, marginTop: 4 },
  barcode: { flexDirection: 'row', alignItems: 'flex-end', gap: 1.5, height: 22 },
  bar: { height: '100%', backgroundColor: RECEIPT_INK },
  footText: { fontFamily: RECEIPT_REG, fontSize: 8, color: RECEIPT_FADED, letterSpacing: 1 },

  actions: { flexDirection: 'row', gap: 8, paddingHorizontal: 16, paddingTop: 8, paddingBottom: 6 },
  primaryBtn: { flex: 1.4, backgroundColor: C.hot, borderRadius: 10, borderCurve: 'continuous', minHeight: TAP, justifyContent: 'center', paddingVertical: 13, alignItems: 'center' },
  primaryBtnText: { fontFamily: F.dot, fontSize: 13, color: C.onHot, letterSpacing: 1 },
  secondaryBtn: { flex: 1, borderRadius: 10, borderCurve: 'continuous', borderWidth: 1, borderColor: C.line, minHeight: TAP, justifyContent: 'center', paddingVertical: 13, alignItems: 'center' },
  secondaryBtnText: { fontFamily: F.dot, fontSize: 12, color: C.ink, letterSpacing: 1 },
  off: { opacity: 0.4 },
  pressed: { transform: [{ scale: 0.97 }], opacity: 0.85 },
});
