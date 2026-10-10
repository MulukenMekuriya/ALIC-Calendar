-- Assertions for 20260322430000, inside BEGIN/ROLLBACK.
--
-- The directory holds everyone once; a family's status is its strongest;
-- a bulk status change changes only what differs and records each one; and
-- readers read while only members admins change.

CREATE TEMP TABLE t AS
SELECT 'a0eebc99-9c0b-4ef8-bb6d-6bb9bd380a11'::UUID AS md,
       '26c90146-d058-4a7c-811f-a6346c651370'::UUID AS admin_u, -- MD ALIC Developers, a church admin
       -- A teacher: kids_volunteer only, no directory access.
       'a45508af-00dd-4e33-b5a0-e03611421e53'::UUID AS teacher_u;

CREATE TEMP TABLE zz (name TEXT PRIMARY KEY, id UUID);

DO $setup$
DECLARE
  _md UUID; _h UUID; _p UUID; _c UUID; _member UUID; _visitor UUID;
  _sess UUID; _batch UUID; _room UUID;
BEGIN
  SELECT md INTO _md FROM t;
  PERFORM set_config('request.jwt.claim.sub', (SELECT admin_u::TEXT FROM t), true);
  SELECT id INTO _member  FROM church.membership_statuses WHERE organization_id = _md AND code = 'member';
  SELECT id INTO _visitor FROM church.membership_statuses WHERE organization_id = _md AND code = 'visitor';
  SELECT kids_session_id, batch_id, room_id INTO _sess, _batch, _room
    FROM church.kids_check_ins WHERE organization_id = _md AND room_id IS NOT NULL
   ORDER BY created_at DESC LIMIT 1;

  -- A mixed family: a member, a visitor, and a child checked in last week.
  INSERT INTO church.households (organization_id, name) VALUES (_md, 'ZZ Mixed') RETURNING id INTO _h;
  INSERT INTO zz VALUES ('h_mixed', _h);
  INSERT INTO church.people (organization_id, first_name, last_name, is_child, membership_status_id, phone)
    VALUES (_md, 'ZZMum', 'Dir', false, _member, '202-555-0101') RETURNING id INTO _p;
  INSERT INTO church.household_members (organization_id, household_id, person_id, household_role, is_primary_household, is_primary_contact)
    VALUES (_md, _h, _p, 'adult', true, true);
  INSERT INTO zz VALUES ('mum', _p);
  INSERT INTO church.people (organization_id, first_name, last_name, is_child, membership_status_id)
    VALUES (_md, 'ZZDad', 'Dir', false, _visitor) RETURNING id INTO _p;
  INSERT INTO church.household_members (organization_id, household_id, person_id, household_role, is_primary_household)
    VALUES (_md, _h, _p, 'adult', true);
  INSERT INTO zz VALUES ('dad', _p);
  INSERT INTO church.people (organization_id, first_name, last_name, is_child)
    VALUES (_md, 'ZZKid', 'Dir', true) RETURNING id INTO _c;
  INSERT INTO church.household_members (organization_id, household_id, person_id, household_role, is_primary_household)
    VALUES (_md, _h, _c, 'child', true);
  INSERT INTO zz VALUES ('kid', _c);
  INSERT INTO church.kids_check_ins (organization_id, kids_session_id, batch_id, child_person_id,
    room_id, status, checked_in_by_name, tag_number, label_child_name, checked_in_at)
  VALUES (_md, _sess, _batch, _c, _room, 'checked_in', 'ZZ Desk', 9851, 'ZZKid', now() - interval '6 days');

  -- A visitor family, and a family with no status at all.
  INSERT INTO church.households (organization_id, name) VALUES (_md, 'ZZ Visiting') RETURNING id INTO _h;
  INSERT INTO zz VALUES ('h_visiting', _h);
  INSERT INTO church.people (organization_id, first_name, last_name, is_child, membership_status_id)
    VALUES (_md, 'ZZGuest', 'Dir', false, _visitor) RETURNING id INTO _p;
  INSERT INTO church.household_members (organization_id, household_id, person_id, household_role, is_primary_household)
    VALUES (_md, _h, _p, 'adult', true);
  INSERT INTO zz VALUES ('guest', _p);

  INSERT INTO church.households (organization_id, name) VALUES (_md, 'ZZ Unknown') RETURNING id INTO _h;
  INSERT INTO zz VALUES ('h_unknown', _h);
  INSERT INTO church.people (organization_id, first_name, last_name, is_child)
    VALUES (_md, 'ZZNobody', 'Dir', false) RETURNING id INTO _p;
  INSERT INTO church.household_members (organization_id, household_id, person_id, household_role, is_primary_household)
    VALUES (_md, _h, _p, 'adult', true);
  INSERT INTO zz VALUES ('nobody', _p);
