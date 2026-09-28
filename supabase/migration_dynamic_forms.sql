-- REVIEW AND RUN ONCE IN THE SUPABASE SQL EDITOR.
-- Dynamic public forms, fields, responses, validation, and Forms admin permission.
BEGIN;

CREATE EXTENSION IF NOT EXISTS pgcrypto;

CREATE TABLE IF NOT EXISTS public.forms (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  slug text NOT NULL UNIQUE,
  title text NOT NULL,
  description text NOT NULL DEFAULT '',
  status text NOT NULL DEFAULT 'draft' CHECK (status IN ('draft', 'published', 'closed')),
  submit_button_label text NOT NULL DEFAULT 'Submit response',
  success_message text NOT NULL DEFAULT 'Your response has been submitted.',
  created_by uuid DEFAULT auth.uid(),
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now(),
  CONSTRAINT forms_slug_format CHECK (slug ~ '^[a-z0-9]+(?:-[a-z0-9]+)*$'),
  CONSTRAINT forms_title_length CHECK (length(trim(title)) BETWEEN 1 AND 160),
  CONSTRAINT forms_description_length CHECK (length(description) <= 4000)
);

CREATE TABLE IF NOT EXISTS public.form_fields (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  form_id uuid NOT NULL REFERENCES public.forms(id) ON DELETE CASCADE,
  field_type text NOT NULL CHECK (field_type IN ('short_text', 'long_text', 'email', 'phone', 'number', 'date', 'select', 'radio', 'checkboxes')),
  label text NOT NULL CHECK (length(trim(label)) BETWEEN 1 AND 200),
  description text NOT NULL DEFAULT '' CHECK (length(description) <= 1000),
  placeholder text NOT NULL DEFAULT '' CHECK (length(placeholder) <= 300),
  required boolean NOT NULL DEFAULT false,
  options jsonb NOT NULL DEFAULT '[]'::jsonb CHECK (jsonb_typeof(options) = 'array'),
  position integer NOT NULL DEFAULT 0 CHECK (position BETWEEN 0 AND 999),
  created_at timestamptz NOT NULL DEFAULT now(),
  UNIQUE (form_id, position)
);

CREATE TABLE IF NOT EXISTS public.form_submissions (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  form_id uuid NOT NULL REFERENCES public.forms(id) ON DELETE CASCADE,
  answers jsonb NOT NULL CHECK (jsonb_typeof(answers) = 'object'),
  submitted_at timestamptz NOT NULL DEFAULT now()
);

CREATE INDEX IF NOT EXISTS form_fields_form_position_idx ON public.form_fields(form_id, position);
CREATE INDEX IF NOT EXISTS form_submissions_form_date_idx ON public.form_submissions(form_id, submitted_at DESC);

CREATE OR REPLACE FUNCTION public.touch_dynamic_form()
RETURNS trigger LANGUAGE plpgsql SET search_path = '' AS $$
BEGIN NEW.updated_at = now(); RETURN NEW; END;
$$;
DROP TRIGGER IF EXISTS forms_touch_updated_at ON public.forms;
CREATE TRIGGER forms_touch_updated_at BEFORE UPDATE ON public.forms
FOR EACH ROW EXECUTE FUNCTION public.touch_dynamic_form();

ALTER TABLE public.forms ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.form_fields ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.form_submissions ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS dynamic_forms_public_read ON public.forms;
DROP POLICY IF EXISTS dynamic_forms_authenticated_read ON public.forms;
DROP POLICY IF EXISTS dynamic_forms_admin_manage ON public.forms;
CREATE POLICY dynamic_forms_public_read ON public.forms FOR SELECT TO anon USING (status = 'published');
CREATE POLICY dynamic_forms_authenticated_read ON public.forms FOR SELECT TO authenticated
USING (status = 'published' OR public.has_club_permission('forms'));
CREATE POLICY dynamic_forms_admin_manage ON public.forms FOR ALL TO authenticated
USING (public.has_club_permission('forms')) WITH CHECK (public.has_club_permission('forms'));

DROP POLICY IF EXISTS dynamic_fields_public_read ON public.form_fields;
DROP POLICY IF EXISTS dynamic_fields_authenticated_read ON public.form_fields;
DROP POLICY IF EXISTS dynamic_fields_admin_manage ON public.form_fields;
CREATE POLICY dynamic_fields_public_read ON public.form_fields FOR SELECT TO anon
USING (EXISTS (SELECT 1 FROM public.forms f WHERE f.id = form_id AND f.status = 'published'));
CREATE POLICY dynamic_fields_authenticated_read ON public.form_fields FOR SELECT TO authenticated
USING (EXISTS (SELECT 1 FROM public.forms f WHERE f.id = form_id AND (f.status = 'published' OR public.has_club_permission('forms'))));
CREATE POLICY dynamic_fields_admin_manage ON public.form_fields FOR ALL TO authenticated
USING (public.has_club_permission('forms')) WITH CHECK (public.has_club_permission('forms'));

