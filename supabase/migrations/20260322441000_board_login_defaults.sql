-- =====================================================
-- Two logins that open on the wrong branch
-- =====================================================
--
-- public.handle_new_user writes a 'member' row in VA and points
-- profiles.default_organization_id at VA for every new login, wherever the
-- login was really made. Two staff logins were left like that:
--
--   board@alic.org       is Board in MD, with a stray VA 'member' row, and a
--                        default of VA.
--   biruckfeysa@gmail.com is a VA contributor, with a stray MD 'member' row,
--                        and a default of MD.
--
-- The Budget page opens on the profile's default branch. For each of them
-- that branch treats them as a plain member, and the restrictive staff
-- policies show a member nothing: no fiscal years (so no "2027" in the year
-- list), and the allocation list, with no year to filter on, came back with
-- the other branch's rows ("the allocation shows MD data").
--
-- The user, 28 October 2026: the Board is Board in BOTH branches, and sees
-- both. So the Board's VA row becomes 'board' rather than being deleted, and
-- its default is MD. The contributor's default goes to VA, where they work.
-- Their stray MD 'member' row is left alone, like every other one
-- (20260322120000 explains why those are not deleted).
--
-- Written to touch only these two people and only if they are still as found,
-- so running it twice, or after someone has fixed one by hand, changes
-- nothing.

DO $fix$
DECLARE
  _md CONSTANT UUID := 'a0eebc99-9c0b-4ef8-bb6d-6bb9bd380a11';
  _va CONSTANT UUID := 'b1eebc99-9c0b-4ef8-bb6d-6bb9bd380a22';
  _board UUID;
  _leader UUID;
  _n INTEGER;
BEGIN
  SELECT id INTO _board  FROM auth.users WHERE lower(email) = 'board@alic.org';
  SELECT id INTO _leader FROM auth.users WHERE lower(email) = 'biruckfeysa@gmail.com';

  IF _board IS NOT NULL THEN
    -- The Board holds the Board tier in the other branch too. Only a plain
    -- member row is upgraded; anything else somebody set is left as it is.
    UPDATE public.user_organizations
       SET role = 'board', is_primary = false
     WHERE user_id = _board AND organization_id = _va AND role = 'member';
    GET DIAGNOSTICS _n = ROW_COUNT;
    RAISE NOTICE 'board@alic.org: % VA row(s) made board', _n;

    UPDATE public.profiles
       SET default_organization_id = _md
     WHERE id = _board AND default_organization_id = _va;
    GET DIAGNOSTICS _n = ROW_COUNT;
    RAISE NOTICE 'board@alic.org: % default(s) moved to MD', _n;
  ELSE
    RAISE NOTICE 'board@alic.org does not exist here; nothing done for it';
  END IF;

  IF _leader IS NOT NULL THEN
    UPDATE public.profiles
       SET default_organization_id = _va
     WHERE id = _leader AND default_organization_id = _md
       AND EXISTS (SELECT 1 FROM public.user_organizations uo
                    WHERE uo.user_id = _leader AND uo.organization_id = _va
                      AND uo.role = 'contributor');
    GET DIAGNOSTICS _n = ROW_COUNT;
    RAISE NOTICE 'biruckfeysa@gmail.com: % default(s) moved to VA', _n;
  ELSE
    RAISE NOTICE 'biruckfeysa@gmail.com does not exist here; nothing done for them';
  END IF;
END;
$fix$;
