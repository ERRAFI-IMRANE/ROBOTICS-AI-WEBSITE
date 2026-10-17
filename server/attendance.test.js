import { test } from "node:test";
import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { buildAttendanceEmail, isAttendanceRemoval, sendAttendanceEmail } from "./attendance.js";

const action = {
  participant_type: "registration", action_type: "membership_removal", streak: 3,
  full_name: "Member <Test>", email: "student@example.com", phone: "+212600000000",
  registration_season: "2026-2027", session_title: "Robotics session", session_date: "2026-10-17T10:00:00Z",
  admin_emails: ["admin@example.com"],
  absence_sessions: [1, 2, 3].map((index) => ({ title: `Session ${index}`, starts_at: `2026-10-0${index}T10:00:00Z` })),
};
const env = { GMAIL_USER: "club@example.com", GMAIL_APP_PASSWORD: "test-password" };

test("three-absence removal emails clearly state the decision and absence details", () => {
  assert.equal(isAttendanceRemoval(action), true);
  const email = buildAttendanceEmail(action);
  assert.match(email.subject, /3 consecutive absences/);
  assert.match(email.text, /accepted to refused/);
  assert.match(email.text, /Session 1/);
  assert.match(email.text, /Session 2/);
  assert.match(email.text, /Session 3/);
  assert.match(email.text, /student@example.com/);
  assert.match(email.html, /Member &lt;Test&gt;/);
  assert.doesNotMatch(email.subject + email.text + email.html, /five consecutive|5 consecutive|\/5/);
});

test("Team warnings never claim removal, including at five absences", () => {
  for (const streak of [3, 4, 5, 8]) {
    const teamAction = { ...action, participant_type: "team", action_type: "team_warning", streak };
    assert.equal(isAttendanceRemoval(teamAction), false);
    const email = buildAttendanceEmail(teamAction);
    assert.match(email.subject, /warning/);
    assert.match(email.text, /Team profile has not been removed/);
    assert.doesNotMatch(email.subject + email.html, /Membership removed|accepted to refused|Final attendance warning/);
  }
});

test("member removal sends to the member and the configured attendance admins", async () => {
  const messages = [];
  const result = await sendAttendanceEmail(action, env, () => ({
    sendMail: async (mail) => { messages.push(mail); return { messageId: `message-${messages.length}` }; },
  }));
  assert.equal(result.status, "sent");
  assert.equal(messages.length, 2);
  assert.equal(messages[0].to, "student@example.com");
  assert.deepEqual(messages[0].bcc, ["admin@example.com"]);
  assert.deepEqual(messages[1].to, ["admin@example.com"]);
  assert.match(messages[1].html, /registration changed from accepted to refused/i);
});

test("a Team profile without email notifies admins only, with no removal wording", async () => {
  const messages = [];
  await sendAttendanceEmail({ ...action, participant_type: "team", action_type: "team_warning", email: "", streak: 5 }, env,
    () => ({ sendMail: async (mail) => { messages.push(mail); return { messageId: "admin-warning" }; } }));
  assert.equal(messages.length, 1);
  assert.deepEqual(messages[0].to, ["admin@example.com"]);
  assert.doesNotMatch(messages[0].html + messages[0].subject, /Membership removed|accepted to refused/);
});

test("missing Gmail setup does not open SMTP and remains retryable", async () => {
  const result = await sendAttendanceEmail(action, {}, () => { throw new Error("No SMTP allowed"); });
  assert.equal(result.status, "not_configured");
});

test("an old removal notice is not sent after the member has been accepted again", async () => {
  const result = await sendAttendanceEmail({ ...action, registration_status: "accepted" }, env,
    () => { throw new Error("Do not send an outdated notice"); });
  assert.equal(result.status, "skipped");
});

test("SQL policy removes only accepted members at three and preserves Team warnings and audit", () => {
  const migration = readFileSync(new URL("../supabase/migration_member_attendance_policy.sql", import.meta.url), "utf8");
  assert.match(migration, /participant_type = 'team' AND absence_streak IN \(3, 4, 5\)/);
  assert.match(migration, /ELSIF participant.participant_type = 'registration' AND absence_streak >= 3 THEN/);
  assert.match(migration, /WHERE id = participant.registration_id AND status = 'accepted'/);
  assert.match(migration, /IF FOUND THEN[\s\S]*'membership_removal'/);
  assert.match(migration, /ON CONFLICT DO NOTHING/);
  assert.match(migration, /attendance_status <> 'absent' THEN EXIT/);
  assert.match(migration, /session_history.season = target_session.season/);
  assert.match(migration, /history\.id\)\s*<=/);
  assert.match(migration, /status <> 'open'/);
  assert.match(migration, /FOR UPDATE/);
  assert.match(migration, /Removed after 3 consecutive absences/);
  assert.match(migration, /Removed after 5 consecutive absences/);
  assert.doesNotMatch(migration, /UPDATE public\.team|DELETE FROM public\.(team|registrations)/);
});
