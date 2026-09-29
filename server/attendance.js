import { createAuthenticatedSupabaseClient, requireClubPermission } from "./adminAuth.js";

const DEFAULT_GRAPH_VERSION = "v23.0";

export function json(response, status, body) {
  response.statusCode = status;
  response.setHeader("Content-Type", "application/json");
  response.setHeader("Cache-Control", "private, no-store");
  return response.end(JSON.stringify(body));
}

export async function readJsonBody(request) {
  if (request.body && typeof request.body === "object") return request.body;
  if (typeof request.body === "string") return JSON.parse(request.body);
  const chunks = [];
  let size = 0;
  for await (const chunk of request) {
    size += chunk.length;
    if (size > 32 * 1024) throw Object.assign(new Error("Request is too large."), { statusCode: 413 });
    chunks.push(chunk);
  }
  return size ? JSON.parse(Buffer.concat(chunks).toString("utf8")) : {};
}

function normalizeWhatsAppPhone(value) {
  const digits = String(value || "").replace(/\D/g, "");
  if (!digits) return "";
  if (digits.startsWith("00")) return digits.slice(2);
  if (digits.startsWith("0") && digits.length === 10) return `212${digits.slice(1)}`;
  return digits;
}

function whatsappConfig(env) {
  return {
    accessToken: env.WHATSAPP_ACCESS_TOKEN || "",
    phoneNumberId: env.WHATSAPP_PHONE_NUMBER_ID || "",
    groupId: env.WHATSAPP_GROUP_ID || "",
    version: env.WHATSAPP_API_VERSION || DEFAULT_GRAPH_VERSION,
    warningTemplate: env.WHATSAPP_WARNING_TEMPLATE || "",
    templateLanguage: env.WHATSAPP_TEMPLATE_LANGUAGE || "en",
  };
}

async function graphRequest(path, options, env) {
  const config = whatsappConfig(env);
  const response = await fetch(`https://graph.facebook.com/${config.version}/${path}`, {
    ...options,
    headers: { Authorization: `Bearer ${config.accessToken}`, "Content-Type": "application/json", ...(options.headers || {}) },
  });
  const payload = await response.json().catch(() => ({}));
  if (!response.ok) {
    const error = new Error(payload?.error?.message || `WhatsApp returned HTTP ${response.status}.`);
    error.statusCode = 502;
    throw error;
  }
  return payload;
}

function warningText(action) {
  const ordinal = action.streak === 3 ? "third" : "fourth";
  return `Hello ${action.full_name || "club member"}. This is an official Robotics & AI Club attendance warning after your ${ordinal} consecutive absence. Please contact the bureau before the next session. A fifth consecutive absence removes an accepted member from the club.`;
}

async function sendWarning(action, env) {
  const config = whatsappConfig(env);
  const phone = normalizeWhatsAppPhone(action.phone);
  if (!config.accessToken || !config.phoneNumberId) return { status: "not_configured", error: "WhatsApp access token or phone number ID is not configured." };
  if (!phone) return { status: "failed", error: "This member has no valid WhatsApp phone number." };
  const message = config.warningTemplate ? {
    messaging_product: "whatsapp",
    recipient_type: "individual",
    to: phone,
    type: "template",
    template: {
      name: config.warningTemplate,
      language: { code: config.templateLanguage },
      components: [{ type: "body", parameters: [
        { type: "text", text: action.full_name || "Club member" },
        { type: "text", text: String(action.streak) },
      ] }],
    },
  } : {
    messaging_product: "whatsapp", recipient_type: "individual", to: phone,
    type: "text", text: { preview_url: false, body: warningText(action) },
  };
  const payload = await graphRequest(`${config.phoneNumberId}/messages`, {
    method: "POST",
    body: JSON.stringify(message),
  }, env);
  return { status: "sent", externalId: payload?.messages?.[0]?.id || "" };
}

async function removeFromGroup(action, env) {
  const config = whatsappConfig(env);
  const phone = normalizeWhatsAppPhone(action.phone);
  if (!config.accessToken || !config.groupId) return { status: "not_configured", error: "WhatsApp access token or group ID is not configured." };
  if (!phone) return { status: "failed", error: "This member has no valid WhatsApp phone number." };
  await graphRequest(`${config.groupId}/participants`, {
    method: "DELETE",
    body: JSON.stringify({ messaging_product: "whatsapp", participants: [{ user: `+${phone}` }] }),
  }, env);
  return { status: "completed", externalId: config.groupId };
}

async function recordDelivery(client, actionId, outcome) {
  const { error } = await client.rpc("record_attendance_delivery", {
    p_action_id: actionId,
    p_status: outcome.status,
    p_external_id: outcome.externalId || null,
    p_error: outcome.error || null,
  });
  if (error) throw error;
}

async function deliverAction(client, actionId, env) {
  const { data: action, error } = await client.rpc("get_attendance_action_for_delivery", { p_action_id: actionId });
  if (error) throw error;
  if (!["pending", "failed", "not_configured"].includes(action.delivery_status)) {
    const deliveryError = new Error("This WhatsApp action was already processed. Refresh the attendance audit.");
    deliveryError.statusCode = 409;
    throw deliveryError;
  }
  let outcome;
  try {
    if (action.action_type === "warning_message") outcome = await sendWarning(action, env);
    else if (action.action_type === "group_removal") outcome = await removeFromGroup(action, env);
    else outcome = { status: "skipped", error: "This action does not use WhatsApp." };
  } catch (deliveryError) {
    outcome = { status: "failed", error: deliveryError.message || "WhatsApp delivery failed." };
  }
  await recordDelivery(client, action.id, outcome);
  return { id: action.id, actionType: action.action_type, ...outcome };
}

export async function handleAttendanceActions(request, response, env = process.env) {
  if (request.method !== "POST") return json(response, 405, { success: false, error: "Method not allowed." });
  try {
    await requireClubPermission(request, "absence");
    const client = createAuthenticatedSupabaseClient(request);
    const body = await readJsonBody(request);
    let closure = null;
    let actionIds = [];

    if (body.mode === "close") {
      if (!body.sessionId) return json(response, 400, { success: false, error: "Attendance session ID is required." });
      const { data, error } = await client.rpc("close_attendance_session", { p_session_id: body.sessionId });
      if (error) throw error;
      closure = data;
      actionIds = (data?.actions || []).map((action) => action.id);
    } else if (body.mode === "retry") {
      if (!body.actionId) return json(response, 400, { success: false, error: "Attendance action ID is required." });
      actionIds = [body.actionId];
    } else {
      return json(response, 400, { success: false, error: "Invalid attendance action mode." });
    }

    const deliveries = [];
    for (const actionId of actionIds) deliveries.push(await deliverAction(client, actionId, env));
    return json(response, 200, { success: true, data: { closure, deliveries } });
  } catch (error) {
    return json(response, error.statusCode || 500, { success: false, error: error.message || "Attendance action failed." });
  }
}
