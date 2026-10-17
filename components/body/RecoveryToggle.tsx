// BODY's RECOVERY switch, bottom-right of the figure, and the aura it casts.
// Turning it on fades the muscles from white to their reds (body.tsx drives
// the paint off `mix`), breathes a red glow in around the edges of the stage,
// and pulses a ring off the switch while it's on.

import { useEffect, useRef } from 'react';
import { Animated, Easing, Pressable, StyleSheet, Text, View } from 'react-native';
import Svg, { Defs, RadialGradient, Rect, Stop } from 'react-native-svg';
import { MaterialCommunityIcons } from '@expo/vector-icons';
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
    Animated.timing(mix, { toValue: on ? 1 : 0, duration: on ? 650 : 450, easing: Easing.inOut(Easing.cubic), useNativeDriver: false }).start();
  }, [on]);
  return mix;
}

/** The red glow framing the figure: clear in the middle, red at the edges, breathing while on. */
export function RecoveryAura({ mix, w, h }: { mix: Animated.Value; w: number; h: number }) {
  const breathe = useRef(new Animated.Value(0)).current;
  useEffect(() => {
    const loop = Animated.loop(Animated.sequence([
      Animated.timing(breathe, { toValue: 1, duration: 1800, easing: Easing.inOut(Easing.sin), useNativeDriver: true }),
      Animated.timing(breathe, { toValue: 0, duration: 1800, easing: Easing.inOut(Easing.sin), useNativeDriver: true }),
    ]));
    loop.start();
    return () => loop.stop();
  }, []);
  return (
    <Animated.View pointerEvents="none" style={[StyleSheet.absoluteFill, { opacity: mix }]}>
      <Animated.View style={[StyleSheet.absoluteFill, { opacity: breathe.interpolate({ inputRange: [0, 1], outputRange: [0.55, 1] }) }]}>
        <Svg width={w} height={h}>
          <Defs>
            <RadialGradient id="aura" cx="50%" cy="48%" rx="62%" ry="58%">
              <Stop offset="0.55" stopColor={C.alert} stopOpacity={0} />
              <Stop offset="0.85" stopColor={C.alert} stopOpacity={0.12} />
              <Stop offset="1" stopColor={C.alert} stopOpacity={0.26} />
            </RadialGradient>
          </Defs>
          <Rect x={0} y={0} width={w} height={h} fill="url(#aura)" />
        </Svg>
      </Animated.View>
    </Animated.View>
  );
}

export function RecoveryToggle({ on, mix, onToggle, style }: {
  on: boolean; mix: Animated.Value; onToggle: () => void; style?: object;
}) {
  const ring = useRef(new Animated.Value(0)).current;
  const press = useRef(new Animated.Value(1)).current;
  useEffect(() => {
    if (!on) { ring.setValue(0); return; }
    const loop = Animated.loop(Animated.timing(ring, { toValue: 1, duration: 1600, easing: Easing.out(Easing.quad), useNativeDriver: true }));
    loop.start();
    return () => loop.stop();
  }, [on]);

  const bg = mix.interpolate({ inputRange: [0, 1], outputRange: [C.surface, C.alert] });
  const border = mix.interpolate({ inputRange: [0, 1], outputRange: [C.lineHi, C.alert] });
  const knob = mix.interpolate({ inputRange: [0, 1], outputRange: [0, 12] });

  return (
    <Pressable
      onPress={() => { Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Medium); onToggle(); }}
      onPressIn={() => Animated.spring(press, { toValue: 0.94, useNativeDriver: true }).start()}
      onPressOut={() => Animated.spring(press, { toValue: 1, friction: 4, useNativeDriver: true }).start()}
      hitSlop={8}
      style={style}
      accessibilityRole="switch" accessibilityState={{ checked: on }} accessibilityLabel="Recovery colours"
    >
      <Animated.View style={{ transform: [{ scale: press }] }}>
        {on && (
          <Animated.View pointerEvents="none" style={[st.ring, {
            opacity: ring.interpolate({ inputRange: [0, 1], outputRange: [0.7, 0] }),
            transform: [{ scaleX: ring.interpolate({ inputRange: [0, 1], outputRange: [1, 1.25] }) }, { scaleY: ring.interpolate({ inputRange: [0, 1], outputRange: [1, 1.6] }) }],
          }]} />
        )}
        <Animated.View style={[st.pill, { backgroundColor: bg, borderColor: border }]}>
          <MaterialCommunityIcons name="heart-pulse" size={14} color={on ? C.hot : C.ink} />
          <Text style={[st.text, on && { color: C.hot }]}>RECOVERY</Text>
          <View style={[st.track, on && { backgroundColor: 'rgba(0,0,0,0.25)' }]}>
            <Animated.View style={[st.knob, { transform: [{ translateX: knob }] }, on && { backgroundColor: C.hot }]} />
          </View>
        </Animated.View>
      </Animated.View>
    </Pressable>
  );
}

const st = StyleSheet.create({
  pill: { flexDirection: 'row', alignItems: 'center', gap: 6, height: 38, paddingLeft: 11, paddingRight: 6, borderRadius: 19, borderWidth: 1 },
  ring: { ...StyleSheet.absoluteFillObject, borderRadius: 19, borderWidth: 2, borderColor: C.alert },
  text: { fontFamily: F.dot, fontSize: 9, color: C.ink, letterSpacing: 1.2 },
  track: { width: 30, height: 18, borderRadius: 9, backgroundColor: C.raised, padding: 2 },
  knob: { width: 14, height: 14, borderRadius: 7, backgroundColor: C.dim },
});
