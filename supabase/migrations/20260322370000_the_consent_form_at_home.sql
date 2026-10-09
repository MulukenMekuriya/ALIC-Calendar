-- =====================================================
-- The consent form a family can fill in at home
-- =====================================================
--
-- On 9 October 2026, seven forms had been signed, all at the desk on one
-- Sunday, covering 13 of the 333 children checked in over six weeks. The
-- ministry lead asked for four things, and this is the database's half of
-- them:
--
-- 1. THE DATE MOVES TO SUNDAY 6 DECEMBER. With 1 November three weeks away and
--    almost nobody signed, the rule would have turned roughly 320 children
--    away. Decided by the ministry; the notice text moves with it.
--
-- 2. AN EITHER/OR QUESTION HAS EXACTLY ONE ANSWER. The desk showed each pair
--    (snacks, extra support, off-site trips, photos, and the health question)
--    as two separate boxes, so a volunteer could tick both. Two of the seven
--    forms say "may" and "may not" to the same question. The screen is being
--    fixed; this makes the server refuse it too, because a screen is a screen
--    and this is a legal record. The two existing forms stand as signed, as
--    the ministry decided.
--
--    Which sections count is read from the document itself: any 'choice' or
--    'fields' section with two or more options, on the surface being signed.
--    Photo consent is answered per child, so it is checked per child.
--
-- 3. A PARENT CAN SEE AND SIGN THEIR OWN FORM. sign_kids_consent has accepted
--    source 'portal' since 20260322210100; nothing called it. my_consent_status
--    gives My Church what it needs to show each child's position and offer
--    the form.
--
-- 4. THE ADMIN LIST. kids_consent_roster is one row per family with children:
--    who is covered, who signed and when, whether a reminder went, and
--    whether the person asking may open the signed form. Opening it still goes
--    through consent_pdf_signed_url, which is audited and allows kids admins
--    and the office only.
--
-- 5. REMINDERS TO FAMILIES WHO HAVE NOT SIGNED. There was no such email. A
--    kids admin or leader can send one from the list; a weekly job sends one
--    every Thursday evening to families whose children came in the last eight
--    weeks, at most once a week each. The email links straight to the form in
--    My Church. kids_consent_reminders records each one, so the list can say
--    when a family was last asked.

-- ---------------------------------------------------------- 1. the date

UPDATE church.kids_consent_policy
   SET enforce_from = DATE '2026-12-06',
       notice_text = replace(notice_text, 'From Sunday 1 November', 'From Sunday 6 December')
 WHERE organization_id = 'a0eebc99-9c0b-4ef8-bb6d-6bb9bd380a11'
   AND mode = 'block'
   AND enforce_from = DATE '2026-11-01';

-- ---------------------------------------------------------- 3. My Church

/**
 * The caller's children and where each one stands, for My Church.
 *
 * One row per child, with the household the caller is an adult of and the
 * caller's own person in it: the portal signs as that person, and
 * sign_kids_consent refuses anybody else.
 */
