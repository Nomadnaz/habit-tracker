// Tiny pixel glyphs for the TODAY deck's module headers, drawn in the puck's
// square dots: a drop, a footprint, a jerry can, a moon, a heart and a bolt.
// Static and small — a colour-coded mark beside the module's name, not a gauge.

import { View } from 'react-native';

const ART = {
  drop: [
    '...#...',
    '..###..',
    '.#####.',
    '##.####',
    '##.####',
    '.#####.',
    '..###..',
  ],
  foot: [
    '#.#.##.',
    '.......',
    '.#####.',
    '.#####.',
    '..####.',
    '..###..',
    '..###..',
  ],
  can: [
    '.##....',
    '#######',
    '##.#.##',
    '###.###',
    '##.#.##',
    '#######',
  ],
  moon: [
    '..####.',
    '.##....',
    '##.....',
    '##.....',
    '##.....',
    '.##....',
    '..####.',
  ],
  heart: [
    '.##.##.',
    '#######',
    '#######',
    '.#####.',
    '..###..',
    '...#...',
  ],
  bolt: [
    '...###.',
    '..###..',
    '.###...',
    '#######',
    '...###.',
    '..###..',
    '.##....',
  ],
} as const;

export type DotIconKind = keyof typeof ART;

export function DotIcon({ kind, tone, dot = 1.4, gap = 0.34 }: { kind: DotIconKind; tone: string; dot?: number; gap?: number }) {
  return (
    <View style={{ gap }} accessibilityElementsHidden importantForAccessibility="no-hide-descendants">
      {ART[kind].map((row, r) => (
        <View key={r} style={{ flexDirection: 'row', gap }}>
          {row.split('').map((ch, c) => (
            <View key={c} style={{ width: dot, height: dot, backgroundColor: ch === '#' ? tone : 'transparent' }} />
          ))}
        </View>
      ))}
    </View>
  );
}
