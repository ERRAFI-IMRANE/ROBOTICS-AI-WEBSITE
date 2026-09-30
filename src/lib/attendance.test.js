import test from "node:test";
import assert from "node:assert/strict";
import { summarizeAttendance, loadAttendanceTeamSeasons, loadTeamIntoAttendance } from "./attendance.js";

test("overview counts people once and computes attendance only from saved sessions", () => {
  const result = summarizeAttendance({
    sessions: [
      { id: "saved", status: "closed", attendance: { total: 4, present: 3 } },
      { id: "live", status: "open", attendance: { total: 20, present: 1 } },
    ],
    actions: [
      { session_id: "saved", participant_type: "registration", registration_id: 1, action_type: "warning_message", delivery_status: "sent" },
      { session_id: "saved", participant_type: "registration", registration_id: 1, action_type: "warning_message", delivery_status: "sent" },
      { session_id: "saved", participant_type: "team", team_id: 1, action_type: "team_warning", delivery_status: "sent" },
      { session_id: "saved", participant_type: "registration", registration_id: 2, action_type: "membership_removal", delivery_status: "failed" },
      { session_id: "live", participant_type: "registration", registration_id: 3, action_type: "membership_removal", delivery_status: "completed" },
    ],
  });
  assert.deepEqual(result, { sessions: 2, live: 1, attendance: 75, notified: 2, refused: 1 });
  assert.equal(summarizeAttendance({ sessions: [], actions: [] }).attendance, null);
});

test("Team setup failures remain actionable instead of reporting an empty roster", async () => {
  await assert.rejects(() => loadAttendanceTeamSeasons({
    rpc: async () => ({ error: { code: "PGRST202" } }),
  }), /migration_attendance_roster_overview.sql/);
  await assert.rejects(() => loadTeamIntoAttendance({
    rpc: async () => ({ error: { message: "No eligible Team profiles exist" } }),
  }, "session", "2025-2026"), /No eligible Team/);
});
