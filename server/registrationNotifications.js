import { json } from './attendance.js';

// Retained as a safe tombstone for older clients and imports. Acceptance must
// never open an SMTP connection, claim a queue item, or notify recipients.
export async function deliverAcceptanceAdminNotification() {
  return { status: 'disabled' };
}

export async function handleAcceptanceNotification(request, response) {
  if (request.method !== 'POST') return json(response, 405, { success: false, error: 'Method not allowed.' });
  return json(response, 410, {
    success: false,
    error: 'Acceptance emails have been disabled. Attendance notifications remain available in Absence.',
    data: { status: 'disabled' },
  });
}
