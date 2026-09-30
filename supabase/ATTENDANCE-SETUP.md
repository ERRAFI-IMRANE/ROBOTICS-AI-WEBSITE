# Attendance and Gmail setup

## 1. Database

Run these files in the Supabase SQL editor, in this order:

1. `supabase/migration_attendance.sql` (skip it if attendance is already installed).
2. `supabase/migration_attendance_email_notifications.sql`.
3. `supabase/migration_attendance_roster_overview.sql` (Team roster repair and removal of retired provider endpoints).

The second migration changes attendance to a presence-first workflow, creates the
private Team email table, and creates the configurable admin-recipient table.

Deploy the admin-user function if the `absence` permission has not been deployed:

```powershell
npx supabase functions deploy admin-users --project-ref zsqajmlmobiqscggwnbq
```

## 2. Gmail sender

Use a dedicated club Gmail account, not a personal password.

1. Sign in to the Gmail account that should send the notices.
2. Open Google Account > Security and enable **2-Step Verification**.
3. Open **App passwords**.
4. Create an app password named `Robotics AI Attendance`.
5. Copy the generated 16-character password. It is shown only once.

In Vercel > Project > Settings > Environment Variables, add these production
server variables:

- `GMAIL_USER`: the full Gmail address.
- `GMAIL_APP_PASSWORD`: the 16-character app password (spaces are accepted but removed by the server).
- `GMAIL_FROM_NAME`: optional, defaults to `Robotics & AI Club ESTS`.
- `GMAIL_REPLY_TO`: optional bureau address for replies.

Redeploy the site after saving the variables. Never create a `VITE_` variable for
the password: browser-exposed variables are not safe for Gmail credentials.

## 3. Notification recipients

Open Admin > Absence > **Notification emails**. Add, edit, pause, or remove every
bureau/admin address that must receive attendance copies. These recipients are
stored in Supabase; the Gmail password is stored only in Vercel.

At three and four consecutive absences, the participant receives the warning when
an email is available, and all active admin addresses receive a copy. At five,
accepted members are moved to `refused`; admins receive a separate action email
instructing them to verify the record and complete the membership follow-up. Team profiles are not automatically removed. If a Team profile
has no email, admins still receive the full notice.

Failed or unconfigured email actions stay in the attendance audit and can be
retried after the configuration is corrected.
