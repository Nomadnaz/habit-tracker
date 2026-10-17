// ─────────────────────────────────────────────────────────────────────────
// Wearables — Settings' CONNECT WEARABLE. Every ring, strap and watch below
// writes its readings into Apple Health from its own app, so one connector
// covers them all: the user turns on that app's Apple Health sharing, grants
// this app read access, and from then on the coach (lib/coach.ts) reads HRV,
// resting heart rate, sleep and breathing rate from that device in
// particular — samples are filtered by source name, so an Oura's overnight
// HRV isn't averaged with an Apple Watch's daytime spot checks (they measure
// differently, and mixing them would wreck the baseline).
//
// Not here: the vendors' own cloud APIs (Oura API v2, WHOOP API). Those need
// a registered developer app per vendor with its secret on a server, and add
// mostly the vendors' own scores on top of the raw numbers Health already has.
// ─────────────────────────────────────────────────────────────────────────

import AsyncStorage from '@react-native-async-storage/async-storage';

export type WearableId = 'oura' | 'whoop' | 'apple' | 'garmin' | 'polar' | 'withings' | 'ultrahuman' | 'fitbit';
export type Metric = 'hrv' | 'rhr' | 'sleep' | 'resp';

export type Wearable = {
  id: WearableId;
  name: string;
  kind: string;
  /** Matches the source name its samples carry in Apple Health. */
  source: RegExp;
  /** Where the user turns on Apple Health sharing in the vendor's app; null = it can't. */
  setup: string | null;
  icon: string;
};

export const WEARABLES: Wearable[] = [
  { id: 'oura', name: 'OURA RING', kind: 'RING', source: /oura/i, icon: 'ring',
    setup: 'In the Oura app, open settings, find Apple Health and turn sharing on for everything.' },
  { id: 'whoop', name: 'WHOOP', kind: 'STRAP', source: /whoop/i, icon: 'watch-variant',
    setup: 'In the WHOOP app, open settings → integrations → Apple Health, and allow everything.' },
  { id: 'apple', name: 'APPLE WATCH', kind: 'WATCH', source: /watch/i, icon: 'watch',
    setup: 'Nothing to do — the watch writes to Apple Health already. Wear it to bed for sleep and HRV.' },
  { id: 'garmin', name: 'GARMIN', kind: 'WATCH', source: /garmin/i, icon: 'watch',
    setup: 'In Garmin Connect, open settings → connected apps → Apple Health, and allow everything.' },
  { id: 'polar', name: 'POLAR', kind: 'WATCH', source: /polar/i, icon: 'watch',
    setup: 'In Polar Flow, open settings, find Apple Health and turn it on.' },
  { id: 'withings', name: 'WITHINGS', kind: 'WATCH · SCALE', source: /withings|health mate/i, icon: 'scale-bathroom',
    setup: 'In the Withings app, open settings → health apps → Apple Health, and allow everything.' },
  { id: 'ultrahuman', name: 'ULTRAHUMAN', kind: 'RING', source: /ultrahuman/i, icon: 'ring',
    setup: 'In the Ultrahuman app, open your profile, find Apple Health and connect it.' },
  { id: 'fitbit', name: 'FITBIT', kind: 'BAND', source: /fitbit/i, icon: 'watch-variant',
    setup: null },
];

export const wearableById = (id: WearableId | null | undefined) => WEARABLES.find(w => w.id === id) ?? null;

export type WearableLink = {
  id: WearableId;
  connectedAt: string;
  /** What the last check actually found from it: metric → newest sample (ISO). */
  found: Partial<Record<Metric, string>>;
};

const KEY = '@wearable';

export async function getWearable(): Promise<WearableLink | null> {
  try { const raw = await AsyncStorage.getItem(KEY); return raw ? JSON.parse(raw) : null; } catch { return null; }
}

export async function setWearable(link: WearableLink | null): Promise<void> {
  if (link) await AsyncStorage.setItem(KEY, JSON.stringify(link));
  else await AsyncStorage.removeItem(KEY);
}

export const METRIC_LABEL: Record<Metric, string> = { hrv: 'HRV', rhr: 'RESTING HR', sleep: 'SLEEP', resp: 'BREATHING' };
