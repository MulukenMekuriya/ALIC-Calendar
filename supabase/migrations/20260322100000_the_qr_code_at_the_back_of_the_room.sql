-- =====================================================
-- The QR code at the back of the room
-- =====================================================
--
-- On Sunday the media team puts a QR code on the screen and the congregation
-- scans it. Whoever is already on the church's books sets a password and walks
-- into My Church; whoever is not can put themselves on the books. One page, no
-- queue at the welcome desk, no office in the loop.
--
-- WHAT THE NUMBERS SAY, because they shaped every decision below. Of 613 adults
-- on file at Silver Spring:
--
--     544  have a login already, all confirmed, all with a password set
--      54  of those have EVER signed in
--      27  have an account that nobody ever joined to their person record
--      18  have an email address and no account at all
--      12  have a telephone number and no email
--      12  have neither
--
-- So the common case by a mile is "you have an account you have never used",
-- and the honest word for what that person needs is not "register" and not
-- "reset" but CLAIM. This file is built around that one verb, and the three
-- smaller cases are handled rather than swept up: an unlinked account gets
-- linked, a missing account gets made, and somebody with no email on file is
-- sent to a human instead of into a loop.
--
-- WHAT IS NOT IN THE DATABASE, ON PURPOSE
-- ---------------------------------------
-- None of these functions is granted to anon. The page is public and the
-- caller is a stranger, so the public surface is the member-claim edge
-- function, which holds the service key, sees the request's IP address and can
-- therefore rate-limit. A definer granted to anon would be the same lookup
-- with no ceiling on how fast somebody could ask it.
--
-- THE DISCLOSURE, STATED PLAINLY. The screen will say "we found you" or "we do
-- not have you", which makes this a membership oracle for anyone patient
-- enough: type an address, read the answer. That is a deliberate choice by the
-- church for one Sunday's sake, taken with the alternative on the table. What
-- keeps it from being free is the rate limit in the edge function and the fact
-- that a match discloses nothing beyond yes/no — no name, no telephone number,
-- no household, and the masked address a link was sent to is masked here, in
-- SQL, not in the browser.

-- ---------------------------------------------------------------------------
-- What the desk needs to know about a scan
-- ---------------------------------------------------------------------------
-- One row, all yes/no and one masked string. Deliberately NOT the person's
-- name: the edge function returns this almost verbatim to an unauthenticated
-- browser, so anything in here is something a stranger can read.
CREATE TYPE church.claim_verdict AS (
  outcome TEXT,
  person_id UUID,
  auth_user_id UUID,
  masked_email TEXT
);

COMMENT ON TYPE church.claim_verdict IS
  'The answer to "is this person on our books, and what happens next". '
  'outcome is one of: claimable (send them a link), no_email (on file but '
  'nothing to send to - the welcome desk), ambiguous (two people share this '
  'address or number), not_found (offer to register).';

-- ---------------------------------------------------------------------------
-- Finding one person from one fact
-- ---------------------------------------------------------------------------
--
-- MATCHING. Email is compared lowercased and trimmed, which is how
-- idx_people_email is built. A telephone number is compared on its LAST TEN
-- DIGITS, because people.phone_digits holds whatever the Breeze export had —
-- "301-555-0100", "(301) 555 0100", "+1 301 555 0100" — and a congregation
-- typing its own number into a phone will not reproduce the punctuation. Ten
-- digits is the North American number; comparing fewer would start matching
-- strangers to each other.
--
-- AMBIGUITY IS AN OUTCOME, NOT AN ERROR. 22 email addresses and 22 telephone
-- numbers on file belong to more than one person — couples, and families who
-- gave the household number. Picking the first would hand one spouse the
-- other's account, so this says so and the page asks for a name.
--
-- CHILDREN ARE NEVER MATCHED. A child has no login and must not acquire one
-- from a form; 454 of them are on file, many sharing a parent's email.
CREATE OR REPLACE FUNCTION church.claim_lookup(
  _organization_id UUID,
  _email TEXT DEFAULT NULL,
  _phone TEXT DEFAULT NULL,
  _first_name TEXT DEFAULT NULL,
  _last_name TEXT DEFAULT NULL
)
RETURNS church.claim_verdict
LANGUAGE plpgsql STABLE SECURITY DEFINER
SET search_path = church, public, extensions
AS $$
DECLARE
  v        church.claim_verdict;
  _digits  TEXT := regexp_replace(coalesce(_phone, ''), '[^0-9]', '', 'g');
  _needle  TEXT := lower(btrim(coalesce(_email, '')));
  _matches INTEGER;
  p        church.people%ROWTYPE;
