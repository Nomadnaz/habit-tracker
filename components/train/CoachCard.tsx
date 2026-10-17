// TRAIN's TODAY card: what the coach (lib/coach.ts) picked and why — the
// focus, a dot-ring readiness score, the factors behind it as chips, and
// the button into LOG WORKOUT.

import { useEffect, useRef, useState } from 'react';
import { Animated, LayoutAnimation, Pressable, StyleSheet, Text, View } from 'react-native';
import Svg, { Circle } from 'react-native-svg';
import { MaterialCommunityIcons } from '@expo/vector-icons';
import { C, F } from '@/lib/theme';
import { LEVEL, type Factor, type Today } from '@/lib/coach';

const tone = (score: number) => (score >= 70 ? C.live : score >= 45 ? C.ink : C.alert);

/** Readiness as a ring of dots that light up to the score. */
export function DotRing({ score, size = 76 }: { score: number; size?: number }) {
  const N = 36, R = size / 2 - 4;
  const fill = useRef(new Animated.Value(0)).current;
  const [lit, setLit] = useState(0);
  useEffect(() => {
    const id = fill.addListener(({ value }) => setLit(Math.round(value)));
    Animated.timing(fill, { toValue: Math.round((score / 100) * N), duration: 900, useNativeDriver: false }).start();
    return () => fill.removeListener(id);
  }, [score]);
  return (
    <View style={{ width: size, height: size, alignItems: 'center', justifyContent: 'center' }}>
      <Svg width={size} height={size} style={StyleSheet.absoluteFill}>
        {Array.from({ length: N }, (_, i) => {
          const a = -Math.PI / 2 + (i / N) * Math.PI * 2;
          return <Circle key={i} cx={size / 2 + R * Math.cos(a)} cy={size / 2 + R * Math.sin(a)} r={2} fill={i < lit ? tone(score) : C.ghost} />;
        })}
      </Svg>
      <Text style={st.ringNum}>{score}</Text>
    </View>
  );
}

function FactorChip({ f }: { f: Factor }) {
  return (
    <View style={st.factor}>
      <Text style={st.factorLabel}>{f.label}</Text>
      <Text style={st.factorValue}>{f.value}</Text>
      <View style={st.segs}>
        {[0, 1, 2, 3, 4].map(i => (
          <View key={i} style={[st.seg, { backgroundColor: f.score > i * 20 ? tone(f.score) : C.ghost }]} />
        ))}
      </View>
    </View>
  );
}

export function CoachCard({ today, lifts, resting, onStart, onConnect }: {
  today: Today; lifts: number;
  /** Lifts in the session sitting this one out for a tired muscle. */
  resting: { name: string; muscle: string; pct: number }[];
  onStart: () => void; onConnect: () => void;
}) {
  const [why, setWhy] = useState(false);
  const r = today.readiness;
  const lvl = LEVEL[r.level];
  const offDay = !today.scheduled || today.done;
  const onlyLoad = r.factors.length === 1;

  return (
    <View style={st.card}>
      <View style={st.head}>
        <View style={{ flex: 1 }}>
          <View style={st.eyebrowRow}>
            <View style={[st.dot, { backgroundColor: offDay ? C.faint : C.live }]} />
            <Text style={st.eyebrow}>{today.done ? 'DONE TODAY · UP NEXT' : offDay ? `REST DAY · NEXT ${today.when}` : 'TODAY'}</Text>
          </View>
          <Text style={st.title} numberOfLines={1} adjustsFontSizeToFit minimumFontScale={0.7}>{today.title}</Text>
          <Text style={st.meta}>{`${lifts} LIFTS · ${today.fresh}% FRESH${today.setDelta ? ' · ONE SET LESS' : ''}`}</Text>
        </View>
        <Pressable onPress={() => { LayoutAnimation.easeInEaseOut(); setWhy(w => !w); }} style={st.ringWrap} hitSlop={6}>
          <DotRing score={r.score} />
          <Text style={[st.level, { color: tone(r.score) }]}>{lvl.word}</Text>
        </Pressable>
      </View>

      {today.reasons.map((x, i) => (
        <View key={i} style={st.reason}>
          <MaterialCommunityIcons name={today.swapped && i === 0 ? 'swap-horizontal' : 'chevron-right'} size={14} color={C.dim} style={st.reasonMark} />
          <Text style={st.reasonText}>{x}</Text>
        </View>
      ))}

      {resting.length > 0 && (
        <View style={st.resting}>
          <MaterialCommunityIcons name="sleep" size={14} color={C.alert} />
          <Text style={st.restingText}>
            {`RESTING  ${resting.map(r => r.name).join(', ')} — ${[...new Set(resting.map(r => `${r.muscle} ${r.pct}%`))].join(', ')}`}
          </Text>
        </View>
      )}

      <View style={st.factors}>{r.factors.map(f => <FactorChip key={f.id} f={f} />)}</View>

      {why && (
        <View style={st.why}>
          {r.factors.map(f => <Text key={f.id} style={st.whyText}>{`${f.label}  ${f.note}`}</Text>)}
          <Text style={st.whyText}>{lvl.dose}</Text>
        </View>
      )}
      {r.flags.filter(x => !/wearable/.test(x)).map((x, i) => <Text key={i} style={st.flag}>{x}</Text>)}

      {onlyLoad && (
        <Pressable onPress={onConnect} style={({ pressed }) => [st.connect, pressed && { opacity: 0.7 }]}>
          <MaterialCommunityIcons name="watch-variant" size={15} color={C.ink} />
          <Text style={st.connectText}>CONNECT A WEARABLE FOR HRV + SLEEP</Text>
          <MaterialCommunityIcons name="chevron-right" size={16} color={C.dim} />
        </Pressable>
      )}

      <Pressable onPress={onStart} style={({ pressed }) => [st.start, offDay && st.startGhost, pressed && { opacity: 0.8 }]}>
        <Text style={[st.startText, offDay && { color: C.ink }]}>{offDay ? `PREVIEW ${today.title}` : `START ${today.title}`}</Text>
        <MaterialCommunityIcons name="arrow-right" size={18} color={offDay ? C.ink : C.onHot} />
      </Pressable>
    </View>
  );
}

