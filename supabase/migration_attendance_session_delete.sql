-- Run once in the Supabase SQL editor after the attendance migrations.
-- RESET ROLE is intentional: it prevents a previous SQL Editor role switch from
-- leaving the editor as `authenticated`, which cannot create objects in public.
RESET ROLE;
BEGIN;

CREATE OR REPLACE FUNCTION public.delete_attendance_session(p_session_id uuid)
RETURNS jsonb
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = ''
AS $$
DECLARE
  target_session public.attendance_sessions%ROWTYPE;
BEGIN
  IF NOT public.has_club_permission('absence') THEN
    RAISE EXCEPTION 'Absence permission required';
  END IF;

  SELECT * INTO target_session
  FROM public.attendance_sessions
  WHERE id = p_session_id
  FOR UPDATE;

  IF NOT FOUND THEN
    RAISE EXCEPTION 'Attendance session not found';
  END IF;

  -- attendance_records and attendance_actions are removed through their
  -- ON DELETE CASCADE foreign keys. Already-delivered email cannot be recalled.
  DELETE FROM public.attendance_sessions
  WHERE id = p_session_id;

  RETURN jsonb_build_object(
    'session_id', target_session.id,
    'title', target_session.title,
    'deleted', true
  );
END;
$$;

REVOKE ALL ON FUNCTION public.delete_attendance_session(uuid) FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION public.delete_attendance_session(uuid) TO authenticated;

NOTIFY pgrst, 'reload schema';
COMMIT;
