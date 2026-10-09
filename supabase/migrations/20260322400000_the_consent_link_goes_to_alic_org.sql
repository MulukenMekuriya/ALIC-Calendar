-- =====================================================
-- The consent reminder links to the church app, at alic.org
-- =====================================================
--
-- 20260322370000 linked the reminder to www.addislidet.info/my. The church
-- app is at alic.org; addislidet.info is another site, where /my is a 404.
-- All 185 reminders sent on 9 October 2026 carried the dead link, and a
-- parent sent the ministry a screenshot of it.
--
-- Only the link changes. The Thursday job resends to every family still
-- unsigned on 15 October (the six-day gap has passed by then), with this one,
-- as the ministry chose rather than a second email the same day.
--
-- alic.org/my sends a parent who is not signed in to the sign-in page, which
-- now brings them back here afterwards (the app's own change, same release).

CREATE OR REPLACE FUNCTION church.kids_queue_consent_reminders(_organization_id uuid, _household_ids uuid[], _manual boolean, _actor uuid, _actor_name text, OUT households integer, OUT emails integer)
 RETURNS record
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO 'church', 'public', 'extensions'
AS $function$
DECLARE
  h RECORD;
  _names TEXT[];
  _stale_only BOOLEAN;
  _who TEXT;
  _deadline DATE;
  _body TEXT;
  _subject TEXT;
  _n INTEGER;
  _link CONSTANT TEXT := 'https://alic.org/my?tab=children&consent=1';
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
$function$;

NOTIFY pgrst, 'reload schema';
