// ─────────────────────────────────────────────────────────────────────────
// Delete the signed-in account, everywhere (App Store guideline 5.1.1(v)).
//
// 1. Meal photos in Storage (SQL can't delete storage objects).
// 2. delete_my_account() (migration 033): the auth user, and through
//    ON DELETE CASCADE every row the account owns.
// 3. This phone's copy of the account's data, then a local sign-out (the
//    server session went with the user).
// If step 2 fails nothing local is touched, so the user can try again.
// ─────────────────────────────────────────────────────────────────────────

import { supabase } from './supabase';
import { forgetAccount } from './account-switch';

async function removePhotos(uid: string): Promise<void> {
  const bucket = supabase.storage.from('meal-photos');
  for (;;) {
    const { data, error } = await bucket.list(uid, { limit: 100 });
    if (error || !data?.length) return;
    const { error: rmError } = await bucket.remove(data.map(f => `${uid}/${f.name}`));
    if (rmError) return;
  }
}

export async function deleteAccount(): Promise<void> {
  const { data: { user } } = await supabase.auth.getUser();
  if (!user) throw new Error('Sign in again, then try once more.');

  await removePhotos(user.id).catch(() => {});

  const { error } = await supabase.rpc('delete_my_account');
  if (error) throw new Error(error.message);

  await forgetAccount(user.id);
  await supabase.auth.signOut({ scope: 'local' });
}
