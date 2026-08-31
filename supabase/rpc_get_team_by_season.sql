-- ==============================================================================
-- Supabase RPC Function: get_team_by_season
-- ------------------------------------------------------------------------------
-- Extracts post_order[season] from the JSONB field 'post_order' and returns
-- the team members sorted in ascending order.
-- Members without an explicit order for the selected season are sorted to the end.
-- ==============================================================================

CREATE OR REPLACE FUNCTION get_team_by_season(season text)
RETURNS SETOF team
LANGUAGE plpgsql
SECURITY DEFINER
AS $$
BEGIN
  RETURN QUERY
  SELECT *
  FROM team
  ORDER BY 
    CASE 
      WHEN (post_order->>season) IS NOT NULL AND (post_order->>season) ~ '^-?[0-9]+(\.[0-9]+)?$' 
      THEN (post_order->>season)::numeric 
      ELSE 999999 
    END ASC,
    id ASC;
END;
$$;
