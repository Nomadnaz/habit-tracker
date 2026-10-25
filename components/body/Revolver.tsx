// The module picker on BODY's edit panel: a revolver, like SELECT's dial
// (components/train/Dial.tsx) turned into a drum. Modules sit round a
// cylinder that turns through a lit slot in the middle; the slotted one is
// full size and lit in its own colour, the rest tilt away, shrink and fade.
// Snaps a row at a time with a haptic tick. Tap the slotted one to pick it;
// tap any other to turn it into the slot.

import { useEffect, useMemo, useRef, useState } from 'react';
import { Animated, Pressable, StyleSheet, Text, View, type NativeScrollEvent, type NativeSyntheticEvent, type ScrollView } from 'react-native';
import * as Haptics from 'expo-haptics';
import { C, F, numFace } from '@/lib/theme';
import type { HudModule } from '@/lib/body-hud';
import { DotIcon } from '@/components/today/DotIcon';

export type RevolverItem = { key: HudModule; word: string; tone: string; meta: string; value: string };

const ROW = 52;
const pad2 = (n: number) => String(n).padStart(2, '0');

export function Revolver({ items, height, picked, onPick }: {
  items: RevolverItem[];
  height: number;
  /** Already chosen — its row shows a check. */
  picked: HudModule | null;
  onPick: (key: HudModule) => void;
}) {
  const y = useRef(new Animated.Value(0)).current;
  const list = useRef<ScrollView>(null);
  const at = useRef(0);
  const [index, setIndex] = useState(0);
  const slot = Math.round((height - ROW) / 2);

  // A shorter list (a module placed) must not leave the drum past its end.
  useEffect(() => {
    if (index < items.length) return;
    const i = Math.max(0, items.length - 1);
    at.current = i;
    setIndex(i);
    list.current?.scrollTo({ y: i * ROW, animated: false });
  }, [items.length]);

  const onScroll = useMemo(() => Animated.event([{ nativeEvent: { contentOffset: { y } } }], {
    useNativeDriver: true,
    listener: (e: NativeSyntheticEvent<NativeScrollEvent>) => {
      const i = Math.max(0, Math.min(items.length - 1, Math.round(e.nativeEvent.contentOffset.y / ROW)));
      if (i === at.current) return;
      at.current = i;
      setIndex(i);
      void Haptics.selectionAsync();
    },
  }), [items.length]);

  const tone = items[index]?.tone ?? C.hot;
  return (
    <View style={{ height, overflow: 'hidden' }}>
      {/* the lit slot — behind the list, so it never takes a touch */}
      <View pointerEvents="none" style={[st.slot, { top: slot, borderColor: `${tone}40`, backgroundColor: `${tone}0D` }]}>
        {(['tl', 'tr', 'bl', 'br'] as const).map(k => (
          <View key={k} style={[st.corner, { borderColor: tone }, CORNER[k]]} />
        ))}
      </View>
      <View pointerEvents="none" style={[st.pointer, { top: slot + ROW / 2 - 5, borderLeftColor: tone }]} />

      <Animated.ScrollView
        ref={list}
        style={StyleSheet.absoluteFill}
        onScroll={onScroll}
        scrollEventThrottle={16}
        snapToInterval={ROW}
        decelerationRate="fast"
        showsVerticalScrollIndicator={false}
        nestedScrollEnabled
        contentContainerStyle={{ paddingTop: slot, paddingBottom: slot }}
      >
        {items.map((it, i) => (
          <Row
            key={it.key} it={it} i={i} y={y} on={i === index} picked={picked === it.key}
            onPress={() => {
              if (i === index) { void Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Medium); onPick(it.key); return; }
              void Haptics.selectionAsync();
              list.current?.scrollTo({ y: i * ROW, animated: true });
            }}
          />
        ))}
      </Animated.ScrollView>
    </View>
  );
}

function Row({ it, i, y, on, picked, onPress }: {
  it: RevolverItem; i: number; y: Animated.Value; on: boolean; picked: boolean; onPress: () => void;
}) {
  const r = (k: number) => (i + k) * ROW;
  // Above the slot the row has turned past; below, it's still coming round.
  const range = [r(-2), r(-1), r(0), r(1), r(2)];
  const scale = y.interpolate({ inputRange: range, outputRange: [0.74, 0.86, 1, 0.86, 0.74], extrapolate: 'clamp' });
  const opacity = y.interpolate({ inputRange: range, outputRange: [0.2, 0.5, 1, 0.5, 0.2], extrapolate: 'clamp' });
  const rotateX = y.interpolate({ inputRange: range, outputRange: ['-52deg', '-26deg', '0deg', '26deg', '52deg'], extrapolate: 'clamp' });
  return (
    <Pressable onPress={onPress} accessibilityRole="button" accessibilityLabel={it.word} style={{ height: ROW, justifyContent: 'center', paddingLeft: 30, paddingRight: 18 }}>
      <Animated.View style={[st.row, { opacity, transform: [{ perspective: 600 }, { rotateX }, { scale }] }]}>
        <Text style={[st.index, { color: on ? it.tone : C.faint }]}>{pad2(i + 1)}</Text>
        <DotIcon kind={it.key} tone={it.tone} dot={2.4} gap={0.6} />
        <View style={{ flex: 1 }}>
          <Text style={[st.word, { color: on ? it.tone : C.dim }]} numberOfLines={1}>{it.word}</Text>
          <Text style={st.meta} numberOfLines={1}>{on && !picked ? 'TAP TO PICK' : it.meta}</Text>
        </View>
        {picked
          ? <Text style={[st.check, { color: it.tone }]}>PICKED</Text>
          : !!it.value && <Text style={[st.value, numFace(it.value, 15), on && { color: C.hot }]} numberOfLines={1}>{it.value}</Text>}
      </Animated.View>
    </Pressable>
  );
}

const CORNER = {
  tl: { left: 0, top: 0, borderLeftWidth: 2, borderTopWidth: 2 },
  tr: { right: 0, top: 0, borderRightWidth: 2, borderTopWidth: 2 },
  bl: { left: 0, bottom: 0, borderLeftWidth: 2, borderBottomWidth: 2 },
  br: { right: 0, bottom: 0, borderRightWidth: 2, borderBottomWidth: 2 },
} as const;

const st = StyleSheet.create({
  slot: { position: 'absolute', left: 20, right: 8, height: ROW, borderTopWidth: 1, borderBottomWidth: 1 },
  corner: { position: 'absolute', width: 12, height: 12 },
  pointer: { position: 'absolute', left: 6, width: 0, height: 0, borderTopWidth: 5, borderBottomWidth: 5, borderLeftWidth: 8, borderTopColor: 'transparent', borderBottomColor: 'transparent' },
  row: { flexDirection: 'row', alignItems: 'center', gap: 12 },
  index: { fontFamily: F.dot, fontSize: 10, letterSpacing: 1, width: 18 },
  word: { fontFamily: F.dot, fontSize: 18, letterSpacing: 1.5 },
  meta: { fontFamily: F.mono, fontSize: 10, letterSpacing: 1, color: C.dim, marginTop: 1 },
  value: { color: C.dim, maxWidth: 110 },
  check: { fontFamily: F.dot, fontSize: 10, letterSpacing: 2 },
});