BEGIN
  IF _needle = '' AND length(_digits) < 10 THEN
    v.outcome := 'not_found';
    RETURN v;
  END IF;

  -- The candidate set, narrowed by a name only when one was offered — which
  -- the page does on a second attempt, after this function has said the first
  -- one was ambiguous.
  WITH candidates AS (
    SELECT pp.*
    FROM church.people pp
    WHERE pp.organization_id = _organization_id
      AND pp.merged_into_person_id IS NULL
      AND pp.is_active
      AND NOT pp.is_child
      AND (
        (_needle <> '' AND lower(btrim(coalesce(pp.email, ''))) = _needle)
        OR (length(_digits) >= 10
            AND right(pp.phone_digits, 10) = right(_digits, 10)
            AND pp.phone_digits <> '')
      )
      AND (_first_name IS NULL OR btrim(_first_name) = ''
           OR lower(btrim(pp.first_name)) = lower(btrim(_first_name))
           OR lower(btrim(coalesce(pp.preferred_name, ''))) = lower(btrim(_first_name)))
      AND (_last_name IS NULL OR btrim(_last_name) = ''
           OR lower(btrim(pp.last_name)) = lower(btrim(_last_name)))
  )
  SELECT count(*) INTO _matches FROM candidates;

  IF _matches = 0 THEN
    v.outcome := 'not_found';
    RETURN v;
  END IF;

  IF _matches > 1 THEN
    v.outcome := 'ambiguous';
    RETURN v;
  END IF;

  SELECT pp.* INTO p FROM church.people pp
  WHERE pp.organization_id = _organization_id
    AND pp.merged_into_person_id IS NULL
    AND pp.is_active
    AND NOT pp.is_child
    AND (
      (_needle <> '' AND lower(btrim(coalesce(pp.email, ''))) = _needle)
      OR (length(_digits) >= 10 AND right(pp.phone_digits, 10) = right(_digits, 10)
          AND pp.phone_digits <> '')
    )
    AND (_first_name IS NULL OR btrim(_first_name) = ''
         OR lower(btrim(pp.first_name)) = lower(btrim(_first_name))
         OR lower(btrim(coalesce(pp.preferred_name, ''))) = lower(btrim(_first_name)))
    AND (_last_name IS NULL OR btrim(_last_name) = ''
         OR lower(btrim(pp.last_name)) = lower(btrim(_last_name)))
  LIMIT 1;

  v.person_id    := p.id;
  v.auth_user_id := p.profile_id;

  -- Nothing to send a link to. This is the 12 with a telephone number and no
  -- address, and it is a dead end ON PURPOSE: letting a stranger who knows a
  -- member's phone number attach their own email to that record is how you
  -- hand somebody else's account away. A human at the desk can see a face.
  IF coalesce(btrim(p.email), '') = '' THEN
    v.outcome := 'no_email';
    RETURN v;
  END IF;

  v.outcome      := 'claimable';
  v.masked_email := church.mask_email(p.email);
  RETURN v;
END;
$$;

-- "selam.abebe@gmail.com" -> "se•••••••@gmail.com". Enough for the owner to
-- recognise their own address and not enough to learn one they did not know.
CREATE OR REPLACE FUNCTION church.mask_email(_email TEXT)
RETURNS TEXT
LANGUAGE sql IMMUTABLE
AS $$
  SELECT CASE
    WHEN _email IS NULL OR position('@' IN _email) = 0 THEN NULL
    ELSE left(split_part(_email, '@', 1), 2)
         || repeat('•', greatest(length(split_part(_email, '@', 1)) - 2, 1))
         || '@' || split_part(_email, '@', 2)
  END
$$;

-- ---------------------------------------------------------------------------
-- A ceiling on asking
-- ---------------------------------------------------------------------------
--
-- BE HONEST ABOUT WHAT THIS BUYS. On Sunday morning the whole congregation is
-- on one church wifi behind one NAT address, so a per-IP limit tight enough to
-- stop enumeration would lock out the third of the room. The numbers below are
-- therefore an ABUSE AND COST GUARD, not a privacy control:
--
--   * 6 lookups per hour for one email or number, which stops somebody
--     hammering a single address;
--   * 3 SENDS per hour for one address, which is what stops this page being
--     used to mail-bomb a member;
--   * 240 lookups per hour from one address block, which a congregation of
--     several hundred will not reach on a Sunday and a script will reach in
--     two minutes.
--
-- The privacy question this does not answer is the one the church decided
-- deliberately: the page says whether somebody is on the books. See the header.
CREATE TABLE IF NOT EXISTS church.claim_attempts (
  id BIGSERIAL PRIMARY KEY,
  -- The nearest thing to a caller we have. Never shown to anybody; kept so a
  -- burst can be counted and, afterwards, explained.
  ip TEXT,
  -- Lowercased email or last ten digits. NOT the raw input, so this table does
  -- not quietly become a second copy of the directory.
  identifier TEXT NOT NULL,
  action TEXT NOT NULL,
  outcome TEXT,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  CONSTRAINT chk_claim_attempts_action CHECK (action IN ('lookup', 'send', 'register'))
);

