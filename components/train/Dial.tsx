// The SELECT dial (app/workout-select.tsx): sessions on a drum that turns
// past a lit slot near the top. Lower rows tilt back, shrink, fade and swing
// out along an arc; a tick wheel on the left turns with it, one big tick per
// session. Snaps a row at a time with a haptic tick. Tap the slotted session
// to start it; tap any other to turn it into the slot. The coach's pick
// (`next`) is the green one.

import { useMemo, useRef, useState } from 'react';
import { Animated, Pressable, StyleSheet, Text, View, type NativeScrollEvent, type NativeSyntheticEvent, type ScrollView } from 'react-native';
import Svg, { Defs, Line, Pattern, Rect } from 'react-native-svg';
import * as Haptics from 'expo-haptics';
import { C, F } from '@/lib/theme';
import type { DialItem } from '@/lib/workout-dial';

export const ROW = 78;
const SLOT = 18;            // the lit slot's top, inside the dial
const GUTTER = 46;          // room for the wheel
const DEG_PER_ROW = 9;
const pad2 = (n: number) => String(n).padStart(2, '0');

export function Dial({ items, width, height, onFocus, onPick }: {
  items: DialItem[];
  width: number;
  height: number;
  onFocus: (index: number) => void;
  onPick: (item: DialItem) => void;
}) {
  const y = useRef(new Animated.Value(0)).current;
  const list = useRef<ScrollView>(null);
  const at = useRef(0);
  const [index, setIndex] = useState(0);

  const onScroll = useMemo(() => Animated.event([{ nativeEvent: { contentOffset: { y } } }], {
    useNativeDriver: true,
    listener: (e: NativeSyntheticEvent<NativeScrollEvent>) => {
      const i = Math.max(0, Math.min(items.length - 1, Math.round(e.nativeEvent.contentOffset.y / ROW)));
      if (i === at.current) return;
      at.current = i;
      setIndex(i);
      onFocus(i);
      void Haptics.selectionAsync();
    },
  }), [items.length, onFocus]);

  // The wheel: big enough that only a sliver of its rim shows.
  const R = Math.max(height, 320);
  const wheel = useMemo(() => {
    const ticks = [];
    for (let deg = 0; deg < 360; deg += DEG_PER_ROW / 3) {
      const major = Math.round(deg / (DEG_PER_ROW / 3)) % 3 === 0;
      const a = (deg * Math.PI) / 180, len = major ? 14 : 6;
      ticks.push(
        <Line key={deg} x1={R + Math.cos(a) * (R - 2)} y1={R + Math.sin(a) * (R - 2)} x2={R + Math.cos(a) * (R - 2 - len)} y2={R + Math.sin(a) * (R - 2 - len)}
          stroke={major ? C.dim : C.faint} strokeWidth={major ? 1.5 : 1} />,
      );
    }
    return ticks;
  }, [R]);
  const spin = y.interpolate({ inputRange: [0, ROW], outputRange: ['0deg', `-${DEG_PER_ROW}deg`], extrapolate: 'extend' });

  return (
    <View style={{ width, height, overflow: 'hidden' }}>
      {/* tick wheel, centred on the slot */}
      <Animated.View pointerEvents="none" style={{
        position: 'absolute', width: R * 2, height: R * 2, left: GUTTER - 14 - R * 2, top: SLOT + ROW / 2 - R,
        transform: [{ rotate: spin }],
      }}>
        <Svg width={R * 2} height={R * 2}>{wheel}</Svg>
      </Animated.View>

      {/* the lit slot */}
      <View pointerEvents="none" style={[st.slot, { top: SLOT, left: GUTTER - 8, right: 8 }]}>
        <View style={[st.corner, { left: 0, top: 0, borderLeftWidth: 2, borderTopWidth: 2 }]} />
        <View style={[st.corner, { right: 0, top: 0, borderRightWidth: 2, borderTopWidth: 2 }]} />
        <View style={[st.corner, { left: 0, bottom: 0, borderLeftWidth: 2, borderBottomWidth: 2 }]} />
        <View style={[st.corner, { right: 0, bottom: 0, borderRightWidth: 2, borderBottomWidth: 2 }]} />
      </View>
      <View pointerEvents="none" style={[st.pointer, { top: SLOT + ROW / 2 - 5, left: GUTTER - 12 }]} />

      <Animated.ScrollView
        ref={list}
        onScroll={onScroll}
        scrollEventThrottle={16}
        snapToInterval={ROW}
        decelerationRate="fast"
        showsVerticalScrollIndicator={false}
        contentContainerStyle={{ paddingTop: SLOT, paddingBottom: Math.max(0, height - SLOT - ROW) }}
      >
        {items.map((it, i) => {
          const r = (k: number) => (i + k) * ROW;
          // y below i·ROW: the row is still to come (below the slot); above: passed.
          const range = [r(-3), r(-2), r(-1), r(0), r(1), r(2)];
          const scale = y.interpolate({ inputRange: range, outputRange: [0.7, 0.76, 0.86, 1, 0.8, 0.7], extrapolate: 'clamp' });
          const opacity = y.interpolate({ inputRange: range, outputRange: [0.26, 0.42, 0.64, 1, 0.22, 0], extrapolate: 'clamp' });
          const shift = y.interpolate({ inputRange: range, outputRange: [70, 38, 13, 0, 16, 44], extrapolate: 'clamp' });
          const tilt = y.interpolate({ inputRange: range, outputRange: ['-38deg', '-26deg', '-13deg', '0deg', '22deg', '40deg'], extrapolate: 'clamp' });
          const on = i === index;
          const ink = it.next ? C.live : C.ink;
          const meta = [it.when, `${it.lifts} LIFTS`, it.ready != null ? `${it.ready}% READY` : null].filter(Boolean).join('  ·  ');
          return (
            <Pressable
              key={it.key}
              accessibilityRole="button"
              accessibilityLabel={`${it.title}${it.next ? ', next' : ''}`}
              onPress={() => (on ? onPick(it) : list.current?.scrollTo({ y: i * ROW, animated: true }))}
              style={{ height: ROW, paddingLeft: GUTTER + 6, paddingRight: 16, justifyContent: 'center' }}
            >
              <Animated.View style={{ opacity, transform: [{ perspective: 700 }, { translateX: shift }, { rotateX: tilt }, { scale }] }}>
                <View style={st.top}>
                  <Text style={[st.index, { color: it.next ? C.live : C.faint }]}>{pad2(i + 1)}</Text>
                  {it.next && <Text style={st.nextTag}>NEXT</Text>}
                  {on && !it.next && <Text style={st.selTag}>SEL</Text>}
                </View>
                <Text style={[st.title, { color: ink }]} numberOfLines={1}>{it.title}</Text>
                <Text style={[st.meta, it.next && { color: C.live, opacity: 0.8 }]} numberOfLines={1}>{meta}</Text>
              </Animated.View>
            </Pressable>
          );
        })}
      </Animated.ScrollView>

      {/* scanlines */}
      <Svg pointerEvents="none" width={width} height={height} style={StyleSheet.absoluteFill}>
        <Defs>
          <Pattern id="scan" width={4} height={3} patternUnits="userSpaceOnUse">
            <Rect width={4} height={1} fill={C.hot} opacity={0.035} />
          </Pattern>
        </Defs>
        <Rect width={width} height={height} fill="url(#scan)" />
      </Svg>
    </View>
  );
}

