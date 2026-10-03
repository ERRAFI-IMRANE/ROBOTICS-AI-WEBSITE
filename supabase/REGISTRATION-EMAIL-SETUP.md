# Accepted member admin emails

When an officer accepts a pending applicant in the interview wizard, the decision
is saved first. The server then emails the admin with the member's name, phone,
email, studies, and registration season, asking them to add the member to the
WhatsApp group manually. Nothing is sent to the applicant by this feature.

## Database

Run the entire `supabase/migration_registration_acceptance_notifications.sql`
file once in the Supabase SQL editor as the project database owner. It includes
`RESET ROLE;` for editors previously switched to `authenticated`.

Then run the entire `supabase/migration_registration_notification_recipients.sql`
file to enable the in-app admin email list. Both migrations are safe to rerun.

The migration adds a private delivery queue and protected functions. Applicant
data stays exclusively in `public.registrations`. The status-update trigger queues
new acceptances in the same transaction as the decision. It does not send emails
for historical accepted members on installation. Use **Notify admin** on an
existing accepted row if an email is needed for that member.

## Gmail configuration

Use the existing server-only `GMAIL_USER`, `GMAIL_APP_PASSWORD`, and optionally
`GMAIL_FROM_NAME` and `GMAIL_REPLY_TO` variables from the attendance setup.

Open **Admin → Registrations → Notification emails**. Add an email address and
an optional name/role, keep **Receive notifications** checked, and confirm the
save. Add several addresses to notify several admins. Edit an address to pause
it, or remove it with confirmation. These settings are saved in Supabase and
can only be managed by administrators with the **registrations** permission.

The server sends only to active addresses from this list. If the list is empty
or every address is paused, delivery is marked unconfigured and the application
decision remains saved. Add an active address, then use **Retry admin email**.
There is no fallback to the sender inbox; add that address to the list if it
should receive notifications. `REGISTRATION_ADMIN_EMAILS` is no longer used.
This list is separate from the attendance notification recipient list.

Add these variables to Vercel Environment Variables for production and redeploy.
For local development use `.env`, then restart Vite. Do not add a `VITE_` prefix
to Gmail credentials. Recipient edits in the app need no restart or redeploy.

The endpoint is `/api/registrations/notify`. It requires a valid authenticated
administrator with the **registrations** permission. No new Supabase Edge Function
deployment is required; this is a Vercel route, also served by the local Vite API.

## Delivery and retries

- Successful delivery shows **Admin notified** in the accepted applicant's row.
- Email failures do not change the accepted status. An error explains that the
  decision is saved, and **Retry admin email** remains available.
- Sent records are not sent again on refresh, repeated requests, or normal retries.
- Concurrent requests share a database claim; only one request sends the email.
- An abandoned claim may be retried after five minutes. SMTP cannot guarantee
  exactly-once delivery if the server crashes after sending but before recording
  success. Check the admin inbox before retrying in this exceptional situation.
- The trigger persists a pending entry if the browser closes immediately after
  acceptance. Delivery resumes when an authorized officer next opens or refreshes
  the registrations list. There is no scheduled background worker. Failed and
  unconfigured emails require the explicit retry action.
- **Admin notified** confirms email delivery, not that the person joined the group.

A WhatsApp contact link is included only for phone numbers already stored with
an explicit international `+` prefix. Local numbers remain visible without a
guessed country code. No WhatsApp account/token or group API is needed.
