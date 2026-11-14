// Navigation: no bar — one circle at the bottom of the screen. Tap it and the
// four places spring out on an arc above it, each on a line back to the
// circle; tap one to go there, or anywhere else to close. The place you're in
// is the filled one. Under Reduce Motion they appear instead of springing.
// Talking to the assistant lives on LOG: its send button is hold-to-talk
// while the box is empty.
import { useEffect, useRef, useState } from 'react';
import { View, Text, StyleSheet, Pressable, Animated, BackHandler } from 'react-native';
import type { BottomTabBarProps } from '@react-navigation/bottom-tabs';
import * as Haptics from 'expo-haptics';
import { C, F, SPRING } from '@/lib/theme';
import { hit } from '@/lib/hit';
import { useReducedMotion } from '@/lib/use-reduced-motion';

const HUB = 46;    // the circle
const CORE = 34;   // its centre: a dot when closed, a disc when open
const DOT = 6;
const NODE = 58;   // a place
const REACH = 124; // circle centre → place centre
const TOP = 6;

// Left to right along the arc; deg is measured up from the right-hand horizon.
const PLACES = [
  { name: 'log',   label: 'LOG',   deg: 158 },
  { name: 'index', label: 'BODY',  deg: 113 },
  { name: 'gym',   label: 'TRAIN', deg: 67  },
  { name: 'life',  label: 'LIFE',  deg: 22  },
].map(p => {
  const r = (p.deg * Math.PI) / 180;
  return { ...p, dx: REACH * Math.cos(r), dy: -REACH * Math.sin(r) };
});

// Hidden tab routes light up the place they belong to, so you never lose your place.
const PARENT: Record<string, string> = { habits: 'life', activity: 'gym', progress: 'gym' };

