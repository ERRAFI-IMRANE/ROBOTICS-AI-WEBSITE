-- REVIEW AND RUN ONCE IN THE SUPABASE SQL EDITOR.
-- Secures the existing registrations.interesting flag and exposes an admin-only toggle.
BEGIN;

UPDATE public.registrations
SET interesting = false
WHERE interesting IS NULL;

ALTER TABLE public.registrations
  ALTER COLUMN interesting SET DEFAULT false,
  ALTER COLUMN interesting SET NOT NULL;

DROP POLICY IF EXISTS club_public_apply ON public.registrations;
CREATE POLICY club_public_apply ON public.registrations
FOR INSERT TO anon, authenticated
WITH CHECK (
  status = 'pending'
  AND refusal_reason IS NULL
  AND interest_type IS NULL
  AND team_role_style IS NULL
  AND problem_solving_style IS NULL
  AND work_environment IS NULL
  AND preferred_activity IS NULL
  AND interview_completed IS FALSE
  AND interviewed_at IS NULL
  AND interesting IS FALSE
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

CREATE OR REPLACE FUNCTION public.set_registration_interesting(
  p_registration_id bigint,
  p_interesting boolean
)
RETURNS jsonb
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = ''
AS $$
DECLARE
  registration_record public.registrations%ROWTYPE;
BEGIN
  IF NOT public.has_club_permission('registrations') THEN
    RAISE EXCEPTION 'Registration review permission required';
  END IF;
  IF p_interesting IS NULL THEN
    RAISE EXCEPTION 'Choose a valid Interesting flag value';
  END IF;

  UPDATE public.registrations AS registration
  SET interesting = p_interesting
  WHERE registration.id = p_registration_id
  RETURNING registration.* INTO registration_record;

  IF NOT FOUND THEN RAISE EXCEPTION 'Registration no longer exists'; END IF;

  RETURN jsonb_build_object(
    'id', registration_record.id,
    'interesting', registration_record.interesting
  );
END;
$$;

REVOKE EXECUTE ON FUNCTION public.set_registration_interesting(bigint,boolean) FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION public.set_registration_interesting(bigint,boolean) TO authenticated;

COMMIT;
