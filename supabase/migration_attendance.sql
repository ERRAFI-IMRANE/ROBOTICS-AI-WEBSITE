-- Robotics & AI Club attendance workflow.
-- Run once in the Supabase SQL editor after the registrations, team seasons,
-- and admin-permissions migrations.
BEGIN;

CREATE EXTENSION IF NOT EXISTS pgcrypto;

CREATE TABLE IF NOT EXISTS public.attendance_sessions (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  title text NOT NULL CHECK (length(trim(title)) BETWEEN 2 AND 140),
  session_type text NOT NULL DEFAULT 'training'
    CHECK (session_type IN ('training', 'meeting', 'event', 'workshop', 'other')),
  season text NOT NULL CHECK (length(trim(season)) BETWEEN 3 AND 40),
  starts_at timestamptz NOT NULL,
  notes text CHECK (notes IS NULL OR length(notes) <= 2000),
  status text NOT NULL DEFAULT 'open' CHECK (status IN ('open', 'closed')),
  created_by uuid NOT NULL DEFAULT auth.uid(),
  closed_by uuid,
  closed_at timestamptz,
  created_at timestamptz NOT NULL DEFAULT now()
);

CREATE TABLE IF NOT EXISTS public.attendance_records (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  session_id uuid NOT NULL REFERENCES public.attendance_sessions(id) ON DELETE CASCADE,
  participant_type text NOT NULL CHECK (participant_type IN ('registration', 'team')),
  registration_id bigint REFERENCES public.registrations(id) ON DELETE RESTRICT,
  team_id bigint REFERENCES public.team(id) ON DELETE RESTRICT,
  attendance_status text NOT NULL DEFAULT 'unmarked'
    CHECK (attendance_status IN ('unmarked', 'present', 'absent', 'late', 'excused')),
  note text CHECK (note IS NULL OR length(note) <= 500),
  marked_by uuid,
  marked_at timestamptz,
  created_at timestamptz NOT NULL DEFAULT now(),
  CONSTRAINT attendance_record_source_check CHECK (
    (participant_type = 'registration' AND registration_id IS NOT NULL AND team_id IS NULL)
    OR (participant_type = 'team' AND team_id IS NOT NULL AND registration_id IS NULL)
  )
);

CREATE UNIQUE INDEX IF NOT EXISTS attendance_record_registration_unique
  ON public.attendance_records(session_id, registration_id)
  WHERE registration_id IS NOT NULL;
CREATE UNIQUE INDEX IF NOT EXISTS attendance_record_team_unique
  ON public.attendance_records(session_id, team_id)
  WHERE team_id IS NOT NULL;
CREATE INDEX IF NOT EXISTS attendance_sessions_season_date_idx
  ON public.attendance_sessions(season, starts_at DESC);
CREATE INDEX IF NOT EXISTS attendance_records_session_status_idx
  ON public.attendance_records(session_id, attendance_status);

CREATE TABLE IF NOT EXISTS public.attendance_actions (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  session_id uuid NOT NULL REFERENCES public.attendance_sessions(id) ON DELETE CASCADE,
  participant_type text NOT NULL CHECK (participant_type IN ('registration', 'team')),
  registration_id bigint REFERENCES public.registrations(id) ON DELETE RESTRICT,
  team_id bigint REFERENCES public.team(id) ON DELETE RESTRICT,
  streak integer NOT NULL CHECK (streak >= 3),
  action_type text NOT NULL
    CHECK (action_type IN ('warning_message', 'membership_removal', 'group_removal', 'team_warning')),
  delivery_status text NOT NULL DEFAULT 'pending'
    CHECK (delivery_status IN ('pending', 'processing', 'sent', 'completed', 'failed', 'not_configured', 'skipped')),
  external_id text,
  last_error text,
  processed_at timestamptz,
  created_at timestamptz NOT NULL DEFAULT now(),
  CONSTRAINT attendance_action_source_check CHECK (
    (participant_type = 'registration' AND registration_id IS NOT NULL AND team_id IS NULL)
    OR (participant_type = 'team' AND team_id IS NOT NULL AND registration_id IS NULL)
  )
);

