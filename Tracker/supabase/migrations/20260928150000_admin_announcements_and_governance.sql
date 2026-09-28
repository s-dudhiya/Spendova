-- Migration: Admin Announcements, User Governance & Telemetry
-- Date: 2026-09-28

-- 1. Add announcement columns to site_settings
ALTER TABLE public.site_settings
ADD COLUMN IF NOT EXISTS announcement_active BOOLEAN NOT NULL DEFAULT false,
ADD COLUMN IF NOT EXISTS announcement_message TEXT,
ADD COLUMN IF NOT EXISTS announcement_level TEXT NOT NULL DEFAULT 'info',
ADD COLUMN IF NOT EXISTS announcement_updated_at TIMESTAMP WITH TIME ZONE DEFAULT now();

-- 2. Add blocking columns to profiles
ALTER TABLE public.profiles
ADD COLUMN IF NOT EXISTS is_blocked BOOLEAN NOT NULL DEFAULT false,
ADD COLUMN IF NOT EXISTS blocked_reason TEXT,
ADD COLUMN IF NOT EXISTS blocked_at TIMESTAMP WITH TIME ZONE;

-- 3. Policy: Allow admins to update user profiles (for blocking/unblocking)
DO $$
BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM pg_policies 
    WHERE tablename = 'profiles' AND policyname = 'Admins can update user profiles'
  ) THEN
    CREATE POLICY "Admins can update user profiles"
    ON public.profiles FOR UPDATE
    USING (public.is_admin())
    WITH CHECK (public.is_admin());
  END IF;
END $$;

-- 4. Enable real-time replication for site_settings so announcements pop up instantly for all users
DO $$
BEGIN
  BEGIN
    ALTER PUBLICATION supabase_realtime ADD TABLE public.site_settings;
  EXCEPTION
    WHEN duplicate_object THEN NULL;
    WHEN undefined_object THEN NULL;
  END;
END $$;

-- 5. RPC function: Fetch platform activity metrics for admin telemetry dashboard
CREATE OR REPLACE FUNCTION public.get_admin_analytics_telemetry(days_back INT DEFAULT 30)
RETURNS JSONB
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_is_admin BOOLEAN;
  v_result JSONB;
BEGIN
  -- Verify caller is an administrator
  SELECT public.is_admin() INTO v_is_admin;
  IF NOT v_is_admin THEN
    RAISE EXCEPTION 'Access denied. Administrator privileges required.';
  END IF;

  WITH date_series AS (
    SELECT generate_series(
      CURRENT_DATE - (days_back || ' days')::INTERVAL,
      CURRENT_DATE,
      '1 day'::INTERVAL
    )::DATE AS day_date
  ),
  daily_signups AS (
    SELECT 
      created_at::DATE AS day_date,
      COUNT(*) AS signups
    FROM public.profiles
    WHERE created_at >= (CURRENT_DATE - (days_back || ' days')::INTERVAL)
    GROUP BY created_at::DATE
  ),
  daily_expenses AS (
    SELECT 
      created_at::DATE AS day_date,
      COUNT(*) AS expense_count,
      COALESCE(SUM(amount), 0) AS total_amount,
      COUNT(DISTINCT user_id) AS active_users
    FROM public.expenses
    WHERE created_at >= (CURRENT_DATE - (days_back || ' days')::INTERVAL)
    GROUP BY created_at::DATE
  ),
  trend_data AS (
    SELECT 
      ds.day_date::TEXT AS date,
      TO_CHAR(ds.day_date, 'Mon DD') AS label,
      COALESCE(su.signups, 0) AS signups,
      COALESCE(de.expense_count, 0) AS transactions,
      COALESCE(de.total_amount, 0) AS volume,
      COALESCE(de.active_users, 0) AS active_users
    FROM date_series ds
    LEFT JOIN daily_signups su ON ds.day_date = su.day_date
    LEFT JOIN daily_expenses de ON ds.day_date = de.day_date
    ORDER BY ds.day_date ASC
  ),
  kpis AS (
    SELECT 
      (SELECT COUNT(*) FROM public.profiles) AS total_users,
      (SELECT COUNT(*) FROM public.profiles WHERE is_blocked = true) AS blocked_users,
      (SELECT COUNT(*) FROM public.expenses) AS total_expenses,
      (SELECT COALESCE(SUM(amount), 0) FROM public.expenses) AS total_volume,
      (SELECT COUNT(DISTINCT user_id) FROM public.expenses WHERE created_at >= CURRENT_DATE) AS active_today,
      (SELECT COUNT(DISTINCT user_id) FROM public.expenses WHERE created_at >= CURRENT_DATE - INTERVAL '7 days') AS active_7d
  )
  SELECT jsonb_build_object(
    'kpis', (SELECT row_to_json(kpis.*) FROM kpis),
    'trends', (SELECT jsonb_agg(row_to_json(trend_data.*)) FROM trend_data)
  ) INTO v_result;

  RETURN v_result;
