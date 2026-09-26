-- Assertions for 20260322330000, inside BEGIN/ROLLBACK.
--
-- WHY --replay DOES NOT WORK FOR THIS ONE, so nobody burns an afternoon on it:
-- this migration names the enum values added by 20260322320000, and Postgres
-- refuses to let a value added by ALTER TYPE ... ADD VALUE be used in the
-- transaction that added it. Replay runs both inside one transaction, so the
-- first function body that says 'board' fails with "invalid input value for
-- enum app_role". Push 320000 first; then this file runs in the DEFAULT mode
-- (against production as deployed), which is where it belongs anyway. The same
-- rule rules out a --negative patch, so the control this file gets instead is
-- the one that matters: run it BEFORE the migration and assertion 1 fails,
-- run it after and all nine pass. Recorded as done on 26 September 2026.
--
-- Two of these guard a thing that has already gone wrong once in this
-- database: the admin policies on public.user_organizations were recorded as
-- applied in 20251227000000 and were not there. Roles silently refused to save
-- for months. If they vanish again, 6 and 7 fail.

-- 1. The Board is staff, and 'member' still is not.
DO $a$
DECLARE
  _md UUID := 'a0eebc99-9c0b-4ef8-bb6d-6bb9bd380a11';
  _src TEXT := pg_get_functiondef('public.is_staff(uuid)'::regprocedure);
