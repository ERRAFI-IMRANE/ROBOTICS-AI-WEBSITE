# Admin rebuild setup

The frontend and SQL were edited locally only. No browser was used, and no SQL, account changes, or data changes were applied remotely during this rebuild.

## One-time activation

1. Back up your database and review `admin_rebuild.sql`, particularly its replacement of RLS policies on the eight named club tables. Test it in a staging copy first. It targets the live schema previously inspected: `registration_settings.season` and integer `registrations.years_of_study`, not the older local registration migration.
2. Run `admin_rebuild.sql` in the Supabase SQL editor. It runs in one transaction. Existing staff/events/applications are not deleted by this setup. It preserves the existing current campaign and initially keeps the public roster on 2025–2026.
3. Create or select an officer account in Supabase Authentication. Assign `club_admin: true` in **app metadata**, not user metadata. The SQL file ends with a commented example targeting a specific account UUID; replace that UUID and run it separately. Never expose a service-role key in Vite variables.
4. Sign in to the admin with that account’s email/password. The old client-side passcodes and `rai_admin_auth` session flag no longer grant access. Sign out/in after assigning the role so the JWT is refreshed.
5. In **Parameters** or **Staff**, choose one or more staff seasons to publish. Every published season must already contain a staff assignment. Save. A newly created intake starts closed; use **Open applications** to activate it.

Do not rerun the older permissive-policy migrations after this migration: they can restore public write access.

## Controlled team fields update

For an existing deployment, review and run `migration_team_controlled_fields.sql` once in the Supabase SQL editor. It updates the atomic staff save function so `sex` is stored as `M` or `F`, seasons are stored only as full `YYYY-YYYY` values, and each selected role is saved with its generated abbreviation and display order. It also creates the missing `club_settings` row. It does not delete staff profiles or their season history. Its older Supabase Storage policy block is superseded by the R2 migration below.

The approved post list and the four available seasons live in `src/constants/teamPosts.js`. The Add/Edit forms and the public roster both use this shared configuration. Legacy spellings are normalized when an existing member is edited; all new writes use the canonical values.

## Multiple public team seasons

For an existing deployment, review and run `migration_multiple_public_team_seasons.sql` once. It adds the `public_staff_seasons` array, keeps `public_staff_season` synchronized as a backward-compatible primary season, and adds the atomic RPC used by the dashboard. Existing public season data is preserved automatically. The public Team section displays season tabs only when several rosters are selected.

## Admin user management

After the base dashboard migration is active:

1. Review and run `migration_admin_user_permissions.sql` once in the Supabase SQL editor. It replaces the club-table policies with granular `team`, `events`, `registrations`, and `users` permission checks. Existing `club_admin: true` accounts without a `club_permissions` array keep full access for backward compatibility.
2. Deploy the protected function with `supabase functions deploy admin-users`. Hosted Supabase projects provide `SUPABASE_URL`, `SUPABASE_ANON_KEY`, and `SUPABASE_SERVICE_ROLE_KEY` to Edge Functions automatically.
3. Sign out and back in after an account's permissions change so its refreshed JWT contains the new app metadata.

The browser only invokes the `admin-users` function with the signed-in administrator's access token. The service-role key remains inside the Edge Function and must never be added to a `VITE_` environment variable.

Redeploy `admin-users` after updating the dashboard (`supabase functions deploy admin-users`). No new database migration is needed for Team-linked accounts: the selected profile ID is stored as `club_team_id` in app metadata. The server reads the name from `public.team`, rather than trusting a submitted display name. New accounts receive a confirmed email, `club_admin: true`, and the selected permissions, including **Social Media** for Instagram/TikTok access.

Only root administrators can create, update, or delete admin accounts. Root means `club_role: "owner"` in **app metadata**, or an existing legacy `club_admin: true` account without a `club_permissions` array. Accounts with just the `users` permission can view the list but cannot mutate it. Owners always have all dashboard permissions even if their stored array is incomplete. Root and signed-in accounts cannot be edited or deleted by this page; this prevents self-lockout and root removal.

The creation form requires an existing Team profile and a login email. Initial passwords use the name's stored order, lowercased and accent-normalized: `Kachbal Ilham` becomes `kachbal@ilham//2026`. Names after the first word are joined with hyphens; the year is generated on the server. Passwords are not saved in public tables or metadata. This requested scheme is predictable and should be replaced by the recipient immediately; the dashboard does not enforce a first-login password change.

