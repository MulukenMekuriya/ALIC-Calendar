-- =====================================================
-- A new login belongs to the branch that made it
-- =====================================================
--
-- public.handle_new_user has hardcoded the VA branch since 20251225000002:
--
--     va_org_id UUID := 'b1eebc99-9c0b-4ef8-bb6d-6bb9bd380a22';
--     ...
--     INSERT INTO public.profiles (..., default_organization_id) VALUES (..., va_org_id)
--     INSERT INTO public.user_organizations (...) VALUES (NEW.id, va_org_id, 'member', true)
--
-- That was harmless while every account was created by hand for a specific
-- person. It stops being harmless on Sunday, because the QR-code page creates
-- accounts by the hundred — and the trigger fires for those too.
--
-- WHAT IT BREAKS, precisely. OrganizationContext picks the current branch from
-- profiles.default_organization_id first (it falls back to is_primary, then to
-- the first membership). So a member at Silver Spring who scans the code gets:
--
--     profiles.default_organization_id = VA          <- from the trigger
--     user_organizations: VA (trigger) + MD (us)
--     church.people row: MD, linked to this login    <- correct
--
-- and the portal then calls church.my_portal_summary(VA), finds no person in
-- VA, and tells them:
--
--     "Your login is not linked to a member record yet"
--
-- Which is the exact sentence this whole feature exists to prevent, delivered
-- to every single person who uses it. The record is right; the app is looking
-- in the other building.
--
-- THE FIX IS IN OUR FUNCTION, NOT IN THE TRIGGER. handle_new_user runs for
-- every signup in the project and has no idea which branch anybody meant —
-- there is no context at auth.users INSERT time to give it one. But
-- church.claim_attach_login is called at the exact moment the branch IS known:
-- it is being handed a person, and a person belongs to a branch. So it now
-- says so.
--
-- WHOSE DEFAULT IS LEFT ALONE. Somebody who already has a person record in
-- their current default branch has a real reason to be pointed there — a
-- director at Springfield claiming their record at Silver Spring should not be
-- moved to Silver Spring by doing it. The update is skipped for them.
--
-- The spurious VA membership row is deliberately NOT deleted. A handful of
-- people genuinely belong to both branches, nothing here can tell those apart
-- from the trigger's leftovers, and an extra row on the floor tier reaches no
-- internal tool (20260321001600). It is untidy; it is not a disclosure.
CREATE OR REPLACE FUNCTION church.claim_attach_login(
  _person_id UUID,
  _auth_user_id UUID
)
RETURNS BOOLEAN
LANGUAGE plpgsql VOLATILE SECURITY DEFINER
SET search_path = church, public
AS $$
DECLARE
  p church.people%ROWTYPE;
BEGIN
  SELECT * INTO p FROM church.people
   WHERE id = _person_id AND merged_into_person_id IS NULL;
  IF NOT FOUND THEN
    RAISE EXCEPTION 'person_not_found';
  END IF;

  IF p.profile_id IS NOT NULL AND p.profile_id <> _auth_user_id THEN
    RAISE EXCEPTION 'person_already_has_a_login' USING ERRCODE = '42501';
  END IF;

  IF EXISTS (
    SELECT 1 FROM church.people other
     WHERE other.profile_id = _auth_user_id
       AND other.organization_id = p.organization_id
       AND other.id <> _person_id
       AND other.merged_into_person_id IS NULL
  ) THEN
    RAISE EXCEPTION 'login_already_belongs_to_someone_else' USING ERRCODE = '42501';
  END IF;

  UPDATE church.people SET profile_id = _auth_user_id, updated_at = now()
   WHERE id = _person_id AND profile_id IS DISTINCT FROM _auth_user_id;

  INSERT INTO public.user_organizations (user_id, organization_id, role, is_primary)
  VALUES (_auth_user_id, p.organization_id, 'member', true)
  ON CONFLICT (user_id, organization_id) DO NOTHING;

  -- NEW at 20260322120000. Point the app at the branch this person is actually
  -- in, unless the login already has a record in the branch it is pointed at.
  UPDATE public.profiles pr
     SET default_organization_id = p.organization_id
   WHERE pr.id = _auth_user_id
     AND pr.default_organization_id IS DISTINCT FROM p.organization_id
     AND NOT EXISTS (
       SELECT 1 FROM church.people mine
        WHERE mine.profile_id = _auth_user_id
          AND mine.organization_id = pr.default_organization_id
          AND mine.merged_into_person_id IS NULL);

  INSERT INTO church.people_history (
    organization_id, person_id, action, field_name, old_value, new_value,
    actor_id, actor_name, notes)
  VALUES (
    p.organization_id, p.id, 'self_update', 'profile_id', NULL,
    _auth_user_id::TEXT, _auth_user_id,
    coalesce((SELECT full_name FROM public.profiles WHERE id = _auth_user_id), 'Self'),
    'Claimed from the QR code page');

  RETURN true;
END;
$$;

GRANT EXECUTE ON FUNCTION church.claim_attach_login(UUID, UUID) TO service_role;

-- ---------------------------------------------------------------------------
-- The ones already made this way
-- ---------------------------------------------------------------------------
-- Anybody whose login was pointed at a branch they have no record in, and who
-- DOES have a record in exactly one other branch, is pointed at that one
-- instead. Touches nobody who belongs to two, and nobody already correct.
UPDATE public.profiles pr
   SET default_organization_id = only_one.organization_id
  FROM (
    -- (array_agg(DISTINCT ...))[1] rather than min(): there is no min(uuid) in
    -- Postgres, and the HAVING below guarantees there is exactly one anyway.
    SELECT p.profile_id, (array_agg(DISTINCT p.organization_id))[1] AS organization_id
    FROM church.people p
    WHERE p.profile_id IS NOT NULL
      AND p.merged_into_person_id IS NULL
    GROUP BY p.profile_id
    HAVING count(DISTINCT p.organization_id) = 1
  ) AS only_one
 WHERE pr.id = only_one.profile_id
   AND pr.default_organization_id IS DISTINCT FROM only_one.organization_id
   AND NOT EXISTS (
     SELECT 1 FROM church.people mine
      WHERE mine.profile_id = pr.id
        AND mine.organization_id = pr.default_organization_id
        AND mine.merged_into_person_id IS NULL);

NOTIFY pgrst, 'reload schema';
