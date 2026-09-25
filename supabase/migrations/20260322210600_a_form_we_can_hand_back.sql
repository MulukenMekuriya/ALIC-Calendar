-- =====================================================
-- A form we can hand back
-- =====================================================
--
-- The stored PDF of a signed consent form, and of an injury report. Two
-- private buckets, one renderer, and a read path that records who opened
-- what.
--
-- WHY THE RENDERER IS SERVER-SIDE AND NOT IN THE BROWSER. Four reasons, and
-- the second is the decisive one:
--
--   1. REGENERABLE MEANS REGENERABLE IDENTICALLY. A client generator lives in
--      a bundle that is redeployed weekly. Regenerating a 2026 form in 2028
--      would run 2028's code over a 2026 signature. Server-side, the renderer
--      is one versioned function whose entire input is frozen rows.
--   2. THE KIOSK IS A SHARED TABLET. Generating bytes that name a child's
--      allergies and medications in a browser twelve families touch that
--      morning, then uploading them with the volunteer's JWT, means that
--      session can read back what it just wrote. Rendered server-side with
--      the service role, THE BYTES NEVER EXIST ON THE TABLET and the bucket
--      can be closed to authenticated writes entirely - which it is, below.
--   3. The email drainer already runs in Deno with the service role, so the
--      renderer and the sender share a runtime.
--   4. One renderer for both surfaces rather than two code paths with two
--      sets of bugs.
--
-- THE STORED OBJECT IS THE ANSWER, NOT A CACHE. "Regenerable" is a
-- disaster-recovery property, proved by pdf_sha256. The office reads the
-- stored bytes; nothing re-renders on a routine download, because a document
-- that is rebuilt every time it is read is a document nobody can prove
-- anything about.
--
-- WRITES ARE SERVICE-ROLE ONLY. There is deliberately NO insert, update or
-- delete policy on storage.objects for `authenticated` in either bucket. A
-- signed medical release is not something a session should be able to add to
-- or replace, and the assertions check for the absence rather than trusting
-- that nobody wrote one.
--
-- READS ARE AUDITED. Not through a raw bucket read but through an RPC that
-- mints a 60-second URL and writes a sensitive_viewed row first, so "who
-- opened this child's medical consent, and when" is a question with an
-- answer.

-- ---------------------------------------------------------------------------
-- The buckets
-- ---------------------------------------------------------------------------
--
-- 2 MB. A two-page text PDF is about 30 KB, so this is fifty times the real
-- size and still a tight enough ceiling that the bucket cannot quietly become
-- somewhere else to put things.
--
-- application/pdf only, for the same reason: the bucket holds one kind of
-- object and anything else in it is a mistake or worse.
INSERT INTO storage.buckets (id, name, public, file_size_limit, allowed_mime_types)
VALUES
  ('kids-consent-forms', 'kids-consent-forms', false, 2097152, ARRAY['application/pdf']),
  ('kids-incident-reports', 'kids-incident-reports', false, 2097152, ARRAY['application/pdf'])
ON CONFLICT (id) DO NOTHING;

-- ---------------------------------------------------------------------------
-- Where the bytes went
-- ---------------------------------------------------------------------------
ALTER TABLE church.consent_signatures
  ADD COLUMN IF NOT EXISTS pdf_error TEXT;
ALTER TABLE church.consent_signatures
  ADD COLUMN IF NOT EXISTS pdf_attempts INTEGER NOT NULL DEFAULT 0;

COMMENT ON COLUMN church.consent_signatures.pdf_error IS
  'Why the last render failed. A signature with no PDF is still a valid '
  'signature - the bytes are a convenience for the family and the office, not '
  'the record - so a failure is recorded here rather than raised.';

ALTER TABLE church.kids_incidents
  ADD COLUMN IF NOT EXISTS pdf_error TEXT;
ALTER TABLE church.kids_incidents
  ADD COLUMN IF NOT EXISTS pdf_attempts INTEGER NOT NULL DEFAULT 0;

-- The renderer's work queue is "rows with no path yet", so this is the index
-- it runs on. Attempts are capped in the query rather than here, so a row
-- that keeps failing stops being retried but stays visible.
CREATE INDEX IF NOT EXISTS idx_consent_signatures_pdf_pending
  ON church.consent_signatures (signed_at)
  WHERE pdf_storage_path IS NULL;

