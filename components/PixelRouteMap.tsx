// ─────────────────────────────────────────────────────────────────────────
// PixelRouteMap — a real raster basemap of where the run happened, with the
// recorded GPS route rasterized onto a coarse grid on top of it and drawn
// cell by cell, the way a thermal head actually lays ink down.
//
// The basemap is CARTO's greyscale "light_all" tile set (OpenStreetMap
// data) fetched as plain <Image> tiles — no native map module, so this still
// works in Expo Go and needs no rebuild. Tile maths, provider config and the
// required attribution live in lib/mapTiles.ts.
//
// The route is projected with the SAME Web Mercator transform as the tiles,
// which is what makes the pixel line sit on the actual streets. If the tiles
// can't be fetched (offline mid-run is normal), the basemap is dropped and
// the route prints over a plain graticule instead.
// ─────────────────────────────────────────────────────────────────────────

import { useEffect, useMemo, useRef, useState } from 'react';
import { AccessibilityInfo, Image, View, Text, StyleSheet } from 'react-native';
import Svg, { Rect } from 'react-native-svg';
import type { Waypoint } from '@/lib/activity-data';
import { ATTRIBUTION, TILE_SIZE, fitRoute, tileUrl, toPanel } from '@/lib/mapTiles';

const INK   = '#1A1714';
const GRID  = '#DCD5C9';
const PAPER = '#FCFBF9';
const MUTED = '#8C857B';
const BOLD  = 'PixeloidSans_700Bold';
const REG   = 'PixeloidSans_400Regular';

const FRAME_MS = 40;

type Cell = { x: number; y: number };

/** Integer line between two grid cells — the pixels the route actually lights. */
function line(a: Cell, b: Cell): Cell[] {
  const cells: Cell[] = [];
  let x = a.x, y = a.y;
  const dx = Math.abs(b.x - x), dy = -Math.abs(b.y - y);
  const sx = x < b.x ? 1 : -1, sy = y < b.y ? 1 : -1;
  let err = dx + dy;
  for (;;) {
    cells.push({ x, y });
    if (x === b.x && y === b.y) break;
    const e2 = 2 * err;
    if (e2 >= dy) { err += dy; x += sx; }
    if (e2 <= dx) { err += dx; y += sy; }
  }
  return cells;
}

/** Round a raw metres-per-bar value down to something a scale bar can say. */
function niceDistance(m: number): number {
  const steps = [10, 20, 25, 50, 100, 200, 250, 500, 1000, 2000, 5000];
  for (let i = steps.length - 1; i >= 0; i--) if (steps[i] <= m) return steps[i];
  return 10;
}