const st = StyleSheet.create({
  card: { marginHorizontal: 16, marginBottom: 18, backgroundColor: C.surface, borderRadius: 22, borderWidth: 1, borderColor: C.line, padding: 16, gap: 10 },
  head: { flexDirection: 'row', alignItems: 'center', gap: 12 },
  eyebrowRow: { flexDirection: 'row', alignItems: 'center', gap: 6 },
  dot: { width: 6, height: 6, borderRadius: 3 },
  eyebrow: { fontFamily: F.dot, fontSize: 9, color: C.dim, letterSpacing: 2 },
  title: { fontFamily: F.dot, fontSize: 34, color: C.hot, letterSpacing: 1, marginTop: 4 },
  meta: { fontFamily: F.mono, fontSize: 11, color: C.dim, letterSpacing: 1, marginTop: 2 },
  ringWrap: { alignItems: 'center', gap: 4 },
  ringNum: { fontFamily: F.dot, fontSize: 22, color: C.hot },
  level: { fontFamily: F.dot, fontSize: 8, letterSpacing: 1.5 },
  reason: { flexDirection: 'row', gap: 8 },
  reasonMark: { width: 14, marginTop: 1 },
  reasonText: { flex: 1, fontFamily: F.mono, fontSize: 12, color: C.ink, lineHeight: 16 },
  factors: { flexDirection: 'row', gap: 6 },
  resting: { flexDirection: 'row', gap: 8, borderWidth: 1, borderColor: C.line, borderRadius: 12, padding: 10 },
  restingText: { flex: 1, fontFamily: F.mono, fontSize: 11, color: C.dim, lineHeight: 15 },
  factor: { flex: 1, borderWidth: 1, borderColor: C.line, borderRadius: 12, paddingVertical: 8, paddingHorizontal: 8, gap: 3, backgroundColor: C.bg },
  factorLabel: { fontFamily: F.dot, fontSize: 7, color: C.dim, letterSpacing: 1 },
  factorValue: { fontFamily: F.dot, fontSize: 15, color: C.ink },
  segs: { flexDirection: 'row', gap: 2, marginTop: 2 },
  seg: { flex: 1, height: 3, borderRadius: 1 },
  why: { gap: 4, paddingTop: 2 },
  whyText: { fontFamily: F.mono, fontSize: 11, color: C.dim, lineHeight: 15 },
  flag: { fontFamily: F.mono, fontSize: 11, color: C.alert, lineHeight: 15 },
  connect: { flexDirection: 'row', alignItems: 'center', gap: 8, borderWidth: 1, borderColor: C.lineHi, borderStyle: 'dashed', borderRadius: 12, paddingHorizontal: 12, paddingVertical: 10 },
  connectText: { flex: 1, fontFamily: F.dot, fontSize: 9, color: C.ink, letterSpacing: 1.5 },
  start: { flexDirection: 'row', alignItems: 'center', justifyContent: 'center', gap: 10, backgroundColor: C.hot, borderRadius: 14, paddingVertical: 15, marginTop: 2 },
  startGhost: { backgroundColor: 'transparent', borderWidth: 1, borderColor: C.lineHi },
  startText: { fontFamily: F.dot, fontSize: 12, color: C.onHot, letterSpacing: 2 },
});
