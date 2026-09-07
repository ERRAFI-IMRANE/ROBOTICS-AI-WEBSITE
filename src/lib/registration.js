import { EST_SAFI_DEPARTMENTS } from "../constants/registrationConstants.js";

// The live schema stores the academic year as an integer, not a degree label.
export const REGISTRATION_YEARS = [1, 2, 3, 4, 5];

export function validateRegistration(values) {
  const errors = {};
  if (!values.full_name.trim() || values.full_name.trim().length > 120) errors.full_name = "Enter your full name (up to 120 characters).";
  if (!/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(values.email.trim()) || values.email.length > 254) errors.email = "Enter a valid email address.";
  const digits = values.phone.replace(/\D/g, "");
  if (!/^[+\d\s().-]+$/.test(values.phone.trim()) || digits.length < 8 || digits.length > 15) errors.phone = "Enter a valid phone number, including your country code.";
  if (!Object.hasOwn(EST_SAFI_DEPARTMENTS, values.department)) errors.department = "Choose your department.";
  if (!EST_SAFI_DEPARTMENTS[values.department]?.includes(values.filiere)) errors.filiere = "Choose a filière in your department.";
  if (!REGISTRATION_YEARS.includes(Number(values.years_of_study))) errors.years_of_study = "Choose your year of study.";
  if (values.message.length > 2000) errors.message = "Keep your message under 2,000 characters.";
  return errors;
}

export async function readRegistrationSettings(client) {
  // Respect the selected campaign, not whichever season sorts last.
  const settings = await client.from("club_settings").select("current_season").eq("id", 1).maybeSingle();
  if (settings.error && !["PGRST205", "42P01"].includes(settings.error.code)) {
    throw new Error("Registration availability could not be checked. Please try again shortly.");
  }
  let query = client.from("registration_settings").select("id, is_open, season");
  if (settings.data?.current_season) query = query.eq("season", settings.data.current_season);
  else query = query.order("season", { ascending: false }).limit(1);
  const { data, error } = await query.maybeSingle();
  if (error || (data && (typeof data.is_open !== "boolean" || !data.season?.trim()))) {
    throw new Error("Registration availability could not be checked. Please try again shortly.");
  }
  return data || { is_open: false, season: null };
}

export async function setRegistrationOpen(client, settings, isOpen) {
  if (!settings?.id || !settings.season) throw new Error("No registration campaign is configured.");
  const now = new Date().toISOString();
  const { data, error } = await client.from("registration_settings").update({
    is_open: isOpen, closed_at: isOpen ? null : now,
    ...(isOpen ? { opened_at: now } : {}), updated_at: now,
  }).eq("id", settings.id).eq("season", settings.season).select("id, season, is_open").single();
  if (error || !data || data.is_open !== isOpen) throw new Error("The campaign could not be updated. Refresh and try again.");
  return data;
}

export async function submitRegistration(client, values, expectedSeason) {
  if (Object.keys(validateRegistration(values)).length) throw new Error("Please check the highlighted fields.");
  // Recheck immediately before writing; the database must enforce the same rule with RLS.
  const settings = await readRegistrationSettings(client);
  if (!settings.is_open) throw new Error("Applications have just closed. Please contact the club for the next intake.");
  if (settings.season !== expectedSeason) throw new Error("The registration season has changed. Please check the updated season and submit again.");
  const payload = {
    full_name: values.full_name.trim(),
    email: values.email.trim().toLowerCase(),
    phone: values.phone.trim(),
    department: values.department,
    filiere: values.filiere,
    years_of_study: Number(values.years_of_study),
    message: values.message.trim() || null,
    registration_season: settings.season,
    status: "pending",
    refusal_reason: null,
  };
  // Do not request the inserted row: public applicants don't need SELECT permission.
  const { error } = await client.from("registrations").insert(payload);
  if (error) {
    if (error.code === "23505") throw new Error("An application with these details already exists. Please contact the club if you need to update it.");
    throw new Error("We couldn't confirm your application. Your details are still here. Please check your connection or contact the club before retrying.");
  }
}