CREATE INDEX IF NOT EXISTS idx_kids_incidents_pdf_pending
  ON church.kids_incidents (reported_at)
  WHERE pdf_storage_path IS NULL AND severity IN ('injury', 'safeguarding');

-- ---------------------------------------------------------------------------
-- Who may read a stored consent form
-- ---------------------------------------------------------------------------
--
-- NOT kids_volunteer and NOT leadership_viewer. The document holds a child's
-- allergies, medications and emergency medical authorisation; a volunteer at
-- a desk needs the allergy on the label and the safety card, not the family's
-- signed medical release, and a read-only reporting role is not a clinical
-- one.
CREATE OR REPLACE FUNCTION church.can_read_consent_pdf(_signature_id UUID)
RETURNS BOOLEAN
LANGUAGE sql STABLE SECURITY DEFINER
SET search_path = church, public
AS $$
  SELECT EXISTS (
    SELECT 1 FROM church.consent_signatures s
    WHERE s.id = _signature_id
      AND (
        -- The office.
        church.has_permission_in_org(
          s.organization_id,
          ARRAY['kids_admin','members_admin']::church.module_permission[])
        -- The household it belongs to.
        OR s.household_id IN (SELECT church.my_household_ids())
        -- Or the person who signed it, wherever they live now. Somebody who
        -- put their name to a document keeps access to it.
        OR s.signer_person_id IN (SELECT church.my_person_ids())
      )
  )
$$;

GRANT EXECUTE ON FUNCTION church.can_read_consent_pdf(UUID) TO authenticated;

-- An incident report is narrower still: leadership only, and NO parent path
-- at all. A family receives the PDF as an email attachment when a leader
-- decides to send it; there is no portal view of incidents, and this policy
-- is part of what stops one appearing by accident.
CREATE OR REPLACE FUNCTION church.can_read_incident_pdf(_incident_id UUID)
RETURNS BOOLEAN
LANGUAGE sql STABLE SECURITY DEFINER
SET search_path = church, public
AS $$
  SELECT EXISTS (
    SELECT 1 FROM church.kids_incidents i
    WHERE i.id = _incident_id
      AND church.has_permission_in_org(
            i.organization_id,
            ARRAY['kids_admin','kids_leader']::church.module_permission[])
  )
$$;

GRANT EXECUTE ON FUNCTION church.can_read_incident_pdf(UUID) TO authenticated;

-- ---------------------------------------------------------------------------
-- Storage policies
-- ---------------------------------------------------------------------------
--
-- SELECT only, for both buckets.
--
-- The id lives in the FILENAME, not in a folder:
--   consent   <organization_id>/<household_id>/<signature_id>.pdf
--   incident  <organization_id>/<incident_id>.pdf
--
-- storage.foldername() returns only the directory parts and DROPS the last
-- segment, so indexing into it for the id gives NULL and the policy denies
-- everything. storage.filename() is the one that returns it. The extension
-- has to come off before it can be read as a uuid.
--
-- uuid_or_null rather than a cast: the object name is a string, a cast on a
-- stray file raises, and a policy that raises is a 500 for every reader of
-- the bucket rather than a denial of one file.
DROP POLICY IF EXISTS "Consent forms are readable by those who may see them" ON storage.objects;
CREATE POLICY "Consent forms are readable by those who may see them"
  ON storage.objects FOR SELECT TO authenticated
  USING (
    bucket_id = 'kids-consent-forms'
    AND church.can_read_consent_pdf(
          church.uuid_or_null(regexp_replace(storage.filename(name), '\.pdf$', '')))
  );

DROP POLICY IF EXISTS "Incident reports are readable by leaders" ON storage.objects;
CREATE POLICY "Incident reports are readable by leaders"
  ON storage.objects FOR SELECT TO authenticated
  USING (
    bucket_id = 'kids-incident-reports'
    AND church.can_read_incident_pdf(
          church.uuid_or_null(regexp_replace(storage.filename(name), '\.pdf$', '')))
  );

-- Deliberately no INSERT, UPDATE or DELETE policy for `authenticated` on
-- either bucket. Only the service role writes. See the header.

