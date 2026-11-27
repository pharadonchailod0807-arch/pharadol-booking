BEGIN;

SET LOCAL lock_timeout = '5s';

REVOKE ALL ON public.admin_users FROM PUBLIC, anon, authenticated;
GRANT SELECT, INSERT, UPDATE, DELETE ON public.admin_users TO service_role;
CREATE POLICY account_authority_server_only ON public.admin_users AS RESTRICTIVE FOR ALL
  TO anon, authenticated USING (false) WITH CHECK (false);

DO $protect$
BEGIN
  IF to_regclass('public.auth_provider_accounts') IS NOT NULL THEN
    REVOKE ALL ON public.auth_provider_accounts FROM PUBLIC, anon, authenticated;
    GRANT SELECT, INSERT, UPDATE, DELETE ON public.auth_provider_accounts TO service_role;
    CREATE POLICY provider_authority_server_only ON public.auth_provider_accounts AS RESTRICTIVE FOR ALL
      TO anon, authenticated USING (false) WITH CHECK (false);
  END IF;
END;
$protect$;

NOTIFY pgrst, 'reload schema';

COMMIT;