END;
$setup$;

-- 1. Everyone once, with their status and family by name.
DO $a$
DECLARE _rows INTEGER; _expected INTEGER; _r RECORD;
BEGIN
  PERFORM set_config('request.jwt.claim.sub', (SELECT admin_u::TEXT FROM t), true);
  SELECT count(*), count(DISTINCT id) INTO _rows, _expected
  FROM church.directory_people((SELECT md FROM t));
  IF _rows <> _expected THEN
    RAISE EXCEPTION 'FAIL 1: % rows for % people', _rows, _expected;
  END IF;
  SELECT count(*) INTO _expected FROM church.people
   WHERE organization_id = (SELECT md FROM t) AND merged_into_person_id IS NULL;
  IF _rows <> _expected THEN
    RAISE EXCEPTION 'FAIL 1a: % in the directory, % people in the branch', _rows, _expected;
  END IF;

  SELECT * INTO _r FROM church.directory_people((SELECT md FROM t)) d WHERE d.id = (SELECT id FROM zz WHERE name = 'mum');
  IF _r.membership_code IS DISTINCT FROM 'member' OR _r.membership_name IS DISTINCT FROM 'Member'
     OR _r.household_name IS DISTINCT FROM 'ZZ Mixed' THEN
    RAISE EXCEPTION 'FAIL 1b: mum reads as %', row_to_json(_r);
  END IF;
  SELECT * INTO _r FROM church.directory_people((SELECT md FROM t)) d WHERE d.id = (SELECT id FROM zz WHERE name = 'kid');
  IF _r.last_check_in IS DISTINCT FROM current_date - 6 THEN
    RAISE EXCEPTION 'FAIL 1c: the child''s last check-in reads %', _r.last_check_in;
  END IF;
  RAISE NOTICE 'PASS 1 (% people)', _rows;
END;
$a$;

-- 2. Families: everyone counted as before, and the strongest status.
DO $a$
DECLARE _bad RECORD; _got TEXT; _r RECORD;
BEGIN
  PERFORM set_config('request.jwt.claim.sub', (SELECT admin_u::TEXT FROM t), true);
  SELECT o.name, o.adult_count, n.adult_count AS n_adults, o.child_count, n.child_count AS n_children INTO _bad
  FROM church.household_summaries((SELECT md FROM t)) o
  FULL JOIN church.directory_families((SELECT md FROM t)) n ON n.household_id = o.household_id
  WHERE o.adult_count IS DISTINCT FROM n.adult_count OR o.child_count IS DISTINCT FROM n.child_count
  LIMIT 1;
  IF _bad.name IS NOT NULL THEN
    RAISE EXCEPTION 'FAIL 2: % counts % adults % children, before % and %',
      _bad.name, _bad.n_adults, _bad.n_children, _bad.adult_count, _bad.child_count;
  END IF;

  SELECT string_agg(f.name || '=' || f.family_status, ',' ORDER BY f.name) INTO _got
  FROM church.directory_families((SELECT md FROM t)) f WHERE f.name LIKE 'ZZ %';
  IF _got IS DISTINCT FROM 'ZZ Mixed=member,ZZ Unknown=not_recorded,ZZ Visiting=visitor' THEN
    RAISE EXCEPTION 'FAIL 2a: families read %', _got;
  END IF;

  SELECT * INTO _r FROM church.directory_families((SELECT md FROM t)) f
   WHERE f.household_id = (SELECT id FROM zz WHERE name = 'h_mixed');
  -- IS DISTINCT FROM throughout: a NULL must fail, not slip past "<>".
  IF _r.primary_contact_name IS DISTINCT FROM 'ZZMum Dir'
     OR _r.primary_phone IS DISTINCT FROM '202-555-0101'
     OR _r.last_check_in IS DISTINCT FROM current_date - 6
     OR _r.adult_count IS DISTINCT FROM 2 OR _r.child_count IS DISTINCT FROM 1 THEN
    RAISE EXCEPTION 'FAIL 2b: the mixed family reads %', row_to_json(_r);
  END IF;
  RAISE NOTICE 'PASS 2';