CREATE OR REPLACE FUNCTION church.my_consent_status()
RETURNS TABLE (
  organization_id UUID,
  household_id UUID,
  household_name TEXT,
  signer_person_id UUID,
  signer_name TEXT,
  child_person_id UUID,
  child_name TEXT,
  state TEXT,
  signature_id UUID,
  signed_at TIMESTAMPTZ,
  resign_due_by DATE,
  has_pdf BOOLEAN
)
LANGUAGE sql STABLE SECURITY DEFINER
SET search_path = church, public
AS $$
  WITH mine AS (
    SELECT DISTINCT ON (hm.household_id)
           hm.household_id, p.id AS person_id,
           coalesce(p.preferred_name, p.first_name) || ' ' || p.last_name AS name
    FROM church.household_members hm
    JOIN church.people p ON p.id = hm.person_id
    WHERE hm.person_id IN (SELECT church.my_person_ids())
      AND hm.end_date IS NULL
      AND NOT p.is_child
      AND p.is_active
    ORDER BY hm.household_id, p.id
  )
  SELECT DISTINCT ON (c.id)
         h.organization_id, m.household_id, h.name, m.person_id, m.name,
         c.id, coalesce(c.preferred_name, c.first_name) || ' ' || c.last_name,
         st.state, st.signature_id, st.signed_at, st.resign_due_by,
         EXISTS (SELECT 1 FROM church.consent_signatures s
                  WHERE s.id = st.signature_id AND s.pdf_storage_path IS NOT NULL)
  FROM mine m
  JOIN church.households h ON h.id = m.household_id
  JOIN church.household_members chm
    ON chm.household_id = m.household_id AND chm.end_date IS NULL
  JOIN church.people c
    ON c.id = chm.person_id AND c.is_child AND c.is_active
   AND c.merged_into_person_id IS NULL
  CROSS JOIN LATERAL church.child_consent_state(c.id, m.household_id) st
  ORDER BY c.id, m.household_id;
$$;

REVOKE ALL ON FUNCTION church.my_consent_status() FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION church.my_consent_status() TO authenticated;

-- ---------------------------------------------------------- 4. the admin list

/**
 * One row per family with children, for the Consent tab.
 *
 * The same families kids_consent_coverage counts, so the list and the card
 * above it agree. No medical detail: the form itself is opened separately,
 * through consent_pdf_signed_url, and can_open says whether this person may.
 */
CREATE OR REPLACE FUNCTION church.kids_consent_roster(_organization_id UUID)
RETURNS TABLE (
  household_id UUID,
  household_name TEXT,
  children JSONB,
  status TEXT,
  resign_due_by DATE,
  signature_id UUID,
  signed_at TIMESTAMPTZ,
  signed_by TEXT,
  source TEXT,
  has_pdf BOOLEAN,
  can_open BOOLEAN,
  emailable_adults INTEGER,
  last_check_in DATE,
  last_reminded_at TIMESTAMPTZ
)
LANGUAGE plpgsql STABLE SECURITY DEFINER
SET search_path = church, public
AS $$
BEGIN
  IF NOT church.has_permission_in_org(
           _organization_id,
           ARRAY['kids_admin','kids_leader','leadership_viewer']::church.module_permission[]) THEN
    RAISE EXCEPTION 'not_permitted' USING ERRCODE = '42501';
  END IF;

  RETURN QUERY
  WITH kids AS (
    SELECT hm.household_id, p.id,
           coalesce(p.preferred_name, p.first_name) || ' ' || p.last_name AS name
    FROM church.people p
    JOIN church.household_members hm ON hm.person_id = p.id AND hm.end_date IS NULL
    WHERE p.organization_id = _organization_id
      AND p.is_child AND p.is_active AND p.merged_into_person_id IS NULL
  ),
  scored AS (
    SELECT k.household_id, k.id, k.name, st.state, st.resign_due_by
    FROM kids k
    CROSS JOIN LATERAL church.child_consent_state(k.id, k.household_id) st
  ),
  homes AS (
    SELECT s.household_id,
           jsonb_agg(jsonb_build_object('id', s.id, 'name', s.name, 'state', s.state)
                     ORDER BY s.name) AS children,
           count(*) AS total,
           count(*) FILTER (WHERE s.state IN ('covered', 'covered_elsewhere')) AS covered,
           count(*) FILTER (WHERE s.state = 'consent_out_of_date') AS stale,
           min(s.resign_due_by) FILTER (WHERE s.resign_due_by >= current_date) AS due
    FROM scored s
    GROUP BY s.household_id
  )
  SELECT h.id, coalesce(h.name, 'Unnamed household'), homes.children,
         CASE WHEN homes.stale > 0 THEN 'out_of_date'
              WHEN homes.covered = homes.total AND homes.due IS NOT NULL THEN 'resign_due'
              WHEN homes.covered = homes.total THEN 'signed'
              WHEN homes.covered > 0 THEN 'partly'
              ELSE 'not_signed' END,
         homes.due,
         sig.id, sig.signed_at, sig.signer_printed_name, sig.source,
         sig.pdf_storage_path IS NOT NULL,
         CASE WHEN sig.id IS NULL THEN false ELSE church.can_read_consent_pdf(sig.id) END,
         (SELECT count(*)::INTEGER
            FROM church.household_members am
            JOIN church.people a ON a.id = am.person_id
           WHERE am.household_id = h.id AND am.end_date IS NULL
             AND NOT a.is_child AND a.is_active
             AND a.notify_by_email AND a.email IS NOT NULL AND btrim(a.email) <> ''),
         (SELECT max(ci.checked_in_at)::DATE
            FROM church.kids_check_ins ci
           WHERE ci.child_person_id IN (SELECT k2.id FROM kids k2 WHERE k2.household_id = h.id)),
         (SELECT max(r.sent_at) FROM church.kids_consent_reminders r WHERE r.household_id = h.id)
  FROM homes
  JOIN church.households h ON h.id = homes.household_id
  LEFT JOIN LATERAL (
    SELECT s.id, s.signed_at, s.signer_printed_name, s.source, s.pdf_storage_path
    FROM church.consent_signatures s
    WHERE s.household_id = h.id AND s.revoked_at IS NULL
    ORDER BY s.signed_at DESC
    LIMIT 1
  ) sig ON true
  ORDER BY coalesce(h.name, '');