CREATE INDEX IF NOT EXISTS idx_claim_attempts_identifier
  ON church.claim_attempts(identifier, action, created_at DESC);
CREATE INDEX IF NOT EXISTS idx_claim_attempts_ip
  ON church.claim_attempts(ip, created_at DESC) WHERE ip IS NOT NULL;

ALTER TABLE church.claim_attempts ENABLE ROW LEVEL SECURITY;
-- No policy at all: nothing but the service role reads or writes this, and the
-- service role bypasses RLS. A table with RLS on and no policy is closed.

-- Records the attempt and says whether it may proceed. One function rather
-- than a check and a separate insert, so a caller cannot do the first and
-- forget the second.
CREATE OR REPLACE FUNCTION church.claim_note_attempt(
  _ip TEXT,
  _identifier TEXT,
  _action TEXT
)
RETURNS BOOLEAN
LANGUAGE plpgsql VOLATILE SECURITY DEFINER
SET search_path = church, public
AS $$
DECLARE
  _key      TEXT := lower(btrim(coalesce(_identifier, '')));
  _per_id   INTEGER;
  _per_ip   INTEGER;
  _ceiling  INTEGER := CASE WHEN _action = 'send' THEN 3 ELSE 6 END;
BEGIN
  SELECT count(*) INTO _per_id
  FROM church.claim_attempts a
  WHERE a.identifier = _key
    AND a.action = _action
    AND a.created_at > now() - interval '1 hour';

  SELECT count(*) INTO _per_ip
  FROM church.claim_attempts a
  WHERE _ip IS NOT NULL AND a.ip = _ip
    AND a.created_at > now() - interval '1 hour';

  INSERT INTO church.claim_attempts (ip, identifier, action)
  VALUES (_ip, _key, _action);

  RETURN _per_id < _ceiling AND (_ip IS NULL OR _per_ip < 240);
END;
$$;

-- ---------------------------------------------------------------------------
-- Joining a login to the person it belongs to
-- ---------------------------------------------------------------------------
--
-- This is the step that decides whether Sunday works. 27 people already have
-- an account that nobody ever joined to their record, and every account this
-- page creates would be another one: without the link, a member signs in, the
-- portal reads church.my_portal_summary, finds no person for their auth id and
-- shows them "your login is not linked to a member record yet" — which is a
-- worse answer than the one they had before they scanned anything.
--
-- THE GUARDS MATTER MORE THAN THE UPDATE. This runs with the service key
-- behind a public page, so it assumes the caller is a stranger:
--
--   * a person who already has a DIFFERENT login is left alone. Otherwise
--     whoever scans second takes the first one's record.
--   * a login already attached to a different person in the same branch is
--     refused, for the same reason in reverse.
--   * both must be in the branch the page was opened for.
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

  -- Branch membership, at the floor tier. ON CONFLICT DO NOTHING because a
  -- staff member claiming their own record must not be demoted to 'member' by
  -- scanning the QR code on the screen behind them.
  INSERT INTO public.user_organizations (user_id, organization_id, role, is_primary)
  VALUES (_auth_user_id, p.organization_id, 'member', true)
  ON CONFLICT (user_id, organization_id) DO NOTHING;

  -- Said out loud in the record, because "who attached this login" is the
  -- first question if two people end up sharing one.
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

