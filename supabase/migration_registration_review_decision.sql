-- Run after migration_registration_interviews.sql and migration_registration_interesting.sql.
-- Saves interview answers, an explicit decision, and the draft Interesting choice atomically.
-- No columns, public form rules, or existing registration history are changed by this migration.
BEGIN;

CREATE OR REPLACE FUNCTION public.complete_registration_review_with_flag(
  p_registration_id bigint,
  p_interest_type text[],
  p_team_role_style text,
  p_problem_solving_style text,
  p_work_environment text,
  p_preferred_activity text[],
  p_decision text,
  p_reason text,
  p_interesting boolean,
  p_expected_status text
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
  IF p_expected_status IS NULL OR p_expected_status NOT IN ('pending', 'accepted', 'refused') THEN
    RAISE EXCEPTION 'Refresh the applicant before reviewing this application';
  END IF;
  IF p_interesting IS NULL THEN
    RAISE EXCEPTION 'Choose a valid Interesting flag value';
  END IF;
  IF p_decision = 'refused' AND (
    coalesce(length(trim(p_reason)), 0) < 3 OR length(p_reason) > 2000
  ) THEN
    RAISE EXCEPTION 'Enter a refusal reason between 3 and 2000 characters';
  END IF;

  SELECT registration.* INTO registration_record
  FROM public.registrations AS registration
  WHERE registration.id = p_registration_id
  FOR UPDATE;

  IF NOT FOUND THEN RAISE EXCEPTION 'Registration no longer exists'; END IF;
  IF registration_record.status IS DISTINCT FROM p_expected_status THEN
    RAISE EXCEPTION 'Application decision changed while this form was open. Refresh before reviewing again.';
  END IF;

  -- Reuse existing answer validation and preserve the first interview timestamp.
  -- Any subsequent failure rolls this save back with the final decision.
  PERFORM public.save_registration_interview(
    p_registration_id, p_interest_type, p_team_role_style,
    p_problem_solving_style, p_work_environment, p_preferred_activity
  );

  UPDATE public.registrations AS registration
  SET status = p_decision,
      refusal_reason = CASE WHEN p_decision = 'refused' THEN trim(p_reason) ELSE NULL END,
      interesting = p_interesting
  WHERE registration.id = p_registration_id
  RETURNING registration.* INTO registration_record;

  RETURN jsonb_build_object(
    'id', registration_record.id,
    'status', registration_record.status,
    'refusal_reason', registration_record.refusal_reason,
    'interesting', registration_record.interesting,
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

REVOKE EXECUTE ON FUNCTION public.complete_registration_review_with_flag(bigint,text[],text,text,text,text[],text,text,boolean,text) FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION public.complete_registration_review_with_flag(bigint,text[],text,text,text,text[],text,text,boolean,text) TO authenticated;
NOTIFY pgrst, 'reload schema';
COMMIT;
