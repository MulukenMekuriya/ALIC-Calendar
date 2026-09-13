-- =====================================================
-- Giving: defaults, donor matching, import, statements
-- =====================================================
--
-- Reading and listing donations is done straight through PostgREST against the
-- RLS policies in 20260322000100 — there is no reason to wrap a filtered list
-- in a function. What lives here is the work RLS cannot express: matching an
-- imported line to a person, deciding what a statement says, and recording
-- that somebody looked.

-- ---------------------------------------------------------------------------
-- Helpers
-- ---------------------------------------------------------------------------
-- The display name to stamp on rows this caller writes. Not giving-specific:
-- the workflow functions in 20260322000500 use it too.
CREATE OR REPLACE FUNCTION church.current_profile_name()
RETURNS TEXT
LANGUAGE sql STABLE SECURITY DEFINER
SET search_path = church, public
AS $$
  SELECT coalesce(full_name, email, 'Unknown') FROM public.profiles WHERE id = auth.uid()
$$;

CREATE OR REPLACE FUNCTION church.assert_giving_admin(_organization_id UUID)
RETURNS VOID
LANGUAGE plpgsql STABLE SECURITY DEFINER
SET search_path = church, public
AS $$
BEGIN
  IF NOT church.has_permission_in_org(
       _organization_id, ARRAY['giving_admin']::church.module_permission[]) THEN
    RAISE EXCEPTION 'not_permitted' USING ERRCODE = '42501';
  END IF;
END;
$$;

CREATE OR REPLACE FUNCTION church.assert_giving_reader(_organization_id UUID)
RETURNS VOID
LANGUAGE plpgsql STABLE SECURITY DEFINER
SET search_path = church, public
AS $$
BEGIN
  IF NOT church.has_permission_in_org(
       _organization_id,
       ARRAY['giving_admin', 'giving_viewer']::church.module_permission[]) THEN
    RAISE EXCEPTION 'not_permitted' USING ERRCODE = '42501';
  END IF;
END;
$$;

-- Last ten digits, so +1 (240) 505-5310 and 2405055310 are the same phone.
CREATE OR REPLACE FUNCTION church.giving_phone_key(_phone TEXT)
RETURNS TEXT
LANGUAGE sql IMMUTABLE
AS $$
  SELECT nullif(right(regexp_replace(coalesce(_phone, ''), '[^0-9]', '', 'g'), 10), '')
$$;

-- ---------------------------------------------------------------------------
-- Row defaults
-- ---------------------------------------------------------------------------
--
-- A trigger rather than a wrapper function, so that a gift entered by hand
-- through PostgREST, one landed by the Stripe webhook, and one created by an
-- import all get the same snapshot. Nothing here overrides a value the caller
-- supplied.
--
-- SECURITY DEFINER because church.household_members is behind the members
-- module's RLS, and a treasurer holding giving_admin has no reason to also
-- hold members_viewer. Without it the lookup below silently returns no rows
-- for exactly the people who use this most, every gift is stored with a NULL
-- household, and the January statement run addresses each spouse separately.
-- The function only ever READS household_members, and only to fill a column
-- on the row being written.
CREATE OR REPLACE FUNCTION church.donation_defaults()
RETURNS TRIGGER
LANGUAGE plpgsql SECURITY DEFINER
SET search_path = church, public
AS $$
BEGIN
  -- The household as it stands right now. Never recomputed afterwards: see
  -- the column comment in 20260322000100.
  IF NEW.household_id IS NULL AND NEW.person_id IS NOT NULL THEN
    SELECT hm.household_id INTO NEW.household_id
    FROM church.household_members hm
    WHERE hm.person_id = NEW.person_id
      AND hm.end_date IS NULL
    ORDER BY hm.is_primary_contact DESC, hm.created_at
    LIMIT 1;
  END IF;

  IF TG_OP = 'INSERT' THEN
    IF NEW.created_by IS NULL THEN NEW.created_by := auth.uid(); END IF;
    IF NEW.created_by_name IS NULL THEN
      NEW.created_by_name := church.current_profile_name();
    END IF;
  END IF;

  RETURN NEW;
