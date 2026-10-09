// The company mark: a 3 × 3 block of square white pixels. Same geometry as
// assets/icon.png (unit square, half-unit gap).
import Svg, { Rect } from 'react-native-svg';
import { C } from '@/lib/theme';

export function PuckMark({ size = 40, color = C.hot, lit }: { size?: number; color?: string; lit?: number }) {
  const unit = size / 4; // 3 units + 2 half-unit gaps
  return (
    <Svg width={size} height={size}>
      {Array.from({ length: 9 }, (_, i) => (
        <Rect key={i} x={(i % 3) * unit * 1.5} y={Math.floor(i / 3) * unit * 1.5} width={unit} height={unit}
          fill={lit === undefined || lit === i ? color : C.ghost} />
      ))}
    </Svg>
  );
}
