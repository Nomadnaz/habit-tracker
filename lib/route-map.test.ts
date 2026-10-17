import { describe, it, expect } from 'vitest';
import { existsSync, readFileSync } from 'fs';
import { classify, decodeTile, paceClasses, routeBbox, sampleRoute, pack, unpack } from './route-map';

describe('route map', () => {
  it('sorts OpenMapTiles classes into map layers', () => {
    expect(classify('transportation', 'primary')).toBe('major');
    expect(classify('transportation', 'minor')).toBe('minor');
    expect(classify('transportation', 'path')).toBe('path');
    expect(classify('transportation', 'rail')).toBe('rail');
    expect(classify('water', undefined)).toBe('water');
    expect(classify('landcover', 'wood')).toBe('park');
    expect(classify('building', undefined)).toBe('building');
    expect(classify('transportation_name', 'service')).toBeNull();
    expect(classify('transportation_name', 'primary')).toBe('name');
  });
  it('decodes a real tile into streets in lat/lng', () => {
    // A z14 tile over Regent's Park, if one's been fetched locally (curl it to /tmp/t.pbf to run this).
    if (!existsSync('/tmp/t.pbf')) return;
    const buf = readFileSync('/tmp/t.pbf');
    const f = decodeTile(buf.buffer.slice(buf.byteOffset, buf.byteOffset + buf.byteLength), 14, 8185, 5446);
    expect(f.some(x => x.kind === 'major')).toBe(true);
    expect(f.some(x => x.kind === 'park')).toBe(true);
    expect(f.filter(x => x.kind === 'building').length).toBeGreaterThan(100);
    expect(f.some(x => x.kind === 'name' && !!x.name)).toBe(true);
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
  it('resamples a route evenly with km marks and a pace ratio', () => {
    // 2.2 km due north in 10 m steps: first km at 4 s/10 m, then 6 s/10 m.
    const wp = Array.from({ length: 221 }, (_, i) => ({ lat: 51.5 + i * 0.0000899, lng: 0, timestamp: (i <= 100 ? i * 4 : 400 + (i - 100) * 6) * 1000 }));
    const r = sampleRoute(wp, 120);
    expect(r.lat.length).toBeLessThanOrEqual(121);
    expect(r.total).toBeGreaterThan(2150);
    expect(r.km.length).toBe(2);
    expect(r.m[r.km[0]]).toBeGreaterThanOrEqual(1000);
    expect(r.ratio[2]).toBeLessThan(0.9);
    expect(r.ratio[r.ratio.length - 3]).toBeGreaterThan(1.1);
    expect(sampleRoute([wp[0]]).lat.length).toBe(1);
  });
  it('packs features losslessly to a micro-degree', () => {
    const f = [{ kind: 'building' as const, pts: [[51.527412, -0.154301], [51.52745, -0.15422]] as [number, number][], closed: true, h: 12 },
      { kind: 'name' as const, pts: [[51.5, -0.1], [51.5001, -0.1002]] as [number, number][], closed: false, name: 'Euston Road' }];
    const back = unpack(JSON.parse(JSON.stringify(pack(f))));
    expect(back[0].pts[1][0]).toBeCloseTo(51.52745, 6);
    expect(back[0]).toMatchObject({ kind: 'building', closed: true, h: 12 });
    expect(back[1]).toMatchObject({ name: 'Euston Road', closed: false });
  });
});
