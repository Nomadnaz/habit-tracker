import { beforeEach, describe, expect, it, vi } from 'vitest';

const store = new Map<string, string>();
vi.mock('@react-native-async-storage/async-storage', () => ({
  default: {
    getItem: async (k: string) => store.get(k) ?? null,
    setItem: async (k: string, v: string) => { store.set(k, v); },
    getAllKeys: async () => [...store.keys()],
    multiGet: async (ks: string[]) => ks.map(k => [k, store.get(k) ?? null]),
    multiSet: async (ps: [string, string][]) => { ps.forEach(([k, v]) => store.set(k, v)); },
    multiRemove: async (ks: string[]) => { ks.forEach(k => store.delete(k)); },
  },
}));

import { adoptAccount } from './account-switch';

const SESSION = 'sb-ref-auth-token';

describe('adoptAccount', () => {
  beforeEach(() => store.clear());

  it('adopts an unowned phone without moving its data', async () => {
    store.set('@meals', 'old');
    expect(await adoptAccount('A')).toBe(false);
    expect(store.get('@meals')).toBe('old');
    expect(store.get('@owner_uid')).toBe('A');
  });

  it('gives a new account an empty phone and keeps the session + onboarding', async () => {
    store.set('@owner_uid', 'A'); store.set('@meals', 'A meals'); store.set('@tasks', 'A tasks');
    store.set(SESSION, 'B session'); store.set('@onboarding_complete', 'true');
    expect(await adoptAccount('B')).toBe(true);
    expect(store.get('@meals')).toBeUndefined();
    expect(store.get('@tasks')).toBeUndefined();
    expect(store.get(SESSION)).toBe('B session');
    expect(store.get('@onboarding_complete')).toBe('true');
    expect(store.get('@owner_uid')).toBe('B');
  });

  it('swaps back to the first account intact', async () => {
    store.set('@owner_uid', 'A'); store.set('@meals', 'A meals');
    await adoptAccount('B');
    store.set('@meals', 'B meals');
    await adoptAccount('A');
    expect(store.get('@meals')).toBe('A meals');
    await adoptAccount('B');
    expect(store.get('@meals')).toBe('B meals');
    expect([...store.keys()].filter(k => k.startsWith('@stash:A:'))).toEqual(['@stash:A:@meals']);
  });

  it('does nothing for the same account', async () => {
    store.set('@owner_uid', 'A'); store.set('@meals', 'A meals');
    expect(await adoptAccount('A')).toBe(false);
    expect(store.get('@meals')).toBe('A meals');
  });
});
