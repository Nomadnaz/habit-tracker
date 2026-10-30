// Pixel glyphs for BODY's readouts, one per module, drawn in the puck's
// square dots on a 7×7 grid: a foot, a drop, a flame, a moon, a battery, a
// dumbbell, a flexed arm, a calendar, a target, a list, a heart, a
// kettlebell, a bolt, four squares and a face. Static, in the module's
// colour; `dot` scales them (1.4 ≈ 12 px in a readout, 2.6 in the picker).

import { View } from 'react-native';
import type { HudModule } from '@/lib/body-hud';

const ART: Record<HudModule, readonly string[]> = {
  steps: [
    '..#.#.#',
    '.......',
    '..####.',
    '.#####.',
    '.####..',
    '..###..',
    '..##...',
  ],
  water: [
    '...#...',
    '..###..',
    '..###..',
    '.#####.',
    '.#.###.',
    '.#####.',
    '..###..',
  ],
  fuel: [
    '...#...',
    '...##..',
    '..###..',
    '.#####.',
    '.##.##.',
    '.#...#.',
    '..###..',
  ],
  sleep: [
    '..###..',
    '.##..#.',
    '##.....',
    '##.....',
    '##....#',
    '.##..##',
    '..####.',
  ],
  readiness: [
    '.......',
    '######.',
    '###..##',
    '###..##',
    '###..##',
    '######.',
    '.......',
  ],
  train: [
    '.......',
    '##...##',
    '##...##',
    '#######',
    '##...##',
    '##...##',
    '.......',
  ],
  muscles: [
    '...##..',
    '..#..#.',
    '.##..#.',
    '##...#.',
    '#....##',
    '#.....#',
    '.######',
  ],
  week: [
    '.#...#.',
    '#######',
    '#.....#',
    '#.#.#.#',
    '#.....#',
    '#.#.#.#',
    '#######',
  ],
  goal: [
    '.#####.',
    '#.....#',
    '#.###.#',
    '#.###.#',
    '#.###.#',
    '#.....#',
    '.#####.',
  ],
  log: [
    '#.#####',
    '.......',
    '#.####.',
    '.......',
    '#.#####',
    '.......',
    '#.###..',
  ],
  heart: [
    '.......',
    '.##.##.',
    '#######',
    '#######',
    '.#####.',
    '..###..',
    '...#...',
  ],
  weight: [
    '..###..',
    '.#...#.',
    '.#...#.',
    '.#####.',
    '#######',
    '#######',
    '.#####.',
  ],
  active: [
    '....##.',
    '...##..',
    '..##...',
    '.#####.',
    '...##..',
    '..##...',
    '.##....',
  ],
  macros: [
    '###.###',
    '###.###',
    '###.###',
    '.......',
    '###.###',
    '###.###',
    '###.###',
  ],
  mood: [
    '.#####.',
    '#.....#',
    '#.#.#.#',
    '#.....#',
    '#.#.#.#',
    '#..#..#',
    '.#####.',
  ],
};

export function DotIcon({ kind, tone, dot = 1.4, gap = 0.34 }: { kind: HudModule; tone: string; dot?: number; gap?: number }) {
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
