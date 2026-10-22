// Pixel icons for the TODAY deck, drawn in the puck's square dots: a water
// drop, a footprint and a jerry can. Each fills from the bottom up to `pct`
// in its colour, so the icon is also a level. Each one moves:
//   drop — the waterline twinkles; a new glass makes it bounce
//   foot — takes a step every couple of seconds until the goal is hit
//   can  — the fuel line pulses; past the target the whole can blinks red

import { useEffect, useRef } from 'react';
import { Animated, Easing, View } from 'react-native';
import { C } from '@/lib/theme';

// '#' fills with the level, 'o' is the can's shell (always drawn), '.' is empty.
const ART = {
  drop: [
    '...##...',
    '...##...',
    '..####..',
    '..####..',
    '.######.',
    '.######.',
    '########',
    '########',
    '.######.',
    '..####..',
  ],
  foot: [
    '...#.##.',
    '.#......',
    '..#####.',
    '.######.',
    '.######.',
    '..#####.',
    '...####.',
    '...###..',
    '..####..',
    '..####..',
    '...##...',
  ],
  can: [
    'o.......',
    'oo.oooo.',
    '.oooo..o',
    'oooooooo',
    'o######o',
    'o#o##o#o',
    'o##oo##o',
    'o##oo##o',
    'o#o##o#o',
    'o######o',
    'oooooooo',
  ],
} as const;

export type DotIconKind = keyof typeof ART;

export function DotIcon({ kind, pct, tone, dot = 4, gap = 1, alarm = false }: {
  kind: DotIconKind; pct: number; tone: string; dot?: number; gap?: number; alarm?: boolean;
}) {
  const art = ART[kind];
  // Rows that hold liquid, counted from the bottom; the level fills that many.
  const bodyRows = art.map((r, i) => (r.includes('#') ? i : -1)).filter(i => i >= 0).reverse();
  const p = Math.max(0, Math.min(1, pct));
  const filled = p > 0 ? Math.max(1, Math.round(p * bodyRows.length)) : 0;
  const lit = new Set(bodyRows.slice(0, filled));
  const surface = filled > 0 && filled < bodyRows.length ? bodyRows[filled - 1] : -1;

  const blink = useRef(new Animated.Value(1)).current;
  const bob = useRef(new Animated.Value(0)).current;
  const pop = useRef(new Animated.Value(1)).current;
  const first = useRef(true);

  const done = p >= 1;
  // Twinkle the waterline / fuel line, or the whole can when it's over.
  useEffect(() => {
    if (kind === 'foot' || (done && !alarm)) { blink.setValue(1); return; }
    const l = Animated.loop(Animated.sequence([
      Animated.timing(blink, { toValue: 0.3, duration: alarm ? 380 : 650, useNativeDriver: true }),
      Animated.timing(blink, { toValue: 1, duration: alarm ? 380 : 650, useNativeDriver: true }),
    ]));
    l.start();
    return () => l.stop();
  }, [kind, done, alarm]);

  // The foot steps: lift, set down, rest.
  useEffect(() => {
    if (kind !== 'foot' || done) { bob.setValue(0); return; }
    const l = Animated.loop(Animated.sequence([
      Animated.timing(bob, { toValue: 1, duration: 220, easing: Easing.out(Easing.quad), useNativeDriver: true }),
      Animated.timing(bob, { toValue: 0, duration: 260, easing: Easing.bounce, useNativeDriver: true }),
      Animated.delay(1600),
    ]));
    l.start();
    return () => l.stop();
  }, [kind, done]);

  // A bounce whenever the level changes (a glass of water, a meal).
  useEffect(() => {
    if (first.current) { first.current = false; return; }
    pop.setValue(1.25);
    Animated.spring(pop, { toValue: 1, friction: 3, tension: 140, useNativeDriver: true }).start();
  }, [filled]);

  const fill = alarm ? C.alert : tone;
  const transform = kind === 'foot'
    ? [{ translateY: bob.interpolate({ inputRange: [0, 1], outputRange: [0, -3] }) }, { rotate: bob.interpolate({ inputRange: [0, 1], outputRange: ['0deg', '-8deg'] }) }, { scale: pop }]
    : [{ scale: pop }];

  return (
    <Animated.View style={{ gap, transform, opacity: alarm ? blink : 1 }} accessibilityElementsHidden importantForAccessibility="no-hide-descendants">
      {art.map((row, r) => (
        <View key={r} style={{ flexDirection: 'row', gap }}>
          {row.split('').map((ch, c) => {
            const style = {
              width: dot, height: dot,
              backgroundColor: ch === '.' ? 'transparent' : ch === 'o' ? C.faint : lit.has(r) ? fill : C.lineHi,
            };
            return r === surface && ch === '#' && !alarm
              ? <Animated.View key={c} style={[style, { opacity: blink }]} />
              : <View key={c} style={style} />;
          })}
        </View>
      ))}
    </Animated.View>
  );
}
