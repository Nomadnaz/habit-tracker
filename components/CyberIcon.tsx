// Angular line icons in the cyberdeck style: square caps, mitred corners,
// chamfered frames. Drawn on a 24-unit grid. The tab bar uses log/body/
// train/life; TRAIN's day panel uses drop (water), flame (food) and pencil (edit).
import Svg, { Path, Rect } from 'react-native-svg';

export type CyberIconName = 'log' | 'body' | 'train' | 'life' | 'drop' | 'flame' | 'pencil';

export function CyberIcon({ name, color, size = 22, weight = 1.6 }: { name: CyberIconName; color: string; size?: number; weight?: number }) {
  const line = { stroke: color, strokeWidth: weight, strokeLinecap: 'square' as const, strokeLinejoin: 'miter' as const, fill: 'none' };
  const fill = { fill: color };
  return (
    <Svg width={size} height={size} viewBox="0 0 24 24">
      {name === 'log' && (
        <>
          {/* a terminal sheet: chamfered corner, a prompt and a line */}
          <Path d="M4.5 2.5h10.5l4.5 4.5v14.5h-15z" {...line} />
          <Path d="M15 2.5V7h4.5" {...line} />
          <Path d="M8 11l2.5 2.5L8 16" {...line} />
          <Path d="M12.5 16H16" {...line} />
        </>
      )}
      {name === 'body' && (
        <>
          {/* a wireframe figure: square head, tapered torso, limbs */}
          <Rect x={10} y={1.8} width={4} height={4} {...line} />
          <Path d="M6.5 8.5h11l-2 7h-7z" {...line} />
          <Path d="M6.5 8.5L4 15.5M17.5 8.5L20 15.5" {...line} />
          <Path d="M9.8 15.5L8.8 22M14.2 15.5l1 6.5" {...line} />
          <Rect x={11.2} y={10.6} width={1.6} height={1.6} {...fill} />
        </>
      )}
      {name === 'train' && (
        <>
          {/* a dumbbell: two plates a side on a bar */}
          <Path d="M2.5 9.5v5M21.5 9.5v5" {...line} />
          <Rect x={4.6} y={6.5} width={3} height={11} {...line} />
          <Rect x={16.4} y={6.5} width={3} height={11} {...line} />
          <Path d="M7.6 12h8.8" {...line} />
        </>
      )}
      {name === 'life' && (
        <>
          {/* a pulse across a chamfered frame */}
          <Path d="M2.5 6.5l4-4h15v15l-4 4h-15z" {...line} />
          <Path d="M5 13h3.2l1.8-4.5 3 8.5 2-5.5 1.3 1.5H19" {...line} />
        </>
      )}
      {name === 'drop' && (
        <>
          <Path d="M12 2.5l6 8.5v5.5L14.5 21h-5L6 16.5V11z" {...line} />
          <Path d="M9.5 14.5v1.5l1.5 1.5" {...line} />
        </>
      )}
      {name === 'flame' && (
        <>
          <Path d="M12 2.5l3 5.5 2.5-1.5.5 8L13.5 21h-3L6 14.5l1-5.5 2.5 2.5z" {...line} />
          <Path d="M12 13.5l1.8 3-1.8 2.5-1.8-2.5z" {...line} />
        </>
      )}
      {name === 'pencil' && (
        <>
          <Path d="M4 20l1-4.5L15.5 5 19 8.5 8.5 19z" {...line} />
          <Path d="M13 7.5l3.5 3.5M4 20h5" {...line} />
        </>
      )}
    </Svg>
  );
}
