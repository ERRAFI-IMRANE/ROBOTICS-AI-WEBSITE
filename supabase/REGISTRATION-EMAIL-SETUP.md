# Acceptance emails — retired

Acceptance no longer sends emails to the member or administrators. The registration
UI has no automatic queue recovery, Notify admin, Retry admin email, or acceptance
recipient controls. The old API route returns HTTP 410 without opening SMTP.

Run `supabase/migration_member_attendance_policy.sql` after the attendance email and
roster migrations. It drops the acceptance trigger and disables the claim RPC so
direct SQL acceptance and reopened attendance sessions cannot queue/send acceptance
notifications. It does not delete historical queue records or recipient addresses.
Do not rerun the old acceptance-notification migration afterward.

Gmail is still used by **Absence**. Members are automatically changed from accepted
to refused when closing a session brings them to three consecutive absences. They
and the configured attendance admins receive the removal notice. Team members
remain warning-only, never automatically refused.

Use **Admin → Absence → Notification emails** to manage active admin recipients.
See [ATTENDANCE-SETUP.md](ATTENDANCE-SETUP.md) for the existing server-only Gmail
sender configuration. Do not remove Gmail credentials: absence delivery needs them.