CREATE INDEX IF NOT EXISTS attendance_actions_delivery_idx
  ON public.attendance_actions(delivery_status, created_at DESC);
CREATE UNIQUE INDEX IF NOT EXISTS attendance_action_registration_once
  ON public.attendance_actions(session_id, registration_id, action_type, streak)
  WHERE registration_id IS NOT NULL;
CREATE UNIQUE INDEX IF NOT EXISTS attendance_action_team_once
  ON public.attendance_actions(session_id, team_id, action_type, streak)
  WHERE team_id IS NOT NULL;

ALTER TABLE public.attendance_sessions ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.attendance_records ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.attendance_actions ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS attendance_permission_read_sessions ON public.attendance_sessions;
DROP POLICY IF EXISTS attendance_permission_read_records ON public.attendance_records;
DROP POLICY IF EXISTS attendance_permission_read_actions ON public.attendance_actions;
CREATE POLICY attendance_permission_read_sessions ON public.attendance_sessions
  FOR SELECT TO authenticated USING (public.has_club_permission('absence'));
CREATE POLICY attendance_permission_read_records ON public.attendance_records
  FOR SELECT TO authenticated USING (public.has_club_permission('absence'));
CREATE POLICY attendance_permission_read_actions ON public.attendance_actions
  FOR SELECT TO authenticated USING (public.has_club_permission('absence'));

GRANT SELECT ON public.attendance_sessions, public.attendance_records, public.attendance_actions TO authenticated;
REVOKE INSERT, UPDATE, DELETE ON public.attendance_sessions, public.attendance_records, public.attendance_actions FROM anon, authenticated;

CREATE OR REPLACE FUNCTION public.list_attendance_seasons()
RETURNS text[]
LANGUAGE sql
STABLE
SECURITY DEFINER
SET search_path = ''
AS $$
  SELECT CASE WHEN public.has_club_permission('absence') THEN
    coalesce(array_agg(DISTINCT season ORDER BY season DESC), ARRAY[]::text[])
  ELSE ARRAY[]::text[] END
  FROM (
    SELECT registration_season AS season
    FROM public.registrations
    WHERE status = 'accepted' AND registration_season IS NOT NULL
    UNION
    SELECT season
    FROM public.team_seasons
    WHERE upper(trim(coalesce(post_abbr, ''))) NOT IN ('SUP', 'CO-SUP', 'ADV')
  ) available_seasons;
$$;

CREATE OR REPLACE FUNCTION public.create_attendance_session(
  p_title text,
  p_session_type text,
  p_season text,
  p_starts_at timestamptz,
  p_notes text DEFAULT NULL
)
RETURNS jsonb
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = ''
AS $$
DECLARE
  created_session public.attendance_sessions%ROWTYPE;
  team_count integer := 0;
  member_count integer := 0;
