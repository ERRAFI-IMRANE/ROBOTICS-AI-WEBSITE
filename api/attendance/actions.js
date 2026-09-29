import { handleAttendanceActions } from "../../server/attendance.js";

export default function handler(request, response) {
  return handleAttendanceActions(request, response);
}
