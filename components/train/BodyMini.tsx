// A small flat body, front and back, for HISTORY: blocky muscle plates in the
// PUCK grid, the ones a day's lifts worked lit red (stronger = more of the
// work). Ids are lib/muscle-recovery.ts's base muscles. Left-side plates are
// listed once and mirrored.

import { memo, type ReactElement } from 'react';
import { View } from 'react-native';
import Svg, { Circle, Rect } from 'react-native-svg';
import { C } from '@/lib/theme';

type Plate = [id: string, x: number, y: number, w: number, h: number, mirror?: boolean];

// 100 × 200 per view; x is the figure's left half unless `mirror` is false.
const FRONT: Plate[] = [
  ['traps.upper', 38, 29, 8, 6],
  ['delt.front', 25, 35, 11, 11], ['delt.side', 21, 38, 5, 10],
  ['pec.upper', 37, 36, 12, 8], ['pec.lower', 37, 45, 12, 8],
  ['serratus', 33, 54, 4, 9],
  ['biceps', 21, 50, 8, 18], ['brachialis', 19, 60, 3, 9],
  ['brachiorad', 16, 70, 5, 12], ['forearm.flex', 21, 70, 5, 20],
  ['abs.upper', 43, 54, 14, 13, false], ['abs.lower', 43, 68, 14, 13, false],
  ['oblique', 37, 56, 5, 24],
  ['hipflex', 38, 82, 7, 7], ['tfl', 32, 84, 5, 9],
  ['quad.vl', 32, 94, 7, 34], ['quad.rf', 40, 92, 6, 34], ['quad.vm', 46, 112, 4, 16],
  ['adductor', 46, 92, 4, 18],
  ['tib', 38, 138, 6, 34],
];
const BACK: Plate[] = [
  ['traps.upper', 38, 29, 8, 6], ['traps.mid', 41, 36, 18, 10, false], ['traps.lower', 44, 47, 12, 10, false],
  ['delt.rear', 25, 35, 11, 11], ['cuff', 35, 39, 5, 8], ['teres', 33, 48, 6, 5],
  ['lat', 32, 54, 10, 22], ['erector', 46, 58, 8, 24, false],
  ['triceps.long', 21, 50, 5, 18], ['triceps.lat', 26, 50, 4, 16],
  ['forearm.ext', 16, 70, 9, 20],
  ['glute.med', 34, 82, 9, 7], ['glute.max', 35, 90, 14, 13],
  ['ham.bf', 34, 105, 7, 25], ['ham.st', 42, 105, 7, 25],
  ['gastro.lat', 36, 138, 5, 18], ['gastro.med', 42, 138, 5, 18],
  ['soleus', 38, 157, 9, 15],
];

function View2({ plates, load, w }: { plates: Plate[]; load: Record<string, number>; w: number }) {
  const rects: ReactElement[] = [];
  for (const [id, x, y, pw, ph, mirror = true] of plates) {
    const v = load[id] ?? 0;
    const fill = v > 0 ? C.alert : C.ghost;
    const opacity = v > 0 ? 0.35 + 0.65 * Math.min(1, v) : 1;
    rects.push(<Rect key={id} x={x} y={y} width={pw} height={ph} fill={fill} opacity={opacity} />);
    if (mirror) rects.push(<Rect key={`${id}.r`} x={100 - x - pw} y={y} width={pw} height={ph} fill={fill} opacity={opacity} />);
  }
  return (
    <Svg width={w} height={w * 2} viewBox="0 0 100 200">
      <Circle cx={50} cy={15} r={10} fill={C.ghost} />
      <Rect x={46} y={25} width={8} height={5} fill={C.ghost} />
      {rects}
    </Svg>
  );
}

/** `load`: base muscle id → how much it was worked, 0–1. */
export const BodyMini = memo(function BodyMini({ load, height }: { load: Record<string, number>; height: number }) {
  const w = height / 2;
  return (
    <View style={{ flexDirection: 'row', gap: 2 }} pointerEvents="none">
      <View2 plates={FRONT} load={load} w={w} />
      <View2 plates={BACK} load={load} w={w} />
    </View>
  );
});
