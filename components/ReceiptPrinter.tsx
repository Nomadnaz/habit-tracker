// ─────────────────────────────────────────────────────────────────────────
// ReceiptPrinter — a thermal-printer chrome that feeds a paper receipt out
// of a slot. Ported to React Native from a web (Tailwind + motion/react)
// component: the stage machine, the two feed motions, the 20-stop stepped
// keyframe timing and the 40-tooth torn edge are all carried over exactly;
// clip-path became an SVG strip and motion/react became Animated.
//
// Compound API, same as the original:
//   <ReceiptPrinter.Root stage="printing">
//     <ReceiptPrinter.Machine>
//       <ReceiptPrinter.Header><ReceiptPrinter.Status /> … </ReceiptPrinter.Header>
//       <ReceiptPrinter.Screen> … </ReceiptPrinter.Screen>
//     </ReceiptPrinter.Machine>
//     <ReceiptPrinter.Output><ReceiptPrinter.Paper> … </ReceiptPrinter.Paper></ReceiptPrinter.Output>
//   </ReceiptPrinter.Root>
//
// Only used by app/activity-receipt.tsx today.
// ─────────────────────────────────────────────────────────────────────────

import { createContext, useContext, useEffect, useRef, useState, type ReactNode } from 'react';
import {
  AccessibilityInfo, Animated, Easing, StyleSheet, Text, View,
  type StyleProp, type ViewStyle,
} from 'react-native';
import Svg, { Polygon } from 'react-native-svg';
import { MaterialCommunityIcons } from '@expo/vector-icons';

const INK     = '#1A1714';
const PAPER   = '#FCFBF9';
const PLASTIC = '#2A2622';
const SHELL   = '#16130F';
const GLASS   = '#14110E';
const LIT     = '#F4F2EE';
const DIM     = '#8C857B';
const GREEN   = '#3B7A57';
const BOLD    = 'PixeloidSans_700Bold';
const REG     = 'PixeloidSans_400Regular';

// Machine geometry, from the original's --printer-* custom properties.
const RADIUS       = 24;
const INSET        = 12;
const INNER_RADIUS = RADIUS - INSET;
const SLOT_HEIGHT  = 8;

// Torn edge: 40 teeth, 4px deep, walked right-to-left across the bottom.
const TOOTH_COUNT = 40;
const TOOTH_DEPTH = 4;

// The stepped feed — the platen advances a line, then rests. Percentages of
// the receipt's own height; the first stop is special-cased to leave 2px of
// paper showing in the slot.
const FEED_TIMES   = [0, 0.075, 0.105, 0.18, 0.21, 0.285, 0.315, 0.39, 0.42, 0.495, 0.525, 0.6, 0.63, 0.705, 0.735, 0.81, 0.84, 0.915, 0.945, 1];
const FEED_OFFSETS = [null, -91, -91, -81, -81, -70, -70, -58, -58, -45, -45, -32, -32, -20, -20, -10, -10, -3, -3, 0];
const FEED_MS      = 1750;

export type ReceiptPrinterStage = 'processing' | 'printing' | 'complete';
export type ReceiptFeedMotion = 'smooth' | 'stepped';

type PrinterContextValue = {
  animate: boolean;
  feedMotion: ReceiptFeedMotion;
  shouldMove: boolean;
  stage: ReceiptPrinterStage;
  width: number;
};

const PrinterContext = createContext<PrinterContextValue | null>(null);

function usePrinter(component: string): PrinterContextValue {
  const ctx = useContext(PrinterContext);
  if (!ctx) throw new Error(`${component} must be used inside ReceiptPrinter.Root.`);
  return ctx;
}

const STATUS_LABELS: Record<ReceiptPrinterStage, string> = {
  processing: 'Processing',
  printing: 'Printing your receipt',
  complete: 'Complete',
};

// ── Root ──────────────────────────────────────────────────────────────────

