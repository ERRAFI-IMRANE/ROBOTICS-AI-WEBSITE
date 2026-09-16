import React, { useEffect, useMemo, useRef, useState } from "react";
import { getYearOfStudyLabel } from "../../constants/registrationConstants";
import { INTERVIEW_QUESTIONS, interviewAnswersFromRegistration } from "../../lib/registrationInterview";
import { AdminConfirmDialog } from "./AdminActionFeedback";
import "./AdminRegistrations.css";

const REVIEW_STEP = INTERVIEW_QUESTIONS.length;

function AnswerList({ question, answer, onEdit }) {
  const answers = question.multiple ? answer : [answer];
  return (
    <section className="admin-interview-review-group">
      <div><small>{question.eyebrow}</small><button type="button" onClick={onEdit}>Edit</button></div>
      <ul>{answers.map((item) => <li key={item}>{item}</li>)}</ul>
    </section>
  );
}

export default function AdminInterviewWizard({ applicant, saving, onCancel, onDecision }) {
  const dialogRef = useRef(null);
  const decisionLock = useRef(false);
  const [step, setStep] = useState(0);
  const [answers, setAnswers] = useState(() => interviewAnswersFromRegistration(applicant));
  const [error, setError] = useState("");
  const [refusalOpen, setRefusalOpen] = useState(false);
  const [refusalReason, setRefusalReason] = useState(applicant.refusal_reason || "");
  const [isInteresting, setIsInteresting] = useState(applicant.interesting === true);
  const [confirmation, setConfirmation] = useState(null);
  const currentQuestion = INTERVIEW_QUESTIONS[step];
  const progress = step === REVIEW_STEP ? 100 : ((step + 1) / INTERVIEW_QUESTIONS.length) * 100;
  const appStatus = String(applicant.status || "pending").toLowerCase();
  const pendingDecision = appStatus === "pending";
  const interactionBusy = saving;

  useEffect(() => {
    const dialog = dialogRef.current;
    if (dialog && !dialog.open) dialog.showModal();
    return () => { if (dialog?.open) dialog.close(); };
  }, []);

  const currentAnswered = useMemo(() => {
    if (!currentQuestion) return true;
    const value = answers[currentQuestion.field];
    return currentQuestion.multiple ? Array.isArray(value) && value.length > 0 : Boolean(value);
  }, [answers, currentQuestion]);

  const choose = (question, option) => {
    setError("");
    setAnswers((current) => {
      if (!question.multiple) return { ...current, [question.field]: option };
      const selected = current[question.field] || [];
      return {
        ...current,
        [question.field]: selected.includes(option)
          ? selected.filter((item) => item !== option)
          : [...selected, option],
      };
    });
  };

  const next = () => {
    if (!currentAnswered) {
      setError("Choose at least one answer before continuing.");
      return;
    }
    setError("");
    setStep((current) => Math.min(REVIEW_STEP, current + 1));
  };

  const back = () => {
    setError("");
    setStep((current) => Math.max(0, current - 1));
  };

  const decide = (decision) => {
    if (interactionBusy || decisionLock.current || confirmation || !onDecision) return;
    if (decision === "refused" && !refusalOpen) {
      setRefusalOpen(true);
      setError("");
      return;
    }
    if (decision === "refused" && refusalReason.trim().length < 3) {
      setError("Enter a clear refusal reason before confirming.");
      return;
    }
    setError("");
    setConfirmation({
      title: decision === "accepted" ? "Accept this applicant?" : "Refuse this applicant?",
      message: `${applicant.full_name || "This applicant"} will be ${decision}. Interview answers and the ${isInteresting ? "Interesting" : "not Interesting"} choice will be saved together.${pendingDecision ? "" : " This updates the existing application decision."}`,
      confirmLabel: decision === "accepted" ? "Accept applicant" : "Confirm refusal",
      tone: decision === "refused" ? "danger" : "primary",
      decision,
    });
  };

  const runConfirmedDecision = async () => {
    if (!confirmation || interactionBusy || decisionLock.current) return;
    const decision = confirmation.decision;
    decisionLock.current = true;
    setConfirmation(null);
    setError("");
    try {
      await onDecision(answers, decision, refusalReason, isInteresting);
    } catch (decisionError) {
      setError(decisionError.message || "The final decision could not be saved. Your answers are still here.");
    } finally {
      decisionLock.current = false;
    }
  };

  return (
    <>
    <dialog
      ref={dialogRef}
      className="admin-interview-dialog"
      aria-labelledby="admin-interview-title"
      onCancel={(event) => { event.preventDefault(); if (!interactionBusy) onCancel(); }}
    >
      <div className="admin-interview-shell" aria-busy={interactionBusy}>
        <header className="admin-interview-header">
          <div className="admin-interview-heading-row">
            <div><p className="admin-eyebrow">Applicant interview</p><h2 id="admin-interview-title">{applicant.full_name || "Unnamed applicant"}</h2><p className="admin-interview-contact">{applicant.email || "No email"} <span aria-hidden="true">·</span> {applicant.phone || "No phone"}</p></div>
            <div className="admin-interview-heading-actions">
              <button type="button" className={`admin-interesting-toggle ${isInteresting ? "is-active" : ""}`} onClick={() => setIsInteresting((value) => !value)} disabled={interactionBusy} aria-pressed={isInteresting} title="Saved only when you confirm Accept or Refuse">
                {isInteresting ? "★ Interesting" : "☆ Mark as Interesting"}
              </button>
              <button type="button" className="admin-modal-close-btn" onClick={onCancel} disabled={interactionBusy} aria-label="Close interview">×</button>
            </div>
          </div>
          <div className="admin-interview-applicant">
            <span><small>Department</small><strong>{applicant.department || "Not specified"}</strong></span>
            <span><small>Filière</small><strong>{applicant.filiere || "Not specified"}</strong></span>
            <span><small>Study year</small><strong>{getYearOfStudyLabel(applicant.years_of_study) || applicant.years_of_study || "Not specified"}</strong></span>
            <span><small>Season</small><strong>{applicant.registration_season || "Not specified"}</strong></span>
          </div>
          <div className="admin-interview-state-row"><span className={`status-chip status-chip-${pendingDecision ? "warning" : appStatus === "accepted" ? "positive" : "critical"}`}>Application: {appStatus}</span><span className={`admin-interview-status ${applicant.interview_completed === true ? "is-complete" : ""}`}>{applicant.interview_completed === true ? "Interviewed" : "Not interviewed"}</span></div>
          <ol className="admin-interview-step-indicator" aria-label="Interview stages">{[...INTERVIEW_QUESTIONS.map((question) => question.eyebrow), "Review"].map((label, index) => <li key={label} className={step === index ? "is-current" : step > index ? "is-done" : ""} aria-current={step === index ? "step" : undefined}><span>{step > index ? "✓" : index + 1}</span><strong>{label}</strong></li>)}</ol>
          <div className="admin-interview-progress-copy"><span>{step === REVIEW_STEP ? "Final review" : `Question ${step + 1} of ${INTERVIEW_QUESTIONS.length}`}</span><b>{Math.round(progress)}%</b></div>
          <div className="admin-interview-progress" aria-hidden="true"><i style={{ width: `${progress}%` }} /></div>
        </header>

        <div className="admin-interview-viewport">
          <div className="admin-interview-track" style={{ transform: `translateX(-${step * 100}%)` }}>
            {INTERVIEW_QUESTIONS.map((question, index) => (
              <section key={question.field} className="admin-interview-step" aria-hidden={step !== index} inert={step !== index}>
                <div className="admin-interview-question-copy"><small>Step {index + 1}</small><h3>{question.question}</h3><p>{question.multiple ? "Select one or more answers." : "Select one answer."}</p></div>
                <fieldset className="admin-interview-options">
                  <legend className="sr-only">{question.question}</legend>
                  {question.options.map((option) => {
                    const value = answers[question.field];
                    const selected = question.multiple ? value.includes(option) : value === option;
                    return (
                      <label key={option} className={selected ? "is-selected" : ""}>
                        <input type={question.multiple ? "checkbox" : "radio"} name={question.field} checked={selected} onChange={() => choose(question, option)} disabled={interactionBusy} />
                        <i aria-hidden="true">{selected ? "✓" : ""}</i>
                        <span className="admin-interview-option-text">{option}</span>
                      </label>
                    );
                  })}
                </fieldset>
              </section>
            ))}

            <section className="admin-interview-step admin-interview-review" aria-hidden={step !== REVIEW_STEP} inert={step !== REVIEW_STEP}>
              <div className="admin-interview-question-copy"><small>Review</small><h3>Confirm the interview answers</h3><p>Review every answer before saving it to this registration.</p></div>
              <div className="admin-interview-review-list">
                {INTERVIEW_QUESTIONS.map((question, index) => <AnswerList key={question.field} question={question} answer={answers[question.field]} onEdit={() => setStep(index)} />)}
              </div>
              <div className="admin-interview-decision-panel">
                <div><small>Final decision</small><h4>Accept or refuse this application</h4><p>Interview answers, the decision, and the Interesting choice are saved together only after confirmation.</p><p>{isInteresting ? "★ Marked as Interesting" : "Not marked as Interesting"}</p>{!pendingDecision && <p>This application is currently {appStatus}. Confirming a decision updates it.</p>}</div>
                {refusalOpen && <label htmlFor="interview-refusal-reason">
                  <span>Reason for refusal</span>
                  <textarea id="interview-refusal-reason" required minLength="3" maxLength="2000" value={refusalReason} onChange={(event) => { setRefusalReason(event.target.value); setError(""); }} placeholder="Add a clear reason for refusing this application…" autoFocus disabled={interactionBusy} />
                  <small>{refusalReason.length} / 2000</small>
                </label>}
              </div>
            </section>
          </div>
        </div>

        <footer className="admin-interview-footer">
          <div className="admin-interview-error" role="alert" aria-live="assertive">{error}</div>
          <div className="admin-interview-actions">
            <button type="button" className="btn-secondary" onClick={back} disabled={interactionBusy || step === 0}>Back</button>
            {step < REVIEW_STEP
              ? <button type="button" className="btn-primary" onClick={next} disabled={interactionBusy}>Next</button>
              : <>
                    <button type="button" className="btn-secondary btn-danger" onClick={() => decide("refused")} disabled={interactionBusy}>{saving ? "Saving…" : refusalOpen ? "Confirm refusal" : "Refuse"}</button>
                    <button type="button" className="btn-primary" onClick={() => decide("accepted")} disabled={interactionBusy}>{saving ? "Saving…" : "Accept"}</button>
                  </>}
          </div>
        </footer>
      </div>
    </dialog>
    <AdminConfirmDialog confirmation={confirmation} busy={interactionBusy} onCancel={() => setConfirmation(null)} onConfirm={runConfirmedDecision} />
    </>
  );
}
