export async function loadAcceptanceNotifications(client) {
  const { data, error } = await client.from('registration_acceptance_notifications').select('registration_id,status,last_error');
  if (error) {
    throw new Error(error.code === 'PGRST205' || error.code === '42P01'
      ? 'Run migration_registration_acceptance_notifications.sql in Supabase to enable admin acceptance emails.'
      : error.message || 'Could not load admin email delivery status.');
  }
  return Object.fromEntries((data || []).map((row) => [String(row.registration_id), row]));
}

export async function notifyAdminOfAcceptance(client, registrationId) {
  const { data, error } = await client.auth.getSession();
  const token = data?.session?.access_token;
  if (error || !token) throw new Error('Sign in again to send the admin notification. The application decision remains saved.');
  const response = await fetch('/api/registrations/notify', {
    method: 'POST', headers: { 'Content-Type': 'application/json', Authorization: `Bearer ${token}` },
    body: JSON.stringify({ registrationId }),
  });
  const body = await response.json().catch(() => ({}));
  if (!response.ok || !body.success) throw new Error(body.error || 'Admin notification failed. The application decision remains saved.');
  const outcome = body.data;
  if (!outcome || !['sent', 'sending', 'failed', 'not_configured'].includes(outcome.status)) throw new Error('Admin email delivery was not confirmed.');
  return outcome;
}

function recipientErrorMessage(error) {
  return ['PGRST205', 'PGRST202', '42P01'].includes(error.code)
    ? 'Run migration_registration_notification_recipients.sql in Supabase to manage notification emails.'
    : error.message || 'Notification emails could not be updated.';
}

export async function loadRegistrationNotificationRecipients(client) {
  const { data, error } = await client.from('registration_notification_recipients')
    .select('id,email,label,is_active').order('created_at', { ascending: true });
  if (error) throw new Error(recipientErrorMessage(error));
  return data || [];
}

export async function saveRegistrationNotificationRecipient(client, draft) {
  const { data, error } = await client.rpc('save_registration_notification_recipient', {
    p_id: draft.id || null, p_email: draft.email.trim(),
    p_label: draft.label.trim() || null, p_is_active: draft.isActive,
  });
  if (error) throw new Error(recipientErrorMessage(error));
  if (!data?.id) throw new Error('Saving the notification email was not confirmed. Refresh before retrying.');
  return data;
}

export async function deleteRegistrationNotificationRecipient(client, id) {
  const { data, error } = await client.rpc('delete_registration_notification_recipient', { p_id: id });
  if (error) throw new Error(recipientErrorMessage(error));
  if (data !== id) throw new Error('Removing the notification email was not confirmed. Refresh before retrying.');
}
