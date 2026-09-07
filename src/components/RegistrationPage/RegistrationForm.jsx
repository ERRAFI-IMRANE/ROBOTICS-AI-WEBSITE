import { useCallback, useEffect, useRef, useState } from "react";
import { supabase } from "../../lib/supabaseClient";
import { DEPARTMENT_NAMES, EST_SAFI_DEPARTMENTS } from "../../constants/registrationConstants";
import { REGISTRATION_YEARS, readRegistrationSettings, submitRegistration, validateRegistration } from "../../lib/registration";

const EMPTY_FORM = { full_name: "", email: "", phone: "", department: "", filiere: "", years_of_study: "", message: "" };

export default function RegistrationForm() {
  const [values, setValues] = useState(EMPTY_FORM);
  const [errors, setErrors] = useState({});
  const [settings, setSettings] = useState(null);
  const [loading, setLoading] = useState(true);
  const [availabilityError, setAvailabilityError] = useState("");
  const [submitError, setSubmitError] = useState("");
  const [submitting, setSubmitting] = useState(false);
  const [success, setSuccess] = useState(false);
  const busy = useRef(false);
  const mounted = useRef(false);
  const formRef = useRef(null);
  const successRef = useRef(null);

  const loadSettings = useCallback(async () => {
    setLoading(true);
    setAvailabilityError("");
    try {
      const next = await readRegistrationSettings(supabase);
      if (mounted.current) setSettings(next);
    } catch (error) {
      if (mounted.current) { setSettings(null); setAvailabilityError(error.message); }
    } finally {
      if (mounted.current) setLoading(false);
    }
  }, []);

  useEffect(() => {
    mounted.current = true;
    loadSettings();
    return () => { mounted.current = false; };
  }, [loadSettings]);

  useEffect(() => { if (success) successRef.current?.focus(); }, [success]);

  function update(event) {
    const { name, value } = event.target;
    setValues((previous) => ({ ...previous, [name]: value, ...(name === "department" ? { filiere: "" } : {}) }));
    setErrors((previous) => ({ ...previous, [name]: undefined, ...(name === "department" ? { filiere: undefined } : {}) }));
    setSubmitError("");
  }

  async function handleSubmit(event) {
    event.preventDefault();
    if (busy.current || success || loading || !settings?.is_open) return;
    const nextErrors = validateRegistration(values);
    setErrors(nextErrors);
    if (Object.keys(nextErrors).length) {
      formRef.current.elements.namedItem(Object.keys(nextErrors)[0])?.focus();
      return;
    }
    busy.current = true;
    setSubmitting(true);
    setSubmitError("");
    try {
      await submitRegistration(supabase, values, settings.season);
      if (mounted.current) { setSuccess(true); setValues(EMPTY_FORM); }
    } catch (error) {
      if (mounted.current) { setSubmitError(error.message); await loadSettings(); }
    } finally {
      busy.current = false;
      if (mounted.current) setSubmitting(false);
    }
  }

  const inputProps = (name) => ({
    id: `reg-${name}`, name, value: values[name], onChange: update,
    required: name !== "message", "aria-invalid": Boolean(errors[name]),
    "aria-describedby": errors[name] ? `reg-${name}-error` : undefined,
  });
  const fieldError = (name) => errors[name] && <span className="reg-field-error" id={`reg-${name}-error`}>{errors[name]}</span>;

  return (
    <section className="reg-application" aria-labelledby="reg-title">
      <div className="reg-intro">
        <p className="reg-eyebrow">EST SAFI / ROBOTICS & AI CLUB</p>
        <h1 id="reg-title">YOUR NEXT<br /><span>BIG IDEA.</span></h1>
        <p className="reg-intro-copy">Starts with a team. Join us to learn, build and bring intelligent ideas to life.</p>
      </div>
      <div className="reg-season" role="status">
        <span className={`reg-status-dot ${settings?.is_open ? "is-open" : ""}`} />
        {loading ? "Checking applications…" : availabilityError ? "Applications unavailable" : settings?.is_open ? "Applications open" : "Applications closed"}
        {settings?.season && <span className="reg-season-year">{settings.season}</span>}
      </div>
      {success ? (
        <div className="reg-success" ref={successRef} tabIndex={-1} role="status">
          <span className="reg-success-icon" aria-hidden="true">✓</span>
          <h2>You’re on the list.</h2>
          <p>Your application has been submitted for review. The club team will use your contact details to follow up.</p>
          <p className="reg-fine-print">Application submitted — membership is subject to approval.</p>
        </div>
      ) : (
        <>
          {availabilityError && <div className="reg-notice" role="alert"><p>{availabilityError}</p><button type="button" className="reg-retry" onClick={loadSettings}>Try again</button></div>}
          {!loading && settings && !settings.is_open && <p className="reg-notice">This intake is closed. Follow our socials for the next opening, or email <a href="mailto:roboticsai.club.ests@gmail.com">roboticsai.club.ests@gmail.com</a>.</p>}
          <form ref={formRef} className="reg-form" onSubmit={handleSubmit} noValidate aria-label="Club application" aria-busy={submitting}>
            <p className="reg-form-hint">All fields required unless marked optional.</p>
            <fieldset disabled={loading || !settings?.is_open || submitting}>
              <legend className="reg-sr-only">Your application details</legend>
              <div className="reg-form-grid">
                <div className="reg-field reg-field-wide"><label htmlFor="reg-full_name">Full name</label><input {...inputProps("full_name")} autoComplete="name" placeholder="Your first and last name" maxLength={120} />{fieldError("full_name")}</div>
                <div className="reg-field"><label htmlFor="reg-email">Email address</label><input {...inputProps("email")} type="email" autoComplete="email" placeholder="you@example.com" maxLength={254} />{fieldError("email")}</div>
                <div className="reg-field"><label htmlFor="reg-phone">Phone number</label><input {...inputProps("phone")} type="tel" autoComplete="tel" placeholder="+212 6XX XXX XXX" maxLength={30} />{fieldError("phone")}</div>
                <div className="reg-field"><label htmlFor="reg-department">Department</label><select {...inputProps("department")}><option value="">Select department</option>{DEPARTMENT_NAMES.map((name) => <option key={name}>{name}</option>)}</select>{fieldError("department")}</div>
                <div className="reg-field"><label htmlFor="reg-years_of_study">Year of study</label><select {...inputProps("years_of_study")}><option value="">Select year</option>{REGISTRATION_YEARS.map((year) => <option key={year} value={year}>Year {year}</option>)}</select>{fieldError("years_of_study")}</div>
                <div className="reg-field reg-field-wide"><label htmlFor="reg-filiere">Filière / study programme</label><select {...inputProps("filiere")} disabled={!values.department}><option value="">{values.department ? "Select your filière" : "Choose a department first"}</option>{(EST_SAFI_DEPARTMENTS[values.department] || []).map((name) => <option key={name}>{name}</option>)}</select>{fieldError("filiere")}</div>
                <div className="reg-field reg-field-wide"><label htmlFor="reg-message">What would you like to build? <span>(optional)</span></label><textarea {...inputProps("message")} placeholder="Tell us about your interests, skills or an idea you’re excited about…" rows={3} maxLength={2000} />{fieldError("message")}</div>
              </div>
              <p className="reg-fine-print">By applying, you agree that the club may use these details to review your application and contact you about membership.</p>
              <button className="reg-submit" type="submit"><span>{submitting ? "Submitting application…" : "SEND APPLICATION"}</span><span aria-hidden="true">↗</span></button>
            </fieldset>
            {submitError && <p className="reg-notice reg-submit-error" role="alert">{submitError}</p>}
          </form>
        </>
      )}
    </section>
  );
}