END;
$a$;

-- 3. One status for many: only what differs changes, and each is recorded.
DO $a$
DECLARE _n INTEGER; _member UUID; _visitor UUID; _hist INTEGER; _other UUID;
BEGIN
  PERFORM set_config('request.jwt.claim.sub', (SELECT admin_u::TEXT FROM t), true);
  SELECT id INTO _member  FROM church.membership_statuses WHERE organization_id = (SELECT md FROM t) AND code = 'member';
  SELECT id INTO _visitor FROM church.membership_statuses WHERE organization_id = (SELECT md FROM t) AND code = 'visitor';

  -- mum is already a member; dad (visitor) and nobody (none) change.
  _n := church.set_membership_status((SELECT md FROM t),
          ARRAY(SELECT id FROM zz WHERE name IN ('mum', 'dad', 'nobody')), _member);
  IF _n <> 2 THEN RAISE EXCEPTION 'FAIL 3: % changed, expected 2', _n; END IF;
  IF (SELECT count(*) FROM church.people WHERE id IN (SELECT id FROM zz WHERE name IN ('mum','dad','nobody'))
        AND membership_status_id = _member) <> 3 THEN
    RAISE EXCEPTION 'FAIL 3a: not everyone is a member now';
  END IF;

  SELECT count(*) INTO _hist FROM church.people_history h
   WHERE h.person_id IN (SELECT id FROM zz WHERE name IN ('mum','dad','nobody'))
     AND h.action = 'bulk_update' AND h.field_name = 'membership_status_id'
     AND h.new_value = _member::TEXT;
  IF _hist <> 2 THEN RAISE EXCEPTION 'FAIL 3b: % history rows, expected 2', _hist; END IF;
  IF NOT EXISTS (SELECT 1 FROM church.people_history h
                  WHERE h.person_id = (SELECT id FROM zz WHERE name = 'dad')
                    AND h.old_value = _visitor::TEXT AND h.actor_id = (SELECT admin_u FROM t)) THEN
    RAISE EXCEPTION 'FAIL 3c: dad''s old status or the actor was not recorded';
  END IF;

  -- Another branch's status, and nobody chosen: refused.
  SELECT id INTO _other FROM church.membership_statuses WHERE organization_id <> (SELECT md FROM t) LIMIT 1;
  BEGIN
    PERFORM church.set_membership_status((SELECT md FROM t), ARRAY(SELECT id FROM zz WHERE name = 'guest'), _other);
    RAISE EXCEPTION 'FAIL 3d: another branch''s status was set';
  EXCEPTION WHEN raise_exception THEN
    IF SQLERRM <> 'status_belongs_to_another_branch' THEN RAISE; END IF;
  END;
  BEGIN
    PERFORM church.set_membership_status((SELECT md FROM t), ARRAY[]::UUID[], _member);
    RAISE EXCEPTION 'FAIL 3e: nobody was accepted';
  EXCEPTION WHEN raise_exception THEN
    IF SQLERRM <> 'nobody_chosen' THEN RAISE; END IF;
  END;
  RAISE NOTICE 'PASS 3';
