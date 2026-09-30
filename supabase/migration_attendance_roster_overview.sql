-- Run after migration_attendance_email_notifications.sql.
BEGIN;

ALTER TABLE public.attendance_records ADD COLUMN IF NOT EXISTS team_season text;

CREATE OR REPLACE FUNCTION public.attendance_season_key(p_value text)
RETURNS text LANGUAGE plpgsql IMMUTABLE SET search_path = '' AS $$
DECLARE parts text[]; cleaned text;
BEGIN
  cleaned := regexp_replace(trim(coalesce(p_value, '')), '[[:space:]]+', '', 'g');
  cleaned := translate(cleaned, '/–—', '---');
  parts := regexp_match(cleaned, '^(?:20)?([0-9]{2})(?:-(?:20)?([0-9]{2}))?$');
  IF parts IS NULL THEN RETURN NULL; END IF;
  IF parts[2] IS NOT NULL AND parts[2]::integer <> parts[1]::integer + 1 THEN RETURN NULL; END IF;
  RETURN '20' || parts[1] || '-' || (2000 + parts[1]::integer + 1)::text;
END;
$$;

CREATE OR REPLACE FUNCTION public.attendance_team_eligible(p_abbr text, p_role text)
RETURNS boolean LANGUAGE sql IMMUTABLE SET search_path = '' AS $$
  SELECT upper(trim(coalesce(p_abbr, ''))) NOT IN ('SUP','CO-SUP','ADV')
    AND lower(trim(coalesce(p_role,''))) NOT IN
      ('supervisor','club supervisor','co-supervisor','club co-supervisor',
       'co supervisor','club co supervisor','advisor','adviser','club advisor');
$$;

CREATE OR REPLACE FUNCTION public.list_attendance_team_seasons()
RETURNS jsonb LANGUAGE plpgsql SECURITY DEFINER SET search_path = '' AS $$
DECLARE result jsonb;
BEGIN
  IF NOT public.has_club_permission('absence') THEN RAISE EXCEPTION 'Absence permission required'; END IF;
  SELECT coalesce(jsonb_agg(to_jsonb(seasons) ORDER BY seasons.season DESC),'[]'::jsonb)
  INTO result FROM (
    SELECT public.attendance_season_key(assignment.season) AS season, count(DISTINCT member.id) AS eligible_count
    FROM public.team_seasons assignment JOIN public.team member ON member.id = assignment.team_id
    WHERE public.attendance_team_eligible(assignment.post_abbr, assignment.role)
      AND public.attendance_season_key(assignment.season) IS NOT NULL
    GROUP BY public.attendance_season_key(assignment.season)
  ) seasons;
  RETURN result;
END;
$$;

CREATE OR REPLACE FUNCTION public.load_attendance_team_roster(p_session_id uuid, p_team_season text)
RETURNS jsonb LANGUAGE plpgsql SECURITY DEFINER SET search_path = '' AS $$
DECLARE session_row public.attendance_sessions%ROWTYPE; season_key text;
  eligible_ids bigint[]; candidate record; existing_id uuid; added integer := 0; converted integer := 0; total integer;
BEGIN
  IF NOT public.has_club_permission('absence') THEN RAISE EXCEPTION 'Absence permission required'; END IF;
  SELECT * INTO session_row FROM public.attendance_sessions WHERE id=p_session_id FOR UPDATE;
  IF NOT FOUND OR session_row.status <> 'open' THEN RAISE EXCEPTION 'Open the session before updating its Team roster'; END IF;
  season_key := public.attendance_season_key(p_team_season);
  IF season_key IS NULL THEN RAISE EXCEPTION 'Choose a valid Team season'; END IF;
  SELECT array_agg(DISTINCT member.id) INTO eligible_ids
  FROM public.team_seasons assignment JOIN public.team member ON member.id=assignment.team_id
  WHERE public.attendance_season_key(assignment.season)=season_key
    AND public.attendance_team_eligible(assignment.post_abbr,assignment.role);
  IF coalesce(cardinality(eligible_ids),0)=0 THEN
    RAISE EXCEPTION 'No eligible Team profiles exist in season %. Choose a season with bureau profiles.', season_key;
  END IF;

  FOR candidate IN SELECT id,full_name FROM public.team WHERE id=ANY(eligible_ids) ORDER BY id LOOP
    IF EXISTS (SELECT 1 FROM public.attendance_records WHERE session_id=p_session_id AND team_id=candidate.id) THEN
      CONTINUE;
    END IF;
    existing_id := NULL;
    -- Promote a uniquely matching accepted member without losing presence or notes.
    IF (SELECT count(*) FROM public.team WHERE id=ANY(eligible_ids)
      AND lower(regexp_replace(trim(full_name),'\s+',' ','g')) =
          lower(regexp_replace(trim(candidate.full_name),'\s+',' ','g'))) = 1 THEN
      SELECT attendance.id INTO existing_id
      FROM public.attendance_records attendance
      JOIN public.registrations applicant ON applicant.id=attendance.registration_id
      WHERE attendance.session_id=p_session_id
        AND lower(regexp_replace(trim(applicant.full_name),'\s+',' ','g')) =
            lower(regexp_replace(trim(candidate.full_name),'\s+',' ','g'))
      ORDER BY attendance.created_at LIMIT 1;
    END IF;
    IF existing_id IS NOT NULL THEN
      UPDATE public.attendance_records SET participant_type='team', team_id=candidate.id,
        registration_id=NULL, team_season=season_key WHERE id=existing_id;
      converted := converted+1;
    ELSE
      INSERT INTO public.attendance_records(session_id,participant_type,team_id,team_season)
      VALUES(p_session_id,'team',candidate.id,season_key) ON CONFLICT DO NOTHING;
      IF FOUND THEN added := added+1; END IF;
    END IF;
  END LOOP;
  UPDATE public.attendance_records SET team_season=coalesce(team_season,season_key)
  WHERE session_id=p_session_id AND team_id=ANY(eligible_ids);
  SELECT count(*) INTO total FROM public.attendance_records WHERE session_id=p_session_id AND participant_type='team';
  RETURN jsonb_build_object('added',added,'converted',converted,'team_count',total,'season',season_key);
