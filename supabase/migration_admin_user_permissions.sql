-- REVIEW AND RUN ONCE IN THE SUPABASE SQL EDITOR.
-- Adds granular club permissions while keeping legacy club_admin accounts fully functional.
BEGIN;

CREATE OR REPLACE FUNCTION public.is_club_admin()
RETURNS boolean
LANGUAGE sql
STABLE
SECURITY INVOKER
SET search_path = ''
AS $$
  SELECT coalesce((auth.jwt() -> 'app_metadata' ->> 'club_admin') = 'true', false);
$$;

CREATE OR REPLACE FUNCTION public.has_club_permission(required_permission text)
RETURNS boolean
LANGUAGE sql
STABLE
SECURITY INVOKER
SET search_path = ''
AS $$
  WITH metadata AS (
    SELECT coalesce(auth.jwt() -> 'app_metadata', '{}'::jsonb) AS value
  )
  SELECT public.is_club_admin() AND (
    (SELECT value ->> 'club_role' FROM metadata) = 'owner'
    OR NOT ((SELECT value FROM metadata) ? 'club_permissions')
    OR required_permission IN (
      SELECT jsonb_array_elements_text(
        CASE
          WHEN jsonb_typeof((SELECT value -> 'club_permissions' FROM metadata)) = 'array'
            THEN (SELECT value -> 'club_permissions' FROM metadata)
          ELSE '[]'::jsonb
        END
      )
    )
  );
$$;

REVOKE EXECUTE ON FUNCTION public.has_club_permission(text) FROM anon;
GRANT EXECUTE ON FUNCTION public.has_club_permission(text) TO authenticated;

DO $$
DECLARE
  table_name text;
  permission_name text;
  policy_record record;
BEGIN
  FOREACH table_name IN ARRAY ARRAY['team', 'team_seasons', 'events'] LOOP
    IF to_regclass('public.' || table_name) IS NULL THEN CONTINUE; END IF;
    permission_name := CASE WHEN table_name IN ('team', 'team_seasons') THEN 'team' ELSE 'events' END;
    EXECUTE format('ALTER TABLE public.%I ENABLE ROW LEVEL SECURITY', table_name);
    FOR policy_record IN
      SELECT policyname FROM pg_policies WHERE schemaname = 'public' AND tablename = table_name
    LOOP
      EXECUTE format('DROP POLICY %I ON public.%I', policy_record.policyname, table_name);
    END LOOP;
    EXECUTE format('CREATE POLICY club_public_read ON public.%I FOR SELECT TO anon, authenticated USING (true)', table_name);
    EXECUTE format(
      'CREATE POLICY club_permission_manage ON public.%I FOR ALL TO authenticated USING (public.has_club_permission(%L)) WITH CHECK (public.has_club_permission(%L))',
      table_name,
      permission_name,
      permission_name
    );
  END LOOP;
END $$;

DO $$
DECLARE table_name text;
BEGIN
  FOREACH table_name IN ARRAY ARRAY['team', 'team_seasons', 'events'] LOOP
    IF to_regclass('public.' || table_name) IS NULL THEN CONTINUE; END IF;
    EXECUTE format('GRANT SELECT ON public.%I TO anon, authenticated', table_name);
    EXECUTE format('GRANT INSERT, UPDATE, DELETE ON public.%I TO authenticated', table_name);
    EXECUTE format('REVOKE INSERT, UPDATE, DELETE ON public.%I FROM anon', table_name);
  END LOOP;
END $$;

