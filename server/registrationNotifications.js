import nodemailer from 'nodemailer';
import { createAuthenticatedSupabaseClient, requireClubPermission } from './adminAuth.js';
import { json, readJsonBody } from './attendance.js';

function cleanEmail(value) {
  const email = String(value || '').trim().toLowerCase();
  return /^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(email) ? email : '';
}

export function acceptanceAdminEmails(rows) {
  const emails = (rows || []).map((row) => cleanEmail(row.email));
  if (!emails.length || emails.some((email) => !email)) {
    throw new Error('Add at least one active admin email in Registrations → Notification emails.');
  }
  return [...new Set(emails)];
}

function escapeHtml(value) {
  return String(value ?? '').replace(/[&<>"']/g, (character) => ({
    '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#039;',
  })[character]);
}

export function buildAcceptanceAdminEmail(applicant) {
  const name = applicant.full_name || 'Accepted member';
  const details = [
    ['Name', name], ['Phone / WhatsApp', applicant.phone || 'No phone provided'],
    ['Email', applicant.email || 'Not provided'], ['Department', applicant.department || 'Not provided'],
    ['Filière', applicant.filiere || 'Not provided'], ['Year of study', applicant.years_of_study || 'Not provided'],
    ['Registration season', applicant.registration_season || 'Not provided'],
  ];
  // Never guess a country code or claim that the phone number has WhatsApp.
  const phone = String(applicant.phone || '').trim();
  const internationalPhone = /^\+[1-9][\d\s().-]{7,20}$/.test(phone) ? phone.replace(/\D/g, '') : '';
  const whatsappUrl = internationalPhone ? `https://wa.me/${internationalPhone}` : '';
  const instruction = 'This student has been accepted. Please verify their WhatsApp number and add them to the club WhatsApp group manually.';
  const text = [instruction, '', ...details.map(([label, value]) => `${label}: ${value}`),
    ...(whatsappUrl ? ['', `Open WhatsApp contact: ${whatsappUrl}`] : [])].join('\n');
  const html = `<!doctype html><html><body style="margin:0;background:#eef3f9;font-family:Arial,sans-serif;color:#17233d"><div style="max-width:640px;margin:24px auto;background:#fff;border:1px solid #dce3ee"><header style="padding:22px 26px;background:#101b34;color:#fff"><p style="margin:0;font-size:12px">Robotics &amp; AI Club ESTS</p><h1 style="margin:8px 0 0;font-size:24px">Add a new member to WhatsApp</h1></header><div style="padding:26px"><p>${escapeHtml(instruction)}</p><table style="width:100%;border-collapse:collapse">${details.map(([label, value]) => `<tr><th style="padding:10px;border:1px solid #dce3ee;text-align:left;font-size:13px">${escapeHtml(label)}</th><td style="padding:10px;border:1px solid #dce3ee;font-size:13px">${escapeHtml(value)}</td></tr>`).join('')}</table>${whatsappUrl ? `<p style="margin-top:22px"><a href="${whatsappUrl}" style="color:#1d4ed8">Open this contact in WhatsApp</a></p>` : ''}</div></div></body></html>`;
  return { subject: `[WhatsApp group] Add accepted member: ${String(name).replace(/[\r\n]/g, ' ')}`, text, html };
}

function migrationError(error) {
  return new Error(error.code === 'PGRST202'
    ? 'Run migration_registration_acceptance_notifications.sql in Supabase to enable admin emails.'
    : error.message || 'The email delivery record could not be updated.');
}

// Inject the transporter for tests; no live emails are needed to verify delivery.
export async function deliverAcceptanceAdminNotification(client, registrationId, env = process.env, createTransport = nodemailer.createTransport) {
  const { data: claim, error } = await client.rpc('claim_registration_acceptance_notification', { p_registration_id: registrationId });
  if (error) throw migrationError(error);
  if (claim?.status === 'sent' || claim?.status === 'sending') return { status: claim.status, alreadySent: claim.already_sent === true };
  if (claim?.status !== 'claimed' || !claim.claim_token || String(claim.registration_id) !== String(registrationId)) {
    throw new Error('The acceptance email could not be reserved for delivery.');
  }

  let outcome;
  const user = cleanEmail(env.GMAIL_USER);
  const password = String(env.GMAIL_APP_PASSWORD || '').replace(/\s/g, '');
  if (!user || !password) {
    outcome = { status: 'not_configured', error: 'Configure the Gmail sender on the server. Acceptance is already saved.' };
  } else {
    let transporter;
    try {
      const { data: recipientRows, error: recipientError } = await client
        .from('registration_notification_recipients').select('email').eq('is_active', true);
      if (recipientError) {
        const missingSetup = ['PGRST205', '42P01'].includes(recipientError.code);
        throw new Error(missingSetup
          ? 'Run migration_registration_notification_recipients.sql in Supabase, then add admin emails in Registrations.'
          : 'Could not load admin notification emails. Refresh Registrations and check your permissions.');
      }
      const recipients = acceptanceAdminEmails(recipientRows);
      transporter = createTransport({ service: 'gmail', auth: { user, pass: password },
        connectionTimeout: 10000, greetingTimeout: 10000, socketTimeout: 20000 });
      const fromName = String(env.GMAIL_FROM_NAME || 'Robotics & AI Club ESTS').replace(/["\r\n]/g, '');
      const result = await transporter.sendMail({
        from: { name: fromName, address: user }, to: recipients,
        replyTo: cleanEmail(env.GMAIL_REPLY_TO) || user,
        ...buildAcceptanceAdminEmail(claim),
      });
      if (result.rejected?.length) throw new Error('Gmail rejected one or more admin recipients. Check the notification addresses.');
      outcome = { status: 'sent', messageId: result.messageId || null };
    } catch (sendError) {
      // Do not expose provider responses or credentials to the browser/database.
      const configurationError = sendError.message?.startsWith('Add at least one active admin email')
        || sendError.message?.startsWith('Run migration_registration_notification_recipients.sql');
      const recipientReadError = sendError.message?.startsWith('Could not load admin notification emails');
      outcome = { status: configurationError ? 'not_configured' : 'failed', error: configurationError
        || recipientReadError ? sendError.message : 'Admin email could not be delivered. Check Gmail settings and retry the notification.' };
    } finally {
      transporter?.close?.();
    }
  }

  const { error: deliveryError } = await client.rpc('record_registration_acceptance_notification', {
    p_registration_id: registrationId, p_claim_token: claim.claim_token, p_status: outcome.status,
    p_message_id: outcome.messageId || null, p_error: outcome.error || null,
  });
  if (deliveryError) throw new Error('Email delivery could not be recorded. Acceptance is saved; refresh before retrying the notification.');
  return outcome;
}

export async function handleAcceptanceNotification(request, response, env = process.env) {
  if (request.method !== 'POST') return json(response, 405, { success: false, error: 'Method not allowed.' });
  try {
    await requireClubPermission(request, 'registrations');
    const body = await readJsonBody(request);
    if (!/^[1-9]\d*$/.test(String(body.registrationId || ''))) return json(response, 400, { success: false, error: 'A valid registration ID is required.' });
    // Recipient addresses and applicant details come from protected Supabase data,
    // never from request fields supplied by the browser.
    const outcome = await deliverAcceptanceAdminNotification(createAuthenticatedSupabaseClient(request), body.registrationId, env);
    return json(response, 200, { success: true, data: outcome });
  } catch (error) {
    return json(response, error.statusCode || 500, { success: false, error: error.message || 'Admin notification failed.' });
  }
}
