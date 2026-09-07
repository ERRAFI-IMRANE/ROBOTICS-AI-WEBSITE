-- REVIEW AND RUN ONCE IN THE SUPABASE SQL EDITOR.
-- Keeps every applicant and decision in public.registrations.
-- Legacy members/refused_members tables are not modified or deleted by this migration.
BEGIN;

CREATE OR REPLACE FUNCTION public.is_club_admin()
RETURNS boolean LANGUAGE sql STABLE SECURITY INVOKER SET search_path = ''
AS $$ SELECT coalesce((auth.jwt() -> 'app_metadata' ->> 'club_admin') = 'true', false); $$;

ALTER TABLE public.registrations ADD COLUMN IF NOT EXISTS refusal_reason text;
ALTER TABLE public.registrations ALTER COLUMN status SET DEFAULT 'pending';
UPDATE public.registrations SET status = 'pending' WHERE status IS NULL;
UPDATE public.registrations SET refusal_reason = NULL WHERE status IN ('pending', 'accepted');
UPDATE public.registrations
SET refusal_reason = 'Legacy refusal reason unavailable'
WHERE status = 'refused' AND coalesce(length(trim(refusal_reason)), 0) = 0;
ALTER TABLE public.registrations ALTER COLUMN status SET NOT NULL;

ALTER TABLE public.registrations DROP CONSTRAINT IF EXISTS check_reg_status;
ALTER TABLE public.registrations
  ADD CONSTRAINT check_reg_status CHECK (status IN ('pending', 'accepted', 'refused'));
ALTER TABLE public.registrations DROP CONSTRAINT IF EXISTS registrations_refusal_reason_check;
ALTER TABLE public.registrations
  ADD CONSTRAINT registrations_refusal_reason_check CHECK (
    (status = 'refused' AND length(trim(refusal_reason)) BETWEEN 1 AND 2000)
    OR (status IN ('pending', 'accepted') AND refusal_reason IS NULL)
  );

ALTER TABLE public.registrations ENABLE ROW LEVEL SECURITY;
DO $$ DECLARE policy_record record; BEGIN
  FOR policy_record IN
    SELECT policyname FROM pg_policies WHERE schemaname = 'public' AND tablename = 'registrations'
  LOOP
    EXECUTE format('DROP POLICY %I ON public.registrations', policy_record.policyname);
  END LOOP;
END $$;

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
    SELECT 1
    FROM public.registration_settings registration_cycle
    WHERE registration_cycle.is_open
      AND registration_cycle.season = registration_season
  )
);

CREATE POLICY club_officer_registration_read ON public.registrations
FOR SELECT TO authenticated
USING (public.is_club_admin());

CREATE POLICY club_officer_registration_decision ON public.registrations
FOR UPDATE TO authenticated
USING (public.is_club_admin() AND status = 'pending')
WITH CHECK (
  public.is_club_admin()
  AND status IN ('accepted', 'refused')
  AND (
    (status = 'accepted' AND refusal_reason IS NULL)
    OR (status = 'refused' AND length(trim(refusal_reason)) BETWEEN 1 AND 2000)
  )
);

GRANT INSERT ON public.registrations TO anon, authenticated;
REVOKE SELECT, UPDATE, DELETE ON public.registrations FROM anon;
REVOKE UPDATE, DELETE ON public.registrations FROM authenticated;
GRANT SELECT ON public.registrations TO authenticated;
GRANT UPDATE(status, refusal_reason) ON public.registrations TO authenticated;

DO $$ DECLARE sequence_name text; BEGIN
  sequence_name := pg_get_serial_sequence('public.registrations', 'id');
  IF sequence_name IS NOT NULL THEN
    EXECUTE format('GRANT USAGE ON SEQUENCE %s TO anon, authenticated', sequence_name);
  END IF;
END $$;

DROP FUNCTION IF EXISTS public.accept_club_registration(bigint);
DROP FUNCTION IF EXISTS public.refuse_club_registration(bigint,text);

CREATE OR REPLACE FUNCTION public.decide_club_registration(
  p_registration_id bigint,
  p_decision text,
  p_reason text DEFAULT NULL
)
RETURNS jsonb LANGUAGE plpgsql SECURITY INVOKER SET search_path = '' AS $$
DECLARE registration_record public.registrations%ROWTYPE;
BEGIN
  IF NOT public.is_club_admin() THEN RAISE EXCEPTION 'Officer access required'; END IF;
  IF p_decision IS NULL OR p_decision NOT IN ('accepted', 'refused') THEN RAISE EXCEPTION 'Invalid decision'; END IF;
  IF p_decision = 'refused' AND (coalesce(length(trim(p_reason)), 0) = 0 OR length(p_reason) > 2000) THEN
    RAISE EXCEPTION 'Enter a refusal reason (up to 2000 characters)';
  END IF;

  UPDATE public.registrations
  SET status = p_decision,
      refusal_reason = CASE WHEN p_decision = 'refused' THEN trim(p_reason) ELSE NULL END
  WHERE id = p_registration_id AND status = 'pending'
  RETURNING * INTO registration_record;

  IF NOT FOUND THEN
    RAISE EXCEPTION 'Application already processed or no longer exists. Refresh the registration history.';
  END IF;
  RETURN jsonb_build_object('registration_id', registration_record.id, 'decision', p_decision);
END; $$;

REVOKE EXECUTE ON FUNCTION public.decide_club_registration(bigint,text,text) FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION public.decide_club_registration(bigint,text,text) TO authenticated;

COMMIT;
