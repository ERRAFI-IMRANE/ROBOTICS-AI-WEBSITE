import { createAuthenticatedSupabaseClient, requireClubPermission } from "./adminAuth.js";
import nodemailer from "nodemailer";


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

function cleanEmail(value) {
  const email = String(value || "").trim().toLowerCase();
  return /^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(email) ? email : "";
}

function uniqueEmails(values = []) {
  return [...new Set(values.map(cleanEmail).filter(Boolean))];
}

function escapeHtml(value) {
  return String(value ?? "").replace(/[&<>"']/g, (character) => ({
    "&": "&amp;", "<": "&lt;", ">": "&gt;", "\"": "&quot;", "'": "&#039;",
  })[character]);
}

function readableDate(value) {
  if (!value) return "Date unavailable";
  return new Intl.DateTimeFormat("en-GB", {
    dateStyle: "full",
    timeStyle: "short",
    timeZone: "Africa/Casablanca",
  }).format(new Date(value));
}

function gmailConfig(env) {
  return {
    user: cleanEmail(env.GMAIL_USER),
    password: String(env.GMAIL_APP_PASSWORD || "").replace(/\s/g, ""),
    fromName: String(env.GMAIL_FROM_NAME || "Robotics & AI Club ESTS").trim(),
    replyTo: cleanEmail(env.GMAIL_REPLY_TO),
  };
}

function participantDescription(action) {
  return [
    action.participant_type === "team" ? "Team" : "Accepted member",
    action.role || action.filiere || action.department,
    action.registration_season || action.session_season,
  ].filter(Boolean).join(" · ");
}

function absenceRows(action) {
  const rows = Array.isArray(action.absence_sessions) ? action.absence_sessions : [];
  if (!rows.length) return "<li>Attendance history unavailable.</li>";
  return rows.map((session) => `<li><strong>${escapeHtml(session.title || "Club session")}</strong> — ${escapeHtml(readableDate(session.starts_at))}${session.session_type ? ` · ${escapeHtml(session.session_type)}` : ""}</li>`).join("");
}

export function buildAttendanceEmail(action, { adminCopy = false } = {}) {
  const name = action.full_name || "Club member";
  const streak = Number(action.streak || 0);
  const isRemoval = isAttendanceRemoval(action);
  const participantType = action.participant_type === "team" ? "team member" : "accepted member";
  const subject = isRemoval
    ? `[Membership removed] ${name} — ${streak} consecutive absences`
    : `[Attendance warning] ${name} — ${streak} consecutive absences`;
  const headline = isRemoval
    ? "Club membership removed"
    : "Attendance warning";
  const memberDecision = `Your registration has been changed from accepted to refused after ${streak} consecutive absences. The member attendance removal threshold is 3 consecutive absences.`;
  const mainCopy = isRemoval
    ? memberDecision
    : `You have reached ${streak} consecutive absences. Please contact the bureau before the next club session.${action.participant_type === "team" ? " This is a warning only; your Team profile has not been removed." : ""}`;
  const adminInstruction = isRemoval
    ? `<div style="margin:18px 0;padding:14px;border-left:4px solid #b42318;background:#fff1f0"><strong>Membership removed:</strong> ${escapeHtml(name)} reached ${streak} consecutive absences. Their registration changed from accepted to refused. Verify the absence details and complete the membership follow-up.<p>Email: ${escapeHtml(action.email || "Not provided")}<br>Phone: ${escapeHtml(action.phone || "Not provided")}</p></div>`
    : `<div style="margin:18px 0;padding:14px;border-left:4px solid #1d4ed8;background:#eff6ff"><strong>Admin copy:</strong> this ${escapeHtml(participantType)} reached ${streak} consecutive absences.</div>`;
  const html = `<!doctype html><html><body style="margin:0;background:#eef3f9;font-family:Arial,sans-serif;color:#17233d"><div style="max-width:640px;margin:24px auto;background:#fff;border:1px solid #dce3ee"><div style="padding:22px 26px;background:#101b34;color:#fff"><div style="font-size:12px;letter-spacing:.12em;text-transform:uppercase;opacity:.75">Robotics &amp; AI Club ESTS</div><h1 style="margin:8px 0 0;font-size:24px">${escapeHtml(headline)}</h1></div><div style="padding:26px"><p>Hello ${escapeHtml(name)},</p>${adminCopy ? adminInstruction : `<p>${escapeHtml(mainCopy)}</p>`}<table style="width:100%;border-collapse:collapse;margin:18px 0"><tr><td style="padding:9px;border:1px solid #dce3ee;color:#64748b">Profile</td><td style="padding:9px;border:1px solid #dce3ee">${escapeHtml(participantDescription(action) || participantType)}</td></tr><tr><td style="padding:9px;border:1px solid #dce3ee;color:#64748b">Current session</td><td style="padding:9px;border:1px solid #dce3ee">${escapeHtml(action.session_title || "Club session")} · ${escapeHtml(readableDate(action.session_date))}</td></tr><tr><td style="padding:9px;border:1px solid #dce3ee;color:#64748b">Consecutive absences</td><td style="padding:9px;border:1px solid #dce3ee"><strong>${streak}</strong></td></tr></table><h2 style="font-size:16px">Absence details</h2><ul style="padding-left:20px;line-height:1.7">${absenceRows(action)}</ul>${!adminCopy && isRemoval ? `<p style="margin-top:20px">If you believe this record is incorrect, reply to this email and contact the bureau.</p>` : ""}</div></div></body></html>`;
  const text = [
    headline,
    `Name: ${name}`,
    `Profile: ${participantDescription(action) || participantType}`,
    `Current session: ${action.session_title || "Club session"} — ${readableDate(action.session_date)}`,
    `Consecutive absences: ${streak}`,
    `Email: ${action.email || "Not provided"}`,
    `Phone: ${action.phone || "Not provided"}`,
    adminCopy && isRemoval ? "Membership removed: registration changed from accepted to refused. Verify the record and complete the membership follow-up." : mainCopy,
    "Absence details:",
    ...(Array.isArray(action.absence_sessions) ? action.absence_sessions.map((session) => `- ${session.title || "Club session"} — ${readableDate(session.starts_at)}`) : []),
  ].join("\n");
  return { subject, html, text };
}

