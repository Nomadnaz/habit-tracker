// ─────────────────────────────────────────────────────────────────────────
// ElevationGraph — real elevation profile from a saved activity's waypoints.
// If no altitude data was recorded (common — GPS altitude is unreliable/
// absent on many devices), shows an honest empty state instead of a flat
// fake line.
// ─────────────────────────────────────────────────────────────────────────

import { View, Text, StyleSheet } from 'react-native';
import Svg, { Polyline } from 'react-native-svg';
import type { Waypoint } from '@/lib/activity-data';

const ORANGE = '#FF4D00';
const MUTED  = '#8C857B';
const BG     = '#F4F2EE';
const REG    = 'PixeloidSans_400Regular';

export function ElevationGraph({ waypoints, width = 280, height = 100 }: { waypoints: Waypoint[]; width?: number; height?: number }) {
  const altitudes = waypoints.map(w => w.altitude).filter((a): a is number => a != null);

  if (altitudes.length < 2) {
    return (
      <View style={[s.empty, { width, height }]}>
        <Text style={s.emptyText}>No elevation data recorded</Text>
      </View>
    );
  }

  const min = Math.min(...altitudes);
  const max = Math.max(...altitudes);
  const range = max - min || 1;
  const pad = 6;
  const stepX = (width - pad * 2) / (altitudes.length - 1);
  const points = altitudes
    .map((a, i) => `${pad + i * stepX},${height - pad - ((a - min) / range) * (height - pad * 2)}`)
    .join(' ');

  return (
    <View>
      <Svg width={width} height={height} style={{ backgroundColor: BG, borderRadius: 8 }}>
        <Polyline points={points} fill="none" stroke={ORANGE} strokeWidth={2} />
      </Svg>
      <View style={s.range}>
        <Text style={s.rangeText}>{Math.round(min)}M</Text>
        <Text style={s.rangeText}>{Math.round(max)}M</Text>
      </View>
    </View>
  );
}

const s = StyleSheet.create({
  empty: { backgroundColor: BG, borderRadius: 8, alignItems: 'center', justifyContent: 'center' },
  emptyText: { fontFamily: REG, fontSize: 11, color: MUTED },
  range: { flexDirection: 'row', justifyContent: 'space-between', marginTop: 4 },
  rangeText: { fontFamily: REG, fontSize: 9, color: MUTED },
});
