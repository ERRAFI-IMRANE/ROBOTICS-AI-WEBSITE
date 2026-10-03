import { test } from 'node:test';
import assert from 'node:assert/strict';
import { acceptanceAdminEmails, buildAcceptanceAdminEmail, deliverAcceptanceAdminNotification } from './registrationNotifications.js';
import notificationHandler from '../api/registrations/notify.js';
import { loadRegistrationNotificationRecipients, saveRegistrationNotificationRecipient, deleteRegistrationNotificationRecipient } from '../src/lib/registrationNotifications.js';

const env = { GMAIL_USER: 'admin@example.com', GMAIL_APP_PASSWORD: 'test password', GMAIL_FROM_NAME: 'RAI Club' };
const applicant = {
  status: 'claimed', claim_token: 'test-claim', registration_id: 18,
  full_name: 'Amina <Test>', phone: '+212 612 345 678', email: 'student@example.com',
  department: 'Computer Science', filiere: 'AI', years_of_study: '2', registration_season: '2026-2027',
};

function rpcClient(claim = applicant, recordError = null, recipients = [{ email: 'officer@example.com' }], recipientError = null) {
  const calls = [];
  return {
    calls,
    from(table) {
      assert.equal(table, 'registration_notification_recipients');
      return { select(columns) {
        assert.equal(columns, 'email');
        return { async eq(column, value) {
          assert.equal(column, 'is_active');
          assert.equal(value, true);
          return { data: recipients, error: recipientError };
        } };
      } };
    },
    async rpc(name, args) {
      calls.push({ name, args });
      if (name === 'claim_registration_acceptance_notification') return { data: claim, error: null };
      if (name === 'record_registration_acceptance_notification') return { data: null, error: recordError };
      throw new Error(`Unexpected RPC: ${name}`);
    },
  };
}

test('acceptance emails include contact details but omit private interview answers', () => {
  const mail = buildAcceptanceAdminEmail({ ...applicant, interest_type: ['private answer'], refusal_reason: 'private refusal' });
  assert.match(mail.text, /add them to the club WhatsApp group manually/);
  assert.match(mail.text, /Phone \/ WhatsApp: \+212 612 345 678/);
  assert.match(mail.text, /Registration season: 2026-2027/);
  assert.match(mail.html, /Amina &lt;Test&gt;/);
  assert.doesNotMatch(mail.html, /Amina <Test>|private answer|private refusal/);
  assert.match(mail.html, /https:\/\/wa\.me\/212612345678/);
  assert.doesNotMatch(buildAcceptanceAdminEmail({ ...applicant, phone: '0612345678' }).html, /wa\.me/);
});

test('admin recipients use database rows, are normalized and deduplicated', () => {
  assert.deepEqual(acceptanceAdminEmails([{ email: 'One@example.com' }, { email: 'two@example.com' }, { email: 'one@example.com' }]), ['one@example.com', 'two@example.com']);
  assert.throws(() => acceptanceAdminEmails([{ email: 'invalid' }]), /Add at least one active admin email/);
  assert.throws(() => acceptanceAdminEmails([]), /Add at least one active admin email/);
});

test('successful delivery emails only admins and records the matching claim', async () => {
  const client = rpcClient();
  const messages = [];
  let closed = false;
  const result = await deliverAcceptanceAdminNotification(client, 18, { ...env, REGISTRATION_ADMIN_EMAILS: 'old-setting@example.com' }, (config) => {
    assert.equal(config.auth.user, 'admin@example.com');
    assert.equal(config.auth.pass, 'testpassword');
    return { sendMail: async (mail) => { messages.push(mail); return { messageId: 'message-18', rejected: [] }; }, close: () => { closed = true; } };
  });
  assert.deepEqual(result, { status: 'sent', messageId: 'message-18' });
  assert.deepEqual(messages[0].to, ['officer@example.com']);
  assert.notEqual(messages[0].to[0], applicant.email);
  assert.equal(closed, true);
  assert.deepEqual(client.calls[1], { name: 'record_registration_acceptance_notification', args: {
    p_registration_id: 18, p_claim_token: 'test-claim', p_status: 'sent', p_message_id: 'message-18', p_error: null,
  } });
});

