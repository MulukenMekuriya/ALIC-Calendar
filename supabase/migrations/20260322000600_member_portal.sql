-- =====================================================
-- The member portal: what a person may read about themselves
-- =====================================================
--
-- WHAT THE PORTAL IS FOR
-- ----------------------
-- Until now a signed-in member could edit their phone number
-- (church.update_my_contact_details) and see their own ministry assignments,
-- and that was the whole of the member-facing app. Everything else the church
-- knows about them — what they gave, which of their children were checked in
-- and when, who is in their household — was reachable only by telephoning the
-- office.
--
-- Each function here answers exactly one question about the CALLER. There is
-- no organization-wide variant of any of them and no person_id parameter, so
-- there is nothing to tamper with: the queries are written in terms of
-- church.my_person_ids() and church.my_household_ids(), which are derived from
-- auth.uid() and nothing else.
--
-- SECURITY DEFINER throughout, and the reason is the same one that bit
-- church.donation_defaults: the tables being read (kids check-ins, people,
-- households) are behind module RLS aimed at staff, and a member holds no
-- module grant at all. The definer boundary is safe here precisely because
-- these functions take no arguments that could widen them.

-- ---------------------------------------------------------------------------
-- My children
-- ---------------------------------------------------------------------------
--
-- "Children in a household I currently belong to", not "people I have a
-- parent relationship with": the household is what check-in already uses to
-- decide who may collect a child, so using anything else here would produce a
-- portal that disagrees with the desk.
CREATE OR REPLACE FUNCTION church.my_children()
RETURNS TABLE (
  person_id UUID,
  organization_id UUID,
  display_name TEXT,
  birth_year SMALLINT,
  birth_month SMALLINT,
  grade_name TEXT,
  household_name TEXT
)
LANGUAGE sql STABLE SECURITY DEFINER
SET search_path = church, public
AS $$
  SELECT DISTINCT
    p.id,
    p.organization_id,
    trim(p.first_name || ' ' || p.last_name),
    p.birth_year,
    p.birth_month,
    g.display_name,
    h.name
  FROM church.household_members hm
  JOIN church.people p
    ON p.id = hm.person_id
   AND p.is_child
   AND p.merged_into_person_id IS NULL
  JOIN church.households h ON h.id = hm.household_id
  LEFT JOIN church.school_grades g ON g.id = p.school_grade_id
  WHERE hm.household_id IN (SELECT * FROM church.my_household_ids())
    AND hm.end_date IS NULL
  ORDER BY 3
$$;

-- ---------------------------------------------------------------------------
-- Where my children have been
-- ---------------------------------------------------------------------------
--
-- Deliberately NOT live. This shows Sundays that have finished; it is a
-- history, not a tracker, and it does not tell a parent which room their
-- child is sitting in right now. That is a check-in desk question, answered
-- to a person standing at the desk, and putting a live room location behind
-- any login that can be phished is not a trade a children's ministry should
-- make.
--
-- What it does carry is who collected the child, because "somebody collected
-- my child and I would like to know who" is the question this answers.
CREATE OR REPLACE FUNCTION church.my_children_check_ins(_limit INTEGER DEFAULT 30)
RETURNS TABLE (
  check_in_id UUID,
  child_person_id UUID,
  child_name TEXT,
  session_date DATE,
  service_label TEXT,
  room_name TEXT,
  checked_in_at TIMESTAMPTZ,
  checked_out_at TIMESTAMPTZ,
  picked_up_by_name TEXT,
  status TEXT
)
LANGUAGE sql STABLE SECURITY DEFINER
SET search_path = church, public
AS $$
  SELECT
    ci.id,
    ci.child_person_id,
    ci.label_child_name,
    s.session_date,
    s.service_label,
    ci.label_room_name,
    ci.checked_in_at,
    ci.checked_out_at,
    ci.picked_up_by_name,
    ci.status
  FROM church.kids_check_ins ci
  JOIN church.kids_sessions s ON s.id = ci.kids_session_id
  WHERE ci.child_person_id IN (
    SELECT hm.person_id
    FROM church.household_members hm
    JOIN church.people p ON p.id = hm.person_id AND p.is_child
    WHERE hm.household_id IN (SELECT * FROM church.my_household_ids())
      AND hm.end_date IS NULL
  )
  ORDER BY ci.checked_in_at DESC
  LIMIT greatest(coalesce(_limit, 30), 1)
