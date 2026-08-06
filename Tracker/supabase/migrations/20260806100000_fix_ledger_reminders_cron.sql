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
    '43 4 * * *',
    $$
    SELECT
      net.http_post(
          url:='https://kmllvchwuhrnnahksurt.supabase.co/functions/v1/cron-ledger-reminders',
          headers:=jsonb_build_object(
              'Content-Type', 'application/json',
              'Authorization', 'Bearer eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJpc3MiOiJzdXBhYmFzZSIsInJlZiI6ImttbGx2Y2h3dWhybm5haGtzdXJ0Iiwicm9sZSI6ImFub24iLCJpYXQiOjE3NTg0NDMwMzYsImV4cCI6MjA3NDAxOTAzNn0.xAVAI_o058aFKsWLHcA4LsxzNFRYIHZ6ylC_BYd0s5I'
          ),
          body:=jsonb_build_object('time', now())
      ) AS request_id;
    $$
  );
