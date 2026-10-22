// RepChart — one set's reps on the lift receipt: how high each rep went (a
// bar per rep, cm on the left) against how fast it moved (average speed
// solid, peak speed dashed, m/s on the right). Both scales start at zero and
// the lines run straight between reps -- the puck measures once per rep, so
// nothing is drawn between them that wasn't measured. The speed drop from
// the fastest rep to the last is printed along the top. Revealed left to right
// while the paper prints.

import { useEffect, useRef } from 'react';
import { Animated, Easing, StyleSheet, Text, View } from 'react-native';
import Svg, { Circle, Line, Path, Rect, Text as SvgText } from 'react-native-svg';
import { RECEIPT_FADED, RECEIPT_INK, RECEIPT_REG, RECEIPT_RULE } from '@/components/ReceiptPrinter';
import type { LiftRep } from '@/lib/lift-sessions';

const H = 180;
const PAD = { l: 30, r: 34, t: 22, b: 20 };

/** A round top for an axis: 0.87 → 1, 43 → 50. */
function niceMax(v: number): number {
  if (v <= 0) return 1;
  const step = Math.pow(10, Math.floor(Math.log10(v)));
  return [1, 2, 2.5, 5, 10].map(m => m * step).find(m => m >= v * 1.05) ?? v * 1.1;
}

const num = (v: number) => (Number.isInteger(v) ? String(v) : v.toFixed(v < 1 ? 2 : 1).replace(/\.?0+$/, '') || '0');

/** Speed lost from the fastest rep's average speed to the last rep's, %. */
export function speedDropPct(reps: LiftRep[]): number | null {
  if (reps.length < 2) return null;
  const best = Math.max(...reps.map(r => r.meanMps));
  const last = reps[reps.length - 1].meanMps;
  return best > 0 ? Math.max(0, Math.round((1 - last / best) * 100)) : null;
}

