// ─────────────────────────────────────────────────────────────────────────
// HeatmapCalendar — small grid of coloured cells for a habit's recent history.
// green = done, red = missed, grey = before the habit existed / no data yet,
// blue = auto-frozen (task 076, MVP freeze-only — repair/holiday are a
// separate future sub-task, not built here).
// ─────────────────────────────────────────────────────────────────────────

import { View, StyleSheet } from 'react-native';
import type { HeatmapCell } from '@/lib/habits-data';

const COLORS: Record<HeatmapCell['state'], string> = {
  done: '#3B7A57',
  missed: '#C0432B',
  before: '#E5E1DA',
  frozen: '#3B82F6',
};

export default function HeatmapCalendar({ cells, cols = 7 }: { cells: HeatmapCell[]; cols?: number }) {
  return (
    <View style={[styles.grid, { width: cols * 14 }]}>
      {cells.map(cell => (
        <View key={cell.date} style={[styles.cell, { backgroundColor: COLORS[cell.state] }]} />
      ))}
    </View>
  );
}

const styles = StyleSheet.create({
  grid: {
    flexDirection: 'row',
    flexWrap: 'wrap',
  },
  cell: {
    width: 10,
    height: 10,
    margin: 2,
    borderRadius: 2,
  },
});