END;
$$;

CREATE TRIGGER donations_apply_defaults
  BEFORE INSERT OR UPDATE ON church.donations
  FOR EACH ROW EXECUTE FUNCTION church.donation_defaults();

-- ---------------------------------------------------------------------------
-- Who is this donor?
-- ---------------------------------------------------------------------------
--
-- Three tiers, best first, and an explicitly AMBIGUOUS answer when a tier
-- matches more than one person. Ambiguity is reported, never broken by
-- picking one: attaching a gift to the wrong Abebe puts it on the wrong
-- household's tax statement, which is worse in every direction than leaving
-- it unmatched for a human to settle.
CREATE OR REPLACE FUNCTION church.giving_match_donor(
  _organization_id UUID,
  _name  TEXT DEFAULT NULL,
  _email TEXT DEFAULT NULL,
  _phone TEXT DEFAULT NULL
)
RETURNS TABLE (
  person_id UUID,
  display_name TEXT,
  email TEXT,
  phone TEXT,
  household_id UUID,
  household_name TEXT,
  confidence TEXT
)
LANGUAGE plpgsql STABLE SECURITY DEFINER
SET search_path = church, public, extensions
AS $$
DECLARE
  v_email TEXT := lower(nullif(trim(coalesce(_email, '')), ''));
  v_phone TEXT := church.giving_phone_key(_phone);
  v_name  TEXT := lower(nullif(trim(coalesce(_name, '')), ''));
BEGIN
  PERFORM church.assert_giving_admin(_organization_id);

  RETURN QUERY
  WITH candidates AS (
    SELECT
      p.id,
      trim(p.first_name || ' ' || p.last_name) AS display_name,
      p.email,
      p.phone,
      CASE
        WHEN v_email IS NOT NULL AND lower(p.email) = v_email THEN 'email'
        WHEN v_phone IS NOT NULL AND right(p.phone_digits, 10) = v_phone THEN 'phone'
        WHEN v_name  IS NOT NULL AND p.search_name = v_name THEN 'name'
      END AS tier
    FROM church.people p
    WHERE p.organization_id = _organization_id
      AND p.merged_into_person_id IS NULL
      AND p.deceased = false
      AND (
        (v_email IS NOT NULL AND lower(p.email) = v_email)
        OR (v_phone IS NOT NULL AND right(p.phone_digits, 10) = v_phone)
        OR (v_name  IS NOT NULL AND p.search_name = v_name)
      )
  ),
  best AS (
    SELECT c.*,
      -- Rank the tiers, then count how many share the winning one.
      CASE c.tier WHEN 'email' THEN 1 WHEN 'phone' THEN 2 ELSE 3 END AS tier_rank
    FROM candidates c
  ),
  winner AS (
    SELECT min(tier_rank) AS r FROM best
  )
  SELECT
    b.id,
    b.display_name,
    b.email,
    b.phone,
    hm.household_id,
    h.name,
    CASE WHEN (SELECT count(*) FROM best b2, winner w WHERE b2.tier_rank = w.r) > 1
         THEN 'ambiguous' ELSE b.tier END
  FROM best b, winner w
  LEFT JOIN LATERAL (
    SELECT hm2.household_id FROM church.household_members hm2
    WHERE hm2.person_id = b.id AND hm2.end_date IS NULL
    ORDER BY hm2.is_primary_contact DESC, hm2.created_at
    LIMIT 1
  ) hm ON true
  LEFT JOIN church.households h ON h.id = hm.household_id
  WHERE b.tier_rank = w.r
  ORDER BY b.display_name;
END;
$$;