export function PixelRouteMap({
  waypoints, width, height, cell = 4, playing = true, animate = true, durationMs = 1600,
}: {
  waypoints: Waypoint[];
  width: number;
  height?: number;
  /** Route pixel size. Small enough to follow a street, big enough to read as pixels. */
  cell?: number;
  /** Start the draw-on. Held false until the paper is actually feeding. */
  playing?: boolean;
  animate?: boolean;
  durationMs?: number;
}) {
  const cols = Math.floor(width / cell);
  const rows = Math.floor((height ?? Math.round(width * 0.72)) / cell);
  const w = cols * cell;
  const h = rows * cell;

  const map = useMemo(() => {
    if (waypoints.length < 2) return null;
    const fit = fitRoute(waypoints, w, h);

    // Same projection as the tiles — this is what puts the line on the street.
    const grid = waypoints.map(p => {
      const px = toPanel(p, fit);
      return {
        x: Math.min(cols - 1, Math.max(0, Math.floor(px.x / cell))),
        y: Math.min(rows - 1, Math.max(0, Math.floor(px.y / cell))),
      };
    });

    const seen = new Set<string>();
    const cells: Cell[] = [];
    for (let i = 1; i < grid.length; i++) {
      for (const c of line(grid[i - 1], grid[i])) {
        const key = `${c.x},${c.y}`;
        if (seen.has(key)) continue;
        seen.add(key);
        cells.push(c);
      }
    }

    return { fit, cells, metresPerCell: fit.metresPerPixel * cell };
  }, [waypoints, cols, rows, w, h, cell]);

  const cells = map?.cells ?? [];

  const [revealed, setRevealed] = useState(0);
  const [reduceMotion, setReduceMotion] = useState(false);
  const [basemapFailed, setBasemapFailed] = useState(false);
  const timer = useRef<ReturnType<typeof setInterval> | null>(null);

  useEffect(() => {
    let alive = true;
    AccessibilityInfo.isReduceMotionEnabled().then(v => { if (alive) setReduceMotion(v); });
    const sub = AccessibilityInfo.addEventListener('reduceMotionChanged', setReduceMotion);
    return () => { alive = false; sub.remove(); };
  }, []);

  // A new route means new tiles — give them a fresh chance to load.
  useEffect(() => { setBasemapFailed(false); }, [map]);

  useEffect(() => {
    if (timer.current) clearInterval(timer.current);
    if (!playing || cells.length === 0) { setRevealed(playing ? cells.length : 0); return; }
    // Reduce Motion: the route is still the point, so print it whole.
    if (!animate || reduceMotion) { setRevealed(cells.length); return; }

    setRevealed(0);
    const step = Math.max(1, Math.ceil(cells.length / (durationMs / FRAME_MS)));
    timer.current = setInterval(() => {
      setRevealed(n => {
        const next = n + step;
        if (next >= cells.length && timer.current) clearInterval(timer.current);
        return Math.min(next, cells.length);
      });
    }, FRAME_MS);

    return () => { if (timer.current) clearInterval(timer.current); };
  }, [playing, animate, reduceMotion, cells, durationMs]);

  if (!map) {
    return (
      <View style={[s.empty, { width: w, height: h }]}>
        <Text style={s.emptyText}>NO ROUTE RECORDED</Text>
      </View>
    );
  }

  const showBasemap = !basemapFailed;
  const barMetres = niceDistance(map.metresPerCell * cols * 0.3);
  const barCells = Math.max(2, Math.round(barMetres / map.metresPerCell));
  const start = cells[0];
  const end = cells[cells.length - 1];
  const finished = revealed >= cells.length;

  return (
    <View style={{ width: w }}>
      <View style={[s.panel, { width: w, height: h }]}>
        {showBasemap && map.fit.tiles.map(tile => (
          <Image
            key={`${map.fit.zoom}/${tile.x}/${tile.y}`}
            source={{ uri: tileUrl(tile, map.fit.zoom) }}
            style={{
              position: 'absolute',
              left: tile.left * map.fit.scale,
              top: tile.top * map.fit.scale,
              width: TILE_SIZE * map.fit.scale,
              height: TILE_SIZE * map.fit.scale,
            }}
            fadeDuration={0}
            onError={() => setBasemapFailed(true)}
          />
        ))}

        {/* Paper wash — knocks the basemap back so the printed route reads as ink. */}
        {showBasemap && <View pointerEvents="none" style={[s.wash, { width: w, height: h }]} />}

        <Svg width={w} height={h} style={StyleSheet.absoluteFill}>
          {/* Without tiles, a graticule so the route still reads as plotted. */}
          {!showBasemap && Array.from({ length: Math.floor(rows / 4) + 1 }, (_, r) =>
            Array.from({ length: Math.floor(cols / 4) + 1 }, (_, c) => (
              <Rect key={`g${r}-${c}`} x={c * 4 * cell} y={r * 4 * cell} width={1} height={1} fill={GRID} />
            )),
          )}

          {cells.slice(0, revealed).map((c, i) => (
            <Rect key={i} x={c.x * cell} y={c.y * cell} width={cell} height={cell} fill={INK} />
          ))}

          {/* Start: a hollow square. Only drawn once the head has reached it. */}
          {revealed > 0 && (
            <Rect
              x={(start.x - 1) * cell} y={(start.y - 1) * cell}
              width={cell * 3} height={cell * 3} fill="none" stroke={INK} strokeWidth={cell}
            />
          )}
          {/* End: filled, and only once the line has actually got there. */}
          {finished && (
            <Rect
              x={(end.x - 1) * cell} y={(end.y - 1) * cell}
              width={cell * 3} height={cell * 3} fill={INK}
            />
          )}
        </Svg>
      </View>

      <View style={s.legend}>
        <View style={s.scale}>
          <View style={[s.scaleBar, { width: barCells * cell }]} />
          <Text style={s.scaleText}>{barMetres >= 1000 ? `${barMetres / 1000}KM` : `${barMetres}M`}</Text>
        </View>
        <Text style={s.legendText}>□ START ■ FINISH</Text>
      </View>

      {/* Required by the tile provider — see lib/mapTiles.ts. */}
      {showBasemap && <Text style={s.attribution}>{ATTRIBUTION}</Text>}
    </View>
  );
}

const s = StyleSheet.create({
  panel: { overflow: 'hidden', backgroundColor: PAPER, borderWidth: 1, borderColor: GRID },
  wash: { position: 'absolute', left: 0, top: 0, backgroundColor: 'rgba(252,251,249,0.20)' },

  empty: { borderWidth: 1, borderColor: GRID, alignItems: 'center', justifyContent: 'center' },
  emptyText: { fontFamily: REG, fontSize: 9, color: MUTED, letterSpacing: 1 },

  legend: { flexDirection: 'row', justifyContent: 'space-between', alignItems: 'center', marginTop: 6 },
  scale: { flexDirection: 'row', alignItems: 'center', gap: 5 },
  scaleBar: { height: 3, borderLeftWidth: 1, borderRightWidth: 1, borderBottomWidth: 1, borderColor: INK },
  scaleText: { fontFamily: BOLD, fontSize: 8, color: INK, letterSpacing: 0.5 },
  legendText: { fontFamily: REG, fontSize: 8, color: MUTED, letterSpacing: 0.5 },
  attribution: { fontFamily: REG, fontSize: 7, color: MUTED, letterSpacing: 0.5, marginTop: 3 },
});