-- ---------------------------------------------------------------------------
-- Somebody the church does not have yet
-- ---------------------------------------------------------------------------
--
-- Recorded as a MEMBER, at the church's instruction, rather than as a visitor.
-- The one line that decides it is marked below, so it is a one-word change if
-- Sunday produces a directory full of people nobody recognises.
--
-- Everything else about this row is ordinary: it goes through
-- church.insert_person_from_json like every other person the app creates, so
-- the follow-up workflow trigger from 20260322000400 opens a card for them and
-- somebody actually telephones. A self-registration is a stranger's claim
-- about themselves until a human confirms it, and the card is what makes that
-- happen rather than hoping.
--
-- A DUPLICATE IS THE EXPECTED FAILURE, not an exceptional one: a member whose
-- email on file is the old Yahoo address will not be found, will register, and
-- will exist twice. That is why the search runs first, why it also tries the
-- telephone number, and why the office has church.people.merged_into_person_id.
-- It is a smaller problem than turning somebody away at the door.
CREATE OR REPLACE FUNCTION church.register_new_member(
  _organization_id UUID,
  _first_name TEXT,
  _last_name TEXT,
  _email TEXT,
  _phone TEXT,
  _auth_user_id UUID
)
RETURNS UUID
LANGUAGE plpgsql VOLATILE SECURITY DEFINER
SET search_path = church, public, extensions
AS $$
DECLARE
  _person_id UUID;
  _status_id UUID;
  _actor TEXT;
BEGIN
  IF coalesce(btrim(_first_name), '') = '' OR coalesce(btrim(_last_name), '') = '' THEN
    RAISE EXCEPTION 'first_name_required';
  END IF;
  IF coalesce(btrim(_email), '') = '' THEN
    RAISE EXCEPTION 'email_required';
  END IF;
  IF NOT EXISTS (SELECT 1 FROM public.organizations WHERE id = _organization_id) THEN
    RAISE EXCEPTION 'branch_not_found';
  END IF;

  -- THE LINE. 'member' because the church asked for it; 'visitor' is the other
  -- honest answer and both codes are seeded in every branch.
  SELECT id INTO _status_id FROM church.membership_statuses
   WHERE organization_id = _organization_id AND code = 'member' AND is_active;

  _actor := coalesce(btrim(_first_name) || ' ' || btrim(_last_name), 'Self-registered');

  _person_id := church.insert_person_from_json(
    _organization_id,
    jsonb_build_object(
      'first_name', btrim(_first_name),
      'last_name', btrim(_last_name),
      'email', btrim(_email),
      'phone', NULLIF(btrim(coalesce(_phone, '')), ''),
      'membership_status_id', _status_id,
      'member_since', CURRENT_DATE,
      'notes', 'Registered themselves from the QR code on '
               || to_char(CURRENT_DATE, 'FMDD Month YYYY')),
    false,
    _actor);

  PERFORM church.claim_attach_login(_person_id, _auth_user_id);

  -- Recorded as a member, and still put in front of a human. See
  -- church.claim_open_followup for why this is not left to the trigger.
  PERFORM church.claim_open_followup(_person_id);

  RETURN _person_id;
END;
$$;

-- ---------------------------------------------------------------------------
-- Somebody still has to say hello
-- ---------------------------------------------------------------------------
--
-- church.workflow_auto_add_person opens a follow-up card when a new person is
-- recorded with a status some workflow is watching. Silver Spring watches
-- exactly one: "First-time visitor follow-up", on the code 'visitor'.
--
-- And the church has asked that people who register themselves be recorded as
-- MEMBERS, not visitors. Both of those are reasonable and together they mean
-- nobody would ever be telephoned: the trigger would look for a workflow
-- watching 'member', find none, and the row would land in the directory with
-- nobody assigned to it. A stranger who typed their own name into a form on a
-- Sunday is precisely the person the front-door workflow exists for.
--
-- So this enrols them explicitly. It is deliberately NOT church.
-- add_person_to_workflow, which asserts can_manage_workflows — correct for a
-- staff screen, and impossible here, where the caller is the service role
-- acting for somebody with no account five seconds old.
--
-- The three statements below are the same three the trigger runs. They are
-- duplicated rather than shared because the trigger is load-bearing for the
-- check-in desk's visitor registration, and reaching into it to add a second
-- caller is a change to a path that already works on a Sunday morning.
CREATE OR REPLACE FUNCTION church.claim_open_followup(_person_id UUID)
RETURNS INTEGER
LANGUAGE plpgsql VOLATILE SECURITY DEFINER
SET search_path = church, public
AS $$
DECLARE
  p        church.people%ROWTYPE;
  w        RECORD;
  _step    UUID;
  _card    UUID;
  _opened  INTEGER := 0;
