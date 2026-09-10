-- REVIEW AND RUN ONCE IN THE SUPABASE SQL EDITOR.
-- Gives club_admin accounts CRUD access to Team and Events while preserving public read access.
BEGIN;

CREATE OR REPLACE FUNCTION public.is_club_admin()
RETURNS boolean LANGUAGE sql STABLE SECURITY INVOKER SET search_path = ''
AS $$ SELECT coalesce((auth.jwt() -> 'app_metadata' ->> 'club_admin') = 'true', false); $$;

ALTER TABLE public.team ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.team_seasons ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.events ENABLE ROW LEVEL SECURITY;

DO $$
DECLARE table_name text; policy_record record;
BEGIN
  FOREACH table_name IN ARRAY ARRAY['team', 'team_seasons', 'events'] LOOP
    FOR policy_record IN
      SELECT policyname FROM pg_policies
      WHERE schemaname = 'public' AND tablename = table_name
    LOOP
      EXECUTE format('DROP POLICY %I ON public.%I', policy_record.policyname, table_name);
    END LOOP;

    EXECUTE format(
      'CREATE POLICY club_public_read ON public.%I FOR SELECT TO anon, authenticated USING (true)',
      table_name
    );
    EXECUTE format(
      'CREATE POLICY club_admin_manage ON public.%I FOR ALL TO authenticated USING (public.is_club_admin()) WITH CHECK (public.is_club_admin())',
      table_name
    );

    EXECUTE format('REVOKE INSERT, UPDATE, DELETE ON public.%I FROM anon', table_name);
    EXECUTE format('GRANT SELECT ON public.%I TO anon, authenticated', table_name);
    EXECUTE format('GRANT INSERT, UPDATE, DELETE ON public.%I TO authenticated', table_name);
  END LOOP;
END $$;

CREATE UNIQUE INDEX IF NOT EXISTS team_seasons_team_season_unique
ON public.team_seasons(team_id, season);

DO $$
DECLARE table_name text; sequence_name text;
BEGIN
  FOREACH table_name IN ARRAY ARRAY['team', 'team_seasons', 'events'] LOOP
    sequence_name := pg_get_serial_sequence('public.' || table_name, 'id');
    IF sequence_name IS NOT NULL THEN
      EXECUTE format('GRANT USAGE, SELECT ON SEQUENCE %s TO authenticated', sequence_name);
    END IF;
  END LOOP;
END $$;

CREATE OR REPLACE FUNCTION public.save_club_staff(p_team_id bigint, p_profile jsonb, p_seasons jsonb)
RETURNS jsonb LANGUAGE plpgsql SECURITY INVOKER SET search_path = '' AS $$
DECLARE staff_id bigint; assignment jsonb; profile public.team%ROWTYPE;
BEGIN
  IF NOT public.is_club_admin() THEN RAISE EXCEPTION 'Officer access required'; END IF;
  IF p_seasons IS NULL OR jsonb_typeof(p_seasons) <> 'array' OR jsonb_array_length(p_seasons) = 0 THEN
    RAISE EXCEPTION 'At least one staff season is required';
  END IF;
  IF (SELECT count(*) FROM jsonb_array_elements(p_seasons)) <>
     (SELECT count(DISTINCT value->>'season') FROM jsonb_array_elements(p_seasons)) THEN
    RAISE EXCEPTION 'Duplicate staff seasons';
  END IF;

  profile := jsonb_populate_record(NULL::public.team, p_profile);
  IF coalesce(length(trim(profile.full_name)), 0) = 0 THEN RAISE EXCEPTION 'Staff name is required'; END IF;
  IF profile.sex IS NULL OR profile.sex NOT IN ('M', 'F') THEN RAISE EXCEPTION 'Staff sex must be M or F'; END IF;

  IF p_team_id IS NULL THEN
    INSERT INTO public.team(full_name, department, avatar_img, normal_img, birthday, social_media_links, sex)
    VALUES (profile.full_name, profile.department, profile.avatar_img, profile.normal_img, profile.birthday, profile.social_media_links, profile.sex)
    RETURNING id INTO staff_id;
  ELSE
    PERFORM id FROM public.team WHERE id = p_team_id FOR UPDATE;
    IF NOT FOUND THEN RAISE EXCEPTION 'Staff record no longer exists'; END IF;
    UPDATE public.team
    SET full_name = profile.full_name,
        department = profile.department,
        avatar_img = profile.avatar_img,
        normal_img = profile.normal_img,
        birthday = profile.birthday,
        social_media_links = profile.social_media_links,
        sex = profile.sex
    WHERE id = p_team_id
    RETURNING id INTO staff_id;
  END IF;

  FOR assignment IN SELECT value FROM jsonb_array_elements(p_seasons) LOOP
    IF coalesce(assignment->>'season', '') !~ '^20[0-9]{2}-20[0-9]{2}$'
       OR right(assignment->>'season', 4)::integer <> left(assignment->>'season', 4)::integer + 1 THEN
      RAISE EXCEPTION 'Staff season must use consecutive YYYY-YYYY years';
    END IF;
    IF (assignment->>'post_order')::integer < 0 THEN RAISE EXCEPTION 'Staff order must be non-negative'; END IF;
    INSERT INTO public.team_seasons(team_id, season, role, post_abbr, post_order)
    VALUES (
      staff_id,
      assignment->>'season',
      coalesce(nullif(assignment->>'role', ''), 'Team Member'),
      assignment->>'post_abbr',
      (assignment->>'post_order')::integer
    )
    ON CONFLICT (team_id, season) DO UPDATE
    SET role = EXCLUDED.role, post_abbr = EXCLUDED.post_abbr, post_order = EXCLUDED.post_order;
  END LOOP;

  DELETE FROM public.team_seasons
  WHERE team_id = staff_id
    AND season NOT IN (SELECT value->>'season' FROM jsonb_array_elements(p_seasons));

  RETURN jsonb_build_object('id', staff_id);
