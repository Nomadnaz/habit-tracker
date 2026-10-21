// The SELECT dial (app/workout-select.tsx): sessions in one straight column
// that scrolls through a lit slot near the top. The slotted one is full size;
// the ones below wait smaller and dimmer, the ones passed fade out above.
// Snaps a row at a time with a haptic tick. Slide a session right to start
// it — green START comes up underneath as it goes, and past the line it
// starts; let go short and it springs back. Tapping the slotted one starts it
// too; tapping any other brings it into the slot. The coach's pick (`next`)
// is the green one.

import { useEffect, useMemo, useRef, useState } from 'react';
import { Animated, Pressable, StyleSheet, Text, View, type NativeScrollEvent, type NativeSyntheticEvent, type ScrollView } from 'react-native';
import * as Haptics from 'expo-haptics';
import { C, F } from '@/lib/theme';
import type { DialItem } from '@/lib/workout-dial';
import { START_ACTION, SwipeRow } from '@/components/SwipeRow';

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
        {items.map((it, i) => (
          <Row
            key={it.key}
            it={it}
            i={i}
            y={y}
            on={i === index}
            onPick={onPick}
            onTap={() => {
              if (i === index) { onPick(it); return; }
              void Haptics.selectionAsync();
              list.current?.scrollTo({ y: i * ROW, animated: true });
            }}
          />
        ))}
      </Animated.ScrollView>
    </View>
  );
}

function Row({ it, i, y, on, onPick, onTap }: {
  it: DialItem; i: number; y: Animated.Value; on: boolean;
  onPick: (item: DialItem) => void; onTap: () => void;
}) {
  const r = (k: number) => (i + k) * ROW;
  // y below i·ROW: the row is still to come (below the slot); above: passed.
  const range = [r(-2), r(-1), r(0), r(1)];
  const scale = y.interpolate({ inputRange: range, outputRange: [0.86, 0.9, 1, 0.9], extrapolate: 'clamp' });
  const opacity = y.interpolate({ inputRange: range, outputRange: [0.45, 0.6, 1, 0], extrapolate: 'clamp' });
  const meta = [it.when, `${it.lifts} LIFTS`, it.ready != null ? `${it.ready}% READY` : null].filter(Boolean).join('  ·  ');
  return (
    <SwipeRow style={{ height: ROW }} nudge={i === 0} right={{ ...START_ACTION, leaves: true, onFire: () => onPick(it) }}>
      <Pressable
        accessibilityRole="button"
        accessibilityLabel={`${it.title}${it.next ? ', next' : ''}`}
        accessibilityHint="Slide right to start"
        onPress={onTap}
        style={{ flex: 1, paddingLeft: INSET, paddingRight: 20, justifyContent: 'center' }}
      >
        <Animated.View style={{ opacity, transform: [{ scale }], transformOrigin: 'left center' }}>
          <View style={st.top}>
            <Text style={[st.index, { color: it.next ? C.live : C.faint }]}>{pad2(i + 1)}</Text>
            {it.next && <Text style={st.nextTag}>NEXT</Text>}
            {on && <SwipeHint />}
          </View>
          <Text style={[st.title, { color: it.next ? C.live : on ? C.ink : C.dim }]} numberOfLines={1}>{it.title}</Text>
          <Text style={[st.meta, it.next && { color: C.live, opacity: 0.8 }]} numberOfLines={1}>{meta}</Text>
        </Animated.View>
      </Pressable>
    </SwipeRow>
  );
}

/** SWIPE TO START with three chevrons running left to right. */
function SwipeHint() {
  const t = useRef(new Animated.Value(0)).current;
  useEffect(() => {
    const loop = Animated.loop(Animated.timing(t, { toValue: 3, duration: 1100, useNativeDriver: true }));
    loop.start();
    return () => loop.stop();
  }, []);
  return (
    <View style={st.hint}>
      <Text style={st.hintText}>SWIPE TO START</Text>
      {[0, 1, 2].map(k => (
        <Animated.Text
          key={k}
          style={[st.hintChev, { opacity: t.interpolate({ inputRange: [k, k + 0.5, k + 1], outputRange: [0.25, 1, 0.25], extrapolate: 'clamp' }) }]}
        >
          ›
        </Animated.Text>
      ))}
    </View>
  );
}

const st = StyleSheet.create({
  hint: { flex: 1, flexDirection: 'row', alignItems: 'center', justifyContent: 'flex-end', gap: 1 },
  hintText: { fontFamily: F.mono, fontSize: 9, letterSpacing: 1.5, color: C.dim, marginRight: 4 },
  hintChev: { fontFamily: F.mono, fontSize: 14, lineHeight: 14, color: C.live },
  slot: { position: 'absolute', height: ROW, backgroundColor: 'rgba(116,242,91,0.05)', borderTopWidth: 1, borderBottomWidth: 1, borderColor: 'rgba(116,242,91,0.25)' },
  corner: { position: 'absolute', width: 12, height: 12, borderColor: C.live },
  pointer: { position: 'absolute', width: 0, height: 0, borderTopWidth: 5, borderBottomWidth: 5, borderLeftWidth: 8, borderTopColor: 'transparent', borderBottomColor: 'transparent', borderLeftColor: C.live },
  top: { flexDirection: 'row', alignItems: 'center', gap: 8, marginBottom: 2 },
  index: { fontFamily: F.dot, fontSize: 10, letterSpacing: 1 },
  nextTag: { fontFamily: F.mono, fontSize: 9, letterSpacing: 2, color: C.onHot, backgroundColor: C.live, paddingHorizontal: 5, paddingVertical: 1, overflow: 'hidden' },
  title: { fontFamily: F.dot, fontSize: 26, letterSpacing: 1 },
  meta: { fontFamily: F.mono, fontSize: 10, letterSpacing: 1.5, color: C.dim, marginTop: 3 },
});
