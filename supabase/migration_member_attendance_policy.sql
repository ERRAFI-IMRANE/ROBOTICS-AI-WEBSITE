-- Run AFTER the attendance email and roster migrations, as database owner.
-- No retroactive bulk refusals: the new policy applies when a session is closed.
-- Existing Team profiles, registration history and email audit rows are retained.
RESET ROLE;
BEGIN;

-- Acceptance never queues emails, including direct SQL status updates and reopen.
DROP TRIGGER IF EXISTS registration_acceptance_notification ON public.registrations;

-- Retire claims too, so an old browser cannot revive the saved acceptance queue.
CREATE OR REPLACE FUNCTION public.claim_registration_acceptance_notification(p_registration_id bigint)
RETURNS jsonb LANGUAGE sql SECURITY INVOKER SET search_path = '' AS $$
  SELECT jsonb_build_object('registration_id', p_registration_id, 'status', 'disabled');
$$;
REVOKE ALL ON FUNCTION public.claim_registration_acceptance_notification(bigint) FROM PUBLIC, anon;

CREATE OR REPLACE FUNCTION public.close_attendance_session(p_session_id uuid)
RETURNS jsonb LANGUAGE plpgsql SECURITY DEFINER SET search_path = '' AS $$
DECLARE
  target_session public.attendance_sessions%ROWTYPE;
  participant public.attendance_records%ROWTYPE;
  history_row record;
  absence_streak integer;
  actions jsonb := '[]'::jsonb;
BEGIN
  IF NOT public.has_club_permission('absence') THEN RAISE EXCEPTION 'Absence permission required'; END IF;
  SELECT * INTO target_session FROM public.attendance_sessions WHERE id = p_session_id FOR UPDATE;
  IF NOT FOUND THEN RAISE EXCEPTION 'Attendance session not found'; END IF;
  IF target_session.status <> 'open' THEN RAISE EXCEPTION 'This attendance session is already closed'; END IF;

  -- Serialize policy decisions for sessions in the same season.
  PERFORM pg_advisory_xact_lock(hashtextextended('attendance-policy:' || target_session.season, 0));

  UPDATE public.attendance_records
  SET attendance_status = 'absent', marked_by = auth.uid(), marked_at = now()
  WHERE session_id = p_session_id AND attendance_status = 'unmarked';

  FOR participant IN SELECT * FROM public.attendance_records WHERE session_id = p_session_id LOOP
    absence_streak := 0;
    FOR history_row IN
      SELECT attendance_record.attendance_status
      FROM public.attendance_records AS attendance_record
      JOIN public.attendance_sessions AS session_history ON session_history.id = attendance_record.session_id
      WHERE (session_history.status = 'closed' OR session_history.id = p_session_id)
        AND session_history.season = target_session.season
        AND (session_history.starts_at, session_history.created_at, session_history.id)
          <= (target_session.starts_at, target_session.created_at, target_session.id)
        AND (
          (participant.participant_type = 'registration' AND attendance_record.participant_type = 'registration'
            AND attendance_record.registration_id = participant.registration_id)
          OR (participant.participant_type = 'team' AND attendance_record.participant_type = 'team'
            AND attendance_record.team_id = participant.team_id)
        )
      ORDER BY session_history.starts_at DESC, session_history.created_at DESC, session_history.id DESC
    LOOP
      -- Presence, lateness and excused absence all break an absence streak.
      IF history_row.attendance_status <> 'absent' THEN EXIT; END IF;
      absence_streak := absence_streak + 1;
    END LOOP;

    IF participant.participant_type = 'team' AND absence_streak IN (3, 4, 5) THEN
      -- Team members retain the existing warning-only policy. Never refuse Team.
      INSERT INTO public.attendance_actions(session_id, participant_type, team_id, streak, action_type)
      VALUES (p_session_id, 'team', participant.team_id, absence_streak, 'team_warning')
      ON CONFLICT DO NOTHING;
    ELSIF participant.participant_type = 'registration' AND absence_streak >= 3 THEN
      UPDATE public.registrations
      SET status = 'refused',
          refusal_reason = 'Removed after 3 consecutive absences. Recorded streak: ' || absence_streak
            || '. Attendance session: ' || target_session.title
            || ' (' || to_char(target_session.starts_at, 'YYYY-MM-DD') || ').'
      WHERE id = participant.registration_id AND status = 'accepted';

      -- Queue email only if this transaction actually changed accepted -> refused.
      IF FOUND THEN
        INSERT INTO public.attendance_actions(session_id, participant_type, registration_id, streak, action_type)
        VALUES (p_session_id, 'registration', participant.registration_id, absence_streak, 'membership_removal')
        ON CONFLICT DO NOTHING;
      END IF;
    END IF;
  END LOOP;

  UPDATE public.attendance_sessions
  SET status = 'closed', closed_by = auth.uid(), closed_at = now()
  WHERE id = p_session_id;

  SELECT coalesce(jsonb_agg(pending_action.item), '[]'::jsonb) INTO actions
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
    WHERE attendance_action.session_id = p_session_id AND attendance_action.delivery_status = 'pending'
    ORDER BY attendance_action.created_at
  ) AS pending_action;
  RETURN jsonb_build_object('session_id', p_session_id, 'status', 'closed', 'actions', actions);
END;
$$;

