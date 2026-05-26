CREATE TABLE IF NOT EXISTS public.auth_device_sessions (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id uuid NOT NULL REFERENCES auth.users(id) ON DELETE CASCADE,
  device_id text NOT NULL,
  device_name text NOT NULL DEFAULT 'Unknown device',
  device_type text NOT NULL DEFAULT 'web',
  fingerprint_hash text NOT NULL,
  user_agent text,
  platform text,
  ip_address inet,
  active boolean NOT NULL DEFAULT true,
  revoked_at timestamptz,
  revoked_reason text,
  created_at timestamptz NOT NULL DEFAULT now(),
  last_seen_at timestamptz NOT NULL DEFAULT now(),
  CONSTRAINT auth_device_sessions_unique_device UNIQUE (user_id, device_id)
);

CREATE INDEX IF NOT EXISTS auth_device_sessions_user_active_idx
  ON public.auth_device_sessions (user_id, active, last_seen_at DESC);

ALTER TABLE public.auth_device_sessions ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS "Users can view their own device sessions" ON public.auth_device_sessions;
CREATE POLICY "Users can view their own device sessions"
ON public.auth_device_sessions FOR SELECT
USING (auth.uid() = user_id);

DROP POLICY IF EXISTS "Users can update their own current session visibility" ON public.auth_device_sessions;
CREATE POLICY "Users can update their own current session visibility"
ON public.auth_device_sessions FOR UPDATE
USING (auth.uid() = user_id)
WITH CHECK (auth.uid() = user_id);