-- ---------------------------------------------------------------------------
-- Import: dry run
-- ---------------------------------------------------------------------------
--
-- Same two-phase shape as the member import in 20260320001300 — look before
-- you write — for the same reason: a giving import that half-lands is worse
-- than one that does not land, because nobody can tell by eye which half.
--
-- _rows is the CSV already parsed and normalised by the client:
--   [{ "row_number": 1, "received_on": "2026-01-04", "amount_cents": 10000,
--      "fee_cents": 320, "donor_name": "Abebe Kebede",
--      "donor_email": "...", "donor_phone": "...",
--      "external_reference": "pi_3Q...", "fund_code": "general",
--      "method": "card", "note": null }, ...]
CREATE OR REPLACE FUNCTION church.giving_import_dry_run(
  _organization_id UUID,
  _rows JSONB
)
RETURNS TABLE (
  row_number INTEGER,
  received_on DATE,
  amount_cents BIGINT,
  donor_name TEXT,
  external_reference TEXT,
  fund_code TEXT,
  matched_person_id UUID,
  matched_name TEXT,
  match_confidence TEXT,
  is_duplicate BOOLEAN,
  error TEXT
)
LANGUAGE plpgsql STABLE SECURITY DEFINER
SET search_path = church, public, extensions
AS $$
DECLARE
  r JSONB;
  v_row INTEGER;
  v_date DATE;
  v_amount BIGINT;
  v_ref TEXT;
  v_fund_code TEXT;
  v_fund_id UUID;
  v_method TEXT;
  v_name TEXT;
  -- Scalars rather than a RECORD: a SELECT ... INTO that finds nothing leaves
  -- a RECORD *unassigned*, and reading a field of it then raises instead of
  -- yielding NULL. Which is to say the first unmatched donor in any import
  -- would have aborted the whole dry run.
  v_match_person_id UUID;
  v_match_name TEXT;
  v_match_confidence TEXT;
  v_error TEXT;
BEGIN
  PERFORM church.assert_giving_admin(_organization_id);

  FOR r IN SELECT * FROM jsonb_array_elements(_rows)
  LOOP
    v_error := NULL;
    v_row := coalesce((r->>'row_number')::INTEGER, 0);
    v_name := nullif(trim(coalesce(r->>'donor_name', '')), '');
    v_ref := nullif(trim(coalesce(r->>'external_reference', '')), '');
    v_fund_code := lower(nullif(trim(coalesce(r->>'fund_code', '')), ''));
    v_method := lower(nullif(trim(coalesce(r->>'method', '')), ''));

    BEGIN
      v_date := (r->>'received_on')::DATE;
    EXCEPTION WHEN OTHERS THEN
      v_date := NULL;
      v_error := 'Unreadable date';
    END;

    BEGIN
      v_amount := (r->>'amount_cents')::BIGINT;
    EXCEPTION WHEN OTHERS THEN
      v_amount := NULL;
      v_error := coalesce(v_error, 'Unreadable amount');
    END;

    IF v_error IS NULL AND (v_amount IS NULL OR v_amount <= 0) THEN
      v_error := 'Amount must be greater than zero';
    END IF;
    IF v_error IS NULL AND v_date IS NULL THEN
      v_error := 'Missing date';
    END IF;
    IF v_error IS NULL AND v_date > CURRENT_DATE + 1 THEN
      v_error := 'Date is in the future';
    END IF;

    v_fund_id := NULL;
    IF v_error IS NULL THEN
      SELECT f.id INTO v_fund_id
      FROM church.giving_funds f
      WHERE f.organization_id = _organization_id
        AND f.code = coalesce(v_fund_code, 'general');
      IF v_fund_id IS NULL THEN
        v_error := 'Unknown fund "' || coalesce(v_fund_code, 'general') || '"';
      END IF;
    END IF;

    IF v_error IS NULL AND v_method IS NOT NULL
       AND v_method NOT IN ('card','ach','cash','check','zelle','paypal','venmo','in_kind','other') THEN
      v_error := 'Unknown payment method "' || v_method || '"';
    END IF;

    -- Best match, or nothing. giving_match_donor already refuses to guess
    -- between equals, so 'ambiguous' arrives here as a value, not a row set.
    v_match_person_id := NULL;
    v_match_name := NULL;
    v_match_confidence := NULL;
    IF v_error IS NULL THEN
      SELECT m.person_id, m.display_name, m.confidence
      INTO v_match_person_id, v_match_name, v_match_confidence
      FROM church.giving_match_donor(
             _organization_id, v_name, r->>'donor_email', r->>'donor_phone') m
      LIMIT 1;
    END IF;

    RETURN QUERY SELECT
      v_row,
      v_date,
      v_amount,
      v_name,
      v_ref,
      coalesce(v_fund_code, 'general'),
      CASE WHEN v_match_confidence = 'ambiguous' THEN NULL ELSE v_match_person_id END,
      v_match_name,
      v_match_confidence,
      -- Already in the ledger. Matched on the reference alone, with no regard
      -- to how the existing row got there — so a gift the Stripe webhook
      -- recorded on Sunday is recognised when the payout CSV is imported in
      -- February, and reported as a duplicate rather than added twice.
      (v_ref IS NOT NULL AND EXISTS (
        SELECT 1 FROM church.donations d
        WHERE d.organization_id = _organization_id
          AND d.external_reference = v_ref)),
      v_error;
  END LOOP;
