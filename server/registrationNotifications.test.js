import { test } from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { deliverAcceptanceAdminNotification } from './registrationNotifications.js';
import notificationHandler from '../api/registrations/notify.js';
import { loadRegistrationNotificationRecipients, saveRegistrationNotificationRecipient, deleteRegistrationNotificationRecipient } from '../src/lib/registrationNotifications.js';

test('retired acceptance delivery cannot touch Supabase, recipients, or SMTP', async () => {
  const forbidden = new Proxy({}, { get() { throw new Error('No database or SMTP access allowed'); } });
  assert.deepEqual(await deliverAcceptanceAdminNotification(forbidden, 18, forbidden, forbidden), { status: 'disabled' });
});

test('old acceptance API requests return gone and never send mail', async () => {
  for (const [method, expectedStatus] of [['GET', 405], ['POST', 410]]) {
    const response = { statusCode: 0, setHeader() {}, end(body) { this.body = JSON.parse(body); } };
    await notificationHandler({ method, headers: {}, body: { registrationId: 18 } }, response);
    assert.equal(response.statusCode, expectedStatus);
    assert.equal(response.body.success, false);
    if (method === 'POST') assert.equal(response.body.data.status, 'disabled');
  }
});

test('registration decisions and refreshes have no acceptance email side effects', () => {
  const view = readFileSync(new URL('../src/components/Admin/AdminMembers.jsx', import.meta.url), 'utf8');
  assert.doesNotMatch(view, /notifyAdminOfAcceptance|sendAcceptanceNotification|loadAcceptanceNotifications|AdminRegistrationRecipients/);
  assert.doesNotMatch(view, /Notify admin|Retry admin email|Admin notified/);
  const migration = readFileSync(new URL('../supabase/migration_member_attendance_policy.sql', import.meta.url), 'utf8');
  assert.match(migration, /DROP TRIGGER IF EXISTS registration_acceptance_notification ON public\.registrations/);
  assert.match(migration, /'status', 'disabled'/);
  assert.doesNotMatch(migration, /DELETE FROM public\.(registrations|registration_acceptance_notifications)/);
});

test('recipient list loads directly from Supabase without treating read errors as empty', async () => {
  const rows = [{ id: 'recipient-id', email: 'one@example.com', is_active: true }];
  const client = { from(table) {
    assert.equal(table, 'registration_notification_recipients');
    return { select(columns) { assert.equal(columns, 'id,email,label,is_active'); return { order: async () => ({ data: rows, error: null }) }; } };
  } };
  assert.deepEqual(await loadRegistrationNotificationRecipients(client), rows);
  const missing = { from: () => ({ select: () => ({ order: async () => ({ error: { code: 'PGRST205' } }) }) }) };
  await assert.rejects(loadRegistrationNotificationRecipients(missing), /migration_registration_notification_recipients.sql/);
});

test('recipient edits persist the active flag through permission-checked RPCs', async () => {
  const client = { async rpc(name, args) {
    assert.equal(name, 'save_registration_notification_recipient');
    assert.deepEqual(args, { p_id: 'recipient-id', p_email: 'one@example.com', p_label: 'Officer', p_is_active: false });
    return { data: { id: args.p_id, email: args.p_email, is_active: args.p_is_active }, error: null };
  } };
  const result = await saveRegistrationNotificationRecipient(client, { id: 'recipient-id', email: ' one@example.com ', label: ' Officer ', isActive: false });
  assert.equal(result.is_active, false);
  await assert.rejects(saveRegistrationNotificationRecipient({ rpc: async () => ({ data: null }) }, { email: 'one@example.com', label: '', isActive: true }), /not confirmed/);
});

test('recipient removal requires a confirmed database result and surfaces permission errors', async () => {
  await deleteRegistrationNotificationRecipient({ rpc: async (name, args) => {
    assert.equal(name, 'delete_registration_notification_recipient');
    assert.deepEqual(args, { p_id: 'recipient-id' });
    return { data: args.p_id };
  } }, 'recipient-id');
  await assert.rejects(deleteRegistrationNotificationRecipient({ rpc: async () => ({ error: { message: 'Registrations permission required' } }) }, 'recipient-id'), /permission required/);
  await assert.rejects(deleteRegistrationNotificationRecipient({ rpc: async () => ({ data: null }) }, 'recipient-id'), /not confirmed/);
});
