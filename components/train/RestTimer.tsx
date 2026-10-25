// The rest timer on a lift's card, started from its swipe tray. A green bar
// that drains as the rest counts down, the time left, +30 S and stop. At zero
// it buzzes and reads GO — NEXT SET for a few seconds, then clears itself.
// Counts from the end time, so it stays right if the phone sleeps.

import { useEffect, useRef, useState } from 'react';
import { Animated, Easing, Pressable, StyleSheet, Text, View } from 'react-native';
import { MaterialCommunityIcons } from '@expo/vector-icons';
import * as Haptics from 'expo-haptics';
import { C, F, TNUM } from '@/lib/theme';

export type Rest = { id: string; ends: number; total: number };

/** "2–3 MIN REST" → 120, "90 S REST" → 90, "45–60 S REST" → 45. */
export function restSeconds(rest: string): number {
  const m = rest.match(/(\d+)(?:\s*[–-]\s*\d+)?\s*(MIN|S)\b/);
  if (!m) return 90;
  return parseInt(m[1], 10) * (m[2] === 'MIN' ? 60 : 1);
}

const clock = (s: number) => `${Math.floor(s / 60)}:${String(s % 60).padStart(2, '0')}`;

export function RestTimer({ rest, onAdd, onStop }: { rest: Rest; onAdd: (s: number) => void; onStop: () => void }) {
  const [now, setNow] = useState(Date.now());
  const left = Math.max(0, Math.ceil((rest.ends - now) / 1000));
  const over = left === 0;
  const bar = useRef(new Animated.Value(1)).current;

  useEffect(() => {
    const t = setInterval(() => setNow(Date.now()), 250);
    return () => clearInterval(t);
  }, []);

  // The bar drains to the end time; +30 refills it to the new share.
  useEffect(() => {
    const ms = Math.max(0, rest.ends - Date.now());
    bar.setValue(ms / (rest.total * 1000));
    Animated.timing(bar, { toValue: 0, duration: ms, easing: Easing.linear, useNativeDriver: true }).start();
  }, [rest.ends, rest.total]);

  useEffect(() => {
    if (!over) return;
    void Haptics.notificationAsync(Haptics.NotificationFeedbackType.Success);
    const t = setTimeout(onStop, 4000);
    return () => clearTimeout(t);
  }, [over]);

  return (
    <View style={[st.wrap, over && st.wrapOver]}>
      <Animated.View pointerEvents="none" style={[st.bar, { transform: [{ scaleX: bar }] }]} />
      <MaterialCommunityIcons name={over ? 'arm-flex' : 'timer-sand'} size={14} color={over ? C.onHot : C.live} />
      <Text style={[st.label, over && { color: C.onHot }]}>{over ? 'GO — NEXT SET' : 'REST'}</Text>
      {!over && <Text style={st.time}>{clock(left)}</Text>}
      <View style={{ flex: 1 }} />
      {!over && (
        <Pressable onPress={() => { void Haptics.selectionAsync(); onAdd(30); }} hitSlop={6} style={st.btn}>
          <Text style={st.btnText}>+30 S</Text>
        </Pressable>
      )}
      <Pressable onPress={onStop} hitSlop={8} style={st.btn} accessibilityLabel="Stop timer">
        <MaterialCommunityIcons name="close" size={14} color={over ? C.onHot : C.dim} />
      </Pressable>
    </View>
  );
}

const st = StyleSheet.create({
  wrap: { flexDirection: 'row', alignItems: 'center', gap: 8, height: 36, paddingHorizontal: 12, borderRadius: 12, borderCurve: 'continuous', borderWidth: 1, borderColor: C.live, backgroundColor: C.bg, overflow: 'hidden' },
  wrapOver: { backgroundColor: C.live },
  bar: { ...StyleSheet.absoluteFillObject, backgroundColor: 'rgba(116,242,91,0.16)', transformOrigin: 'left' },
  label: { fontFamily: F.dot, fontSize: 9, color: C.live, letterSpacing: 1.5 },
  time: { fontFamily: F.dot, fontSize: 15, color: C.ink, letterSpacing: 0.5, ...TNUM },
  btn: { height: 26, minWidth: 26, paddingHorizontal: 8, borderRadius: 13, borderWidth: 1, borderColor: C.lineHi, alignItems: 'center', justifyContent: 'center' },
  btnText: { fontFamily: F.dot, fontSize: 8, color: C.ink, letterSpacing: 1 },
});