BEGIN
  SELECT * INTO p FROM church.people WHERE id = _person_id;
  IF NOT FOUND OR p.is_child THEN
    RETURN 0;
  END IF;

  FOR w IN
    SELECT wf.id, wf.default_assignee_person_id
    FROM church.workflows wf
    WHERE wf.organization_id = p.organization_id
      AND wf.is_active
      AND wf.auto_add_on_status_code = 'visitor'
  LOOP
    -- Already on this workflow: the trigger may have opened one, or they
    -- registered twice. Either way, one card.
    CONTINUE WHEN EXISTS (
      SELECT 1 FROM church.workflow_cards c
       WHERE c.workflow_id = w.id AND c.person_id = _person_id
         AND c.status IN ('open', 'snoozed'));

    SELECT s.id INTO _step
    FROM church.workflow_steps s
    WHERE s.workflow_id = w.id AND s.is_active
    ORDER BY s.sequence LIMIT 1;

    -- A half-built workflow is not a reason to fail somebody's registration.
    CONTINUE WHEN _step IS NULL;

    INSERT INTO church.workflow_cards
      (organization_id, workflow_id, person_id, current_step_id,
       assignee_person_id, due_on, created_by_name)
    VALUES
      (p.organization_id, w.id, _person_id, _step,
       w.default_assignee_person_id, church.workflow_due_date(_step),
       'Registered from the QR code')
    RETURNING id INTO _card;

    -- 'created', not 'added': chk_workflow_activity_kind lists the eight
    -- kinds a card's history may contain and this is the one that means a
    -- card came into existence.
    INSERT INTO church.workflow_card_activities
      (organization_id, card_id, kind, body, to_step_id,
       assignee_person_id, actor_name)
    VALUES
      (p.organization_id, _card, 'created',
       'Registered themselves from the QR code at church', _step,
       w.default_assignee_person_id, 'Self-registered');

    _opened := _opened + 1;
  END LOOP;

  RETURN _opened;
END;
$$;

GRANT EXECUTE ON FUNCTION church.claim_open_followup(UUID) TO service_role;

-- ---------------------------------------------------------------------------
-- Does this address already have a login?
-- ---------------------------------------------------------------------------
-- The JS admin API cannot ask this: listUsers pages through every account and
-- has no email filter, so the edge function would fetch a thousand users to
-- answer a yes/no and would quietly stop working at a thousand and one. One
-- indexed read answers it here.
--
-- auth.users is readable to the definer's owner and to nobody else; this
-- returns an id and never an email, a password hash or a timestamp.
CREATE OR REPLACE FUNCTION church.auth_user_id_for_email(_email TEXT)
RETURNS UUID
LANGUAGE sql STABLE SECURITY DEFINER
SET search_path = public, auth
AS $$
  SELECT u.id FROM auth.users u
   WHERE lower(btrim(u.email)) = lower(btrim(_email))
   ORDER BY u.created_at
   LIMIT 1
$$;

GRANT EXECUTE ON FUNCTION church.auth_user_id_for_email(TEXT) TO service_role;

-- ---------------------------------------------------------------------------
-- Grants: the service role and nobody else
-- ---------------------------------------------------------------------------
-- No GRANT to authenticated and none to anon. Every one of these is reachable
-- only through the member-claim edge function, which is where the rate limit
-- and the IP address live. 20260321000400 already revoked PUBLIC by default.
GRANT EXECUTE ON FUNCTION church.claim_lookup(UUID, TEXT, TEXT, TEXT, TEXT) TO service_role;
GRANT EXECUTE ON FUNCTION church.claim_note_attempt(TEXT, TEXT, TEXT) TO service_role;
GRANT EXECUTE ON FUNCTION church.claim_attach_login(UUID, UUID) TO service_role;
GRANT EXECUTE ON FUNCTION church.register_new_member(UUID, TEXT, TEXT, TEXT, TEXT, UUID) TO service_role;
GRANT EXECUTE ON FUNCTION church.mask_email(TEXT) TO service_role, authenticated;
GRANT SELECT, INSERT ON church.claim_attempts TO service_role;
GRANT USAGE, SELECT ON SEQUENCE church.claim_attempts_id_seq TO service_role;

COMMENT ON FUNCTION church.claim_lookup(UUID, TEXT, TEXT, TEXT, TEXT) IS
  'Is this person on our books, and what happens next. Returns yes/no and a '
  'masked address and nothing else - the caller is an unauthenticated stranger '
  'on a public page. Never matches a child.';

COMMENT ON FUNCTION church.claim_attach_login(UUID, UUID) IS
  'Joins a login to the person it belongs to, which is what stops a member who '
  'has just set a password being told their login is not linked to anything. '
  'Refuses if either side is already spoken for.';

NOTIFY pgrst, 'reload schema';