END; $$;

CREATE OR REPLACE FUNCTION public.delete_club_staff(p_team_id bigint, p_season text DEFAULT NULL)
RETURNS jsonb LANGUAGE plpgsql SECURITY INVOKER SET search_path = '' AS $$
DECLARE affected integer;
BEGIN
  IF NOT public.is_club_admin() THEN RAISE EXCEPTION 'Officer access required'; END IF;
  PERFORM id FROM public.team WHERE id = p_team_id FOR UPDATE;
  IF NOT FOUND THEN RAISE EXCEPTION 'Staff record no longer exists'; END IF;

  IF p_season IS NULL THEN
    DELETE FROM public.team_seasons WHERE team_id = p_team_id;
    DELETE FROM public.team WHERE id = p_team_id;
  ELSE
    DELETE FROM public.team_seasons
    WHERE team_id = p_team_id
      AND (season = p_season OR regexp_replace(season, '20([0-9]{2})', '\1', 'g') = regexp_replace(p_season, '20([0-9]{2})', '\1', 'g'));
    GET DIAGNOSTICS affected = ROW_COUNT;
    IF affected = 0 THEN RAISE EXCEPTION 'No matching season assignment'; END IF;
  END IF;

  RETURN jsonb_build_object('id', p_team_id);
END; $$;

REVOKE EXECUTE ON FUNCTION public.save_club_staff(bigint,jsonb,jsonb) FROM PUBLIC, anon;
REVOKE EXECUTE ON FUNCTION public.delete_club_staff(bigint,text) FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION public.save_club_staff(bigint,jsonb,jsonb) TO authenticated;
GRANT EXECUTE ON FUNCTION public.delete_club_staff(bigint,text) TO authenticated;

-- The dashboard stores event and team media in the existing public EVENTS bucket.
DROP POLICY IF EXISTS club_admin_event_media_insert ON storage.objects;
DROP POLICY IF EXISTS club_admin_event_media_update ON storage.objects;
DROP POLICY IF EXISTS club_admin_event_media_delete ON storage.objects;

CREATE POLICY club_admin_event_media_insert ON storage.objects
FOR INSERT TO authenticated
WITH CHECK (bucket_id = 'EVENTS' AND public.is_club_admin());

CREATE POLICY club_admin_event_media_update ON storage.objects
FOR UPDATE TO authenticated
USING (bucket_id = 'EVENTS' AND public.is_club_admin())
WITH CHECK (bucket_id = 'EVENTS' AND public.is_club_admin());

CREATE POLICY club_admin_event_media_delete ON storage.objects
FOR DELETE TO authenticated
USING (bucket_id = 'EVENTS' AND public.is_club_admin());

COMMIT;
