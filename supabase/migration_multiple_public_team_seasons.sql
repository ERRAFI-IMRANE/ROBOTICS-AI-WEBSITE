-- REVIEW AND RUN ONCE IN THE SUPABASE SQL EDITOR.
-- Allows one or several staff seasons to be shown on the public Team section.
BEGIN;

ALTER TABLE public.club_settings
  ADD COLUMN IF NOT EXISTS public_staff_seasons text[] NOT NULL DEFAULT '{}'::text[];

UPDATE public.club_settings
SET public_staff_seasons = ARRAY[public_staff_season]
WHERE coalesce(cardinality(public_staff_seasons), 0) = 0;
UPDATE public.club_settings
SET public_staff_season = public_staff_seasons[1]
WHERE public_staff_season IS DISTINCT FROM public_staff_seasons[1];

ALTER TABLE public.club_settings
  DROP CONSTRAINT IF EXISTS club_settings_public_staff_seasons_not_empty;
ALTER TABLE public.club_settings
  ADD CONSTRAINT club_settings_public_staff_seasons_not_empty
  CHECK (cardinality(public_staff_seasons) >= 1);

ALTER TABLE public.club_settings
  DROP CONSTRAINT IF EXISTS club_settings_primary_public_staff_season_sync;
ALTER TABLE public.club_settings
  ADD CONSTRAINT club_settings_primary_public_staff_season_sync
  CHECK (public_staff_season = public_staff_seasons[1]);

CREATE OR REPLACE FUNCTION public.save_club_settings_seasons(
  p_current_season text,
  p_public_staff_seasons text[]
)
RETURNS jsonb
LANGUAGE plpgsql
SECURITY INVOKER
SET search_path = ''
AS $$
DECLARE
  season text;
  normalized_seasons text[];
BEGIN
  IF NOT public.is_club_admin() THEN
    RAISE EXCEPTION 'Officer access required';
  END IF;

  IF p_current_season !~ '^20[0-9]{2}-20[0-9]{2}$'
     OR right(p_current_season, 4)::integer <> left(p_current_season, 4)::integer + 1 THEN
    RAISE EXCEPTION 'Current season must use consecutive YYYY-YYYY years';
  END IF;

  SELECT array_agg(value ORDER BY first_position)
  INTO normalized_seasons
  FROM (
    SELECT trim(value) AS value, min(ord) AS first_position
    FROM unnest(p_public_staff_seasons) WITH ORDINALITY AS selected(value, ord)
    WHERE length(trim(value)) > 0
    GROUP BY trim(value)
  ) unique_seasons;

  IF coalesce(cardinality(normalized_seasons), 0) = 0 THEN
    RAISE EXCEPTION 'Select at least one public staff season';
  END IF;

  FOREACH season IN ARRAY normalized_seasons LOOP
    IF season !~ '^20[0-9]{2}-20[0-9]{2}$'
       OR right(season, 4)::integer <> left(season, 4)::integer + 1 THEN
      RAISE EXCEPTION 'Every staff season must use consecutive YYYY-YYYY years';
    END IF;
    IF NOT EXISTS (
      SELECT 1
      FROM public.team_seasons roster
      WHERE roster.season IN (
        season,
        substring(season, 3, 2) || '-' || right(season, 2),
        substring(season, 3, 2) || '/' || right(season, 2)
      )
    ) THEN
      RAISE EXCEPTION 'Add staff to season % before publishing it', season;
    END IF;
  END LOOP;

  PERFORM id FROM public.club_settings WHERE id = 1 FOR UPDATE;
  INSERT INTO public.registration_settings(season, is_open)
  VALUES (p_current_season, false)
  ON CONFLICT (season) DO NOTHING;

  UPDATE public.registration_settings
  SET is_open = false, closed_at = now(), updated_at = now()
  WHERE season <> p_current_season AND is_open;

  UPDATE public.club_settings
  SET current_season = p_current_season,
      public_staff_season = normalized_seasons[1],
      public_staff_seasons = normalized_seasons,
      updated_at = now()
  WHERE id = 1;

  RETURN jsonb_build_object(
    'current_season', p_current_season,
    'public_staff_season', normalized_seasons[1],
    'public_staff_seasons', normalized_seasons
  );
END;
$$;

CREATE OR REPLACE FUNCTION public.save_club_settings(
  p_current_season text,
  p_public_staff_season text
)
RETURNS jsonb
LANGUAGE sql
SECURITY INVOKER
SET search_path = ''
AS $$
  SELECT public.save_club_settings_seasons(p_current_season, ARRAY[p_public_staff_season]);
$$;

REVOKE EXECUTE ON FUNCTION public.save_club_settings_seasons(text, text[]) FROM PUBLIC, anon;
REVOKE EXECUTE ON FUNCTION public.save_club_settings(text, text) FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION public.save_club_settings_seasons(text, text[]), public.save_club_settings(text, text) TO authenticated;

COMMIT;
