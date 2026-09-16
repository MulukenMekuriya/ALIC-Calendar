-- =============================================================================
-- One duplicated child: Salem Abel, in the Abel Yeshitila family
-- =============================================================================
--
-- The Breeze import matched ADULTS to existing records by email address.
-- Children have no email, so they were matched only on the import key
-- (member_number 'BRZ-K-…'), which a record created by hand before the import
-- does not carry. The Abel Yeshitila household already existed in production
-- and already held a Salem Abel, so the import added a second one.
--
-- This is the only such collision in the 423 children imported.
--
-- WHICH RECORD WINS
-- -----------------
--   the existing one (9e928c6e…)   birth year 2022, a school grade, and ONE
--                                  REAL CHECK-IN already on file — but no
--                                  approved collector at all
--   the imported one (08652000…)   no birthday, no grade, no history, but
--                                  3 parent relationships and 3 collectors
--
-- The existing record wins. It can be placed in a classroom automatically and
-- it carries a Sunday that actually happened; orphaning a check-in record to
-- keep a row with no birthday would be the wrong way round. What it is missing
-- — the parents, and who may collect it — is exactly what the import brought,
-- so that is copied across before the duplicate is retired.
--
-- Nothing is deleted. church.people documents the rule: "Duplicate resolution:
-- never delete, point the loser at the winner." The duplicate is deactivated
-- so the check-in desk stops offering two Salem Abels, and merged_into_person_id
-- records where it went.

BEGIN;

DO $fix$
DECLARE
  _org    UUID := 'a0eebc99-9c0b-4ef8-bb6d-6bb9bd380a11';
  _keep   UUID;   -- the record with the birthday and the check-in
  _retire UUID;   -- the one this import created
  _moved  INTEGER;
BEGIN
  SELECT c.id INTO _keep
    FROM church.people c
    JOIN church.household_members hm ON hm.person_id = c.id AND hm.end_date IS NULL
    JOIN church.households h ON h.id = hm.household_id
   WHERE c.organization_id = _org AND c.is_child
     AND h.name = 'Abel Yeshitila'
     AND lower(c.first_name || ' ' || c.last_name) = 'salem abel'
     AND c.member_number IS NULL;

  SELECT id INTO _retire
    FROM church.people
   WHERE organization_id = _org AND member_number = 'BRZ-K-51927772-2';

  IF _keep IS NULL OR _retire IS NULL THEN
    RAISE EXCEPTION 'Expected both Salem Abel records; found keep=% retire=%',
      _keep, _retire;
  END IF;

  -- Carry the collectors over. Without these the surviving record has nobody
  -- authorised to take the child home.
  INSERT INTO church.kids_pickup_authorizations (
    organization_id, child_person_id, authorized_person_id,
    relationship_note, created_by_name)
  SELECT _org, _keep, a.authorized_person_id,
         coalesce(a.relationship_note, 'Parent'),
         'Merged from duplicate record, Breeze import 2026-08-27'
    FROM church.kids_pickup_authorizations a
   WHERE a.child_person_id = _retire
  ON CONFLICT (child_person_id, authorized_person_id) DO NOTHING;
  GET DIAGNOSTICS _moved = ROW_COUNT;
  RAISE NOTICE 'collectors copied to the surviving record: %', _moved;

  -- And the parent relationships. One direction only; the mirror trigger
  -- writes the inverse.
  INSERT INTO church.person_relationships (
    organization_id, person_id, related_person_id, relationship_type_id)
  SELECT _org, r.person_id, _keep, r.relationship_type_id
    FROM church.person_relationships r
   WHERE r.related_person_id = _retire
     AND NOT r.is_mirrored
     AND r.person_id <> _keep
  ON CONFLICT (person_id, related_person_id, relationship_type_id) DO NOTHING;
  GET DIAGNOSTICS _moved = ROW_COUNT;
  RAISE NOTICE 'parent relationships copied: %', _moved;

  -- Retire the duplicate: out of the family, out of the desk's search, and
  -- pointed at the record that replaced it.
  UPDATE church.household_members
     SET end_date = CURRENT_DATE, updated_at = now()
   WHERE person_id = _retire AND end_date IS NULL;

  UPDATE church.people
     SET is_active             = false,
         inactive_reason       = 'Duplicate of the existing Salem Abel record',
         merged_into_person_id = _keep,
         notes                 = coalesce(notes || ' | ', '')
                                 || 'Created by the Breeze import 2026-08-27 as a '
                                 || 'duplicate of an existing record; merged into it.',
         updated_at            = now()
   WHERE id = _retire;

  RAISE NOTICE 'kept % (birthday + grade + check-in history), retired %',
    _keep, _retire;
END
$fix$;

-- What the family looks like afterwards.
SELECT c.first_name || ' ' || c.last_name          AS child,
       coalesce(c.member_number, '(pre-existing)') AS which,
       c.is_active,
       c.birth_year,
       (SELECT count(*) FROM church.kids_pickup_authorizations a
         WHERE a.child_person_id = c.id)           AS collectors
  FROM church.people c
 WHERE lower(c.first_name || ' ' || c.last_name) = 'salem abel'
   AND c.organization_id = 'a0eebc99-9c0b-4ef8-bb6d-6bb9bd380a11'
 ORDER BY c.is_active DESC;

COMMIT;
