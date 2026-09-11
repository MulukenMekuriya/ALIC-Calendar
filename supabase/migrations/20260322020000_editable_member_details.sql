-- =====================================================
-- A member record anyone entitled to fix it can actually fix
-- =====================================================
--
-- Two gaps, both visible the moment 582 imported records landed:
--
--   * A MEMBER could change their phone number and their email address, and
--     nothing else. church.update_my_contact_details takes exactly those two
--     arguments. The import brought in names the church had typed in ALL CAPS,
--     surnames that were really a father's name, and 560 people with no gender
--     on file — and the only way to correct any of it was to telephone the
--     office.
--
--   * An ADMIN had no edit path at all. church.people carries an UPDATE policy
--     for members_admin, so the permission was there, but /members/:id is a
--     read-only screen and /members/new only creates. The office could add a
--     member and archive a member, and could not amend one.
--
-- This is one RPC for both, because the alternative is two implementations of
-- the same field list that drift apart — and the one that drifts is the one
-- that forgets to validate the email address.
--
-- WHO MAY CHANGE WHAT
-- -------------------
-- A member may change everything on their OWN record except the fields below,
-- which is the church's explicit decision. Notes and membership status are
-- included deliberately: this is a directory the member is a participant in,
-- not a file kept about them.
--
-- Reserved to members_admin / members_import, for everybody:
--
--   is_active, inactive_reason   Archiving. Excluded at the church's direction
--                                — leaving is a conversation, not a checkbox.
--
--   is_child                     NOT a preference. church.is_approved_collector
--                                authorises a household's adults through
--                                `NOT p.is_child`, so this one boolean decides
--                                who may collect a child from the Sunday desk.
--                                It is Kids Ministry's call, and 20260320000400
--                                says so: "a human decides, the UI suggests".
--
--   member_number                The office's key, unique per branch. A member
--                                editing it breaks the import's ability to
--                                recognise them next year.
--
--   school_grade_id              What classroom a child is placed in.
--
--   profile_id, organization_id, merged_into_person_id
--                                Structural. Not fields, plumbing.
--
-- Patch semantics: only keys PRESENT in the JSONB are touched. Omit a key and
-- the value is left alone; pass an explicit null and it is cleared. That
-- distinction matters — a form that posts every field would otherwise wipe
-- whatever it does not render.

-- ---------------------------------------------------------------------------
-- Field-level diff, so history says what changed
-- ---------------------------------------------------------------------------
-- to_jsonb() on each row and a key-by-key comparison, rather than 22 hand
-- written comparisons that will not be updated when a column is added.
CREATE OR REPLACE FUNCTION church.person_field_diff(
  _before church.people,
  _after  church.people,
  _patch  JSONB
)
RETURNS TABLE (field TEXT, old_value TEXT, new_value TEXT)
LANGUAGE sql IMMUTABLE
SET search_path = church, public
AS $$
  SELECT k,
         to_jsonb(_before) ->> k,
         to_jsonb(_after)  ->> k
    FROM jsonb_object_keys(_patch) AS k
   WHERE (to_jsonb(_before) ->> k) IS DISTINCT FROM (to_jsonb(_after) ->> k);
$$;

REVOKE ALL ON FUNCTION church.person_field_diff(church.people, church.people, JSONB) FROM PUBLIC;
GRANT EXECUTE ON FUNCTION church.person_field_diff(church.people, church.people, JSONB) TO authenticated;

CREATE OR REPLACE FUNCTION church.update_person_details(
  _person_id UUID,
  _patch     JSONB
)
RETURNS church.people
LANGUAGE plpgsql VOLATILE SECURITY DEFINER
SET search_path = church, public, extensions
AS $$
DECLARE
  p        church.people%ROWTYPE;
  _before  church.people%ROWTYPE;
  _is_self BOOLEAN;
  _is_admin BOOLEAN;
  _actor   TEXT;
  _bad     TEXT[];

  -- Everything a member may set on their own record.
  _open TEXT[] := ARRAY[
    'first_name', 'middle_name', 'last_name', 'preferred_name', 'amharic_name',
    'birth_year', 'birth_month', 'gender', 'marital_status',
    'email', 'phone', 'membership_status_id', 'member_since',
    'accepted_lord_year', 'accepted_lord_month', 'accepted_lord_is_approximate',
    'notes'];
  -- Everything that additionally requires the members module.
  _admin_only TEXT[] := ARRAY[
    'is_active', 'inactive_reason', 'is_child', 'member_number',
    'school_grade_id'];
