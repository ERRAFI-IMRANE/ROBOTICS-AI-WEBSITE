-- Robotics & AI Club clothing inventory.
-- Run once in the Supabase SQL editor after migration_admin_user_permissions.sql.
-- Studio may keep an authenticated role impersonation from permission testing.
RESET ROLE;

BEGIN;

CREATE EXTENSION IF NOT EXISTS pgcrypto;

CREATE TABLE IF NOT EXISTS public.club_wear_assignments (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  team_id bigint NOT NULL REFERENCES public.team(id) ON DELETE CASCADE,
  season text NOT NULL CHECK (length(trim(season)) BETWEEN 3 AND 40),
  item_type text NOT NULL CHECK (item_type IN ('tshirt', 'hoodie')),
  status text NOT NULL DEFAULT 'issued' CHECK (status IN ('issued', 'returned')),
  issued_at timestamptz NOT NULL DEFAULT now(),
  issued_by uuid NOT NULL DEFAULT auth.uid(),
  returned_at timestamptz,
  returned_by uuid,
  updated_at timestamptz NOT NULL DEFAULT now(),
  UNIQUE (team_id, season, item_type)
);

CREATE INDEX IF NOT EXISTS club_wear_assignments_season_status_idx
  ON public.club_wear_assignments(season, status, item_type);

ALTER TABLE public.club_wear_assignments ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS club_wear_permission_read ON public.club_wear_assignments;
CREATE POLICY club_wear_permission_read ON public.club_wear_assignments
  FOR SELECT TO authenticated
  USING (public.has_club_permission('club_wear'));

GRANT SELECT ON public.club_wear_assignments TO authenticated;
REVOKE INSERT, UPDATE, DELETE ON public.club_wear_assignments FROM anon, authenticated;

CREATE OR REPLACE FUNCTION public.get_club_wear_workspace(p_season text DEFAULT NULL)
RETURNS jsonb
LANGUAGE plpgsql
STABLE
SECURITY DEFINER
SET search_path = ''
AS $$
DECLARE
  selected_season text;
  available_seasons jsonb := '[]'::jsonb;
  members_json jsonb := '[]'::jsonb;
