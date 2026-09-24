// ─────────────────────────────────────────────────────────────────────────
// mapTiles.ts — Web Mercator tile math for the receipt's route basemap.
// ─────────────────────────────────────────────────────────────────────────
// Zero React Native / Supabase imports on purpose, same reason as
// lib/activityFormulas.ts: pure geometry stays unit-testable.
//
// TILE PROVIDER: CARTO's free "light_all" basemap (OpenStreetMap data). It
// needs no API key, and it's greyscale, which is why it survives being
// printed onto receipt paper. Attribution is REQUIRED and is rendered by
// components/PixelRouteMap.tsx — do not drop it.
//
// Swapping providers is a one-line change to TILE_URL + ATTRIBUTION:
//   Stadia "Stamen Toner Lite" (needs a free key, true 1-bit look):
//     https://tiles.stadiamaps.com/tiles/stamen_toner_lite/{z}/{x}/{y}.png?api_key=KEY
//   MapTiler, Thunderforest, or a self-hosted raster set all work the same way.
// Before shipping commercially, check the chosen provider's terms — CARTO's
// free tier is usage-limited.
// ─────────────────────────────────────────────────────────────────────────

export const TILE_SIZE = 256;
export const MAX_ZOOM = 17;

export const TILE_URL = 'https://basemaps.cartocdn.com/light_all/{z}/{x}/{y}.png';
export const ATTRIBUTION = '© OPENSTREETMAP © CARTO';

/** Web Mercator's latitude limit — beyond it the projection diverges. */
const MAX_LAT = 85.05112878;

export type LatLng = { lat: number; lng: number };
export type Bounds = { north: number; south: number; east: number; west: number };
export type Point = { x: number; y: number };
export type Tile = { x: number; y: number; left: number; top: number };

/** Latitude/longitude to world pixel coordinates at `zoom`. */
export function project(p: LatLng, zoom: number): Point {
  const scale = TILE_SIZE * 2 ** zoom;
  const lat = Math.max(-MAX_LAT, Math.min(MAX_LAT, p.lat));
  const s = Math.sin((lat * Math.PI) / 180);
  return {
    x: ((p.lng + 180) / 360) * scale,
    y: (0.5 - Math.log((1 + s) / (1 - s)) / (4 * Math.PI)) * scale,
  };
}

export function boundsOf(points: LatLng[]): Bounds {
  return {
    north: Math.max(...points.map(p => p.lat)),
    south: Math.min(...points.map(p => p.lat)),
    east: Math.max(...points.map(p => p.lng)),
    west: Math.min(...points.map(p => p.lng)),
  };
}

/**
 * Raster tiles only exist at integer zooms, so fitting the route to the panel
 * by zoom alone leaves it up to half the size it could be. Instead: find the
 * fractional zoom that fits exactly, fetch the next zoom UP, and scale those
 * tiles down to it. `scale` is what every tile and every projected point gets
 * multiplied by to land in panel pixels.
 */
export type Fit = {
  zoom: number;
  scale: number;
  origin: Point;
  tiles: Tile[];
  /** Ground resolution in metres per PANEL pixel, scale included. */
  metresPerPixel: number;
};

/** Upscaling past this just prints blur — only reachable on a sub-150m route. */
const MAX_SCALE = 1.6;

export function fitRoute(points: LatLng[], width: number, height: number, padding = 10): Fit {
  const bounds = boundsOf(points);
  const nw0 = project({ lat: bounds.north, lng: bounds.west }, 0);
  const se0 = project({ lat: bounds.south, lng: bounds.east }, 0);
  const spanX = se0.x - nw0.x;
  const spanY = se0.y - nw0.y;

  // A route with no extent on an axis puts no constraint on that axis.
  const fitX = spanX > 0 ? Math.log2((width - padding * 2) / spanX) : Infinity;
  const fitY = spanY > 0 ? Math.log2((height - padding * 2) / spanY) : Infinity;
  const ideal = Math.min(fitX, fitY);

  const zoom = Math.max(1, Math.min(MAX_ZOOM, Math.ceil(Number.isFinite(ideal) ? ideal : MAX_ZOOM)));
  const scale = Math.min(MAX_SCALE, Number.isFinite(ideal) ? 2 ** (ideal - zoom) : 1);

  // The panel shows width/scale world pixels, centred on the route.
  const nw = project({ lat: bounds.north, lng: bounds.west }, zoom);
  const se = project({ lat: bounds.south, lng: bounds.east }, zoom);
  const origin = {
    x: (nw.x + se.x) / 2 - width / 2 / scale,
    y: (nw.y + se.y) / 2 - height / 2 / scale,
  };

  return {
    zoom,
    scale,
    origin,
    tiles: tilesFor(origin, width / scale, height / scale, zoom),
    metresPerPixel: metresPerPixel((bounds.north + bounds.south) / 2, zoom) / scale,
  };
}

/** Project a point into panel pixels under a given fit. */
export function toPanel(p: LatLng, fit: Fit): Point {
  const px = project(p, fit.zoom);
  return { x: (px.x - fit.origin.x) * fit.scale, y: (px.y - fit.origin.y) * fit.scale };
}

/**
 * Every tile touching the panel, with its offset from the panel's top-left in
 * WORLD pixels — multiply by `fit.scale` to place it. x wraps around the
 * antimeridian; y is clamped, since there are no tiles above the north pole.
 */
export function tilesFor(origin: Point, width: number, height: number, zoom: number): Tile[] {
  const count = 2 ** zoom;
  const firstX = Math.floor(origin.x / TILE_SIZE);
  const lastX = Math.floor((origin.x + width) / TILE_SIZE);
  const firstY = Math.max(0, Math.floor(origin.y / TILE_SIZE));
  const lastY = Math.min(count - 1, Math.floor((origin.y + height) / TILE_SIZE));

  const tiles: Tile[] = [];
  for (let ty = firstY; ty <= lastY; ty++) {
    for (let tx = firstX; tx <= lastX; tx++) {
      tiles.push({
        x: ((tx % count) + count) % count,
        y: ty,
        left: tx * TILE_SIZE - origin.x,
        top: ty * TILE_SIZE - origin.y,
      });
    }
  }
  return tiles;
}

export function tileUrl(tile: Tile, zoom: number): string {
  return TILE_URL
    .replace('{z}', String(zoom))
    .replace('{x}', String(tile.x))
    .replace('{y}', String(tile.y));
}

/** Ground resolution — metres per screen pixel at this latitude and zoom. */
export function metresPerPixel(lat: number, zoom: number): number {
  return (156543.03392 * Math.cos((lat * Math.PI) / 180)) / 2 ** zoom;
}
