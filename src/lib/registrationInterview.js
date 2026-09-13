export const INTERVIEW_QUESTIONS = Object.freeze([
  {
    field: "interest_type",
    eyebrow: "Interests",
    question: "What do you enjoy most?",
    multiple: true,
    options: [
      "Photography / Filming",
      "Design",
      "Coding / Robotics / AI",
      "Organizing Events",
      "Communication / Social Media",
      "Other Creative Activities",
    ],
  },
  {
    field: "team_role_style",
    eyebrow: "Team personality",
    question: "In a team, you are usually the one who...",
    multiple: false,
    options: [
      "Leads the group",
      "Organizes the work",
      "Gives creative ideas",
      "Handles technical tasks",
      "Communicates with people",
      "Supports wherever needed",
    ],
  },
  {
    field: "problem_solving_style",
    eyebrow: "Problem solving",
    question: "When you face a new problem, you usually...",
    multiple: false,
    options: [
      "Try to solve it alone first",
      "Search and learn how to solve it",
      "Ask someone experienced",
      "Discuss it with the team",
      "Try different solutions until one works",
    ],
  },
  {
    field: "work_environment",
    eyebrow: "Work environment",
    question: "Which environment do you prefer?",
    multiple: false,
    options: [
      "Working behind the scenes",
      "Working directly with people",
      "Creative work",
      "Technical work",
      "Managing and organizing",
      "A mix of everything",
    ],
  },
  {
    field: "preferred_activity",
    eyebrow: "Club activities",
    question: "Which type of club activity interests you the most?",
    multiple: true,
    options: [
      "Hackathons / Technical Projects",
      "Photography / Video Coverage",
      "Graphic Design / Content Creation",
      "Organizing Events",
      "Communication / Partnerships",
      "Workshops / Presentations",
    ],
  },
]);

function validSelections(value, options) {
  const input = Array.isArray(value) ? value : [];
  return [...new Set(input.filter((item) => options.includes(item)))];
}

export function interviewAnswersFromRegistration(registration = {}) {
  return Object.fromEntries(INTERVIEW_QUESTIONS.map((question) => [
    question.field,
    question.multiple
      ? validSelections(registration[question.field], question.options)
      : question.options.includes(registration[question.field]) ? registration[question.field] : "",
  ]));
}

export function validateInterviewAnswers(answers) {
  const missingQuestion = INTERVIEW_QUESTIONS.find((question) => {
    const answer = answers?.[question.field];
    return question.multiple ? !validSelections(answer, question.options).length : !question.options.includes(answer);
  });
  if (missingQuestion) throw new Error(`Answer “${missingQuestion.question}” before saving.`);

  return Object.fromEntries(INTERVIEW_QUESTIONS.map((question) => [
    question.field,
    question.multiple
      ? validSelections(answers[question.field], question.options)
      : answers[question.field],
  ]));
}

export async function saveRegistrationInterview(client, registrationId, answers) {
  if (!registrationId) throw new Error("Choose a valid applicant before saving the interview.");
  const payload = validateInterviewAnswers(answers);
  const { data, error } = await client.rpc("save_registration_interview", {
    p_registration_id: registrationId,
    p_interest_type: payload.interest_type,
    p_team_role_style: payload.team_role_style,
    p_problem_solving_style: payload.problem_solving_style,
    p_work_environment: payload.work_environment,
    p_preferred_activity: payload.preferred_activity,
  });
  if (error) {
    if (error.code === "PGRST202") throw new Error("Apply supabase/migration_registration_interviews.sql to enable interview saving.");
    throw new Error(error.message || "The interview could not be saved.");
  }
  if (!data || String(data.id) !== String(registrationId) || data.interview_completed !== true) {
    throw new Error("The saved interview was not confirmed. Keep this form open and try again.");
  }
  return data;
}

export async function completeRegistrationReview(client, registrationId, answers, decision, refusalReason = "") {
  if (!registrationId || !["accepted", "refused"].includes(decision)) throw new Error("Choose a valid applicant decision.");
  const reason = String(refusalReason || "").trim();
  if (decision === "refused" && reason.length < 3) throw new Error("Enter a clear refusal reason before confirming.");
  if (reason.length > 2000) throw new Error("Keep the refusal reason under 2,000 characters.");
  const payload = validateInterviewAnswers(answers);
  const { data, error } = await client.rpc("complete_registration_review", {
    p_registration_id: registrationId,
    p_interest_type: payload.interest_type,
    p_team_role_style: payload.team_role_style,
    p_problem_solving_style: payload.problem_solving_style,
    p_work_environment: payload.work_environment,
    p_preferred_activity: payload.preferred_activity,
    p_decision: decision,
    p_reason: decision === "refused" ? reason : null,
  });
  if (error) {
    if (error.code === "PGRST202") throw new Error("Run the updated supabase/migration_registration_interviews.sql to enable final interview decisions.");
    throw new Error(error.message || "The application review could not be completed.");
  }
  if (!data || String(data.id) !== String(registrationId) || data.status !== decision || data.interview_completed !== true) {
    throw new Error("The completed review was not confirmed. Keep this form open and try again.");
  }
  return data;
}

export async function setRegistrationInteresting(client, registrationId, interesting) {
  if (!registrationId) throw new Error("Choose a valid applicant before changing the flag.");
  const nextValue = interesting === true;
  const { data, error } = await client.rpc("set_registration_interesting", {
    p_registration_id: registrationId,
    p_interesting: nextValue,
  });
  if (error) {
    if (error.code === "PGRST202") throw new Error("Run supabase/migration_registration_interesting.sql to enable the Interesting flag.");
    throw new Error(error.message || "The Interesting flag could not be updated.");
  }
  if (!data || String(data.id) !== String(registrationId) || data.interesting !== nextValue) {
    throw new Error("The Interesting flag update was not confirmed. Refresh and try again.");
  }
  return data;
}