END;
$$;

GRANT EXECUTE ON FUNCTION public.get_admin_analytics_telemetry(INT) TO authenticated;

-- 6. Table Grants & Policies for Admin Push Tokens
GRANT SELECT ON public.user_push_tokens TO authenticated;

DO $$
BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM pg_policies 
    WHERE tablename = 'user_push_tokens' AND policyname = 'Admins can view all push tokens'
  ) THEN
    CREATE POLICY "Admins can view all push tokens"
    ON public.user_push_tokens FOR SELECT
    TO authenticated
    USING (public.is_admin());
  END IF;
END $$;

-- 7. Table Grants & Policies for Notifications
GRANT INSERT ON public.notifications TO authenticated;

DO $$
BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM pg_policies 
    WHERE tablename = 'notifications' AND policyname = 'Admins can insert notifications'
  ) THEN
    CREATE POLICY "Admins can insert notifications"
    ON public.notifications FOR INSERT
    TO authenticated
    WITH CHECK (public.is_admin());
  END IF;
END $$;

-- 8. SECURITY DEFINER RPC: Get user push tokens securely for admin
CREATE OR REPLACE FUNCTION public.admin_get_user_push_tokens(p_username TEXT)
RETURNS JSONB
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_is_admin BOOLEAN;
  v_user_id UUID;
  v_clean_username TEXT;
  v_tokens JSONB;
BEGIN
  SELECT public.is_admin() INTO v_is_admin;
  IF NOT v_is_admin THEN
    RAISE EXCEPTION 'Access denied: Admin privileges required';
  END IF;

  v_clean_username := lower(trim(leading '@' from trim(p_username)));

  SELECT p.user_id INTO v_user_id
  FROM public.profiles p
  WHERE lower(p.username) = v_clean_username;

  IF v_user_id IS NULL THEN
    RETURN jsonb_build_object('success', false, 'error', 'User not found');
  END IF;

  SELECT COALESCE(jsonb_agg(jsonb_build_object(
    'token', upt.token,
    'platform', upt.platform,
    'created_at', upt.created_at
  )), '[]'::jsonb) INTO v_tokens
  FROM public.user_push_tokens upt
  WHERE upt.user_id = v_user_id;

  RETURN jsonb_build_object(
    'success', true,
    'user_id', v_user_id,
    'username', v_clean_username,
    'tokens', v_tokens,
    'count', jsonb_array_length(v_tokens)
  );
END;
$$;

GRANT EXECUTE ON FUNCTION public.admin_get_user_push_tokens(TEXT) TO authenticated;

-- 9. SECURITY DEFINER RPC: Dispatch in-app notification securely for admin
CREATE OR REPLACE FUNCTION public.admin_dispatch_in_app_notification(
  p_username TEXT,
  p_title TEXT,
  p_message TEXT
)
RETURNS JSONB
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_is_admin BOOLEAN;
  v_user_id UUID;
  v_clean_username TEXT;
  v_notif_id UUID;
BEGIN
  SELECT public.is_admin() INTO v_is_admin;
  IF NOT v_is_admin THEN
    RAISE EXCEPTION 'Access denied: Admin privileges required';
  END IF;

  v_clean_username := lower(trim(leading '@' from trim(p_username)));

  SELECT p.user_id INTO v_user_id
  FROM public.profiles p
  WHERE lower(p.username) = v_clean_username;

  IF v_user_id IS NULL THEN
    RETURN jsonb_build_object('success', false, 'error', 'User not found');
  END IF;

  INSERT INTO public.notifications (
    user_id,
    type,
    title,
    message,
    entity_type
  ) VALUES (
    v_user_id,
    'admin_alert',
    p_title,
    p_message,
    'system_announcement'
  ) RETURNING id INTO v_notif_id;

  RETURN jsonb_build_object(
    'success', true,
    'notification_id', v_notif_id,
    'user_id', v_user_id
  );
END;
$$;

GRANT EXECUTE ON FUNCTION public.admin_dispatch_in_app_notification(TEXT, TEXT, TEXT) TO authenticated;


