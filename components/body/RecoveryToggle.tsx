// BODY's RECOVERY control, bottom-right of the figure. Off, it's a dot — the
// thermometer's bulb. Tap it and a tube grows up out of the bulb and fills,
// light red over deep red, to how worn your muscles are overall right now;
// the muscles fade to their reds and the worn ones glow (body.tsx drives the
// paint off `mix`). Tap again and it drains and folds back into the dot.

import { useEffect, useRef } from 'react';
import { Animated, Easing, Pressable, StyleSheet, Text, View } from 'react-native';
import Svg, { Defs, LinearGradient, Rect, Stop } from 'react-native-svg';
import * as Haptics from 'expo-haptics';
import { C, F } from '@/lib/theme';

/** 0 → 1 over the fade; calls back every frame so the figure's paint can follow. */
export function useRecoveryMix(on: boolean, onMix: (m: number) => void) {
  const mix = useRef(new Animated.Value(on ? 1 : 0)).current;
  useEffect(() => {
    const id = mix.addListener(({ value }) => onMix(value));
    return () => mix.removeListener(id);
  }, [onMix]);
  useEffect(() => {
    Animated.timing(mix, { toValue: on ? 1 : 0, duration: on ? 700 : 450, easing: Easing.inOut(Easing.cubic), useNativeDriver: false }).start();
  }, [on]);
  return mix;
}

const W = 46;         // dot / thermometer width
const TALL = 200;     // expanded height
const BULB = 26;
const TUBE = 12;
const TUBE_BOTTOM = 10 + BULB - 6;
const TUBE_MAX = TALL - TUBE_BOTTOM - 12;

export function RecoveryThermo({ on, worn, onToggle, style }: {
  on: boolean;
  /** Overall wear, 0 (all fresh) – 1 (everything empty). */
  worn: number;
  onToggle: () => void;
  style?: object;
}) {
  const grow = useRef(new Animated.Value(0)).current;
  const fill = useRef(new Animated.Value(0)).current;
  const press = useRef(new Animated.Value(1)).current;

  useEffect(() => {
    if (on) {
      Animated.sequence([
        Animated.spring(grow, { toValue: 1, friction: 7, tension: 70, useNativeDriver: false }),
        Animated.spring(fill, { toValue: worn, friction: 8, tension: 40, useNativeDriver: false }),
      ]).start();
    } else {
      Animated.sequence([
        Animated.timing(fill, { toValue: 0, duration: 200, useNativeDriver: false }),
        Animated.spring(grow, { toValue: 0, friction: 8, tension: 90, useNativeDriver: false }),
      ]).start();
    }
  }, [on]);
  useEffect(() => { if (on) Animated.spring(fill, { toValue: worn, friction: 8, tension: 40, useNativeDriver: false }).start(); }, [worn]);

  const height = grow.interpolate({ inputRange: [0, 1], outputRange: [W, TALL] });
  const tubeH = grow.interpolate({ inputRange: [0, 1], outputRange: [0, TUBE_MAX] });
  const level = Animated.multiply(fill, TUBE_MAX);
  const pct = Math.round(worn * 100);

  return (
    <Pressable
      onPress={() => { Haptics.impactAsync(on ? Haptics.ImpactFeedbackStyle.Light : Haptics.ImpactFeedbackStyle.Medium); onToggle(); }}
      onPressIn={() => Animated.spring(press, { toValue: 0.9, useNativeDriver: true }).start()}
      onPressOut={() => Animated.spring(press, { toValue: 1, friction: 4, useNativeDriver: true }).start()}
      hitSlop={10}
      style={style}
      accessibilityRole="switch" accessibilityState={{ checked: on }} accessibilityLabel="Recovery"
    >
      <Animated.View style={{ transform: [{ scale: press }], alignItems: 'flex-end' }}>
        {/* The reading, off to the left once it's open. */}
        <Animated.View pointerEvents="none" style={[st.reading, {
          opacity: grow.interpolate({ inputRange: [0.6, 1], outputRange: [0, 1], extrapolate: 'clamp' }),
          transform: [{ translateX: grow.interpolate({ inputRange: [0, 1], outputRange: [10, 0] }) }],
        }]}>
          <Text style={st.readNum}>{`${pct}%`}</Text>
          <Text style={st.readLabel}>WORN</Text>
          <Text style={st.readSub}>{pct < 15 ? 'FRESH' : pct < 35 ? 'SOME WEAR' : pct < 60 ? 'TIRED' : 'NEEDS REST'}</Text>
        </Animated.View>

        <Animated.View style={[st.case, { height, borderColor: on ? C.alert : C.lineHi }]}>
          {/* tube */}
          <Animated.View style={[st.tube, { height: tubeH }]}>
            <Animated.View style={[st.fill, { height: level }]}>
              <Svg width={TUBE} height={TUBE_MAX} style={{ position: 'absolute', bottom: 0 }}>
                <Defs>
                  <LinearGradient id="worn" x1="0" y1="0" x2="0" y2="1">
                    <Stop offset="0" stopColor={C.alert} stopOpacity={0.75} />
                    <Stop offset="1" stopColor={C.wornDeep} />
                  </LinearGradient>
                </Defs>
                <Rect x={0} y={0} width={TUBE} height={TUBE_MAX} fill="url(#worn)" />
              </Svg>
            </Animated.View>
          </Animated.View>
          {/* ticks */}
          <Animated.View pointerEvents="none" style={[st.ticks, { height: tubeH, opacity: grow }]}>
            {[0, 1, 2, 3, 4].map(i => <View key={i} style={[st.tick, i % 2 === 0 && st.tickLong]} />)}
          </Animated.View>
          {/* bulb — the dot */}
          <View style={[st.bulb, { backgroundColor: on ? C.wornDeep : C.raised, borderColor: on ? C.alert : C.lineHi }]}>
            <View style={[st.bulbCore, { backgroundColor: on ? C.alert : C.dim }]} />
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
  ticks: { position: 'absolute', bottom: TUBE_BOTTOM, right: 7, justifyContent: 'space-between', paddingVertical: 2 },
  tick: { width: 4, height: 1, backgroundColor: C.lineHi },
  tickLong: { width: 7 },
  bulb: { width: BULB, height: BULB, borderRadius: BULB / 2, borderWidth: 1, marginBottom: 9, alignItems: 'center', justifyContent: 'center' },
  bulbCore: { width: 10, height: 10, borderRadius: 5 },
  reading: { position: 'absolute', right: W + 10, top: 6, alignItems: 'flex-end' },
  readNum: { fontFamily: F.num, fontSize: 26, color: C.hot },
  readLabel: { fontFamily: F.dot, fontSize: 9, color: C.alert, letterSpacing: 2 },
  readSub: { fontFamily: F.dot, fontSize: 7, color: C.dim, letterSpacing: 1.5, marginTop: 2 },
});