DROP POLICY IF EXISTS dynamic_submissions_admin_read ON public.form_submissions;
CREATE POLICY dynamic_submissions_admin_read ON public.form_submissions FOR SELECT TO authenticated
USING (public.has_club_permission('forms'));

GRANT SELECT ON public.forms, public.form_fields TO anon, authenticated;
GRANT INSERT, UPDATE, DELETE ON public.forms, public.form_fields TO authenticated;
GRANT SELECT ON public.form_submissions TO authenticated;
REVOKE INSERT, UPDATE, DELETE ON public.forms, public.form_fields FROM anon;
REVOKE SELECT, INSERT, UPDATE, DELETE ON public.form_submissions FROM anon;
REVOKE INSERT, UPDATE, DELETE ON public.form_submissions FROM authenticated;

CREATE OR REPLACE FUNCTION public.save_admin_form(
  p_form_id uuid,
  p_slug text,
  p_title text,
  p_description text,
  p_status text,
  p_submit_button_label text,
  p_success_message text,
  p_fields jsonb
) RETURNS public.forms
LANGUAGE plpgsql SECURITY DEFINER SET search_path = public, pg_temp AS $$
DECLARE saved public.forms; field jsonb; field_options jsonb; field_id uuid; field_position integer := 0;
BEGIN
  IF NOT public.has_club_permission('forms') THEN RAISE EXCEPTION 'Forms permission required'; END IF;
  p_slug := lower(trim(p_slug));
  IF p_slug !~ '^[a-z0-9]+(?:-[a-z0-9]+)*$' THEN RAISE EXCEPTION 'Use lowercase letters, numbers, and hyphens for the form URL'; END IF;
  IF length(trim(coalesce(p_title, ''))) NOT BETWEEN 1 AND 160 THEN RAISE EXCEPTION 'Form title is required'; END IF;
  IF p_status NOT IN ('draft', 'published', 'closed') THEN RAISE EXCEPTION 'Invalid form status'; END IF;
  IF jsonb_typeof(p_fields) <> 'array' OR jsonb_array_length(p_fields) NOT BETWEEN 1 AND 100 THEN RAISE EXCEPTION 'Add between 1 and 100 fields'; END IF;

  IF p_form_id IS NULL THEN
    INSERT INTO public.forms(slug,title,description,status,submit_button_label,success_message,created_by)
    VALUES(p_slug,trim(p_title),left(coalesce(p_description,''),4000),p_status,left(coalesce(nullif(trim(p_submit_button_label),''),'Submit response'),80),left(coalesce(nullif(trim(p_success_message),''),'Your response has been submitted.'),1000),auth.uid()) RETURNING * INTO saved;
  ELSE
    UPDATE public.forms SET slug=p_slug,title=trim(p_title),description=left(coalesce(p_description,''),4000),status=p_status,
      submit_button_label=left(coalesce(nullif(trim(p_submit_button_label),''),'Submit response'),80),success_message=left(coalesce(nullif(trim(p_success_message),''),'Your response has been submitted.'),1000)
    WHERE id=p_form_id RETURNING * INTO saved;
    IF saved.id IS NULL THEN RAISE EXCEPTION 'Form not found'; END IF;
    DELETE FROM public.form_fields WHERE form_id=saved.id;
  END IF;

  FOR field IN SELECT value FROM jsonb_array_elements(p_fields) LOOP
    IF field->>'field_type' NOT IN ('short_text','long_text','email','phone','number','date','select','radio','checkboxes') THEN RAISE EXCEPTION 'Invalid field type'; END IF;
    IF length(trim(coalesce(field->>'label',''))) NOT BETWEEN 1 AND 200 THEN RAISE EXCEPTION 'Every field needs a label'; END IF;
    field_options := coalesce(field->'options','[]'::jsonb);
    IF jsonb_typeof(field_options) <> 'array' THEN RAISE EXCEPTION 'Field options must be a list'; END IF;
    IF jsonb_array_length(field_options) > 100 OR EXISTS (SELECT 1 FROM jsonb_array_elements(field_options) AS option(value) WHERE jsonb_typeof(value) <> 'string' OR length(trim(value#>>'{}')) NOT BETWEEN 1 AND 200) THEN RAISE EXCEPTION 'Options must be short, non-empty text values'; END IF;
    IF field->>'field_type' IN ('select','radio','checkboxes') AND jsonb_array_length(field_options) < 1 THEN RAISE EXCEPTION 'Choice fields need at least one option'; END IF;
    BEGIN field_id := nullif(field->>'id','')::uuid; EXCEPTION WHEN invalid_text_representation THEN field_id := gen_random_uuid(); END;
    field_id := coalesce(field_id, gen_random_uuid());
    INSERT INTO public.form_fields(id,form_id,field_type,label,description,placeholder,required,options,position)
    VALUES(field_id,saved.id,field->>'field_type',trim(field->>'label'),left(coalesce(field->>'description',''),1000),left(coalesce(field->>'placeholder',''),300),coalesce((field->>'required')::boolean,false),field_options,field_position);
    field_position := field_position + 1;
  END LOOP;
  RETURN saved;
END;
$$;

CREATE OR REPLACE FUNCTION public.submit_public_form(p_slug text, p_answers jsonb)
RETURNS uuid LANGUAGE plpgsql SECURITY DEFINER SET search_path = public, pg_temp AS $$
DECLARE target public.forms; field public.form_fields; answer jsonb; submission_id uuid; option_value jsonb;
BEGIN
  SELECT * INTO target FROM public.forms WHERE slug=lower(trim(p_slug)) AND status='published' FOR SHARE;
  IF target.id IS NULL THEN RAISE EXCEPTION 'This form is not accepting responses'; END IF;
  IF jsonb_typeof(p_answers) <> 'object' OR pg_column_size(p_answers) > 100000 THEN RAISE EXCEPTION 'Invalid form response'; END IF;
  IF EXISTS (SELECT 1 FROM jsonb_object_keys(p_answers) AS answer_key(key) WHERE NOT EXISTS (SELECT 1 FROM public.form_fields ff WHERE ff.form_id=target.id AND ff.id::text=key)) THEN RAISE EXCEPTION 'The response contains an unknown field'; END IF;

  FOR field IN SELECT * FROM public.form_fields WHERE form_id=target.id ORDER BY position LOOP
    answer := p_answers->(field.id::text);
    IF field.required AND (answer IS NULL OR answer='null'::jsonb OR answer='""'::jsonb OR answer='[]'::jsonb) THEN RAISE EXCEPTION 'Answer required: %', field.label; END IF;
    IF answer IS NULL OR answer='null'::jsonb OR answer='""'::jsonb OR answer='[]'::jsonb THEN CONTINUE; END IF;
    IF field.field_type='checkboxes' THEN
      IF jsonb_typeof(answer)<>'array' THEN RAISE EXCEPTION 'Invalid answer: %',field.label; END IF;
      FOR option_value IN SELECT value FROM jsonb_array_elements(answer) LOOP
        IF NOT field.options @> jsonb_build_array(option_value) THEN RAISE EXCEPTION 'Invalid option: %',field.label; END IF;
      END LOOP;
    ELSE
      IF jsonb_typeof(answer)<>'string' AND field.field_type<>'number' THEN RAISE EXCEPTION 'Invalid answer: %',field.label; END IF;
      IF (field.field_type='long_text' AND length(trim(answer#>>'{}')) > 4000)
        OR (field.field_type<>'long_text' AND length(trim(answer#>>'{}')) > 500)
      THEN RAISE EXCEPTION 'Answer too long: %',field.label; END IF;
      IF field.field_type IN ('select','radio') AND NOT field.options @> jsonb_build_array(to_jsonb(answer#>>'{}')) THEN RAISE EXCEPTION 'Invalid option: %',field.label; END IF;
      IF field.field_type='email' AND (answer#>>'{}') !~* '^[^[:space:]@]+@[^[:space:]@]+[.][^[:space:]@]+$' THEN RAISE EXCEPTION 'Invalid email address'; END IF;
      IF field.field_type='number' AND (answer#>>'{}') !~ '^-?[0-9]+([.][0-9]+)?$' THEN RAISE EXCEPTION 'Invalid number'; END IF;
    END IF;
  END LOOP;
  INSERT INTO public.form_submissions(form_id,answers) VALUES(target.id,p_answers) RETURNING id INTO submission_id;
  RETURN submission_id;
END;
$$;

REVOKE ALL ON FUNCTION public.save_admin_form(uuid,text,text,text,text,text,text,jsonb) FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION public.save_admin_form(uuid,text,text,text,text,text,text,jsonb) TO authenticated;
REVOKE ALL ON FUNCTION public.submit_public_form(text,jsonb) FROM PUBLIC;
GRANT EXECUTE ON FUNCTION public.submit_public_form(text,jsonb) TO anon, authenticated;

COMMIT;
