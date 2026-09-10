# Cloudflare R2 media setup

The browser never talks to R2 with credentials. Authenticated admins upload and
delete images through `/api/storage/upload` and `/api/storage/delete`.

Configure these server-side variables in the deployment environment:

- `R2_ACCESS_KEY_ID`
- `R2_SECRET_ACCESS_KEY`
- `R2_ENDPOINT`
- `R2_BUCKET_NAME` (`roboticsai-media`)
- `R2_PUBLIC_URL`
- `SUPABASE_URL` and `SUPABASE_ANON_KEY` (the API also accepts the existing
  `VITE_SUPABASE_URL` and `VITE_SUPABASE_ANON_KEY` values)

Do not prefix R2 credentials with `VITE_`. Only `EVENTS`, `AVATARS`, and
`PHOTOS` keys are accepted. The endpoint checks the Supabase JWT and the
matching `events` or `team` admin permission before changing R2.

Before deploying the updated application, run
`supabase/migration_cloudflare_r2_events.sql` in the Supabase SQL editor.
It migrates legacy event values, removes old event columns, and removes obsolete
Supabase Storage write policies without deleting existing stored images or their
legacy public-read policy.
