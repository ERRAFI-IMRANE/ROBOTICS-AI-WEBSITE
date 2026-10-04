-- MANUAL CLEANUP ONLY. Do not include this file in an automated migration.
-- Target checked: Supabase project zsqajmlmobiqscggwnbq.
-- WARNING: This removes ALL registrations across ALL seasons and ALL statuses,
-- including interview answers and Interesting flags, plus legacy refused members.
-- Export a backup of the affected tables before committing.
-- Close registration and stop reviewing applicants during this operation.
--
-- PRESERVES: team, team_seasons, team_contact_emails, Team attendance/actions,
-- attendance_sessions, club_wear_assignments, events, forms/form submissions,
-- admin accounts, settings, notification recipients, OAuth connections and media.
-- No schema, policy, function, trigger, or sequence is removed or reset.
--
-- SAFE DEFAULT: the last ROLLBACK undoes the cleanup. For the real cleanup,
-- replace the last ROLLBACK with COMMIT and rerun the ENTIRE file.
-- Run as postgres in Supabase SQL Editor, never as anon/authenticated.

RESET ROLE;
BEGIN;
SET LOCAL lock_timeout = '5s';
SET LOCAL statement_timeout = '30s';

-- Prevent concurrent registrations/attendance changes while taking the snapshot.
LOCK TABLE public.registrations, public.refused_members,
  public.registration_acceptance_notifications,
  public.attendance_actions, public.attendance_records
  IN SHARE ROW EXCLUSIVE MODE;

-- Abort if a future schema adds dependencies outside this explicit cleanup scope.
DO $$
BEGIN
  IF EXISTS (
    SELECT 1 FROM pg_catalog.pg_constraint AS dependency
    WHERE dependency.contype = 'f'
      AND dependency.confrelid IN (
        'public.registrations'::regclass,
        'public.refused_members'::regclass,
        'public.registration_acceptance_notifications'::regclass,
        'public.attendance_actions'::regclass,
        'public.attendance_records'::regclass
      )
      AND NOT (
        dependency.confrelid = 'public.registrations'::regclass
        AND dependency.conrelid IN (
          'public.attendance_actions'::regclass,
          'public.attendance_records'::regclass,
          'public.registration_acceptance_notifications'::regclass
        )
      )
  ) THEN
    RAISE EXCEPTION 'Unexpected dependent table found. Stop and review its data before cleaning registrations.';
  END IF;
END;
$$;

-- Delete applicant dependencies first. Do NOT clear Team rows in these tables.
DELETE FROM public.attendance_actions WHERE participant_type = 'registration';
DELETE FROM public.attendance_records WHERE participant_type = 'registration';
DELETE FROM public.registration_acceptance_notifications;
DELETE FROM public.refused_members;
DELETE FROM public.registrations;

-- Preview counts INSIDE the transaction, before the final ROLLBACK/COMMIT.
SELECT 'registrations' AS table_name, 'cleanup scope' AS category, count(*) AS remaining
FROM public.registrations
UNION ALL SELECT 'refused_members', 'cleanup scope', count(*) FROM public.refused_members
UNION ALL SELECT 'registration_acceptance_notifications', 'cleanup scope', count(*)
FROM public.registration_acceptance_notifications
UNION ALL SELECT 'attendance_records (applicants)', 'cleanup scope', count(*)
FROM public.attendance_records WHERE participant_type = 'registration'
UNION ALL SELECT 'attendance_actions (applicants)', 'cleanup scope', count(*)
FROM public.attendance_actions WHERE participant_type = 'registration'
UNION ALL SELECT 'team', 'kept', count(*) FROM public.team
UNION ALL SELECT 'team_seasons', 'kept', count(*) FROM public.team_seasons;

-- PREVIEW ONLY. Replace this line with COMMIT; to permanently clear the data.
ROLLBACK;
