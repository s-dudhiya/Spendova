-- Enable Supabase Realtime for every table that can affect dashboard, split, balance,
-- friend, group, chart, and settlement views.

DO $$
DECLARE
  realtime_table text;
  realtime_tables text[] := ARRAY[
    'expenses',
    'expense_splits',
    'split_settlements',
    'groups',
    'group_members',
    'connections',
    'group_invites',
    'profiles'
  ];
BEGIN
  IF NOT EXISTS (SELECT 1 FROM pg_publication WHERE pubname = 'supabase_realtime') THEN
    CREATE PUBLICATION supabase_realtime;
  END IF;

  FOREACH realtime_table IN ARRAY realtime_tables LOOP
    IF to_regclass(format('public.%I', realtime_table)) IS NOT NULL THEN
      EXECUTE format('ALTER TABLE public.%I REPLICA IDENTITY FULL', realtime_table);

      IF NOT EXISTS (
        SELECT 1
        FROM pg_publication_tables
        WHERE pubname = 'supabase_realtime'
          AND schemaname = 'public'
          AND tablename = realtime_table
      ) THEN
        EXECUTE format('ALTER PUBLICATION supabase_realtime ADD TABLE public.%I', realtime_table);
      END IF;
    END IF;
  END LOOP;
END $$;
