// Small sparkline used across BODY/STRENGTH for weight/lift/strength-trend
// history. Extracted from app/(tabs)/gym.tsx so app/strength.tsx can share it.

import { View } from 'react-native';
import Svg, { Polyline, Circle } from 'react-native-svg';

const ORANGE = '#FF4D00';

export function Spark({
  points, width = 72, height = 26, color = ORANGE, dots = false,
}: { points: number[]; width?: number; height?: number; color?: string; dots?: boolean }) {
  if (points.length < 2) return <View style={{ width, height }} />;
  const min = Math.min(...points);
  const max = Math.max(...points);
  const range = max - min || 1;
  const stepX = width / (points.length - 1);
  const coords = points.map((p, i) => ({
    x: i * stepX,
    // When every point is equal (a flat series), draw a centred horizontal line.
    y: max === min ? height / 2 : height - 2 - ((p - min) / range) * (height - 4),
  }));
  return (
    <Svg width={width} height={height}>
      <Polyline points={coords.map(c => `${c.x},${c.y}`).join(' ')} fill="none" stroke={color} strokeWidth={1.6} />
      {dots && coords.map((c, i) => <Circle key={i} cx={c.x} cy={c.y} r={1.9} fill={color} />)}
    </Svg>
  );
}
