-- Ensure pg_net and pg_cron extensions exist
CREATE EXTENSION IF NOT EXISTS pg_net;
CREATE EXTENSION IF NOT EXISTS pg_cron;

-- Unschedule any existing cron with this name if it exists (for idempotency)
SELECT cron.unschedule('cron-ledger-reminders')
WHERE EXISTS (
  SELECT 1 FROM cron.job WHERE jobname = 'cron-ledger-reminders'
);

-- Create a cron job to trigger the Edge Function every day at 16:30 UTC (10:00 PM IST)
SELECT
  cron.schedule(
    'cron-ledger-reminders',
    '30 16 * * *',
    $$
    SELECT
      net.http_post(
          url:='https://' || (SELECT setting FROM pg_settings WHERE name = 'supautils.project_id') || '.supabase.co/functions/v1/cron-ledger-reminders',
          headers:=jsonb_build_object(
              'Content-Type', 'application/json',
              'Authorization', 'Bearer ' || current_setting('request.jwt.secret', true)
          ),
          body:=jsonb_build_object('time', now())
      ) AS request_id;
    $$
  );
