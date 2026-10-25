// ExerciseCard — the pop-up over the GO sheet when you tap an exercise: a
// dot-matrix demo of the movement (components/ExerciseDemo.tsx), sets × reps
// for the muscle's goal, a starting weight (lib/exercise-guide.ts), and a
// button out to YouTube for a full walkthrough. An overlay inside the sheet
// rather than its own Modal, so it never fights the sheet for the screen.

import { useEffect, useRef } from 'react';
import { Animated, Linking, Pressable, StyleSheet, Text, View, useWindowDimensions } from 'react-native';
import { MaterialCommunityIcons } from '@expo/vector-icons';
import { C, F, SPRING, numFace } from '@/lib/theme';
import { ExerciseDemo } from '@/components/ExerciseDemo';
import { PulleyChart, PULLEY_CHART_W } from '@/components/PulleyChart';
import { cableSide } from '@/lib/exercise-demo';
import { findExercise } from '@/lib/exercise-library';
import { videoUrl, type Guide } from '@/lib/exercise-guide';

const BASIS: Record<Guide['basis'], string> = {
  history: 'From your best logged set',
  bodyweight: 'From your bodyweight and height — a weight most people new to it can do cleanly',
  none: '',
};

export function ExerciseCard({ name, role, guide, bodyKg, onClose }: {
  name: string; role: string; guide: Guide; bodyKg: number | null; onClose: () => void;
}) {
  const { width } = useWindowDimensions();
  const pop = useRef(new Animated.Value(0)).current;
  useEffect(() => { Animated.spring(pop, { toValue: 1, ...SPRING.pop }).start(); }, []);
  const close = () => Animated.timing(pop, { toValue: 0, duration: 140, useNativeDriver: true }).start(onClose);

  // Cable moves show which pin the pulley goes on, beside the demo.
  const pulley = guide.equipment === 'cable' ? findExercise(name)?.pulley : undefined;
  const side = pulley != null ? cableSide(guide.pattern, name, pulley) : 'right';
  const demo = Math.min(240, width - 96 - (pulley != null ? PULLEY_CHART_W + 8 : 0));
  const reps = guide.reps[0] === guide.reps[1] ? `${guide.reps[0]}` : `${guide.reps[0]}-${guide.reps[1]}`;
  const start = guide.startKg == null ? 'BODYWEIGHT' : `${guide.startKg}`;
  const note = guide.basis === 'none' && guide.equipment !== 'bodyweight'
    ? bodyKg ? '' : 'Log your weight on BODY to get a starting weight'
    : BASIS[guide.basis];

  return (
    <View style={StyleSheet.absoluteFill}>
      <Animated.View style={[StyleSheet.absoluteFill, st.scrim, { opacity: pop }]}>
        <Pressable style={StyleSheet.absoluteFill} onPress={close} />
      </Animated.View>
      <View style={st.center} pointerEvents="box-none">
        <Animated.View style={[st.card, { opacity: pop, transform: [{ scale: pop.interpolate({ inputRange: [0, 1], outputRange: [0.9, 1] }) }] }]}>
          <View style={st.head}>
            <View style={{ flex: 1 }}>
              <Text style={st.eyebrow}>{role}</Text>
              <Text style={st.title} numberOfLines={2} adjustsFontSizeToFit minimumFontScale={0.7}>{name.toUpperCase()}</Text>
            </View>
            <Pressable onPress={close} hitSlop={10}><MaterialCommunityIcons name="close" size={20} color={C.dim} /></Pressable>
          </View>

          <View style={[st.demo, pulley != null && st.demoCable, side === 'left' && { flexDirection: 'row-reverse' }]}>
            <ExerciseDemo pattern={guide.pattern} equipment={guide.equipment} name={name} size={demo} pulley={pulley} />
            {pulley != null && <PulleyChart pulley={pulley} height={demo} side={side} />}
          </View>

          <View style={st.stats}>
            <View style={st.stat}>
              <Text style={st.statLabel}>SETS X REPS</Text>
              <Text style={[st.statValue, numFace(`${guide.sets}x${reps}`, 20)]}>{`${guide.sets}x${reps}`}</Text>
            </View>
            <View style={[st.stat, st.statRule]}>
              <Text style={st.statLabel}>{guide.perHand ? 'START · EACH HAND' : 'START'}</Text>
              <View style={st.statRow}>
                <Text style={[st.statValue, guide.startKg == null ? { fontFamily: F.dot, fontSize: 14 } : numFace(start, 20)]}>{start}</Text>
                {guide.startKg != null && <Text style={st.unit}>KG</Text>}
              </View>
            </View>
          </View>
          <Text style={st.rest}>{`${guide.rest} · ${guide.tip}`}</Text>
          {!!note && <Text style={st.note}>{note}</Text>}

          <Pressable onPress={() => Linking.openURL(videoUrl(name))} style={({ pressed }) => [st.video, pressed && { opacity: 0.7 }]}>
            <MaterialCommunityIcons name="youtube" size={18} color={C.onHot} />
            <Text style={st.videoText}>IN-DEPTH VIDEO</Text>
            <MaterialCommunityIcons name="arrow-top-right" size={16} color={C.onHot} />
          </Pressable>
        </Animated.View>
      </View>
    </View>
  );
}

const st = StyleSheet.create({
  scrim: { backgroundColor: C.scrim },
  center: { ...StyleSheet.absoluteFillObject, alignItems: 'center', justifyContent: 'center', padding: 20 },
  card: { width: '100%', maxWidth: 420, backgroundColor: C.surface, borderRadius: 22, borderCurve: 'continuous', borderWidth: 1, borderColor: C.lineHi, padding: 18 },
  head: { flexDirection: 'row', alignItems: 'flex-start', gap: 10 },
  eyebrow: { fontFamily: F.dot, fontSize: 9, color: C.live, letterSpacing: 2 },
  title: { fontFamily: F.dot, fontSize: 22, color: C.hot, letterSpacing: 1, marginTop: 4 },
  demo: { alignItems: 'center', marginVertical: 12, paddingVertical: 6, backgroundColor: C.bg, borderRadius: 16, borderCurve: 'continuous' },
  demoCable: { flexDirection: 'row', justifyContent: 'center', gap: 8 },
  stats: { flexDirection: 'row', borderWidth: 1, borderColor: C.line, borderRadius: 14, borderCurve: 'continuous' },
  stat: { flex: 1, padding: 12, gap: 4 },
  statRule: { borderLeftWidth: 1, borderLeftColor: C.line },
  statLabel: { fontFamily: F.dot, fontSize: 8, color: C.dim, letterSpacing: 1.5 },
  statRow: { flexDirection: 'row', alignItems: 'baseline', gap: 5 },
  statValue: { color: C.hot },
  unit: { fontFamily: F.dot, fontSize: 10, color: C.dim, letterSpacing: 1 },
  rest: { fontFamily: F.mono, fontSize: 11, color: C.dim, marginTop: 10 },
  note: { fontFamily: F.mono, fontSize: 11, color: C.faint, marginTop: 4, lineHeight: 15 },
  video: {
    flexDirection: 'row', alignItems: 'center', justifyContent: 'center', gap: 8, marginTop: 16,
    backgroundColor: C.hot, borderRadius: 12, borderCurve: 'continuous', paddingVertical: 13,
  },
  videoText: { fontFamily: F.dot, fontSize: 12, color: C.onHot, letterSpacing: 1.5 },
});