export function isAttendanceRemoval(action) {
  return action.participant_type === "registration"
    && ["membership_removal", "group_removal"].includes(action.action_type);
}

export async function sendAttendanceEmail(action, env, createTransport = nodemailer.createTransport) {
  if (isAttendanceRemoval(action) && action.registration_status && action.registration_status !== "refused") {
    return { status: "skipped", error: "The member is no longer refused. The outdated removal notice was not sent." };
  }
  const config = gmailConfig(env);
  if (!config.user || !config.password) {
    return { status: "not_configured", error: "Gmail sender credentials are not configured on the server." };
  }
  const memberEmail = cleanEmail(action.email);
  const adminEmails = uniqueEmails(action.admin_emails);
  if (!memberEmail && !adminEmails.length) {
    return { status: "not_configured", error: "This participant has no email and no attendance-admin recipients are configured." };
  }

  const transporter = createTransport({
    service: "gmail",
    auth: { user: config.user, pass: config.password },
  });
  const from = `"${config.fromName.replace(/["\r\n]/g, "")}" <${config.user}>`;
  const ids = [];

  if (memberEmail) {
    const memberMessage = buildAttendanceEmail(action);
    const memberResult = await transporter.sendMail({
      from,
      to: memberEmail,
      bcc: adminEmails.filter((email) => email !== memberEmail),
      replyTo: config.replyTo || undefined,
      ...memberMessage,
    });
    if (memberResult.messageId) ids.push(memberResult.messageId);
  }

  const isRemoval = isAttendanceRemoval(action);
  if (adminEmails.length && (!memberEmail || isRemoval)) {
    const adminMessage = buildAttendanceEmail(action, { adminCopy: true });
    const adminResult = await transporter.sendMail({
      from,
      to: adminEmails,
      replyTo: config.replyTo || undefined,
      ...adminMessage,
    });
    if (adminResult.messageId) ids.push(adminResult.messageId);
  }

  return { status: "sent", externalId: ids.join(",") };
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
    const deliveryError = new Error("This email action was already processed. Refresh the attendance audit.");
    deliveryError.statusCode = 409;
    throw deliveryError;
  }
  let outcome;
  try {
    if (["warning_message", "membership_removal", "group_removal", "team_warning"].includes(action.action_type)) {
      outcome = await sendAttendanceEmail(action, env);
    } else {
      outcome = { status: "skipped", error: "This action does not use email delivery." };
    }
  } catch (deliveryError) {
    outcome = { status: "failed", error: deliveryError.message || "Email delivery failed." };
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
