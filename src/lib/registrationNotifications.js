// Historical recipient management remains available for existing imports, but
// acceptance must never read a delivery queue or issue an email request.
export async function loadAcceptanceNotifications() { return {}; }
export async function notifyAdminOfAcceptance() { return { status: 'disabled' }; }

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
