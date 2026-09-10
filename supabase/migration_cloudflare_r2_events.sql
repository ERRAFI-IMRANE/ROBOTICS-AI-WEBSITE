-- Cloudflare R2 media migration and flat Events schema.
-- Run once in the Supabase SQL editor before deploying the matching frontend.

ALTER TABLE public.events ADD COLUMN IF NOT EXISTS title text;
ALTER TABLE public.events ADD COLUMN IF NOT EXISTS date text;
ALTER TABLE public.events ADD COLUMN IF NOT EXISTS image_url text;
ALTER TABLE public.events ADD COLUMN IF NOT EXISTS link text;
ALTER TABLE public.events ADD COLUMN IF NOT EXISTS created_at timestamptz DEFAULT now();

-- Preserve values from the former JSON structure when that column is still present.
DO $migration$
DECLARE
  data_type text;
BEGIN
  SELECT c.data_type INTO data_type
  FROM information_schema.columns c
  WHERE c.table_schema = 'public' AND c.table_name = 'events' AND c.column_name = 'data';

  IF data_type IN ('json', 'jsonb') THEN
    EXECUTE $sql$
      UPDATE public.events
      SET title = coalesce(nullif(title, ''), nullif(data->>'title', '')),
          date = coalesce(nullif(date, ''), nullif(data->>'date', '')),
          image_url = coalesce(
            nullif(image_url, ''),
            nullif(data->>'image_url', ''),
            nullif(data->>'img_url', ''),
            nullif(data->>'image', '')
          ),
          link = coalesce(nullif(link, ''), nullif(data->>'link', ''), nullif(data->>'links', ''))
    $sql$;
  END IF;
END
$migration$;

DO $migration$
BEGIN
  IF EXISTS (
    SELECT 1 FROM information_schema.columns
    WHERE table_schema = 'public' AND table_name = 'events' AND column_name = 'img_url'
  ) THEN
    EXECUTE 'UPDATE public.events SET image_url = coalesce(nullif(image_url, ''''), nullif(img_url, ''''))';
  END IF;
  IF EXISTS (
    SELECT 1 FROM information_schema.columns
    WHERE table_schema = 'public' AND table_name = 'events' AND column_name = 'image'
  ) THEN
    EXECUTE 'UPDATE public.events SET image_url = coalesce(nullif(image_url, ''''), nullif(image, ''''))';
  END IF;
END
$migration$;

ALTER TABLE public.events DROP COLUMN IF EXISTS data;
ALTER TABLE public.events DROP COLUMN IF EXISTS image;
ALTER TABLE public.events DROP COLUMN IF EXISTS img_url;
ALTER TABLE public.events DROP COLUMN IF EXISTS description;
ALTER TABLE public.events DROP COLUMN IF EXISTS status;

-- Supabase Storage writes are no longer used by the application. Remove the old
-- mutation policies, but retain any public-read policy so legacy URLs still display.
DROP POLICY IF EXISTS club_admin_event_media_insert ON storage.objects;
DROP POLICY IF EXISTS club_admin_event_media_update ON storage.objects;
DROP POLICY IF EXISTS club_admin_event_media_delete ON storage.objects;
DROP POLICY IF EXISTS club_permission_media_insert ON storage.objects;
DROP POLICY IF EXISTS club_permission_media_update ON storage.objects;
DROP POLICY IF EXISTS club_permission_media_delete ON storage.objects;
DROP POLICY IF EXISTS club_team_event_media_insert ON storage.objects;
DROP POLICY IF EXISTS club_team_event_media_update ON storage.objects;
DROP POLICY IF EXISTS club_team_event_media_delete ON storage.objects;

NOTIFY pgrst, 'reload schema';
