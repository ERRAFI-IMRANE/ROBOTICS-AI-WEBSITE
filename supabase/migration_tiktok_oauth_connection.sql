-- Server-only OAuth token storage for the club's connected TikTok account.
-- Run once in Supabase before enabling the TikTok dashboard routes.

CREATE TABLE IF NOT EXISTS public.social_oauth_connections (
  provider text PRIMARY KEY,
  open_id text NOT NULL,
  access_token text NOT NULL,
  refresh_token text NOT NULL,
  scope text[] NOT NULL DEFAULT '{}'::text[],
  access_token_expires_at timestamptz NOT NULL,
  refresh_token_expires_at timestamptz NOT NULL,
  status text NOT NULL DEFAULT 'connected',
  last_error_code text,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now()
);

ALTER TABLE public.social_oauth_connections
  DROP CONSTRAINT IF EXISTS social_oauth_connections_provider_check;
ALTER TABLE public.social_oauth_connections
  ADD CONSTRAINT social_oauth_connections_provider_check CHECK (provider IN ('tiktok'));

ALTER TABLE public.social_oauth_connections
  DROP CONSTRAINT IF EXISTS social_oauth_connections_status_check;
ALTER TABLE public.social_oauth_connections
  ADD CONSTRAINT social_oauth_connections_status_check
  CHECK (status IN ('connected', 'connection_error', 'token_expired'));

ALTER TABLE public.social_oauth_connections ENABLE ROW LEVEL SECURITY;
REVOKE ALL ON TABLE public.social_oauth_connections FROM PUBLIC, anon, authenticated;
GRANT ALL ON TABLE public.social_oauth_connections TO service_role;

COMMENT ON TABLE public.social_oauth_connections IS
  'Server-only OAuth tokens. Never query this table from browser code.';