test('repeated and concurrent requests do not send after a sent or active claim', async () => {
  for (const claim of [{ status: 'sent', already_sent: true }, { status: 'sending' }]) {
    const client = rpcClient(claim);
    const result = await deliverAcceptanceAdminNotification(client, 18, env, () => { throw new Error('Transport must not be opened'); });
    assert.equal(result.status, claim.status);
    assert.equal(client.calls.length, 1);
  }
});

test('missing sender configuration is recorded for retry without changing the decision', async () => {
  const client = rpcClient();
  const result = await deliverAcceptanceAdminNotification(client, 18, {}, () => { throw new Error('No SMTP without credentials'); });
  assert.equal(result.status, 'not_configured');
  assert.equal(client.calls[1].args.p_status, 'not_configured');
  assert.deepEqual(client.calls.map((call) => call.name), ['claim_registration_acceptance_notification', 'record_registration_acceptance_notification']);
});

test('empty or paused recipient lists never fall back to the sender inbox', async () => {
  const client = rpcClient(applicant, null, []);
  const result = await deliverAcceptanceAdminNotification(client, 18, env, () => { throw new Error('Do not send without active recipients'); });
  assert.equal(result.status, 'not_configured');
  assert.match(result.error, /Registrations → Notification emails/);
  assert.equal(client.calls[1].args.p_status, 'not_configured');
});

test('missing recipient migration or failed reads never send emails', async () => {
  for (const code of ['PGRST205', '42501']) {
    const client = rpcClient(applicant, null, null, { code, message: 'private database details' });
    const result = await deliverAcceptanceAdminNotification(client, 18, env, () => { throw new Error('Do not send after read failure'); });
    assert.equal(result.status, code === 'PGRST205' ? 'not_configured' : 'failed');
    assert.doesNotMatch(result.error, /private database details/);
    assert.equal(client.calls[1].args.p_status, result.status);
  }
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

test('provider failures are safe, recorded and retryable; acceptance is not rolled back', async () => {
  const client = rpcClient();
  const result = await deliverAcceptanceAdminNotification(client, 18, env, () => ({
    sendMail: async () => { throw new Error('SMTP diagnostic with confidential details'); }, close() {},
  }));
  assert.equal(result.status, 'failed');
  assert.doesNotMatch(JSON.stringify(result), /confidential details|testpassword/);
  assert.equal(client.calls[1].args.p_status, 'failed');
});

test('permission rejection or an unexpected claim cannot send an email', async () => {
  const denied = { rpc: async () => ({ data: null, error: { message: 'Registration permission required' } }) };
  const noTransport = () => { throw new Error('Transport must not be opened'); };
  await assert.rejects(deliverAcceptanceAdminNotification(denied, 18, env, noTransport), /permission required/);
  await assert.rejects(deliverAcceptanceAdminNotification(rpcClient({ ...applicant, registration_id: 99 }), 18, env, noTransport), /reserved for delivery/);
});

test('delivery acknowledgement failure reports uncertainty rather than pretending success', async () => {
  const client = rpcClient(applicant, { message: 'Database unavailable' });
  await assert.rejects(deliverAcceptanceAdminNotification(client, 18, env, () => ({
    sendMail: async () => ({ messageId: 'message-18', rejected: [] }), close() {},
  })), /Acceptance is saved; refresh before retrying/);
});

test('the API refuses GET and unauthenticated POST requests before any email delivery', async () => {
  for (const [method, expectedStatus] of [['GET', 405], ['POST', 401]]) {
    const response = { statusCode: 0, setHeader() {}, end(body) { this.body = JSON.parse(body); } };
    await notificationHandler({ method, headers: {}, body: { registrationId: 18, email: 'attacker@example.com' } }, response);
    assert.equal(response.statusCode, expectedStatus);
    assert.equal(response.body.success, false);
  }
});
