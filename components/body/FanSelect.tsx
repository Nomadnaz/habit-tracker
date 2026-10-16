// FanSelect — a one-pill dropdown for the BODY tab. The pill shows what's
// picked; tap it and the other options burst out of it to the right as
// round bubbles, each springing into place a beat after the last. Tap a
// bubble to pick it (they fly back in), or the pill to fold them away.

import { useEffect, useRef, useState } from 'react';
import { Animated, Pressable, ScrollView, StyleSheet, Text, View } from 'react-native';
import { MaterialCommunityIcons } from '@expo/vector-icons';
import * as Haptics from 'expo-haptics';
import { C, F } from '@/lib/theme';

export type FanOption<T extends string> = {
  id: T;
  label: string;
  /** The bubble's colour: a filled swatch, or the icon's colour. */
  color: string;
  icon?: keyof typeof MaterialCommunityIcons.glyphMap;
};

const BUBBLE = 46;
const STEP = 58;        // bubble pitch
const STAGGER = 45;     // ms between bubbles

export function FanSelect<T extends string>({ eyebrow, options, value, onChange }: {
  eyebrow: string;
  options: FanOption<T>[];
  value: T;
  onChange: (id: T) => void;
}) {
  const [open, setOpen] = useState(false);
  const [pillW, setPillW] = useState(120);
  const others = options.filter(o => o.id !== value);
  const anims = useRef<Animated.Value[]>([]).current;
  while (anims.length < options.length) anims.push(new Animated.Value(0));
  const chevron = useRef(new Animated.Value(0)).current;

  useEffect(() => {
    Animated.parallel([
      Animated.timing(chevron, { toValue: open ? 1 : 0, duration: 180, useNativeDriver: true }),
      Animated.stagger(open ? STAGGER : STAGGER / 2, (open ? others : [...others].reverse()).map((_, k) => {
        const i = open ? k : others.length - 1 - k;
        return Animated.spring(anims[i], {
          toValue: open ? 1 : 0, useNativeDriver: true,
          ...(open ? { speed: 16, bounciness: 9 } : { speed: 28, bounciness: 0 }),
        });
      })),
    ]).start();
  }, [open, value]);

  const cur = options.find(o => o.id === value) ?? options[0];
  const pick = (id: T) => { Haptics.selectionAsync(); onChange(id); setOpen(false); };

  return (
    <View style={st.wrap}>
      <Text style={st.eyebrow}>{eyebrow}</Text>
      <ScrollView horizontal showsHorizontalScrollIndicator={false} scrollEnabled={open}
        contentContainerStyle={[st.row, { width: open ? pillW + 12 + others.length * STEP + 16 : undefined }]}>
        <Pressable onPress={() => { Haptics.selectionAsync(); setOpen(o => !o); }}
          onLayout={e => setPillW(Math.round(e.nativeEvent.layout.width))}
          style={[st.pill, { borderColor: open ? cur.color : C.lineHi }]}>
          <Dot o={cur} size={16} />
          <Text style={st.pillText}>{cur.label}</Text>
          <Animated.View style={{ transform: [{ rotate: chevron.interpolate({ inputRange: [0, 1], outputRange: ['0deg', '-90deg'] }) }] }}>
            <MaterialCommunityIcons name="chevron-down" size={16} color={C.dim} />
          </Animated.View>
        </Pressable>

        {others.map((o, i) => {
          const a = anims[i];
          const x = pillW + 12 + i * STEP;
          return (
            <Animated.View key={o.id} pointerEvents={open ? 'auto' : 'none'}
              style={[st.bubbleSlot, {
                left: x,
                opacity: a.interpolate({ inputRange: [0, 0.3, 1], outputRange: [0, 1, 1] }),
                transform: [
                  // Out of the pill's right edge, overshooting a little into place.
                  { translateX: a.interpolate({ inputRange: [0, 1], outputRange: [-(x - pillW + BUBBLE / 2 + 6), 0] }) },
                  { scale: a.interpolate({ inputRange: [0, 1], outputRange: [0.35, 1] }) },
                ],
              }]}>
              <Pressable onPress={() => pick(o.id)} hitSlop={4} style={st.bubbleHit}>
                <View style={[st.bubble, { borderColor: o.color }]}><Dot o={o} size={o.icon ? 20 : 18} /></View>
                <Text style={st.bubbleText} numberOfLines={1}>{o.label}</Text>
              </Pressable>
            </Animated.View>
          );
        })}
      </ScrollView>
    </View>
  );
}

function Dot<T extends string>({ o, size }: { o: FanOption<T>; size: number }) {
  return o.icon
    ? <MaterialCommunityIcons name={o.icon} size={size} color={o.color} />
    : <View style={{ width: size * 0.6, height: size * 0.6, borderRadius: size, backgroundColor: o.color }} />;
}

const st = StyleSheet.create({
  wrap: { marginTop: 4 },
  eyebrow: { fontFamily: F.dot, fontSize: 9, color: C.faint, letterSpacing: 2, marginLeft: 20, marginBottom: 6 },
  row: { paddingHorizontal: 16, height: BUBBLE + 20, alignItems: 'flex-start' },
  pill: {
    flexDirection: 'row', alignItems: 'center', gap: 8, height: BUBBLE, paddingHorizontal: 16,
    borderRadius: BUBBLE / 2, borderWidth: 1, backgroundColor: C.surface, zIndex: 2,
  },
  pillText: { fontFamily: F.dot, fontSize: 12, color: C.hot, letterSpacing: 1.5 },
  bubbleSlot: { position: 'absolute', top: 0, width: BUBBLE + 12, marginLeft: 16 - 6, alignItems: 'center' },
  bubbleHit: { alignItems: 'center' },
  bubble: {
    width: BUBBLE, height: BUBBLE, borderRadius: BUBBLE / 2, borderWidth: 1.5,
    backgroundColor: C.surface, alignItems: 'center', justifyContent: 'center',
  },
  bubbleText: { fontFamily: F.dot, fontSize: 7, color: C.dim, letterSpacing: 1, marginTop: 4, maxWidth: STEP + 4 },
});
