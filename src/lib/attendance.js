function unwrapRpc(result, fallback) {
  if (result.error) throw new Error(result.error.message || fallback);
  return result.data;
}

export async function loadAttendanceWorkspace(client) {
  const [sessionsResult, recordsResult, actionsResult, seasonsResult] = await Promise.all([
    client.from("attendance_sessions").select("*").order("starts_at", { ascending: false }),
    client.from("attendance_records").select("session_id,attendance_status"),
    client.from("attendance_actions").select("id,session_id,action_type,delivery_status,streak,created_at").order("created_at", { ascending: false }),
    client.rpc("list_attendance_seasons"),
  ]);
  if (sessionsResult.error) throw sessionsResult.error;
  if (recordsResult.error) throw recordsResult.error;
  if (actionsResult.error) throw actionsResult.error;
  if (seasonsResult.error) throw seasonsResult.error;

  const recordsBySession = (recordsResult.data || []).reduce((map, row) => {
    const summary = map.get(row.session_id) || { total: 0, unmarked: 0, present: 0, absent: 0, late: 0, excused: 0 };
    summary.total += 1;
    summary[row.attendance_status] = (summary[row.attendance_status] || 0) + 1;
    map.set(row.session_id, summary);
    return map;
  }, new Map());

  const actionsBySession = (actionsResult.data || []).reduce((map, row) => {
    const list = map.get(row.session_id) || [];
    list.push(row);
    map.set(row.session_id, list);
    return map;
  }, new Map());

  return {
    sessions: (sessionsResult.data || []).map((session) => ({
      ...session,
      attendance: recordsBySession.get(session.id) || { total: 0, unmarked: 0, present: 0, absent: 0, late: 0, excused: 0 },
      action_count: actionsBySession.get(session.id)?.length || 0,
    })),
    actions: actionsResult.data || [],
    seasons: Array.isArray(seasonsResult.data) ? seasonsResult.data : [],
  };
}

export async function loadAttendanceSession(client, sessionId) {
  return unwrapRpc(await client.rpc("get_attendance_session", { p_session_id: sessionId }), "Could not load this attendance session.");
}

export async function createAttendanceSession(client, draft) {
  return unwrapRpc(await client.rpc("create_attendance_session", {
    p_title: draft.title,
    p_session_type: draft.sessionType,
    p_season: draft.season,
    p_starts_at: new Date(draft.startsAt).toISOString(),
    p_notes: draft.notes || null,
  }), "Could not create the attendance session.");
}

export async function saveAttendance(client, sessionId, records) {
  return unwrapRpc(await client.rpc("mark_attendance_records", {
    p_session_id: sessionId,
    p_records: records.map((record) => ({
      record_id: record.id,
      attendance_status: record.attendance_status,
      note: record.note || null,
    })),
  }), "Could not save attendance.");
}

async function adminAccessToken(client) {
  const { data, error } = await client.auth.getSession();
  const token = data?.session?.access_token;
  if (error || !token) throw new Error("Your admin session expired. Sign in again.");
  return token;
}

export async function processAttendanceAction(client, payload) {
  const token = await adminAccessToken(client);
  const response = await fetch("/api/attendance/actions", {
    method: "POST",
    headers: { "Content-Type": "application/json", Authorization: `Bearer ${token}` },
    body: JSON.stringify(payload),
  });
  const body = await response.json().catch(() => ({}));
  if (!response.ok || !body.success) throw new Error(body.error || "The attendance action could not be completed.");
  return body.data;
}

export function closeAttendanceSession(client, sessionId) {
  return processAttendanceAction(client, { mode: "close", sessionId });
}

export function retryAttendanceDelivery(client, actionId) {
  return processAttendanceAction(client, { mode: "retry", actionId });
}