END;
$$;

-- ---------------------------------------------------------------------------
-- Import: commit
-- ---------------------------------------------------------------------------
--
-- Rows carry an explicit person_id here, not a name to re-match: the human
-- has just looked at the dry run and corrected it, and re-running the matcher
-- would throw that away.
CREATE OR REPLACE FUNCTION church.giving_import_commit(
  _organization_id UUID,
  _batch_id UUID,
  _rows JSONB
)
RETURNS JSONB
LANGUAGE plpgsql
SET search_path = church, public, extensions
AS $$
DECLARE
  r JSONB;
  v_fund_id UUID;
  v_ref TEXT;
  v_person UUID;
  v_inserted INTEGER := 0;
  v_skipped INTEGER := 0;
  v_matched INTEGER := 0;
  v_total BIGINT := 0;
BEGIN
  PERFORM church.assert_giving_admin(_organization_id);

  IF _batch_id IS NOT NULL THEN
    PERFORM 1 FROM church.giving_batches b
    WHERE b.id = _batch_id AND b.organization_id = _organization_id AND b.status = 'open';
    IF NOT FOUND THEN
      RAISE EXCEPTION 'batch_not_open' USING ERRCODE = '23514';
    END IF;
  END IF;

  FOR r IN SELECT * FROM jsonb_array_elements(_rows)
  LOOP
    v_ref := nullif(trim(coalesce(r->>'external_reference', '')), '');

    -- Idempotency by processor reference, independent of source. Re-importing
    -- January's Stripe export in February adds nothing.
    IF v_ref IS NOT NULL AND EXISTS (
      SELECT 1 FROM church.donations d
      WHERE d.organization_id = _organization_id AND d.external_reference = v_ref
    ) THEN
      v_skipped := v_skipped + 1;
      CONTINUE;
    END IF;

    SELECT f.id INTO v_fund_id
    FROM church.giving_funds f
    WHERE f.organization_id = _organization_id
      AND f.code = coalesce(lower(nullif(trim(coalesce(r->>'fund_code','')),'')), 'general');

    IF v_fund_id IS NULL THEN
      RAISE EXCEPTION 'unknown_fund' USING
        ERRCODE = '23514',
        HINT = 'Row ' || coalesce(r->>'row_number','?') || ' names a fund that does not exist.';
    END IF;

    v_person := nullif(r->>'person_id', '')::UUID;

    INSERT INTO church.donations (
      organization_id, batch_id, fund_id, person_id,
      amount_cents, fee_cents, received_on, method, source,
      external_reference, donor_name_raw, donor_email_raw, donor_phone_raw,
      is_tax_deductible, note
    ) VALUES (
      _organization_id,
      _batch_id,
      v_fund_id,
      v_person,
      (r->>'amount_cents')::BIGINT,
      coalesce((r->>'fee_cents')::BIGINT, 0),
      (r->>'received_on')::DATE,
      coalesce(lower(nullif(trim(coalesce(r->>'method','')),'')), 'other'),
      'import',
      v_ref,
      nullif(trim(coalesce(r->>'donor_name','')), ''),
      nullif(trim(coalesce(r->>'donor_email','')), ''),
      nullif(trim(coalesce(r->>'donor_phone','')), ''),
      coalesce((SELECT f.is_tax_deductible FROM church.giving_funds f WHERE f.id = v_fund_id), true),
      nullif(trim(coalesce(r->>'note','')), '')
    );

    v_inserted := v_inserted + 1;
    v_total := v_total + (r->>'amount_cents')::BIGINT;
    IF v_person IS NOT NULL THEN v_matched := v_matched + 1; END IF;
  END LOOP;

  RETURN jsonb_build_object(
    'inserted', v_inserted,
    'skipped_duplicates', v_skipped,
    'matched', v_matched,
    'unmatched', v_inserted - v_matched,
    'total_cents', v_total
  );
