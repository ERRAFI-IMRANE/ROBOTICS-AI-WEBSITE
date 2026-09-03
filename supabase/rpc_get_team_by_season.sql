-- ==============================================================================
-- Supabase RPC Function: get_team_by_season
-- ------------------------------------------------------------------------------
-- Reads permanent information from team and season-specific information from team_seasons.
-- Joins using team.id = team_seasons.team_id, filters by season,
-- and orders by team_seasons.post_order ASC NULLS LAST, team.id ASC.
-- ==============================================================================

CREATE OR REPLACE FUNCTION get_team_by_season(target_season text)
RETURNS TABLE (
  id bigint,
  full_name text,
  avatar_img text,
  normal_img text,
  birthday date,
  department text,
  social_media_links jsonb,
  season_id bigint,
  season text,
  role text,
  post_abbr text,
  post_order int
)
LANGUAGE plpgsql
SECURITY DEFINER
AS $$
BEGIN
  RETURN QUERY
  SELECT
    t.id,
    t.full_name,
    t.avatar_img,
    t.normal_img,
    t.birthday,
    t.department,
    t.social_media_links,
    ts.id AS season_id,
    ts.season,
    ts.role,
    ts.post_abbr,
    ts.post_order
  FROM public.team t
  INNER JOIN public.team_seasons ts
    ON ts.team_id = t.id
  WHERE ts.season = target_season
     OR (target_season = '25-26' AND ts.season = '2025-2026')
     OR (target_season = '2025-2026' AND ts.season = '25-26')
     OR (target_season = '24-25' AND ts.season = '2024-2025')
     OR (target_season = '2024-2025' AND ts.season = '24-25')
     OR (target_season = '26-27' AND ts.season = '2026-2027')
     OR (target_season = '2026-2027' AND ts.season = '26-27')
  ORDER BY ts.post_order ASC NULLS LAST, t.id ASC;
END;
$$;