BEGIN
  IF NOT public.has_club_permission('absence') THEN RAISE EXCEPTION 'Absence permission required'; END IF;
  IF coalesce(length(trim(p_title)), 0) < 2 OR length(trim(p_title)) > 140 THEN RAISE EXCEPTION 'Enter a session title'; END IF;
  IF p_session_type NOT IN ('training', 'meeting', 'event', 'workshop', 'other') THEN RAISE EXCEPTION 'Invalid session type'; END IF;
  IF coalesce(length(trim(p_season)), 0) < 3 OR length(trim(p_season)) > 40 THEN RAISE EXCEPTION 'Choose a valid season'; END IF;
  IF p_starts_at IS NULL THEN RAISE EXCEPTION 'Choose the session date and time'; END IF;
  IF length(coalesce(p_notes, '')) > 2000 THEN RAISE EXCEPTION 'Session notes are too long'; END IF;

  INSERT INTO public.attendance_sessions(title, session_type, season, starts_at, notes, created_by)
  VALUES (trim(p_title), p_session_type, trim(p_season), p_starts_at, nullif(trim(p_notes), ''), auth.uid())
  RETURNING * INTO created_session;

  INSERT INTO public.attendance_records(session_id, participant_type, team_id)
  SELECT created_session.id, 'team', member.id
  FROM public.team_seasons season_role
  JOIN public.team member ON member.id = season_role.team_id
  WHERE season_role.season = created_session.season
    AND upper(trim(coalesce(season_role.post_abbr, ''))) NOT IN ('SUP', 'CO-SUP', 'ADV');
  GET DIAGNOSTICS team_count = ROW_COUNT;

  -- Team identity wins over an accepted registration with the same normalized name.
  -- That keeps bureau members on the warning-only path and avoids a duplicate roster row.
  INSERT INTO public.attendance_records(session_id, participant_type, registration_id)
  SELECT created_session.id, 'registration', applicant.id
  FROM public.registrations applicant
  WHERE applicant.status = 'accepted'
    AND applicant.registration_season = created_session.season
    AND NOT EXISTS (
      SELECT 1
      FROM public.team_seasons season_role
      JOIN public.team member ON member.id = season_role.team_id
      WHERE season_role.season = created_session.season
        AND upper(trim(coalesce(season_role.post_abbr, ''))) NOT IN ('SUP', 'CO-SUP', 'ADV')
        AND lower(regexp_replace(trim(member.full_name), '\s+', ' ', 'g'))
          = lower(regexp_replace(trim(applicant.full_name), '\s+', ' ', 'g'))
    );
  GET DIAGNOSTICS member_count = ROW_COUNT;

  IF team_count + member_count = 0 THEN
    RAISE EXCEPTION 'No eligible Team profiles or accepted members exist for this season';
  END IF;

  RETURN jsonb_build_object(
    'id', created_session.id,
    'team_count', team_count,
    'member_count', member_count,
    'participant_count', team_count + member_count
  );
END;
$$;

CREATE OR REPLACE FUNCTION public.mark_attendance_records(p_session_id uuid, p_records jsonb)
RETURNS jsonb
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = ''
AS $$
DECLARE
  updated_count integer := 0;
  requested_count integer := 0;
  locked_session uuid;
BEGIN
  IF NOT public.has_club_permission('absence') THEN RAISE EXCEPTION 'Absence permission required'; END IF;
  IF jsonb_typeof(p_records) IS DISTINCT FROM 'array' THEN RAISE EXCEPTION 'Attendance records must be an array'; END IF;
  SELECT id INTO locked_session
  FROM public.attendance_sessions
  WHERE id = p_session_id AND status = 'open'
  FOR UPDATE;
  IF NOT FOUND THEN
    RAISE EXCEPTION 'This attendance session is no longer open';
  END IF;

  SELECT count(*) INTO requested_count FROM jsonb_array_elements(p_records);
  IF requested_count = 0 THEN RAISE EXCEPTION 'No attendance changes were provided'; END IF;

  WITH submitted AS (
    SELECT record_id, attendance_status, nullif(trim(note), '') AS note
    FROM jsonb_to_recordset(p_records) AS item(record_id uuid, attendance_status text, note text)
  )
  UPDATE public.attendance_records record
  SET attendance_status = submitted.attendance_status,
      note = submitted.note,
      marked_by = auth.uid(),
      marked_at = now()
  FROM submitted
  WHERE record.id = submitted.record_id
    AND record.session_id = p_session_id
    AND submitted.attendance_status IN ('unmarked', 'present', 'absent', 'late', 'excused')
    AND length(coalesce(submitted.note, '')) <= 500;
  GET DIAGNOSTICS updated_count = ROW_COUNT;

  IF updated_count <> requested_count THEN RAISE EXCEPTION 'Some attendance rows were invalid or changed. Refresh and try again.'; END IF;
  RETURN jsonb_build_object('updated_count', updated_count);
END;
$$;

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
    LEFT JOIN public.team_seasons AS season_role
      ON season_role.team_id = attendance_row.team_id
      AND season_role.season = target_session.season
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

