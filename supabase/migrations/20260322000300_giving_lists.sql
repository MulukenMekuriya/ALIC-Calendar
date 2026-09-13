-- =====================================================
-- Giving: the lists the screens actually render
-- =====================================================
--
-- WHY THESE ARE FUNCTIONS AND NOT POSTGREST QUERIES
-- -------------------------------------------------
-- Every list on the giving screens shows a donor's NAME, and a name lives in
-- church.people, which is behind the members module's RLS. A treasurer holds
-- giving_admin; there is no reason for them to also hold members_viewer, and
-- handing out the directory to get a name onto a receipt would be the wrong
-- trade.
--
-- Found the hard way: church.donation_defaults originally ran as the caller
-- and so could not see church.household_members either, which stored every
-- gift with a NULL household and would have addressed each spouse a separate
-- January statement. Same root cause, same fix — cross the module boundary in
-- a SECURITY DEFINER function that returns only the fields the screen needs.
--
-- What these deliberately do NOT return: birthdays, addresses, medical flags,
-- household rosters. A name, an email and a household label, which is what a
-- ledger line needs and no more.

-- ---------------------------------------------------------------------------
-- The ledger
-- ---------------------------------------------------------------------------
CREATE OR REPLACE FUNCTION church.giving_donations(
  _organization_id UUID,
  _year INTEGER DEFAULT NULL,
  _search TEXT DEFAULT NULL,
  _fund_id UUID DEFAULT NULL,
  _batch_id UUID DEFAULT NULL,
  _only_unmatched BOOLEAN DEFAULT false,
  _limit INTEGER DEFAULT 50,
  _offset INTEGER DEFAULT 0
)
RETURNS TABLE (
  id UUID,
  received_on DATE,
  amount_cents BIGINT,
  fee_cents BIGINT,
  method TEXT,
  source TEXT,
  fund_id UUID,
  fund_name TEXT,
  person_id UUID,
  donor_name TEXT,
  household_id UUID,
  household_name TEXT,
  donor_name_raw TEXT,
  external_reference TEXT,
  check_number TEXT,
  note TEXT,
  is_tax_deductible BOOLEAN,
  refunded_at TIMESTAMPTZ,
  batch_id UUID,
  batch_name TEXT,
  batch_status TEXT,
  total_count BIGINT
)
LANGUAGE plpgsql STABLE SECURITY DEFINER
SET search_path = church, public, extensions
AS $$
DECLARE
  v_term TEXT := lower(nullif(trim(coalesce(_search, '')), ''));
BEGIN
  PERFORM church.assert_giving_reader(_organization_id);

  RETURN QUERY
  WITH matching AS (
    SELECT
      d.id, d.received_on, d.amount_cents, d.fee_cents, d.method, d.source,
      d.fund_id, f.name AS fund_name,
      d.person_id,
      trim(p.first_name || ' ' || p.last_name) AS donor_name,
      d.household_id, h.name AS household_name,
      d.donor_name_raw, d.external_reference, d.check_number, d.note,
      d.is_tax_deductible, d.refunded_at,
      d.batch_id, b.name AS batch_name, b.status AS batch_status
    FROM church.donations d
    JOIN church.giving_funds f ON f.id = d.fund_id
    LEFT JOIN church.people p ON p.id = d.person_id
    LEFT JOIN church.households h ON h.id = d.household_id
    LEFT JOIN church.giving_batches b ON b.id = d.batch_id
    WHERE d.organization_id = _organization_id
      AND (_year IS NULL OR EXTRACT(YEAR FROM d.received_on)::INT = _year)
      AND (_fund_id IS NULL OR d.fund_id = _fund_id)
      AND (_batch_id IS NULL OR d.batch_id = _batch_id)
      AND (NOT _only_unmatched OR d.person_id IS NULL)
      AND (
        v_term IS NULL
        OR p.search_name LIKE '%' || v_term || '%'
        OR lower(coalesce(d.donor_name_raw, '')) LIKE '%' || v_term || '%'
        OR lower(coalesce(h.name, '')) LIKE '%' || v_term || '%'
        OR lower(coalesce(d.external_reference, '')) = v_term
        OR lower(coalesce(d.check_number, '')) = v_term
      )
  )
  SELECT m.*, (SELECT count(*) FROM matching) AS total_count
  FROM matching m
  ORDER BY m.received_on DESC, m.amount_cents DESC
  LIMIT greatest(coalesce(_limit, 50), 1)
  OFFSET greatest(coalesce(_offset, 0), 0);
END;
$$;