END;
$$;

REVOKE ALL ON FUNCTION church.kids_consent_roster(UUID) FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION church.kids_consent_roster(UUID) TO authenticated;

-- ---------------------------------------------------------- 5. reminders

ALTER TABLE church.notification_log DROP CONSTRAINT IF EXISTS chk_notification_kind;
ALTER TABLE church.notification_log ADD CONSTRAINT chk_notification_kind CHECK (kind = ANY (ARRAY[
  'check_in', 'check_out', 'volunteer_message', 'kids_auto_expired',
  'kids_access_granted', 'kids_late_pickup', 'kids_check_in_held',
  'kids_hold_presented', 'kids_incident_raised', 'kids_incident_to_parent',
  'kids_medical_updated', 'kids_consent_resign_needed',
  'kids_consent_resign_reminder', 'kids_consent_resign_overdue',
  'kids_consent_signed', 'kids_consent_filed', 'kids_records_due',
  'kids_consent_requested']::TEXT[]));

/** One row per reminder sent to a family, so the list can say when. */
CREATE TABLE IF NOT EXISTS church.kids_consent_reminders (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  organization_id UUID NOT NULL,
  household_id UUID NOT NULL REFERENCES church.households(id) ON DELETE CASCADE,
  sent_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  sent_by UUID,
  sent_by_name TEXT,
  manual BOOLEAN NOT NULL,
  emails INTEGER NOT NULL
);
CREATE INDEX IF NOT EXISTS idx_kids_consent_reminders_household
  ON church.kids_consent_reminders (household_id, sent_at DESC);
ALTER TABLE church.kids_consent_reminders ENABLE ROW LEVEL SECURITY;
REVOKE ALL ON church.kids_consent_reminders FROM PUBLIC, anon, authenticated;
GRANT SELECT, INSERT, UPDATE, DELETE ON church.kids_consent_reminders TO service_role;

/**
 * Queue "please fill in the consent form" for families who have not.
 *
 * _household_ids NULL means every family whose children came in the last
 * eight weeks: a family that stopped coming a year ago is not written to
 * every Thursday. A family asked in the last six days is skipped by the
 * weekly job; a button press skips only one asked in the last hour, so a
 * double-click is not two emails.
 *
 * The greeting, the blessing and the church's name are added by
 * send-kids-notification around this body. The line holding only the link is
 * drawn there as a button.
 */
