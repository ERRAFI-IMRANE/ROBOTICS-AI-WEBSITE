import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import Footer from "../Footer/Footer";
import { NAV_GALLERY_COLUMN_ONE, NAV_GALLERY_COLUMN_TWO } from "../FullNavMenu/navigationGallery";
import { readPublicForm, submitPublicForm, validatePublicAnswers } from "../../lib/dynamicForms";
import { publicContent } from "../../lib/supabaseClient";
import "../RegistrationPage/RegistrationPage.css";
import "./DynamicFormPage.css";

function DynamicField({ field, value, error, onChange }) {
  const props = { id: `dynamic-${field.id}`, name: field.id, value: value || "", required: field.required, "aria-invalid": Boolean(error), "aria-describedby": error ? `dynamic-${field.id}-error` : field.description ? `dynamic-${field.id}-help` : undefined, onChange: (event) => onChange(event.target.value) };
  let control;
  if (field.field_type === "long_text") control = <textarea {...props} rows="4" maxLength="4000" placeholder={field.placeholder} />;
  else if (field.field_type === "select") control = <select {...props}><option value="">Choose an option</option>{field.options.map((option) => <option key={option}>{option}</option>)}</select>;
  else if (field.field_type === "radio" || field.field_type === "checkboxes") control = <fieldset id={props.id} tabIndex="-1" className="dynamic-choice-list"><legend className="reg-sr-only">{field.label}</legend>{field.options.map((option) => { const checked = field.field_type === "checkboxes" ? (value || []).includes(option) : value === option; return <label key={option}><input type={field.field_type === "checkboxes" ? "checkbox" : "radio"} name={field.id} checked={checked} onChange={() => field.field_type === "checkboxes" ? onChange(checked ? value.filter((item) => item !== option) : [...(value || []), option]) : onChange(option)} /><span>{option}</span></label>; })}</fieldset>;
  else control = <input {...props} type={{ email: "email", phone: "tel", number: "number", date: "date" }[field.field_type] || "text"} maxLength={field.field_type === "short_text" ? 500 : undefined} placeholder={field.placeholder} />;
  const fullWidth = ["long_text", "select", "radio", "checkboxes"].includes(field.field_type) || field.label.length > 60;
  return <div className={`reg-field dynamic-public-field${fullWidth ? " reg-field-wide" : ""}`}><label htmlFor={field.field_type === "radio" || field.field_type === "checkboxes" ? undefined : props.id}>{field.label}{!field.required && <span> (optional)</span>}</label>{field.description && <p id={`dynamic-${field.id}-help`}>{field.description}</p>}{control}{error && <span className="reg-field-error" id={`dynamic-${field.id}-error`}>{error}</span>}</div>;
}