CREATE OR REPLACE FUNCTION public.reopen_attendance_session(p_session_id uuid)
RETURNS jsonb LANGUAGE plpgsql SECURITY DEFINER SET search_path = '' AS $$
DECLARE target_session public.attendance_sessions%ROWTYPE;
BEGIN
  IF NOT public.has_club_permission('absence') THEN RAISE EXCEPTION 'Absence permission required'; END IF;
  SELECT * INTO target_session FROM public.attendance_sessions WHERE id = p_session_id FOR UPDATE;
  IF NOT FOUND THEN RAISE EXCEPTION 'Attendance session not found'; END IF;
  IF target_session.status = 'open' THEN RETURN jsonb_build_object('id', target_session.id, 'status', 'open'); END IF;
  PERFORM pg_advisory_xact_lock(hashtextextended('attendance-policy:' || target_session.season, 0));

  -- Undo only attendance removals recorded by this session. Preserve manual refusals.
  UPDATE public.registrations AS applicant
  SET status = 'accepted', refusal_reason = NULL
  WHERE applicant.status = 'refused'
    AND applicant.id IN (
      SELECT attendance_action.registration_id FROM public.attendance_actions AS attendance_action
      WHERE attendance_action.session_id = p_session_id
        AND attendance_action.action_type = 'membership_removal'
        AND attendance_action.participant_type = 'registration'
    )
    AND (applicant.refusal_reason LIKE 'Removed after 3 consecutive absences.%'
      OR applicant.refusal_reason LIKE 'Removed after 5 consecutive absences.%');

  DELETE FROM public.attendance_actions WHERE session_id = p_session_id
    AND delivery_status IN ('pending', 'failed', 'not_configured', 'skipped');
  UPDATE public.attendance_sessions SET status = 'open', closed_by = NULL, closed_at = NULL WHERE id = p_session_id;
  RETURN jsonb_build_object('id', p_session_id, 'status', 'open',
    'message', 'Session reopened. Already-sent email records are retained to prevent duplicate delivery.');
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
    'id', attendance_action.id,
    'action_type', attendance_action.action_type,
    'participant_type', attendance_action.participant_type,
    'streak', attendance_action.streak,
    'delivery_status', attendance_action.delivery_status,
    'full_name', CASE WHEN attendance_action.participant_type = 'registration' THEN applicant.full_name ELSE team_member.full_name END,
    'email', CASE WHEN attendance_action.participant_type = 'registration' THEN applicant.email ELSE team_contact.email END,
    'department', CASE WHEN attendance_action.participant_type = 'registration' THEN applicant.department ELSE team_member.department END,
    'phone', applicant.phone,
    'registration_status', applicant.status,
    'filiere', applicant.filiere,
    'years_of_study', applicant.years_of_study,
    'registration_season', applicant.registration_season,
    'role', season_role.role,
    'post_abbr', season_role.post_abbr,
    'session_title', session_row.title,
    'session_date', session_row.starts_at,
    'session_type', session_row.session_type,
    'session_season', session_row.season,
    'admin_emails', (
      SELECT coalesce(jsonb_agg(recipient.email ORDER BY recipient.email), '[]'::jsonb)
      FROM public.attendance_notification_recipients AS recipient
      WHERE recipient.is_active
    ),
    'absence_sessions', (
      SELECT coalesce(jsonb_agg(jsonb_build_object(
        'title', recent_absence.title,
        'starts_at', recent_absence.starts_at,
        'session_type', recent_absence.session_type
      ) ORDER BY recent_absence.starts_at DESC), '[]'::jsonb)
      FROM (
        SELECT history_session.title, history_session.starts_at, history_session.session_type
        FROM public.attendance_records AS history_record
        JOIN public.attendance_sessions AS history_session ON history_session.id = history_record.session_id
        WHERE history_session.status = 'closed'
          AND history_session.season = session_row.season
          AND (history_session.starts_at, history_session.created_at, history_session.id)
            <= (session_row.starts_at, session_row.created_at, session_row.id)
          AND history_record.attendance_status = 'absent'
          AND (
            (attendance_action.participant_type = 'registration' AND history_record.registration_id = attendance_action.registration_id)
            OR (attendance_action.participant_type = 'team' AND history_record.team_id = attendance_action.team_id)
          )
        ORDER BY history_session.starts_at DESC, history_session.created_at DESC
        LIMIT attendance_action.streak
      ) AS recent_absence
    )
  ) INTO result
  FROM public.attendance_actions AS attendance_action
  JOIN public.attendance_sessions AS session_row ON session_row.id = attendance_action.session_id
  LEFT JOIN public.registrations AS applicant ON applicant.id = attendance_action.registration_id
  LEFT JOIN public.team AS team_member ON team_member.id = attendance_action.team_id
  LEFT JOIN public.team_contact_emails AS team_contact ON team_contact.team_id = attendance_action.team_id
  LEFT JOIN public.team_seasons AS season_role
    ON season_role.team_id = attendance_action.team_id AND season_role.season = session_row.season
  WHERE attendance_action.id = p_action_id;

  IF result IS NULL THEN RAISE EXCEPTION 'Attendance action not found'; END IF;
  RETURN result;
END;
$$;

REVOKE ALL ON FUNCTION public.close_attendance_session(uuid) FROM PUBLIC, anon;
REVOKE ALL ON FUNCTION public.get_attendance_action_for_delivery(uuid) FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION public.get_attendance_action_for_delivery(uuid) TO authenticated;
REVOKE ALL ON FUNCTION public.reopen_attendance_session(uuid) FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION public.close_attendance_session(uuid) TO authenticated;
GRANT EXECUTE ON FUNCTION public.reopen_attendance_session(uuid) TO authenticated;

NOTIFY pgrst, 'reload schema';
COMMIT;
