import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import { deleteAdminForm, FORM_FIELD_TYPES, formSlug, isChoiceField, listAdminForms, listFormResponses, newFormField, readAdminForm, saveAdminForm, validateFormDraft } from "../../lib/dynamicForms";
import { supabase } from "../../lib/supabaseClient";
import { AdminConfirmDialog, AdminToast } from "./AdminActionFeedback";
import { useAdminToast } from "./useAdminToast";
import "./AdminForms.css";

const emptyForm = () => ({ title: "", slug: "", description: "", status: "draft", submit_button_label: "Submit response", success_message: "Your response has been submitted." });
const publicUrl = (slug) => `${window.location.origin}/forms/${slug}`;

function FieldEditor({ field, index, count, onChange, onMove, onRemove }) {
  const patch = (values) => onChange(index, { ...field, ...values });
  return <article className="admin-form-field-card">
    <div className="admin-form-field-order"><span>{index + 1}</span><div><button type="button" onClick={() => onMove(index, -1)} disabled={index === 0} aria-label="Move question up">↑</button><button type="button" onClick={() => onMove(index, 1)} disabled={index === count - 1} aria-label="Move question down">↓</button></div></div>
    <div className="admin-form-field-main">
      <label>Question<input className="form-text-input" value={field.label} maxLength="200" onChange={(event) => patch({ label: event.target.value })} /></label>
      <label>Field type<select className="form-select-input" value={field.field_type} onChange={(event) => { const type = event.target.value; patch({ field_type: type, options: isChoiceField(type) ? (field.options?.length ? field.options : ["Option 1"]) : [] }); }}>{FORM_FIELD_TYPES.map((type) => <option key={type.id} value={type.id}>{type.label}</option>)}</select></label>
      <label className="admin-form-wide">Help text <span>(optional)</span><input className="form-text-input" value={field.description || ""} maxLength="1000" onChange={(event) => patch({ description: event.target.value })} placeholder="Give respondents extra context" /></label>
      {!isChoiceField(field.field_type) && <label className="admin-form-wide">Placeholder <span>(optional)</span><input className="form-text-input" value={field.placeholder || ""} maxLength="300" onChange={(event) => patch({ placeholder: event.target.value })} /></label>}
      {isChoiceField(field.field_type) && <div className="admin-form-options admin-form-wide"><span>Options</span>{(field.options || []).map((option, optionIndex) => <div key={optionIndex}><input className="form-text-input" value={option} maxLength="200" aria-label={`Option ${optionIndex + 1}`} onChange={(event) => patch({ options: field.options.map((item, itemIndex) => itemIndex === optionIndex ? event.target.value : item) })} /><button type="button" onClick={() => patch({ options: field.options.filter((_, itemIndex) => itemIndex !== optionIndex) })} disabled={field.options.length === 1} aria-label={`Remove option ${optionIndex + 1}`}>×</button></div>)}<button type="button" className="admin-form-add-option" onClick={() => patch({ options: [...field.options, `Option ${field.options.length + 1}`] })}>+ Add option</button></div>}
      <label className="admin-form-required"><input type="checkbox" checked={field.required} onChange={(event) => patch({ required: event.target.checked })} />Required</label>
    </div>
    <button type="button" className="admin-form-remove-field" onClick={() => onRemove(index)} disabled={count === 1}>Remove</button>
  </article>;
}