export default function DynamicFormPage({ slug, onBack, onOpenAdmin, onNavigateRegister }) {
  const [form, setForm] = useState(null); const [loading, setLoading] = useState(true); const [loadError, setLoadError] = useState("");
  const [values, setValues] = useState({}); const [errors, setErrors] = useState({}); const [submitting, setSubmitting] = useState(false); const [success, setSuccess] = useState(false);
  const successRef = useRef(null);
  const [animateIn, setAnimateIn] = useState(false);
  const closeTimer = useRef(null);
  const handleClose = useCallback(() => {
    if (closeTimer.current) return;
    setAnimateIn(false);
    closeTimer.current = setTimeout(onBack, 380);
  }, [onBack]);
  useEffect(() => {
    window.scrollTo({ top: 0, behavior: "instant" });
    const raf = requestAnimationFrame(() => setAnimateIn(true));
    return () => { cancelAnimationFrame(raf); clearTimeout(closeTimer.current); };
  }, []);
  useEffect(() => {
    const handleKeyDown = (event) => {
      if (event.key === "Escape" && !["INPUT", "TEXTAREA", "SELECT"].includes(event.target.tagName)) handleClose();
    };
    window.addEventListener("keydown", handleKeyDown);
    return () => window.removeEventListener("keydown", handleKeyDown);
  }, [handleClose]);
  useEffect(() => { let active = true; setLoading(true); readPublicForm(publicContent, slug).then((data) => { if (!active) return; setForm(data); setValues(Object.fromEntries((data?.form_fields || []).map((field) => [field.id, field.field_type === "checkboxes" ? [] : ""]))); }).catch((error) => active && setLoadError(error.message)).finally(() => active && setLoading(false)); return () => { active = false; }; }, [slug]);
  const fields = useMemo(() => form?.form_fields || [], [form]);
  const submit = async (event) => { event.preventDefault(); if (submitting) return; setLoadError(""); const nextErrors = validatePublicAnswers(fields, values); setErrors(nextErrors); if (Object.keys(nextErrors).length) { document.getElementById(`dynamic-${Object.keys(nextErrors)[0]}`)?.focus(); return; } setSubmitting(true); try { const result = await submitPublicForm(publicContent, slug, fields, values); if (Object.keys(result.errors).length) { setErrors(result.errors); return; } setSuccess(true); requestAnimationFrame(() => successRef.current?.focus()); } catch (error) { setLoadError(error.message); } finally { setSubmitting(false); } };
  return <div className={`reg-nav-overlay ${animateIn ? "is-visible" : ""} dynamic-form-page`}><div className="reg-nav-topography" aria-hidden="true"><svg viewBox="0 0 1440 900" fill="none" preserveAspectRatio="xMidYMid slice"><path d="M-100 200 C 200 150 400 350 700 250 C1000 150 1200 400 1600 300" stroke="rgba(37,99,235,.12)" strokeWidth="1.5"/><path d="M-80 320 C250 260 450 480 800 360 C1100 240 1300 520 1650 420" stroke="rgba(15,23,42,.06)" strokeWidth="1.5"/><path d="M-50 450 C300 380 500 600 850 480 C1150 360 1350 640 1700 550" stroke="rgba(37,99,235,.10)" strokeWidth="1.5"/></svg></div>
    <header className="reg-nav-header-bar"><div className="header-left"><a href="/" onClick={(event) => { event.preventDefault(); handleClose(); }} className="nav-brand-link" aria-label="RAI Robotics home"><img src="/RAI/club-icon-light.png" alt="RAI Robotics Logo" height="70" className="nav-brand-logo" /></a></div><div className="header-right"><button type="button" className="reg-btn-header-close" onClick={handleClose} aria-label="Return to website"><span className="dash-bar close-bar-1"/><span className="dash-bar close-bar-2"/></button></div></header>
    <main className="reg-nav-body"><div className="reg-nav-left-content">
      <section className="reg-application dynamic-form-shell" aria-labelledby={form ? "dynamic-form-title" : undefined}>
        {loading ? <div className="dynamic-form-message" role="status">Loading form…</div> : !form ? <div className="dynamic-form-message reg-intro"><h1>Form unavailable</h1><p className="reg-intro-copy">{loadError || "This form does not exist, is still a draft, or is no longer accepting responses."}</p><button type="button" className="reg-submit" onClick={handleClose}>Return to website</button></div> : <>
          <div className="reg-intro"><p className="reg-eyebrow">EST SAFI / ROBOTICS &amp; AI CLUB</p><h1 id="dynamic-form-title">{form.title}</h1>{form.description && <p className="reg-intro-copy">{form.description}</p>}</div>
          <div className="reg-season" role="status"><span className="reg-status-dot is-open" />{success ? "Response received" : "Responses open"}<span className="reg-season-year">{fields.length} {fields.length === 1 ? "question" : "questions"}</span></div>
          {success ? <div className="reg-success" ref={successRef} tabIndex="-1" role="status"><span className="reg-success-icon" aria-hidden="true">✓</span><h2>Response received.</h2><p>{form.success_message}</p><button className="reg-retry" type="button" onClick={() => { setSuccess(false); setValues(Object.fromEntries(fields.map((field) => [field.id, field.field_type === "checkboxes" ? [] : ""]))); }}>Submit another response</button></div> : <form className="reg-form dynamic-public-form" onSubmit={submit} noValidate aria-busy={submitting}><p className="reg-form-hint">All fields required unless marked optional.</p><fieldset disabled={submitting}><legend className="reg-sr-only">{form.title} questions</legend><div className="reg-form-grid">{fields.map((field) => <DynamicField key={field.id} field={field} value={values[field.id]} error={errors[field.id]} onChange={(value) => { setValues((current) => ({ ...current, [field.id]: value })); setErrors((current) => ({ ...current, [field.id]: "" })); }} />)}</div><button className="reg-submit" type="submit"><span>{submitting ? "Submitting…" : form.submit_button_label}</span><span aria-hidden="true">↗</span></button></fieldset>{loadError && <p className="reg-notice reg-submit-error" role="alert">{loadError}</p>}</form>}
        </>}
      </section>
    </div><div className="reg-nav-right-gallery"><div className="reg-nav-infinite-columns">{[[...NAV_GALLERY_COLUMN_ONE,...NAV_GALLERY_COLUMN_ONE],[...NAV_GALLERY_COLUMN_TWO,...NAV_GALLERY_COLUMN_TWO]].map((images,column) => <div className={`infinite-col ${column ? "col-down" : "col-up"}`} key={column}><div className="infinite-col-track">{images.map((image,index) => <div className="reg-nav-img-card" key={`${image.src}-${index}`}><div className="reg-nav-img-wrapper"><img src={image.src} alt={image.alt} loading="lazy" /></div></div>)}</div></div>)}</div></div></main>
    <Footer onOpenAdmin={onOpenAdmin} onNavigateRegister={onNavigateRegister} />
  </div>;
}
