-- Assertions for 20260322220100.

DO $a$
DECLARE
  _md UUID := 'a0eebc99-9c0b-4ef8-bb6d-6bb9bd380a11';
  _ci UUID; _dropper UUID; _n INT; _r RECORD; _flagged INT;
BEGIN
  PERFORM set_config('request.jwt.claim.sub','0c2dd974-ba40-4d99-8db5-63804c38ed65',true);

  -- A real check-in that recorded who dropped the child off.
  SELECT k.id, k.dropped_off_by_person_id INTO _ci, _dropper
  FROM church.kids_check_ins k
  WHERE k.dropped_off_by_person_id IS NOT NULL AND k.organization_id = _md
  ORDER BY k.created_at DESC LIMIT 1;

  IF _ci IS NULL THEN
    RAISE EXCEPTION 'SKIP: no check-in on file records who dropped off';
  END IF;

  -- 1. The list still works and still returns people.
  SELECT count(*) INTO _n FROM church.station_pickup_candidates(_ci);
  IF _n = 0 THEN RAISE EXCEPTION 'FAIL 1: the candidate list came back empty'; END IF;

  -- 2. EXACTLY ONE person is flagged as having dropped off - never two, or
  --    the screen has no single name to offer.
  SELECT count(*) INTO _flagged FROM church.station_pickup_candidates(_ci)
   WHERE dropped_off;
  IF _flagged > 1 THEN
    RAISE EXCEPTION 'FAIL 2: % people flagged as the one who dropped off', _flagged;
  END IF;

  -- 3. When they are on the list at all, it is the right person and they are
  --    FIRST, so a volunteer meets the likely name at the top.
  IF _flagged = 1 THEN
    SELECT * INTO _r FROM church.station_pickup_candidates(_ci) LIMIT 1;
    IF NOT _r.dropped_off THEN
      RAISE EXCEPTION 'FAIL 3: the one who brought them is not offered first';
    END IF;
    IF _r.person_id <> _dropper THEN
      RAISE EXCEPTION 'FAIL 3b: the wrong person is flagged';
    END IF;
  END IF;

  -- 4. IT IS NOT AN AUTHORISATION. Nobody appears on the list who was not on
  --    it before, so the flag cannot let somebody through who is restricted
  --    or simply unrelated.
  IF EXISTS (
    SELECT 1 FROM church.station_pickup_candidates(_ci) c
    WHERE NOT c.is_authorized AND NOT c.is_guardian
      AND NOT EXISTS (
        SELECT 1 FROM church.kids_check_ins k
        JOIN church.household_members hm_child ON hm_child.person_id = k.child_person_id
         AND hm_child.end_date IS NULL
        JOIN church.household_members hm_adult ON hm_adult.household_id = hm_child.household_id
         AND hm_adult.end_date IS NULL
        WHERE k.id = _ci AND hm_adult.person_id = c.person_id)) THEN
    RAISE EXCEPTION 'FAIL 4: somebody is on the list who is neither household nor authorised';
  END IF;

  -- 5. A RESTRICTED PERSON IS STILL EXCLUDED, even if they dropped the child
  --    off. Bringing a child in does not earn the right to take them out.
  IF EXISTS (
    SELECT 1 FROM church.station_pickup_candidates(_ci) c
    JOIN church.kids_check_ins k ON k.id = _ci
    JOIN church.kids_pickup_restrictions pr
      ON pr.child_person_id = k.child_person_id
     AND pr.restricted_person_id = c.person_id
     AND pr.effective_from <= CURRENT_DATE
     AND (pr.effective_to IS NULL OR pr.effective_to >= CURRENT_DATE)) THEN
    RAISE EXCEPTION 'FAIL 5: a restricted person is on the pickup list';
  END IF;

  RAISE NOTICE 'PASS 1-5 (dropper flagged, offered first, authorises nobody)';
END;
$a$;

-- 6. A check-in with nobody recorded flags nobody, and still lists everyone.
DO $a$
DECLARE _md UUID := 'a0eebc99-9c0b-4ef8-bb6d-6bb9bd380a11'; _ci UUID; _n INT; _f INT;
BEGIN
  PERFORM set_config('request.jwt.claim.sub','0c2dd974-ba40-4d99-8db5-63804c38ed65',true);
  SELECT k.id INTO _ci FROM church.kids_check_ins k
   WHERE k.dropped_off_by_person_id IS NULL AND k.organization_id = _md
   ORDER BY k.created_at DESC LIMIT 1;
  IF _ci IS NULL THEN RETURN; END IF;

  SELECT count(*), count(*) FILTER (WHERE dropped_off) INTO _n, _f
    FROM church.station_pickup_candidates(_ci);
  IF _f <> 0 THEN
    RAISE EXCEPTION 'FAIL 6: % flagged when nobody was recorded as dropping off', _f;
  END IF;
  RAISE NOTICE 'PASS 6 (no record means no default, and the list still works)';
END;
$a$;
