// ─────────────────────────────────────────────────────────────────────────
// SummaryCard — the abstract pace-coloured route polyline (SVG, normalized
// to the waypoints' own bounding box). Extracted from app/(tabs)/activity.tsx
// so the live-record screen and app/activity-summary.tsx (task 033) share
// one implementation instead of two. Not a real map — no map library
// (e.g. react-native-maps) is installed; swapping this for a real map later
// doesn't touch either caller.
// ─────────────────────────────────────────────────────────────────────────

import { View, StyleSheet } from 'react-native';
import Svg, { Polyline } from 'react-native-svg';
import { segmentPaces, type Waypoint } from '@/lib/activity-data';

const ORANGE = '#FF4D00';
const GREEN  = '#3B7A57';
const RED    = '#C0432B';
const BG     = '#F4F2EE';

export function RouteLine({ waypoints, width = 280, height = 160 }: { waypoints: Waypoint[]; width?: number; height?: number }) {
  if (waypoints.length < 2) return <View style={[s.box, { width, height, backgroundColor: BG }]} />;
  const lats = waypoints.map(w => w.lat), lngs = waypoints.map(w => w.lng);
  const minLat = Math.min(...lats), maxLat = Math.max(...lats);
  const minLng = Math.min(...lngs), maxLng = Math.max(...lngs);
  const pad = 10;
  const scaleX = (maxLng - minLng) || 1;
  const scaleY = (maxLat - minLat) || 1;
  const toXY = (p: Waypoint) => ({
    x: pad + ((p.lng - minLng) / scaleX) * (width - pad * 2),
    y: height - pad - ((p.lat - minLat) / scaleY) * (height - pad * 2), // flip Y (lat increases upward)
  });
  const paces = segmentPaces(waypoints);
  const avgPace = paces.reduce((a, b) => a + b, 0) / (paces.length || 1);

  return (
    <Svg width={width} height={height} style={[s.box, { backgroundColor: BG }]}>
      {waypoints.slice(1).map((p, i) => {
        const a = toXY(waypoints[i]);
        const b = toXY(p);
        const pace = paces[i] ?? avgPace;
        const color = pace <= avgPace * 0.95 ? GREEN : pace >= avgPace * 1.15 ? RED : ORANGE;
        return <Polyline key={i} points={`${a.x},${a.y} ${b.x},${b.y}`} stroke={color} strokeWidth={3} fill="none" />;
      })}
    </Svg>
  );
}

const s = StyleSheet.create({
  box: { borderRadius: 8 },
});
