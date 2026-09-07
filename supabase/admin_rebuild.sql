-- REVIEW AND RUN ONCE IN SUPABASE SQL EDITOR. Not applied by Codex.
-- Targets the live schema: registration_settings.season and integer years_of_study.
-- Replaces permissive policies on the named club tables. Back up/review policies first.
BEGIN;

CREATE OR REPLACE FUNCTION public.is_club_admin()
RETURNS boolean LANGUAGE sql STABLE SECURITY INVOKER SET search_path = ''
AS $$ SELECT coalesce((auth.jwt() -> 'app_metadata' ->> 'club_admin') = 'true', false); $$;

CREATE TABLE IF NOT EXISTS public.club_settings (
  id integer PRIMARY KEY DEFAULT 1 CHECK (id = 1),
  current_season text NOT NULL,
  public_staff_season text NOT NULL,
  updated_at timestamptz NOT NULL DEFAULT now()
);
INSERT INTO public.club_settings (id, current_season, public_staff_season)
SELECT 1, coalesce((SELECT season FROM public.registration_settings ORDER BY season DESC LIMIT 1), '2026-2027'), '2025-2026'
ON CONFLICT (id) DO NOTHING;
-- If this fails, resolve duplicate campaign seasons manually; no records are deleted here.
CREATE UNIQUE INDEX IF NOT EXISTS registration_settings_season_unique ON public.registration_settings(season);

ALTER TABLE public.registrations ADD COLUMN IF NOT EXISTS refusal_reason text;
ALTER TABLE public.registrations ALTER COLUMN status SET DEFAULT 'pending';
UPDATE public.registrations SET status = 'pending' WHERE status IS NULL;
UPDATE public.registrations SET refusal_reason = NULL WHERE status IN ('pending', 'accepted');
UPDATE public.registrations SET refusal_reason = 'Legacy refusal reason unavailable' WHERE status = 'refused' AND coalesce(length(trim(refusal_reason)), 0) = 0;
ALTER TABLE public.registrations ALTER COLUMN status SET NOT NULL;
ALTER TABLE public.registrations DROP CONSTRAINT IF EXISTS check_reg_status;
ALTER TABLE public.registrations ADD CONSTRAINT check_reg_status CHECK (status IN ('pending', 'accepted', 'refused'));
ALTER TABLE public.registrations DROP CONSTRAINT IF EXISTS registrations_refusal_reason_check;
ALTER TABLE public.registrations ADD CONSTRAINT registrations_refusal_reason_check CHECK (
  (status = 'refused' AND length(trim(refusal_reason)) BETWEEN 1 AND 2000)
  OR (status IN ('pending', 'accepted') AND refusal_reason IS NULL)
);

-- Explicitly remove the old public-write policies, including differently named live variants.
DO $$ DECLARE t text; p record; BEGIN
  FOREACH t IN ARRAY ARRAY['club_settings','registration_settings','registrations','team','team_seasons','events'] LOOP
    EXECUTE format('ALTER TABLE public.%I ENABLE ROW LEVEL SECURITY', t);
    FOR p IN SELECT policyname FROM pg_policies WHERE schemaname = 'public' AND tablename = t LOOP
      EXECUTE format('DROP POLICY %I ON public.%I', p.policyname, t);
    END LOOP;
    IF t = 'registrations' THEN
      EXECUTE 'CREATE POLICY club_officer_registration_read ON public.registrations FOR SELECT TO authenticated USING (public.is_club_admin())';
      EXECUTE 'CREATE POLICY club_officer_registration_decision ON public.registrations FOR UPDATE TO authenticated USING (public.is_club_admin() AND status = ''pending'') WITH CHECK (public.is_club_admin() AND status IN (''accepted'',''refused''))';
      EXECUTE 'REVOKE UPDATE, DELETE ON public.registrations FROM authenticated';
      EXECUTE 'GRANT SELECT, INSERT ON public.registrations TO authenticated';
      EXECUTE 'GRANT UPDATE(status, refusal_reason) ON public.registrations TO authenticated';
    ELSE
      EXECUTE format('CREATE POLICY club_officer_access ON public.%I FOR ALL TO authenticated USING (public.is_club_admin()) WITH CHECK (public.is_club_admin())', t);
      EXECUTE format('GRANT SELECT, INSERT, UPDATE, DELETE ON public.%I TO authenticated', t);
    END IF;
  END LOOP;
  FOREACH t IN ARRAY ARRAY['club_settings','registration_settings','team','team_seasons','events'] LOOP
    EXECUTE format('CREATE POLICY club_public_read ON public.%I FOR SELECT TO anon, authenticated USING (true)', t);
    EXECUTE format('GRANT SELECT ON public.%I TO anon', t);
  END LOOP;
