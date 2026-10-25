// BODY's gauge, in the stage's bottom-right slot — always open. A thermometer that
// grows up out of its bulb and fills each time BODY comes into view (and
// whenever it's switched). Two modes, tap to swap:
//   RECOVERY  red — how worn your muscles are overall; worn muscles fade to
//             red and glow.
//   READY     green — the opposite: how fresh they are; the most recovered
//             muscles light green.
// The screen drives the figure's paint off `useRecoveryMix`.

import { useEffect, useRef } from 'react';
import { Animated, Easing, Pressable, StyleSheet, Text, View } from 'react-native';
import Svg, { Defs, LinearGradient, Rect, Stop } from 'react-native-svg';
import * as Haptics from 'expo-haptics';
import { C, F } from '@/lib/theme';
import { hit } from '@/lib/hit';

export type GaugeMode = 'worn' | 'ready';

/** 0 → 1 each time `play` changes; calls back every frame so the figure's paint can follow. */
export function useRecoveryMix(play: string, onMix: (m: number) => void) {
  const mix = useRef(new Animated.Value(0)).current;
  useEffect(() => {
    const id = mix.addListener(({ value }) => onMix(value));
    return () => mix.removeListener(id);
  }, [onMix]);
  useEffect(() => {
    mix.setValue(0);
    Animated.timing(mix, { toValue: 1, duration: 900, delay: 250, easing: Easing.inOut(Easing.cubic), useNativeDriver: false }).start();
  }, [play]);
  return mix;
}

const W = 38;         // thermometer width — it fits the stage's bottom-right slot
const TALL = 104;
const BULB = 22;
const TUBE = 10;
const TUBE_BOTTOM = 8 + BULB - 5;
const TUBE_MAX = TALL - TUBE_BOTTOM - 12;

