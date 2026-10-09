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
import { View, Text, ScrollView, StyleSheet, TouchableOpacity } from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';
import { useRouter, useLocalSearchParams } from 'expo-router';
import { MaterialCommunityIcons } from '@expo/vector-icons';
import { ReceiptPrinter, ReceiptRow, ReceiptRule, type ReceiptPrinterStage } from '@/components/ReceiptPrinter';
import { PixelRouteMap } from '@/components/PixelRouteMap';
import {
  getActivityById, computeSplits, formatDuration, formatPace, formatDistance,
  type Activity,
} from '@/lib/activity-data';

import { C, F } from '@/lib/theme';
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

export default function ActivityReceiptScreen() {
  const router = useRouter();
  const { id } = useLocalSearchParams<{ id?: string | string[] }>();
  const activityId = Array.isArray(id) ? (id[0] ?? '') : (id ?? '');

  const [activity, setActivity] = useState<Activity | null>(null);
  const [notFound, setNotFound] = useState(false);
  const [stage, setStage] = useState<ReceiptPrinterStage>('processing');
  const [mapWidth, setMapWidth] = useState(0);
  const timers = useRef<ReturnType<typeof setTimeout>[]>([]);

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
    timers.current.push(setTimeout(() => setStage('printing'), PROCESSING_MS));
    timers.current.push(setTimeout(() => setStage('complete'), PROCESSING_MS + PRINTING_MS));
  }

  if (notFound) {
    return (
      <SafeAreaView style={s.container} edges={['top']}>
        <View style={s.header}>
          <TouchableOpacity onPress={() => router.back()} hitSlop={10}>
            <MaterialCommunityIcons name="chevron-left" size={26} color={C.hot} />
          </TouchableOpacity>
          <Text style={s.title}>RECEIPT</Text>
          <View style={{ width: 26 }} />
        </View>
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
      <View style={s.header}>
        <TouchableOpacity onPress={() => router.back()} hitSlop={10}>
          <MaterialCommunityIcons name="chevron-left" size={26} color={C.hot} />
        </TouchableOpacity>
        <Text style={s.title}>{type} RECEIPT</Text>
        <View style={{ width: 26 }} />
      </View>

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
              <View style={s.paperHead}>
                <Text style={s.brand}>HABIT TRACKER</Text>
                <Text style={s.brandSub}>ROUTE RECEIPT</Text>
                <Text style={s.brandSub}>
                  {formatDate(activity.startTime)} · {formatClock(activity.startTime)}
                </Text>
              </View>

              <ReceiptRule />

              <ReceiptRow label="ACTIVITY" value={type} />
              <ReceiptRow label="STARTED" value={formatClock(activity.startTime)} />
              <ReceiptRow label="FINISHED" value={formatClock(activity.endTime)} />
              <ReceiptRow label="RECEIPT NO" value={activity.id.slice(-8).toUpperCase()} />

              <ReceiptRule />

              <Text style={s.section}>ROUTE</Text>
              <View onLayout={e => setMapWidth(Math.round(e.nativeEvent.layout.width))}>
                {mapWidth > 0 && (
                  <PixelRouteMap
                    waypoints={activity.waypoints}
                    width={mapWidth}
                    playing={stage !== 'processing'}
                    durationMs={PRINTING_MS}
                  />
                )}
              </View>

              <ReceiptRule />

              <ReceiptRow label="DISTANCE" value={formatDistance(activity.distanceM)} />
              <ReceiptRow label="DURATION" value={formatDuration(activity.durationSecs)} />
              <ReceiptRow label="AVG PACE" value={formatPace(activity.avgPacePerKm)} />
              <ReceiptRow label="ELEVATION GAIN" value={`${activity.elevationGainM}m`} />

              <ReceiptRule />

              <Text style={s.section}>SPLITS</Text>
              {splits.length === 0
                ? <Text style={s.paperNote}>Too short for a split.</Text>
                : splits.map(split => (
                    <ReceiptRow key={split.km} label={`KM ${split.km}`} value={formatPace(split.paceSecPerKm)} />
                  ))}

              <ReceiptRule />

              <ReceiptRow label="TOTAL" value={formatDistance(activity.distanceM)} emphasis />

              <ReceiptRule />

              <View style={s.paperFoot}>
                <Text style={s.footText}>SAVED TO YOUR ACTIVITY LOG</Text>
                <View style={s.barcode}>
                  {barcodeBars(activity.id).map((w, i) => (
                    <View key={i} style={[s.bar, { width: w }]} />
                  ))}
                </View>
                <Text style={s.footText}>{activity.id.toUpperCase()}</Text>
              </View>
            </ReceiptPrinter.Paper>
          </ReceiptPrinter.Output>
        </ReceiptPrinter.Root>

        <View style={s.actions}>
          <TouchableOpacity style={s.primaryBtn} onPress={() => router.back()}>
            <Text style={s.primaryBtnText}>DONE</Text>
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
  header: { flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between', paddingHorizontal: 16, paddingVertical: 12 },
  title: { fontFamily: F.dot, fontSize: 18, color: C.ink, letterSpacing: 1 },
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

  paperHead: { alignItems: 'center', gap: 3 },
  brand: { fontFamily: BOLD, fontSize: 13, color: C.ink, letterSpacing: 2 },
  brandSub: { fontFamily: REG, fontSize: 10, color: C.ink, letterSpacing: 1 },

  section: { fontFamily: F.dot, fontSize: 10, color: C.ink, letterSpacing: 1.5, marginBottom: 8 },
  paperNote: { fontFamily: REG, fontSize: 11, color: C.ink },

  paperFoot: { alignItems: 'center', gap: 8 },
  footText: { fontFamily: REG, fontSize: 9, color: C.ink, letterSpacing: 1 },
  barcode: { flexDirection: 'row', alignItems: 'flex-end', gap: 2, height: 26 },
  bar: { height: '100%', backgroundColor: C.hot },

  actions: { width: '100%', marginTop: 22, gap: 10 },
  primaryBtn: { backgroundColor: ORANGE, borderRadius: 10, paddingVertical: 14, alignItems: 'center' },
  primaryBtnText: { fontFamily: BOLD, fontSize: 13, color: C.onHot },
  secondaryRow: { flexDirection: 'row', gap: 10 },
  secondaryBtn: { flex: 1, borderRadius: 10, borderWidth: 1, borderColor: C.line, paddingVertical: 12, alignItems: 'center' },
  secondaryBtnText: { fontFamily: BOLD, fontSize: 12, color: C.ink },
  secondaryBtnTextOff: { color: MUTED },
});
