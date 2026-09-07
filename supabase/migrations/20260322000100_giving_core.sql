-- =====================================================
-- Giving: funds, batches, donations, and who looked
-- =====================================================
--
-- WHAT THIS IS AND IS NOT
-- -----------------------
-- This is a DONOR LEDGER, not a payment processor. ALIC already takes money
-- through Stripe, PayPal, Zelle, Venmo, text-to-give, cheque and the offering
-- box, and none of that is changing. What did not exist was any record that
-- a gift happened, which is why /give currently ends with "our finance team
-- will issue a receipt" — a sentence describing a spreadsheet.
--
-- Everything downstream of that sentence needs this table: the January
-- contribution statement, "did the building fund reach its target", and a
-- member being able to see their own giving history without telephoning the
-- treasurer.
--
-- MONEY IS STORED IN CENTS, AS BIGINT.
-- Not NUMERIC, and emphatically not a float. A statement is a legal-ish
-- document that has to foot exactly; integer cents is the only representation
-- where summing ten thousand rows cannot drift. The frontend formats.
--
-- A DONATION MAY HAVE NO DONOR.
-- person_id is nullable and that is a normal, permanent state, not a to-do:
-- cash in the offering box is genuinely anonymous, and an imported Zelle row
-- that matched nobody is better stored unmatched than guessed at. Unmatched
-- rows still count toward fund totals; they simply cannot appear on anyone's
-- statement.

-- ---------------------------------------------------------------------------
-- Funds — what the gift was designated for
-- ---------------------------------------------------------------------------
CREATE TABLE church.giving_funds (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  organization_id UUID NOT NULL REFERENCES public.organizations(id) ON DELETE RESTRICT,
  code TEXT NOT NULL,
  name TEXT NOT NULL,
  description TEXT,

  -- Drives which lines carry the deductibility language on a statement. A
  -- gift that buys the donor something (a banquet ticket, a mission-trip
  -- seat for their own child) is not deductible, and the statement must not
  -- claim it is.
  is_tax_deductible BOOLEAN NOT NULL DEFAULT true,

  is_active BOOLEAN NOT NULL DEFAULT true,
  sort_order INTEGER NOT NULL DEFAULT 100,

  created_by UUID REFERENCES auth.users(id) ON DELETE SET NULL,
  created_by_name TEXT,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT now(),

  CONSTRAINT uq_giving_funds_id_org UNIQUE (id, organization_id),
  CONSTRAINT uq_giving_funds_org_code UNIQUE (organization_id, code),
  CONSTRAINT chk_giving_funds_code CHECK (code ~ '^[a-z0-9_]+$')
);

-- ---------------------------------------------------------------------------
-- Batches — one counting session, or one imported statement
-- ---------------------------------------------------------------------------
--
-- A batch is what makes the ledger auditable. Two counters open a batch, enter
-- what is in the bag, and post it; posting compares the entered total against
-- the total they wrote on the bag. A Stripe or Zelle import is the same shape
-- with the deposit total playing the part of the bag.
--
-- Posting is one-way. A posted batch is frozen because the point of the
-- control is that the number stops moving after two people agreed on it.
CREATE TABLE church.giving_batches (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  organization_id UUID NOT NULL REFERENCES public.organizations(id) ON DELETE RESTRICT,

  name TEXT NOT NULL,
  source TEXT NOT NULL,
  received_on DATE NOT NULL DEFAULT CURRENT_DATE,

  -- What the counters/the deposit slip say is in it. NULL means "we did not
  -- count it separately", which is honest but unverifiable, so the UI nags.
  expected_total_cents BIGINT,

  status TEXT NOT NULL DEFAULT 'open',
  notes TEXT,

  posted_at TIMESTAMPTZ,
  posted_by UUID REFERENCES auth.users(id) ON DELETE SET NULL,
  posted_by_name TEXT,

  created_by UUID REFERENCES auth.users(id) ON DELETE SET NULL,
  created_by_name TEXT,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT now(),

  CONSTRAINT uq_giving_batches_id_org UNIQUE (id, organization_id),
  CONSTRAINT chk_giving_batches_status CHECK (status IN ('open', 'posted')),
  CONSTRAINT chk_giving_batches_source CHECK (source IN
    ('stripe', 'paypal', 'zelle', 'venmo', 'cash', 'check', 'ach', 'other')),
  CONSTRAINT chk_giving_batches_expected CHECK
    (expected_total_cents IS NULL OR expected_total_cents >= 0),
  -- A posted batch must say who posted it and when; an open one must not.
  CONSTRAINT chk_giving_batches_posted_fields CHECK (
    (status = 'posted' AND posted_at IS NOT NULL)
    OR (status = 'open' AND posted_at IS NULL)
  )
);

