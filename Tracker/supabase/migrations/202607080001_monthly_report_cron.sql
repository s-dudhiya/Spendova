-- Enable pg_cron and pg_net extensions if not already enabled
create extension if not exists pg_cron;
create extension if not exists pg_net;

-- We want the generate-monthly-reports edge function to process users in batches
-- because of Edge Function timeouts. We schedule it to run every 5 minutes.
-- Inside the Edge Function, it checks if it's the 4th of the month or later,
-- otherwise it does no work.
select
  cron.schedule(
    'generate-monthly-reports-batch',
    '*/5 * * * *', -- Run every 5 minutes
    $$
    select
      net.http_post(
          url:='https://kmllvchwuhrnnahksurt.supabase.co/functions/v1/generate-monthly-reports',
          headers:='{"Content-Type": "application/json", "Authorization": "Bearer eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJpc3MiOiJzdXBhYmFzZSIsInJlZiI6ImttbGx2Y2h3dWhybm5haGtzdXJ0Iiwicm9sZSI6ImFub24iLCJpYXQiOjE3NTg0NDMwMzYsImV4cCI6MjA3NDAxOTAzNn0.xAVAI_o058aFKsWLHcA4LsxzNFRYIHZ6ylC_BYd0s5I"}'::jsonb,
          body:='{}'::jsonb
      ) as request_id;
    $$
  );