END;
$$;

-- ---------------------------------------------------------------------------
-- Post a batch
-- ---------------------------------------------------------------------------
--
-- Refuses when the entered total disagrees with the counted total. That
-- disagreement is the entire reason batches exist, so resolving it by
-- silently accepting the entered number would leave nothing behind.
CREATE OR REPLACE FUNCTION church.post_giving_batch(_batch_id UUID)
RETURNS JSONB
LANGUAGE plpgsql
SET search_path = church, public
AS $$
DECLARE
  v_org UUID;
  v_expected BIGINT;
  v_actual BIGINT;
  v_count INTEGER;
BEGIN
  SELECT b.organization_id, b.expected_total_cents INTO v_org, v_expected
  FROM church.giving_batches b WHERE b.id = _batch_id AND b.status = 'open';

  IF v_org IS NULL THEN
    RAISE EXCEPTION 'batch_not_open' USING ERRCODE = '23514';
  END IF;

  PERFORM church.assert_giving_admin(v_org);

  SELECT coalesce(sum(d.amount_cents), 0), count(*)
  INTO v_actual, v_count
  FROM church.donations d
  WHERE d.batch_id = _batch_id AND d.refunded_at IS NULL;

  IF v_expected IS NOT NULL AND v_expected <> v_actual THEN
    RAISE EXCEPTION 'batch_out_of_balance' USING
      ERRCODE = '23514',
      HINT = 'Counted ' || v_expected || ' cents, entered ' || v_actual || ' cents.';
  END IF;

  UPDATE church.giving_batches
  SET status = 'posted',
      posted_at = now(),
      posted_by = auth.uid(),
      posted_by_name = church.current_profile_name()
  WHERE id = _batch_id;

  RETURN jsonb_build_object('batch_id', _batch_id, 'total_cents', v_actual, 'gift_count', v_count);
END;
$$;

-- ---------------------------------------------------------------------------
-- Reporting
-- ---------------------------------------------------------------------------
CREATE OR REPLACE FUNCTION church.giving_fund_totals(
  _organization_id UUID,
  _year INTEGER
)
RETURNS TABLE (
  fund_id UUID,
  fund_code TEXT,
  fund_name TEXT,
  total_cents BIGINT,
  gift_count INTEGER,
  donor_count INTEGER
)
LANGUAGE plpgsql STABLE SECURITY DEFINER
SET search_path = church, public
AS $$
BEGIN
  PERFORM church.assert_giving_reader(_organization_id);

  RETURN QUERY
  SELECT
    f.id, f.code, f.name,
    coalesce(sum(d.amount_cents), 0)::BIGINT,
    count(d.id)::INTEGER,
    count(DISTINCT d.person_id)::INTEGER
  FROM church.giving_funds f
  LEFT JOIN church.donations d
    ON d.fund_id = f.id
   AND d.refunded_at IS NULL
   AND EXTRACT(YEAR FROM d.received_on)::INT = _year
  WHERE f.organization_id = _organization_id
  GROUP BY f.id, f.code, f.name, f.sort_order
  ORDER BY f.sort_order, f.name;