/** `total` is the set's rep count: reps lost over Bluetooth keep their slot, and the lines break there. */
export function RepChart({ reps, total, width, play }: { reps: LiftRep[]; total?: number; width: number; play: boolean }) {
  const reveal = useRef(new Animated.Value(play ? 0 : 1)).current;
  useEffect(() => {
    if (!play) { reveal.setValue(1); return; }
    reveal.setValue(0);
    Animated.timing(reveal, { toValue: 1, duration: 1500, easing: Easing.out(Easing.cubic), useNativeDriver: false }).start();
  }, [play, reps]);

  if (width <= 0 || reps.length === 0) return null;
  const w = width - PAD.l - PAD.r, h = H - PAD.t - PAD.b;
  const bottom = PAD.t + h;
  const cmMax = niceMax(Math.max(...reps.map(r => r.romCm)));
  const vMax = niceMax(Math.max(...reps.map(r => Math.max(r.peakMps, r.meanMps))));
  const slot = (i: number) => (reps[i].n ?? i + 1) - 1;
  const slots = Math.max(total ?? 0, slot(reps.length - 1) + 1);
  const band = w / slots;
  const x = (i: number) => PAD.l + band * (slot(i) + 0.5);
  const yCm = (v: number) => bottom - (Math.max(0, v) / cmMax) * h;
  const yV = (v: number) => bottom - (Math.max(0, v) / vMax) * h;
  const barW = Math.min(22, band * 0.62);
  const line = (ys: number[]) => ys.map((y, i) => `${i && slot(i) === slot(i - 1) + 1 ? 'L' : 'M'}${x(i)},${y}`).join(' ');
  const mean = reps.map(r => yV(r.meanMps));
  const peak = reps.map(r => yV(r.peakMps));
  const bestCm = Math.max(...reps.map(r => r.romCm));
  const drop = speedDropPct(reps);
  // Label every rep up to 12, then every other one (and always the last).
  const every = slots > 12 ? 2 : 1;

  return (
    <View>
      <View style={{ width, height: H }}>
        <Svg width={width} height={H} style={StyleSheet.absoluteFill}>
          <SvgText x={PAD.l - 4} y={PAD.t - 10} fontSize={8} fontFamily={RECEIPT_REG} fill={RECEIPT_FADED} textAnchor="end">CM</SvgText>
          <SvgText x={PAD.l + w + 4} y={PAD.t - 10} fontSize={8} fontFamily={RECEIPT_REG} fill={RECEIPT_FADED}>M/S</SvgText>
          {drop != null && (
            <SvgText x={PAD.l + w / 2} y={PAD.t - 10} fontSize={9} fontFamily={RECEIPT_REG} fill={RECEIPT_INK} textAnchor="middle">{`SPEED LOST ${drop}%`}</SvgText>
          )}
          {[0, 0.25, 0.5, 0.75, 1].map(f => (
            <Line key={f} x1={PAD.l} x2={PAD.l + w} y1={bottom - h * f} y2={bottom - h * f}
              stroke={RECEIPT_RULE} strokeWidth={1} strokeDasharray={f === 0 ? undefined : '2,3'} />
          ))}
          {[0, 0.5, 1].map(f => (
            <SvgText key={`l${f}`} x={PAD.l - 4} y={bottom - h * f + 3} fontSize={8} fontFamily={RECEIPT_REG} fill={RECEIPT_FADED} textAnchor="end">{num(cmMax * f)}</SvgText>
          ))}
          {[0, 0.5, 1].map(f => (
            <SvgText key={`r${f}`} x={PAD.l + w + 4} y={bottom - h * f + 3} fontSize={8} fontFamily={RECEIPT_REG} fill={RECEIPT_FADED}>{num(vMax * f)}</SvgText>
          ))}
          {Array.from({ length: slots }, (_, k) => ((k % every === 0 && !(every > 1 && k === slots - 2)) || k === slots - 1) && (
            <SvgText key={k} x={PAD.l + band * (k + 0.5)} y={H - 6} fontSize={8} fontFamily={RECEIPT_REG} fill={RECEIPT_FADED} textAnchor="middle">{String(k + 1)}</SvgText>
          ))}
        </Svg>
        {/* The data, uncovered left to right as the paper feeds. */}
        <Animated.View style={[StyleSheet.absoluteFill, { overflow: 'hidden', width: reveal.interpolate({ inputRange: [0, 1], outputRange: [0, width] }) }]}>
          <Svg width={width} height={H}>
            {reps.map((r, i) => (
              <Rect key={i} x={x(i) - barW / 2} y={yCm(r.romCm)} width={barW} height={bottom - yCm(r.romCm)}
                fill={RECEIPT_INK} fillOpacity={r.romCm === bestCm ? 0.22 : 0.1} />
            ))}
            {reps.length > 1 && <Path d={line(peak)} stroke={RECEIPT_INK} strokeWidth={1} strokeDasharray="3,3" fill="none" />}
            {reps.length > 1 && <Path d={line(mean)} stroke={RECEIPT_INK} strokeWidth={2} strokeLinejoin="round" fill="none" />}
            {peak.map((y, i) => <Circle key={`p${i}`} cx={x(i)} cy={y} r={1.6} fill={RECEIPT_INK} />)}
            {mean.map((y, i) => <Circle key={`m${i}`} cx={x(i)} cy={y} r={3} fill={RECEIPT_INK} />)}
          </Svg>
        </Animated.View>
      </View>
      <View style={st.legend}>
        <View style={st.key}><View style={st.swatchArea} /><Text style={st.keyText}>HEIGHT CM</Text></View>
        <View style={st.key}><View style={st.swatchLine} /><Text style={st.keyText}>AVG M/S</Text></View>
        <View style={st.key}><View style={st.swatchDash} /><Text style={st.keyText}>PEAK M/S</Text></View>
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
  swatchDash: { width: 12, height: 0, borderTopWidth: 1, borderStyle: 'dashed', borderColor: RECEIPT_INK },
});
