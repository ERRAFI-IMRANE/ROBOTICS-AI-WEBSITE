-- Run once in the Supabase SQL editor after the registration/admin migrations.
RESET ROLE;
BEGIN;

-- Delivery metadata only. Applicant details remain in public.registrations.
CREATE TABLE IF NOT EXISTS public.registration_acceptance_notifications (
  registration_id bigint PRIMARY KEY REFERENCES public.registrations(id) ON DELETE CASCADE,
  status text NOT NULL DEFAULT 'pending'
    CHECK (status IN ('pending', 'sending', 'sent', 'failed', 'not_configured')),
  claim_token uuid,
  claimed_at timestamptz,
  sent_at timestamptz,
  message_id text,
  last_error text,
  created_at timestamptz NOT NULL DEFAULT now()
);

ALTER TABLE public.registration_acceptance_notifications ENABLE ROW LEVEL SECURITY;
REVOKE ALL ON public.registration_acceptance_notifications FROM anon, authenticated;
GRANT SELECT (registration_id, status, last_error) ON public.registration_acceptance_notifications TO authenticated;
DROP POLICY IF EXISTS registration_notifications_admin_read ON public.registration_acceptance_notifications;
CREATE POLICY registration_notifications_admin_read
  ON public.registration_acceptance_notifications FOR SELECT TO authenticated
  USING (public.has_club_permission('registrations'));

CREATE OR REPLACE FUNCTION public.queue_registration_acceptance_notification()
RETURNS trigger
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = ''
AS $$
BEGIN
  INSERT INTO public.registration_acceptance_notifications (registration_id)
  VALUES (NEW.id) ON CONFLICT (registration_id) DO NOTHING;
  RETURN NEW;
END;
$$;

DROP TRIGGER IF EXISTS registration_acceptance_notification ON public.registrations;
CREATE TRIGGER registration_acceptance_notification
  AFTER UPDATE OF status ON public.registrations
  FOR EACH ROW
  WHEN (NEW.status = 'accepted' AND OLD.status IS DISTINCT FROM NEW.status)
  EXECUTE FUNCTION public.queue_registration_acceptance_notification();

CREATE OR REPLACE FUNCTION public.claim_registration_acceptance_notification(p_registration_id bigint)
RETURNS jsonb
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = ''
AS $$
DECLARE
  applicant public.registrations%ROWTYPE;
  notification public.registration_acceptance_notifications%ROWTYPE;
  token uuid;
BEGIN
  IF NOT coalesce(public.has_club_permission('registrations'), false) THEN
    RAISE EXCEPTION 'Registration permission required';
  END IF;
  SELECT * INTO applicant FROM public.registrations WHERE id = p_registration_id FOR UPDATE;
  IF NOT FOUND OR applicant.status IS DISTINCT FROM 'accepted' THEN
    RAISE EXCEPTION 'Only accepted applicants can be notified';
  END IF;

  -- Explicit retries also work for accepted applicants predating this migration.
  INSERT INTO public.registration_acceptance_notifications (registration_id)
  VALUES (applicant.id) ON CONFLICT (registration_id) DO NOTHING;
  SELECT * INTO notification FROM public.registration_acceptance_notifications
  WHERE registration_id = applicant.id FOR UPDATE;

  IF notification.status = 'sent' THEN
    RETURN jsonb_build_object('status', 'sent', 'already_sent', true);
  END IF;
  IF notification.status = 'sending' AND notification.claimed_at > now() - interval '5 minutes' THEN
    RETURN jsonb_build_object('status', 'sending');
  END IF;

  token := gen_random_uuid();
  UPDATE public.registration_acceptance_notifications
  SET status = 'sending', claim_token = token, claimed_at = now(), last_error = NULL
  WHERE registration_id = applicant.id;

  RETURN jsonb_build_object(
    'status', 'claimed', 'claim_token', token, 'registration_id', applicant.id,
    'full_name', applicant.full_name, 'phone', applicant.phone, 'email', applicant.email,
    'department', applicant.department, 'filiere', applicant.filiere,
    'years_of_study', applicant.years_of_study, 'registration_season', applicant.registration_season
  );
END;
$$;

CREATE OR REPLACE FUNCTION public.record_registration_acceptance_notification(
  p_registration_id bigint, p_claim_token uuid, p_status text,
  p_message_id text DEFAULT NULL, p_error text DEFAULT NULL
)
RETURNS void
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = ''
AS $$
BEGIN
  IF NOT coalesce(public.has_club_permission('registrations'), false) THEN
    RAISE EXCEPTION 'Registration permission required';
  END IF;
  IF p_status IS NULL OR p_status NOT IN ('sent', 'failed', 'not_configured') THEN
    RAISE EXCEPTION 'Invalid email delivery status';
  END IF;
  UPDATE public.registration_acceptance_notifications
  SET status = p_status, sent_at = CASE WHEN p_status = 'sent' THEN now() ELSE NULL END,
      message_id = left(p_message_id, 500), last_error = left(p_error, 1000), claim_token = NULL
  WHERE registration_id = p_registration_id AND claim_token = p_claim_token AND status = 'sending';
  IF NOT FOUND THEN RAISE EXCEPTION 'Email delivery claim expired or changed'; END IF;
END;
$$;

REVOKE ALL ON FUNCTION public.queue_registration_acceptance_notification() FROM PUBLIC, anon, authenticated;
REVOKE ALL ON FUNCTION public.claim_registration_acceptance_notification(bigint) FROM PUBLIC, anon;
REVOKE ALL ON FUNCTION public.record_registration_acceptance_notification(bigint,uuid,text,text,text) FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION public.claim_registration_acceptance_notification(bigint) TO authenticated;
GRANT EXECUTE ON FUNCTION public.record_registration_acceptance_notification(bigint,uuid,text,text,text) TO authenticated;
NOTIFY pgrst, 'reload schema';
COMMIT;