BEGIN
  IF NOT public.has_club_permission('club_wear') THEN
    RAISE EXCEPTION 'Club wear permission required';
  END IF;

  selected_season := nullif(trim(p_season), '');
  IF selected_season IS NULL AND pg_catalog.to_regclass('public.club_settings') IS NOT NULL THEN
    EXECUTE 'SELECT nullif(trim(current_season), '''') FROM public.club_settings WHERE id = 1'
      INTO selected_season;
  END IF;
  IF selected_season IS NULL THEN
    SELECT regexp_replace(
      trim(assignment.season),
      '^(20)?([0-9]{2})[-/](20)?([0-9]{2})$',
      '20\2-20\4'
    )
    INTO selected_season
    FROM public.team_seasons AS assignment
    WHERE upper(trim(coalesce(assignment.post_abbr, ''))) NOT IN ('SUP', 'CO-SUP', 'ADV')
    ORDER BY regexp_replace(
      trim(assignment.season),
      '^(20)?([0-9]{2})[-/](20)?([0-9]{2})$',
      '20\2-20\4'
    ) DESC
    LIMIT 1;
  END IF;

  selected_season := regexp_replace(
    coalesce(selected_season, ''),
    '^(20)?([0-9]{2})[-/](20)?([0-9]{2})$',
    '20\2-20\4'
  );

  IF selected_season !~ '^20[0-9]{2}-20[0-9]{2}$' THEN
    RAISE EXCEPTION 'No valid Team season is available';
  END IF;

  SELECT coalesce(jsonb_agg(season_value ORDER BY season_value DESC), '[]'::jsonb)
  INTO available_seasons
  FROM (
    SELECT DISTINCT regexp_replace(
      trim(assignment.season),
      '^(20)?([0-9]{2})[-/](20)?([0-9]{2})$',
      '20\2-20\4'
    ) AS season_value
    FROM public.team_seasons AS assignment
    WHERE upper(trim(coalesce(assignment.post_abbr, ''))) NOT IN ('SUP', 'CO-SUP', 'ADV')
      AND lower(trim(coalesce(assignment.role, ''))) NOT IN (
        'supervisor', 'club supervisor', 'co-supervisor', 'club co-supervisor', 'advisor'
      )
  ) AS eligible_seasons
  WHERE season_value ~ '^20[0-9]{2}-20[0-9]{2}$';

  SELECT coalesce(jsonb_agg(roster.item ORDER BY roster.post_order, roster.full_name), '[]'::jsonb)
  INTO members_json
  FROM (
    SELECT DISTINCT ON (member.id)
      member.full_name,
      coalesce(assignment.post_order, 999) AS post_order,
      jsonb_build_object(
        'id', member.id,
        'full_name', member.full_name,
        'avatar_img', member.avatar_img,
        'department', member.department,
        'role', assignment.role,
        'post_abbr', assignment.post_abbr,
        'post_order', assignment.post_order,
        'tshirt', CASE WHEN tshirt.id IS NULL
          THEN jsonb_build_object('status', 'available')
          ELSE jsonb_build_object(
            'status', tshirt.status,
            'issued_at', tshirt.issued_at,
            'returned_at', tshirt.returned_at,
            'updated_at', tshirt.updated_at
          )
        END,
        'hoodie', CASE WHEN hoodie.id IS NULL
          THEN jsonb_build_object('status', 'available')
          ELSE jsonb_build_object(
            'status', hoodie.status,
            'issued_at', hoodie.issued_at,
            'returned_at', hoodie.returned_at,
            'updated_at', hoodie.updated_at
          )
        END
      ) AS item
    FROM public.team_seasons AS assignment
    JOIN public.team AS member ON member.id = assignment.team_id
    LEFT JOIN public.club_wear_assignments AS tshirt
      ON tshirt.team_id = member.id
      AND tshirt.season = selected_season
      AND tshirt.item_type = 'tshirt'
    LEFT JOIN public.club_wear_assignments AS hoodie
      ON hoodie.team_id = member.id
      AND hoodie.season = selected_season
      AND hoodie.item_type = 'hoodie'
    WHERE regexp_replace(
        trim(assignment.season),
        '^(20)?([0-9]{2})[-/](20)?([0-9]{2})$',
        '20\2-20\4'
      ) = selected_season
      AND upper(trim(coalesce(assignment.post_abbr, ''))) NOT IN ('SUP', 'CO-SUP', 'ADV')
      AND lower(trim(coalesce(assignment.role, ''))) NOT IN (
        'supervisor', 'club supervisor', 'co-supervisor', 'club co-supervisor', 'advisor'
      )
    ORDER BY member.id, coalesce(assignment.post_order, 999), member.full_name
  ) AS roster;

  RETURN jsonb_build_object(
    'season', selected_season,
    'seasons', available_seasons,
    'members', members_json
  );
END;
$$;

CREATE OR REPLACE FUNCTION public.set_club_wear_item(
  p_team_id bigint,
  p_season text,
  p_item_type text,
  p_issued boolean
)
RETURNS jsonb
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = ''
AS $$
DECLARE
  normalized_season text;
  saved_row public.club_wear_assignments%ROWTYPE;
BEGIN
  IF NOT public.has_club_permission('club_wear') THEN
    RAISE EXCEPTION 'Club wear permission required';
  END IF;
  IF p_item_type NOT IN ('tshirt', 'hoodie') THEN
    RAISE EXCEPTION 'Choose a valid clothing item';
  END IF;

  normalized_season := regexp_replace(
    trim(coalesce(p_season, '')),
    '^(20)?([0-9]{2})[-/](20)?([0-9]{2})$',
    '20\2-20\4'
  );
  IF normalized_season !~ '^20[0-9]{2}-20[0-9]{2}$' THEN
    RAISE EXCEPTION 'Choose a valid Team season';
  END IF;

  IF NOT EXISTS (
    SELECT 1
    FROM public.team_seasons AS assignment
    WHERE assignment.team_id = p_team_id
      AND regexp_replace(
        trim(assignment.season),
        '^(20)?([0-9]{2})[-/](20)?([0-9]{2})$',
        '20\2-20\4'
      ) = normalized_season
      AND upper(trim(coalesce(assignment.post_abbr, ''))) NOT IN ('SUP', 'CO-SUP', 'ADV')
      AND lower(trim(coalesce(assignment.role, ''))) NOT IN (
        'supervisor', 'club supervisor', 'co-supervisor', 'club co-supervisor', 'advisor'
      )
  ) THEN
    RAISE EXCEPTION 'This Team profile is not eligible for club wear in the current season';
  END IF;

  IF p_issued THEN
    INSERT INTO public.club_wear_assignments (
      team_id, season, item_type, status, issued_at, issued_by,
      returned_at, returned_by, updated_at
    ) VALUES (
      p_team_id, normalized_season, p_item_type, 'issued', now(), auth.uid(),
      NULL, NULL, now()
    )
    ON CONFLICT (team_id, season, item_type) DO UPDATE
    SET status = 'issued',
        issued_at = now(),
        issued_by = auth.uid(),
        returned_at = NULL,
        returned_by = NULL,
        updated_at = now()
    RETURNING * INTO saved_row;
  ELSE
    UPDATE public.club_wear_assignments
    SET status = 'returned',
        returned_at = now(),
        returned_by = auth.uid(),
        updated_at = now()
    WHERE team_id = p_team_id
      AND season = normalized_season
      AND item_type = p_item_type
      AND status = 'issued'
    RETURNING * INTO saved_row;

    IF NOT FOUND THEN
      RAISE EXCEPTION 'This item is not currently issued to the selected person';
    END IF;
  END IF;

  RETURN jsonb_build_object(
    'team_id', saved_row.team_id,
    'season', saved_row.season,
    'item_type', saved_row.item_type,
    'status', saved_row.status,
    'issued_at', saved_row.issued_at,
    'returned_at', saved_row.returned_at,
    'updated_at', saved_row.updated_at
  );
END;
$$;

REVOKE ALL ON FUNCTION public.get_club_wear_workspace(text) FROM PUBLIC, anon;
REVOKE ALL ON FUNCTION public.set_club_wear_item(bigint,text,text,boolean) FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION public.get_club_wear_workspace(text) TO authenticated;
GRANT EXECUTE ON FUNCTION public.set_club_wear_item(bigint,text,text,boolean) TO authenticated;

NOTIFY pgrst, 'reload schema';
COMMIT;