CREATE OR REPLACE FUNCTION public.close_attendance_session(p_session_id uuid)
RETURNS jsonb
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = ''
AS $$
DECLARE
  target_session public.attendance_sessions%ROWTYPE;
  participant public.attendance_records%ROWTYPE;
  history_row record;
  absence_streak integer;
  actions jsonb := '[]'::jsonb;
  created_action public.attendance_actions%ROWTYPE;
BEGIN
  IF NOT public.has_club_permission('absence') THEN RAISE EXCEPTION 'Absence permission required'; END IF;
  SELECT * INTO target_session FROM public.attendance_sessions WHERE id = p_session_id FOR UPDATE;
  IF NOT FOUND THEN RAISE EXCEPTION 'Attendance session not found'; END IF;
  IF target_session.status <> 'open' THEN RAISE EXCEPTION 'This attendance session is already closed'; END IF;
  IF EXISTS (SELECT 1 FROM public.attendance_records WHERE session_id = p_session_id AND attendance_status = 'unmarked') THEN
    RAISE EXCEPTION 'Mark every participant before closing the session';
  END IF;

  FOR participant IN SELECT * FROM public.attendance_records WHERE session_id = p_session_id LOOP
    absence_streak := 0;
    FOR history_row IN
      SELECT record.attendance_status
      FROM public.attendance_records record
      JOIN public.attendance_sessions session_history ON session_history.id = record.session_id
      WHERE (session_history.status = 'closed' OR session_history.id = p_session_id)
        AND session_history.season = target_session.season
        AND (
          (participant.participant_type = 'registration' AND record.registration_id = participant.registration_id)
          OR (participant.participant_type = 'team' AND record.team_id = participant.team_id)
        )
      ORDER BY session_history.starts_at DESC, session_history.created_at DESC
    LOOP
      IF history_row.attendance_status <> 'absent' THEN EXIT; END IF;
      absence_streak := absence_streak + 1;
    END LOOP;

    IF participant.participant_type = 'team' AND absence_streak >= 3 THEN
      INSERT INTO public.attendance_actions(session_id, participant_type, team_id, streak, action_type, delivery_status, processed_at)
      VALUES (p_session_id, 'team', participant.team_id, absence_streak, 'team_warning', 'completed', now())
      ON CONFLICT DO NOTHING RETURNING * INTO created_action;
    ELSIF participant.participant_type = 'registration' AND absence_streak IN (3, 4) THEN
      INSERT INTO public.attendance_actions(session_id, participant_type, registration_id, streak, action_type)
      VALUES (p_session_id, 'registration', participant.registration_id, absence_streak, 'warning_message')
      ON CONFLICT DO NOTHING RETURNING * INTO created_action;
    ELSIF participant.participant_type = 'registration' AND absence_streak = 5 THEN
      UPDATE public.registrations
      SET status = 'refused',
          refusal_reason = 'Removed after 5 consecutive absences. Attendance session: ' || target_session.title || ' (' || to_char(target_session.starts_at, 'YYYY-MM-DD') || ').'
      WHERE id = participant.registration_id AND status = 'accepted';

      INSERT INTO public.attendance_actions(session_id, participant_type, registration_id, streak, action_type, delivery_status, processed_at)
      VALUES (p_session_id, 'registration', participant.registration_id, absence_streak, 'membership_removal', 'completed', now())
      ON CONFLICT DO NOTHING;
      INSERT INTO public.attendance_actions(session_id, participant_type, registration_id, streak, action_type)
      VALUES (p_session_id, 'registration', participant.registration_id, absence_streak, 'group_removal')
      ON CONFLICT DO NOTHING RETURNING * INTO created_action;
    END IF;
  END LOOP;

  UPDATE public.attendance_sessions
  SET status = 'closed', closed_by = auth.uid(), closed_at = now()
  WHERE id = p_session_id;

  SELECT coalesce(jsonb_agg(pending_action.item), '[]'::jsonb)
  INTO actions
  FROM (
    SELECT jsonb_build_object(
      'id', attendance_action.id,
      'action_type', attendance_action.action_type,
      'participant_type', attendance_action.participant_type,
      'registration_id', attendance_action.registration_id,
      'team_id', attendance_action.team_id,
      'streak', attendance_action.streak,
      'delivery_status', attendance_action.delivery_status
    ) AS item
    FROM public.attendance_actions AS attendance_action
    WHERE attendance_action.session_id = p_session_id
      AND attendance_action.delivery_status = 'pending'
    ORDER BY attendance_action.created_at
  ) AS pending_action;

  RETURN jsonb_build_object('session_id', p_session_id, 'status', 'closed', 'actions', actions);
