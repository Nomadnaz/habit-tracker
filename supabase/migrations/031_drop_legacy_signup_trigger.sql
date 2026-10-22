-- ═══════════════════════════════════════════════════════════════════════════
-- 031_drop_legacy_signup_trigger.sql — new accounts could not be created
--
-- The pre-system-model prototype left a trigger on auth.users,
-- on_auth_user_created → public.handle_new_user(), which inserts into
-- public.profiles and public.bonsai. Both tables were dropped on 2026-07-06
-- (APPLIED.md "Legacy table cleanup") but the trigger was not, so every
-- sign-up since has failed with "Database error saving new user". Nothing
-- in the app reads either table; user_profiles (013) is created by
-- onboarding, not at sign-up.
-- ═══════════════════════════════════════════════════════════════════════════

DROP TRIGGER IF EXISTS on_auth_user_created ON auth.users;
DROP FUNCTION IF EXISTS public.handle_new_user();