const st = StyleSheet.create({
  slot: { position: 'absolute', height: ROW, backgroundColor: 'rgba(116,242,91,0.05)', borderTopWidth: 1, borderBottomWidth: 1, borderColor: 'rgba(116,242,91,0.25)' },
  corner: { position: 'absolute', width: 12, height: 12, borderColor: C.live },
  pointer: { position: 'absolute', width: 0, height: 0, borderTopWidth: 5, borderBottomWidth: 5, borderLeftWidth: 8, borderTopColor: 'transparent', borderBottomColor: 'transparent', borderLeftColor: C.live },
  top: { flexDirection: 'row', alignItems: 'center', gap: 8, marginBottom: 2 },
  index: { fontFamily: F.dot, fontSize: 10, letterSpacing: 1 },
  nextTag: { fontFamily: F.mono, fontSize: 9, letterSpacing: 2, color: C.onHot, backgroundColor: C.live, paddingHorizontal: 5, paddingVertical: 1, overflow: 'hidden' },
  selTag: { fontFamily: F.mono, fontSize: 9, letterSpacing: 2, color: C.dim, borderWidth: 1, borderColor: C.lineHi, paddingHorizontal: 4 },
  title: { fontFamily: F.dot, fontSize: 26, letterSpacing: 1 },
  meta: { fontFamily: F.mono, fontSize: 10, letterSpacing: 1.5, color: C.dim, marginTop: 3 },
});