export function RecoveryThermo({ mode, worn, play, onToggle, style }: {
  mode: GaugeMode;
  /** Overall wear, 0 (all fresh) – 1 (everything empty). */
  worn: number;
  /** Changes whenever it should grow in again (BODY in view, mode switched). */
  play: string;
  onToggle: () => void;
  style?: object;
}) {
  const grow = useRef(new Animated.Value(0)).current;
  const fill = useRef(new Animated.Value(0)).current;
  const press = useRef(new Animated.Value(1)).current;
  const ready = mode === 'ready';
  const level = ready ? 1 - worn : worn;

  useEffect(() => {
    grow.setValue(0);
    fill.setValue(0);
    Animated.sequence([
      Animated.spring(grow, { toValue: 1, friction: 7, tension: 70, useNativeDriver: false }),
      Animated.spring(fill, { toValue: level, friction: 8, tension: 40, useNativeDriver: false }),
    ]).start();
  }, [play]);
  useEffect(() => { Animated.spring(fill, { toValue: level, friction: 8, tension: 40, useNativeDriver: false }).start(); }, [level]);

  const height = grow.interpolate({ inputRange: [0, 1], outputRange: [W, TALL] });
  const tubeH = grow.interpolate({ inputRange: [0, 1], outputRange: [0, TUBE_MAX] });
  const fillH = Animated.multiply(fill, TUBE_MAX);
  const pct = Math.round(level * 100);
  const tone = ready ? C.live : C.alert;
  const deep = ready ? C.freshDeep : C.wornDeep;
  const word = ready
    ? (pct >= 85 ? 'ALL GO' : pct >= 65 ? 'MOSTLY READY' : pct >= 40 ? 'PART READY' : 'RUN DOWN')
    : (pct < 15 ? 'FRESH' : pct < 35 ? 'SOME WEAR' : pct < 60 ? 'TIRED' : 'NEEDS REST');

  return (
    <Pressable
      onPress={() => { Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Medium); onToggle(); }}
      onPressIn={() => Animated.spring(press, { toValue: 0.9, useNativeDriver: true }).start()}
      onPressOut={() => Animated.spring(press, { toValue: 1, friction: 4, useNativeDriver: true }).start()}
      hitSlop={hit(38, 104, 10)}
      style={style}
      accessibilityRole="switch" accessibilityState={{ checked: ready }} accessibilityLabel={ready ? 'Showing ready muscles' : 'Showing worn muscles'}
    >
      <Animated.View style={{ transform: [{ scale: press }], alignItems: 'flex-end' }}>
        {/* The reading, off to the left once it's open. */}
        <Animated.View pointerEvents="none" style={[st.reading, {
          opacity: grow.interpolate({ inputRange: [0.6, 1], outputRange: [0, 1], extrapolate: 'clamp' }),
          transform: [{ translateX: grow.interpolate({ inputRange: [0, 1], outputRange: [10, 0] }) }],
        }]}>
          <Text style={st.readNum}>{`${pct}%`}</Text>
          <Text style={[st.readLabel, { color: tone }]}>{ready ? 'READY' : 'WORN'}</Text>
          <Text style={st.readSub}>{word}</Text>
          <Text style={st.readTap}>{ready ? 'TAP FOR WORN' : 'TAP FOR READY'}</Text>
        </Animated.View>

        <Animated.View style={[st.case, { height, borderColor: tone }]}>
          <Animated.View style={[st.tube, { height: tubeH }]}>
            <Animated.View style={[st.fill, { height: fillH }]}>
              <Svg width={TUBE} height={TUBE_MAX} style={{ position: 'absolute', bottom: 0 }}>
                <Defs>
                  <LinearGradient id={`gauge-${mode}`} x1="0" y1="0" x2="0" y2="1">
                    <Stop offset="0" stopColor={tone} stopOpacity={0.75} />
                    <Stop offset="1" stopColor={deep} />
                  </LinearGradient>
                </Defs>
                <Rect x={0} y={0} width={TUBE} height={TUBE_MAX} fill={`url(#gauge-${mode})`} />
              </Svg>
            </Animated.View>
          </Animated.View>
          <Animated.View pointerEvents="none" style={[st.ticks, { height: tubeH, opacity: grow }]}>
            {[0, 1, 2, 3, 4].map(i => <View key={i} style={[st.tick, i % 2 === 0 && st.tickLong]} />)}
          </Animated.View>
          <View style={[st.bulb, { backgroundColor: deep, borderColor: tone }]}>
            <View style={[st.bulbCore, { backgroundColor: tone }]} />
          </View>
        </Animated.View>
      </Animated.View>
    </Pressable>
  );
}

const st = StyleSheet.create({
  case: { width: W, borderRadius: W / 2, borderWidth: 1, backgroundColor: C.surface, alignItems: 'center', justifyContent: 'flex-end', overflow: 'hidden' },
  tube: { position: 'absolute', bottom: TUBE_BOTTOM, width: TUBE, borderTopLeftRadius: TUBE / 2, borderTopRightRadius: TUBE / 2, backgroundColor: C.raised, overflow: 'hidden', justifyContent: 'flex-end' },
  fill: { width: TUBE, overflow: 'hidden' },
  ticks: { position: 'absolute', bottom: TUBE_BOTTOM, right: 5, justifyContent: 'space-between', paddingVertical: 2 },
  tick: { width: 4, height: 1, backgroundColor: C.lineHi },
  tickLong: { width: 7 },
  bulb: { width: BULB, height: BULB, borderRadius: BULB / 2, borderWidth: 1, marginBottom: 7, alignItems: 'center', justifyContent: 'center' },
  bulbCore: { width: 8, height: 8, borderRadius: 4 },
  reading: { position: 'absolute', right: W + 10, top: 6, alignItems: 'flex-end' },
  readNum: { fontFamily: F.dot, fontSize: 22, color: C.hot },
  readLabel: { fontFamily: F.dot, fontSize: 9, letterSpacing: 2 },
  readSub: { fontFamily: F.dot, fontSize: 7, color: C.dim, letterSpacing: 1.5, marginTop: 2 },
  readTap: { fontFamily: F.dot, fontSize: 6, color: C.faint, letterSpacing: 1.2, marginTop: 6 },
});