function Root({
  stage, children, animate = true, feedMotion = 'stepped', style,
}: {
  stage: ReceiptPrinterStage;
  children: ReactNode;
  animate?: boolean;
  feedMotion?: ReceiptFeedMotion;
  style?: StyleProp<ViewStyle>;
}) {
  const [reduceMotion, setReduceMotion] = useState(false);
  const [width, setWidth] = useState(0);

  useEffect(() => {
    let alive = true;
    AccessibilityInfo.isReduceMotionEnabled().then(v => { if (alive) setReduceMotion(v); });
    const sub = AccessibilityInfo.addEventListener('reduceMotionChanged', setReduceMotion);
    return () => { alive = false; sub.remove(); };
  }, []);

  return (
    <PrinterContext.Provider
      value={{ animate, feedMotion, shouldMove: animate && !reduceMotion, stage, width }}
    >
      <View
        style={[s.root, style]}
        onLayout={e => setWidth(e.nativeEvent.layout.width)}
        accessibilityLabel="Receipt printer"
      >
        {children}
      </View>
    </PrinterContext.Provider>
  );
}

// ── Machine ───────────────────────────────────────────────────────────────

function Machine({ children, style }: { children: ReactNode; style?: StyleProp<ViewStyle> }) {
  return (
    <View style={[s.machine, style]}>
      {/* Inset lip and foot — the two inset hairlines of the original's shadow stack. */}
      <View pointerEvents="none" style={s.machineLip} />
      <View pointerEvents="none" style={s.machineFoot} />
      {children}
      {/* The paper exit. */}
      <View pointerEvents="none" style={s.machineSlot} />
    </View>
  );
}

// ── Header ────────────────────────────────────────────────────────────────

function Header({ children, style }: { children: ReactNode; style?: StyleProp<ViewStyle> }) {
  return <View style={[s.header, style]}>{children}</View>;
}

// ── Status ────────────────────────────────────────────────────────────────

function StatusIndicator({ stage, animate }: { stage: ReceiptPrinterStage; animate: boolean }) {
  const done = useRef(new Animated.Value(stage === 'complete' ? 1 : 0)).current;
  const spin = useRef(new Animated.Value(0)).current;

  useEffect(() => {
    const to = stage === 'complete' ? 1 : 0;
    if (!animate) { done.setValue(to); return; }
    Animated.timing(done, {
      toValue: to, duration: 160, easing: Easing.bezier(0.23, 1, 0.32, 1), useNativeDriver: true,
    }).start();
  }, [stage, animate, done]);

  useEffect(() => {
    if (!animate || stage === 'complete') { spin.setValue(0); return; }
    const loop = Animated.loop(
      Animated.timing(spin, { toValue: 1, duration: 1000, easing: Easing.linear, useNativeDriver: true }),
    );
    loop.start();
    return () => loop.stop();
  }, [stage, animate, spin]);

  const rotate = spin.interpolate({ inputRange: [0, 1], outputRange: ['0deg', '360deg'] });

  return (
    <View style={s.indicator}>
      <Animated.View
        style={[s.indicatorLayer, {
          opacity: done.interpolate({ inputRange: [0, 1], outputRange: [1, 0] }),
          transform: [
            { scale: done.interpolate({ inputRange: [0, 1], outputRange: [1, 0.96] }) },
            { rotate },
          ],
        }]}
      >
        <MaterialCommunityIcons name="loading" size={18} color={DIM} />
      </Animated.View>
      <Animated.View
        style={[s.indicatorLayer, {
          opacity: done,
          transform: [{ scale: done.interpolate({ inputRange: [0, 1], outputRange: [0.94, 1] }) }],
        }]}
      >
        <MaterialCommunityIcons name="check-circle" size={18} color={GREEN} />
      </Animated.View>
    </View>
  );
}

function Status({ children, style }: { children?: string; style?: StyleProp<ViewStyle> }) {
  const { stage, animate } = usePrinter('ReceiptPrinter.Status');
  const label = children ?? STATUS_LABELS[stage];
  const [shown, setShown] = useState(label);
  const opacity = useRef(new Animated.Value(1)).current;
  const ty = useRef(new Animated.Value(0)).current;

  useEffect(() => {
    if (label === shown) return;
    if (!animate) { setShown(label); return; }
    // Exit up, swap the text, then enter from below — the original's ±4px swap.
    Animated.parallel([
      Animated.timing(opacity, { toValue: 0, duration: 180, easing: Easing.bezier(0.23, 1, 0.32, 1), useNativeDriver: true }),
      Animated.timing(ty, { toValue: -4, duration: 180, easing: Easing.bezier(0.23, 1, 0.32, 1), useNativeDriver: true }),
    ]).start(({ finished }) => {
      if (!finished) return;
      setShown(label);
      ty.setValue(4);
      Animated.parallel([
        Animated.timing(opacity, { toValue: 1, duration: 180, easing: Easing.bezier(0.23, 1, 0.32, 1), useNativeDriver: true }),
        Animated.timing(ty, { toValue: 0, duration: 180, easing: Easing.bezier(0.23, 1, 0.32, 1), useNativeDriver: true }),
      ]).start();
    });
  }, [label, shown, animate, opacity, ty]);

  return (
    <View style={[s.status, style]}>
      <StatusIndicator stage={stage} animate={animate} />
      <Animated.Text
        accessibilityLiveRegion="polite"
        numberOfLines={1}
        style={[s.statusLabel, { opacity, transform: [{ translateY: ty }] }]}
      >
        {shown}
      </Animated.Text>
    </View>
  );
}