END;
$$;

CREATE OR REPLACE FUNCTION church.giving_overview(
  _organization_id UUID,
  _year INTEGER
)
RETURNS JSONB
LANGUAGE plpgsql STABLE SECURITY DEFINER
SET search_path = church, public
AS $$
DECLARE
  v JSONB;
BEGIN
  PERFORM church.assert_giving_reader(_organization_id);

  SELECT jsonb_build_object(
    'year', _year,
    'total_cents', coalesce(sum(d.amount_cents) FILTER (WHERE d.refunded_at IS NULL), 0),
    'gift_count', count(*) FILTER (WHERE d.refunded_at IS NULL),
    'donor_count', count(DISTINCT d.person_id) FILTER (WHERE d.refunded_at IS NULL),
    'unmatched_count', count(*) FILTER (WHERE d.person_id IS NULL AND d.refunded_at IS NULL),
    'unmatched_cents', coalesce(sum(d.amount_cents) FILTER (WHERE d.person_id IS NULL AND d.refunded_at IS NULL), 0),
    'refunded_cents', coalesce(sum(d.amount_cents) FILTER (WHERE d.refunded_at IS NOT NULL), 0)
  )
  INTO v
  FROM church.donations d
  WHERE d.organization_id = _organization_id
    AND EXTRACT(YEAR FROM d.received_on)::INT = _year;

  RETURN v || jsonb_build_object(
    'open_batches', (
      SELECT count(*) FROM church.giving_batches b
      WHERE b.organization_id = _organization_id AND b.status = 'open'
    ),
    -- Twelve buckets, always, so a chart never has to invent the empty months.
    'by_month', (
      SELECT coalesce(jsonb_agg(jsonb_build_object('month', m.n, 'total_cents', coalesce(t.total, 0)) ORDER BY m.n), '[]'::jsonb)
      FROM generate_series(1, 12) AS m(n)
      LEFT JOIN (
        SELECT EXTRACT(MONTH FROM d.received_on)::INT AS mth, sum(d.amount_cents) AS total
        FROM church.donations d
        WHERE d.organization_id = _organization_id
          AND d.refunded_at IS NULL
          AND EXTRACT(YEAR FROM d.received_on)::INT = _year
        GROUP BY 1
      ) t ON t.mth = m.n
    )
  );
END;
$$;

-- ---------------------------------------------------------------------------
-- Statements
-- ---------------------------------------------------------------------------
--
-- A statement is addressed to a HOUSEHOLD where the donor has one, and to the
-- person where they do not. That is what a married couple expects to receive,
-- and it is what the snapshot column on each donation was taken for.
--
-- Both functions write church.giving_access_audit. Running the January batch
-- is a legitimate act that should be visible; so is one administrator pulling
-- one household's giving in March.
CREATE OR REPLACE FUNCTION church.giving_statement_recipients(
  _organization_id UUID,
  _year INTEGER,
  _min_cents BIGINT DEFAULT 1
)
RETURNS TABLE (
  household_id UUID,
  person_id UUID,
  recipient_name TEXT,
  address_line1 TEXT,
  address_line2 TEXT,
  city TEXT,
  state TEXT,
  postal_code TEXT,
  email TEXT,
  total_cents BIGINT,
  deductible_cents BIGINT,
  gift_count INTEGER
)
LANGUAGE plpgsql SECURITY DEFINER
SET search_path = church, public
AS $$
DECLARE
  v_rows INTEGER;
