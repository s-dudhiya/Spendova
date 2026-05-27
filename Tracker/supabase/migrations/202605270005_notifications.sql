  -- Product notifications for shared Spendova activity.

  CREATE TABLE IF NOT EXISTS public.notifications (
    id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
    user_id uuid NOT NULL REFERENCES public.profiles(user_id) ON DELETE CASCADE,
    actor_id uuid REFERENCES public.profiles(user_id) ON DELETE SET NULL,
    type text NOT NULL,
    title text NOT NULL,
    message text NOT NULL,
    entity_type text NOT NULL,
    entity_id uuid,
    is_read boolean NOT NULL DEFAULT false,
    created_at timestamptz NOT NULL DEFAULT now()
  );

  CREATE INDEX IF NOT EXISTS notifications_user_created_idx
    ON public.notifications (user_id, created_at DESC);

  CREATE INDEX IF NOT EXISTS notifications_user_unread_idx
    ON public.notifications (user_id, is_read, created_at DESC);

  ALTER TABLE public.notifications ENABLE ROW LEVEL SECURITY;

  REVOKE INSERT, DELETE ON public.notifications FROM anon, authenticated;
  REVOKE UPDATE ON public.notifications FROM anon, authenticated;
  GRANT SELECT ON public.notifications TO authenticated;
  GRANT UPDATE (is_read) ON public.notifications TO authenticated;
  GRANT ALL ON public.notifications TO service_role;

  DROP POLICY IF EXISTS "Users can read their own notifications" ON public.notifications;
  CREATE POLICY "Users can read their own notifications"
  ON public.notifications FOR SELECT
  USING (auth.uid() = user_id);

  DROP POLICY IF EXISTS "Users can update their own notification read state" ON public.notifications;
  CREATE POLICY "Users can update their own notification read state"
  ON public.notifications FOR UPDATE
  USING (auth.uid() = user_id)
  WITH CHECK (auth.uid() = user_id);

  DROP POLICY IF EXISTS "Users cannot create notifications" ON public.notifications;

  CREATE OR REPLACE FUNCTION public.trim_user_notifications(p_user_id uuid)
  RETURNS void
  LANGUAGE sql
  SECURITY DEFINER
  SET search_path = public
  AS $$
    DELETE FROM public.notifications
    WHERE user_id = p_user_id
      AND id NOT IN (
        SELECT id
        FROM public.notifications
        WHERE user_id = p_user_id
        ORDER BY created_at DESC
        LIMIT 10
      );
  $$;

  REVOKE ALL ON FUNCTION public.trim_user_notifications(uuid) FROM PUBLIC, anon, authenticated;
  GRANT EXECUTE ON FUNCTION public.trim_user_notifications(uuid) TO service_role;

  CREATE OR REPLACE FUNCTION public.trim_notifications_after_insert()
  RETURNS trigger
  LANGUAGE plpgsql
  SECURITY DEFINER
  SET search_path = public
  AS $$
  BEGIN
    PERFORM public.trim_user_notifications(NEW.user_id);
    RETURN NEW;
  END;
  $$;

  DROP TRIGGER IF EXISTS trg_trim_notifications_after_insert ON public.notifications;
  CREATE TRIGGER trg_trim_notifications_after_insert
  AFTER INSERT ON public.notifications
  FOR EACH ROW
  EXECUTE FUNCTION public.trim_notifications_after_insert();

  DO $$
  BEGIN
    IF NOT EXISTS (SELECT 1 FROM pg_publication WHERE pubname = 'supabase_realtime') THEN
      CREATE PUBLICATION supabase_realtime;
    END IF;

    ALTER TABLE public.notifications REPLICA IDENTITY FULL;

    IF NOT EXISTS (
      SELECT 1
      FROM pg_publication_tables
      WHERE pubname = 'supabase_realtime'
        AND schemaname = 'public'
        AND tablename = 'notifications'
    ) THEN
      ALTER PUBLICATION supabase_realtime ADD TABLE public.notifications;
    END IF;
  END $$;
