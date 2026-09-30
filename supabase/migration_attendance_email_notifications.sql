-- Attendance presence-first workflow and Gmail notification recipients.
-- Run after migration_attendance.sql and the admin permissions migration.
BEGIN;

CREATE TABLE IF NOT EXISTS public.team_contact_emails (
  team_id bigint PRIMARY KEY REFERENCES public.team(id) ON DELETE CASCADE,
  email text NOT NULL CHECK (email ~* '^[^[:space:]@]+@[^[:space:]@]+\.[^[:space:]@]+$'),
  updated_at timestamptz NOT NULL DEFAULT now()
);

CREATE TABLE IF NOT EXISTS public.attendance_notification_recipients (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  email text NOT NULL,
  label text,
  is_active boolean NOT NULL DEFAULT true,
  created_by uuid NOT NULL DEFAULT auth.uid(),
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now(),
  CONSTRAINT attendance_notification_recipient_email_check
    CHECK (email ~* '^[^[:space:]@]+@[^[:space:]@]+\.[^[:space:]@]+$'),
  CONSTRAINT attendance_notification_recipient_label_check
    CHECK (label IS NULL OR length(label) <= 100)
);

CREATE UNIQUE INDEX IF NOT EXISTS attendance_notification_recipient_email_unique
  ON public.attendance_notification_recipients(lower(email));

ALTER TABLE public.attendance_notification_recipients ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.team_contact_emails ENABLE ROW LEVEL SECURITY;
DROP POLICY IF EXISTS attendance_notification_recipients_read ON public.attendance_notification_recipients;
CREATE POLICY attendance_notification_recipients_read
  ON public.attendance_notification_recipients
  FOR SELECT TO authenticated
  USING (public.has_club_permission('absence'));

DROP POLICY IF EXISTS team_contact_emails_admin_read ON public.team_contact_emails;
CREATE POLICY team_contact_emails_admin_read
  ON public.team_contact_emails
  FOR SELECT TO authenticated
  USING (public.has_club_permission('team') OR public.has_club_permission('absence'));

GRANT SELECT ON public.attendance_notification_recipients TO authenticated;
GRANT SELECT ON public.team_contact_emails TO authenticated;
REVOKE INSERT, UPDATE, DELETE ON public.attendance_notification_recipients FROM anon, authenticated;
REVOKE INSERT, UPDATE, DELETE ON public.team_contact_emails FROM anon, authenticated;

CREATE OR REPLACE FUNCTION public.save_attendance_notification_recipient(
  p_id uuid,
  p_email text,
  p_label text DEFAULT NULL,
  p_is_active boolean DEFAULT true
)
RETURNS jsonb
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = ''
AS $$
DECLARE saved public.attendance_notification_recipients%ROWTYPE;
BEGIN
  IF NOT public.has_club_permission('absence') THEN RAISE EXCEPTION 'Absence permission required'; END IF;
  IF trim(coalesce(p_email, '')) !~* '^[^[:space:]@]+@[^[:space:]@]+\.[^[:space:]@]+$' THEN
    RAISE EXCEPTION 'Enter a valid notification email';
  END IF;
  IF length(coalesce(p_label, '')) > 100 THEN RAISE EXCEPTION 'Recipient label is too long'; END IF;

  IF p_id IS NULL THEN
    INSERT INTO public.attendance_notification_recipients(email, label, is_active, created_by)
    VALUES (lower(trim(p_email)), nullif(trim(p_label), ''), coalesce(p_is_active, true), auth.uid())
    RETURNING * INTO saved;
  ELSE
    UPDATE public.attendance_notification_recipients
    SET email = lower(trim(p_email)),
        label = nullif(trim(p_label), ''),
        is_active = coalesce(p_is_active, true),
        updated_at = now()
    WHERE id = p_id
    RETURNING * INTO saved;
    IF NOT FOUND THEN RAISE EXCEPTION 'Notification recipient no longer exists'; END IF;
  END IF;

  RETURN to_jsonb(saved);
