// LOG WORKOUT's footer. A battery the width of the screen, one cell per lift,
// that fills green as lifts are ticked off; under it a button you hold to
// complete the whole session — it fills green under your thumb with haptic
// ticks getting firmer, and lets go short springs it back. Done, the same hold
// undoes it. Every completion (the hold, or ticking the last lift) flashes the
// button and pops a check.

import { useEffect, useRef, useState } from 'react';
import { Animated, Easing, Pressable, StyleSheet, Text, View } from 'react-native';
import { MaterialCommunityIcons } from '@expo/vector-icons';
import * as Haptics from 'expo-haptics';
import { C, F, TNUM } from '@/lib/theme';

const HOLD_MS = 1100;

export function SessionBar({ total, ticked, complete, title, cheer, onComplete, onUndo }: {
  total: number;
  ticked: number;
  complete: boolean;
  title: string;
  /** Bumped when the user completes the session — plays the completion. */
  cheer: number;
  onComplete: () => void;
  onUndo: () => void;
}) {
  const fill = useRef(new Animated.Value(complete ? 1 : 0)).current;
  const flash = useRef(new Animated.Value(0)).current;
  const pop = useRef(new Animated.Value(1)).current;
  const run = useRef<Animated.CompositeAnimation | null>(null);
  const ticker = useRef<ReturnType<typeof setInterval> | null>(null);
  const [holding, setHolding] = useState(false);

  const stopTicks = () => { if (ticker.current) clearInterval(ticker.current); ticker.current = null; };
  useEffect(() => stopTicks, []);

  // The fill follows the state when it changes from outside (a tick, a reload).
  useEffect(() => {
    if (holding) return;
    Animated.spring(fill, { toValue: complete ? 1 : 0, friction: 8, tension: 60, useNativeDriver: true }).start();
  }, [complete]);

  useEffect(() => {
    if (!cheer) return;
    void Haptics.notificationAsync(Haptics.NotificationFeedbackType.Success);
    flash.setValue(0.7);
    pop.setValue(0.2);
    Animated.parallel([
      Animated.timing(flash, { toValue: 0, duration: 650, easing: Easing.out(Easing.quad), useNativeDriver: true }),
      Animated.spring(pop, { toValue: 1, friction: 3, tension: 120, useNativeDriver: true }),
    ]).start();
  }, [cheer]);

  const start = () => {
    if (!total) return;
    const to = complete ? 0 : 1;
    setHolding(true);
    let n = 0;
    ticker.current = setInterval(() => {
      n++;
      void Haptics.impactAsync(n < 4 ? Haptics.ImpactFeedbackStyle.Light : n < 8 ? Haptics.ImpactFeedbackStyle.Medium : Haptics.ImpactFeedbackStyle.Heavy);
    }, 110);
    run.current = Animated.timing(fill, { toValue: to, duration: HOLD_MS, easing: Easing.linear, useNativeDriver: true });
    run.current.start(({ finished }) => {
      stopTicks();
      setHolding(false);
      if (!finished) return;
      if (to === 1) onComplete();
      else { void Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Heavy); onUndo(); }
    });
  };
  const release = () => {
    if (!run.current) return;
    run.current.stop();
    run.current = null;
    Animated.spring(fill, { toValue: complete ? 1 : 0, friction: 7, tension: 90, useNativeDriver: true }).start();
  };

  const label = complete ? `${title} COMPLETE` : `COMPLETE ${title}`;
  const hint = !total ? 'ADD A LIFT TO START' : complete ? 'HOLD TO UNDO' : 'HOLD TO MARK THE WHOLE SESSION DONE';

  return (
    <View style={st.wrap}>
      <View style={st.batteryRow}>
        <View style={st.battery}>
          {Array.from({ length: Math.max(total, 1) }, (_, i) => <Cell key={i} on={i < ticked} />)}
        </View>
        <View style={st.nub} />
        <Text style={[st.count, complete && { color: C.live }]}>{`${ticked}/${total}`}</Text>
      </View>

      <Text style={st.hint}>{hint}</Text>
      <Pressable
        onPressIn={start}
        onPressOut={release}
        disabled={!total}
        accessibilityRole="button"
        accessibilityLabel={complete ? `${title} complete. Hold to undo` : `Hold to complete ${title}`}
        style={[st.button, !total && { opacity: 0.4 }]}
      >
        <Animated.View pointerEvents="none" style={[st.fill, { transform: [{ scaleX: fill }] }]} />
        <Animated.View pointerEvents="none" style={[st.flash, { opacity: flash }]} />
        <View style={st.labelRow}>
          {complete
            ? <Animated.View style={{ transform: [{ scale: pop }] }}><MaterialCommunityIcons name="check-circle" size={20} color={C.onHot} /></Animated.View>
            : <MaterialCommunityIcons name="gesture-tap-hold" size={18} color={C.ink} />}
          <Text style={[st.label, complete && { color: C.onHot }]} numberOfLines={1}>{label}</Text>
        </View>
      </Pressable>
    </View>
  );
}

/** One battery cell; pops when it lights. */
function Cell({ on }: { on: boolean }) {
  const s = useRef(new Animated.Value(1)).current;
  const first = useRef(true);
  useEffect(() => {
    if (first.current) { first.current = false; return; }
    if (!on) return;
    s.setValue(1.5);
    Animated.spring(s, { toValue: 1, friction: 4, tension: 160, useNativeDriver: true }).start();
  }, [on]);
  return <Animated.View style={[st.cell, { backgroundColor: on ? C.live : C.ghost, transform: [{ scaleY: s }] }]} />;
}

const st = StyleSheet.create({
  wrap: { gap: 8 },
  batteryRow: { flexDirection: 'row', alignItems: 'center' },
  battery: { flex: 1, flexDirection: 'row', alignItems: 'center', gap: 3, padding: 3, borderWidth: 1, borderColor: C.lineHi, borderRadius: 4, borderCurve: 'continuous' },
  cell: { flex: 1, height: 12 },
  nub: { width: 3, height: 8, backgroundColor: C.lineHi, marginLeft: 1, borderTopRightRadius: 1, borderBottomRightRadius: 1 },
  count: { fontFamily: F.dot, fontSize: 13, color: C.ink, marginLeft: 10, minWidth: 34, textAlign: 'right', ...TNUM },
  hint: { fontFamily: F.mono, fontSize: 10, letterSpacing: 1.5, color: C.dim, textAlign: 'center' },
  button: { height: 54, borderRadius: 16, borderCurve: 'continuous', borderWidth: 1, borderColor: C.live, backgroundColor: C.surface, overflow: 'hidden', justifyContent: 'center' },
  fill: { ...StyleSheet.absoluteFillObject, backgroundColor: C.live, transformOrigin: 'left' },
  flash: { ...StyleSheet.absoluteFillObject, backgroundColor: C.hot },
  labelRow: { flexDirection: 'row', alignItems: 'center', justifyContent: 'center', gap: 10, paddingHorizontal: 16 },
  label: { fontFamily: F.dot, fontSize: 12, color: C.ink, letterSpacing: 2 },
});