-- ---------------------------------------------------------------------------
-- Donations
-- ---------------------------------------------------------------------------
CREATE TABLE church.donations (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  organization_id UUID NOT NULL REFERENCES public.organizations(id) ON DELETE RESTRICT,

  batch_id UUID,
  fund_id UUID NOT NULL,

  -- Nullable on purpose. See the header.
  person_id UUID,
  -- Snapshot, not a live join. A statement reprinted in 2029 must show the
  -- household the gift was given from in 2026, not the one the donor has
  -- since married into.
  household_id UUID,

  amount_cents BIGINT NOT NULL,
  -- Processor fee, where the processor tells us. Recorded so "we received
  -- $100" and "$96.80 landed" are both answerable; the statement always uses
  -- amount_cents, because the donor gave $100.
  fee_cents BIGINT NOT NULL DEFAULT 0,

  received_on DATE NOT NULL,
  method TEXT NOT NULL,

  -- How the row got here, which decides what is allowed to overwrite it.
  source TEXT NOT NULL DEFAULT 'manual',

  -- The processor's own id: Stripe payment intent, PayPal transaction id, the
  -- Zelle confirmation number. Carrying it is what makes re-importing the same
  -- CSV a no-op instead of doubling the year's total.
  external_reference TEXT,
  check_number TEXT,

  -- Whatever the source called the donor, kept verbatim even after a match, so
  -- a wrong match can be found and undone later.
  donor_name_raw TEXT,
  donor_email_raw TEXT,
  donor_phone_raw TEXT,

  -- Copied from the fund at entry, then editable per gift: a normally
  -- deductible fund can still receive a non-deductible quid-pro-quo gift.
  is_tax_deductible BOOLEAN NOT NULL DEFAULT true,

  note TEXT,

  -- Refunds are recorded, never deleted. A refunded gift drops off statements
  -- and totals but stays in the ledger where the auditor can see it happened.
  refunded_at TIMESTAMPTZ,
  refunded_reason TEXT,

  created_by UUID REFERENCES auth.users(id) ON DELETE SET NULL,
  created_by_name TEXT,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT now(),

  CONSTRAINT uq_donations_id_org UNIQUE (id, organization_id),

  CONSTRAINT fk_donations_batch
    FOREIGN KEY (batch_id, organization_id)
    REFERENCES church.giving_batches(id, organization_id) ON DELETE SET NULL,
  CONSTRAINT fk_donations_fund
    FOREIGN KEY (fund_id, organization_id)
    REFERENCES church.giving_funds(id, organization_id) ON DELETE RESTRICT,
  -- MATCH SIMPLE, so a NULL person_id skips the check entirely — which is the
  -- behaviour anonymous gifts need.
  CONSTRAINT fk_donations_person
    FOREIGN KEY (person_id, organization_id)
    REFERENCES church.people(id, organization_id) ON DELETE RESTRICT,
  CONSTRAINT fk_donations_household
    FOREIGN KEY (household_id, organization_id)
    REFERENCES church.households(id, organization_id) ON DELETE SET NULL,

  -- Zero-value gifts are data entry accidents; negative ones are refunds,
  -- which have their own column.
  CONSTRAINT chk_donations_amount CHECK (amount_cents > 0),
  CONSTRAINT chk_donations_fee CHECK (fee_cents >= 0),
  CONSTRAINT chk_donations_method CHECK (method IN
    ('card', 'ach', 'cash', 'check', 'zelle', 'paypal', 'venmo', 'in_kind', 'other')),
  CONSTRAINT chk_donations_source CHECK (source IN
    ('manual', 'import', 'stripe_webhook')),
  -- A future-dated gift is always a typo, and it would land in the wrong tax
  -- year. Yesterday's is fine; next year's is not.
  CONSTRAINT chk_donations_received_on CHECK (received_on <= CURRENT_DATE + 1),
  CONSTRAINT chk_donations_refund CHECK
    (refunded_reason IS NULL OR refunded_at IS NOT NULL)
);

