// The SELECT dial (app/workout-select.tsx): sessions in one straight column
// that scrolls through a lit slot near the top. The slotted one is full size;
// the ones below wait smaller and dimmer, the ones passed fade out above.
// Snaps a row at a time with a haptic tick. Tap the slotted session to start
// it; tap any other to bring it into the slot. The coach's pick (`next`) is
// the green one.

import { useMemo, useRef, useState } from 'react';
import { Animated, Pressable, StyleSheet, Text, View, type NativeScrollEvent, type NativeSyntheticEvent, type ScrollView } from 'react-native';
import * as Haptics from 'expo-haptics';
import { C, F } from '@/lib/theme';
import type { DialItem } from '@/lib/workout-dial';

export const ROW = 78;
const SLOT = 18;            // the lit slot's top, inside the dial
const INSET = 34;           // the rows' left edge, clear of the slot's pointer
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

  return (
    <View style={{ width, height, overflow: 'hidden' }}>
      {/* the lit slot — behind the list, so it never takes a touch */}
      <View pointerEvents="none" style={[st.slot, { top: SLOT, left: INSET - 12, right: 8 }]}>
        <View style={[st.corner, { left: 0, top: 0, borderLeftWidth: 2, borderTopWidth: 2 }]} />
        <View style={[st.corner, { right: 0, top: 0, borderRightWidth: 2, borderTopWidth: 2 }]} />
        <View style={[st.corner, { left: 0, bottom: 0, borderLeftWidth: 2, borderBottomWidth: 2 }]} />
        <View style={[st.corner, { right: 0, bottom: 0, borderRightWidth: 2, borderBottomWidth: 2 }]} />
      </View>
      <View pointerEvents="none" style={[st.pointer, { top: SLOT + ROW / 2 - 5, left: 8 }]} />

      <Animated.ScrollView
        ref={list}
        style={StyleSheet.absoluteFill}
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
          const range = [r(-2), r(-1), r(0), r(1)];
          const scale = y.interpolate({ inputRange: range, outputRange: [0.86, 0.9, 1, 0.9], extrapolate: 'clamp' });
          const opacity = y.interpolate({ inputRange: range, outputRange: [0.45, 0.6, 1, 0], extrapolate: 'clamp' });
          const on = i === index;
          const meta = [it.when, `${it.lifts} LIFTS`, it.ready != null ? `${it.ready}% READY` : null].filter(Boolean).join('  ·  ');
          return (
            <Pressable
              key={it.key}
              accessibilityRole="button"
              accessibilityLabel={`${it.title}${it.next ? ', next' : ''}`}
              onPress={() => {
                if (on) { onPick(it); return; }
                void Haptics.selectionAsync();
                list.current?.scrollTo({ y: i * ROW, animated: true });
              }}
              style={{ height: ROW, paddingLeft: INSET, paddingRight: 20, justifyContent: 'center' }}
            >
              <Animated.View style={{ opacity, transform: [{ scale }], transformOrigin: 'left center' }}>
                <View style={st.top}>
                  <Text style={[st.index, { color: it.next ? C.live : C.faint }]}>{pad2(i + 1)}</Text>
                  {it.next && <Text style={st.nextTag}>NEXT</Text>}
                </View>
                <Text style={[st.title, { color: it.next ? C.live : on ? C.ink : C.dim }]} numberOfLines={1}>{it.title}</Text>
                <Text style={[st.meta, it.next && { color: C.live, opacity: 0.8 }]} numberOfLines={1}>{meta}</Text>
              </Animated.View>
            </Pressable>
          );
        })}
      </Animated.ScrollView>
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
  title: { fontFamily: F.dot, fontSize: 26, letterSpacing: 1 },
  meta: { fontFamily: F.mono, fontSize: 10, letterSpacing: 1.5, color: C.dim, marginTop: 3 },
});
