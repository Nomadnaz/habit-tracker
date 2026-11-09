-- ═══════════════════════════════════════════════════════════════════════════
-- 033_delete_account.sql — let a signed-in user delete their own account
--
-- App Store guideline 5.1.1(v): an app that lets you create an account must
-- let you delete it from inside the app. Settings → DELETE ACCOUNT calls this.
--
-- Deleting the auth.users row removes everything: every user table references
-- auth.users ON DELETE CASCADE — except tasks (a prototype FK with no action),
-- which would block the delete, so its rows go first. Meal photos in storage
-- can't be deleted from SQL (storage.protect_objects_delete); the app removes
-- them through the Storage API before calling this.
--
-- SECURITY DEFINER so it can touch auth.users; it only ever acts on
-- auth.uid(), so a caller can delete themselves and no one else. Not callable
-- by anon (auth.uid() would be null anyway).
-- ═══════════════════════════════════════════════════════════════════════════

CREATE OR REPLACE FUNCTION public.delete_my_account()
RETURNS void
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = ''
AS $$
DECLARE
  uid uuid := auth.uid();
BEGIN
  IF uid IS NULL THEN
    RAISE EXCEPTION 'not signed in' USING ERRCODE = '42501';
  END IF;
  DELETE FROM public.tasks WHERE user_id = uid;
  DELETE FROM auth.users WHERE id = uid;
END;
$$;

REVOKE EXECUTE ON FUNCTION public.delete_my_account() FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION public.delete_my_account() TO authenticated;