BEGIN
  IF _src NOT LIKE '%''board''%' THEN
    RAISE EXCEPTION 'FAIL 1: is_staff() does not admit the board tier, so a board member reaches nothing';
  END IF;
  FOR _src IN SELECT unnest(ARRAY['admin','contributor','treasury','finance']) LOOP
    IF pg_get_functiondef('public.is_staff(uuid)'::regprocedure) NOT LIKE '%''' || _src || '''%' THEN
      RAISE EXCEPTION 'FAIL 1b: is_staff() lost the % tier', _src;
    END IF;
  END LOOP;
  IF pg_get_functiondef('public.is_staff(uuid)'::regprocedure) LIKE '%''member''%' THEN
    RAISE EXCEPTION 'FAIL 1c: is_staff() now admits plain members - the floor has been removed';
  END IF;
  RAISE NOTICE 'PASS 1 (board is staff, member is not)';
END;
$a$;

-- 2. A BOARD MEMBER READS BOTH BRANCHES. The whole point of the tier: MD and
--    VA are weighed against one pot, and half the year is worse than none.
DO $a$
DECLARE
  _md UUID := 'a0eebc99-9c0b-4ef8-bb6d-6bb9bd380a11';
  _va UUID := 'b1eebc99-9c0b-4ef8-bb6d-6bb9bd380a22';
  _board UUID;
  _md_seen INT; _va_seen INT;
BEGIN
  -- Appoint one, inside the transaction. There need not be a real board member
  -- yet for this to be worth asserting.
  SELECT id INTO _board FROM public.profiles
   WHERE id NOT IN (SELECT user_id FROM public.user_organizations WHERE role = 'admin')
   LIMIT 1;

  DELETE FROM public.user_organizations WHERE user_id = _board;
  INSERT INTO public.user_organizations (user_id, organization_id, role, is_primary, email)
  VALUES (_board, _md, 'board', true, 'board-test@example.invalid'),
         (_board, _va, 'board', false, 'board-test@example.invalid');

  PERFORM set_config('request.jwt.claim.sub', _board::text, true);
  SET LOCAL ROLE authenticated;

  SELECT count(*) INTO _md_seen FROM budget.allocation_requests WHERE organization_id = _md;
  SELECT count(*) INTO _va_seen FROM budget.allocation_requests WHERE organization_id = _va;

  RESET ROLE;

  IF _md_seen = 0 THEN
    RAISE EXCEPTION 'FAIL 2: a board member cannot see MD budget requests';
  END IF;
  IF _va_seen = 0 THEN
    RAISE EXCEPTION 'FAIL 2b: a board member cannot see VA budget requests - they are reading half the church';
  END IF;
  RAISE NOTICE 'PASS 2 (board reads both branches: MD %, VA %)', _md_seen, _va_seen;
END;
$a$;

-- 3. THE BOARD ADVISES; IT DOES NOT DECIDE. The single most important negative
--    in this migration: no approving, no changing the amount asked for.
DO $a$
DECLARE
  _md UUID := 'a0eebc99-9c0b-4ef8-bb6d-6bb9bd380a11';
  _board UUID; _req UUID; _touched INT;
BEGIN
  SELECT id INTO _board FROM public.profiles
   WHERE id NOT IN (SELECT user_id FROM public.user_organizations WHERE role = 'admin')
   LIMIT 1;
  DELETE FROM public.user_organizations WHERE user_id = _board;
  INSERT INTO public.user_organizations (user_id, organization_id, role, is_primary, email)
  VALUES (_board, _md, 'board', true, 'board-test@example.invalid');

  SELECT id INTO _req FROM budget.allocation_requests
   WHERE organization_id = _md AND status = 'pending' LIMIT 1;

  IF _req IS NULL THEN
    RAISE NOTICE 'SKIP: 3 (no pending request in MD to try this against)';
    RETURN;
  END IF;

  PERFORM set_config('request.jwt.claim.sub', _board::text, true);
  SET LOCAL ROLE authenticated;

  WITH tried AS (
    UPDATE budget.allocation_requests
       SET status = 'approved', approved_amount = 999999
     WHERE id = _req
    RETURNING 1)
  SELECT count(*) INTO _touched FROM tried;

  RESET ROLE;

  IF _touched <> 0 THEN
    RAISE EXCEPTION 'FAIL 3: a board member approved a budget request. The Board advises, the office decides';
  END IF;
  RAISE NOTICE 'PASS 3 (board cannot approve or alter a request)';
END;
$a$;

-- 4. Board feedback is written by its author and nobody else.
DO $a$
DECLARE
  _md UUID := 'a0eebc99-9c0b-4ef8-bb6d-6bb9bd380a11';
  _board UUID; _other UUID; _req UUID; _ok BOOLEAN := false;
BEGIN
  SELECT id INTO _board FROM public.profiles
   WHERE id NOT IN (SELECT user_id FROM public.user_organizations WHERE role = 'admin') LIMIT 1;
  SELECT id INTO _other FROM public.profiles WHERE id <> _board LIMIT 1;

  DELETE FROM public.user_organizations WHERE user_id = _board;
  INSERT INTO public.user_organizations (user_id, organization_id, role, is_primary, email)
  VALUES (_board, _md, 'board', true, 'board-test@example.invalid');

  SELECT id INTO _req FROM budget.allocation_requests WHERE organization_id = _md LIMIT 1;
  IF _req IS NULL THEN
    RAISE NOTICE 'SKIP: 4 (no MD requests to comment on)';
    RETURN;
  END IF;

  PERFORM set_config('request.jwt.claim.sub', _board::text, true);
  SET LOCAL ROLE authenticated;

  INSERT INTO budget.allocation_board_feedback
    (request_id, organization_id, board_member_id, board_member_name, recommended_amount, comment)
  VALUES (_req, _md, _board, 'Test Board Member', 4000, 'Cut the retreat line');

  -- ...but not one signed with somebody else's name.
  BEGIN
    INSERT INTO budget.allocation_board_feedback
      (request_id, organization_id, board_member_id, board_member_name, comment)
    VALUES (_req, _md, _other, 'Somebody Else', 'Not mine to write');
    _ok := false;
  EXCEPTION WHEN insufficient_privilege OR check_violation THEN
    _ok := true;
  END;

  RESET ROLE;

  IF NOT _ok THEN
    RAISE EXCEPTION 'FAIL 4: a board member recorded feedback in another member''s name';
  END IF;
  RAISE NOTICE 'PASS 4 (feedback is signed by whoever wrote it)';
END;
$a$;

-- 5. The ministry does not read what the Board said about it. The Board is
--    weighing this ministry against every other, and that conversation is not
--    addressed to the ministry. What it is owed is the decision.
DO $a$
DECLARE
  _md UUID := 'a0eebc99-9c0b-4ef8-bb6d-6bb9bd380a11';
  _requester UUID; _req UUID; _seen INT;
BEGIN
  SELECT ar.id, ar.requester_id INTO _req, _requester
    FROM budget.allocation_requests ar
    JOIN public.user_organizations uo
      ON uo.user_id = ar.requester_id AND uo.organization_id = _md
   WHERE ar.organization_id = _md AND uo.role = 'contributor'
   LIMIT 1;

  IF _req IS NULL THEN
    RAISE NOTICE 'SKIP: 5 (no contributor-raised MD request to test with)';
    RETURN;
  END IF;

  INSERT INTO budget.allocation_board_feedback
    (request_id, organization_id, board_member_id, board_member_name, comment)
  VALUES (_req, _md, _requester, 'A Board Member', 'They overspent last year');

  PERFORM set_config('request.jwt.claim.sub', _requester::text, true);
  SET LOCAL ROLE authenticated;
  SELECT count(*) INTO _seen FROM budget.allocation_board_feedback WHERE request_id = _req;
  RESET ROLE;

  IF _seen <> 0 THEN
    RAISE EXCEPTION 'FAIL 5: the requesting ministry can read the Board''s notes about it';
  END IF;
  RAISE NOTICE 'PASS 5 (board notes are not shown to the ministry)';
END;
$a$;

-- 6. AN ADMIN CAN SET A ROLE. This is the bug that started all of it: the
--    UPDATE matched zero rows and the page reported success.
DO $a$
DECLARE
  _md UUID := 'a0eebc99-9c0b-4ef8-bb6d-6bb9bd380a11';
  _admin UUID; _target UUID; _changed INT;
BEGIN
  SELECT user_id INTO _admin FROM public.user_organizations
   WHERE organization_id = _md AND role = 'admin' LIMIT 1;
  SELECT user_id INTO _target FROM public.user_organizations
   WHERE organization_id = _md AND role = 'member' LIMIT 1;

  PERFORM set_config('request.jwt.claim.sub', _admin::text, true);
  SET LOCAL ROLE authenticated;

  WITH done AS (
    UPDATE public.user_organizations SET role = 'contributor'
     WHERE user_id = _target AND organization_id = _md
    RETURNING 1)
  SELECT count(*) INTO _changed FROM done;

  RESET ROLE;

  IF _changed <> 1 THEN
    RAISE EXCEPTION 'FAIL 6: an admin could not change a role. The admin policies on user_organizations are gone again - see 20251227000000';
  END IF;
  RAISE NOTICE 'PASS 6 (an admin can set a role)';
END;
$a$;

-- 7. ...and nobody else can. A contributor promoting themselves to admin is
--    the failure this policy set exists to prevent.
DO $a$
DECLARE
  _md UUID := 'a0eebc99-9c0b-4ef8-bb6d-6bb9bd380a11';
  _plain UUID; _changed INT;
BEGIN
  SELECT user_id INTO _plain FROM public.user_organizations
   WHERE organization_id = _md AND role = 'contributor' LIMIT 1;

  IF _plain IS NULL THEN
    RAISE NOTICE 'SKIP: 7 (no contributor in MD)';
    RETURN;
  END IF;

  PERFORM set_config('request.jwt.claim.sub', _plain::text, true);
  SET LOCAL ROLE authenticated;

  WITH tried AS (
    UPDATE public.user_organizations SET role = 'admin'
     WHERE user_id = _plain AND organization_id = _md
    RETURNING 1)
  SELECT count(*) INTO _changed FROM tried;

  RESET ROLE;

  IF _changed <> 0 THEN
    RAISE EXCEPTION 'FAIL 7: a contributor made themselves an admin';
  END IF;
  RAISE NOTICE 'PASS 7 (only admins set roles)';
END;
$a$;

-- 8. The branch keeps an admin. These policies are new power over the roster,
--    and the screen that uses them lets an admin edit their own row.
DO $a$
DECLARE
  _md UUID := 'a0eebc99-9c0b-4ef8-bb6d-6bb9bd380a11';
  _last UUID; _refused BOOLEAN := false;
BEGIN
  SELECT user_id INTO _last FROM public.user_organizations
   WHERE organization_id = _md AND role = 'admin' LIMIT 1;

  DELETE FROM public.user_organizations
   WHERE organization_id = _md AND role = 'admin' AND user_id <> _last;

  BEGIN
    UPDATE public.user_organizations SET role = 'member'
     WHERE user_id = _last AND organization_id = _md;
  EXCEPTION WHEN check_violation THEN
    _refused := true;
  END;

  IF NOT _refused THEN
    RAISE EXCEPTION 'FAIL 8: the last admin of a branch demoted themselves and left nobody able to appoint another';
  END IF;

  -- And a delete is refused the same way.
  _refused := false;
  BEGIN
    DELETE FROM public.user_organizations
     WHERE user_id = _last AND organization_id = _md;
  EXCEPTION WHEN check_violation THEN
    _refused := true;
  END;

  IF NOT _refused THEN
    RAISE EXCEPTION 'FAIL 8b: the last admin of a branch was removed';
  END IF;
  RAISE NOTICE 'PASS 8 (a branch cannot be left without an admin)';
END;
$a$;

-- 9. Feedback has to say something. A row with neither figure nor comment is
--    a board member having clicked Save by accident.
DO $a$
DECLARE
  _md UUID := 'a0eebc99-9c0b-4ef8-bb6d-6bb9bd380a11';
  _req UUID; _board UUID; _refused BOOLEAN := false;
BEGIN
  SELECT id INTO _req FROM budget.allocation_requests WHERE organization_id = _md LIMIT 1;
  SELECT id INTO _board FROM public.profiles LIMIT 1;

  IF _req IS NULL THEN
    RAISE NOTICE 'SKIP: 9 (no MD requests)';
    RETURN;
  END IF;

  BEGIN
    INSERT INTO budget.allocation_board_feedback
      (request_id, organization_id, board_member_id, board_member_name, recommended_amount, comment)
    VALUES (_req, _md, _board, 'Empty', NULL, '   ');
  EXCEPTION WHEN check_violation THEN
    _refused := true;
  END;

  IF NOT _refused THEN
    RAISE EXCEPTION 'FAIL 9: an empty board note was accepted';
  END IF;
  RAISE NOTICE 'PASS 9 (a board note has to say something)';
END;
$a$;
