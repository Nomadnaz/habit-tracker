// The UNDO toast for lib/undo.ts: one line just above the tab bar, with a
// bar that runs down over UNDO_MS. Mounted once at the app root, after the
// chat sheet so it sits above that too. Going to the background lands
// whatever is waiting, so a delete can't be lost when the app is killed.
// A screen that deletes from inside a <Modal> (which covers the root) adds
// a `nested` copy in the modal; the root one still does the announcing.
// Reduced motion: it fades instead of rising, and the bar stays still.
import { useEffect, useRef, useState } from 'react';
import { AccessibilityInfo, Animated, AppState, Easing, Platform, Pressable, StyleSheet, Text, View } from 'react-native';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import * as Haptics from 'expo-haptics';
import { C, F } from '@/lib/theme';
import { UNDO_MS, flushRemovals, undo, useUndoToast, type ShownRemoval } from '@/lib/undo';
import { useReducedMotion } from '@/lib/use-reduced-motion';

export function UndoToast({ nested }: { nested?: boolean }) {
  const r = useUndoToast();
  const reduce = useReducedMotion();
  const insets = useSafeAreaInsets();
  // Keeps the last one on screen while it fades out.
  const [last, setLast] = useState<ShownRemoval | null>(null);
  const [w, setW] = useState(0);
  const a = useRef(new Animated.Value(0)).current;
  const left = useRef(new Animated.Value(1)).current;

  useEffect(() => {
    if (nested) return;
    const sub = AppState.addEventListener('change', s => { if (s === 'background') flushRemovals(); });
    return () => sub.remove();
  }, []);

  useEffect(() => {
    if (r) {
      setLast(r);
      // Android reads the live region; iOS needs telling.
      if (Platform.OS === 'ios' && !nested) AccessibilityInfo.announceForAccessibility(`${r.label}. Undo available.`);
      Animated.timing(a, { toValue: 1, duration: reduce ? 120 : 220, easing: Easing.out(Easing.cubic), useNativeDriver: true }).start();
      left.setValue(1);
      if (!reduce) {
        Animated.timing(left, { toValue: 0, duration: Math.max(0, UNDO_MS - (Date.now() - r.t0)), easing: Easing.linear, useNativeDriver: true }).start();
      }
    } else {
      left.stopAnimation();
      Animated.timing(a, { toValue: 0, duration: reduce ? 100 : 160, useNativeDriver: true }).start(({ finished }) => { if (finished) setLast(null); });
    }
  }, [r]);

  if (!last) return null;
  return (
    <Animated.View
      pointerEvents={r ? 'box-none' : 'none'}
      style={[st.wrap, {
        bottom: insets.bottom + (nested ? 16 : 84),
        opacity: a,
        transform: reduce ? [] : [{ translateY: a.interpolate({ inputRange: [0, 1], outputRange: [14, 0] }) }],
      }]}
    >
      <View style={st.toast} role="status" accessibilityLiveRegion="polite" onLayout={e => setW(e.nativeEvent.layout.width)}>
        <Text style={st.label} numberOfLines={1}>{last.label}</Text>
        <Pressable
          onPress={() => { void Haptics.selectionAsync(); undo(); }}
          hitSlop={{ top: 8, bottom: 8, left: 6, right: 8 }}
          role="button"
          accessibilityLabel={`Undo, ${last.label.toLowerCase()}`}
          style={({ pressed }) => [st.undo, pressed && { opacity: 0.7 }]}
        >
          <Text style={st.undoText}>UNDO</Text>
        </Pressable>
        {!reduce && w > 0 && (
          <View style={st.track} pointerEvents="none">
            <Animated.View style={[st.run, { transform: [{ translateX: left.interpolate({ inputRange: [0, 1], outputRange: [-w, 0] }) }] }]} />
          </View>
        )}
      </View>
    </Animated.View>
  );
}

const st = StyleSheet.create({
  wrap: { position: 'absolute', left: 16, right: 16 },
  toast: {
    flexDirection: 'row', alignItems: 'center', gap: 12, minHeight: 52, paddingLeft: 16, paddingRight: 6,
    backgroundColor: C.raised, borderWidth: 1, borderColor: C.lineHi, borderRadius: 14, overflow: 'hidden',
  },
  label: { flex: 1, fontFamily: F.dot, fontSize: 11, color: C.ink, letterSpacing: 1.5 },
  undo: { height: 40, minWidth: 72, paddingHorizontal: 14, borderRadius: 10, backgroundColor: C.hot, alignItems: 'center', justifyContent: 'center' },
  undoText: { fontFamily: F.dot, fontSize: 11, color: C.onHot, letterSpacing: 2 },
  track: { position: 'absolute', left: 0, right: 0, bottom: 0, height: 2, overflow: 'hidden' },
  run: { height: 2, backgroundColor: C.hot },
});
