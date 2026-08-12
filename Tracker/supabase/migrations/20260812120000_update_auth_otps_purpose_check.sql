ALTER TABLE public.auth_otps DROP CONSTRAINT auth_otps_purpose_check;
ALTER TABLE public.auth_otps ADD CONSTRAINT auth_otps_purpose_check CHECK (purpose IN ('signup_verify', 'reset_password', 'login'));