BEGIN
  IF auth.uid() IS NULL THEN
    RAISE EXCEPTION 'not_authenticated' USING ERRCODE = '28000';
  END IF;

  SELECT * INTO _before FROM church.people
   WHERE id = _person_id AND merged_into_person_id IS NULL;
  IF NOT FOUND THEN
    RAISE EXCEPTION 'person_not_found';
  END IF;

  -- coalesce, NOT a bare comparison. Most member records have no profile_id at
  -- all — 40 of the imported 582, and every child — so `profile_id = auth.uid()`
  -- evaluates to NULL rather than false, and `IF NOT (NULL OR false)` is NULL,
  -- which does not fire. Without this, any signed-in member could edit any
  -- person who has no login. Caught by the permission test, not by reading.
  _is_self  := coalesce(_before.profile_id = auth.uid(), false);
  _is_admin := coalesce(church.has_permission_in_org(
                 _before.organization_id,
                 ARRAY['members_admin', 'members_import']::church.module_permission[]), false);

  IF NOT (_is_self OR _is_admin) THEN
    RAISE EXCEPTION 'not_your_record' USING ERRCODE = '42501';
  END IF;

  -- Refuse the whole patch rather than silently dropping the parts the caller
  -- may not set. A form that quietly discards half its fields teaches people
  -- the save button lies.
  SELECT array_agg(k) INTO _bad
    FROM jsonb_object_keys(_patch) AS k
   WHERE NOT (k = ANY(_open) OR (k = ANY(_admin_only) AND _is_admin));
  IF _bad IS NOT NULL THEN
    IF EXISTS (SELECT 1 FROM unnest(_bad) b WHERE b = ANY(_admin_only)) THEN
      RAISE EXCEPTION 'requires_members_admin: %', array_to_string(_bad, ', ')
        USING ERRCODE = '42501';
    END IF;
    RAISE EXCEPTION 'unknown_field: %', array_to_string(_bad, ', ');
  END IF;

  -- ---------------------------------------------------------------- validate
  IF _patch ? 'email' AND coalesce(btrim(_patch->>'email'), '') <> ''
     AND btrim(_patch->>'email') !~ '^[^@[:space:]]+@[^@[:space:]]+\.[^@[:space:]]+$' THEN
    RAISE EXCEPTION 'invalid_email';
  END IF;

  IF _patch ? 'first_name' AND coalesce(btrim(_patch->>'first_name'), '') = '' THEN
    RAISE EXCEPTION 'first_name_required';
  END IF;
  IF _patch ? 'last_name' AND coalesce(btrim(_patch->>'last_name'), '') = '' THEN
    RAISE EXCEPTION 'last_name_required';
  END IF;

  IF _patch ? 'membership_status_id'
     AND NULLIF(btrim(coalesce(_patch->>'membership_status_id', '')), '') IS NOT NULL
     AND NOT EXISTS (
       SELECT 1 FROM church.membership_statuses ms
        WHERE ms.id = (_patch->>'membership_status_id')::UUID
          AND ms.organization_id = _before.organization_id) THEN
    RAISE EXCEPTION 'status_belongs_to_another_branch';
  END IF;

  -- ------------------------------------------------------------------- apply
  -- COALESCE on the jsonb operator, not on the column: `_patch ? key` is what
  -- decides whether a field is touched, so an explicit null clears and an
  -- absent key does not.
  UPDATE church.people SET
    first_name = CASE WHEN _patch ? 'first_name'
                      THEN btrim(_patch->>'first_name') ELSE first_name END,
    middle_name = CASE WHEN _patch ? 'middle_name'
                      THEN NULLIF(btrim(coalesce(_patch->>'middle_name','')),'') ELSE middle_name END,
    last_name = CASE WHEN _patch ? 'last_name'
                      THEN btrim(_patch->>'last_name') ELSE last_name END,
    preferred_name = CASE WHEN _patch ? 'preferred_name'
                      THEN NULLIF(btrim(coalesce(_patch->>'preferred_name','')),'') ELSE preferred_name END,
    amharic_name = CASE WHEN _patch ? 'amharic_name'
                      THEN NULLIF(btrim(coalesce(_patch->>'amharic_name','')),'') ELSE amharic_name END,
    birth_year = CASE WHEN _patch ? 'birth_year'
                      THEN NULLIF(_patch->>'birth_year','')::SMALLINT ELSE birth_year END,
    birth_month = CASE WHEN _patch ? 'birth_month'
                      THEN NULLIF(_patch->>'birth_month','')::SMALLINT ELSE birth_month END,
    gender = CASE WHEN _patch ? 'gender'
                      THEN NULLIF(btrim(coalesce(_patch->>'gender','')),'') ELSE gender END,
    marital_status = CASE WHEN _patch ? 'marital_status'
                      THEN NULLIF(btrim(coalesce(_patch->>'marital_status','')),'') ELSE marital_status END,
    email = CASE WHEN _patch ? 'email'
                      THEN NULLIF(btrim(coalesce(_patch->>'email','')),'') ELSE email END,
    phone = CASE WHEN _patch ? 'phone'
                      THEN NULLIF(btrim(coalesce(_patch->>'phone','')),'') ELSE phone END,
    membership_status_id = CASE WHEN _patch ? 'membership_status_id'
                      THEN NULLIF(_patch->>'membership_status_id','')::UUID ELSE membership_status_id END,
    member_since = CASE WHEN _patch ? 'member_since'
                      THEN NULLIF(_patch->>'member_since','')::DATE ELSE member_since END,
    accepted_lord_year = CASE WHEN _patch ? 'accepted_lord_year'
                      THEN NULLIF(_patch->>'accepted_lord_year','')::SMALLINT ELSE accepted_lord_year END,
    accepted_lord_month = CASE WHEN _patch ? 'accepted_lord_month'
                      THEN NULLIF(_patch->>'accepted_lord_month','')::SMALLINT ELSE accepted_lord_month END,
    accepted_lord_is_approximate = CASE WHEN _patch ? 'accepted_lord_is_approximate'
                      THEN coalesce((_patch->>'accepted_lord_is_approximate')::BOOLEAN, false)
                      ELSE accepted_lord_is_approximate END,
    notes = CASE WHEN _patch ? 'notes'
                      THEN NULLIF(btrim(coalesce(_patch->>'notes','')),'') ELSE notes END,
    -- admin-only from here
    is_active = CASE WHEN _patch ? 'is_active'
                      THEN coalesce((_patch->>'is_active')::BOOLEAN, true) ELSE is_active END,
    inactive_reason = CASE WHEN _patch ? 'inactive_reason'
                      THEN NULLIF(btrim(coalesce(_patch->>'inactive_reason','')),'') ELSE inactive_reason END,
    is_child = CASE WHEN _patch ? 'is_child'
                      THEN coalesce((_patch->>'is_child')::BOOLEAN, false) ELSE is_child END,
    member_number = CASE WHEN _patch ? 'member_number'
                      THEN NULLIF(btrim(coalesce(_patch->>'member_number','')),'') ELSE member_number END,
    school_grade_id = CASE WHEN _patch ? 'school_grade_id'
                      THEN NULLIF(_patch->>'school_grade_id','')::UUID ELSE school_grade_id END,
    updated_at = now()
  WHERE id = _person_id
  RETURNING * INTO p;

  -- ----------------------------------------------------------------- history
  -- One row per field that actually changed, so the office can see what moved
  -- rather than "somebody saved this record".
  _actor := coalesce(
    (SELECT full_name FROM public.profiles WHERE id = auth.uid()),
    (SELECT email FROM public.profiles WHERE id = auth.uid()),
    'Unknown');

  INSERT INTO church.people_history (
    organization_id, person_id, action, field_name, old_value, new_value,
    actor_id, actor_name, notes)
  SELECT p.organization_id, p.id,
         CASE WHEN _is_self AND NOT _is_admin THEN 'self_update' ELSE 'admin_update' END,
         d.field, d.old_value, d.new_value,
         auth.uid(), _actor,
         CASE WHEN _is_self AND NOT _is_admin
              THEN 'Updated by the member on their own record'
              ELSE 'Updated by an administrator' END
    FROM church.person_field_diff(_before, p, _patch) d
   WHERE d.old_value IS DISTINCT FROM d.new_value;

  RETURN p;
END;
$$;

REVOKE ALL ON FUNCTION church.update_person_details(UUID, JSONB) FROM PUBLIC;
GRANT EXECUTE ON FUNCTION church.update_person_details(UUID, JSONB) TO authenticated;

COMMENT ON FUNCTION church.update_person_details(UUID, JSONB) IS
  'Amends one member record. A member may change anything on their own record '
  'except archiving, the is_child flag, their member number and a school '
  'grade; a members_admin may change all of it, on anybody. Only keys present '
  'in the patch are touched, and every field that actually changed is written '
  'to church.people_history.';

-- church.update_my_contact_details stays exactly as it is. MyInformation still
-- calls it, older clients still work, and it is now the narrow case of the
-- function above rather than the only way in.

NOTIFY pgrst, 'reload schema';