END $$;
GRANT INSERT ON public.registrations TO anon, authenticated;
REVOKE SELECT, UPDATE, DELETE ON public.registrations FROM anon;
-- Identity/serial sequences used by these tables only.
DO $$ DECLARE t text; seq text; BEGIN
  FOREACH t IN ARRAY ARRAY['registration_settings','registrations','team','team_seasons','events'] LOOP
    seq := pg_get_serial_sequence('public.' || t, 'id');
    IF seq IS NOT NULL THEN EXECUTE format('GRANT USAGE, SELECT ON SEQUENCE %s TO authenticated', seq); END IF;
    IF t = 'registrations' AND seq IS NOT NULL THEN EXECUTE format('GRANT USAGE ON SEQUENCE %s TO anon', seq); END IF;
  END LOOP;
END $$;
CREATE POLICY club_public_apply ON public.registrations FOR INSERT TO anon, authenticated
WITH CHECK (
  status = 'pending' AND refusal_reason IS NULL AND length(trim(full_name)) BETWEEN 1 AND 120
  AND email IS NOT NULL AND length(email) BETWEEN 3 AND 254
  AND phone IS NOT NULL AND department IS NOT NULL AND filiere IS NOT NULL
  AND years_of_study BETWEEN 1 AND 5
  AND EXISTS (SELECT 1 FROM public.registration_settings r JOIN public.club_settings c ON c.current_season = r.season WHERE c.id = 1 AND r.is_open AND r.season = registration_season)
);

CREATE OR REPLACE FUNCTION public.save_club_settings(p_current_season text, p_public_staff_season text)
RETURNS jsonb LANGUAGE plpgsql SECURITY INVOKER SET search_path = '' AS $$
DECLARE start_year integer;
BEGIN
  IF NOT public.is_club_admin() THEN RAISE EXCEPTION 'Officer access required'; END IF;
  IF p_current_season !~ '^20[0-9]{2}-20[0-9]{2}$' OR p_public_staff_season !~ '^20[0-9]{2}-20[0-9]{2}$' THEN RAISE EXCEPTION 'Invalid season'; END IF;
  start_year := left(p_current_season, 4)::integer;
  IF right(p_current_season, 4)::integer <> start_year + 1 OR right(p_public_staff_season, 4)::integer <> left(p_public_staff_season, 4)::integer + 1 THEN RAISE EXCEPTION 'Season years must be consecutive'; END IF;
  PERFORM id FROM public.club_settings WHERE id = 1 FOR UPDATE;
  IF NOT EXISTS (SELECT 1 FROM public.team_seasons WHERE season IN (p_public_staff_season, substring(p_public_staff_season, 3, 2) || '-' || right(p_public_staff_season, 2))) THEN RAISE EXCEPTION 'Add staff to the selected public season before publishing it'; END IF;
  INSERT INTO public.registration_settings(season, is_open) VALUES (p_current_season, false) ON CONFLICT (season) DO NOTHING;
  UPDATE public.registration_settings SET is_open = false, closed_at = now(), updated_at = now() WHERE season <> p_current_season AND is_open;
  UPDATE public.club_settings SET current_season = p_current_season, public_staff_season = p_public_staff_season, updated_at = now() WHERE id = 1;
  RETURN jsonb_build_object('current_season', p_current_season, 'public_staff_season', p_public_staff_season);
END; $$;

CREATE OR REPLACE FUNCTION public.decide_club_registration(p_registration_id bigint, p_decision text, p_reason text DEFAULT NULL)
RETURNS jsonb LANGUAGE plpgsql SECURITY INVOKER SET search_path = '' AS $$
DECLARE r public.registrations%ROWTYPE;
BEGIN
  IF NOT public.is_club_admin() THEN RAISE EXCEPTION 'Officer access required'; END IF;
  IF p_decision IS NULL OR p_decision NOT IN ('accepted','refused') THEN RAISE EXCEPTION 'Invalid decision'; END IF;
  IF p_decision = 'refused' AND (coalesce(length(trim(p_reason)),0) = 0 OR length(p_reason) > 2000) THEN
    RAISE EXCEPTION 'Enter a refusal reason (up to 2000 characters)';
  END IF;
  UPDATE public.registrations
  SET status = p_decision,
      refusal_reason = CASE WHEN p_decision = 'refused' THEN trim(p_reason) ELSE NULL END
  WHERE id = p_registration_id AND status = 'pending'
  RETURNING * INTO r;
  IF NOT FOUND THEN RAISE EXCEPTION 'Application already processed or no longer exists. Refresh the registration history.'; END IF;
  RETURN jsonb_build_object('registration_id', r.id, 'decision', p_decision);
END; $$;