CREATE OR REPLACE FUNCTION church.kids_queue_consent_reminders(
  _organization_id UUID, _household_ids UUID[], _manual BOOLEAN,
  _actor UUID, _actor_name TEXT,
  OUT households INTEGER, OUT emails INTEGER)
LANGUAGE plpgsql SECURITY DEFINER
SET search_path = church, public, extensions
AS $$
DECLARE
  h RECORD;
  _names TEXT[];
  _stale_only BOOLEAN;
  _who TEXT;
  _deadline DATE;
  _body TEXT;
  _subject TEXT;
  _n INTEGER;
  _link CONSTANT TEXT := 'https://www.addislidet.info/my?tab=children&consent=1';
BEGIN
  households := 0;
  emails := 0;

  SELECT p.enforce_from INTO _deadline
  FROM church.kids_consent_policy p
  WHERE p.organization_id = _organization_id
    AND p.mode = 'block' AND p.enforce_from > current_date;

  FOR h IN
    SELECT hh.id, array_agg(x.first ORDER BY x.first) AS names,
           bool_and(x.state = 'consent_out_of_date') AS stale_only,
           (array_agg(x.id))[1] AS first_child
    FROM church.households hh
    JOIN LATERAL (
      SELECT c.id, coalesce(c.preferred_name, c.first_name) AS first, st.state
      FROM church.household_members cm
      JOIN church.people c ON c.id = cm.person_id
      CROSS JOIN LATERAL church.child_consent_state(c.id, hh.id) st
      WHERE cm.household_id = hh.id AND cm.end_date IS NULL
        AND c.is_child AND c.is_active AND c.merged_into_person_id IS NULL
        AND st.state NOT IN ('covered', 'covered_elsewhere')
    ) x ON true
    WHERE hh.organization_id = _organization_id
      AND (CASE WHEN _household_ids IS NULL THEN
             EXISTS (SELECT 1 FROM church.kids_check_ins ci
                     JOIN church.household_members km
                       ON km.person_id = ci.child_person_id AND km.end_date IS NULL
                     WHERE km.household_id = hh.id
                       AND ci.checked_in_at > now() - interval '8 weeks')
           ELSE hh.id = ANY(_household_ids) END)
      AND NOT EXISTS (
        SELECT 1 FROM church.kids_consent_reminders r
        WHERE r.household_id = hh.id
          AND r.sent_at > now() - CASE WHEN _manual THEN interval '1 hour'
                                       ELSE interval '6 days' END)
    GROUP BY hh.id
  LOOP
    _who := church.kids_join_names(h.names);
    _subject := 'Consent form for ' || _who;
    _body :=
      CASE WHEN h.stale_only THEN
        'The consent and medical form we hold for ' || _who
        || ' was signed before their medical information was updated, so it needs '
        || 'filling in once more.'
      ELSE
        'We ask every family to fill in a short consent and medical form before '
        || 'the children go to their classrooms, and we don''t yet have one for '
        || _who || '.'
      END
      || E'\n\n'
      || 'It takes about five minutes, and you can do it now in My Church:'
      || E'\n\n' || _link || E'\n\n'
      || 'If you would rather fill it in with somebody, or can''t sign in, any of '
      || 'the Children''s Ministry team will gladly help you at the check-in desk '
      || 'on Sunday.'
      || CASE WHEN _deadline IS NOT NULL THEN
           E'\n\n' || 'From Sunday ' || to_char(_deadline, 'FMDD FMMonth')
           || ', we''ll need the form before children can go to a classroom.'
         ELSE '' END;

    INSERT INTO church.notification_log (
      organization_id, kind, channel, recipient_person_id, recipient_name,
      recipient_email, child_person_id, subject, body, sent_by_name, sent_by_auth_user)
    SELECT _organization_id, 'kids_consent_requested', 'email', a.id,
           coalesce(a.preferred_name, a.first_name) || ' ' || a.last_name,
           a.email, h.first_child, _subject, _body, _actor_name, _actor
    FROM church.household_members am
    JOIN church.people a ON a.id = am.person_id
    WHERE am.household_id = h.id AND am.end_date IS NULL
      AND NOT a.is_child AND a.is_active
      AND a.notify_by_email AND a.email IS NOT NULL AND btrim(a.email) <> '';
    GET DIAGNOSTICS _n = ROW_COUNT;

    -- Nobody to write to: nothing sent, so nothing recorded.
    CONTINUE WHEN _n = 0;

    INSERT INTO church.kids_consent_reminders
      (organization_id, household_id, sent_by, sent_by_name, manual, emails)
    VALUES (_organization_id, h.id, _actor, _actor_name, _manual, _n);

    households := households + 1;
    emails := emails + _n;
  END LOOP;