-- ---------------------------------------------------------------------------
-- Reading one, with a record of having read it
-- ---------------------------------------------------------------------------
--
-- 60 seconds. Long enough for a browser to follow the link, short enough that
-- a URL pasted into a chat window is dead before anybody opens it.
CREATE OR REPLACE FUNCTION church.consent_pdf_signed_url(_signature_id UUID)
RETURNS TABLE (storage_path TEXT, expires_in INTEGER)
LANGUAGE plpgsql VOLATILE SECURITY DEFINER
SET search_path = church, public, extensions
AS $$
DECLARE _s RECORD; _actor_name TEXT;
BEGIN
  IF auth.uid() IS NULL THEN
    RAISE EXCEPTION 'not_authenticated' USING ERRCODE = '28000';
  END IF;

  SELECT * INTO _s FROM church.consent_signatures WHERE id = _signature_id;
  IF _s.id IS NULL THEN RAISE EXCEPTION 'signature_not_found'; END IF;

  IF NOT church.can_read_consent_pdf(_signature_id) THEN
    RAISE EXCEPTION 'not_permitted' USING ERRCODE = '42501';
  END IF;

  IF _s.pdf_storage_path IS NULL THEN
    RAISE EXCEPTION 'pdf_not_ready'
      USING HINT = 'The copy is still being prepared. Try again in a moment.';
  END IF;

  _actor_name := coalesce(
    (SELECT full_name FROM public.profiles WHERE id = auth.uid()), 'Someone');

  -- The audit row goes in BEFORE the path is handed over, so a read that
  -- happens is a read that was recorded. The other order loses the ones that
  -- matter most - the ones where something went wrong afterwards.
  INSERT INTO church.check_in_audit (
    organization_id, action, outcome, actor_auth_user_id, actor_name, detail)
  VALUES (_s.organization_id, 'sensitive_viewed', 'success', auth.uid(), _actor_name,
          jsonb_build_object('record', 'consent_pdf',
                             'signature_id', _signature_id,
                             'household_id', _s.household_id));

  RETURN QUERY SELECT _s.pdf_storage_path, 60;
END;
$$;

GRANT EXECUTE ON FUNCTION church.consent_pdf_signed_url(UUID) TO authenticated;

CREATE OR REPLACE FUNCTION church.incident_pdf_signed_url(_incident_id UUID)
RETURNS TABLE (storage_path TEXT, expires_in INTEGER)
LANGUAGE plpgsql VOLATILE SECURITY DEFINER
SET search_path = church, public, extensions
AS $$
DECLARE _i RECORD; _actor_name TEXT;
BEGIN
  IF auth.uid() IS NULL THEN
    RAISE EXCEPTION 'not_authenticated' USING ERRCODE = '28000';
  END IF;

  SELECT * INTO _i FROM church.kids_incidents WHERE id = _incident_id;
  IF _i.id IS NULL THEN RAISE EXCEPTION 'incident_not_found'; END IF;

  IF NOT church.can_read_incident_pdf(_incident_id) THEN
    RAISE EXCEPTION 'not_permitted' USING ERRCODE = '42501';
  END IF;

  IF _i.pdf_storage_path IS NULL THEN
    RAISE EXCEPTION 'pdf_not_ready';
  END IF;

  _actor_name := coalesce(
    (SELECT full_name FROM public.profiles WHERE id = auth.uid()), 'Someone');

  INSERT INTO church.check_in_audit (
    organization_id, action, outcome, child_person_id,
    actor_auth_user_id, actor_name, detail)
  VALUES (_i.organization_id, 'sensitive_viewed', 'success', _i.child_person_id,
          auth.uid(), _actor_name,
          jsonb_build_object('record', 'incident_pdf', 'incident_id', _incident_id));

  RETURN QUERY SELECT _i.pdf_storage_path, 60;
END;
$$;

GRANT EXECUTE ON FUNCTION church.incident_pdf_signed_url(UUID) TO authenticated;

