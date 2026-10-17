import { describe, it, expect } from 'vitest';
import { height, render } from './mountain-geo';

describe('mountain', () => {
  it('peaks near the middle and falls to nothing at the rim', () => {
    expect(height(0.04, -0.02)).toBeGreaterThan(0.5);
    expect(height(0.98, 0)).toBeLessThan(0.05);
    expect(height(1.2, 0)).toBe(-1);
  });
  it('renders a centred mountain into the character grid', () => {
    const f = render(0.6, 0.42, 356, 306, 6, 10, 0.5, [{ t: 0.1, label: '10K', reached: true }]);
    const text = f.rows.map(r => r.map(s => s.text).join(''));
    const filled = text.map(l => l.replace(/ /g, '').length);
    expect(Math.max(...filled)).toBeGreaterThan(30);
    expect(f.peak.x).toBeGreaterThan(356 * 0.35);
    expect(f.peak.x).toBeLessThan(356 * 0.65);
    expect(f.route.length).toBeGreaterThan(0);
  });
});
