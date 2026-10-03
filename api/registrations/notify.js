import { handleAcceptanceNotification } from '../../server/registrationNotifications.js';

export default function handler(request, response) {
  return handleAcceptanceNotification(request, response);
}