// ── Screen ────────────────────────────────────────────────────────────────

function Screen({ children, style }: { children: ReactNode; style?: StyleProp<ViewStyle> }) {
  return (
    <View style={[s.screen, style]}>
      {children}
      {/* The inset vignette of the original's ::after. */}
      <View pointerEvents="none" style={s.screenVignette} />
    </View>
  );
}

// ── Output + Paper ────────────────────────────────────────────────────────

function Output({ children, style }: { children: ReactNode; style?: StyleProp<ViewStyle> }) {
  const { stage, shouldMove, feedMotion, animate, width } = usePrinter('ReceiptPrinter.Output');
  const [paperH, setPaperH] = useState(0);
  const feed = useRef(new Animated.Value(0)).current;
  const fade = useRef(new Animated.Value(0)).current;

  useEffect(() => {
    const run = Animated.timing(fade, {
      toValue: stage === 'processing' ? 0 : 1,
      duration: animate ? 160 : 0,
      easing: Easing.bezier(0.23, 1, 0.32, 1),
      useNativeDriver: true,
    });
    run.start();
    return () => run.stop();
  }, [stage, animate, fade]);

  useEffect(() => {
    if (stage === 'processing') { feed.setValue(0); return; }
    if (stage === 'complete' || !shouldMove || paperH === 0) { feed.setValue(1); return; }
    // stage === 'printing' — re-arm and pull the paper through.
    feed.setValue(0);
    const run = Animated.timing(feed, {
      toValue: 1,
      duration: FEED_MS,
      easing: feedMotion === 'stepped' ? Easing.linear : Easing.bezier(0.77, 0, 0.175, 1),
      useNativeDriver: true,
    });
    run.start();
    return () => run.stop();
  }, [stage, shouldMove, feedMotion, paperH, feed]);

  // Hidden position leaves 2px of paper showing in the slot, as the original does.
  const hidden = -(paperH - 2);
  const translateY = paperH === 0
    ? 0
    : feedMotion === 'stepped' && shouldMove
      ? feed.interpolate({
          inputRange: FEED_TIMES,
          outputRange: FEED_OFFSETS.map(pct => (pct === null ? hidden : (pct / 100) * paperH)),
        })
      : feed.interpolate({ inputRange: [0, 1], outputRange: [hidden, 0] });

  const wellWidth = width > 0 ? width * 0.8 + 48 : undefined;

  return (
    <View
      style={[s.output, { width: wellWidth, height: paperH || undefined }, style]}
      pointerEvents="box-none"
    >
      <Animated.View
        onLayout={e => setPaperH(Math.round(e.nativeEvent.layout.height))}
        style={{ opacity: fade, transform: [{ translateY }] }}
      >
        {children}
      </Animated.View>
      {/* The slot's own shadow, cast onto the paper as it emerges. */}
      {stage !== 'processing' && <View pointerEvents="none" style={s.outputShadow} />}
    </View>
  );
}

/** The 40-tooth torn bottom edge — the original's clip-path, as an SVG strip. */
function TornEdge({ width }: { width: number }) {
  if (width <= 0) return null;
  const points: string[] = [`${width},0`];
  for (let i = 0; i < TOOTH_COUNT * 2; i++) {
    const x = (100 - ((i + 1) * 100) / (TOOTH_COUNT * 2)) / 100 * width;
    points.push(`${x},${i % 2 === 0 ? TOOTH_DEPTH : 0}`);
  }
  points.push('0,0');
  return (
    <Svg width={width} height={TOOTH_DEPTH} style={s.tornEdge}>
      <Polygon points={points.join(' ')} fill={PAPER} />
    </Svg>
  );
}