function FormEditor({ initial, busy, onClose, onSave }) {
  const [form, setForm] = useState(initial.form);
  const [fields, setFields] = useState(initial.fields);
  const [error, setError] = useState("");
  const titleEdited = useRef(Boolean(initial.form.slug));
  const setTitle = (title) => setForm((current) => ({ ...current, title, slug: titleEdited.current ? current.slug : formSlug(title) }));
  const changeField = (index, field) => setFields((current) => current.map((item, itemIndex) => itemIndex === index ? field : item));
  const moveField = (index, direction) => setFields((current) => { const next = [...current]; const target = index + direction; [next[index], next[target]] = [next[target], next[index]]; return next; });
  const save = async (event) => { event.preventDefault(); setError(""); try { await onSave(form, fields); } catch (saveError) { setError(saveError.message); } };
  return <div className="admin-form-editor-overlay" role="presentation" onMouseDown={(event) => { if (event.target === event.currentTarget && !busy) onClose(); }}>
    <form className="admin-form-editor" role="dialog" aria-modal="true" aria-labelledby="admin-form-editor-title" onSubmit={save}>
      <header><div><h2 id="admin-form-editor-title">{form.id ? "Edit form" : "Create a form"}</h2><p>Build the questions, choose the public URL, then publish when ready.</p></div><button type="button" onClick={onClose} disabled={busy} aria-label="Close form editor">×</button></header>
      <div className="admin-form-editor-scroll">
        <section className="admin-form-basics">
          <label>Form title<input className="form-text-input" value={form.title} maxLength="160" autoFocus onChange={(event) => setTitle(event.target.value)} placeholder="Workshop registration" /></label>
          <label>Public URL<div className="admin-form-slug-input"><span>/forms/</span><input value={form.slug} maxLength="80" onChange={(event) => { titleEdited.current = true; setForm((current) => ({ ...current, slug: formSlug(event.target.value) })); }} /></div></label>
          <label className="admin-form-wide">Description<textarea className="form-text-input" rows="3" maxLength="4000" value={form.description} onChange={(event) => setForm((current) => ({ ...current, description: event.target.value }))} placeholder="Explain what this form is for." /></label>
          <label>Status<select className="form-select-input" value={form.status} onChange={(event) => setForm((current) => ({ ...current, status: event.target.value }))}><option value="draft">Draft — private</option><option value="published">Published — accepting responses</option><option value="closed">Closed — visible to admins only</option></select></label>
          <label>Submit button<input className="form-text-input" maxLength="80" value={form.submit_button_label} onChange={(event) => setForm((current) => ({ ...current, submit_button_label: event.target.value }))} /></label>
          <label className="admin-form-wide">Success message<input className="form-text-input" maxLength="1000" value={form.success_message} onChange={(event) => setForm((current) => ({ ...current, success_message: event.target.value }))} /></label>
        </section>
        <div className="admin-form-question-heading"><div><h3>Questions</h3><p>{fields.length} field{fields.length === 1 ? "" : "s"}</p></div><select aria-label="Add a question" defaultValue="" onChange={(event) => { if (event.target.value) setFields((current) => [...current, newFormField(event.target.value)]); event.target.value = ""; }}><option value="" disabled>+ Add question</option>{FORM_FIELD_TYPES.map((type) => <option key={type.id} value={type.id}>{type.label}</option>)}</select></div>
        <div className="admin-form-fields">{fields.map((field, index) => <FieldEditor key={field.id} field={field} index={index} count={fields.length} onChange={changeField} onMove={moveField} onRemove={(fieldIndex) => setFields((current) => current.filter((_, index) => index !== fieldIndex))} />)}</div>
        {error && <p className="admin-inline-error" role="alert">{error}</p>}
      </div>
      <footer><button type="button" className="btn-secondary" onClick={onClose} disabled={busy}>Cancel</button><button type="submit" className="btn-primary" disabled={busy}>{busy ? "Saving…" : "Save form"}</button></footer>
    </form>
  </div>;
}

function Responses({ form, fields, responses, loading, onBack }) {
  const labelFor = (id) => fields.find((field) => field.id === id)?.label || "Removed question";
  const valueText = (value) => Array.isArray(value) ? value.join(", ") : String(value || "—");
  return <div className="admin-tab-content admin-forms-page"><div className="admin-view-header"><div><h1 className="admin-page-title">{form.title}</h1><p className="admin-page-desc">{responses.length} saved response{responses.length === 1 ? "" : "s"}</p></div><button type="button" className="btn-secondary" onClick={onBack}>← Back to forms</button></div>
    {loading ? <div className="admin-panel admin-empty-state">Loading responses…</div> : !responses.length ? <div className="admin-panel admin-empty-state">No responses yet. Publish and share this form to start collecting answers.</div> : <div className="admin-form-response-list">{responses.map((response, index) => <article className="admin-panel admin-form-response" key={response.id}><header><strong>Response {responses.length - index}</strong><time dateTime={response.submitted_at}>{new Date(response.submitted_at).toLocaleString()}</time></header><dl>{Object.entries(response.answers || {}).map(([fieldId, value]) => <div key={fieldId}><dt>{labelFor(fieldId)}</dt><dd>{valueText(value)}</dd></div>)}</dl></article>)}</div>}
  </div>;
}