CREATE OR REPLACE FUNCTION public.save_club_staff(p_team_id bigint, p_profile jsonb, p_seasons jsonb)
RETURNS jsonb LANGUAGE plpgsql SECURITY INVOKER SET search_path = '' AS $$
DECLARE staff_id bigint; assignment jsonb; profile public.team%ROWTYPE;
BEGIN
  IF NOT public.is_club_admin() THEN RAISE EXCEPTION 'Officer access required'; END IF;
  IF p_seasons IS NULL OR jsonb_typeof(p_seasons) <> 'array' THEN RAISE EXCEPTION 'Staff seasons must be an array'; END IF;
  IF jsonb_array_length(p_seasons) = 0 THEN RAISE EXCEPTION 'At least one staff season is required'; END IF;
  IF (SELECT count(*) FROM jsonb_array_elements(p_seasons)) <> (SELECT count(DISTINCT value->>'season') FROM jsonb_array_elements(p_seasons)) THEN RAISE EXCEPTION 'Duplicate staff seasons'; END IF;
  profile := jsonb_populate_record(NULL::public.team, p_profile);
  IF coalesce(length(trim(profile.full_name)),0) = 0 THEN RAISE EXCEPTION 'Staff name is required'; END IF;
  IF p_team_id IS NULL THEN
    INSERT INTO public.team(full_name,department,avatar_img,normal_img,birthday,social_media_links)
    VALUES (profile.full_name,profile.department,profile.avatar_img,profile.normal_img,profile.birthday,profile.social_media_links) RETURNING id INTO staff_id;
  ELSE
    PERFORM id FROM public.team WHERE id = p_team_id FOR UPDATE;
    IF NOT FOUND THEN RAISE EXCEPTION 'Staff record no longer exists'; END IF;
    UPDATE public.team SET full_name = profile.full_name, department = profile.department, avatar_img = profile.avatar_img,
      normal_img = profile.normal_img, birthday = profile.birthday, social_media_links = profile.social_media_links
      WHERE id = p_team_id RETURNING id INTO staff_id;
  END IF;
  FOR assignment IN SELECT value FROM jsonb_array_elements(p_seasons) LOOP
    IF coalesce(assignment->>'season','') !~ '^(20)?[0-9]{2}[-/](20)?[0-9]{2}$' THEN RAISE EXCEPTION 'Invalid staff season'; END IF;
    IF (assignment->>'post_order')::integer < 0 THEN RAISE EXCEPTION 'Staff order must be non-negative'; END IF;
    INSERT INTO public.team_seasons(team_id,season,role,post_abbr,post_order)
    VALUES (staff_id,assignment->>'season',coalesce(nullif(assignment->>'role',''),'Team Member'),assignment->>'post_abbr',(assignment->>'post_order')::integer)
    ON CONFLICT (team_id,season) DO UPDATE SET role = EXCLUDED.role, post_abbr = EXCLUDED.post_abbr, post_order = EXCLUDED.post_order;
  END LOOP;
  DELETE FROM public.team_seasons WHERE team_id = staff_id AND season NOT IN (SELECT value->>'season' FROM jsonb_array_elements(p_seasons));
  RETURN jsonb_build_object('id',staff_id);
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
    -- Support both the short season shown in the UI and the full database key.
    DELETE FROM public.team_seasons WHERE team_id = p_team_id AND
      (season = p_season OR regexp_replace(season, '20([0-9]{2})', '\1', 'g') = regexp_replace(p_season, '20([0-9]{2})', '\1', 'g'));
    GET DIAGNOSTICS affected = ROW_COUNT;
    IF affected = 0 THEN RAISE EXCEPTION 'No matching season assignment. Refresh before retrying.'; END IF;
  END IF;
  RETURN jsonb_build_object('id',p_team_id);
END; $$;
REVOKE EXECUTE ON FUNCTION public.save_club_staff(bigint,jsonb,jsonb), public.delete_club_staff(bigint,text) FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION public.save_club_staff(bigint,jsonb,jsonb), public.delete_club_staff(bigint,text) TO authenticated;

-- Old SECURITY DEFINER endpoints must not bypass the new officer policies.
DO $$ DECLARE f record; BEGIN
  FOR f IN SELECT p.oid::regprocedure AS signature FROM pg_proc p JOIN pg_namespace n ON n.oid = p.pronamespace WHERE n.nspname = 'public' AND p.proname IN ('accept_club_registration','refuse_club_registration','close_registration_season') LOOP
    EXECUTE format('REVOKE EXECUTE ON FUNCTION %s FROM PUBLIC, anon, authenticated', f.signature);
  END LOOP;
END $$;
DROP FUNCTION IF EXISTS public.accept_club_registration(bigint);
DROP FUNCTION IF EXISTS public.refuse_club_registration(bigint,text);
REVOKE EXECUTE ON FUNCTION public.save_club_settings(text,text) FROM PUBLIC, anon;
REVOKE EXECUTE ON FUNCTION public.decide_club_registration(bigint,text,text) FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION public.save_club_settings(text,text), public.decide_club_registration(bigint,text,text) TO authenticated;
COMMIT;

-- AFTER REVIEW: create an officer in Supabase Authentication, then run this separately
-- with the actual account UUID. App metadata is server-controlled; user metadata is not.
-- UPDATE auth.users SET raw_app_meta_data = coalesce(raw_app_meta_data, '{}'::jsonb)
--   || '{"club_admin":true}'::jsonb WHERE id = 'OFFICER-USER-UUID';
-- Sign out/in after assigning the role to refresh the JWT.