END;
$$;

REVOKE ALL ON FUNCTION church.kids_queue_consent_reminders(UUID, UUID[], BOOLEAN, UUID, TEXT)
  FROM PUBLIC, anon, authenticated;

/** The list's button: one family, a few, or every family not yet signed. */
CREATE OR REPLACE FUNCTION church.kids_send_consent_reminders(
  _organization_id UUID, _household_ids UUID[] DEFAULT NULL,
  OUT households INTEGER, OUT emails INTEGER)
LANGUAGE plpgsql SECURITY DEFINER
SET search_path = church, public, extensions
AS $$
DECLARE _actor_name TEXT;
BEGIN
  IF NOT church.has_permission_in_org(
           _organization_id,
           ARRAY['kids_admin','kids_leader']::church.module_permission[]) THEN
    RAISE EXCEPTION 'not_permitted' USING ERRCODE = '42501';
  END IF;
  _actor_name := coalesce(
    (SELECT full_name FROM public.profiles WHERE id = auth.uid()), 'Kids Ministry');
  SELECT q.households, q.emails INTO households, emails
  FROM church.kids_queue_consent_reminders(
         _organization_id, _household_ids, true, auth.uid(), _actor_name) q;
END;
$$;

REVOKE ALL ON FUNCTION church.kids_send_consent_reminders(UUID, UUID[]) FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION church.kids_send_consent_reminders(UUID, UUID[]) TO authenticated;

/** The Thursday job, for every church whose rule is not switched off. */
CREATE OR REPLACE FUNCTION church.kids_consent_reminder_sweep()
RETURNS INTEGER
LANGUAGE plpgsql SECURITY DEFINER
SET search_path = church, public, extensions
AS $$
DECLARE _org UUID; _total INTEGER := 0; _r RECORD;
BEGIN
  FOR _org IN
    SELECT p.organization_id FROM church.kids_consent_policy p WHERE p.mode <> 'off'
  LOOP
    BEGIN
      SELECT * INTO _r FROM church.kids_queue_consent_reminders(_org, NULL, false, NULL, NULL);
      _total := _total + coalesce(_r.emails, 0);
    EXCEPTION WHEN OTHERS THEN
      RAISE WARNING 'consent reminder sweep failed for %: %', _org, SQLERRM;
    END;
  END LOOP;
  RETURN _total;
END;
$$;

REVOKE ALL ON FUNCTION church.kids_consent_reminder_sweep() FROM PUBLIC, anon, authenticated;
GRANT EXECUTE ON FUNCTION church.kids_consent_reminder_sweep() TO service_role;

-- Thursday 23:00 UTC: 7pm Eastern until 1 November, 6pm after. Early enough
-- to be read that evening, and three days before the Sunday it is for.
SELECT cron.unschedule('kids-consent-reminders')
WHERE EXISTS (SELECT 1 FROM cron.job WHERE jobname = 'kids-consent-reminders');

SELECT cron.schedule('kids-consent-reminders', '0 23 * * 4',
                     'SELECT church.kids_consent_reminder_sweep()');

