-- =====================================================
-- The portal's front page answers "what now", not only "what happened"
-- =====================================================
--
-- 20260322000600 gave the member portal six numbers and three tables, and
-- every one of them looks backwards: what you gave, who is in your household,
-- which Sundays your children were collected. Nothing on it told a member what
-- is happening next or what is waiting on them.
--
-- Worse, two of the six numbers named things the portal had no screen for at
-- all. "Serving 2" and "Groups 1" were counted in my_portal_summary and then
-- led nowhere — a member was told a number and given no door. A count you
-- cannot open is decoration, and decoration on a page about someone's own life
-- in the church reads as the church not quite trusting them with the detail.
--
-- Four additions. Each is the same shape as everything already in the portal:
-- no person_id parameter, scoped through church.my_person_ids() and nothing
-- else, SECURITY DEFINER because the underlying tables are behind module RLS
-- aimed at staff and a member holds no module grant at all.
--
-- WHAT IS DELIBERATELY NOT HERE
-- -----------------------------
--
--  - An upcoming-events function. public.events already lets a member read
--    published rows: 20260321001600 restricted writes and left reads alone on
--    purpose, so that a signed-in member is never shown less than the
--    anonymous passer-by who can read /public. public.rooms is readable for
--    the same reason. The portal therefore selects events straight from
--    PostgREST and lets those policies do their job. Wrapping it in a definer
--    would mean re-implementing the org-membership check by hand inside the
--    definer, which is a way to get it wrong, not a way to get it right.
--
--  - A serving rota. "You are on the sound desk this Sunday at nine" is the
--    single thing a member would most like this page to say, and this database
--    cannot say it: church.ministry_assignments holds a start date and an end
--    date, which is a membership, not a schedule. Rendering a rota from it
--    would mean inventing the data. What my_serving() returns instead is what
--    is actually recorded — where you serve, in what role, since when.
--
--  - A household giving total, still. my_statement() below is the member's own
--    giving and only ever that. The reasoning has not changed since
--    20260322000200: the household figure belongs on the document the
--    treasurer issues to the household together, and putting it behind one
--    spouse's login turns a shared letter into something one spouse can look
--    up about the other.

