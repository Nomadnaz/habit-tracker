// Skeletons: grey bars standing in for text while a list loads. A screen
// renders its own row component with no data, and the row puts a BoneText
// where each line of text goes. BoneText is that same Text, transparent,
// with the bar laid over it, so a skeleton row is exactly as tall as a real
// one and nothing moves when the data lands. useLate() keeps skeletons off
// unless loading takes longer than ~300 ms, so a quick load never flashes.
// All bones breathe together; under Reduce Motion they hold still.
import { useEffect, useState } from 'react';
import { Animated, StyleSheet, Text, View, type DimensionValue, type StyleProp, type TextStyle, type ViewStyle } from 'react-native';
import { C } from '@/lib/theme';
import { useReducedMotion } from '@/lib/use-reduced-motion';

/** True once `loading` has lasted `ms`; false again as soon as it stops. */
export function useLate(loading: boolean, ms = 300): boolean {
  const [late, setLate] = useState(false);
  useEffect(() => {
    if (!loading) { setLate(false); return; }
    const t = setTimeout(() => setLate(true), ms);
    return () => clearTimeout(t);
  }, [loading, ms]);
  return loading && late;
}

// One breath shared by every bone on screen, started by the first, stopped by the last.
const breath = new Animated.Value(1);
let users = 0;
let loop: Animated.CompositeAnimation | null = null;
function useBreath() {
  const reduce = useReducedMotion();
  useEffect(() => {
    if (reduce) return;
    if (users++ === 0) {
      loop = Animated.loop(Animated.sequence([
        Animated.timing(breath, { toValue: 0.45, duration: 700, useNativeDriver: true }),
        Animated.timing(breath, { toValue: 1, duration: 700, useNativeDriver: true }),
      ]));
      loop.start();
    }
    return () => {
      if (--users === 0) { loop?.stop(); loop = null; breath.setValue(1); }
    };
  }, [reduce]);
}

/** A grey block for something that isn't text (an icon, a thumbnail). */
export function Bone({ w, h, round, style }: { w: DimensionValue; h: number; round?: boolean; style?: StyleProp<ViewStyle> }) {
  useBreath();
  return <Animated.View style={[{ width: w, height: h, borderRadius: round ? h / 2 : 3, backgroundColor: C.ghost, opacity: breath }, style]} />;
}

/** One line of text in `style`, `w` wide: the line's own height, with a grey bar across it.
 *  The style's padding and margin move onto a wrapper so the bar covers only the line. */
export function BoneText({ style, w }: { style: StyleProp<TextStyle>; w: DimensionValue }) {
  useBreath();
  const {
    padding, paddingHorizontal, paddingVertical, paddingTop, paddingBottom, paddingLeft, paddingRight,
    margin, marginHorizontal, marginVertical, marginTop, marginBottom, marginLeft, marginRight,
    width: _width, maxWidth: _maxWidth, ...text
  } = StyleSheet.flatten(style) ?? {};
  const box = {
    padding, paddingHorizontal, paddingVertical, paddingTop, paddingBottom, paddingLeft, paddingRight,
    margin, marginHorizontal, marginVertical, marginTop, marginBottom, marginLeft, marginRight,
  };
  return (
    <View style={[box, { width: w }]}>
      <View style={{ justifyContent: 'center' }}>
        {/* A no-break space: a plain one collapses to nothing on the web. */}
        <Text style={[text, { color: 'transparent' }]} numberOfLines={1}>{'\u00A0'}</Text>
        <Animated.View style={{ position: 'absolute', left: 0, right: 0, height: Math.round((text.fontSize ?? 14) * 0.66), borderRadius: 2, backgroundColor: C.ghost, opacity: breath }} />
      </View>
    </View>
  );
}

/** Wraps a skeleton list: screen readers hear "Loading" once instead of empty rows. */
export function Loading({ children, style }: { children: React.ReactNode; style?: StyleProp<ViewStyle> }) {
  return (
    <View style={style} accessible accessibilityLabel="Loading" role="progressbar">
      {children}
    </View>
  );
}
