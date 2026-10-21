// A card you swipe open to a tray of buttons, either way: swipe left and the
// tray slides in on the right, swipe right and it comes in on the left. Past
// half the tray (or a flick) it stays open; tap a button and it fires and
// closes; tap the card or swipe back to close. One open at a time.

import { useEffect, useMemo, useRef, useState, type ReactNode } from 'react';
import { Animated, PanResponder, Pressable, StyleSheet, Text, View, type StyleProp, type ViewStyle } from 'react-native';
import { MaterialCommunityIcons } from '@expo/vector-icons';
import * as Haptics from 'expo-haptics';
import { F } from '@/lib/theme';

export type TrayAction = {
  key: string;
  label: string;
  icon: keyof typeof MaterialCommunityIcons.glyphMap;
  color: string;
  ink: string;
  onPress: () => void;
};

const BTN = 74;
/** Closes whichever card is open when another opens. */
const openers = new Set<() => void>();

export function SwipeActions({ actions, nudge, style, children }: {
  actions: TrayAction[];
  /** Peek the tray open once after mounting, to show it's there. */
  nudge?: boolean;
  style?: StyleProp<ViewStyle>;
  children: ReactNode;
}) {
  const [w, setW] = useState(0);
  const [open, setOpen] = useState<0 | 1 | -1>(0);
  const tx = useRef(new Animated.Value(0)).current;
  const at = useRef(0);   // tx at rest: 0, or ±tray
  const tray = actions.length * BTN;

  const snap = (to: 0 | 1 | -1) => {
    at.current = to * tray;
    setOpen(to);
    Animated.spring(tx, { toValue: at.current, friction: 8, tension: 90, useNativeDriver: true }).start();
  };
  const close = useRef(() => snap(0));
  close.current = () => snap(0);

  const self = useRef(() => close.current()).current;
  useEffect(() => {
    openers.add(self);
    return () => { openers.delete(self); };
  }, []);

  const pan = useMemo(() => PanResponder.create({
    onMoveShouldSetPanResponder: (_, g) => tray > 0 && Math.abs(g.dx) > 10 && Math.abs(g.dx) > Math.abs(g.dy) * 1.5,
    onPanResponderGrant: () => { tx.stopAnimation(); },
    onPanResponderMove: (_, g) => {
      const v = at.current + g.dx;
      const a = Math.abs(v);
      tx.setValue(Math.sign(v) * (a <= tray ? a : tray + (a - tray) * 0.3));
    },
    onPanResponderRelease: (_, g) => {
      const v = at.current + g.dx;
      const flick = Math.abs(g.vx) > 0.6 ? Math.sign(g.vx) : 0;
      // A flick toward the middle closes; a flick or half a tray outward opens that side.
      let to: 0 | 1 | -1 = Math.abs(v) > tray / 2 ? (Math.sign(v) as 1 | -1) : 0;
      if (flick && Math.sign(v) === flick && Math.abs(v) > 20) to = flick as 1 | -1;
      if (flick && at.current !== 0 && Math.sign(at.current) !== flick) to = 0;
      if (to !== 0) {
        for (const fn of openers) if (fn !== self) fn();
        void Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Light);
      }
      snap(to);
    },
    onPanResponderTerminate: () => snap(at.current === 0 ? 0 : (Math.sign(at.current) as 1 | -1)),
    onPanResponderTerminationRequest: () => false,
  }), [tray]);

  useEffect(() => {
    if (!nudge) return;
    const t = setTimeout(() => {
      Animated.sequence([
        Animated.timing(tx, { toValue: -BTN * 0.9, duration: 280, useNativeDriver: true }),
        Animated.delay(250),
        Animated.spring(tx, { toValue: 0, friction: 6, tension: 80, useNativeDriver: true }),
      ]).start();
    }, 900);
    return () => clearTimeout(t);
  }, [nudge]);

  const fire = (a: TrayAction) => {
    void Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Medium);
    snap(0);
    a.onPress();
  };

  const buttons = (
    <>
      {actions.map(a => (
        <Pressable key={a.key} onPress={() => fire(a)} accessibilityRole="button" accessibilityLabel={a.label}
          style={({ pressed }) => [st.btn, { backgroundColor: a.color }, pressed && { opacity: 0.8 }]}>
          <MaterialCommunityIcons name={a.icon} size={20} color={a.ink} />
          <Text style={[st.btnText, { color: a.ink }]} numberOfLines={1}>{a.label}</Text>
        </Pressable>
      ))}
    </>
  );

  return (
    <View style={[{ overflow: 'hidden' }, style]} onLayout={e => setW(e.nativeEvent.layout.width)} {...pan.panHandlers}>
      {!!w && (
        <>
          {/* Each tray rides against the card's edge, so the two never overlap. */}
          <Animated.View style={[st.tray, { width: tray, left: 0, transform: [{ translateX: Animated.add(tx, w) }] }]}>{buttons}</Animated.View>
          <Animated.View style={[st.tray, { width: tray, left: 0, transform: [{ translateX: Animated.subtract(tx, tray) }] }]}>{buttons}</Animated.View>
        </>
      )}
      <Animated.View style={{ flex: 1, transform: [{ translateX: tx }] }}>
        {children}
        {open !== 0 && <Pressable style={StyleSheet.absoluteFill} onPress={() => snap(0)} accessibilityLabel="Close actions" />}
      </Animated.View>
    </View>
  );
}

const st = StyleSheet.create({
  tray: { position: 'absolute', top: 0, bottom: 0, flexDirection: 'row' },
  btn: { width: BTN, alignItems: 'center', justifyContent: 'center', gap: 6 },
  btnText: { fontFamily: F.dot, fontSize: 9, letterSpacing: 1.2 },
});
