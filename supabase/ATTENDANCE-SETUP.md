# Attendance setup

1. Run `supabase/migration_attendance.sql` once in the Supabase SQL editor.
2. Deploy the updated admin-user function so `absence` can be assigned:

   ```powershell
   npx supabase functions deploy admin-users --project-ref zsqajmlmobiqscggwnbq
   ```

3. In Vercel, add these server-only environment variables and redeploy:

   - `WHATSAPP_ACCESS_TOKEN`
   - `WHATSAPP_PHONE_NUMBER_ID`
   - `WHATSAPP_GROUP_ID`
   - `WHATSAPP_API_VERSION` (optional, defaults to `v23.0`)
   - `WHATSAPP_WARNING_TEMPLATE` (recommended for outbound warnings)
   - `WHATSAPP_TEMPLATE_LANGUAGE` (optional, defaults to `en`)

The warning template body should accept two variables in this order: member name and consecutive-absence count. If no template is configured, the server attempts a normal text message; WhatsApp may reject that message when no customer-service conversation window is open.

The browser never receives the WhatsApp token. Failed or missing-provider actions remain visible in the session audit and can be retried after configuration is fixed.