BEGIN
  PERFORM church.assert_giving_admin(_organization_id);

  RETURN QUERY
  WITH mine AS (
    SELECT d.*
    FROM church.donations d
    WHERE d.organization_id = _organization_id
      AND d.refunded_at IS NULL
      AND EXTRACT(YEAR FROM d.received_on)::INT = _year
      -- An anonymous gift has nobody to send a statement to. It still counts
      -- toward the fund totals above; it just cannot be receipted.
      AND (d.person_id IS NOT NULL OR d.household_id IS NOT NULL)
  ),
  grouped AS (
    SELECT
      m.household_id,
      CASE WHEN m.household_id IS NULL THEN m.person_id END AS person_id,
      sum(m.amount_cents)::BIGINT AS total_cents,
      sum(m.amount_cents) FILTER (WHERE m.is_tax_deductible)::BIGINT AS deductible_cents,
      count(*)::INTEGER AS gift_count
    FROM mine m
    GROUP BY 1, 2
  )
  SELECT
    g.household_id,
    g.person_id,
    coalesce(h.name, trim(p.first_name || ' ' || p.last_name)),
    coalesce(h.address_line1, NULL),
    coalesce(h.address_line2, NULL),
    h.city, h.state, h.postal_code,
    -- Prefer the household's primary contact's email; fall back to the person.
    coalesce(
      (SELECT p2.email
       FROM church.household_members hm2
       JOIN church.people p2 ON p2.id = hm2.person_id
       WHERE hm2.household_id = g.household_id AND hm2.end_date IS NULL
         AND p2.email IS NOT NULL
       ORDER BY hm2.is_primary_contact DESC, hm2.created_at
       LIMIT 1),
      p.email),
    g.total_cents,
    coalesce(g.deductible_cents, 0),
    g.gift_count
  FROM grouped g
  LEFT JOIN church.households h ON h.id = g.household_id
  LEFT JOIN church.people p ON p.id = g.person_id
  WHERE g.total_cents >= coalesce(_min_cents, 1)
  ORDER BY coalesce(h.name, trim(p.first_name || ' ' || p.last_name));

  GET DIAGNOSTICS v_rows = ROW_COUNT;

  INSERT INTO church.giving_access_audit
    (organization_id, action, auth_user_id, actor_name, tax_year, row_count)
  VALUES
    (_organization_id, 'statement_batch', auth.uid(), church.current_profile_name(), _year, v_rows);
END;
$$;

CREATE OR REPLACE FUNCTION church.giving_statement(
  _organization_id UUID,
  _year INTEGER,
  _household_id UUID DEFAULT NULL,
  _person_id UUID DEFAULT NULL
)
RETURNS JSONB
LANGUAGE plpgsql SECURITY DEFINER
SET search_path = church, public
AS $$
DECLARE
  v_result JSONB;
