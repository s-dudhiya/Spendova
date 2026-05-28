ALTER TABLE public.feedback_reports
  ADD COLUMN IF NOT EXISTS internal_notes text,
  ADD COLUMN IF NOT EXISTS user_update_message text;

UPDATE public.feedback_reports
SET internal_notes = COALESCE(NULLIF(admin_notes, ''), 'N/A')
WHERE internal_notes IS NULL;

UPDATE public.feedback_reports
SET user_update_message = 'N/A'
WHERE user_update_message IS NULL;

CREATE TABLE IF NOT EXISTS public.feedback_report_events (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  report_id uuid NOT NULL REFERENCES public.feedback_reports(id) ON DELETE CASCADE,
  actor_id uuid REFERENCES public.profiles(user_id) ON DELETE SET NULL,
  event_type text NOT NULL CHECK (event_type IN ('created', 'status_changed', 'priority_changed', 'admin_replied', 'note_updated')),
  status text,
  priority text,
  message text,
  created_at timestamptz NOT NULL DEFAULT now()
);

CREATE INDEX IF NOT EXISTS feedback_report_events_report_created_idx
  ON public.feedback_report_events (report_id, created_at DESC);

INSERT INTO public.feedback_report_events (report_id, actor_id, event_type, status, priority, message, created_at)
SELECT fr.id, fr.user_id, 'created', fr.status, fr.priority, 'Ticket created', fr.created_at
FROM public.feedback_reports fr
WHERE NOT EXISTS (
  SELECT 1
  FROM public.feedback_report_events fre
  WHERE fre.report_id = fr.id
    AND fre.event_type = 'created'
);

ALTER TABLE public.feedback_report_events ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS "Users can view own feedback events" ON public.feedback_report_events;
CREATE POLICY "Users can view own feedback events"
ON public.feedback_report_events FOR SELECT
USING (
  public.is_admin()
  OR EXISTS (
    SELECT 1
    FROM public.feedback_reports fr
    WHERE fr.id = feedback_report_events.report_id
      AND fr.user_id = auth.uid()
  )
);

DROP POLICY IF EXISTS "Admins can create feedback events" ON public.feedback_report_events;
CREATE POLICY "Admins can create feedback events"
ON public.feedback_report_events FOR INSERT
WITH CHECK (
  public.is_admin()
  OR EXISTS (
    SELECT 1
    FROM public.feedback_reports fr
    WHERE fr.id = feedback_report_events.report_id
      AND fr.user_id = auth.uid()
      AND feedback_report_events.event_type = 'created'
  )
);

CREATE OR REPLACE FUNCTION public.log_feedback_report_created()
RETURNS trigger
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
BEGIN
  INSERT INTO public.feedback_report_events (report_id, actor_id, event_type, status, priority, message)
  VALUES (NEW.id, NEW.user_id, 'created', NEW.status, NEW.priority, 'Ticket created')
  ON CONFLICT DO NOTHING;

  RETURN NEW;
END;
$$;

CREATE OR REPLACE FUNCTION public.log_feedback_report_admin_changes()
RETURNS trigger
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
BEGIN
  IF NEW.status IS DISTINCT FROM OLD.status THEN
    INSERT INTO public.feedback_report_events (report_id, actor_id, event_type, status, priority, message)
    VALUES (NEW.id, auth.uid(), 'status_changed', NEW.status, NEW.priority, 'Status changed to ' || NEW.status);
  END IF;

  IF NEW.priority IS DISTINCT FROM OLD.priority THEN
    INSERT INTO public.feedback_report_events (report_id, actor_id, event_type, status, priority, message)
    VALUES (NEW.id, auth.uid(), 'priority_changed', NEW.status, NEW.priority, 'Priority changed to ' || NEW.priority);
  END IF;

  IF COALESCE(NEW.internal_notes, '') IS DISTINCT FROM COALESCE(OLD.internal_notes, '') THEN
    INSERT INTO public.feedback_report_events (report_id, actor_id, event_type, status, priority, message)
    VALUES (NEW.id, auth.uid(), 'note_updated', NEW.status, NEW.priority, 'Internal notes updated');
  END IF;

  IF COALESCE(NEW.user_update_message, '') IS DISTINCT FROM COALESCE(OLD.user_update_message, '')
    AND COALESCE(NEW.user_update_message, '') <> '' THEN
    INSERT INTO public.feedback_report_events (report_id, actor_id, event_type, status, priority, message)
    VALUES (NEW.id, auth.uid(), 'admin_replied', NEW.status, NEW.priority, NEW.user_update_message);
  END IF;

  RETURN NEW;
END;
$$;

DROP TRIGGER IF EXISTS trg_feedback_report_created_event ON public.feedback_reports;
CREATE TRIGGER trg_feedback_report_created_event
AFTER INSERT ON public.feedback_reports
FOR EACH ROW
EXECUTE FUNCTION public.log_feedback_report_created();

DROP TRIGGER IF EXISTS trg_feedback_report_admin_change_events ON public.feedback_reports;
CREATE TRIGGER trg_feedback_report_admin_change_events
AFTER UPDATE OF status, priority, internal_notes, user_update_message ON public.feedback_reports
FOR EACH ROW
EXECUTE FUNCTION public.log_feedback_report_admin_changes();

DO $$
BEGIN
  IF NOT EXISTS (SELECT 1 FROM pg_publication WHERE pubname = 'supabase_realtime') THEN
    CREATE PUBLICATION supabase_realtime;
  END IF;

  ALTER TABLE public.feedback_report_events REPLICA IDENTITY FULL;

  IF NOT EXISTS (
    SELECT 1
    FROM pg_publication_tables
    WHERE pubname = 'supabase_realtime'
      AND schemaname = 'public'
      AND tablename = 'feedback_report_events'
  ) THEN
    ALTER PUBLICATION supabase_realtime ADD TABLE public.feedback_report_events;
  END IF;
END $$;
