# Admin rebuild setup

The frontend and SQL were edited locally only. No browser was used, and no SQL, account changes, or data changes were applied remotely during this rebuild.

## One-time activation

1. Back up your database and review `admin_rebuild.sql`, particularly its replacement of RLS policies on the eight named club tables. Test it in a staging copy first. It targets the live schema previously inspected: `registration_settings.season` and integer `registrations.years_of_study`, not the older local registration migration.
2. Run `admin_rebuild.sql` in the Supabase SQL editor. It runs in one transaction. Existing staff/events/applications are not deleted by this setup. It preserves the existing current campaign and initially keeps the public roster on 2025–2026.
3. Create or select an officer account in Supabase Authentication. Assign `club_admin: true` in **app metadata**, not user metadata. The SQL file ends with a commented example targeting a specific account UUID; replace that UUID and run it separately. Never expose a service-role key in Vite variables.
4. Sign in to the admin with that account’s email/password. The old client-side passcodes and `rai_admin_auth` session flag no longer grant access. Sign out/in after assigning the role so the JWT is refreshed.
5. In **Parameters**, choose the current academic season and the staff season to publish. The published season must already contain a staff assignment. Save. A newly created intake starts closed; use **Open applications** to activate it.

Do not rerun the older permissive-policy migrations after this migration: they can restore public write access.

## Admin user management

After the base dashboard migration is active:

1. Review and run `migration_admin_user_permissions.sql` once in the Supabase SQL editor. It replaces the club-table policies with granular `team`, `events`, `registrations`, and `users` permission checks. Existing `club_admin: true` accounts without a `club_permissions` array keep full access for backward compatibility.
2. Deploy the protected function with `supabase functions deploy admin-users`. Hosted Supabase projects provide `SUPABASE_URL`, `SUPABASE_ANON_KEY`, and `SUPABASE_SERVICE_ROLE_KEY` to Edge Functions automatically.
3. Sign out and back in after an account's permissions change so its refreshed JWT contains the new app metadata.

The browser only invokes the `admin-users` function with the signed-in administrator's access token. The service-role key remains inside the Edge Function and must never be added to a `VITE_` environment variable. Administrators cannot edit their own permissions while signed in, preventing accidental self-lockout. New accounts receive a temporary password, confirmed email, `club_admin: true`, and only the permissions selected in the form.

## Controls

- **Members:** Accept moves a pending application into `members`; refuse requires a reason and moves it into `refused_members`. Both are single transactions with a row lock. A failed insert never removes the application. Repeated decisions on a processed ID fail clearly instead of duplicating it.
- **Staff:** The existing add/edit/delete forms remain. Profile and season edits are saved atomically. Removing a season preserves other assignments; permanent deletion remains a separate explicit action.
- **Events:** Existing unclassified events display as Completed. Add/edit supports title, date/range, status, link, description, and image. Saving preserves unrelated JSON metadata and updates existing image/link columns too. Errors never masquerade as local-only success.
- **Parameters:** Current season controls the Join page. Public staff season independently controls the single published Team roster. Selecting a different intake closes other campaigns without deleting applications.
- **Overview:** Counts and recent events come from Supabase. The preserved Projects, Inventory, and Budget sections are explicitly labeled preview/demo content.

## Image uploads

The event editor uploads to the existing `EVENTS` bucket (JPG/PNG/WebP, max 5 MB) or accepts an image URL/local asset path. Staff keeps the existing upload UI. Review Storage policies separately: only authenticated officers should upload or modify club assets. RLS changes in `admin_rebuild.sql` apply to database tables, not `storage.objects`. No bucket configuration was changed by this task.

## Verification

- `node --test src/lib/admin.test.js src/lib/registration.test.js`: service validation, RPC arguments, error handling, schema-aware event payloads, and season selection.
- `npm run build` and `npm run lint`.
- No live CRUD, SQL execution, or visual/browser checks were performed, as requested. Before production use, test two concurrent decisions on the same application, a denied destination insert, staff season-only deletion, an event edit, and changing/reopening a campaign in staging.
- A local PostgreSQL executable was unavailable, so the SQL has not been executed locally. If existing live constraints differ, resolve them in staging before applying it to production.