DO $$
DECLARE policy_record record;
BEGIN
  IF to_regclass('public.registrations') IS NULL THEN RETURN; END IF;
  ALTER TABLE public.registrations ENABLE ROW LEVEL SECURITY;
  FOR policy_record IN
    SELECT policyname FROM pg_policies WHERE schemaname = 'public' AND tablename = 'registrations'
  LOOP
    EXECUTE format('DROP POLICY %I ON public.registrations', policy_record.policyname);
  END LOOP;

  CREATE POLICY club_public_apply ON public.registrations
  FOR INSERT TO anon, authenticated
  WITH CHECK (
    status = 'pending'
    AND refusal_reason IS NULL
    AND length(trim(full_name)) BETWEEN 1 AND 120
    AND email IS NOT NULL AND length(email) BETWEEN 3 AND 254
    AND phone IS NOT NULL
    AND department IS NOT NULL
    AND filiere IS NOT NULL
    AND years_of_study BETWEEN 1 AND 5
    AND EXISTS (
      SELECT 1 FROM public.registration_settings registration_cycle
      WHERE registration_cycle.is_open
        AND registration_cycle.season = registration_season
    )
  );

  CREATE POLICY club_permission_registration_read ON public.registrations
  FOR SELECT TO authenticated
  USING (public.has_club_permission('registrations'));

  CREATE POLICY club_permission_registration_decision ON public.registrations
  FOR UPDATE TO authenticated
  USING (public.has_club_permission('registrations') AND status = 'pending')
  WITH CHECK (
    public.has_club_permission('registrations')
    AND status IN ('accepted', 'refused')
    AND (
      (status = 'accepted' AND refusal_reason IS NULL)
      OR (status = 'refused' AND length(trim(refusal_reason)) BETWEEN 1 AND 2000)
    )
  );
END $$;

GRANT INSERT ON public.registrations TO anon, authenticated;
GRANT SELECT ON public.registrations TO authenticated;
REVOKE UPDATE, DELETE ON public.registrations FROM authenticated;
GRANT UPDATE(status, refusal_reason) ON public.registrations TO authenticated;
REVOKE SELECT, UPDATE, DELETE ON public.registrations FROM anon;

DO $$
DECLARE
  table_name text;
  policy_record record;
BEGIN
  FOREACH table_name IN ARRAY ARRAY['registration_settings', 'club_settings'] LOOP
    IF to_regclass('public.' || table_name) IS NULL THEN CONTINUE; END IF;
    EXECUTE format('ALTER TABLE public.%I ENABLE ROW LEVEL SECURITY', table_name);
    FOR policy_record IN
      SELECT policyname FROM pg_policies WHERE schemaname = 'public' AND tablename = table_name
    LOOP
      EXECUTE format('DROP POLICY %I ON public.%I', policy_record.policyname, table_name);
    END LOOP;
    EXECUTE format('CREATE POLICY club_public_read ON public.%I FOR SELECT TO anon, authenticated USING (true)', table_name);
    EXECUTE format(
      'CREATE POLICY club_registration_settings_manage ON public.%I FOR ALL TO authenticated USING (public.has_club_permission(''registrations'')) WITH CHECK (public.has_club_permission(''registrations''))',
      table_name
    );
  END LOOP;
END $$;

DO $$
DECLARE table_name text;
BEGIN
  FOREACH table_name IN ARRAY ARRAY['registration_settings', 'club_settings'] LOOP
    IF to_regclass('public.' || table_name) IS NULL THEN CONTINUE; END IF;
    EXECUTE format('GRANT SELECT ON public.%I TO anon, authenticated', table_name);
    EXECUTE format('GRANT INSERT, UPDATE, DELETE ON public.%I TO authenticated', table_name);
    EXECUTE format('REVOKE INSERT, UPDATE, DELETE ON public.%I FROM anon', table_name);
  END LOOP;
END $$;

DROP POLICY IF EXISTS club_admin_event_media_insert ON storage.objects;
DROP POLICY IF EXISTS club_admin_event_media_update ON storage.objects;
DROP POLICY IF EXISTS club_admin_event_media_delete ON storage.objects;
DROP POLICY IF EXISTS club_permission_media_insert ON storage.objects;
DROP POLICY IF EXISTS club_permission_media_update ON storage.objects;
DROP POLICY IF EXISTS club_permission_media_delete ON storage.objects;

CREATE POLICY club_permission_media_insert ON storage.objects
FOR INSERT TO authenticated
WITH CHECK (
  bucket_id = 'EVENTS'
  AND (public.has_club_permission('team') OR public.has_club_permission('events'))
);

CREATE POLICY club_permission_media_update ON storage.objects
FOR UPDATE TO authenticated
USING (
  bucket_id = 'EVENTS'
  AND (public.has_club_permission('team') OR public.has_club_permission('events'))
)
WITH CHECK (
  bucket_id = 'EVENTS'
  AND (public.has_club_permission('team') OR public.has_club_permission('events'))
);

CREATE POLICY club_permission_media_delete ON storage.objects
FOR DELETE TO authenticated
USING (
  bucket_id = 'EVENTS'
  AND (public.has_club_permission('team') OR public.has_club_permission('events'))
);

COMMIT;
