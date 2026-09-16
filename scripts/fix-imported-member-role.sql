-- =============================================================================
-- The imported congregation are members, not staff
-- =============================================================================
--
-- MY MISTAKE, and it is worth naming precisely. The Breeze import enrolled its
-- 534 new logins like this:
--
--     INSERT INTO public.user_organizations (user_id, organization_id, role, ...)
--     SELECT b.user_id, '<MD>', 'contributor', true ...
--
-- I copied 'contributor' from public.handle_new_user, which is what the trigger
-- has always written. But the design moved on and I did not check:
-- 20260321001500 added a 'member' tier, and 20260321001600 made it the column
-- DEFAULT, stating the rule outright — "'member' is the floor and reaches no
-- internal tool."
--
-- public.is_staff() is:
--
--     role IN ('admin', 'contributor', 'treasury', 'finance')
--
-- so every one of those 534 people currently counts as staff. The whole
-- congregation can reach the calendar, the budget and the inventory.
--
-- WHO THIS TOUCHES, AND WHO IT DOES NOT
-- -------------------------------------
-- MD holds 563 contributor rows. Exactly 534 of them carry
-- profiles.must_change_password, which is set only on a login this import
-- created — and those 534 hold ZERO module grants between them, so no kids
-- volunteer, members admin or giving admin rides on any of these rows.
--
-- The other 29 contributors are the church's real staff and are untouched, as
-- are the 6 admins, the treasury and finance rows, the 6 kids leaders already
-- sitting at 'member', and the 8 people who already had a login before the
-- import and were merely linked to a member record.
--
-- The match is exact and it is not a coincidence: 534 logins created, 534
-- password resets forced, 534 rows corrected here.
--
-- WHAT THEY KEEP
-- --------------
-- Everything that was the point of giving them a login: My Church, their own
-- household, their giving history, their children's check-in history, and
-- editing their own record through church.update_person_details — none of
-- which consults the tier. What they lose is the internal tooling they should
-- never have been handed.
--
-- Promoting one later is one statement:
--
--     UPDATE public.user_organizations SET role = 'contributor'
--      WHERE user_id = '<their auth user id>'
--        AND organization_id = 'a0eebc99-9c0b-4ef8-bb6d-6bb9bd380a11';
--
-- Anything additive — kids desk, members admin — belongs in
-- church.module_grants instead, and works regardless of tier.
--
-- Re-runnable: the WHERE clause stops matching once the rows are 'member'.
-- =============================================================================

BEGIN;

-- Refuse to run if the shape is not what this script was written against,
-- rather than demoting whoever happens to match today.
DO $guard$
DECLARE _target INTEGER; _grants INTEGER;
BEGIN
  SELECT count(*) INTO _target
    FROM public.user_organizations uo
    JOIN public.profiles pr ON pr.id = uo.user_id
   WHERE uo.organization_id = 'a0eebc99-9c0b-4ef8-bb6d-6bb9bd380a11'
     AND uo.role = 'contributor'
     AND pr.must_change_password;

  -- Nobody in scope should hold a module grant. If one does, they were given
  -- real responsibility since the import and a blanket demotion is no longer
  -- safe to run unattended.
  SELECT count(*) INTO _grants
    FROM public.user_organizations uo
    JOIN public.profiles pr ON pr.id = uo.user_id
   WHERE uo.organization_id = 'a0eebc99-9c0b-4ef8-bb6d-6bb9bd380a11'
     AND uo.role = 'contributor'
     AND pr.must_change_password
     AND EXISTS (SELECT 1 FROM church.module_grants g WHERE g.user_id = uo.user_id);

  IF _grants > 0 THEN
    RAISE EXCEPTION
      '% of the accounts in scope now hold a module grant. Review them by hand '
      'before demoting anyone.', _grants;
  END IF;

  RAISE NOTICE 'rows to correct: %', _target;
END
$guard$;

UPDATE public.user_organizations uo
   SET role = 'member'
  FROM public.profiles pr
 WHERE pr.id = uo.user_id
   AND uo.organization_id = 'a0eebc99-9c0b-4ef8-bb6d-6bb9bd380a11'
   AND uo.role = 'contributor'
   -- Set only on a login somebody else created a password for, which for this
   -- branch means the Breeze import.
   AND pr.must_change_password;

-- -----------------------------------------------------------------------------
-- What the branch looks like afterwards
-- -----------------------------------------------------------------------------
SELECT uo.role::text AS tier,
       count(*)      AS people,
       count(*) FILTER (WHERE EXISTS (
         SELECT 1 FROM church.module_grants g WHERE g.user_id = uo.user_id
       ))            AS with_module_grants
  FROM public.user_organizations uo
 WHERE uo.organization_id = 'a0eebc99-9c0b-4ef8-bb6d-6bb9bd380a11'
 GROUP BY uo.role
 ORDER BY count(*) DESC;

COMMIT;