Deletion is explicitly confirmed and permanently deletes the Supabase Auth account, not the Team profile. Supabase may block deletion when the user owns Storage objects; the UI reports the error without deleting those objects. Auth foreign-key cascades still apply. Existing stateless access tokens may remain valid until expiry; deleting an account prevents future sign-ins and refreshes, but is not instantaneous JWT revocation.

## Registration interviews

After the existing interview columns are present, review and run `migration_registration_interviews.sql`. It does not add or alter columns. It prevents public applications from supplying interview answers and creates the protected RPCs used by the five-step admin wizard. The final pending-applicant review saves the interview and Accept/Refuse decision atomically; refusing requires a reason. Only authenticated officers with the `registrations` permission can execute these operations. The first interview timestamp is preserved when an existing interview is edited. Rerun this idempotent migration if it was applied before the combined review workflow was added.

After the existing `interesting boolean` column is present, review and run `migration_registration_interesting.sql`. It locks the public insert value to `false` and adds the permission-checked toggle used by the review wizard. It does not alter application decisions or remove registration history.

## Controls

- **Registrations:** The interview wizard updates the existing application through permission-checked RPCs. The gold Interesting flag remains independent from Accept/Refuse, which updates `public.registrations.status` in place and requires a reason for refusals. Processed applications remain in the same table as history.
- **Staff:** The existing add/edit/delete forms remain. Profile and season edits are saved atomically. Removing a season preserves other assignments; permanent deletion remains a separate explicit action.
- **Events:** The dashboard uses the flat `title`, `date`, `image_url`, `link`, and `created_at` columns. New dates are saved as `DD/MM/YYYY`; legacy ranges still display until an admin chooses a normalized date while editing.
- **Parameters:** Current season controls the Join page. Public staff seasons independently control one or several Team rosters. Selecting a different intake closes other campaigns without deleting applications.
- **Overview:** Counts and recent events come from Supabase. The preserved Projects, Inventory, and Budget sections are explicitly labeled preview/demo content.

## Cloudflare R2 image uploads

Run `migration_cloudflare_r2_events.sql`, configure the server-only variables documented in the repository's `R2-SETUP.md`, and deploy the Vercel API routes. New event covers go to `EVENTS/`, avatars to `AVATARS/`, and full staff photos to `PHOTOS/`. JPG, PNG, and WebP files up to 5 MB are accepted. Existing Supabase Storage or external URLs continue to display, but only URLs owned by the configured R2 public base are eligible for automatic deletion.

## TikTok connection

1. Review and run `migration_tiktok_oauth_connection.sql` once. The table has RLS enabled, grants no access to `anon` or `authenticated`, and is used only by server routes with the Supabase service role.
2. Add `SUPABASE_SERVICE_ROLE_KEY`, `TIKTOK_CLIENT_KEY`, `TIKTOK_CLIENT_SECRET`, `TIKTOK_REDIRECT_URI`, and `TIKTOK_SCOPES` to Vercel as server-only variables. Never add a `VITE_` prefix.
3. Register the exact HTTPS `TIKTOK_REDIRECT_URI` in TikTok Developer → Login Kit → Web Redirect URIs. Production should use `https://www.roboticsai-ests.com/api/tiktok/callback`. Local development requires the callback URL of a registered HTTPS tunnel; TikTok Web Login Kit must not use `http://localhost:5173`.
4. Deploy the Vercel routes, sign in as an administrator with the `social_media` permission, open Social Media → TikTok, and select **Connect TikTok**.

The callback verifies a short-lived HTTP-only CSRF state cookie before exchanging the code. Access and refresh tokens are stored only in the locked server table. The server refreshes access tokens before expiry and replaces rotated refresh tokens. The browser receives only normalized profile/video data and connection status.

## Verification

- `node --test src/lib/admin.test.js src/lib/registration.test.js`: service validation, RPC arguments, error handling, schema-aware event payloads, and season selection.
- `npm run build` and `npm run lint`.
- No live CRUD, SQL execution, or visual/browser checks were performed, as requested. Before production use, test two concurrent decisions on the same application, a denied destination insert, staff season-only deletion, an event edit, and changing/reopening a campaign in staging.
- A local PostgreSQL executable was unavailable, so the SQL has not been executed locally. If existing live constraints differ, resolve them in staging before applying it to production.