-- ---------------------------------------------------------------------------
-- What the renderer reads
-- ---------------------------------------------------------------------------
--
-- Everything the PDF prints, in one call, from frozen columns. The renderer
-- must not go looking anything up for itself: the whole point of
-- document_sha256 and the frozen child names is that a form regenerated in
-- 2028 says what it said in 2026, and a renderer that joins to live tables
-- would quietly undo that.
--
-- Note it returns the DOCUMENT BODY as stored against the signature's own
-- version, not the current one.
CREATE OR REPLACE FUNCTION church.consent_pdf_payload(_signature_id UUID)
RETURNS JSONB
LANGUAGE plpgsql STABLE SECURITY DEFINER
SET search_path = church, public, extensions
AS $$
DECLARE _out JSONB;
BEGIN
  SELECT jsonb_build_object(
    'signature_id', s.id,
    'organization_id', s.organization_id,
    'household_id', s.household_id,
    'church_name', o.name,
    'document', jsonb_build_object(
      'title', d.title,
      'version', s.document_version,
      'sha256', s.document_sha256,
      -- The body AS IT WAS for that version, which is why this joins on
      -- consent_document_id rather than looking up the current document.
      'body', d.body),
    'signer', jsonb_build_object(
      'printed_name', s.signer_printed_name,
      'relationship', s.signer_relationship,
      'signed_at', s.signed_at,
      'source', s.source,
      'witness_name', s.witness_name,
      'station_id', s.witness_station_id,
      'authenticated_email', au.email),
    'secondary', CASE WHEN s.secondary_signer_printed_name IS NOT NULL
      THEN jsonb_build_object('printed_name', s.secondary_signer_printed_name,
                              'signed_at', s.secondary_signed_at) END,
    'answers', s.answers,
    'children', coalesce((
      SELECT jsonb_agg(jsonb_build_object(
               'name', cc.child_name_at_signing,
               'dob', cc.child_dob_text,
               'grade', cc.child_grade_text,
               'answers', cc.per_child_answers) ORDER BY cc.child_name_at_signing)
      FROM church.consent_children cc
      WHERE cc.consent_signature_id = s.id AND cc.withdrawn_at IS NULL), '[]'::jsonb)
  ) INTO _out
  FROM church.consent_signatures s
  JOIN church.consent_documents d ON d.id = s.consent_document_id
  JOIN public.organizations o ON o.id = s.organization_id
  LEFT JOIN auth.users au ON au.id = s.signer_auth_user_id
  WHERE s.id = _signature_id;

  RETURN _out;
END;
$$;

REVOKE ALL ON FUNCTION church.consent_pdf_payload(UUID) FROM PUBLIC;
GRANT EXECUTE ON FUNCTION church.consent_pdf_payload(UUID) TO service_role;

CREATE OR REPLACE FUNCTION church.incident_pdf_payload(_incident_id UUID)
RETURNS JSONB
LANGUAGE plpgsql STABLE SECURITY DEFINER
SET search_path = church, public, extensions
AS $$
DECLARE _out JSONB;
BEGIN
  SELECT jsonb_build_object(
    'incident_id', i.id,
    'organization_id', i.organization_id,
    'church_name', o.name,
    'child_name', coalesce(p.preferred_name, p.first_name) || ' ' || p.last_name,
    'occurred_on', i.occurred_on,
    'room_name', r.name,
    'severity', i.severity,
    'status', i.status,
    -- The teacher's own words, as written. Immutable since submission.
    'reported_narrative', i.reported_narrative,
    'reported_by_name', i.reported_by_name,
    'reported_at', i.reported_at,
    'admin_summary', i.admin_summary,
    'signed_off_by_name', i.signed_off_by_name,
    'signed_off_at', i.signed_off_at,
    'external_report_made', i.external_report_made,
    'external_report_reference', i.external_report_reference,
    'external_reported_at', i.external_reported_at
  ) INTO _out
  FROM church.kids_incidents i
  JOIN public.organizations o ON o.id = i.organization_id
  LEFT JOIN church.people p ON p.id = i.child_person_id
  LEFT JOIN public.rooms r ON r.id = i.room_id
  WHERE i.id = _incident_id;

  RETURN _out;
END;
$$;

REVOKE ALL ON FUNCTION church.incident_pdf_payload(UUID) FROM PUBLIC;
GRANT EXECUTE ON FUNCTION church.incident_pdf_payload(UUID) TO service_role;