-- ---------------------------------------------------------------------------
-- Batches, with what is actually in them
-- ---------------------------------------------------------------------------
--
-- The entered total is the whole point of the screen — a batch whose entered
-- total does not equal the counted total is the thing a treasurer is looking
-- for — so it is computed here rather than left to the client to sum a page
-- of donations it may not have all of.
CREATE OR REPLACE FUNCTION church.giving_batches_list(
  _organization_id UUID,
  _limit INTEGER DEFAULT 50
)
RETURNS TABLE (
  id UUID,
  name TEXT,
  source TEXT,
  received_on DATE,
  status TEXT,
  expected_total_cents BIGINT,
  entered_total_cents BIGINT,
  gift_count INTEGER,
  unmatched_count INTEGER,
  variance_cents BIGINT,
  notes TEXT,
  posted_at TIMESTAMPTZ,
  posted_by_name TEXT,
  created_by_name TEXT,
  created_at TIMESTAMPTZ
)
LANGUAGE plpgsql STABLE SECURITY DEFINER
SET search_path = church, public
AS $$
BEGIN
  PERFORM church.assert_giving_reader(_organization_id);

  RETURN QUERY
  SELECT
    b.id, b.name, b.source, b.received_on, b.status,
    b.expected_total_cents,
    coalesce(t.total, 0)::BIGINT,
    coalesce(t.cnt, 0)::INTEGER,
    coalesce(t.unmatched, 0)::INTEGER,
    -- NULL when nobody wrote a counted total, because "no variance" and "we
    -- never checked" must not look the same on the screen.
    CASE WHEN b.expected_total_cents IS NULL THEN NULL
         ELSE coalesce(t.total, 0) - b.expected_total_cents END::BIGINT,
    b.notes, b.posted_at, b.posted_by_name, b.created_by_name, b.created_at
  FROM church.giving_batches b
  LEFT JOIN LATERAL (
    SELECT sum(d.amount_cents) AS total,
           count(*) AS cnt,
           count(*) FILTER (WHERE d.person_id IS NULL) AS unmatched
    FROM church.donations d
    WHERE d.batch_id = b.id AND d.refunded_at IS NULL
  ) t ON true
  WHERE b.organization_id = _organization_id
  ORDER BY b.received_on DESC, b.created_at DESC
  LIMIT greatest(coalesce(_limit, 50), 1);
END;
$$;

-- ---------------------------------------------------------------------------
-- Finding a person to attach a gift to
-- ---------------------------------------------------------------------------
--
-- giving_match_donor answers "is this exactly somebody" for an import. This
-- answers "who did you mean" for a human with a cheque in their hand, which
-- is a prefix search over names, emails and phone digits.
CREATE OR REPLACE FUNCTION church.giving_person_search(
  _organization_id UUID,
  _term TEXT,
  _limit INTEGER DEFAULT 15
)
RETURNS TABLE (
  person_id UUID,
  display_name TEXT,
  email TEXT,
  household_id UUID,
  household_name TEXT
)
LANGUAGE plpgsql STABLE SECURITY DEFINER
SET search_path = church, public, extensions
AS $$
DECLARE
  v_term TEXT := lower(nullif(trim(coalesce(_term, '')), ''));
  v_digits TEXT := regexp_replace(coalesce(_term, ''), '[^0-9]', '', 'g');
BEGIN
  PERFORM church.assert_giving_admin(_organization_id);

  -- Two characters would return the whole directory one keystroke into a
  -- name, which is a directory dump wearing a search box.
  IF v_term IS NULL OR length(v_term) < 3 THEN
    RETURN;
  END IF;

  RETURN QUERY
  SELECT
    p.id,
    trim(p.first_name || ' ' || p.last_name),
    p.email,
    hm.household_id,
    h.name
  FROM church.people p
  LEFT JOIN LATERAL (
    SELECT hm2.household_id FROM church.household_members hm2
    WHERE hm2.person_id = p.id AND hm2.end_date IS NULL
    ORDER BY hm2.is_primary_contact DESC, hm2.created_at
    LIMIT 1
  ) hm ON true
  LEFT JOIN church.households h ON h.id = hm.household_id
  WHERE p.organization_id = _organization_id
    AND p.merged_into_person_id IS NULL
    AND p.is_active = true
    AND (
      p.search_name LIKE '%' || v_term || '%'
      OR lower(coalesce(p.email, '')) LIKE v_term || '%'
      OR (length(v_digits) >= 4 AND p.phone_digits LIKE '%' || v_digits || '%')
    )
  ORDER BY p.search_name
  LIMIT greatest(coalesce(_limit, 15), 1);
END;
$$;

GRANT EXECUTE ON FUNCTION church.giving_donations(UUID, INTEGER, TEXT, UUID, UUID, BOOLEAN, INTEGER, INTEGER) TO authenticated;
GRANT EXECUTE ON FUNCTION church.giving_batches_list(UUID, INTEGER) TO authenticated;
GRANT EXECUTE ON FUNCTION church.giving_person_search(UUID, TEXT, INTEGER) TO authenticated;

NOTIFY pgrst, 'reload schema';