END;
$a$;

-- 4. Not the same person.
DO $a$
DECLARE _ids UUID[];
BEGIN
  PERFORM set_config('request.jwt.claim.sub', (SELECT admin_u::TEXT FROM t), true);
  _ids := ARRAY(SELECT id FROM zz WHERE name IN ('guest', 'nobody') ORDER BY id);
  PERFORM church.dismiss_duplicate_group((SELECT md FROM t), _ids);
  IF NOT EXISTS (SELECT 1 FROM church.duplicate_dismissals((SELECT md FROM t)) d WHERE d.person_ids = _ids) THEN
    RAISE EXCEPTION 'FAIL 4: the dismissal is not listed';
  END IF;
  BEGIN
    PERFORM church.dismiss_duplicate_group((SELECT md FROM t),
      ARRAY[(SELECT id FROM zz WHERE name = 'guest'), gen_random_uuid()]);
    RAISE EXCEPTION 'FAIL 4a: a stranger''s id was accepted';
  EXCEPTION WHEN raise_exception THEN
    IF SQLERRM <> 'invalid_group' THEN RAISE; END IF;
  END;
  RAISE NOTICE 'PASS 4';
END;
$a$;

-- 5. Who may read, and who may change.
DO $a$
DECLARE _member UUID;
BEGIN
  SELECT id INTO _member FROM church.membership_statuses WHERE organization_id = (SELECT md FROM t) AND code = 'member';

  -- A teacher reads nothing here.
  PERFORM set_config('request.jwt.claim.sub', (SELECT teacher_u::TEXT FROM t), true);
  BEGIN
    PERFORM * FROM church.directory_people((SELECT md FROM t));
    RAISE EXCEPTION 'FAIL 5: a teacher read the directory';
  EXCEPTION WHEN insufficient_privilege THEN NULL;
  END;
  BEGIN
    PERFORM * FROM church.directory_families((SELECT md FROM t));
    RAISE EXCEPTION 'FAIL 5a: a teacher read the families';
  EXCEPTION WHEN insufficient_privilege THEN NULL;
  END;

  -- Given members_viewer, the same teacher reads but changes nothing.
  INSERT INTO church.module_grants (user_id, organization_id, permission)
  VALUES ((SELECT teacher_u FROM t), (SELECT md FROM t), 'members_viewer');
  PERFORM 1 FROM church.directory_people((SELECT md FROM t)) LIMIT 1;
  PERFORM 1 FROM church.directory_families((SELECT md FROM t)) LIMIT 1;
  BEGIN
    PERFORM church.set_membership_status((SELECT md FROM t), ARRAY(SELECT id FROM zz WHERE name = 'guest'), _member);
    RAISE EXCEPTION 'FAIL 5b: a viewer changed a status';
  EXCEPTION WHEN insufficient_privilege THEN NULL;
  END;
  BEGIN
    PERFORM church.dismiss_duplicate_group((SELECT md FROM t), ARRAY(SELECT id FROM zz WHERE name IN ('mum','dad')));
    RAISE EXCEPTION 'FAIL 5c: a viewer dismissed duplicates';
  EXCEPTION WHEN insufficient_privilege THEN NULL;
  END;

  IF has_function_privilege('anon', 'church.directory_people(uuid)', 'EXECUTE')
     OR has_function_privilege('anon', 'church.set_membership_status(uuid,uuid[],uuid)', 'EXECUTE')
     OR has_function_privilege('authenticated', 'church.assert_directory_reader(uuid)', 'EXECUTE')
     OR has_table_privilege('authenticated', 'church.person_duplicate_dismissals', 'SELECT') THEN
    RAISE EXCEPTION 'FAIL 5d: something is reachable by the wrong role';
  END IF;
  RAISE NOTICE 'PASS 5';
END;
$a$;