END;
$$;

CREATE OR REPLACE FUNCTION public.get_attendance_action_for_delivery(p_action_id uuid)
RETURNS jsonb
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = ''
AS $$
DECLARE result jsonb;
BEGIN
  IF NOT public.has_club_permission('absence') THEN RAISE EXCEPTION 'Absence permission required'; END IF;
  SELECT jsonb_build_object(
    'id', action.id,
    'action_type', action.action_type,
    'streak', action.streak,
    'delivery_status', action.delivery_status,
    'full_name', applicant.full_name,
    'phone', applicant.phone,
    'session_title', session_row.title,
    'session_date', session_row.starts_at
  ) INTO result
  FROM public.attendance_actions action
  JOIN public.attendance_sessions session_row ON session_row.id = action.session_id
  LEFT JOIN public.registrations applicant ON applicant.id = action.registration_id
  WHERE action.id = p_action_id AND action.participant_type = 'registration';
  IF result IS NULL THEN RAISE EXCEPTION 'Attendance action not found'; END IF;
  RETURN result;
END;
$$;

CREATE OR REPLACE FUNCTION public.record_attendance_delivery(
  p_action_id uuid,
  p_status text,
  p_external_id text DEFAULT NULL,
  p_error text DEFAULT NULL
)
RETURNS void
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = ''
AS $$
BEGIN
  IF NOT public.has_club_permission('absence') THEN RAISE EXCEPTION 'Absence permission required'; END IF;
  IF p_status NOT IN ('sent', 'completed', 'failed', 'not_configured', 'skipped') THEN RAISE EXCEPTION 'Invalid delivery status'; END IF;
  UPDATE public.attendance_actions
  SET delivery_status = p_status,
      external_id = nullif(trim(p_external_id), ''),
      last_error = nullif(left(trim(p_error), 1000), ''),
      processed_at = now()
  WHERE id = p_action_id;
  IF NOT FOUND THEN RAISE EXCEPTION 'Attendance action not found'; END IF;
END;
$$;

REVOKE EXECUTE ON FUNCTION public.list_attendance_seasons() FROM PUBLIC, anon;
REVOKE EXECUTE ON FUNCTION public.create_attendance_session(text,text,text,timestamptz,text) FROM PUBLIC, anon;
REVOKE EXECUTE ON FUNCTION public.mark_attendance_records(uuid,jsonb) FROM PUBLIC, anon;
REVOKE EXECUTE ON FUNCTION public.get_attendance_session(uuid) FROM PUBLIC, anon;
REVOKE EXECUTE ON FUNCTION public.close_attendance_session(uuid) FROM PUBLIC, anon;
REVOKE EXECUTE ON FUNCTION public.get_attendance_action_for_delivery(uuid) FROM PUBLIC, anon;
REVOKE EXECUTE ON FUNCTION public.record_attendance_delivery(uuid,text,text,text) FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION public.list_attendance_seasons() TO authenticated;
GRANT EXECUTE ON FUNCTION public.create_attendance_session(text,text,text,timestamptz,text) TO authenticated;
GRANT EXECUTE ON FUNCTION public.mark_attendance_records(uuid,jsonb) TO authenticated;
GRANT EXECUTE ON FUNCTION public.get_attendance_session(uuid) TO authenticated;
GRANT EXECUTE ON FUNCTION public.close_attendance_session(uuid) TO authenticated;
GRANT EXECUTE ON FUNCTION public.get_attendance_action_for_delivery(uuid) TO authenticated;
GRANT EXECUTE ON FUNCTION public.record_attendance_delivery(uuid,text,text,text) TO authenticated;

NOTIFY pgrst, 'reload schema';
COMMIT;