-- Idempotent imports.
--
-- Partial, because most manual entries have no reference and NULLs would
-- otherwise collide under a plain unique constraint.
--
-- `source` is deliberately NOT part of the key. One Stripe payment is one
-- gift, whether it arrived through the webhook or through a CSV export of the
-- same payout, and including the source would let both land and double the
-- donor's year. The application checks the reference without regard to source
-- for exactly this reason; this index is what makes that check a guarantee
-- rather than a convention two code paths happen to share.
CREATE UNIQUE INDEX uq_donations_external_reference
  ON church.donations(organization_id, external_reference)
  WHERE external_reference IS NOT NULL;

CREATE INDEX idx_donations_org_received ON church.donations(organization_id, received_on DESC);
CREATE INDEX idx_donations_person ON church.donations(person_id, received_on DESC)
  WHERE person_id IS NOT NULL;
CREATE INDEX idx_donations_household ON church.donations(household_id, received_on DESC)
  WHERE household_id IS NOT NULL;
CREATE INDEX idx_donations_batch ON church.donations(batch_id) WHERE batch_id IS NOT NULL;
CREATE INDEX idx_donations_fund ON church.donations(fund_id, received_on DESC);
-- Statements are always "one calendar year", so index the year directly.
CREATE INDEX idx_donations_org_year
  ON church.donations(organization_id, (EXTRACT(YEAR FROM received_on)::INT));
-- Unmatched rows are a worklist, and it wants its own cheap scan.
CREATE INDEX idx_donations_unmatched ON church.donations(organization_id, received_on DESC)
  WHERE person_id IS NULL AND refunded_at IS NULL;

CREATE INDEX idx_giving_batches_org ON church.giving_batches(organization_id, received_on DESC);
CREATE INDEX idx_giving_funds_org ON church.giving_funds(organization_id, sort_order);

-- ---------------------------------------------------------------------------
-- Who looked at the ledger
-- ---------------------------------------------------------------------------
--
-- Org admin implies giving_admin, which means the ledger is readable by
-- everyone who administers the branch, whether or not they have anything to do
-- with the finance team. That is the same trade already accepted for
-- children's medical data, and it is only defensible with the same mitigation:
-- the access leaves a trace. Written by the SECURITY DEFINER reporting
-- functions in 20260322000200, which is where reads actually happen.
CREATE TABLE church.giving_access_audit (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  organization_id UUID NOT NULL REFERENCES public.organizations(id) ON DELETE CASCADE,
  action TEXT NOT NULL,
  auth_user_id UUID,
  actor_name TEXT,
  subject_person_id UUID REFERENCES church.people(id) ON DELETE SET NULL,
  subject_household_id UUID REFERENCES church.households(id) ON DELETE SET NULL,
  tax_year INTEGER,
  row_count INTEGER,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  CONSTRAINT chk_giving_audit_action CHECK (action IN
    ('statement', 'statement_batch', 'donor_history', 'export'))
);

CREATE INDEX idx_giving_access_audit_org ON church.giving_access_audit(organization_id, created_at DESC);

-- ---------------------------------------------------------------------------
-- updated_at
-- ---------------------------------------------------------------------------
CREATE TRIGGER update_church_giving_funds_updated_at
  BEFORE UPDATE ON church.giving_funds
  FOR EACH ROW EXECUTE FUNCTION church.update_updated_at_column();

