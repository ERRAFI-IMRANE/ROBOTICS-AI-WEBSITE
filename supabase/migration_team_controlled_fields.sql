-- REVIEW AND RUN ONCE IN THE SUPABASE SQL EDITOR.
-- Updates the live Team RPC for controlled roles, full season keys, and sex.
BEGIN;

ALTER TABLE public.team ADD COLUMN IF NOT EXISTS avatar_img text;
ALTER TABLE public.team ADD COLUMN IF NOT EXISTS normal_img text;
ALTER TABLE public.team ADD COLUMN IF NOT EXISTS birthday date;
ALTER TABLE public.team ADD COLUMN IF NOT EXISTS department text;
ALTER TABLE public.team ADD COLUMN IF NOT EXISTS social_media_links jsonb DEFAULT '{}'::jsonb;
ALTER TABLE public.team ADD COLUMN IF NOT EXISTS sex text;

ALTER TABLE public.team_seasons ADD COLUMN IF NOT EXISTS role text;
ALTER TABLE public.team_seasons ADD COLUMN IF NOT EXISTS post_abbr text;
ALTER TABLE public.team_seasons ADD COLUMN IF NOT EXISTS post_order integer;

CREATE UNIQUE INDEX IF NOT EXISTS team_seasons_team_season_unique
ON public.team_seasons(team_id, season);

-- The dashboard and public registration reader expect this single settings
-- row. Creating it here also removes the repeated club_settings REST 404.
CREATE TABLE IF NOT EXISTS public.club_settings (
  id integer PRIMARY KEY DEFAULT 1 CHECK (id = 1),
  current_season text NOT NULL,
  public_staff_season text NOT NULL,
  updated_at timestamptz NOT NULL DEFAULT now()
);

INSERT INTO public.club_settings (id, current_season, public_staff_season)
VALUES (
  1,
  coalesce((SELECT season FROM public.registration_settings ORDER BY is_open DESC, season DESC LIMIT 1), '2026-2027'),
  coalesce((SELECT season FROM public.team_seasons ORDER BY season DESC LIMIT 1), '2025-2026')
)
ON CONFLICT (id) DO NOTHING;

ALTER TABLE public.club_settings ENABLE ROW LEVEL SECURITY;
DROP POLICY IF EXISTS club_public_read ON public.club_settings;
CREATE POLICY club_public_read ON public.club_settings
FOR SELECT TO anon, authenticated USING (true);
GRANT SELECT ON public.club_settings TO anon, authenticated;

-- Uses the caller's JWT even though the write function below runs with owner
-- privileges. This preserves granular Team permissions while allowing one
-- transaction to write the profile and all of its season rows.
CREATE OR REPLACE FUNCTION public.has_club_permission(required_permission text)
RETURNS boolean
LANGUAGE sql
STABLE
SECURITY INVOKER
SET search_path = ''
AS $$
  WITH metadata AS (
    SELECT coalesce(auth.jwt() -> 'app_metadata', '{}'::jsonb) AS value
  )
  SELECT coalesce(((SELECT value FROM metadata) ->> 'club_admin') = 'true', false) AND (
    (SELECT value ->> 'club_role' FROM metadata) = 'owner'
    OR NOT ((SELECT value FROM metadata) ? 'club_permissions')
    OR required_permission IN (
      SELECT jsonb_array_elements_text(
        CASE
          WHEN jsonb_typeof((SELECT value -> 'club_permissions' FROM metadata)) = 'array'
            THEN (SELECT value -> 'club_permissions' FROM metadata)
          ELSE '[]'::jsonb
        END
      )
    )
  );
$$;

