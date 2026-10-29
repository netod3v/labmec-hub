-- Run only after configuring SMTP, Vercel and the two Vault secrets below.
-- Enable pg_cron and pg_net using the Supabase dashboard first.
-- Never paste credentials into this SQL file or commit real secret values.
DO $check$
BEGIN
  IF NOT EXISTS (SELECT FROM pg_extension WHERE extname = 'pg_cron')
     OR NOT EXISTS (SELECT FROM pg_extension WHERE extname = 'pg_net') THEN
    RAISE EXCEPTION 'Enable pg_cron and pg_net before scheduling the worker.';
  END IF;
  IF NOT EXISTS (SELECT FROM vault.decrypted_secrets
                 WHERE name = 'hub_reset_mail_url'
                   AND decrypted_secret ~ '^https://[^/?#@]+/api/internal/reset-mail$')
     OR NOT EXISTS (SELECT FROM vault.decrypted_secrets
                     WHERE name = 'hub_reset_mail_secret' AND length(decrypted_secret) >= 32) THEN
    RAISE EXCEPTION 'Configure hub_reset_mail_url and hub_reset_mail_secret in Vault first.';
  END IF;
END;
$check$;

-- pg_net temporarily stores outbound headers. Keep its queue backend-only.
REVOKE ALL ON net.http_request_queue FROM PUBLIC, anon, authenticated;

SELECT cron.schedule(
  'hub-reset-mail',
  '* * * * *',
  $job$
    SELECT net.http_post(
      url := (SELECT decrypted_secret FROM vault.decrypted_secrets WHERE name = 'hub_reset_mail_url'),
      headers := jsonb_build_object(
        'Content-Type', 'application/json',
        'Authorization', 'Bearer ' ||
          (SELECT decrypted_secret FROM vault.decrypted_secrets WHERE name = 'hub_reset_mail_secret')
      ),
      body := '{}'::jsonb,
      timeout_milliseconds := 55000
    );
  $job$
);