EXCEPTION
  WHEN unique_violation THEN RAISE EXCEPTION 'This notification email already exists';
END;
$$;

CREATE OR REPLACE FUNCTION public.delete_attendance_notification_recipient(p_id uuid)
RETURNS uuid
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = ''
AS $$
BEGIN
  IF NOT public.has_club_permission('absence') THEN RAISE EXCEPTION 'Absence permission required'; END IF;
  DELETE FROM public.attendance_notification_recipients WHERE id = p_id;
  IF NOT FOUND THEN RAISE EXCEPTION 'Notification recipient no longer exists'; END IF;
  RETURN p_id;
END;
$$;

-- Keep Team email optional: old profiles remain valid and admin copies still send
-- when a Team member has no personal email.
CREATE OR REPLACE FUNCTION public.save_club_staff(p_team_id bigint, p_profile jsonb, p_seasons jsonb)
RETURNS jsonb LANGUAGE plpgsql SECURITY DEFINER SET search_path = '' AS $$
DECLARE staff_id bigint; assignment jsonb; profile public.team%ROWTYPE; profile_email text;
BEGIN
  IF NOT public.is_club_admin() THEN RAISE EXCEPTION 'Officer access required'; END IF;
  IF p_seasons IS NULL OR jsonb_typeof(p_seasons) <> 'array' THEN RAISE EXCEPTION 'Staff seasons must be an array'; END IF;
  IF jsonb_array_length(p_seasons) = 0 THEN RAISE EXCEPTION 'At least one staff season is required'; END IF;
  IF (SELECT count(*) FROM jsonb_array_elements(p_seasons)) <> (SELECT count(DISTINCT value->>'season') FROM jsonb_array_elements(p_seasons)) THEN RAISE EXCEPTION 'Duplicate staff seasons'; END IF;
  profile := jsonb_populate_record(NULL::public.team, p_profile);
  profile_email := nullif(lower(trim(p_profile->>'email')), '');
  IF coalesce(length(trim(profile.full_name)),0) = 0 THEN RAISE EXCEPTION 'Staff name is required'; END IF;
  IF profile.sex IS NULL OR profile.sex NOT IN ('M', 'F') THEN RAISE EXCEPTION 'Staff sex must be M or F'; END IF;
  IF profile_email IS NOT NULL AND profile_email !~* '^[^[:space:]@]+@[^[:space:]@]+\.[^[:space:]@]+$' THEN RAISE EXCEPTION 'Enter a valid staff email'; END IF;
  IF p_team_id IS NULL THEN
    INSERT INTO public.team(full_name,department,avatar_img,normal_img,birthday,social_media_links,sex)
    VALUES (profile.full_name,profile.department,profile.avatar_img,profile.normal_img,profile.birthday,profile.social_media_links,profile.sex) RETURNING id INTO staff_id;
  ELSE
    PERFORM id FROM public.team WHERE id = p_team_id FOR UPDATE;
    IF NOT FOUND THEN RAISE EXCEPTION 'Staff record no longer exists'; END IF;
    UPDATE public.team SET full_name = profile.full_name, department = profile.department, avatar_img = profile.avatar_img,
      normal_img = profile.normal_img, birthday = profile.birthday, social_media_links = profile.social_media_links, sex = profile.sex
      WHERE id = p_team_id RETURNING id INTO staff_id;
  END IF;
  IF profile_email IS NULL THEN
    DELETE FROM public.team_contact_emails WHERE team_id = staff_id;
  ELSE
    INSERT INTO public.team_contact_emails(team_id, email, updated_at)
    VALUES (staff_id, profile_email, now())
    ON CONFLICT (team_id) DO UPDATE SET email = EXCLUDED.email, updated_at = now();
  END IF;
  FOR assignment IN SELECT value FROM jsonb_array_elements(p_seasons) LOOP
    IF coalesce(assignment->>'season','') !~ '^20[0-9]{2}-20[0-9]{2}$'
       OR right(assignment->>'season',4)::integer <> left(assignment->>'season',4)::integer + 1 THEN
      RAISE EXCEPTION 'Staff season must use consecutive YYYY-YYYY years';
    END IF;
    IF (assignment->>'post_order')::integer < 0 THEN RAISE EXCEPTION 'Staff order must be non-negative'; END IF;
    INSERT INTO public.team_seasons(team_id,season,role,post_abbr,post_order)
    VALUES (staff_id,assignment->>'season',coalesce(nullif(assignment->>'role',''),'Team Member'),assignment->>'post_abbr',(assignment->>'post_order')::integer)
    ON CONFLICT (team_id,season) DO UPDATE SET role = EXCLUDED.role, post_abbr = EXCLUDED.post_abbr, post_order = EXCLUDED.post_order;
  END LOOP;
  DELETE FROM public.team_seasons WHERE team_id = staff_id AND season NOT IN (SELECT value->>'season' FROM jsonb_array_elements(p_seasons));
  RETURN jsonb_build_object('id',staff_id);
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
BEGIN
  IF NOT public.has_club_permission('absence') THEN RAISE EXCEPTION 'Absence permission required'; END IF;
  SELECT * INTO target_session FROM public.attendance_sessions WHERE id = p_session_id FOR UPDATE;
  IF NOT FOUND THEN RAISE EXCEPTION 'Attendance session not found'; END IF;
  IF target_session.status <> 'open' THEN RAISE EXCEPTION 'This attendance session is already closed'; END IF;

  -- Presence-first rule: every unchecked row becomes absent at close.
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
        AND (
          (participant.participant_type = 'registration' AND attendance_record.registration_id = participant.registration_id)
          OR (participant.participant_type = 'team' AND attendance_record.team_id = participant.team_id)
        )
      ORDER BY session_history.starts_at DESC, session_history.created_at DESC
    LOOP
      IF history_row.attendance_status <> 'absent' THEN EXIT; END IF;
      absence_streak := absence_streak + 1;
    END LOOP;

    IF participant.participant_type = 'team' AND absence_streak IN (3, 4, 5) THEN
      INSERT INTO public.attendance_actions(session_id, participant_type, team_id, streak, action_type)
      VALUES (p_session_id, 'team', participant.team_id, absence_streak, 'team_warning')
      ON CONFLICT DO NOTHING;
    ELSIF participant.participant_type = 'registration' AND absence_streak IN (3, 4) THEN
      INSERT INTO public.attendance_actions(session_id, participant_type, registration_id, streak, action_type)
      VALUES (p_session_id, 'registration', participant.registration_id, absence_streak, 'warning_message')
      ON CONFLICT DO NOTHING;
    ELSIF participant.participant_type = 'registration' AND absence_streak = 5 THEN
      UPDATE public.registrations
      SET status = 'refused',
          refusal_reason = 'Removed after 5 consecutive absences. Attendance session: ' || target_session.title || ' (' || to_char(target_session.starts_at, 'YYYY-MM-DD') || ').'
      WHERE id = participant.registration_id AND status = 'accepted';

      INSERT INTO public.attendance_actions(session_id, participant_type, registration_id, streak, action_type)
      VALUES (p_session_id, 'registration', participant.registration_id, absence_streak, 'membership_removal')
      ON CONFLICT DO NOTHING;
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

