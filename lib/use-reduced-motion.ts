// Reduce Motion (iOS) / Remove animations (Android), read once and kept up to
// date. Anything that moves checks it and swaps the movement for a fade or an
// instant change. PixelRouteMap and ReceiptPrinter predate this and keep
// their own copies of the same listener.
import { useSyncExternalStore } from 'react';
import { AccessibilityInfo } from 'react-native';

let reduced = false;
const listeners = new Set<() => void>();
const set = (v: boolean) => {
  if (v === reduced) return;
  reduced = v;
  listeners.forEach(l => l());
};
AccessibilityInfo.isReduceMotionEnabled().then(set).catch(() => {});
AccessibilityInfo.addEventListener('reduceMotionChanged', set);

/** For an animation started outside render (a press handler, a store). */
export const reducedMotion = () => reduced;

export function useReducedMotion(): boolean {
  return useSyncExternalStore(
    l => { listeners.add(l); return () => { listeners.delete(l); }; },
    () => reduced,
  );
}
