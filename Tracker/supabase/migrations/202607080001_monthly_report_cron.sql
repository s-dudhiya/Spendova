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
          url:='https://drcwckehcsmbbttngwha.supabase.co/functions/v1/generate-monthly-reports',
          headers:='{"Content-Type": "application/json"}'::jsonb,
          body:='{}'::jsonb
      ) as request_id;
    $$
  );
