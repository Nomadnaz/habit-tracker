import { describe, it, expect } from 'vitest';
import { buildVitals, type Sample, type SleepSample } from './vitals';

const at = (d: number, h: number, m = 0) => new Date(2026, 9, d, h, m).toISOString();
const q = (d: number, value: number, sourceName: string): Sample => ({ value, startDate: at(d, 3), endDate: at(d, 3, 1), sourceName });
const sl = (value: string, from: string, to: string, sourceName: string): SleepSample => ({ value, startDate: from, endDate: to, sourceName });

describe('buildVitals', () => {
  it('keeps one HRV source — the connected wearable — and converts to ms', () => {
    const hrv = [q(13, 0.055, 'Oura'), q(13, 0.065, 'Oura'), q(13, 0.03, 'Nova’s Apple Watch'), q(14, 0.07, 'Oura')];
    const { vitals, seen } = buildVitals({ hrv, rhr: [], resp: [], spo2: [], sleep: [], prefer: /oura/i });
    expect(vitals.hrv).toEqual({ '2026-10-13': 60, '2026-10-14': 70 });
    expect(vitals.sources.hrv).toBe('Oura');
    expect(seen.filter(s => s.metric === 'hrv').map(s => s.source).sort()).toEqual(['Nova’s Apple Watch', 'Oura']);
  });

  it('falls back to the busiest source when the wearable wrote nothing', () => {
    const rhr = [q(13, 52, 'Watch'), q(14, 50, 'Watch'), q(14, 70, 'iPhone')];
    const { vitals } = buildVitals({ hrv: [], rhr, resp: [], spo2: [], sleep: [], prefer: /whoop/i });
    expect(vitals.rhr).toEqual({ '2026-10-13': 52, '2026-10-14': 50 });
  });

  it('adds up one source’s sleep stages per night, not two devices’ overlapping ones', () => {
    const sleep = [
      sl('CORE', at(13, 23), at(14, 2), 'Oura'), sl('DEEP', at(14, 2), at(14, 3), 'Oura'),
      sl('REM', at(14, 3), at(14, 4), 'Oura'), sl('AWAKE', at(14, 4), at(14, 4, 20), 'Oura'), sl('CORE', at(14, 4, 20), at(14, 7), 'Oura'),
      sl('ASLEEP', at(13, 23, 30), at(14, 6), 'Watch'),
      sl('INBED', at(13, 22, 30), at(14, 7, 30), 'iPhone'),
    ];
    const { vitals } = buildVitals({ hrv: [], rhr: [], resp: [], spo2: [], sleep, prefer: /oura/i });
    expect(vitals.sleep['2026-10-14']).toEqual({ asleep: 460, deep: 60, rem: 60, awake: 20 });
    expect(vitals.sources.sleep).toBe('Oura');
  });

  it('reads SpO2 as a percentage', () => {
    const { vitals } = buildVitals({ hrv: [], rhr: [], resp: [], spo2: [q(13, 0.95, 'Watch'), q(14, 0.97, 'Watch')], sleep: [], prefer: null });
    expect(vitals.spo2).toBe(97);
  });
});