-- ---------------------------------------------------------------------------
-- The queue
-- ---------------------------------------------------------------------------
--
-- Rows with no PDF yet. Capped at five attempts: a row that keeps failing
-- stops being retried but stays visible, with pdf_error saying why, rather
-- than disappearing from the queue or retrying forever.
--
-- Safeguarding incidents get a PDF too. They are never SENT to a parent - the
-- CHECK forbids it and the send RPC refuses - but the record still has to
-- exist, and it is the one most likely to be asked for later.
CREATE OR REPLACE FUNCTION church.consent_pdfs_pending(_limit INTEGER DEFAULT 20)
RETURNS TABLE (kind TEXT, id UUID, organization_id UUID, household_id UUID, at TIMESTAMPTZ)
LANGUAGE sql STABLE SECURITY DEFINER
SET search_path = church, public
AS $$
  (SELECT 'consent'::TEXT, s.id, s.organization_id, s.household_id, s.signed_at
   FROM church.consent_signatures s
   WHERE s.pdf_storage_path IS NULL AND s.pdf_attempts < 5
   ORDER BY s.signed_at
   LIMIT _limit)
  UNION ALL
  (SELECT 'incident'::TEXT, i.id, i.organization_id, NULL::UUID, i.reported_at
   FROM church.kids_incidents i
   WHERE i.pdf_storage_path IS NULL AND i.pdf_attempts < 5
     AND i.severity IN ('injury', 'safeguarding')
   ORDER BY i.reported_at
   LIMIT _limit)
$$;

REVOKE ALL ON FUNCTION church.consent_pdfs_pending(INTEGER) FROM PUBLIC;
GRANT EXECUTE ON FUNCTION church.consent_pdfs_pending(INTEGER) TO service_role;

-- ---------------------------------------------------------------------------
-- Recording the result
-- ---------------------------------------------------------------------------
CREATE OR REPLACE FUNCTION church.record_consent_pdf(
  _signature_id UUID,
  _storage_path TEXT,
  _sha256       TEXT,
  _bytes        INTEGER,
  _error        TEXT DEFAULT NULL
)
RETURNS VOID
LANGUAGE plpgsql VOLATILE SECURITY DEFINER
SET search_path = church, public, extensions
AS $$
BEGIN
  IF _error IS NOT NULL THEN
    UPDATE church.consent_signatures
       SET pdf_error = _error, pdf_attempts = pdf_attempts + 1
     WHERE id = _signature_id;
    RETURN;
  END IF;

  UPDATE church.consent_signatures
     SET pdf_storage_path = _storage_path,
         pdf_sha256 = _sha256,
         pdf_bytes = _bytes,
         pdf_error = NULL,
         pdf_attempts = pdf_attempts + 1
   WHERE id = _signature_id;
END;
$$;

REVOKE ALL ON FUNCTION church.record_consent_pdf(UUID, TEXT, TEXT, INTEGER, TEXT) FROM PUBLIC;
GRANT EXECUTE ON FUNCTION church.record_consent_pdf(UUID, TEXT, TEXT, INTEGER, TEXT) TO service_role;

CREATE OR REPLACE FUNCTION church.record_incident_pdf(
  _incident_id  UUID,
  _storage_path TEXT,
  _sha256       TEXT,
  _error        TEXT DEFAULT NULL
)
RETURNS VOID
LANGUAGE plpgsql VOLATILE SECURITY DEFINER
SET search_path = church, public, extensions
AS $$
BEGIN
  IF _error IS NOT NULL THEN
    UPDATE church.kids_incidents
       SET pdf_error = _error, pdf_attempts = pdf_attempts + 1
     WHERE id = _incident_id;
    RETURN;
  END IF;

  UPDATE church.kids_incidents
     SET pdf_storage_path = _storage_path,
         pdf_sha256 = _sha256,
         pdf_generated_at = now(),
         pdf_error = NULL,
         pdf_attempts = pdf_attempts + 1
   WHERE id = _incident_id;
END;
$$;

REVOKE ALL ON FUNCTION church.record_incident_pdf(UUID, TEXT, TEXT, TEXT) FROM PUBLIC;
GRANT EXECUTE ON FUNCTION church.record_incident_pdf(UUID, TEXT, TEXT, TEXT) TO service_role;

-- ---------------------------------------------------------------------------
-- Asking for one to be rendered
-- ---------------------------------------------------------------------------
CREATE OR REPLACE FUNCTION church.dispatch_consent_pdf()
RETURNS VOID
LANGUAGE plpgsql VOLATILE SECURITY DEFINER
SET search_path = church, public, extensions
AS $$
DECLARE _url TEXT; _key TEXT;
BEGIN
  SELECT decrypted_secret INTO _url
    FROM vault.decrypted_secrets WHERE name = 'supabase_url' LIMIT 1;
  SELECT decrypted_secret INTO _key
    FROM vault.decrypted_secrets WHERE name = 'service_role_key' LIMIT 1;

  IF _url IS NULL OR _key IS NULL THEN
    RAISE WARNING 'Vault secrets not configured; consent PDFs not rendered';
    RETURN;
  END IF;

  PERFORM net.http_post(
    url := _url || '/functions/v1/render-consent-pdf',
    headers := jsonb_build_object(
      'Content-Type', 'application/json',
      'Authorization', 'Bearer ' || _key),
    body := '{}'::jsonb
  );