-- ---------------------------------------------------------------------------
-- Where I serve
-- ---------------------------------------------------------------------------
--
-- Ministry names live in budget.ministries, which carries a RESTRICTIVE policy
-- shutting members out entirely ("Members cannot reach ministries without a
-- grant", 20260321001600). That is right for the ministry LIST — a member has
-- no business reading the church's cost centres — and wrong for the four words
-- naming where that same member turns up every Sunday. The definer boundary is
-- what lets both be true, and it is safe here for the usual reason: the
-- function takes no argument that could widen it past the caller.
--
-- is_serving_ministry is NOT filtered. 20260322030000 added that flag to stop
-- the Add dropdown offering budget-only cost centres; it governs where a
-- person may be PLACED, not what is true of a person already placed. Filtering
-- on it here would silently drop a live assignment from the server's own view
-- of their service, and leave a summary count of 2 above a list of 1.
CREATE OR REPLACE FUNCTION church.my_serving()
RETURNS TABLE (
  assignment_id UUID,
  organization_id UUID,
  ministry_name TEXT,
  role_name TEXT,
  is_leadership_role BOOLEAN,
  is_primary_role BOOLEAN,
  start_date DATE
)
LANGUAGE sql STABLE SECURITY DEFINER
SET search_path = church, public
AS $$
  SELECT
    ma.id,
    ma.organization_id,
    m.name,
    r.display_name,
    r.is_leadership_role,
    ma.is_primary_role,
    ma.start_date
  FROM church.ministry_assignments ma
  JOIN budget.ministries m ON m.id = ma.ministry_id
  JOIN church.ministry_roles r ON r.id = ma.ministry_role_id
  WHERE ma.person_id IN (SELECT * FROM church.my_person_ids())
    AND ma.end_date IS NULL
  ORDER BY ma.is_primary_role DESC, m.name
$$;

-- ---------------------------------------------------------------------------
-- The groups I belong to, and when they meet
-- ---------------------------------------------------------------------------
--
-- The meeting day, time and place are the point of this one. "Groups: 1" told
-- a member a fact they already knew; "Wednesday 7:00pm, Fellowship Hall" is
-- the thing they would otherwise have to text somebody to find out, and it is
-- sitting in church.groups unread.
--
-- location falls back to the room name rather than the other way round: a
-- group that meets in a member's living room has a free-text location and no
-- room, a group that meets on site has a room and usually no location, and
-- where both are set the typed one is the more specific.
CREATE OR REPLACE FUNCTION church.my_groups()
RETURNS TABLE (
  membership_id UUID,
  organization_id UUID,
  group_name TEXT,
  group_type TEXT,
  role_name TEXT,
  is_leadership_role BOOLEAN,
  meeting_day TEXT,
  meeting_time TIME,
  meeting_place TEXT
)
LANGUAGE sql STABLE SECURITY DEFINER
SET search_path = church, public
AS $$
  SELECT
    gm.id,
    gm.organization_id,
    g.name,
    gt.display_name,
    r.display_name,
    r.is_leadership_role,
    g.meeting_day,
    g.meeting_time,
    coalesce(nullif(trim(g.location), ''), rm.name)
  FROM church.group_memberships gm
  JOIN church.groups g ON g.id = gm.group_id
  JOIN church.group_types gt ON gt.id = g.group_type_id
  JOIN church.ministry_roles r ON r.id = gm.role_id
  LEFT JOIN public.rooms rm ON rm.id = g.room_id
  WHERE gm.person_id IN (SELECT * FROM church.my_person_ids())
    AND gm.end_date IS NULL
    AND g.is_active
  ORDER BY g.name
$$;

-- ---------------------------------------------------------------------------
-- My own contribution statement
-- ---------------------------------------------------------------------------
--
-- Every January the office fields the same telephone call: "can you send me
-- my statement again". church.giving_statement already builds the document,
-- but it asserts giving_admin and takes a recipient id, so it is the
-- treasurer's tool and a member cannot reach it. This is the same JSONB shape
-- — deliberately, so the browser prints it through the one template in
-- utils/statementTemplate and there is no second statement layout to drift —
-- scoped to the caller and nobody.
--
-- ONE SUBTLETY THAT MATTERS. The person branch of giving_statement matches
-- `d.person_id = _person_id AND d.household_id IS NULL`, because the treasurer
-- issuing personal statements must not double-count a gift that will also
-- appear on a household statement. Here the condition is just `person_id IN
-- my_person_ids()`, with no household test, because that is exactly what
-- church.my_giving() matches. If these two disagreed, the portal would show a
-- member a year total on screen and then hand them a printed statement
-- carrying a different number, which is the single worst thing a giving record
-- can do. They agree by construction; keep it that way.
--
-- NOT AUDITED, on purpose. church.giving_access_audit exists to record one
-- person reading another person's giving, and its action check constraint
-- lists the four ways that happens. A member reading their own giving is not
-- that event, and logging it would bury the rows that matter under a row for
-- every member who ever opened the page.
CREATE OR REPLACE FUNCTION church.my_statement(
  _organization_id UUID,
  _year INTEGER
)
RETURNS JSONB
LANGUAGE plpgsql STABLE SECURITY DEFINER
SET search_path = church, public
AS $$
DECLARE
  v_person UUID;
  v_result JSONB;
BEGIN
  SELECT p.id INTO v_person
  FROM church.people p
  WHERE p.profile_id = auth.uid()
    AND p.organization_id = _organization_id
    AND p.merged_into_person_id IS NULL
  LIMIT 1;

  IF v_person IS NULL THEN
    RAISE EXCEPTION 'no_member_record_for_this_login' USING ERRCODE = '42501';
  END IF;

  WITH lines AS (
    SELECT
      d.received_on,
      d.amount_cents,
      d.method,
      d.check_number,
      d.is_tax_deductible,
      f.name AS fund_name,
      trim(p.first_name || ' ' || p.last_name) AS given_by
    FROM church.donations d
    JOIN church.giving_funds f ON f.id = d.fund_id
    LEFT JOIN church.people p ON p.id = d.person_id
    WHERE d.organization_id = _organization_id
      AND d.refunded_at IS NULL
      AND d.person_id IN (SELECT * FROM church.my_person_ids())
      AND EXTRACT(YEAR FROM d.received_on)::INT = _year
  )
  SELECT jsonb_build_object(
    'year', _year,
    'organization_id', _organization_id,
    'household_id', NULL,
    'person_id', v_person,
    'recipient_name', (
      SELECT trim(p.first_name || ' ' || p.last_name)
      FROM church.people p WHERE p.id = v_person),
    -- The caller's own household address, for the letterhead. It is the
    -- address they would have written on the envelope themselves.
    'address', (
      SELECT jsonb_build_object(
        'line1', h.address_line1, 'line2', h.address_line2,
        'city', h.city, 'state', h.state, 'postal_code', h.postal_code)
      FROM church.households h
      WHERE h.id IN (SELECT * FROM church.my_household_ids())
      LIMIT 1),
    -- Printed on the document itself, not only said on the screen that
    -- produced it: a member may hand this to someone preparing their taxes,
    -- and that person has no way to know it covers one name in the household.
    'scope_note',
      'Gifts recorded against this name only. Gifts given by others in the '
      || 'household appear on the household statement issued by the church office.',
    'total_cents', (SELECT coalesce(sum(amount_cents), 0) FROM lines),
    'deductible_cents', (
      SELECT coalesce(sum(amount_cents) FILTER (WHERE is_tax_deductible), 0) FROM lines),
    'gift_count', (SELECT count(*) FROM lines),
    'by_fund', (
      SELECT coalesce(jsonb_agg(jsonb_build_object(
        'fund_name', fund_name, 'total_cents', total_cents, 'gift_count', gift_count
      ) ORDER BY fund_name), '[]'::jsonb)
      FROM (
        SELECT fund_name, sum(amount_cents) AS total_cents, count(*) AS gift_count
        FROM lines GROUP BY fund_name
      ) s),
    'lines', (
      SELECT coalesce(jsonb_agg(jsonb_build_object(
        'received_on', received_on, 'amount_cents', amount_cents,
        'method', method, 'check_number', check_number,
        'fund_name', fund_name, 'given_by', given_by,
        'is_tax_deductible', is_tax_deductible
      ) ORDER BY received_on), '[]'::jsonb)
      FROM lines)
  )
  INTO v_result;

  RETURN v_result;
END;
$$;

-- ---------------------------------------------------------------------------
-- Household roster, now carrying birth months
-- ---------------------------------------------------------------------------
--
-- DROP then CREATE, not CREATE OR REPLACE: Postgres will not let a replace
-- change a function's return type, and this adds two columns to the table it
-- returns. The drop and the create are in one migration file and therefore one
-- transaction, so there is no window in which the function is missing.
--
-- church.people records a birth month and a birth year and no day — the
-- Breeze import never carried one. That turns out to fit what this is for: a
-- month is enough to say "Selam and Dawit have birthdays this month" and not
-- enough to be a date anybody has to remember or feel bad about missing.
--
-- Scope is unchanged. This function has always returned the caller's own
-- household and still does; a birth month inside your own household is not a
-- disclosure, it is something you would be told at the dinner table.
DROP FUNCTION IF EXISTS church.my_household_members();

CREATE FUNCTION church.my_household_members()
RETURNS TABLE (
  person_id UUID,
  display_name TEXT,
  household_role TEXT,
  is_primary_contact BOOLEAN,
  is_child BOOLEAN,
  email TEXT,
  phone TEXT,
  is_me BOOLEAN,
  birth_month SMALLINT,
  birth_year SMALLINT
)
LANGUAGE sql STABLE SECURITY DEFINER
SET search_path = church, public
AS $$
  SELECT
    p.id,
    trim(p.first_name || ' ' || p.last_name),
    hm.household_role,
    hm.is_primary_contact,
    p.is_child,
    p.email,
    p.phone,
    (p.id IN (SELECT * FROM church.my_person_ids())),
    p.birth_month,
    p.birth_year
  FROM church.household_members hm
  JOIN church.people p ON p.id = hm.person_id
  WHERE hm.household_id IN (SELECT * FROM church.my_household_ids())
    AND hm.end_date IS NULL
    AND p.merged_into_person_id IS NULL
  ORDER BY p.is_child, hm.is_primary_contact DESC, p.first_name
$$;

GRANT EXECUTE ON FUNCTION church.my_serving() TO authenticated;
GRANT EXECUTE ON FUNCTION church.my_groups() TO authenticated;
GRANT EXECUTE ON FUNCTION church.my_statement(UUID, INTEGER) TO authenticated;
GRANT EXECUTE ON FUNCTION church.my_household_members() TO authenticated;

COMMENT ON FUNCTION church.my_serving() IS
  'Live ministry assignments for the signed-in member. Not filtered on '
  'is_serving_ministry: that flag governs where a person may be placed, not '
  'what is true of a person already placed.';

COMMENT ON FUNCTION church.my_statement(UUID, INTEGER) IS
  'The signed-in member''s own contribution statement, in the same JSONB shape '
  'as church.giving_statement so one template prints both. Matches the same '
  'rows as church.my_giving by construction - if they ever diverge, the portal '
  'shows one total on screen and prints another.';

NOTIFY pgrst, 'reload schema';
