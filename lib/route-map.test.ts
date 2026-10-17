import { describe, it, expect } from 'vitest';
import { existsSync, readFileSync } from 'fs';
import { classify, decodeTile, paceClasses, routeBbox } from './route-map';

describe('route map', () => {
  it('sorts OpenMapTiles classes into map layers', () => {
    expect(classify('transportation', 'primary')).toBe('major');
    expect(classify('transportation', 'minor')).toBe('minor');
    expect(classify('transportation', 'path')).toBe('path');
    expect(classify('transportation', 'rail')).toBe('rail');
    expect(classify('water', undefined)).toBe('water');
    expect(classify('landcover', 'wood')).toBe('park');
    expect(classify('building', undefined)).toBeNull();
  });
  it('decodes a real tile into streets in lat/lng', () => {
    // A z14 tile over Regent's Park, if one's been fetched locally (curl it to /tmp/t.pbf to run this).
    if (!existsSync('/tmp/t.pbf')) return;
    const buf = readFileSync('/tmp/t.pbf');
    const f = decodeTile(buf.buffer.slice(buf.byteOffset, buf.byteOffset + buf.byteLength), 14, 8185, 5446);
    expect(f.some(x => x.kind === 'major')).toBe(true);
    expect(f.some(x => x.kind === 'park')).toBe(true);
    const p = f[0].pts[0];
    expect(p[0]).toBeGreaterThan(51.5); expect(p[0]).toBeLessThan(51.55);
    expect(p[1]).toBeGreaterThan(-0.2); expect(p[1]).toBeLessThan(-0.1);
  });
  it('pads a tiny route to a usable box', () => {
    const b = routeBbox([{ lat: 51.5, lng: -0.12 }, { lat: 51.5001, lng: -0.1201 }]);
    expect(b.n - b.s).toBeGreaterThan(0.007);
  });
  it('colours pace against the run average', () => {
    const t0 = 0;
    // 10 m steps: first half at 4 s each, second half at 6 s each.
    const wp = Array.from({ length: 21 }, (_, i) => ({ lat: 51.5 + i * 0.00009, lng: 0, timestamp: t0 + (i <= 10 ? i * 4000 : 40000 + (i - 10) * 6000) }));
    const c = paceClasses(wp);
    expect(c[1]).toBe('fast');
    expect(c[c.length - 2]).toBe('slow');
  });
});