-- ---------------------------------------------------------- 2. one answer each

-- Unchanged from 20260322210100 except the block marked "Either/or
-- questions", which refuses a signature that gives both answers, or none, to
-- one question. Same signature, so CREATE OR REPLACE keeps its grants.

CREATE OR REPLACE FUNCTION church.sign_kids_consent(_organization_id uuid, _household_id uuid, _child_person_ids uuid[], _signer_person_id uuid, _signer_printed_name text, _source text, _answers jsonb DEFAULT '{}'::jsonb, _per_child_answers jsonb DEFAULT '{}'::jsonb, _signer_relationship text DEFAULT NULL::text, _secondary_signer_person_id uuid DEFAULT NULL::uuid, _secondary_printed_name text DEFAULT NULL::text, _witness_station_id uuid DEFAULT NULL::uuid, _user_agent text DEFAULT NULL::text, _client_ip_reported text DEFAULT NULL::text)
 RETURNS TABLE(signature_id uuid, document_version integer, document_sha256 text, children_named integer, superseded_signature_id uuid)
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO 'church', 'public', 'extensions'
AS $function$
DECLARE
  _doc         RECORD;
  _actor_name  TEXT;
  _is_parent   BOOLEAN;
  _is_team     BOOLEAN;
  _ticked      TEXT[];
  _missing     TEXT;
  _sig         UUID;
  _superseded  UUID;
  _child       UUID;
  _named       INTEGER := 0;
  _witness_uid UUID;
  _section     JSONB;
  _keys        TEXT[];
  _chosen      INTEGER;