function Paper({ children, style }: { children: ReactNode; style?: StyleProp<ViewStyle> }) {
  const [width, setWidth] = useState(0);
  return (
    <View>
      <View style={[s.paper, style]} onLayout={e => setWidth(Math.round(e.nativeEvent.layout.width))}>
        {children}
      </View>
      <TornEdge width={width} />
    </View>
  );
}

// ── Small paper primitives, so screens don't re-declare receipt type ──────

export function ReceiptRow({ label, value, emphasis }: { label: string; value: string; emphasis?: boolean }) {
  return (
    <View style={s.row}>
      <Text style={[s.rowLabel, emphasis && s.rowStrong]}>{label}</Text>
      <Text style={[s.rowValue, emphasis && s.rowStrong]}>{value}</Text>
    </View>
  );
}

export function ReceiptRule() {
  return <View style={s.rule} />;
}

export const ReceiptPrinter = {
  Root, Machine, Header, Status, Screen, Output, Paper,
};

const s = StyleSheet.create({
  root: { width: '100%', alignItems: 'center' },

  machine: {
    width: '100%',
    borderRadius: RADIUS,
    borderWidth: 1,
    borderColor: SHELL,
    backgroundColor: PLASTIC,
    padding: INSET,
    paddingBottom: 32,
    overflow: 'hidden',
    shadowColor: '#000',
    shadowOffset: { width: 0, height: 12 },
    shadowOpacity: 0.28,
    shadowRadius: 20,
    elevation: 8,
  },
  machineLip: {
    position: 'absolute', top: 0, left: 0, right: 0, height: 1,
    backgroundColor: 'rgba(244,242,238,0.14)',
  },
  machineFoot: {
    position: 'absolute', bottom: 0, left: 0, right: 0, height: 1,
    backgroundColor: 'rgba(0,0,0,0.55)',
  },
  machineSlot: {
    position: 'absolute', left: 24, right: 24, bottom: INSET,
    height: SLOT_HEIGHT, borderRadius: 4, borderWidth: 1,
    borderColor: SHELL, backgroundColor: SHELL,
  },

  header: {
    height: 44, flexDirection: 'row', alignItems: 'flex-start',
    justifyContent: 'space-between', gap: 12,
  },

  status: { flexDirection: 'row', alignItems: 'center', gap: 8, flexShrink: 1, paddingTop: 2 },
  indicator: { width: 20, height: 20, alignItems: 'center', justifyContent: 'center' },
  indicatorLayer: { position: 'absolute', alignItems: 'center', justifyContent: 'center' },
  statusLabel: { fontFamily: BOLD, fontSize: 10, color: DIM, flexShrink: 1 },

  screen: {
    borderRadius: INNER_RADIUS, borderWidth: 1, borderColor: SHELL,
    backgroundColor: GLASS, padding: 16, overflow: 'hidden',
  },
  screenVignette: {
    position: 'absolute', top: 0, left: 0, right: 0, bottom: 0,
    borderRadius: INNER_RADIUS, borderWidth: 6, borderColor: 'rgba(0,0,0,0.30)',
  },

  output: { marginTop: -16, paddingHorizontal: 24, overflow: 'hidden', alignSelf: 'center' },
  outputShadow: {
    position: 'absolute', top: 0, left: 24, right: 24, height: 6,
    backgroundColor: 'rgba(22,19,15,0.35)',
  },

  paper: { backgroundColor: PAPER, paddingHorizontal: 18, paddingTop: 22, paddingBottom: 20 },
  tornEdge: { backgroundColor: 'transparent' },

  row: { flexDirection: 'row', justifyContent: 'space-between', alignItems: 'baseline', gap: 12 },
  rowLabel: { fontFamily: REG, fontSize: 10, color: '#5C554C', flexShrink: 1 },
  rowValue: { fontFamily: REG, fontSize: 10, color: INK },
  rowStrong: { fontFamily: BOLD, fontSize: 12, color: INK },
  rule: { borderTopWidth: 1, borderStyle: 'dashed', borderColor: '#C9C2B7', marginVertical: 10 },
});

export { INK as RECEIPT_INK, PAPER as RECEIPT_PAPER, LIT as PRINTER_SCREEN_TEXT, DIM as PRINTER_SCREEN_DIM };
