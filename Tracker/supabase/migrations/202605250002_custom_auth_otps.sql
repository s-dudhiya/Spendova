ALTER TABLE public.profiles
  ADD COLUMN IF NOT EXISTS email_verified boolean NOT NULL DEFAULT false;

CREATE TABLE IF NOT EXISTS public.auth_otps (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  email text NOT NULL,
  purpose text NOT NULL CHECK (purpose IN ('signup_verify', 'reset_password')),
  otp_hash text NOT NULL,
  expires_at timestamptz NOT NULL,
  used boolean NOT NULL DEFAULT false,
  attempts integer NOT NULL DEFAULT 0,
  reset_token uuid,
  reset_token_expires_at timestamptz,
  created_at timestamptz NOT NULL DEFAULT now()
);

CREATE INDEX IF NOT EXISTS auth_otps_email_purpose_idx
  ON public.auth_otps (lower(email), purpose, created_at DESC);

ALTER TABLE public.auth_otps ENABLE ROW LEVEL SECURITY;