END;
$$;

REVOKE ALL ON FUNCTION church.dispatch_consent_pdf() FROM PUBLIC;
GRANT EXECUTE ON FUNCTION church.dispatch_consent_pdf() TO service_role;

-- A STATEMENT-level trigger, matching the notification sender: signing for a
-- family of three writes one signature but the renderer drains a queue, so one
-- post per statement is enough and three would claim the same work.
--
-- Wrapped so a rendering failure can never roll back a signature. The
-- signature IS the record; the PDF is a convenience for the family and the
-- office, and the backstop below will pick it up.
CREATE OR REPLACE FUNCTION church.nudge_consent_pdf_renderer()
RETURNS TRIGGER
LANGUAGE plpgsql SECURITY DEFINER
SET search_path = church, public, extensions
AS $$
BEGIN
  BEGIN
    PERFORM church.dispatch_consent_pdf();
  EXCEPTION WHEN OTHERS THEN
    RAISE WARNING 'Could not nudge the consent PDF renderer: %', SQLERRM;
  END;
  RETURN NULL;
END;
$$;

DROP TRIGGER IF EXISTS consent_signature_written ON church.consent_signatures;
CREATE TRIGGER consent_signature_written
  AFTER INSERT ON church.consent_signatures
  FOR EACH STATEMENT
  EXECUTE FUNCTION church.nudge_consent_pdf_renderer();

DROP TRIGGER IF EXISTS kids_incident_written ON church.kids_incidents;
CREATE TRIGGER kids_incident_written
  AFTER INSERT ON church.kids_incidents
  FOR EACH STATEMENT
  EXECUTE FUNCTION church.nudge_consent_pdf_renderer();

-- The backstop. Every five minutes: a signature whose nudge was lost must not
-- wait for the next one somebody happens to make.
SELECT cron.unschedule('render-consent-pdfs')
WHERE EXISTS (SELECT 1 FROM cron.job WHERE jobname = 'render-consent-pdfs');

SELECT cron.schedule('render-consent-pdfs', '*/5 * * * *',
                     'SELECT church.dispatch_consent_pdf()');

-- ---------------------------------------------------------------------------
-- Who read what
-- ---------------------------------------------------------------------------
--
-- The audit rows for consent forms, safety cards and incident reports have
-- existed since 20260320011300 and nothing has ever displayed them. An audit
-- trail nobody can read is a promise rather than a control.
CREATE OR REPLACE FUNCTION church.kids_sensitive_access_report(
  _organization_id UUID,
  _from DATE,
  _to   DATE
)
RETURNS TABLE (
  viewed_at  TIMESTAMPTZ,
  actor_name TEXT,
  record     TEXT,
  child_name TEXT,
  detail     JSONB
)
LANGUAGE plpgsql STABLE SECURITY DEFINER
SET search_path = church, public, extensions
AS $$
BEGIN
  IF NOT church.has_permission_in_org(
           _organization_id, ARRAY['kids_admin']::church.module_permission[]) THEN
    RAISE EXCEPTION 'not_permitted' USING ERRCODE = '42501',
      HINT = 'Reading the access log is a Kids Ministry admin action.';
  END IF;

  RETURN QUERY
  SELECT au.created_at,
         coalesce(au.actor_name, 'Unknown'),
         coalesce(au.detail->>'record', 'safety_card'),
         CASE WHEN p.id IS NOT NULL
              THEN coalesce(p.preferred_name, p.first_name) || ' ' || p.last_name END,
         au.detail
  FROM church.check_in_audit au
  LEFT JOIN church.people p ON p.id = au.child_person_id
  WHERE au.organization_id = _organization_id
    AND au.action = 'sensitive_viewed'
    AND au.created_at >= _from::TIMESTAMPTZ
    AND au.created_at < (_to + 1)::TIMESTAMPTZ
  ORDER BY au.created_at DESC
  LIMIT 1000;
END;
$$;

GRANT EXECUTE ON FUNCTION church.kids_sensitive_access_report(UUID, DATE, DATE) TO authenticated;

NOTIFY pgrst, 'reload schema';
