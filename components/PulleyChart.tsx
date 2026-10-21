// PulleyChart — beside a cable exercise's demo: the column with its 20 pin
// holes, the one to use lit green with a blinking arrow pointing at it, and
// the pin number and height to read off. Stands on the side the cable comes
// from in the demo.

import { useEffect, useRef } from 'react';
import { Animated, Easing, StyleSheet, Text, View } from 'react-native';
import { MaterialCommunityIcons } from '@expo/vector-icons';
import { pulleyPin, PINS } from '@/lib/exercise-demo';
import { C, F } from '@/lib/theme';

export const PULLEY_CHART_W = 58;

export function PulleyChart({ pulley, height, side }: { pulley: number; height: number; side: 'left' | 'right' }) {
  const { pin, of, zone } = pulleyPin(pulley);
  const blink = useRef(new Animated.Value(1)).current;
  useEffect(() => {
    const loop = Animated.loop(Animated.sequence([
      Animated.timing(blink, { toValue: 0.15, duration: 420, easing: Easing.in(Easing.quad), useNativeDriver: true }),
      Animated.timing(blink, { toValue: 1, duration: 420, easing: Easing.out(Easing.quad), useNativeDriver: true }),
    ]));
    loop.start();
    return () => loop.stop();
  }, []);

  const col = height - 58;            // the column; the readout sits under it
  const step = col / (PINS + 1);
  const holeY = (n: number) => col - n * step; // pin 1 at the bottom
  const arrowLeft = side === 'right';   // the arrow points in at the column from the demo's side

  return (
    <View style={[st.wrap, { height }]} accessibilityLabel={`Pulley on pin ${pin} of ${of}, ${zone.toLowerCase()}`}>
      <Text style={st.label}>PIN</Text>
      <View style={[st.col, { height: col }]}>
        {Array.from({ length: PINS }, (_, i) => i + 1).map(n => (
          <View key={n} style={[st.hole, { top: holeY(n) - 3 }, n === pin && st.holeOn]} />
        ))}
        <Animated.View style={[st.arrow, arrowLeft ? { left: -22 } : { right: -22 }, { top: holeY(pin) - 9, opacity: blink }]}>
          <MaterialCommunityIcons name={arrowLeft ? 'menu-right' : 'menu-left'} size={18} color={C.live} />
        </Animated.View>
      </View>
      <Text style={st.pin}>{pin}<Text style={st.of}>{`/${of}`}</Text></Text>
      <Text style={st.zone} numberOfLines={2}>{zone}</Text>
    </View>
  );
}

const st = StyleSheet.create({
  wrap: { width: PULLEY_CHART_W, alignItems: 'center' },
  label: { fontFamily: F.dot, fontSize: 8, color: C.dim, letterSpacing: 1.5, marginBottom: 4 },
  col: { width: 16, borderWidth: 1, borderColor: C.lineHi, borderRadius: 4, backgroundColor: C.raised },
  hole: { position: 'absolute', left: 4, width: 6, height: 6, borderRadius: 3, backgroundColor: C.ghost },
  holeOn: { backgroundColor: C.live, transform: [{ scale: 1.5 }] },
  arrow: { position: 'absolute', width: 18, height: 18 },
  pin: { fontFamily: F.dot, fontSize: 18, color: C.live, marginTop: 6 },
  of: { fontSize: 9, color: C.dim },
  zone: { fontFamily: F.dot, fontSize: 7, color: C.dim, letterSpacing: 1, textAlign: 'center', marginTop: 2 },
});
