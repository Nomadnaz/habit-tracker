import { describe, it, expect } from 'vitest';
import {
  boundsOf, fitRoute, metresPerPixel, project, tilesFor, tileUrl, toPanel,
  MAX_ZOOM, TILE_SIZE,
} from './mapTiles';

describe('project', () => {
  it('puts 0,0 at the centre of the world', () => {
    const p = project({ lat: 0, lng: 0 }, 0);
    expect(p.x).toBeCloseTo(TILE_SIZE / 2, 6);
    expect(p.y).toBeCloseTo(TILE_SIZE / 2, 6);
  });

  it('grows x eastward and y southward', () => {
    const west = project({ lat: 0, lng: -50 }, 10);
    const east = project({ lat: 0, lng: 50 }, 10);
    const north = project({ lat: 50, lng: 0 }, 10);
    const south = project({ lat: -50, lng: 0 }, 10);
    expect(east.x).toBeGreaterThan(west.x);
    expect(south.y).toBeGreaterThan(north.y);
  });

  it('doubles the world with each zoom level', () => {
    const a = project({ lat: 47.61, lng: -122.34 }, 10);
    const b = project({ lat: 47.61, lng: -122.34 }, 11);
    expect(b.x).toBeCloseTo(a.x * 2, 6);
    expect(b.y).toBeCloseTo(a.y * 2, 6);
  });

  it('clamps beyond the Mercator latitude limit instead of diverging', () => {
    // Unclamped, tan(90deg) sends y to -Infinity. Clamped, the point lands on
    // the top edge of the world (y = 0, modulo float dust).
    const p = project({ lat: 89.9, lng: 0 }, 5);
    expect(Number.isFinite(p.y)).toBe(true);
    expect(p.y).toBeCloseTo(0, 5);
  });
});

const GREEN_LAKE = [
  { lat: 47.6832, lng: -122.3450 },
  { lat: 47.6742, lng: -122.3300 },
];
const W = 228, H = 164, PAD = 10;

describe('fitRoute', () => {
  it('fills the panel on its limiting axis instead of settling for an integer zoom', () => {
    const fit = fitRoute(GREEN_LAKE, W, H);
    const a = toPanel(GREEN_LAKE[0], fit);
    const b = toPanel(GREEN_LAKE[1], fit);
    const drawnW = Math.abs(b.x - a.x), drawnH = Math.abs(b.y - a.y);
    // One axis lands exactly on the padded panel; neither overflows.
    expect(Math.max(drawnW / (W - PAD * 2), drawnH / (H - PAD * 2))).toBeCloseTo(1, 6);
    expect(drawnW).toBeLessThanOrEqual(W - PAD * 2 + 1e-6);
    expect(drawnH).toBeLessThanOrEqual(H - PAD * 2 + 1e-6);
  });

  it('scales tiles down, never up, for any route big enough to need it', () => {
    const fit = fitRoute(GREEN_LAKE, W, H);
    expect(fit.scale).toBeGreaterThan(0.5);
    expect(fit.scale).toBeLessThanOrEqual(1);
  });

  it('centres the route in the panel', () => {
    const fit = fitRoute(GREEN_LAKE, W, H);
    const a = toPanel(GREEN_LAKE[0], fit);
    const b = toPanel(GREEN_LAKE[1], fit);
    expect((a.x + b.x) / 2).toBeCloseTo(W / 2, 6);
    expect((a.y + b.y) / 2).toBeCloseTo(H / 2, 6);
  });

  it('keeps true aspect ratio — a square route draws square', () => {
    // 0.002 deg of latitude, and the longitude span that matches it in metres.
    const lat = 47.61;
    const dLng = 0.002 / Math.cos((lat * Math.PI) / 180);
    const square = [{ lat, lng: -122.34 }, { lat: lat + 0.002, lng: -122.34 + dLng }];
    const fit = fitRoute(square, W, H);
    const a = toPanel(square[0], fit), b = toPanel(square[1], fit);
    // Tolerance is loose because cos(lat) only matches Mercator's stretch at a
    // single latitude, so the synthetic square is itself approximate. An
    // uncorrected fit would be out by ~30%, not 0.05px.
    expect(Math.abs(b.x - a.x)).toBeCloseTo(Math.abs(b.y - a.y), 1);
  });

  it('caps at MAX_ZOOM rather than chasing a single point forever', () => {
    const fit = fitRoute([{ lat: 47.61, lng: -122.34 }], W, H);
    expect(fit.zoom).toBe(MAX_ZOOM);
    expect(Number.isFinite(fit.scale)).toBe(true);
    expect(fit.tiles.length).toBeGreaterThan(0);
  });

  it('survives a route with no extent on one axis', () => {
    const dueNorth = [{ lat: 47.610, lng: -122.34 }, { lat: 47.615, lng: -122.34 }];
    const fit = fitRoute(dueNorth, W, H);
    const a = toPanel(dueNorth[0], fit), b = toPanel(dueNorth[1], fit);
    expect(a.x).toBeCloseTo(W / 2, 6);
    expect(Math.abs(b.y - a.y)).toBeCloseTo(H - PAD * 2, 6);
  });

  it('covers every pixel of the panel with tiles', () => {
    const fit = fitRoute(GREEN_LAKE, W, H);
    const left = Math.min(...fit.tiles.map(t => t.left * fit.scale));
    const top = Math.min(...fit.tiles.map(t => t.top * fit.scale));
    const right = Math.max(...fit.tiles.map(t => (t.left + TILE_SIZE) * fit.scale));
    const bottom = Math.max(...fit.tiles.map(t => (t.top + TILE_SIZE) * fit.scale));
    expect(left).toBeLessThanOrEqual(0);
    expect(top).toBeLessThanOrEqual(0);
    expect(right).toBeGreaterThanOrEqual(W);
    expect(bottom).toBeGreaterThanOrEqual(H);
  });

  it('reports ground resolution per panel pixel, scale included', () => {
    const fit = fitRoute(GREEN_LAKE, W, H);
    const a = toPanel(GREEN_LAKE[0], fit), b = toPanel(GREEN_LAKE[1], fit);
    // The route's real diagonal, measured back off the drawn pixels.
    const drawnDiagM = Math.hypot(b.x - a.x, b.y - a.y) * fit.metresPerPixel;
    expect(drawnDiagM).toBeGreaterThan(1500);
    expect(drawnDiagM).toBeLessThan(2200);
  });
});

describe('tilesFor', () => {
  it('wraps x across the antimeridian and never asks for an off-world y', () => {
    const zoom = 3;
    const count = 2 ** zoom;
    const tiles = tilesFor({ x: -TILE_SIZE * 0.5, y: -TILE_SIZE * 0.5 }, W, H, zoom);
    for (const t of tiles) {
      expect(t.x).toBeGreaterThanOrEqual(0);
      expect(t.x).toBeLessThan(count);
      expect(t.y).toBeGreaterThanOrEqual(0);
      expect(t.y).toBeLessThan(count);
    }
  });

  it('builds a url with the tile it was given', () => {
    expect(tileUrl({ x: 5, y: 9, left: 0, top: 0 }, 12)).toContain('/12/5/9.png');
  });
});

describe('metresPerPixel', () => {
  it('is ~156km at the equator, zoom 0', () => {
    expect(metresPerPixel(0, 0)).toBeCloseTo(156543, 0);
  });

  it('halves with each zoom level and shrinks away from the equator', () => {
    expect(metresPerPixel(0, 11)).toBeCloseTo(metresPerPixel(0, 10) / 2, 6);
    expect(metresPerPixel(47.61, 15)).toBeLessThan(metresPerPixel(0, 15));
  });
});
