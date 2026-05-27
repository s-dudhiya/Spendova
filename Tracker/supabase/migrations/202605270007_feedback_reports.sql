CREATE TABLE IF NOT EXISTS public.feedback_reports (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id uuid NOT NULL REFERENCES public.profiles(user_id) ON DELETE CASCADE,
  type text NOT NULL CHECK (type IN ('bug_report', 'feature_request', 'suggestion', 'general_feedback')),
  title text NOT NULL CHECK (char_length(title) BETWEEN 3 AND 120),
  description text NOT NULL CHECK (char_length(description) BETWEEN 1 AND 2000),
  screenshot_url text,
  priority text NOT NULL DEFAULT 'medium' CHECK (priority IN ('low', 'medium', 'high', 'critical')),
  status text NOT NULL DEFAULT 'open' CHECK (status IN ('open', 'investigating', 'resolved', 'closed')),
  device_info jsonb NOT NULL DEFAULT '{}'::jsonb,
  app_version text NOT NULL DEFAULT '2.1',
  admin_notes text,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now()
);

CREATE INDEX IF NOT EXISTS feedback_reports_user_created_idx
  ON public.feedback_reports (user_id, created_at DESC);

CREATE INDEX IF NOT EXISTS feedback_reports_admin_status_idx
  ON public.feedback_reports (status, priority, created_at DESC);

DO $$
BEGIN
  IF EXISTS (
    SELECT 1
    FROM pg_constraint
    WHERE conname = 'feedback_reports_description_check'
      AND conrelid = 'public.feedback_reports'::regclass
  ) THEN
    ALTER TABLE public.feedback_reports DROP CONSTRAINT feedback_reports_description_check;
  END IF;

  IF NOT EXISTS (
    SELECT 1
    FROM pg_constraint
    WHERE conname = 'feedback_reports_description_length_check'
      AND conrelid = 'public.feedback_reports'::regclass
  ) THEN
    ALTER TABLE public.feedback_reports
      ADD CONSTRAINT feedback_reports_description_length_check
      CHECK (char_length(description) BETWEEN 1 AND 2000);
  END IF;
END $$;

ALTER TABLE public.feedback_reports ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS "Users can create their own feedback reports" ON public.feedback_reports;
CREATE POLICY "Users can create their own feedback reports"
ON public.feedback_reports FOR INSERT
WITH CHECK (auth.uid() = user_id);

DROP POLICY IF EXISTS "Users can view their own feedback reports" ON public.feedback_reports;
CREATE POLICY "Users can view their own feedback reports"
ON public.feedback_reports FOR SELECT
USING (auth.uid() = user_id OR public.is_admin());

DROP POLICY IF EXISTS "Admins can update feedback reports" ON public.feedback_reports;
CREATE POLICY "Admins can update feedback reports"
ON public.feedback_reports FOR UPDATE
USING (public.is_admin())
WITH CHECK (public.is_admin());

DROP POLICY IF EXISTS "Admins can delete feedback reports" ON public.feedback_reports;
CREATE POLICY "Admins can delete feedback reports"
ON public.feedback_reports FOR DELETE
USING (public.is_admin());

DROP TRIGGER IF EXISTS update_feedback_reports_updated_at ON public.feedback_reports;
CREATE TRIGGER update_feedback_reports_updated_at
BEFORE UPDATE ON public.feedback_reports
FOR EACH ROW
EXECUTE FUNCTION public.update_updated_at_column();

INSERT INTO storage.buckets (id, name, public, file_size_limit, allowed_mime_types)
VALUES ('feedback-screenshots', 'feedback-screenshots', false, 1048576, ARRAY['image/jpeg', 'image/png', 'image/webp']::text[])
ON CONFLICT (id) DO UPDATE
SET public = false,
    file_size_limit = 1048576,
    allowed_mime_types = ARRAY['image/jpeg', 'image/png', 'image/webp']::text[];

DROP POLICY IF EXISTS "Users can upload own feedback screenshots" ON storage.objects;
CREATE POLICY "Users can upload own feedback screenshots"
ON storage.objects FOR INSERT
WITH CHECK (
  bucket_id = 'feedback-screenshots'
  AND auth.uid()::text = (storage.foldername(name))[1]
);

DROP POLICY IF EXISTS "Users and admins can view feedback screenshots" ON storage.objects;
CREATE POLICY "Users and admins can view feedback screenshots"
ON storage.objects FOR SELECT
USING (
  bucket_id = 'feedback-screenshots'
  AND (auth.uid()::text = (storage.foldername(name))[1] OR public.is_admin())
);

DROP POLICY IF EXISTS "Users can update own feedback screenshots" ON storage.objects;
CREATE POLICY "Users can update own feedback screenshots"
ON storage.objects FOR UPDATE
USING (
  bucket_id = 'feedback-screenshots'
  AND auth.uid()::text = (storage.foldername(name))[1]
)
WITH CHECK (
  bucket_id = 'feedback-screenshots'
  AND auth.uid()::text = (storage.foldername(name))[1]
);

DROP POLICY IF EXISTS "Users and admins can delete feedback screenshots" ON storage.objects;
CREATE POLICY "Users and admins can delete feedback screenshots"
ON storage.objects FOR DELETE
USING (
  bucket_id = 'feedback-screenshots'
  AND (auth.uid()::text = (storage.foldername(name))[1] OR public.is_admin())
);

DO $$
BEGIN
  IF NOT EXISTS (SELECT 1 FROM pg_publication WHERE pubname = 'supabase_realtime') THEN
    CREATE PUBLICATION supabase_realtime;
  END IF;

  ALTER TABLE public.feedback_reports REPLICA IDENTITY FULL;

  IF NOT EXISTS (
    SELECT 1
    FROM pg_publication_tables
    WHERE pubname = 'supabase_realtime'
      AND schemaname = 'public'
      AND tablename = 'feedback_reports'
  ) THEN
    ALTER PUBLICATION supabase_realtime ADD TABLE public.feedback_reports;
  END IF;
END $$;