CREATE OR REPLACE FUNCTION public.save_club_staff(p_team_id bigint, p_profile jsonb, p_seasons jsonb)
RETURNS jsonb LANGUAGE plpgsql SECURITY DEFINER SET search_path = '' AS $$
DECLARE staff_id bigint; assignment jsonb; profile public.team%ROWTYPE; saved_season_count integer;
BEGIN
  IF NOT public.has_club_permission('team') THEN RAISE EXCEPTION 'Team management permission required'; END IF;
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
    IF coalesce(length(trim(assignment->>'role')), 0) = 0
       OR coalesce(length(trim(assignment->>'post_abbr')), 0) = 0
       OR (assignment->>'post_order')::integer < 1 THEN
      RAISE EXCEPTION 'A complete controlled post is required for every season';
    END IF;

    INSERT INTO public.team_seasons(team_id, season, role, post_abbr, post_order)
    VALUES (staff_id, assignment->>'season', assignment->>'role', assignment->>'post_abbr', (assignment->>'post_order')::integer)
    ON CONFLICT (team_id, season) DO UPDATE
    SET role = EXCLUDED.role, post_abbr = EXCLUDED.post_abbr, post_order = EXCLUDED.post_order;
  END LOOP;

  DELETE FROM public.team_seasons
  WHERE team_id = staff_id
    AND season NOT IN (SELECT value->>'season' FROM jsonb_array_elements(p_seasons));

  SELECT count(*) INTO saved_season_count
  FROM public.team_seasons
  WHERE team_id = staff_id
    AND season IN (SELECT value->>'season' FROM jsonb_array_elements(p_seasons));

  IF saved_season_count <> jsonb_array_length(p_seasons) THEN
    RAISE EXCEPTION 'Staff season records were not saved completely';
  END IF;

  RETURN jsonb_build_object('id', staff_id, 'season_count', saved_season_count);
END; $$;

REVOKE EXECUTE ON FUNCTION public.has_club_permission(text) FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION public.has_club_permission(text) TO authenticated;
REVOKE EXECUTE ON FUNCTION public.save_club_staff(bigint,jsonb,jsonb) FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION public.save_club_staff(bigint,jsonb,jsonb) TO authenticated;

-- Storage upload returns the inserted object row. The SELECT policy is
-- therefore required even though the EVENTS bucket itself is public.
DROP POLICY IF EXISTS club_public_event_media_read ON storage.objects;
DROP POLICY IF EXISTS club_team_event_media_insert ON storage.objects;
DROP POLICY IF EXISTS club_team_event_media_update ON storage.objects;
DROP POLICY IF EXISTS club_team_event_media_delete ON storage.objects;

CREATE POLICY club_public_event_media_read ON storage.objects
FOR SELECT TO anon, authenticated
USING (bucket_id = 'EVENTS');

CREATE POLICY club_team_event_media_insert ON storage.objects
FOR INSERT TO authenticated
WITH CHECK (
  bucket_id = 'EVENTS'
  AND (public.has_club_permission('team') OR public.has_club_permission('events'))
);

CREATE POLICY club_team_event_media_update ON storage.objects
FOR UPDATE TO authenticated
USING (
  bucket_id = 'EVENTS'
  AND (public.has_club_permission('team') OR public.has_club_permission('events'))
)
WITH CHECK (
  bucket_id = 'EVENTS'
  AND (public.has_club_permission('team') OR public.has_club_permission('events'))
);

CREATE POLICY club_team_event_media_delete ON storage.objects
FOR DELETE TO authenticated
USING (
  bucket_id = 'EVENTS'
  AND (public.has_club_permission('team') OR public.has_club_permission('events'))
);

DO $$
DECLARE sequence_name text;
BEGIN
  FOREACH sequence_name IN ARRAY ARRAY[
    pg_get_serial_sequence('public.team', 'id'),
    pg_get_serial_sequence('public.team_seasons', 'id')
  ] LOOP
    IF sequence_name IS NOT NULL THEN
      EXECUTE format('GRANT USAGE, SELECT ON SEQUENCE %s TO authenticated', sequence_name);
    END IF;
  END LOOP;
END $$;

NOTIFY pgrst, 'reload schema';

COMMIT;
