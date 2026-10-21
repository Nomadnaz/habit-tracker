// Fades and lifts its child into place after `delay` ms — give a list rising
// delays and it deals itself in one by one. Runs once, on mount.

import { useEffect, useRef, type ReactNode } from 'react';
import { Animated, type StyleProp, type ViewStyle } from 'react-native';

export function Reveal({ delay = 0, children, style }: { delay?: number; children: ReactNode; style?: StyleProp<ViewStyle> }) {
  const t = useRef(new Animated.Value(0)).current;
  useEffect(() => {
    Animated.spring(t, { toValue: 1, delay, friction: 8, tension: 70, useNativeDriver: true }).start();
  }, []);
  const translateY = t.interpolate({ inputRange: [0, 1], outputRange: [18, 0] });
  const scale = t.interpolate({ inputRange: [0, 1], outputRange: [0.96, 1] });
  const opacity = t.interpolate({ inputRange: [0, 0.6, 1], outputRange: [0, 1, 1] });
  return <Animated.View style={[style, { opacity, transform: [{ translateY }, { scale }] }]}>{children}</Animated.View>;
}
