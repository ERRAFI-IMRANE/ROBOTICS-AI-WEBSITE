-- REVIEW AND RUN ONCE IN THE SUPABASE SQL EDITOR.
-- Secures the existing interview columns and exposes one permission-checked save operation.
-- This migration does not add or alter registration columns.
BEGIN;

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

CREATE OR REPLACE FUNCTION public.save_registration_interview(
  p_registration_id bigint,
  p_interest_type text[],
  p_team_role_style text,
  p_problem_solving_style text,
  p_work_environment text,
  p_preferred_activity text[]
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
    RAISE EXCEPTION 'Registration interview permission required';
  END IF;

  IF coalesce(cardinality(p_interest_type), 0) = 0
    OR EXISTS (
      SELECT 1 FROM unnest(p_interest_type) AS answer
      WHERE answer IS NULL OR answer NOT IN (
        'Photography / Filming', 'Design', 'Coding / Robotics / AI',
        'Organizing Events', 'Communication / Social Media', 'Other Creative Activities'
      )
    ) THEN RAISE EXCEPTION 'Choose at least one valid interest';
  END IF;

  IF p_team_role_style IS NULL OR p_team_role_style NOT IN (
    'Leads the group', 'Organizes the work', 'Gives creative ideas',
    'Handles technical tasks', 'Communicates with people', 'Supports wherever needed'
  ) THEN RAISE EXCEPTION 'Choose a valid team personality'; END IF;

  IF p_problem_solving_style IS NULL OR p_problem_solving_style NOT IN (
    'Try to solve it alone first', 'Search and learn how to solve it',
    'Ask someone experienced', 'Discuss it with the team',
    'Try different solutions until one works'
  ) THEN RAISE EXCEPTION 'Choose a valid problem-solving style'; END IF;

  IF p_work_environment IS NULL OR p_work_environment NOT IN (
    'Working behind the scenes', 'Working directly with people', 'Creative work',
    'Technical work', 'Managing and organizing', 'A mix of everything'
  ) THEN RAISE EXCEPTION 'Choose a valid work environment'; END IF;

  IF coalesce(cardinality(p_preferred_activity), 0) = 0
    OR EXISTS (
      SELECT 1 FROM unnest(p_preferred_activity) AS answer
      WHERE answer IS NULL OR answer NOT IN (
        'Hackathons / Technical Projects', 'Photography / Video Coverage',
        'Graphic Design / Content Creation', 'Organizing Events',
        'Communication / Partnerships', 'Workshops / Presentations'
      )
    ) THEN RAISE EXCEPTION 'Choose at least one valid preferred activity';
  END IF;

  UPDATE public.registrations AS registration
  SET interest_type = p_interest_type,
      team_role_style = p_team_role_style,
      problem_solving_style = p_problem_solving_style,
      work_environment = p_work_environment,
      preferred_activity = p_preferred_activity,
      interview_completed = true,
      interviewed_at = coalesce(registration.interviewed_at, now())
  WHERE registration.id = p_registration_id
  RETURNING registration.* INTO registration_record;

  IF NOT FOUND THEN RAISE EXCEPTION 'Registration no longer exists'; END IF;

  RETURN jsonb_build_object(
    'id', registration_record.id,
    'interest_type', registration_record.interest_type,
    'team_role_style', registration_record.team_role_style,
    'problem_solving_style', registration_record.problem_solving_style,
    'work_environment', registration_record.work_environment,
    'preferred_activity', registration_record.preferred_activity,
    'interview_completed', registration_record.interview_completed,
    'interviewed_at', registration_record.interviewed_at
  );
END;
$$;

CREATE OR REPLACE FUNCTION public.complete_registration_review(
  p_registration_id bigint,
  p_interest_type text[],
  p_team_role_style text,
  p_problem_solving_style text,
  p_work_environment text,
  p_preferred_activity text[],
  p_decision text,
  p_reason text DEFAULT NULL
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
  IF p_decision IS NULL OR p_decision NOT IN ('accepted', 'refused') THEN
    RAISE EXCEPTION 'Choose a valid application decision';
  END IF;
  IF p_decision = 'refused' AND (coalesce(length(trim(p_reason)), 0) < 3 OR length(p_reason) > 2000) THEN
    RAISE EXCEPTION 'Enter a refusal reason between 3 and 2000 characters';
  END IF;

  PERFORM public.save_registration_interview(
    p_registration_id,
    p_interest_type,
    p_team_role_style,
    p_problem_solving_style,
    p_work_environment,
    p_preferred_activity
  );

  UPDATE public.registrations AS registration
  SET status = p_decision,
      refusal_reason = CASE WHEN p_decision = 'refused' THEN trim(p_reason) ELSE NULL END
  WHERE registration.id = p_registration_id
    AND registration.status = 'pending'
  RETURNING registration.* INTO registration_record;

  IF NOT FOUND THEN
    RAISE EXCEPTION 'Application already processed or no longer exists. Refresh the registration history.';
  END IF;

  RETURN jsonb_build_object(
    'id', registration_record.id,
    'status', registration_record.status,
    'refusal_reason', registration_record.refusal_reason,
    'interest_type', registration_record.interest_type,
    'team_role_style', registration_record.team_role_style,
    'problem_solving_style', registration_record.problem_solving_style,
    'work_environment', registration_record.work_environment,
    'preferred_activity', registration_record.preferred_activity,
    'interview_completed', registration_record.interview_completed,
    'interviewed_at', registration_record.interviewed_at
  );
END;
$$;

REVOKE EXECUTE ON FUNCTION public.save_registration_interview(bigint,text[],text,text,text,text[]) FROM PUBLIC, anon;
REVOKE EXECUTE ON FUNCTION public.complete_registration_review(bigint,text[],text,text,text,text[],text,text) FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION public.save_registration_interview(bigint,text[],text,text,text,text[]) TO authenticated;
GRANT EXECUTE ON FUNCTION public.complete_registration_review(bigint,text[],text,text,text,text[],text,text) TO authenticated;

COMMIT;