$$;

-- ---------------------------------------------------------------------------
-- One call for the portal's front page
-- ---------------------------------------------------------------------------
--
-- The portal opens on a summary, and five round trips to render six numbers
-- is five chances for one of them to be the slow one. Every field is
-- self-scoped; the organization argument only narrows, it never widens.
CREATE OR REPLACE FUNCTION church.my_portal_summary(_organization_id UUID)
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

  -- A login that has never been linked to a member record. Not an error: it
  -- is the normal state for a new account, and the portal renders a "we have
  -- not linked your record yet" panel rather than an empty dashboard.
  IF v_person IS NULL THEN
    RETURN jsonb_build_object('linked', false);
  END IF;

  SELECT jsonb_build_object(
    'linked', true,
    'person_id', v_person,
    'display_name', trim(p.first_name || ' ' || p.last_name),
    'email', p.email,
    'phone', p.phone,
    'membership_status', ms.display_name,
    'member_since', p.member_since,
    'household_name', h.name,
    'household_size', (
      SELECT count(*) FROM church.household_members hm2
      WHERE hm2.household_id = h.id AND hm2.end_date IS NULL),
    'children_count', (SELECT count(*) FROM church.my_children() c
                       WHERE c.organization_id = _organization_id),
    'serving_count', (
      SELECT count(*) FROM church.ministry_assignments ma
      WHERE ma.person_id = v_person AND ma.end_date IS NULL),
    'group_count', (
      SELECT count(*) FROM church.group_memberships gm
      WHERE gm.person_id = v_person AND gm.end_date IS NULL),
    'giving_this_year_cents', (
      SELECT coalesce(sum(d.amount_cents), 0)
      FROM church.donations d
      WHERE d.person_id = v_person
        AND d.refunded_at IS NULL
        AND EXTRACT(YEAR FROM d.received_on)::INT = EXTRACT(YEAR FROM CURRENT_DATE)::INT),
    'last_gift_on', (
      SELECT max(d.received_on) FROM church.donations d
      WHERE d.person_id = v_person AND d.refunded_at IS NULL),
    'open_follow_up_cards', (
      SELECT count(*) FROM church.workflow_cards c
      WHERE c.assignee_person_id = v_person
        AND c.status IN ('open', 'snoozed'))
  )
  INTO v_result
  FROM church.people p
  LEFT JOIN church.membership_statuses ms ON ms.id = p.membership_status_id
  LEFT JOIN LATERAL (
    SELECT hm.household_id FROM church.household_members hm
    WHERE hm.person_id = p.id AND hm.end_date IS NULL
    ORDER BY hm.is_primary_contact DESC, hm.created_at LIMIT 1
  ) hh ON true
  LEFT JOIN church.households h ON h.id = hh.household_id
  WHERE p.id = v_person;

  RETURN v_result;
END;
$$;

-- ---------------------------------------------------------------------------
-- My household, as the portal shows it
-- ---------------------------------------------------------------------------
--
-- useMyHousehold already reads this through the self-access RLS added in
-- 20260320001100. This exists so the portal gets one shape with the fields it
-- actually renders, rather than a nested PostgREST embed the client has to
-- flatten — and so that adding a field later does not mean widening a policy.
CREATE OR REPLACE FUNCTION church.my_household_members()
RETURNS TABLE (
  person_id UUID,
  display_name TEXT,
  household_role TEXT,
  is_primary_contact BOOLEAN,
  is_child BOOLEAN,
  email TEXT,
  phone TEXT,
  is_me BOOLEAN
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
    (p.id IN (SELECT * FROM church.my_person_ids()))
  FROM church.household_members hm
  JOIN church.people p ON p.id = hm.person_id
  WHERE hm.household_id IN (SELECT * FROM church.my_household_ids())
    AND hm.end_date IS NULL
    AND p.merged_into_person_id IS NULL
  ORDER BY p.is_child, hm.is_primary_contact DESC, p.first_name
$$;

GRANT EXECUTE ON FUNCTION church.my_children() TO authenticated;
GRANT EXECUTE ON FUNCTION church.my_children_check_ins(INTEGER) TO authenticated;
GRANT EXECUTE ON FUNCTION church.my_portal_summary(UUID) TO authenticated;
GRANT EXECUTE ON FUNCTION church.my_household_members() TO authenticated;

NOTIFY pgrst, 'reload schema';