export function NavOrb({ state, navigation, insets }: BottomTabBarProps) {
  const reduced = useReducedMotion();
  const current = state.routes[state.index]?.name;
  const lit = PARENT[current] ?? current;
  const [open, setOpen] = useState(false);
  const out = useRef(PLACES.map(() => new Animated.Value(0))).current; // one per place, 0 in the circle → 1 out
  const veil = useRef(new Animated.Value(0)).current;

  const pad = Math.max(insets.bottom - 14, 6);
  const cy = pad + HUB / 2; // circle centre, up from the bottom edge

  const show = (next: boolean) => {
    setOpen(next);
    if (reduced) {
      out.forEach(v => v.setValue(next ? 1 : 0));
      veil.setValue(next ? 1 : 0);
      return;
    }
    Animated.parallel([
      Animated.timing(veil, { toValue: next ? 1 : 0, duration: 160, useNativeDriver: true }),
      next
        ? Animated.stagger(35, out.map(v => Animated.spring(v, { toValue: 1, ...SPRING.pop })))
        : Animated.parallel(out.map(v => Animated.timing(v, { toValue: 0, duration: 140, useNativeDriver: true }))),
    ]).start();
  };

  const toggle = () => { Haptics.selectionAsync(); show(!open); };

  // Android back closes the menu before it leaves the screen.
  useEffect(() => {
    if (!open) return;
    const sub = BackHandler.addEventListener('hardwareBackPress', () => { show(false); return true; });
    return () => sub.remove();
  }, [open]);

  const go = (name: string) => {
    show(false);
    const route = state.routes.find(r => r.name === name);
    if (!route) return;
    const ev = navigation.emit({ type: 'tabPress', target: route.key, canPreventDefault: true });
    if (current !== name && !ev.defaultPrevented) {
      Haptics.selectionAsync();
      navigation.navigate(name);
    }
  };

  return (
    <>
      {/* The room the circle stands in; everything drawn is in the layer above the screen. */}
      <View style={{ height: TOP + HUB + pad, backgroundColor: C.bg }} />
      <View style={StyleSheet.absoluteFill} pointerEvents="box-none" accessibilityViewIsModal={open}>
        <Animated.View style={[StyleSheet.absoluteFill, styles.veil, { opacity: veil.interpolate({ inputRange: [0, 1], outputRange: [0, 0.86] }) }]} pointerEvents={open ? 'auto' : 'none'}>
          <Pressable style={StyleSheet.absoluteFill} onPress={() => show(false)} accessibilityLabel="Close menu" />
        </Animated.View>

        <View
          style={StyleSheet.absoluteFill}
          pointerEvents={open ? 'box-none' : 'none'}
          accessibilityElementsHidden={!open}
          importantForAccessibility={open ? 'auto' : 'no-hide-descendants'}
        >
          {PLACES.map((p, i) => (
            <Animated.View
              key={`line-${p.name}`}
              pointerEvents="none"
              style={[styles.line, {
                bottom: cy - 0.5,
                opacity: out[i].interpolate({ inputRange: [0, 0.5], outputRange: [0, 1], extrapolate: 'clamp' }),
                // Grows out of the circle: scaled about its middle, then slid half its length along its own axis.
                transform: [
                  { rotate: `${-p.deg}deg` },
                  { translateX: out[i].interpolate({ inputRange: [0, 1], outputRange: [0, REACH / 2] }) },
                  { scaleX: out[i].interpolate({ inputRange: [0, 1], outputRange: [0.001, 1] }) },
                ],
              }]}
            />
          ))}
          {PLACES.map((p, i) => {
            const on = lit === p.name;
            return (
              <Animated.View
                key={p.name}
                style={[styles.nodeAt, {
                  bottom: cy - NODE / 2,
                  opacity: out[i].interpolate({ inputRange: [0, 0.5], outputRange: [0, 1], extrapolate: 'clamp' }),
                  transform: [
                    { translateX: out[i].interpolate({ inputRange: [0, 1], outputRange: [0, p.dx] }) },
                    { translateY: out[i].interpolate({ inputRange: [0, 1], outputRange: [0, p.dy] }) },
                    { scale: out[i].interpolate({ inputRange: [0, 1], outputRange: [0.4, 1] }) },
                  ],
                }]}
              >
                <Pressable
                  style={[styles.node, on && styles.nodeOn]}
                  onPress={() => go(p.name)}
                  role="tab"
                  accessibilityState={{ selected: on }}
                  accessibilityLabel={p.label}
                >
                  <Text style={[styles.label, on && { color: C.onHot }]}>{p.label}</Text>
                </Pressable>
              </Animated.View>
            );
          })}
        </View>

        <Pressable
          style={[styles.hub, { bottom: pad }]}
          hitSlop={hit(HUB)}
          onPress={toggle}
          role="button"
          accessibilityLabel="Menu"
          accessibilityState={{ expanded: open }}
        >
          <Animated.View
            style={[styles.core, { transform: [{ scale: veil.interpolate({ inputRange: [0, 1], outputRange: [DOT / CORE, 1] }) }] }]}
          />
        </Pressable>
      </View>
    </>
  );
}

const styles = StyleSheet.create({
  veil: { backgroundColor: C.bg },
  hub: {
    position: 'absolute', left: '50%', marginLeft: -HUB / 2, width: HUB, height: HUB, borderRadius: HUB / 2,
    borderWidth: 1.5, borderColor: C.ink, backgroundColor: C.bg, alignItems: 'center', justifyContent: 'center',
  },
  core: { width: CORE, height: CORE, borderRadius: CORE / 2, backgroundColor: C.hot },
  line: { position: 'absolute', left: '50%', marginLeft: -REACH / 2, width: REACH, height: 1, backgroundColor: C.lineHi },
  nodeAt: { position: 'absolute', left: '50%', marginLeft: -NODE / 2, width: NODE, height: NODE },
  node: {
    flex: 1, borderRadius: NODE / 2, borderWidth: 1, borderColor: C.lineHi, backgroundColor: C.bg,
    alignItems: 'center', justifyContent: 'center',
  },
  nodeOn: { backgroundColor: C.hot, borderColor: C.hot },
  label: { fontFamily: F.dot, fontSize: 9, letterSpacing: 1.5, color: C.ink },
});
