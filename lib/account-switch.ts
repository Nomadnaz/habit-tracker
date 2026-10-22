// ─────────────────────────────────────────────────────────────────────────
// One phone, several accounts. The app is local-first: everything you log
// lives in AsyncStorage, which knew nothing about who was signed in — so a
// second account on the same phone opened onto the first one's logs.
//
// Now the phone remembers whose data is on it (@owner_uid). When a different
// account signs in, the current owner's data is set aside under
// @stash:<uid>:<key>, and the new account gets back whatever it left here
// before (or starts empty). Nothing is deleted: signing back in swaps it back.
//
// Kept through a swap: the Supabase session, onboarding state (the device's,
// and the answers of whoever is about to sign up) and the stash itself.
// A phone with data but no recorded owner (installs from before this) is
// adopted by the first account that signs in, without moving anything.
// ─────────────────────────────────────────────────────────────────────────

import AsyncStorage from '@react-native-async-storage/async-storage';

const OWNER_KEY = '@owner_uid';
const STASH = '@stash:';
const DEVICE_KEYS = new Set([OWNER_KEY, '@onboarding_complete', '@onboarding_answers']);

const isAccountData = (k: string) => !DEVICE_KEYS.has(k) && !k.startsWith(STASH) && !k.startsWith('sb-');

/** Make the phone's local data `uid`'s. Returns true when it swapped accounts. */
export async function adoptAccount(uid: string): Promise<boolean> {
  const owner = await AsyncStorage.getItem(OWNER_KEY);
  if (owner === uid) return false;
  if (!owner) {
    await AsyncStorage.setItem(OWNER_KEY, uid);
    return false;
  }

  const keys = await AsyncStorage.getAllKeys();

  // Set the current owner's data aside, a key at a time (Android caps one value at ~2 MB).
  const mine = keys.filter(isAccountData);
  const pairs = await AsyncStorage.multiGet(mine);
  const stash: [string, string][] = pairs.filter((p): p is [string, string] => p[1] != null).map(([k, v]) => [`${STASH}${owner}:${k}`, v]);
  if (stash.length) await AsyncStorage.multiSet(stash);
  if (mine.length) await AsyncStorage.multiRemove(mine);

  // Bring back what the incoming account left on this phone, if anything.
  const prefix = `${STASH}${uid}:`;
  const theirs = keys.filter(k => k.startsWith(prefix));
  if (theirs.length) {
    const back = await AsyncStorage.multiGet(theirs);
    await AsyncStorage.multiSet(back.filter((p): p is [string, string] => p[1] != null).map(([k, v]) => [k.slice(prefix.length), v]));
    await AsyncStorage.multiRemove(theirs);
  }

  await AsyncStorage.setItem(OWNER_KEY, uid);
  return true;
}