BEGIN
  PERFORM church.assert_giving_admin(_organization_id);

  IF _household_id IS NULL AND _person_id IS NULL THEN
    RAISE EXCEPTION 'statement_needs_a_recipient' USING ERRCODE = '22023';
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
      AND EXTRACT(YEAR FROM d.received_on)::INT = _year
      AND (
        (_household_id IS NOT NULL AND d.household_id = _household_id)
        OR (_household_id IS NULL AND d.person_id = _person_id AND d.household_id IS NULL)
      )
  )
  SELECT jsonb_build_object(
    'year', _year,
    'organization_id', _organization_id,
    'household_id', _household_id,
    'person_id', _person_id,
    'recipient_name', coalesce(
      (SELECT h.name FROM church.households h WHERE h.id = _household_id),
      (SELECT trim(p.first_name || ' ' || p.last_name) FROM church.people p WHERE p.id = _person_id)),
    'address', (
      SELECT jsonb_build_object(
        'line1', h.address_line1, 'line2', h.address_line2,
        'city', h.city, 'state', h.state, 'postal_code', h.postal_code)
      FROM church.households h WHERE h.id = _household_id),
    'total_cents', (SELECT coalesce(sum(amount_cents), 0) FROM lines),
    'deductible_cents', (SELECT coalesce(sum(amount_cents) FILTER (WHERE is_tax_deductible), 0) FROM lines),
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

  INSERT INTO church.giving_access_audit
    (organization_id, action, auth_user_id, actor_name,
     subject_person_id, subject_household_id, tax_year, row_count)
  VALUES
    (_organization_id, 'statement', auth.uid(), church.current_profile_name(),
     _person_id, _household_id, _year, (v_result->>'gift_count')::INTEGER);

  RETURN v_result;
END;
$$;

-- ---------------------------------------------------------------------------
-- The member's own view
-- ---------------------------------------------------------------------------
--
-- Deliberately NOT the household statement. A spouse's gifts are on the
-- household statement the treasurer issues, which is a document the household
-- receives together; putting the same total behind one member's login turns
-- it into something one spouse can look up about the other. The portal shows
-- what the signed-in person gave, and points at the office for the rest.
--
-- No permission check beyond auth.uid(): the query cannot express anything
-- other than the caller's own rows.
CREATE OR REPLACE FUNCTION church.my_giving_years()
RETURNS TABLE (
  tax_year INTEGER,
  total_cents BIGINT,
  gift_count INTEGER
)
LANGUAGE sql STABLE SECURITY DEFINER
SET search_path = church, public
AS $$
  SELECT
    EXTRACT(YEAR FROM d.received_on)::INT,
    sum(d.amount_cents)::BIGINT,
    count(*)::INTEGER
  FROM church.donations d
  WHERE d.person_id IN (SELECT * FROM church.my_person_ids())
    AND d.refunded_at IS NULL
  GROUP BY 1
  ORDER BY 1 DESC
$$;

CREATE OR REPLACE FUNCTION church.my_giving(_year INTEGER DEFAULT NULL)
RETURNS TABLE (
  id UUID,
  received_on DATE,
  amount_cents BIGINT,
  method TEXT,
  fund_name TEXT,
  is_tax_deductible BOOLEAN,
  note TEXT
)
LANGUAGE sql STABLE SECURITY DEFINER
SET search_path = church, public
AS $$
  SELECT d.id, d.received_on, d.amount_cents, d.method, f.name,
         d.is_tax_deductible, d.note
  FROM church.donations d
  JOIN church.giving_funds f ON f.id = d.fund_id
  WHERE d.person_id IN (SELECT * FROM church.my_person_ids())
    AND d.refunded_at IS NULL
    AND (_year IS NULL OR EXTRACT(YEAR FROM d.received_on)::INT = _year)
  ORDER BY d.received_on DESC
$$;

-- ---------------------------------------------------------------------------
-- Grants
-- ---------------------------------------------------------------------------
--
-- ALTER DEFAULT PRIVILEGES in 20260321000400 already stripped PUBLIC, so each
-- of these has to be named explicitly or the frontend gets 42501.
GRANT EXECUTE ON FUNCTION church.giving_match_donor(UUID, TEXT, TEXT, TEXT) TO authenticated;
GRANT EXECUTE ON FUNCTION church.giving_import_dry_run(UUID, JSONB) TO authenticated;
GRANT EXECUTE ON FUNCTION church.giving_import_commit(UUID, UUID, JSONB) TO authenticated;
GRANT EXECUTE ON FUNCTION church.post_giving_batch(UUID) TO authenticated;
GRANT EXECUTE ON FUNCTION church.giving_fund_totals(UUID, INTEGER) TO authenticated;
GRANT EXECUTE ON FUNCTION church.giving_overview(UUID, INTEGER) TO authenticated;
GRANT EXECUTE ON FUNCTION church.giving_statement_recipients(UUID, INTEGER, BIGINT) TO authenticated;
GRANT EXECUTE ON FUNCTION church.giving_statement(UUID, INTEGER, UUID, UUID) TO authenticated;
GRANT EXECUTE ON FUNCTION church.my_giving_years() TO authenticated;
GRANT EXECUTE ON FUNCTION church.my_giving(INTEGER) TO authenticated;

-- Internal helpers. Not granted on purpose: nothing in the browser calls them.
-- church.current_profile_name, church.assert_giving_admin,
-- church.assert_giving_reader, church.giving_phone_key

NOTIFY pgrst, 'reload schema';
