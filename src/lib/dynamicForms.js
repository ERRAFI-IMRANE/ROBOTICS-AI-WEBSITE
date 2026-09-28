export const FORM_FIELD_TYPES = [
  { id: "short_text", label: "Short answer" },
  { id: "long_text", label: "Paragraph" },
  { id: "email", label: "Email" },
  { id: "phone", label: "Phone" },
  { id: "number", label: "Number" },
  { id: "date", label: "Date" },
  { id: "select", label: "Dropdown" },
  { id: "radio", label: "Single choice" },
  { id: "checkboxes", label: "Multiple choice" },
];

const choiceTypes = new Set(["select", "radio", "checkboxes"]);
const typeIds = new Set(FORM_FIELD_TYPES.map((type) => type.id));
export const isChoiceField = (type) => choiceTypes.has(type);

export function formSlug(value) {
  return String(value || "").normalize("NFD").replace(/[\u0300-\u036f]/g, "").toLowerCase()
    .replace(/[^a-z0-9]+/g, "-").replace(/^-+|-+$/g, "").slice(0, 80);
}

export function newFormField(type = "short_text") {
  return {
    id: crypto.randomUUID(), field_type: type, label: "Untitled question", description: "",
    placeholder: "", required: false, options: isChoiceField(type) ? ["Option 1"] : [],
  };
}

export function validateFormDraft(form, fields) {
  const title = String(form?.title || "").trim();
  const slug = formSlug(form?.slug);
  if (!title) throw new Error("Add a form title.");
  if (!slug) throw new Error("Add a valid form URL.");
  if (!Array.isArray(fields) || !fields.length) throw new Error("Add at least one question.");
  const normalizedFields = fields.map((field) => {
    const label = String(field.label || "").trim();
    if (!label) throw new Error("Every question needs a label.");
    if (!typeIds.has(field.field_type)) throw new Error(`“${label}” has an invalid field type.`);
    const options = isChoiceField(field.field_type)
      ? [...new Set((field.options || []).map((option) => String(option).trim()).filter(Boolean))] : [];
    if (isChoiceField(field.field_type) && !options.length) throw new Error(`Add an option to “${label}”.`);
    return { ...field, label, options, required: field.required === true };
  });
  return { form: { ...form, title, slug }, fields: normalizedFields };
}

export function validatePublicAnswers(fields, answers) {
  const errors = {};
  fields.forEach((field) => {
    const value = answers[field.id];
    const empty = Array.isArray(value) ? !value.length : !String(value ?? "").trim();
    if (field.required && empty) errors[field.id] = "This question is required.";
    if (!empty && field.field_type === "email" && !/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(String(value))) errors[field.id] = "Enter a valid email address.";
    if (!empty && field.field_type === "number" && !/^-?\d+(\.\d+)?$/.test(String(value))) errors[field.id] = "Enter a valid number.";
  });
  return errors;
}

const readCount = (value) => Array.isArray(value) ? Number(value[0]?.count || 0) : Number(value || 0);

export async function listAdminForms(client) {
  const { data, error } = await client.from("forms")
    .select("*,form_fields(count),form_submissions(count)").order("updated_at", { ascending: false });
  if (error) throw new Error(error.message || "Forms could not be loaded.");
  return (data || []).map((form) => ({ ...form, field_count: readCount(form.form_fields), response_count: readCount(form.form_submissions) }));
}

export async function readAdminForm(client, formId) {
  const [formResult, fieldResult] = await Promise.all([
    client.from("forms").select("*").eq("id", formId).single(),
    client.from("form_fields").select("*").eq("form_id", formId).order("position"),
  ]);
  if (formResult.error) throw new Error(formResult.error.message || "Form could not be loaded.");
  if (fieldResult.error) throw new Error(fieldResult.error.message || "Form questions could not be loaded.");
  return { form: formResult.data, fields: fieldResult.data || [] };
}

export async function saveAdminForm(client, form, fields) {
  const clean = validateFormDraft(form, fields);
  const { data, error } = await client.rpc("save_admin_form", {
    p_form_id: clean.form.id || null, p_slug: clean.form.slug, p_title: clean.form.title,
    p_description: clean.form.description || "", p_status: clean.form.status || "draft",
    p_submit_button_label: clean.form.submit_button_label || "Submit response",
    p_success_message: clean.form.success_message || "Your response has been submitted.",
    p_fields: clean.fields,
  });
  if (error) {
    if (error.code === "PGRST202") throw new Error("Run supabase/migration_dynamic_forms.sql in Supabase before creating forms.");
    throw new Error(error.message || "Form could not be saved.");
  }
  if (!data?.id) throw new Error("Supabase did not confirm the saved form.");
  return data;
}

export async function deleteAdminForm(client, formId) {
  const { data, error } = await client.from("forms").delete().eq("id", formId).select("id").maybeSingle();
  if (error) throw new Error(error.message || "Form could not be deleted.");
  if (String(data?.id) !== String(formId)) throw new Error("Supabase did not confirm the deleted form.");
}

export async function listFormResponses(client, formId) {
  const { data, error } = await client.from("form_submissions").select("id,answers,submitted_at").eq("form_id", formId).order("submitted_at", { ascending: false });
  if (error) throw new Error(error.message || "Responses could not be loaded.");
  return data || [];
}

export async function readPublicForm(client, slug) {
  const { data, error } = await client.from("forms")
    .select("id,slug,title,description,status,submit_button_label,success_message,form_fields(id,field_type,label,description,placeholder,required,options,position)")
    .eq("slug", slug).eq("status", "published").maybeSingle();
  if (error) throw new Error(error.message || "This form could not be loaded.");
  if (!data) return null;
  return { ...data, form_fields: [...(data.form_fields || [])].sort((a, b) => a.position - b.position) };
}

export async function submitPublicForm(client, slug, fields, answers) {
  const errors = validatePublicAnswers(fields, answers);
  if (Object.keys(errors).length) return { errors };
  const payload = Object.fromEntries(fields.map((field) => [field.id, answers[field.id] ?? (field.field_type === "checkboxes" ? [] : "")]));
  const { data, error } = await client.rpc("submit_public_form", { p_slug: slug, p_answers: payload });
  if (error) throw new Error(error.message || "Your response could not be submitted.");
  if (!data) throw new Error("Supabase did not confirm your response.");
  return { id: data, errors: {} };
}