CREATE OR REPLACE FUNCTION public.reopen_attendance_session(p_session_id uuid)
RETURNS jsonb
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = ''
AS $$
DECLARE target_session public.attendance_sessions%ROWTYPE;
BEGIN
  IF NOT public.has_club_permission('absence') THEN RAISE EXCEPTION 'Absence permission required'; END IF;
  SELECT * INTO target_session FROM public.attendance_sessions WHERE id = p_session_id FOR UPDATE;
  IF NOT FOUND THEN RAISE EXCEPTION 'Attendance session not found'; END IF;
  IF target_session.status = 'open' THEN RETURN jsonb_build_object('id', target_session.id, 'status', 'open'); END IF;

  -- Undo only the automatic registration decision made by this attendance session.
  UPDATE public.registrations AS applicant
  SET status = 'accepted', refusal_reason = NULL
  WHERE applicant.status = 'refused'
    AND applicant.id IN (
      SELECT attendance_action.registration_id
      FROM public.attendance_actions AS attendance_action
      WHERE attendance_action.session_id = p_session_id
        AND attendance_action.action_type = 'membership_removal'
        AND attendance_action.registration_id IS NOT NULL
    )
    AND applicant.refusal_reason LIKE 'Removed after 5 consecutive absences.%';

  -- Unsent delivery attempts are safe to replace when the corrected session closes.
  DELETE FROM public.attendance_actions
  WHERE session_id = p_session_id
    AND delivery_status IN ('pending', 'failed', 'not_configured', 'skipped');

  UPDATE public.attendance_sessions
  SET status = 'open', closed_by = NULL, closed_at = NULL
  WHERE id = p_session_id;

  RETURN jsonb_build_object(
    'id', p_session_id,
    'status', 'open',
    'message', 'Session reopened. Already-sent email records are retained to prevent duplicate delivery.'
  );
