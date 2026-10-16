// RepChart — one set's reps as curves on the lift receipt: how high each rep
// went (shaded) against how fast it moved (peak speed solid, average speed
// dashed). Two scales, cm on the left and m/s on the right, both from zero,
// so a set that slows down reads as the speed line falling away. Drawn in
// receipt ink and revealed left to right while the paper prints.

import { useEffect, useRef } from 'react';
import { Animated, Easing, StyleSheet, Text, View } from 'react-native';
import Svg, { Circle, Line, Path, Text as SvgText } from 'react-native-svg';
import { RECEIPT_FADED, RECEIPT_INK, RECEIPT_REG, RECEIPT_RULE } from '@/components/ReceiptPrinter';
import type { LiftRep } from '@/lib/lift-sessions';

const H = 150;
const PAD = { l: 26, r: 30, t: 10, b: 20 };

type Pt = [number, number];

/** Catmull-Rom through the points as cubic Béziers, control points kept inside [top, bottom]. */
function smooth(pts: Pt[], top: number, bottom: number): string {
  if (pts.length === 0) return '';
  const clampY = (y: number) => Math.min(bottom, Math.max(top, y));
  let d = `M${pts[0][0]},${pts[0][1]}`;
  for (let i = 0; i < pts.length - 1; i++) {
    const p0 = pts[i - 1] ?? pts[i], p1 = pts[i], p2 = pts[i + 1], p3 = pts[i + 2] ?? p2;
    const c1: Pt = [p1[0] + (p2[0] - p0[0]) / 6, clampY(p1[1] + (p2[1] - p0[1]) / 6)];
    const c2: Pt = [p2[0] - (p3[0] - p1[0]) / 6, clampY(p2[1] - (p3[1] - p1[1]) / 6)];
    d += ` C${c1[0]},${c1[1]} ${c2[0]},${c2[1]} ${p2[0]},${p2[1]}`;
  }
  return d;
}

/** A round top for an axis: 0.87 → 1, 43 → 50. */
function niceMax(v: number): number {
  if (v <= 0) return 1;
  const step = Math.pow(10, Math.floor(Math.log10(v)));
  return [1, 2, 2.5, 5, 10].map(m => m * step).find(m => m >= v * 1.1) ?? v * 1.1;
}

export function RepChart({ reps, width, play }: { reps: LiftRep[]; width: number; play: boolean }) {
  const reveal = useRef(new Animated.Value(play ? 0 : 1)).current;
  useEffect(() => {
    if (!play) { reveal.setValue(1); return; }
    reveal.setValue(0);
    Animated.timing(reveal, { toValue: 1, duration: 1500, easing: Easing.out(Easing.cubic), useNativeDriver: false }).start();
  }, [play, reps]);

  if (width <= 0 || reps.length === 0) return null;
  const w = width - PAD.l - PAD.r, h = H - PAD.t - PAD.b;
  const cmMax = niceMax(Math.max(...reps.map(r => r.romCm)));
  const vMax = niceMax(Math.max(...reps.map(r => r.peakMps)));
  const x = (i: number) => PAD.l + (reps.length === 1 ? w / 2 : (i / (reps.length - 1)) * w);
  const yCm = (v: number) => PAD.t + h - (v / cmMax) * h;
  const yV = (v: number) => PAD.t + h - (v / vMax) * h;
  const bottom = PAD.t + h;

  const rom = reps.map((r, i): Pt => [x(i), yCm(r.romCm)]);
  const peak = reps.map((r, i): Pt => [x(i), yV(r.peakMps)]);
  const mean = reps.map((r, i): Pt => [x(i), yV(r.meanMps)]);
  const romLine = smooth(rom, PAD.t, bottom);
  const area = reps.length > 1 ? `${romLine} L${x(reps.length - 1)},${bottom} L${x(0)},${bottom} Z` : '';
  // Label every rep up to 12, then every other one.
  const every = reps.length > 12 ? 2 : 1;

  return (
    <View>
      <View style={{ width, height: H }}>
        <Svg width={width} height={H} style={StyleSheet.absoluteFill}>
          {[0, 0.5, 1].map(f => (
            <Line key={f} x1={PAD.l} x2={PAD.l + w} y1={PAD.t + h * f} y2={PAD.t + h * f} stroke={RECEIPT_RULE} strokeWidth={1} strokeDasharray="2,3" />
          ))}
          <SvgText x={PAD.l - 4} y={PAD.t + 4} fontSize={8} fontFamily={RECEIPT_REG} fill={RECEIPT_FADED} textAnchor="end">{String(cmMax)}</SvgText>
          <SvgText x={PAD.l - 4} y={bottom} fontSize={8} fontFamily={RECEIPT_REG} fill={RECEIPT_FADED} textAnchor="end">0</SvgText>
          <SvgText x={PAD.l + w + 4} y={PAD.t + 4} fontSize={8} fontFamily={RECEIPT_REG} fill={RECEIPT_FADED}>{vMax.toFixed(vMax < 1 ? 2 : 1)}</SvgText>
          <SvgText x={PAD.l + w + 4} y={bottom} fontSize={8} fontFamily={RECEIPT_REG} fill={RECEIPT_FADED}>0</SvgText>
          {reps.map((_, i) => (i % every === 0 || i === reps.length - 1) && (
            <SvgText key={i} x={x(i)} y={H - 4} fontSize={8} fontFamily={RECEIPT_REG} fill={RECEIPT_FADED} textAnchor="middle">{String(i + 1)}</SvgText>
          ))}
        </Svg>
        {/* The curves, uncovered left to right as the paper feeds. */}
        <Animated.View style={[StyleSheet.absoluteFill, { overflow: 'hidden', width: reveal.interpolate({ inputRange: [0, 1], outputRange: [0, width] }) }]}>
          <Svg width={width} height={H}>
            {!!area && <Path d={area} fill={RECEIPT_INK} fillOpacity={0.1} />}
            <Path d={romLine} stroke={RECEIPT_FADED} strokeWidth={1.5} fill="none" />
            <Path d={smooth(mean, PAD.t, bottom)} stroke={RECEIPT_INK} strokeWidth={1.25} strokeDasharray="4,3" fill="none" />
            <Path d={smooth(peak, PAD.t, bottom)} stroke={RECEIPT_INK} strokeWidth={2} fill="none" />
            {peak.map(([px, py], i) => <Circle key={i} cx={px} cy={py} r={2.5} fill={RECEIPT_INK} />)}
          </Svg>
        </Animated.View>
      </View>
      <View style={st.legend}>
        <View style={st.key}><View style={st.swatchArea} /><Text style={st.keyText}>HEIGHT CM</Text></View>
        <View style={st.key}><View style={st.swatchLine} /><Text style={st.keyText}>PEAK M/S</Text></View>
        <View style={st.key}><View style={st.swatchDash} /><Text style={st.keyText}>AVG M/S</Text></View>
      </View>
    </View>
  );
}

const st = StyleSheet.create({
  legend: { flexDirection: 'row', justifyContent: 'center', gap: 12, marginTop: 4 },
  key: { flexDirection: 'row', alignItems: 'center', gap: 4 },
  keyText: { fontFamily: RECEIPT_REG, fontSize: 8, color: RECEIPT_FADED },
  swatchArea: { width: 10, height: 8, backgroundColor: RECEIPT_RULE },
  swatchLine: { width: 12, height: 2, backgroundColor: RECEIPT_INK },
  swatchDash: { width: 12, height: 0, borderTopWidth: 1.5, borderStyle: 'dashed', borderColor: RECEIPT_INK },
});
