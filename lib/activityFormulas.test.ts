import { describe, it, expect } from 'vitest';
import { computeDistanceM, computeElevationGainM, computePacePerKm, computeSplits, type Waypoint } from './activityFormulas';

// Roughly 1km per 0.009 degrees of latitude at the equator.
function wp(latOffsetKm: number, timestamp: number): Waypoint {
  return { lat: latOffsetKm * 0.009, lng: 0, timestamp };
}

describe('computeSplits', () => {
  it('returns no splits for fewer than 2 waypoints', () => {
    expect(computeSplits([])).toEqual([]);
    expect(computeSplits([wp(0, 0)])).toEqual([]);
  });

  it('cuts a split every real kilometre using real timestamps', () => {
    const waypoints = [
      wp(0, 0),
      wp(1, 5 * 60 * 1000),   // 1km @ 5:00
      wp(2, 11 * 60 * 1000),  // 2nd km @ 6:00 (slower)
    ];
    const splits = computeSplits(waypoints);
    expect(splits.length).toBe(2);
    expect(splits[0].km).toBe(1);
    expect(splits[0].paceSecPerKm).toBeCloseTo(300, -1);
    expect(splits[1].km).toBe(2);
    expect(splits[1].paceSecPerKm).toBeCloseTo(360, -1);
  });

  it('reports a final partial kilometre instead of dropping it', () => {
    const waypoints = [
      wp(0, 0),
      wp(1, 5 * 60 * 1000),
      wp(1.5, 8 * 60 * 1000), // half a km more
    ];
    const splits = computeSplits(waypoints);
    expect(splits.length).toBe(2);
    expect(splits[1].km).toBeCloseTo(1.5, 1);
  });

  it('does not fabricate a trailing split from negligible leftover distance', () => {
    const waypoints = [wp(0, 0), wp(1, 5 * 60 * 1000), wp(1.0005, 5 * 60 * 1000 + 1000)];
    const splits = computeSplits(waypoints);
    expect(splits.length).toBe(1);
  });
});

describe('computeDistanceM / computeElevationGainM / computePacePerKm', () => {
  it('computes real distance from real waypoints', () => {
    const waypoints = [wp(0, 0), wp(1, 1000)];
    expect(computeDistanceM(waypoints)).toBeCloseTo(1000, -1);
  });

  it('only counts ascending altitude changes as gain', () => {
    const waypoints = [
      { lat: 0, lng: 0, altitude: 100, timestamp: 0 },
      { lat: 0, lng: 0, altitude: 150, timestamp: 1000 }, // +50
      { lat: 0, lng: 0, altitude: 120, timestamp: 2000 }, // descent, ignored
      { lat: 0, lng: 0, altitude: 140, timestamp: 3000 }, // +20
    ];
    expect(computeElevationGainM(waypoints)).toBe(70);
  });

  it('returns undefined pace for negligible distance instead of a division blowup', () => {
    expect(computePacePerKm(5, 60)).toBeUndefined();
  });
});
