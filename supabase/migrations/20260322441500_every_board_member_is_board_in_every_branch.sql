-- =====================================================
-- A Board member is Board in every branch
-- =====================================================
--
-- The Board is appointed to weigh MD and VA together. The role was stored per
-- branch, so a Board member made Board in one branch and forgotten in the other
-- saw an empty page there (board@alic.org did, until 441000 fixed it by hand).
--
-- This keeps user_organizations in step so nobody has to remember:
--
--   * Making someone Board in a branch makes them Board in every branch: a
--     missing row is added, a plain member row is upgraded.
--   * Board does not mix with staff. If they already hold admin, treasury,
--     finance or contributor in another branch, the change is refused, with the
--     branch named, rather than quietly demoting anyone.
--   * Taking Board away in one branch (a different role, or removing the row)
--     takes it away everywhere: their other Board rows become plain member.
--   * A branch created later gives every Board member a row.
--
-- The cascade runs one level deep (pg_trigger_depth), so its own writes do not
-- start it again.

CREATE OR REPLACE FUNCTION public.keep_board_in_every_branch()
RETURNS trigger
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  _org RECORD;
  _existing public.app_role;
  _email text;
  _user uuid := coalesce(NEW.user_id, OLD.user_id);
BEGIN
  IF pg_trigger_depth() > 1 THEN
    RETURN coalesce(NEW, OLD);
  END IF;

  -- Became Board here: be Board everywhere.
  IF TG_OP IN ('INSERT', 'UPDATE') AND NEW.role = 'board'
     AND (TG_OP = 'INSERT' OR OLD.role IS DISTINCT FROM 'board') THEN
    _email := NEW.email;
    FOR _org IN SELECT id, name FROM public.organizations WHERE id <> NEW.organization_id LOOP
      SELECT role INTO _existing FROM public.user_organizations
       WHERE user_id = _user AND organization_id = _org.id;

      IF NOT FOUND THEN
        INSERT INTO public.user_organizations (user_id, organization_id, role, is_primary, email)
        VALUES (_user, _org.id, 'board', false, _email);
      ELSIF _existing = 'member' THEN
        UPDATE public.user_organizations SET role = 'board'
         WHERE user_id = _user AND organization_id = _org.id;
      ELSIF _existing <> 'board' THEN
        RAISE EXCEPTION 'This person is already % in %. A Board member cannot also hold a branch role: change that first.',
          _existing, _org.name
          USING ERRCODE = 'check_violation';
      END IF;
    END LOOP;
    RETURN NEW;
  END IF;

  -- Stopped being Board here: stop being Board everywhere.
  IF (TG_OP = 'DELETE' AND OLD.role = 'board')
     OR (TG_OP = 'UPDATE' AND OLD.role = 'board' AND NEW.role <> 'board') THEN
    UPDATE public.user_organizations SET role = 'member'
     WHERE user_id = _user AND organization_id <> OLD.organization_id AND role = 'board';
  END IF;

  RETURN coalesce(NEW, OLD);
END;
$$;

DROP TRIGGER IF EXISTS trg_keep_board_in_every_branch ON public.user_organizations;
CREATE TRIGGER trg_keep_board_in_every_branch
  AFTER INSERT OR UPDATE OF role OR DELETE ON public.user_organizations
  FOR EACH ROW EXECUTE FUNCTION public.keep_board_in_every_branch();

-- A branch created later: every Board member gets a row in it.
CREATE OR REPLACE FUNCTION public.board_joins_new_branch()
RETURNS trigger
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
BEGIN
  INSERT INTO public.user_organizations (user_id, organization_id, role, is_primary, email)
  SELECT DISTINCT ON (uo.user_id) uo.user_id, NEW.id, 'board', false, uo.email
    FROM public.user_organizations uo
   WHERE uo.role = 'board'
  ON CONFLICT (user_id, organization_id) DO NOTHING;
  RETURN NEW;
END;
$$;

DROP TRIGGER IF EXISTS trg_board_joins_new_branch ON public.organizations;
CREATE TRIGGER trg_board_joins_new_branch
  AFTER INSERT ON public.organizations
  FOR EACH ROW EXECUTE FUNCTION public.board_joins_new_branch();

REVOKE ALL ON FUNCTION public.keep_board_in_every_branch() FROM PUBLIC, anon, authenticated;
REVOKE ALL ON FUNCTION public.board_joins_new_branch() FROM PUBLIC, anon, authenticated;

-- Today's Board members, brought in line. A conflict is reported and left for a
-- person to settle, not forced.
DO $backfill$
DECLARE
  _b RECORD;
  _org RECORD;
  _existing public.app_role;
BEGIN
  FOR _b IN SELECT DISTINCT ON (user_id) user_id, email FROM public.user_organizations WHERE role = 'board' LOOP
    FOR _org IN SELECT id, name FROM public.organizations LOOP
      SELECT role INTO _existing FROM public.user_organizations
       WHERE user_id = _b.user_id AND organization_id = _org.id;
      IF NOT FOUND THEN
        INSERT INTO public.user_organizations (user_id, organization_id, role, is_primary, email)
        VALUES (_b.user_id, _org.id, 'board', false, _b.email);
        RAISE NOTICE '% made Board in %', _b.email, _org.name;
      ELSIF _existing = 'member' THEN
        UPDATE public.user_organizations SET role = 'board'
         WHERE user_id = _b.user_id AND organization_id = _org.id;
        RAISE NOTICE '% made Board in %', _b.email, _org.name;
      ELSIF _existing <> 'board' THEN
        RAISE NOTICE '% is % in %: left alone', _b.email, _existing, _org.name;
      END IF;
    END LOOP;
  END LOOP;
END;
$backfill$;
