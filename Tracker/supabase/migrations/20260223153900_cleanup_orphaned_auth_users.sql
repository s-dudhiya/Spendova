-- Clean up orphaned users in auth.users that do not have a corresponding profile in public.profiles

DELETE FROM auth.users
WHERE id NOT IN (
    SELECT user_id FROM public.profiles
);
