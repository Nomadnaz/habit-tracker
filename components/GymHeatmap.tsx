// ─────────────────────────────────────────────────────────────────────────
// GymHeatmap — the weeks×7 hit/partial/missed/trained/rest/cheat grid used
// by the BODY hub (steps + training heatmaps) and the Strava-style
// profile/stats page (activity calendar). Extracted from app/(tabs)/gym.tsx
// so both screens share one implementation instead of two.
// ─────────────────────────────────────────────────────────────────────────

import { useState } from 'react';
import { View, Text, StyleSheet } from 'react-native';
import { buildDayGrid } from '@/lib/body-data';

import { C, F } from '@/lib/theme';
const ORANGE = C.hot;

export type SquareKind = 'hit' | 'partial' | 'missed' | 'empty' | 'trained' | 'rest' | 'cheat';

const SQ = 13; // legend swatch size; grid squares stretch to fill the card
const DITHER_TILES = 4;
const WEEKDAYS = ['M', 'T', 'W', 'T', 'F', 'S', 'S'];
const GAP = 6;

function HeatSquare({ kind, size }: { kind: SquareKind; size?: number }) {
  const box = size ? [hs.cell, { width: size, height: size }] : hs.sq;
  if (kind === 'empty') return <View style={[box, hs.invisible]} />;
  if (kind === 'hit' || kind === 'trained') return <View style={[box, hs.solid]} />;
  if (kind === 'partial' || kind === 'rest') return <View style={[box, hs.dotted]} />;
  if (kind === 'cheat') {
    return (
      <View style={[box, { flexDirection: 'row', flexWrap: 'wrap', overflow: 'hidden' }]}>
        {Array.from({ length: DITHER_TILES * DITHER_TILES }).map((_, i) => {
          const row = Math.floor(i / DITHER_TILES);
          const col = i % DITHER_TILES;
          const on = (row + col) % 2 === 0;
          return <View key={i} style={{ width: `${100 / DITHER_TILES}%`, height: `${100 / DITHER_TILES}%`, backgroundColor: on ? C.hot : C.surface }} />;
        })}
      </View>
    );
  }
  return <View style={[box, hs.missed]} />;
}

export function GymHeatmap({ weeks, getKind }: { weeks: number; getKind: (d: Date | null) => SquareKind }) {
  const grid = buildDayGrid(weeks);
  // Seven squares and six gaps span the measured width exactly.
  const [w, setW] = useState(0);
  const size = w ? (w - GAP * 6) / 7 : 0;

  return (
    <View onLayout={e => setW(e.nativeEvent.layout.width)}>
      <View style={hm.headerRow}>
        {WEEKDAYS.map((d, i) => <Text key={i} style={hm.headerDay}>{d}</Text>)}
      </View>
      {grid.map((row, r) => (
        <View key={r} style={hm.row}>
          {size > 0 && row.map((day, c) => <HeatSquare key={c} kind={getKind(day)} size={size} />)}
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
  sq: { width: SQ, height: SQ, borderRadius: 3, borderCurve: 'continuous', overflow: 'hidden' },
  cell: { borderRadius: 6, borderCurve: 'continuous', overflow: 'hidden' },
  invisible: {},
  solid: { backgroundColor: ORANGE },
  dotted: { borderWidth: 1.5, borderColor: C.hot, borderStyle: 'dotted' },
  missed: { borderWidth: 1.5, borderColor: C.line },
});

const hm = StyleSheet.create({
  headerRow: { flexDirection: 'row', gap: GAP, marginBottom: 6 },
  headerDay: { flex: 1, textAlign: 'center', fontFamily: F.dot, fontSize: 9, color: C.faint },
  row: { flexDirection: 'row', gap: GAP, marginBottom: GAP },
  legend: { flexDirection: 'row', flexWrap: 'wrap', marginTop: 8, gap: 14 },
  legendItem: { flexDirection: 'row', alignItems: 'center', gap: 6 },
  legendText: { fontFamily: F.dot, fontSize: 9, color: C.dim, letterSpacing: 1 },
});
