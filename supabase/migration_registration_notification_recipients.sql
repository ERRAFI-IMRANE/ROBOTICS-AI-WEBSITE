-- Run after migration_registration_acceptance_notifications.sql as database owner.
RESET ROLE;
BEGIN;

CREATE TABLE IF NOT EXISTS public.registration_notification_recipients (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  email text NOT NULL CHECK (email ~* '^[^[:space:]@]+@[^[:space:]@]+\.[^[:space:]@]+$'),
  label text CHECK (label IS NULL OR length(label) <= 100),
  is_active boolean NOT NULL DEFAULT true,
  created_by uuid NOT NULL DEFAULT auth.uid(),
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now()
);
CREATE UNIQUE INDEX IF NOT EXISTS registration_notification_recipient_email_unique
  ON public.registration_notification_recipients(lower(email));
ALTER TABLE public.registration_notification_recipients ENABLE ROW LEVEL SECURITY;
REVOKE ALL ON public.registration_notification_recipients FROM anon, authenticated;
GRANT SELECT ON public.registration_notification_recipients TO authenticated;
DROP POLICY IF EXISTS registration_notification_recipients_read ON public.registration_notification_recipients;
CREATE POLICY registration_notification_recipients_read
  ON public.registration_notification_recipients FOR SELECT TO authenticated
  USING (public.has_club_permission('registrations'));

CREATE OR REPLACE FUNCTION public.save_registration_notification_recipient(
  p_id uuid, p_email text, p_label text DEFAULT NULL, p_is_active boolean DEFAULT true
) RETURNS jsonb LANGUAGE plpgsql SECURITY DEFINER SET search_path = '' AS $$
DECLARE saved public.registration_notification_recipients%ROWTYPE;
BEGIN
  IF NOT coalesce(public.has_club_permission('registrations'), false) THEN
    RAISE EXCEPTION 'Registrations permission required';
  END IF;
  IF trim(coalesce(p_email, '')) !~* '^[^[:space:]@]+@[^[:space:]@]+\.[^[:space:]@]+$' THEN
    RAISE EXCEPTION 'Enter a valid notification email';
  END IF;
  IF length(coalesce(p_label, '')) > 100 THEN RAISE EXCEPTION 'Recipient label is too long'; END IF;
  IF p_id IS NULL THEN
    INSERT INTO public.registration_notification_recipients(email, label, is_active, created_by)
    VALUES (lower(trim(p_email)), nullif(trim(p_label), ''), coalesce(p_is_active, true), auth.uid())
    RETURNING * INTO saved;
  ELSE
    UPDATE public.registration_notification_recipients
    SET email = lower(trim(p_email)), label = nullif(trim(p_label), ''),
      is_active = coalesce(p_is_active, true), updated_at = now()
    WHERE id = p_id RETURNING * INTO saved;
    IF NOT FOUND THEN RAISE EXCEPTION 'Notification recipient no longer exists'; END IF;
  END IF;
  RETURN to_jsonb(saved);
EXCEPTION WHEN unique_violation THEN RAISE EXCEPTION 'This notification email already exists';
END;
$$;

CREATE OR REPLACE FUNCTION public.delete_registration_notification_recipient(p_id uuid)
RETURNS uuid LANGUAGE plpgsql SECURITY DEFINER SET search_path = '' AS $$
BEGIN
  IF NOT coalesce(public.has_club_permission('registrations'), false) THEN
    RAISE EXCEPTION 'Registrations permission required';
  END IF;
  DELETE FROM public.registration_notification_recipients WHERE id = p_id;
  IF NOT FOUND THEN RAISE EXCEPTION 'Notification recipient no longer exists'; END IF;
  RETURN p_id;
END;
$$;

REVOKE EXECUTE ON FUNCTION public.save_registration_notification_recipient(uuid,text,text,boolean) FROM PUBLIC, anon;
REVOKE EXECUTE ON FUNCTION public.delete_registration_notification_recipient(uuid) FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION public.save_registration_notification_recipient(uuid,text,text,boolean) TO authenticated;
GRANT EXECUTE ON FUNCTION public.delete_registration_notification_recipient(uuid) TO authenticated;
NOTIFY pgrst, 'reload schema';
COMMIT;
