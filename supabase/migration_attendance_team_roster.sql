-- Run after the attendance migrations. Existing saved attendance is preserved.
BEGIN;

CREATE OR REPLACE FUNCTION public.load_attendance_team_roster(p_session_id uuid, p_team_season text)
RETURNS jsonb
LANGUAGE plpgsql SECURITY DEFINER SET search_path = ''
AS $$
DECLARE
  session_row public.attendance_sessions%ROWTYPE;
  added integer;
  season_key text;
BEGIN
  IF NOT public.has_club_permission('absence') THEN RAISE EXCEPTION 'Absence permission required'; END IF;
  SELECT * INTO session_row FROM public.attendance_sessions WHERE id = p_session_id FOR UPDATE;
  IF NOT FOUND OR session_row.status <> 'open' THEN RAISE EXCEPTION 'Open the session before updating its Team roster'; END IF;
  season_key := regexp_replace(trim(p_team_season), '^20([0-9]{2})[-/]20([0-9]{2})$', '\1-\2');
  season_key := replace(season_key, '/', '-');
  IF season_key !~ '^[0-9]{2}-[0-9]{2}$' THEN RAISE EXCEPTION 'Choose a valid Team season'; END IF;

  INSERT INTO public.attendance_records(session_id, participant_type, team_id)
  SELECT DISTINCT p_session_id, 'team', member.id
  FROM public.team_seasons AS assignment
  JOIN public.team AS member ON member.id = assignment.team_id
  WHERE replace(regexp_replace(trim(assignment.season), '^20([0-9]{2})[-/]20([0-9]{2})$', '\1-\2'), '/', '-') = season_key
    AND upper(trim(coalesce(assignment.post_abbr, ''))) NOT IN ('SUP', 'CO-SUP', 'ADV')
    AND lower(trim(coalesce(assignment.role, ''))) NOT IN ('supervisor', 'club supervisor', 'co-supervisor', 'club co-supervisor', 'advisor')
    AND NOT EXISTS (
      SELECT 1 FROM public.attendance_records AS existing
      JOIN public.registrations AS applicant ON applicant.id = existing.registration_id
      WHERE existing.session_id = p_session_id
        AND lower(regexp_replace(trim(applicant.full_name), '\s+', ' ', 'g')) = lower(regexp_replace(trim(member.full_name), '\s+', ' ', 'g'))
    )
  ON CONFLICT DO NOTHING;
  GET DIAGNOSTICS added = ROW_COUNT;
  RETURN jsonb_build_object('added', added);
END;
$$;

REVOKE ALL ON FUNCTION public.load_attendance_team_roster(uuid,text) FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION public.load_attendance_team_roster(uuid,text) TO authenticated;
NOTIFY pgrst, 'reload schema';
COMMIT;
