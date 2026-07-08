// ─────────────────────────────────────────────────────────────────────────
// GymHeatmap — the weeks×7 hit/partial/missed/trained/rest/cheat grid used
// by the BODY hub (steps + training heatmaps) and the Strava-style
// profile/stats page (activity calendar). Extracted from app/(tabs)/gym.tsx
// so both screens share one implementation instead of two.
// ─────────────────────────────────────────────────────────────────────────

import { View, Text, StyleSheet } from 'react-native';
import { buildDayGrid } from '@/lib/body-data';

const ORANGE = '#FF4D00';
const MUTED  = '#8C857B';
const FAINT  = '#C7C1B8';

export type SquareKind = 'hit' | 'partial' | 'missed' | 'empty' | 'trained' | 'rest' | 'cheat';

const SQ = 13;
const DITHER_TILES = 4;

function HeatSquare({ kind }: { kind: SquareKind }) {
  if (kind === 'empty') return <View style={[hs.sq, hs.invisible]} />;
  if (kind === 'hit' || kind === 'trained') return <View style={[hs.sq, hs.solid]} />;
  if (kind === 'partial' || kind === 'rest') return <View style={[hs.sq, hs.dotted]} />;
  if (kind === 'cheat') {
    const tile = SQ / DITHER_TILES;
    return (
      <View style={[hs.sq, { flexDirection: 'row', flexWrap: 'wrap', overflow: 'hidden' }]}>
        {Array.from({ length: DITHER_TILES * DITHER_TILES }).map((_, i) => {
          const row = Math.floor(i / DITHER_TILES);
          const col = i % DITHER_TILES;
          const on = (row + col) % 2 === 0;
          return <View key={i} style={{ width: tile, height: tile, backgroundColor: on ? ORANGE : '#FCFBF9' }} />;
        })}
      </View>
    );
  }
  return <View style={[hs.sq, hs.missed]} />;
}

export function GymHeatmap({ weeks, getKind }: { weeks: number; getKind: (d: Date | null) => SquareKind }) {
  const grid = buildDayGrid(weeks);
  const headerDates = grid[grid.length - 1] ?? [];

  return (
    <View>
      <View style={hm.headerRow}>
        {headerDates.map((day, i) => (
          <Text key={i} style={hm.headerDate}>{day ? String(day.getDate()) : ''}</Text>
        ))}
      </View>
      {grid.map((row, r) => (
        <View key={r} style={hm.row}>
          {row.map((day, c) => <HeatSquare key={c} kind={getKind(day)} />)}
        </View>
      ))}
    </View>
  );
}

export function GymHeatmapLegend({ items }: { items: { kind: SquareKind; label: string }[] }) {
  return (
    <View style={hm.legend}>
      {items.map(it => (
        <View key={it.label} style={hm.legendItem}>
          <HeatSquare kind={it.kind} />
          <Text style={hm.legendText}>{it.label}</Text>
        </View>
      ))}
    </View>
  );
}

const hs = StyleSheet.create({
  sq: { width: SQ, height: SQ, borderRadius: 0, marginRight: 3, marginBottom: 3, overflow: 'hidden' },
  invisible: {},
  solid: { backgroundColor: ORANGE },
  dotted: { borderWidth: 1.5, borderColor: ORANGE, borderStyle: 'dotted' },
  missed: { borderWidth: 1.5, borderColor: '#D8D2C8' },
});

const hm = StyleSheet.create({
  headerRow: { flexDirection: 'row', marginBottom: 4 },
  headerDate: { width: SQ + 3, textAlign: 'center', fontFamily: 'PixeloidSans_400Regular', fontSize: 7, color: FAINT },
  row: { flexDirection: 'row' },
  legend: { flexDirection: 'row', flexWrap: 'wrap', marginTop: 6, gap: 8 },
  legendItem: { flexDirection: 'row', alignItems: 'center', gap: 3 },
  legendText: { fontFamily: 'PixeloidSans_400Regular', fontSize: 7, color: MUTED },
});
