// Tap targets: at least 44 × 44 pt on iOS and 48 × 48 dp on Android (Apple's
// HIG, Material). hit(w, h) is the hitSlop that grows a control drawn w × h
// to that size without changing how it looks; `min` keeps at least that much
// slop on every side. Keep neighbours far enough apart that the grown areas
// don't overlap; where they would, make the control itself bigger instead.
import { Platform, type Insets } from 'react-native';

export const TAP = Platform.OS === 'android' ? 48 : 44;

export function hit(w: number, h = w, min = 0): Insets {
  const x = Math.max(min, Math.ceil((TAP - w) / 2));
  const y = Math.max(min, Math.ceil((TAP - h) / 2));
  return { top: y, bottom: y, left: x, right: x };
}