END;
$$;

CREATE OR REPLACE FUNCTION public.update_attendance_session(
  p_session_id uuid,
  p_title text,
  p_session_type text,
  p_starts_at timestamptz,
  p_notes text DEFAULT NULL
)
RETURNS jsonb
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = ''
AS $$
DECLARE saved public.attendance_sessions%ROWTYPE;
BEGIN
  IF NOT public.has_club_permission('absence') THEN RAISE EXCEPTION 'Absence permission required'; END IF;
  IF coalesce(length(trim(p_title)), 0) < 2 OR length(trim(p_title)) > 140 THEN RAISE EXCEPTION 'Enter a session title'; END IF;
  IF p_session_type NOT IN ('training', 'meeting', 'event', 'workshop', 'other') THEN RAISE EXCEPTION 'Invalid session type'; END IF;
  IF p_starts_at IS NULL THEN RAISE EXCEPTION 'Choose the session date and time'; END IF;
  IF length(coalesce(p_notes, '')) > 2000 THEN RAISE EXCEPTION 'Session notes are too long'; END IF;

  UPDATE public.attendance_sessions
  SET title = trim(p_title),
      session_type = p_session_type,
      starts_at = p_starts_at,
      notes = nullif(trim(p_notes), '')
  WHERE id = p_session_id AND status = 'open'
  RETURNING * INTO saved;
  IF NOT FOUND THEN RAISE EXCEPTION 'Only an open attendance session can be edited'; END IF;

  RETURN to_jsonb(saved);
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

REVOKE EXECUTE ON FUNCTION public.save_attendance_notification_recipient(uuid,text,text,boolean) FROM PUBLIC, anon;
REVOKE EXECUTE ON FUNCTION public.delete_attendance_notification_recipient(uuid) FROM PUBLIC, anon;
REVOKE EXECUTE ON FUNCTION public.reopen_attendance_session(uuid) FROM PUBLIC, anon;
REVOKE EXECUTE ON FUNCTION public.update_attendance_session(uuid,text,text,timestamptz,text) FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION public.save_attendance_notification_recipient(uuid,text,text,boolean) TO authenticated;
GRANT EXECUTE ON FUNCTION public.delete_attendance_notification_recipient(uuid) TO authenticated;
GRANT EXECUTE ON FUNCTION public.reopen_attendance_session(uuid) TO authenticated;
GRANT EXECUTE ON FUNCTION public.update_attendance_session(uuid,text,text,timestamptz,text) TO authenticated;

NOTIFY pgrst, 'reload schema';
COMMIT;
