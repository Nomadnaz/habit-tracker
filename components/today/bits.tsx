// Small parts the TODAY deck is built from: a segmented meter, a number that
// counts to its new value, a square status pixel, and a bottom sheet.

import { useEffect, useMemo, useRef, useState } from 'react';
import {
  Animated, Easing, KeyboardAvoidingView, Modal, PanResponder, Platform, Pressable, ScrollView, StyleSheet, Text, View, useWindowDimensions,
  type StyleProp, type TextStyle, type ViewStyle,
} from 'react-native';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import { C } from '@/lib/theme';

/** A row of segments filled to `pct` (0–1), sweeping in when it changes. */
export function Segs({ pct, tone, n = 16, h = 6, style }: { pct: number; tone: string; n?: number; h?: number; style?: StyleProp<ViewStyle> }) {
  const fill = useRef(new Animated.Value(0)).current;
  const [w, setW] = useState(0);
  useEffect(() => {
    Animated.timing(fill, { toValue: Math.max(0, Math.min(1, pct)), duration: 900, easing: Easing.out(Easing.cubic), useNativeDriver: false }).start();
  }, [pct]);
  const segs = (color: string) => (
    <View style={[s.segRow, { width: w }]}>
      {Array.from({ length: n }, (_, i) => <View key={i} style={[s.seg, { height: h, backgroundColor: color }]} />)}
    </View>
  );
  return (
    <View style={[{ height: h }, style]} onLayout={e => setW(e.nativeEvent.layout.width)}>
      {w > 0 && segs(C.ghost)}
      {w > 0 && (
        <Animated.View style={[StyleSheet.absoluteFill, { overflow: 'hidden', width: fill.interpolate({ inputRange: [0, 1], outputRange: [0, w] }) }]}>
          {segs(tone)}
        </Animated.View>
      )}
    </View>
  );
}

/** A number that counts from where it was to `value`. */
export function Count({ value, style, format = (n: number) => Math.round(n).toLocaleString('en-US') }: {
  value: number; style?: StyleProp<TextStyle>; format?: (n: number) => string;
}) {
  const a = useRef(new Animated.Value(0)).current;
  const [shown, setShown] = useState(0);
  useEffect(() => {
    const id = a.addListener(({ value: v }) => setShown(v));
    Animated.timing(a, { toValue: value, duration: 800, easing: Easing.out(Easing.cubic), useNativeDriver: false }).start();
    return () => a.removeListener(id);
  }, [value]);
  return <Text style={style}>{format(shown)}</Text>;
}

/** The puck's square pixel: green = there, white = going, grey = idle. Blinks when `blink`. */
export function Pixel({ tone, blink, size = 6 }: { tone: string; blink?: boolean; size?: number }) {
  const o = useRef(new Animated.Value(1)).current;
  useEffect(() => {
    if (!blink) { o.setValue(1); return; }
    const l = Animated.loop(Animated.sequence([
      Animated.timing(o, { toValue: 0.25, duration: 700, useNativeDriver: true }),
      Animated.timing(o, { toValue: 1, duration: 700, useNativeDriver: true }),
    ]));
    l.start();
    return () => l.stop();
  }, [blink]);
  return <Animated.View style={{ width: size, height: size, backgroundColor: tone, opacity: o }} />;
}

/** Springs up from the bottom; drag it down, tap outside or call onClose to dismiss. */
export function Sheet({ visible, onClose, children }: { visible: boolean; onClose: () => void; children: React.ReactNode }) {
  const { height } = useWindowDimensions();
  const insets = useSafeAreaInsets();
  const y = useRef(new Animated.Value(height)).current;
  const fade = useRef(new Animated.Value(0)).current;
  const [mounted, setMounted] = useState(visible);

  useEffect(() => {
    if (visible) {
      setMounted(true);
      y.setValue(height);
      Animated.parallel([
        Animated.spring(y, { toValue: 0, friction: 9, tension: 80, useNativeDriver: true }),
        Animated.timing(fade, { toValue: 1, duration: 220, useNativeDriver: true }),
      ]).start();
    } else if (mounted) {
      Animated.parallel([
        Animated.timing(y, { toValue: height, duration: 220, useNativeDriver: true }),
        Animated.timing(fade, { toValue: 0, duration: 200, useNativeDriver: true }),
      ]).start(() => setMounted(false));
    }
  }, [visible]);

  const pan = useMemo(() => PanResponder.create({
    onMoveShouldSetPanResponder: (_, g) => g.dy > 6 && Math.abs(g.dy) > Math.abs(g.dx),
    onPanResponderMove: (_, g) => y.setValue(Math.max(0, g.dy)),
    onPanResponderRelease: (_, g) => {
      if (g.dy > 110 || g.vy > 0.8) onClose();
      else Animated.spring(y, { toValue: 0, friction: 7, tension: 120, useNativeDriver: true }).start();
    },
  }), [onClose]);

  if (!mounted) return null;
  return (
    <Modal visible transparent animationType="none" onRequestClose={onClose} statusBarTranslucent>
      {/* One wrapper type throughout — swapping View ↔ KeyboardAvoidingView mid-spring leaves the sheet low. */}
      <KeyboardAvoidingView style={s.wrap} behavior={Platform.OS === 'ios' ? 'padding' : undefined}>
        <Animated.View style={[StyleSheet.absoluteFill, { backgroundColor: C.scrim, opacity: fade }]}>
          <Pressable style={{ flex: 1 }} onPress={onClose} />
        </Animated.View>
        <Animated.View style={[s.sheet, { maxHeight: height * 0.88, paddingBottom: Math.max(18, insets.bottom + 10), transform: [{ translateY: y }] }]}>
          <View {...pan.panHandlers} style={s.grab}><View style={s.grabBar} /></View>
          <ScrollView showsVerticalScrollIndicator={false} keyboardShouldPersistTaps="handled" bounces={false}>{children}</ScrollView>
        </Animated.View>
      </KeyboardAvoidingView>
    </Modal>
  );
}

const s = StyleSheet.create({
  segRow: { flexDirection: 'row', gap: 2, height: '100%' },
  seg: { flex: 1, borderRadius: 1 },
  wrap: { flex: 1, justifyContent: 'flex-end' },
  sheet: { backgroundColor: C.surface, borderTopLeftRadius: 26, borderTopRightRadius: 26, borderWidth: 1, borderBottomWidth: 0, borderColor: C.lineHi, paddingHorizontal: 18 },
  grab: { paddingTop: 10, paddingBottom: 12, alignItems: 'center' },
  grabBar: { width: 38, height: 4, borderRadius: 2, backgroundColor: C.lineHi },
});