END;
$$;

-- Retire the old provider endpoints while retaining historical registration fields.
DROP FUNCTION IF EXISTS public.get_accepted_registration_whatsapp(bigint);
DROP FUNCTION IF EXISTS public.set_registration_whatsapp_group_result(bigint,text,text,text);
UPDATE public.attendance_actions SET delivery_status='skipped',
  last_error='Retired group action; attendance notifications now use email.', processed_at=now()
WHERE action_type='group_removal' AND delivery_status IN ('pending','failed','not_configured');

REVOKE ALL ON FUNCTION public.list_attendance_team_seasons(), public.load_attendance_team_roster(uuid,text) FROM PUBLIC,anon;
GRANT EXECUTE ON FUNCTION public.list_attendance_team_seasons(), public.load_attendance_team_roster(uuid,text) TO authenticated;
CREATE OR REPLACE FUNCTION public.get_attendance_session(p_session_id uuid)
RETURNS jsonb
LANGUAGE plpgsql
STABLE
SECURITY DEFINER
SET search_path = ''
AS $$
DECLARE
  target_session public.attendance_sessions%ROWTYPE;
  records_json jsonb := '[]'::jsonb;
  actions_json jsonb := '[]'::jsonb;
BEGIN
  IF NOT public.has_club_permission('absence') THEN RAISE EXCEPTION 'Absence permission required'; END IF;
  SELECT session_row.*
  INTO target_session
  FROM public.attendance_sessions AS session_row
  WHERE session_row.id = p_session_id;

  IF NOT FOUND THEN RAISE EXCEPTION 'Attendance session not found'; END IF;

  SELECT coalesce(jsonb_agg(ordered_record.item), '[]'::jsonb)
  INTO records_json
  FROM (
    SELECT jsonb_build_object(
      'id', attendance_row.id,
      'participant_type', attendance_row.participant_type,
      'registration_id', attendance_row.registration_id,
      'team_id', attendance_row.team_id,
      'full_name', CASE
        WHEN attendance_row.participant_type = 'registration' THEN applicant.full_name
        ELSE team_member.full_name
      END,
      'subtitle', CASE
        WHEN attendance_row.participant_type = 'registration'
          THEN concat_ws(' · ', applicant.department, applicant.filiere)
        ELSE concat_ws(' · ', season_role.role, season_role.post_abbr)
      END,
      'attendance_status', attendance_row.attendance_status,
      'note', attendance_row.note,
      'marked_at', attendance_row.marked_at
    ) AS item
    FROM public.attendance_records AS attendance_row
    LEFT JOIN public.registrations AS applicant ON applicant.id = attendance_row.registration_id
    LEFT JOIN public.team AS team_member ON team_member.id = attendance_row.team_id
    LEFT JOIN LATERAL (
      SELECT assignment.role, assignment.post_abbr, assignment.post_order
      FROM public.team_seasons assignment
      WHERE assignment.team_id = attendance_row.team_id
      ORDER BY (public.attendance_season_key(assignment.season) =
        public.attendance_season_key(coalesce(attendance_row.team_season,target_session.season))) DESC NULLS LAST,
        assignment.season DESC
      LIMIT 1
    ) AS season_role ON true
    WHERE attendance_row.session_id = target_session.id
    ORDER BY
      CASE WHEN attendance_row.participant_type = 'team' THEN 0 ELSE 1 END,
      coalesce(season_role.post_order, 999),
      CASE
        WHEN attendance_row.participant_type = 'registration' THEN applicant.full_name
        ELSE team_member.full_name
      END
  ) AS ordered_record;

  SELECT coalesce(jsonb_agg(ordered_action.item), '[]'::jsonb)
  INTO actions_json
  FROM (
    SELECT jsonb_build_object(
      'id', attendance_action.id,
      'participant_type', attendance_action.participant_type,
      'full_name', CASE
        WHEN attendance_action.participant_type = 'registration' THEN action_applicant.full_name
        ELSE action_member.full_name
      END,
      'streak', attendance_action.streak,
      'action_type', attendance_action.action_type,
      'delivery_status', attendance_action.delivery_status,
      'last_error', attendance_action.last_error,
      'processed_at', attendance_action.processed_at,
      'created_at', attendance_action.created_at
    ) AS item
    FROM public.attendance_actions AS attendance_action
    LEFT JOIN public.registrations AS action_applicant ON action_applicant.id = attendance_action.registration_id
    LEFT JOIN public.team AS action_member ON action_member.id = attendance_action.team_id
    WHERE attendance_action.session_id = target_session.id
    ORDER BY attendance_action.created_at DESC
  ) AS ordered_action;

  RETURN jsonb_build_object(
    'session', to_jsonb(target_session),
    'records', records_json,
    'actions', actions_json
  );
END;
$$;

NOTIFY pgrst,'reload schema';
COMMIT;
