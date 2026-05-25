UPDATE public.profiles p
SET email_verified = true
FROM auth.users u
WHERE p.user_id = u.id
  AND p.email_verified = false
  AND COALESCE((u.raw_user_meta_data ->> 'spendova_custom_pending')::boolean, false) = false;