export default function AdminForms() {
  const [forms, setForms] = useState([]); const [loading, setLoading] = useState(true); const [busy, setBusy] = useState(false);
  const [error, setError] = useState(""); const [editor, setEditor] = useState(null); const [responseView, setResponseView] = useState(null); const [confirmation, setConfirmation] = useState(null);
  const { toast, showToast, clearToast } = useAdminToast();
  const load = useCallback(async () => { setLoading(true); setError(""); try { setForms(await listAdminForms(supabase)); } catch (err) { setError(err.message); } finally { setLoading(false); } }, []);
  useEffect(() => { load(); }, [load]);
  const openEdit = async (form) => { setBusy(true); try { setEditor(await readAdminForm(supabase, form.id)); } catch (err) { showToast(err.message, "error"); } finally { setBusy(false); } };
  const persist = async (form, fields) => { setBusy(true); try { await saveAdminForm(supabase, form, fields); setEditor(null); showToast("Form saved successfully."); await load(); } catch (err) { showToast(err.message, "error"); } finally { setBusy(false); } };
  const requestSave = async (form, fields) => { const clean = validateFormDraft(form, fields); setConfirmation({ title: clean.form.id ? "Save these form changes?" : "Create this form?", message: clean.form.status === "published" ? `“${clean.form.title}” will be live at /forms/${clean.form.slug}.` : `“${clean.form.title}” will be saved as ${clean.form.status}.`, confirmLabel: clean.form.id ? "Save form" : "Create form", action: () => persist(clean.form, clean.fields) }); };
  const openResponses = async (form) => { setResponseView({ form, fields: [], responses: [], loading: true }); try { const [{ fields }, responses] = await Promise.all([readAdminForm(supabase, form.id), listFormResponses(supabase, form.id)]); setResponseView({ form, fields, responses, loading: false }); } catch (err) { setResponseView(null); showToast(err.message, "error"); } };
  const remove = (form) => setConfirmation({ title: "Delete this form?", message: `Delete “${form.title}” and all of its saved responses? This cannot be undone.`, confirmLabel: "Delete form", tone: "danger", action: async () => { setBusy(true); try { await deleteAdminForm(supabase, form.id); showToast("Form deleted."); await load(); } catch (err) { showToast(err.message, "error"); } finally { setBusy(false); } } });
  const counts = useMemo(() => ({ published: forms.filter((form) => form.status === "published").length, responses: forms.reduce((sum, form) => sum + form.response_count, 0) }), [forms]);
  if (responseView) return <Responses {...responseView} onBack={() => setResponseView(null)} />;
  return <div className="admin-tab-content admin-forms-page"><AdminToast toast={toast} onClose={clearToast} />
    <div className="admin-view-header"><div><h1 className="admin-page-title">Forms</h1><p className="admin-page-desc">Create shareable forms and collect responses on the club website.</p></div><div className="admin-header-actions"><button className="btn-secondary" type="button" onClick={load} disabled={loading || busy}>Refresh</button><button className="btn-primary" type="button" onClick={() => setEditor({ form: emptyForm(), fields: [newFormField()] })} disabled={busy}>+ Create form</button></div></div>
    <div className="admin-form-stats"><span><strong>{forms.length}</strong>Total forms</span><span><strong>{counts.published}</strong>Published</span><span><strong>{counts.responses}</strong>Responses</span></div>
    {error && <div className="admin-inline-error" role="alert">{error}</div>}
    <div className="admin-forms-grid">{loading ? [1,2,3].map((item) => <div className="admin-panel admin-form-card is-loading" key={item}><span className="skeleton-shimmer skeleton-line" /></div>) : forms.map((form) => <article className="admin-panel admin-form-card" key={form.id}><header><span className={`admin-form-status is-${form.status}`}>{form.status}</span><span>{form.field_count} questions</span></header><h2>{form.title}</h2><p>{form.description || "No description added."}</p><div className="admin-form-card-meta"><strong>{form.response_count}</strong><span>responses</span><time dateTime={form.updated_at}>Updated {new Date(form.updated_at).toLocaleDateString()}</time></div><div className="admin-form-card-actions"><button type="button" className="btn-secondary" onClick={() => openEdit(form)} disabled={busy}>Edit</button><button type="button" className="btn-secondary" onClick={() => openResponses(form)} disabled={busy}>Responses</button>{form.status === "published" && <a className="btn-secondary" href={`/forms/${form.slug}`} target="_blank" rel="noreferrer">Open ↗</a>}<button type="button" className="btn-secondary btn-danger" onClick={() => remove(form)} disabled={busy}>Delete</button></div>{form.status === "published" && <button className="admin-form-copy-link" type="button" onClick={() => navigator.clipboard.writeText(publicUrl(form.slug)).then(() => showToast("Public form link copied."), () => showToast("Could not copy the link.", "error"))}>{publicUrl(form.slug)}</button>}</article>)}
      {!loading && !forms.length && <div className="admin-panel admin-empty-state">No forms yet. Create your first form and add the questions you need.</div>}
    </div>
    {editor && <FormEditor initial={editor} busy={busy} onClose={() => !busy && setEditor(null)} onSave={requestSave} />}
    <AdminConfirmDialog confirmation={confirmation} busy={busy} onCancel={() => setConfirmation(null)} onConfirm={async () => { const action = confirmation?.action; setConfirmation(null); await action?.(); }} />
  </div>;
}
