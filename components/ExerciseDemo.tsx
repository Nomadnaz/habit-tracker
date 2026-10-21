// ExerciseDemo — a looping dot-matrix demo of an exercise, drawn in the
// same halftone as the BODY figure. The poses and drawing live in
// lib/exercise-demo.ts; this only plays the frames.

import { memo, useEffect, useMemo, useState } from 'react';
import { View } from 'react-native';
import Svg, { Path } from 'react-native-svg';
import { C } from '@/lib/theme';
import type { Equipment, Pattern } from '@/lib/exercise-guide';
import { demoFrames } from '@/lib/exercise-demo';

const FRAMES = 28;
const FRAME_MS = 70;

export const ExerciseDemo = memo(function ExerciseDemo({ pattern, equipment, name, size, pulley }: {
  pattern: Pattern; equipment: Equipment; name: string; size: number;
  /** Cable moves: the pulley's height, 0 floor … 1 top (lib/exercise-library). */
  pulley?: number;
}) {
  const frames = useMemo(() => demoFrames(pattern, equipment, name, size, FRAMES, pulley), [pattern, equipment, name, size, pulley]);
  const [f, setF] = useState(0);
  useEffect(() => {
    const id = setInterval(() => setF(x => (x + 1) % FRAMES), FRAME_MS);
    return () => clearInterval(id);
  }, [frames]);
  return (
    <View style={{ width: size, height: size }}>
      <Svg width={size} height={size}><Path d={frames[f]} fill={C.ink} /></Svg>
    </View>
  );
});