CREATE TRIGGER update_church_giving_batches_updated_at
  BEFORE UPDATE ON church.giving_batches
  FOR EACH ROW EXECUTE FUNCTION church.update_updated_at_column();

CREATE TRIGGER update_church_donations_updated_at
  BEFORE UPDATE ON church.donations
  FOR EACH ROW EXECUTE FUNCTION church.update_updated_at_column();

-- ---------------------------------------------------------------------------
-- A posted batch is frozen
-- ---------------------------------------------------------------------------
CREATE OR REPLACE FUNCTION church.reject_posted_batch_edit()
RETURNS TRIGGER
LANGUAGE plpgsql
SET search_path = church, public
AS $$
DECLARE
  v_batch_id UUID;
  v_status TEXT;
BEGIN
  v_batch_id := coalesce(NEW.batch_id, OLD.batch_id);
  IF v_batch_id IS NULL THEN
    RETURN coalesce(NEW, OLD);
  END IF;

  SELECT status INTO v_status FROM church.giving_batches WHERE id = v_batch_id;

  IF v_status <> 'posted' THEN
    RETURN coalesce(NEW, OLD);
  END IF;

  -- What "frozen" means here is precise: the MONEY stops moving. Naming the
  -- donor of an imported Zelle line a week later, or marking a refund, are
  -- both normal work on a batch that was posted months ago, and forbidding
  -- them is what makes a treasurer delete the row instead.
  IF TG_OP = 'UPDATE'
     AND NEW.amount_cents      =              OLD.amount_cents
     AND NEW.fee_cents         =              OLD.fee_cents
     AND NEW.fund_id           =              OLD.fund_id
     AND NEW.received_on       =              OLD.received_on
     AND NEW.method            =              OLD.method
     AND NEW.batch_id          IS NOT DISTINCT FROM OLD.batch_id
     AND NEW.is_tax_deductible =              OLD.is_tax_deductible THEN
    RETURN NEW;
  END IF;

  RAISE EXCEPTION 'batch_posted' USING
    ERRCODE = '23514',
    HINT = 'This batch has been posted. Its amounts and funds can no longer change; record a refund instead.';
END;
$$;

CREATE TRIGGER donations_respect_posted_batch
  BEFORE INSERT OR UPDATE OR DELETE ON church.donations
  FOR EACH ROW EXECUTE FUNCTION church.reject_posted_batch_edit();

-- ---------------------------------------------------------------------------
-- RLS
-- ---------------------------------------------------------------------------
ALTER TABLE church.giving_funds ENABLE ROW LEVEL SECURITY;
ALTER TABLE church.giving_batches ENABLE ROW LEVEL SECURITY;
ALTER TABLE church.donations ENABLE ROW LEVEL SECURITY;
ALTER TABLE church.giving_access_audit ENABLE ROW LEVEL SECURITY;

-- Funds are a label, not a secret: the portal has to render "Building Fund"
-- next to a member's own gift, so anyone in the branch may read the list.
CREATE POLICY "Members can view funds in their organizations"
  ON church.giving_funds FOR SELECT
  TO authenticated
  USING (organization_id IN (SELECT * FROM church.my_orgs()));

CREATE POLICY "Giving admins can insert funds"
  ON church.giving_funds FOR INSERT
  TO authenticated
  WITH CHECK (organization_id IN (SELECT * FROM church.my_orgs_with_any(ARRAY['giving_admin']::church.module_permission[])));

CREATE POLICY "Giving admins can update funds"
  ON church.giving_funds FOR UPDATE
  TO authenticated
  USING (organization_id IN (SELECT * FROM church.my_orgs_with_any(ARRAY['giving_admin']::church.module_permission[])))
  WITH CHECK (organization_id IN (SELECT * FROM church.my_orgs_with_any(ARRAY['giving_admin']::church.module_permission[])));

CREATE POLICY "Giving staff can view batches"
  ON church.giving_batches FOR SELECT
  TO authenticated
  USING (organization_id IN (SELECT * FROM church.my_orgs_with_any(
    ARRAY['giving_admin', 'giving_viewer']::church.module_permission[])));