BEGIN
  IF auth.uid() IS NULL THEN
    RAISE EXCEPTION 'not_authenticated' USING ERRCODE = '28000';
  END IF;

  IF _source NOT IN ('kiosk', 'portal') THEN
    RAISE EXCEPTION 'source_must_be_kiosk_or_portal';
  END IF;

  IF _child_person_ids IS NULL OR array_length(_child_person_ids, 1) IS NULL THEN
    RAISE EXCEPTION 'a_signature_must_name_at_least_one_child'
      USING HINT = 'Coverage is per named child. A signature naming nobody '
                   'covers nobody.';
  END IF;

  -- Who may sign, and as what ------------------------------------------------
  --
  -- The portal path is the parent themselves: the signer must be one of the
  -- caller's own person records. Free text alone would let "Mickey Mouse"
  -- onto a legal record, which is why signer_person_id is picked rather than
  -- typed, and the typed string is stored beside it.
  _is_parent := _signer_person_id IN (SELECT church.my_person_ids());
  _is_team   := church.has_permission_in_org(
                  _organization_id,
                  ARRAY['kids_admin','kids_leader','kids_volunteer']::church.module_permission[]);

  IF _source = 'portal' AND NOT _is_parent THEN
    RAISE EXCEPTION 'not_permitted' USING ERRCODE = '42501',
      HINT = 'A portal signature must be signed by the parent themselves.';
  END IF;

  -- The in-person path is a member of the kids team at the desk, standing
  -- with the parent. The self-service kiosk account has no module grant at
  -- all by design, so it cannot satisfy this yet; the branch that gives
  -- resolve_actor its kiosk arm is what opens this path to an unattended
  -- device, and until then signing in person means a staffed desk.
  IF _source = 'kiosk' AND NOT _is_team AND NOT _is_parent THEN
    RAISE EXCEPTION 'not_permitted' USING ERRCODE = '42501',
      HINT = 'Signing at the desk is done by the Kids Ministry team.';
  END IF;

  -- The document -------------------------------------------------------------
  SELECT d.* INTO _doc
  FROM church.consent_documents d
  WHERE d.organization_id = _organization_id
    AND d.code = 'kids_parent_consent'
    AND d.retired_at IS NULL
    AND d.effective_from <= current_date;

  IF _doc.id IS NULL THEN
    RAISE EXCEPTION 'no_consent_form_published'
      USING HINT = 'A Kids Ministry admin must publish the form first.';
  END IF;

  -- The household ------------------------------------------------------------
  IF _household_id IS NULL THEN
    RAISE EXCEPTION 'no_guardian_on_record'
      USING HINT = 'Register the family first - a consent with no recorded '
                   'guardian is not a consent.';
  END IF;

  IF NOT EXISTS (
    SELECT 1 FROM church.household_members hm
    JOIN church.people p ON p.id = hm.person_id
    WHERE hm.household_id = _household_id
      AND hm.person_id = _signer_person_id
      AND hm.end_date IS NULL
      AND NOT p.is_child
  ) THEN
    RAISE EXCEPTION 'signer_not_an_adult_of_this_household'
      USING HINT = 'The signer is picked from the household''s adults.';
  END IF;

  -- Every child must currently belong to the household being signed for.
  -- Otherwise one parent could name another family's child on their form.
  SELECT c INTO _child
  FROM unnest(_child_person_ids) AS c
  WHERE NOT EXISTS (
    SELECT 1 FROM church.household_members hm
    WHERE hm.household_id = _household_id AND hm.person_id = c AND hm.end_date IS NULL)
  LIMIT 1;

  IF _child IS NOT NULL THEN
    RAISE EXCEPTION 'child_not_in_this_household: %', _child;
  END IF;

  -- The acknowledgments ------------------------------------------------------
  --
  -- The server is the authority on this, not the screen. A screen that
  -- forgets to require a tick is a screen, and this is a legal record.
  SELECT coalesce(array_agg(k), '{}') INTO _ticked
  FROM jsonb_object_keys(coalesce(_answers, '{}'::jsonb)) AS k
  WHERE (_answers->>k) IN ('true', 'yes', 'on');

  SELECT r INTO _missing
  FROM unnest(_doc.required_acknowledgments) AS r
  WHERE NOT (r = ANY(_ticked))
  LIMIT 1;

  IF _missing IS NOT NULL THEN
    RAISE EXCEPTION 'required_acknowledgment_missing: %', _missing
      USING HINT = 'Every required item on the form must be agreed to '
                   'individually.';
  END IF;

  -- Either/or questions -----------------------------------------------------
  --
  -- A section offering two or more answers to one question takes exactly one,
  -- on the surface being signed. The desk once drew each pair as two separate
  -- boxes, and forms came back saying "may" and "may not" to the same thing.
  -- Photo consent is per child, so it is counted per child.
  FOR _section IN
    SELECT sec FROM jsonb_array_elements(_doc.body) AS sec
    WHERE sec->>'kind' IN ('choice', 'fields')
      AND jsonb_array_length(coalesce(sec->'options', '[]'::jsonb)) > 1
      AND coalesce(sec->>'surface', 'both') IN ('both', _source)
  LOOP
    SELECT array_agg(o->>'key') INTO _keys
    FROM jsonb_array_elements(_section->'options') AS o;

    IF _section->>'key' = 'photo_video' THEN
      FOREACH _child IN ARRAY _child_person_ids LOOP
        SELECT count(*) INTO _chosen FROM unnest(_keys) AS k
        WHERE (_per_child_answers -> (_child::TEXT) ->> k) IN ('true', 'yes', 'on');
        IF _chosen <> 1 THEN
          RAISE EXCEPTION 'choose_one_answer: %', _section->>'key'
            USING HINT = 'Each child needs one answer to the photo question.';
        END IF;
      END LOOP;
    ELSE
      SELECT count(*) INTO _chosen FROM unnest(_keys) AS k
      WHERE (_answers ->> k) IN ('true', 'yes', 'on');
      IF _chosen <> 1 THEN
        RAISE EXCEPTION 'choose_one_answer: %', _section->>'key'
          USING HINT = 'This question takes exactly one answer.';
      END IF;
    END IF;
  END LOOP;
  _child := NULL;

  _actor_name := coalesce(
    (SELECT full_name FROM public.profiles WHERE id = auth.uid()), 'Kids Ministry');

  -- Attribution. At a staffed desk the witness is the signed-in volunteer;
  -- on a registered device it is the device.
  IF _source = 'kiosk' AND _is_team THEN
    _witness_uid := auth.uid();
  END IF;

  -- Supersede the household's previous live signature. PRESENTATIONAL: it
  -- does not remove coverage from anybody named on it. See the header.
  SELECT s.id INTO _superseded
  FROM church.consent_signatures s
  WHERE s.household_id = _household_id
    AND s.document_code = 'kids_parent_consent'
    AND s.revoked_at IS NULL
    AND s.superseded_by_signature_id IS NULL
  ORDER BY s.signed_at DESC
  LIMIT 1;

  INSERT INTO church.consent_signatures (
    organization_id, household_id, consent_document_id, document_code,
    document_version, document_sha256,
    signer_person_id, signer_printed_name, signer_relationship,
    answers, source,
    signer_auth_user_id, witness_volunteer_id, witness_station_id, witness_name,
    secondary_signer_person_id, secondary_signer_printed_name, secondary_signed_at,
    user_agent, client_ip_reported)
  VALUES (
    _organization_id, _household_id, _doc.id, _doc.code,
    _doc.version, _doc.body_sha256,
    _signer_person_id, btrim(_signer_printed_name), _signer_relationship,
    coalesce(_answers, '{}'::jsonb), _source,
    CASE WHEN _source = 'portal' THEN auth.uid() END,
    _witness_uid,
    CASE WHEN _source = 'kiosk' THEN _witness_station_id END,
    CASE WHEN _source = 'kiosk' AND _witness_uid IS NOT NULL THEN _actor_name END,
    _secondary_signer_person_id,
    nullif(btrim(coalesce(_secondary_printed_name, '')), ''),
    CASE WHEN nullif(btrim(coalesce(_secondary_printed_name, '')), '') IS NOT NULL
         THEN now() END,
    _user_agent, _client_ip_reported)
  RETURNING id INTO _sig;

  -- The named children, frozen as text.
  FOREACH _child IN ARRAY _child_person_ids LOOP
    INSERT INTO church.consent_children (
      consent_signature_id, organization_id, child_person_id,
      child_name_at_signing, child_dob_text, child_grade_text, per_child_answers)
    SELECT _sig, _organization_id, p.id,
           coalesce(p.preferred_name, p.first_name) || ' ' || p.last_name,
           CASE WHEN p.birth_year IS NOT NULL
                THEN p.birth_year::TEXT ||
                     coalesce('-' || lpad(p.birth_month::TEXT, 2, '0'), '') END,
           (SELECT g.display_name FROM church.school_grades g WHERE g.id = p.school_grade_id),
           coalesce(_per_child_answers->(p.id::TEXT), '{}'::jsonb)
    FROM church.people p
    WHERE p.id = _child AND p.organization_id = _organization_id
    ON CONFLICT (consent_signature_id, child_person_id) DO NOTHING;

    _named := _named + 1;
  END LOOP;

  IF _superseded IS NOT NULL THEN
    UPDATE church.consent_signatures
       SET superseded_by_signature_id = _sig
     WHERE id = _superseded;
  END IF;

  INSERT INTO church.check_in_audit (
    organization_id, action, outcome, actor_auth_user_id, actor_name, detail)
  VALUES (_organization_id, 'consent_signed', 'success', auth.uid(), _actor_name,
          jsonb_build_object('signature_id', _sig, 'household_id', _household_id,
                             'children', _named, 'source', _source,
                             'document_version', _doc.version,
                             'superseded', _superseded));

  RETURN QUERY SELECT _sig, _doc.version, _doc.body_sha256, _named, _superseded;
END;
$function$;

NOTIFY pgrst, 'reload schema';
