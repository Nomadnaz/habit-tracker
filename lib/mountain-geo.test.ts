import { describe, it, expect } from 'vitest';
import { height, render } from './mountain-geo';

describe('mountain', () => {
  it('peaks near the middle and falls to nothing at the rim', () => {
    expect(height(0.26, -0.14)).toBeGreaterThan(0.6);  // main summit
    expect(height(-0.42, 0.28)).toBeGreaterThan(0.45); // the twin
    expect(height(-0.08, 0.07)).toBeLessThan(height(-0.42, 0.28)); // the saddle dips below both
    expect(height(1.2, 0)).toBe(-1);
  });
  it('renders a centred mountain into the character grid', () => {
    const f = render(0.6, 0.42, 356, 306, 6, 10, 0.5, [{ t: 0.1, label: '10K', reached: true }]);
    const text = f.rows.map(r => r.map(s => s.text).join(''));
    const filled = text.map(l => l.replace(/ /g, '').length);
    expect(Math.max(...filled)).toBeGreaterThan(30);
    expect(f.route.length).toBeGreaterThan(0);
    expect(f.near).toBe(false);
  });
  it('switches to grass and sprites up close', () => {
    const g = render(0.6, 0.42, 356, 306, 6, 10, 0.45, [], 2.6, 3);
    const text = g.rows.map(r => r.map(s => s.text).join('')).join('');
    expect(g.near).toBe(true);
    expect(/[\/|]/.test(text)).toBe(true);
  });
});
