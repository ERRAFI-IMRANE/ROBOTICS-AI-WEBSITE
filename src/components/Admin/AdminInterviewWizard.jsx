import React, { useEffect, useMemo, useRef, useState } from "react";
import { getYearOfStudyLabel } from "../../constants/registrationConstants";
import { INTERVIEW_QUESTIONS, interviewAnswersFromRegistration } from "../../lib/registrationInterview";

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

export default function AdminInterviewWizard({ applicant, saving, onCancel, onSave, onDecision }) {
  const dialogRef = useRef(null);
  const [step, setStep] = useState(0);
  const [answers, setAnswers] = useState(() => interviewAnswersFromRegistration(applicant));
  const [error, setError] = useState("");
  const [refusalOpen, setRefusalOpen] = useState(false);
  const [refusalReason, setRefusalReason] = useState("");
  const currentQuestion = INTERVIEW_QUESTIONS[step];
  const progress = step === REVIEW_STEP ? 100 : ((step + 1) / INTERVIEW_QUESTIONS.length) * 100;
  const appStatus = String(applicant.status || "pending").toLowerCase();
  const pendingDecision = appStatus === "pending";

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

  const submit = async () => {
    if (saving) return;
    setError("");
    try {
      await onSave(answers);
    } catch (saveError) {
      setError(saveError.message || "The interview could not be saved. Your answers are still here.");
    }
  };

  const decide = async (decision) => {
    if (saving || !onDecision) return;
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
    try {
      await onDecision(answers, decision, refusalReason);
    } catch (decisionError) {
      setError(decisionError.message || "The final decision could not be saved. Your answers are still here.");
    }
  };

  return (
    <dialog
      ref={dialogRef}
      className="admin-interview-dialog"
      aria-labelledby="admin-interview-title"
      onCancel={(event) => { event.preventDefault(); if (!saving) onCancel(); }}
    >
      <div className="admin-interview-shell" aria-busy={saving}>
        <header className="admin-interview-header">
          <div className="admin-interview-heading-row">
            <div><p className="admin-eyebrow">Applicant interview</p><h2 id="admin-interview-title">{applicant.full_name || "Unnamed applicant"}</h2></div>
            <button type="button" className="admin-modal-close-btn" onClick={onCancel} disabled={saving} aria-label="Close interview">×</button>
          </div>
          <div className="admin-interview-applicant">
            <span><small>Department</small><strong>{applicant.department || "Not specified"}</strong></span>
            <span><small>Filière</small><strong>{applicant.filiere || "Not specified"}</strong></span>
            <span><small>Study year</small><strong>{getYearOfStudyLabel(applicant.years_of_study) || applicant.years_of_study || "Not specified"}</strong></span>
            <span><small>Status</small><strong className={`is-${appStatus}`}>{appStatus}</strong></span>
          </div>
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
                        <input type={question.multiple ? "checkbox" : "radio"} name={question.field} checked={selected} onChange={() => choose(question, option)} disabled={saving} />
                        <i aria-hidden="true">{selected ? "✓" : ""}</i>
                        <span>{option}</span>
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
              {pendingDecision && <div className="admin-interview-decision-panel">
                <div><small>Final decision</small><h4>Accept or refuse this application</h4><p>The interview and decision will be saved together.</p></div>
                {refusalOpen && <label htmlFor="interview-refusal-reason">
                  <span>Reason for refusal</span>
                  <textarea id="interview-refusal-reason" required minLength="3" maxLength="2000" value={refusalReason} onChange={(event) => { setRefusalReason(event.target.value); setError(""); }} placeholder="Add a clear reason for refusing this application…" autoFocus />
                  <small>{refusalReason.length} / 2000</small>
                </label>}
              </div>}
            </section>
          </div>
        </div>

        <footer className="admin-interview-footer">
          <div className="admin-interview-error" role="alert" aria-live="assertive">{error}</div>
          <div className="admin-interview-actions">
            <button type="button" className="btn-secondary" onClick={back} disabled={saving || step === 0}>Back</button>
            {step < REVIEW_STEP
              ? <button type="button" className="btn-primary" onClick={next} disabled={saving}>Next</button>
              : pendingDecision
                ? <>
                    <button type="button" className="btn-secondary btn-danger" onClick={() => decide("refused")} disabled={saving}>{saving ? "Saving…" : refusalOpen ? "Confirm refusal" : "Refuse"}</button>
                    <button type="button" className="btn-primary" onClick={() => decide("accepted")} disabled={saving}>{saving ? "Saving…" : "Accept"}</button>
                  </>
                : <button type="button" className="btn-primary" onClick={submit} disabled={saving}>{saving ? "Saving interview…" : "Save Interview"}</button>}
          </div>
        </footer>
      </div>
    </dialog>
  );
}