CREATE POLICY "Giving admins can insert batches"
  ON church.giving_batches FOR INSERT
  TO authenticated
  WITH CHECK (organization_id IN (SELECT * FROM church.my_orgs_with_any(ARRAY['giving_admin']::church.module_permission[])));

CREATE POLICY "Giving admins can update batches"
  ON church.giving_batches FOR UPDATE
  TO authenticated
  USING (organization_id IN (SELECT * FROM church.my_orgs_with_any(ARRAY['giving_admin']::church.module_permission[])))
  WITH CHECK (organization_id IN (SELECT * FROM church.my_orgs_with_any(ARRAY['giving_admin']::church.module_permission[])));

-- Donations: the finance team, or the donor themselves, and nobody else.
-- The self clause is what lets the member portal show a giving history without
-- a SECURITY DEFINER function standing in the middle of it.
CREATE POLICY "Giving staff and donors can view donations"
  ON church.donations FOR SELECT
  TO authenticated
  USING (
    organization_id IN (SELECT * FROM church.my_orgs_with_any(
      ARRAY['giving_admin', 'giving_viewer']::church.module_permission[]))
    OR person_id IN (SELECT * FROM church.my_person_ids())
  );

CREATE POLICY "Giving admins can insert donations"
  ON church.donations FOR INSERT
  TO authenticated
  WITH CHECK (organization_id IN (SELECT * FROM church.my_orgs_with_any(ARRAY['giving_admin']::church.module_permission[])));

CREATE POLICY "Giving admins can update donations"
  ON church.donations FOR UPDATE
  TO authenticated
  USING (organization_id IN (SELECT * FROM church.my_orgs_with_any(ARRAY['giving_admin']::church.module_permission[])))
  WITH CHECK (organization_id IN (SELECT * FROM church.my_orgs_with_any(ARRAY['giving_admin']::church.module_permission[])));

-- Deliberately no DELETE policy on any of the three. The ledger is
-- append-and-correct; a mistake becomes a refund, not a hole.

-- The audit trail is readable by org admins only — the giving_admin whose
-- reads it records must not be the one who decides it is uninteresting.
CREATE POLICY "Org admins can view giving access audit"
  ON church.giving_access_audit FOR SELECT
  TO authenticated
  USING (organization_id IN (SELECT * FROM church.my_admin_orgs()));

-- ---------------------------------------------------------------------------
-- Grants
-- ---------------------------------------------------------------------------
GRANT SELECT ON church.giving_funds TO authenticated;
GRANT INSERT, UPDATE ON church.giving_funds TO authenticated;
GRANT SELECT, INSERT, UPDATE ON church.giving_batches TO authenticated;
GRANT SELECT, INSERT, UPDATE ON church.donations TO authenticated;
GRANT SELECT ON church.giving_access_audit TO authenticated;

-- ---------------------------------------------------------------------------
-- Seed the funds every branch will have on day one
-- ---------------------------------------------------------------------------
--
-- Named to match what the offering envelope and the /give page already say.
-- Nothing here is a guess about ALIC's chart of accounts: these four are the
-- designations the public giving page already asks people to choose between.
INSERT INTO church.giving_funds
  (organization_id, code, name, description, is_tax_deductible, sort_order)
SELECT o.id, v.code, v.name, v.description, v.deductible, v.sort_order
FROM public.organizations o
CROSS JOIN (VALUES
  ('general',    'General Fund',   'Tithes and general offerings — the church''s day-to-day ministry.', true,  10),
  ('building',   'Building Fund',  'Gifts designated toward the church building.',                      true,  20),
  ('missions',   'Missions',       'ALIC Mission and partner missionaries.',                            true,  30),
  ('benevolence','Benevolence',    'Direct assistance to families in need.',                            true,  40)
) AS v(code, name, description, deductible, sort_order)
ON CONFLICT (organization_id, code) DO NOTHING;

NOTIFY pgrst, 'reload schema';
