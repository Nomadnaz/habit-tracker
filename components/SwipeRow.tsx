// A row you slide sideways to act on. Slide right and `right`'s colour comes
// in underneath from the left with its label; slide left and `left`'s comes
// in from the right. Past the line (42% of the width, or a fast flick) it
// fires with a haptic; short of it, it springs home. Taps on the children
// still work — only a mostly-sideways drag is taken.

import { useEffect, useMemo, useRef, useState, type ReactNode } from 'react';
import { Animated, PanResponder, StyleSheet, Text, View, type StyleProp, type ViewStyle } from 'react-native';
import { MaterialCommunityIcons } from '@expo/vector-icons';
import * as Haptics from 'expo-haptics';
import { C, F } from '@/lib/theme';

type Icon = keyof typeof MaterialCommunityIcons.glyphMap;
export type SwipeAction = {
  label: string;
  icon: Icon;
  color: string;
  ink: string;
  onFire: () => void;
  /** Slide off and stay gone (it opens something), or come back once it's fired. */
  leaves?: boolean;
};

const home = (v: Animated.Value) => Animated.spring(v, { toValue: 0, friction: 6, tension: 120, useNativeDriver: true });

export function SwipeRow({ right, left, nudge, style, children }: {
  right?: SwipeAction;
  left?: SwipeAction;
  /** Nudge right once after mounting, to show it slides. */
  nudge?: boolean;
  style?: StyleProp<ViewStyle>;
  children: ReactNode;
}) {
  const [w, setW] = useState(0);
  const tx = useRef(new Animated.Value(0)).current;
  const acts = useRef({ right, left });
  acts.current = { right, left };
  const line = Math.min(150, w * 0.42);

  const pan = useMemo(() => {
    let past = false;
    const allowed = (dx: number) => (dx > 0 ? !!acts.current.right : !!acts.current.left);
    return PanResponder.create({
      // Mostly sideways, toward a side that does something — anything else is the list scrolling.
      onMoveShouldSetPanResponder: (_, g) => Math.abs(g.dx) > 10 && Math.abs(g.dx) > Math.abs(g.dy) * 1.5 && allowed(g.dx),
      onPanResponderGrant: () => { past = false; },
      onPanResponderMove: (_, g) => {
        const d = allowed(g.dx) ? g.dx : 0;
        const a = Math.abs(d);
        tx.setValue(Math.sign(d) * (a < line ? a : line + (a - line) * 0.5));
        if ((a >= line) !== past) {
          past = a >= line;
          void Haptics.impactAsync(past ? Haptics.ImpactFeedbackStyle.Medium : Haptics.ImpactFeedbackStyle.Light);
        }
      },
      onPanResponderRelease: (_, g) => {
        const act = g.dx > 0 ? acts.current.right : acts.current.left;
        const a = Math.abs(g.dx);
        if (act && (a >= line || (Math.abs(g.vx) > 0.9 && a > line * 0.5))) {
          void Haptics.notificationAsync(Haptics.NotificationFeedbackType.Success);
          Animated.timing(tx, { toValue: Math.sign(g.dx) * w, duration: 160, useNativeDriver: true }).start(() => {
            act.onFire();
            // Opened something: come home while it's covered. Otherwise come straight back.
            if (act.leaves) setTimeout(() => tx.setValue(0), 500);
            else home(tx).start();
          });
        } else {
          home(tx).start();
        }
      },
      onPanResponderTerminate: () => home(tx).start(),
      onPanResponderTerminationRequest: () => false,
    });
  }, [line, w]);

  useEffect(() => {
    if (!nudge) return;
    const t = setTimeout(() => {
      Animated.sequence([
        Animated.timing(tx, { toValue: 42, duration: 260, useNativeDriver: true }),
        Animated.spring(tx, { toValue: 0, friction: 5, tension: 90, useNativeDriver: true }),
      ]).start();
    }, 700);
    return () => clearTimeout(t);
  }, [nudge]);

  const glow = (sign: 1 | -1) => tx.interpolate({
    inputRange: sign > 0 ? [0, line * 0.3 || 1, line || 2] : [-(line || 2), -(line * 0.3 || 1), 0],
    outputRange: sign > 0 ? [0, 0.75, 1] : [1, 0.75, 0],
    extrapolate: 'clamp',
  });

  return (
    <View style={[{ overflow: 'hidden' }, style]} onLayout={e => setW(e.nativeEvent.layout.width)} {...pan.panHandlers}>
      {!!w && right && (
        <Animated.View pointerEvents="none" style={[st.under, { backgroundColor: right.color, justifyContent: 'flex-end', opacity: glow(1), transform: [{ translateX: Animated.subtract(tx, w) }] }]}>
          <Text style={[st.label, { color: right.ink }]}>{right.label}</Text>
          <MaterialCommunityIcons name={right.icon} size={20} color={right.ink} />
        </Animated.View>
      )}
      {!!w && left && (
        <Animated.View pointerEvents="none" style={[st.under, { backgroundColor: left.color, justifyContent: 'flex-start', opacity: glow(-1), transform: [{ translateX: Animated.add(tx, w) }] }]}>
          <MaterialCommunityIcons name={left.icon} size={20} color={left.ink} />
          <Text style={[st.label, { color: left.ink }]}>{left.label}</Text>
        </Animated.View>
      )}
      <Animated.View style={{ flex: 1, transform: [{ translateX: tx }] }}>{children}</Animated.View>
    </View>
  );
}

const st = StyleSheet.create({
  under: { ...StyleSheet.absoluteFillObject, flexDirection: 'row', alignItems: 'center', gap: 6, paddingHorizontal: 14 },
  label: { fontFamily: F.dot, fontSize: 18, letterSpacing: 2 },
});

export const START_ACTION = { label: 'START', icon: 'chevron-double-right', color: C.live, ink: C.onHot } as const;
