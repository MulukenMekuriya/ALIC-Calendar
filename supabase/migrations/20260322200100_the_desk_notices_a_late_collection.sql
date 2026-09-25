-- =====================================================
-- The desk notices a late collection
-- =====================================================
--
-- Detection, in the two places a child stops being checked in: somebody
-- collected them (check_out_children), or nobody did and the record was closed
-- off (the two expire functions).
--
-- NOTHING HERE EMAILS A PARENT. It writes a row at status 'recorded'. A leader
-- reads the queue and decides. The send is kids_notify_late_pickup, below, and
-- it is the only thing that queues a notification.

-- ---------------------------------------------------------------------------
-- The detector
-- ---------------------------------------------------------------------------
CREATE OR REPLACE FUNCTION church.kids_record_late_pickup(
  _check_in_id UUID,
  _source TEXT
)
RETURNS UUID
LANGUAGE plpgsql VOLATILE SECURITY DEFINER
SET search_path = church, public, extensions
AS $$
DECLARE
  _id      UUID;
  _grace   INTEGER;
  _late    INTEGER;
  ci       church.kids_check_ins%ROWTYPE;
  _ends_at TIMESTAMPTZ;
  _sdate   DATE;
  _expire  INTEGER;
BEGIN
  SELECT * INTO ci FROM church.kids_check_ins WHERE id = _check_in_id;
  IF NOT FOUND THEN RETURN NULL; END IF;

  SELECT ks.ends_at, ks.session_date,
         coalesce(ke.late_pickup_grace_minutes, 15),
         coalesce(ke.auto_expire_minutes_after_end, 240)
    INTO _ends_at, _sdate, _grace, _expire
  FROM church.kids_sessions ks
  JOIN church.kids_events ke ON ke.id = ks.kids_event_id
  WHERE ks.id = ci.kids_session_id;

  IF _ends_at IS NULL THEN RETURN NULL; END IF;

  IF _source = 'checkout' THEN
    -- Measured from the end of the service. Within the grace, nothing is
    -- recorded at all - most families are simply walking from the sanctuary.
    IF ci.checked_out_at IS NULL THEN RETURN NULL; END IF;
    IF ci.checked_out_at <= _ends_at + make_interval(mins => _grace) THEN
      RETURN NULL;
    END IF;
    _late := floor(EXTRACT(EPOCH FROM (ci.checked_out_at - _ends_at)) / 60)::INTEGER;
  ELSE
    -- Nobody recorded a collection. The number is a FLOOR, not a measurement.
    _late := _expire;
  END IF;

  INSERT INTO church.kids_late_pickups
    (organization_id, child_person_id, check_in_id, kids_session_id, room_id,
     session_date, minutes_late, source)
  VALUES (ci.organization_id, ci.child_person_id, ci.id, ci.kids_session_id,
          ci.room_id, _sdate, _late, _source)
  -- The structural guarantee. A re-run checkout, a duplicate call or the
  -- ten-minute sweep all land here and all do nothing the second time.
  ON CONFLICT (check_in_id) WHERE check_in_id IS NOT NULL DO NOTHING
  RETURNING id INTO _id;

  IF _id IS NOT NULL THEN
    INSERT INTO church.check_in_audit
      (organization_id, action, outcome, check_in_id, kids_session_id,
       child_person_id, room_id, actor_name, detail)
    VALUES (ci.organization_id, 'late_pickup_recorded', 'success', ci.id,
            ci.kids_session_id, ci.child_person_id, ci.room_id, 'system',
            jsonb_build_object('source', _source, 'minutes_late', _late,
                               'grace_minutes', _grace));
  END IF;

  RETURN _id;
EXCEPTION WHEN OTHERS THEN
  -- NEVER let this fail a checkout. A child leaving the building is the fact
  -- that matters; a note about the time is not worth rolling that back. Same
  -- rule queue_pickup_code_sms already follows in check_in_children.
  RAISE WARNING 'kids_record_late_pickup failed for %: %', _check_in_id, SQLERRM;
  RETURN NULL;
END;
$$;

REVOKE ALL ON FUNCTION church.kids_record_late_pickup(UUID, TEXT) FROM PUBLIC;
GRANT EXECUTE ON FUNCTION church.kids_record_late_pickup(UUID, TEXT) TO service_role;

-- ---------------------------------------------------------------------------
-- A leader sends the note, or decides not to
-- ---------------------------------------------------------------------------
CREATE OR REPLACE FUNCTION church.kids_notify_late_pickup(
  _late_pickup_id UUID,
  _message TEXT DEFAULT NULL
)
RETURNS INTEGER
LANGUAGE plpgsql VOLATILE SECURITY DEFINER
SET search_path = church, public, extensions
AS $$
DECLARE
  lp     church.kids_late_pickups%ROWTYPE;
  _actor TEXT;
  _body  TEXT;
  _subj  TEXT;
  _child TEXT;
  _room  TEXT;
  _n     INTEGER;
BEGIN
  SELECT * INTO lp FROM church.kids_late_pickups WHERE id = _late_pickup_id;
  IF NOT FOUND THEN RAISE EXCEPTION 'late_pickup_not_found'; END IF;

  -- has_permission_in_org, NOT assert_kids_leader: kids_leader_orgs() includes
  -- leadership_viewer, a read-only reporting role that must not send a parent
  -- anything.
  IF NOT church.has_permission_in_org(
       lp.organization_id,
       ARRAY['kids_admin','kids_leader']::church.module_permission[]) THEN
    RAISE EXCEPTION 'not_permitted' USING ERRCODE = '42501';
  END IF;

  IF lp.status <> 'recorded' THEN
    RAISE EXCEPTION 'already_reviewed'
      USING HINT = 'This one has already been sent or dismissed.';
  END IF;

  SELECT coalesce(full_name, 'A Kids Ministry leader') INTO _actor
    FROM public.profiles WHERE id = auth.uid();
  _actor := coalesce(_actor, 'A Kids Ministry leader');

  SELECT coalesce(p.preferred_name, p.first_name) INTO _child
    FROM church.people p WHERE p.id = lp.child_person_id;
  SELECT r.name INTO _room FROM public.rooms r WHERE r.id = lp.room_id;

  _subj := 'Collecting ' || coalesce(_child, 'your child') || ' after the service';

  -- The drafted wording, used when the leader does not write their own. Notice
  -- what it does not contain: a count, a consequence, or a next time. There is
  -- no consequence, and inventing the shadow of one is the tone the ministry
  -- asked to avoid.
  _body := coalesce(nullif(btrim(coalesce(_message, '')), ''),
    CASE WHEN lp.source = 'never_collected' THEN
      'Our records do not show ' || coalesce(_child, 'your child')
      || ' being collected from ' || coalesce(_room, 'their classroom')
      || ' at the end of the service on '
      || to_char(lp.session_date, 'FMDay FMDD FMMonth') || '. Nobody at the '
      || 'classroom door recorded a pickup.' || E'\n\n'
      || 'We are not saying that ' || coalesce(_child, 'your child')
      || ' was left with us. We are saying that we do not know, and that is '
      || 'the thing we would like to put right together. The record at the '
      || 'door is how we can tell you where your child is at any moment of a '
      || 'Sunday morning, and it only works when it is kept.' || E'\n\n'
      || 'If your child was collected and the desk simply did not record it, '
      || 'please tell any of the Kids Ministry team and we will correct it '
      || 'gladly.'
    ELSE
      coalesce(_child, 'Your child') || ' was collected from '
      || coalesce(_room, 'their classroom') || ' about '
      || lp.minutes_late::TEXT || ' minutes after the service ended on '
      || to_char(lp.session_date, 'FMDay FMDD FMMonth') || '.' || E'\n\n'
      || 'We know Sunday mornings run long, and we are glad you were here. We '
      || 'mention it because our classrooms are staffed by volunteers who have '
      || 'families waiting for them too, and the last child in a room is '
      || 'usually the one nobody notices is still there.' || E'\n\n'
      || 'If something kept you this morning, please tell any of the Kids '
      || 'Ministry team. We would much rather hear from you than guess.'
    END);

  -- Reuses the whole existing pipeline: consent filtering, household
  -- resolution, the guardian fallback, and the statement-level trigger that
  -- wakes the sender.
  SELECT church.queue_child_notification(
           'kids_late_pickup', lp.check_in_id, _body, _subj, 'email', NULL, _actor)
    INTO _n;

  UPDATE church.kids_late_pickups
     SET status = 'notified',
         parent_message = _body,
         parent_notified_at = now(),
         reviewed_by = auth.uid(),
         reviewed_by_name = _actor,
         reviewed_at = now()
   WHERE id = _late_pickup_id;

  INSERT INTO church.check_in_audit
    (organization_id, action, outcome, check_in_id, kids_session_id,
     child_person_id, actor_auth_user_id, actor_name, detail)
  VALUES (lp.organization_id, 'late_pickup_notified', 'success', lp.check_in_id,
          lp.kids_session_id, lp.child_person_id, auth.uid(), _actor,
          jsonb_build_object('recipients', _n, 'source', lp.source));

  RETURN coalesce(_n, 0);
END;
$$;

GRANT EXECUTE ON FUNCTION church.kids_notify_late_pickup(UUID, TEXT) TO authenticated;

CREATE OR REPLACE FUNCTION church.kids_dismiss_late_pickup(
  _late_pickup_id UUID,
  _reason TEXT
)
RETURNS BOOLEAN
LANGUAGE plpgsql VOLATILE SECURITY DEFINER
SET search_path = church, public, extensions
AS $$
DECLARE
  lp     church.kids_late_pickups%ROWTYPE;
  _actor TEXT;
BEGIN
  SELECT * INTO lp FROM church.kids_late_pickups WHERE id = _late_pickup_id;
  IF NOT FOUND THEN RAISE EXCEPTION 'late_pickup_not_found'; END IF;

  IF NOT church.has_permission_in_org(
       lp.organization_id,
       ARRAY['kids_admin','kids_leader']::church.module_permission[]) THEN
    RAISE EXCEPTION 'not_permitted' USING ERRCODE = '42501';
  END IF;

  IF length(btrim(coalesce(_reason, ''))) < 5 THEN
    RAISE EXCEPTION 'reason_required'
      USING HINT = 'Say why, so the next person reading the list knows.';
  END IF;

  IF lp.status <> 'recorded' THEN RAISE EXCEPTION 'already_reviewed'; END IF;

  SELECT coalesce(full_name, 'A Kids Ministry leader') INTO _actor
    FROM public.profiles WHERE id = auth.uid();
  _actor := coalesce(_actor, 'A Kids Ministry leader');

  UPDATE church.kids_late_pickups
     SET status = 'dismissed', dismissed_reason = btrim(_reason),
         reviewed_by = auth.uid(), reviewed_by_name = _actor, reviewed_at = now()
   WHERE id = _late_pickup_id;

  INSERT INTO church.check_in_audit
    (organization_id, action, outcome, check_in_id, kids_session_id,
     child_person_id, actor_auth_user_id, actor_name, detail)
  VALUES (lp.organization_id, 'late_pickup_dismissed', 'success', lp.check_in_id,
          lp.kids_session_id, lp.child_person_id, auth.uid(), _actor,
          jsonb_build_object('reason', btrim(_reason)));

  RETURN true;
END;
$$;

GRANT EXECUTE ON FUNCTION church.kids_dismiss_late_pickup(UUID, TEXT) TO authenticated;

NOTIFY pgrst, 'reload schema';

-- ---------------------------------------------------------------------------
-- The two call sites
-- ---------------------------------------------------------------------------

CREATE OR REPLACE FUNCTION church.check_out_children(_check_in_ids uuid[], _presented text DEFAULT NULL::text, _shift_token text DEFAULT NULL::text, _picked_up_by_person_id uuid DEFAULT NULL::uuid, _picked_up_by_name text DEFAULT NULL::text, _override_reason text DEFAULT NULL::text, _override_verification text DEFAULT NULL::text, _override_authorizer_volunteer_id uuid DEFAULT NULL::uuid, _override_authorizer_pin text DEFAULT NULL::text)
 RETURNS TABLE(check_in_id uuid, child_name text, checked_out_at timestamp with time zone)
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO 'church', 'public', 'extensions'
AS $function$
DECLARE
  a church.resolved_actor;
  ci church.kids_check_ins%ROWTYPE;
  sec church.kids_check_in_secrets%ROWTYPE;
  _ids UUID[];
  _live UUID[];
  _method TEXT;
  _authorizer UUID;
  _authorizer_name TEXT;
  _auth_hash TEXT;
  _names_restricted BOOLEAN;
  _blocked INTEGER;
  _id UUID;
  _updated INTEGER;
  _released UUID[] := '{}';
BEGIN
  a := church.resolve_actor(_shift_token);
  IF NOT a.can_check_out THEN
    RAISE EXCEPTION 'not_permitted_to_check_out' USING ERRCODE = '42501';
  END IF;

  IF _check_in_ids IS NULL OR array_length(_check_in_ids, 1) IS NULL THEN
    RAISE EXCEPTION 'no_check_ins_supplied';
  END IF;

  SELECT array_agg(DISTINCT x) INTO _ids FROM unnest(_check_in_ids) AS x
   WHERE x IS NOT NULL;
  IF _ids IS NULL THEN RAISE EXCEPTION 'no_check_ins_supplied'; END IF;

  -- Anchor on the batch, not on _ids[1]. array_agg(DISTINCT) sorts, so the
  -- first element was the lowest uuid â which meant an unknown id sorting
  -- first RAISED (aborting the transaction and losing the audit row) while the
  -- same probe sorting last got the silent audited denial. Different responses
  -- for the same mistake is an oracle.
  SELECT * INTO ci FROM church.kids_check_ins k
   WHERE k.id = ANY(_ids) AND k.organization_id = a.organization_id
   ORDER BY k.checked_in_at LIMIT 1;
  IF NOT FOUND THEN
    RETURN;   -- zero rows, like every other denial
  END IF;

  IF (SELECT count(*) FROM church.kids_check_ins k
       WHERE k.id = ANY(_ids)
         AND k.organization_id = a.organization_id
         AND k.batch_id = ci.batch_id
         AND k.kids_session_id = ci.kids_session_id)
     <> array_length(_ids, 1) THEN
    INSERT INTO church.check_in_audit
      (organization_id, action, outcome, check_in_id, batch_id, kids_session_id,
       child_person_id, station_id, volunteer_id, actor_auth_user_id,
       actor_name, detail)
    VALUES (a.organization_id, 'check_out', 'denied', ci.id, ci.batch_id,
            ci.kids_session_id, ci.child_person_id, a.station_id, a.volunteer_id,
            auth.uid(), a.actor_name,
            jsonb_build_object('reason', 'check-ins span more than one batch'));
    RETURN;
  END IF;

  -- C-7: only children still in a room are being released, so only they are
  -- checked. A sibling collected an hour ago must not block the one still here.
  SELECT array_agg(k.id) INTO _live
  FROM church.kids_check_ins k
  WHERE k.id = ANY(_ids) AND k.organization_id = a.organization_id
    AND k.status = 'checked_in';

  IF _live IS NULL THEN
    RETURN;   -- nothing left to release
  END IF;

  -- C-1: does the collector appear in any live order for any of these
  -- children, by id or by name? This is the absolute bar, and it is checked
  -- before the code/override branch so nothing can step around it.
  SELECT EXISTS (
    SELECT 1 FROM church.kids_check_ins k
    WHERE k.id = ANY(_live)
      AND church.restriction_names_person(
            k.child_person_id, _picked_up_by_person_id, _picked_up_by_name)
  ) INTO _names_restricted;

  IF _names_restricted THEN
    INSERT INTO church.check_in_audit
      (organization_id, action, outcome, check_in_id, batch_id, kids_session_id,
       child_person_id, station_id, volunteer_id, actor_auth_user_id,
       actor_name, detail)
    SELECT a.organization_id, 'restricted_pickup_attempt', 'denied', k.id,
           k.batch_id, k.kids_session_id, k.child_person_id, a.station_id,
           a.volunteer_id, auth.uid(), a.actor_name,
           jsonb_build_object(
             'reason', 'collector is named in a protective order',
             'attempted_person_id', _picked_up_by_person_id,
             'attempted_name', _picked_up_by_name)
    FROM church.kids_check_ins k
    WHERE k.id = ANY(_live)
      AND church.restriction_names_person(
            k.child_person_id, _picked_up_by_person_id, _picked_up_by_name);
    RETURN;
  END IF;

  -- C-8: identity is required only where it buys something. For a child with
  -- no order, the code is the credential and a lapsed member record is not a
  -- reason to refuse their own parent.
  IF _picked_up_by_person_id IS NOT NULL
     AND NOT EXISTS (SELECT 1 FROM church.people p
                     WHERE p.id = _picked_up_by_person_id
                       AND p.organization_id = a.organization_id) THEN
    INSERT INTO church.check_in_audit
      (organization_id, action, outcome, check_in_id, batch_id, kids_session_id,
       child_person_id, station_id, volunteer_id, actor_auth_user_id,
       actor_name, detail)
    VALUES (a.organization_id, 'check_out', 'denied', ci.id, ci.batch_id,
            ci.kids_session_id, ci.child_person_id, a.station_id, a.volunteer_id,
            auth.uid(), a.actor_name,
            jsonb_build_object('reason', 'collector is not a person on file',
                               'attempted_person_id', _picked_up_by_person_id));
    RETURN;
  END IF;

  -- A child under an order leaves only with an approved collector â unless an
  -- admin takes responsibility. C-3: without this, a restricted child whose
  -- family was CSV-imported (people and relationships, no household row) could
  -- not be collected by anyone at all, including their own mother with the
  -- code and photo ID, and no override existed because the gate ran first.
  --
  -- The break-glass never reaches the person the order names â that was ruled
  -- out above and has no override. It only answers "the paperwork does not
  -- list anyone", which is a records problem, not a custody one.
  SELECT count(*) INTO _blocked
  FROM church.kids_check_ins k
  WHERE k.id = ANY(_live)
    AND church.child_has_active_restriction(k.child_person_id)
    AND NOT church.is_approved_collector(
              k.child_person_id, _picked_up_by_person_id, _picked_up_by_name);

  IF _blocked > 0 THEN
    IF _override_reason IS NULL OR NOT a.can_override THEN
      INSERT INTO church.check_in_audit
        (organization_id, action, outcome, check_in_id, batch_id,
         kids_session_id, child_person_id, station_id, volunteer_id,
         actor_auth_user_id, actor_name, detail)
      SELECT a.organization_id, 'restricted_pickup_attempt', 'denied', k.id,
             k.batch_id, k.kids_session_id, k.child_person_id, a.station_id,
             a.volunteer_id, auth.uid(), a.actor_name,
             jsonb_build_object(
               'reason', CASE WHEN _picked_up_by_person_id IS NULL
                              THEN 'collector not identified'
                              ELSE 'collector is not on the approved list' END,
               'attempted_person_id', _picked_up_by_person_id,
               'attempted_name', _picked_up_by_name,
               'override_available', a.can_override)
      FROM church.kids_check_ins k
      WHERE k.id = ANY(_live)
        AND church.child_has_active_restriction(k.child_person_id)
        AND NOT church.is_approved_collector(
                  k.child_person_id, _picked_up_by_person_id, _picked_up_by_name);
      RETURN;
    END IF;

    -- Recorded as its own action so it is never mistaken for a routine
    -- release when the ministry reviews the week.
    INSERT INTO church.check_in_audit
      (organization_id, action, outcome, check_in_id, batch_id, kids_session_id,
       child_person_id, station_id, volunteer_id, actor_auth_user_id,
       actor_name, detail)
    SELECT a.organization_id, 'restricted_pickup_override', 'success', k.id,
           k.batch_id, k.kids_session_id, k.child_person_id, a.station_id,
           a.volunteer_id, auth.uid(), a.actor_name,
           jsonb_build_object('reason', _override_reason,
                              'verification', _override_verification,
                              'released_to', _picked_up_by_name,
                              'released_to_person_id', _picked_up_by_person_id)
    FROM church.kids_check_ins k
    WHERE k.id = ANY(_live)
      AND church.child_has_active_restriction(k.child_person_id)
      AND NOT church.is_approved_collector(
                k.child_person_id, _picked_up_by_person_id, _picked_up_by_name);
  END IF;

  IF _override_reason IS NOT NULL THEN
    IF NOT a.can_override THEN
      RAISE EXCEPTION 'override_requires_admin' USING ERRCODE = '42501';
    END IF;

    IF _override_authorizer_volunteer_id IS NOT NULL
       AND _override_authorizer_pin IS NOT NULL THEN
      SELECT p.pin_hash INTO _auth_hash
      FROM church.kids_volunteer_pins p
      JOIN church.kids_volunteers v ON v.id = p.volunteer_id
      WHERE p.volunteer_id = _override_authorizer_volunteer_id
        AND v.organization_id = a.organization_id
        AND v.is_active AND v.can_override
        AND NOT v.may_not_serve_with_children;

      IF _auth_hash IS NULL OR _auth_hash <> crypt(_override_authorizer_pin, _auth_hash) THEN
        RAISE EXCEPTION 'override_authorization_failed' USING ERRCODE = '28000';
      END IF;
      _authorizer := _override_authorizer_volunteer_id;
      SELECT coalesce(pp.preferred_name, pp.first_name) || ' ' || pp.last_name
        INTO _authorizer_name
      FROM church.kids_volunteers vv
      JOIN church.people pp ON pp.id = vv.person_id
      WHERE vv.id = _override_authorizer_volunteer_id;
    ELSE
      _authorizer := a.volunteer_id;
      _authorizer_name := a.actor_name;
    END IF;

    _method := 'operator_override';
  ELSE
    SELECT * INTO sec FROM church.kids_check_in_secrets s
    WHERE s.batch_id = ci.batch_id
      AND s.consumed_at IS NULL
      AND s.expires_at > now()
      AND (s.locked_until IS NULL OR s.locked_until <= now())
      AND (s.code_hash = church.hash_pickup(church.normalize_pickup_code(_presented))
        OR s.token_hash = church.hash_pickup(btrim(coalesce(_presented, ''))));

    IF NOT FOUND THEN
      INSERT INTO church.check_in_audit
        (organization_id, action, outcome, check_in_id, batch_id, kids_session_id,
         child_person_id, station_id, volunteer_id, actor_auth_user_id, actor_name)
      VALUES (a.organization_id, 'code_failed', 'denied', ci.id, ci.batch_id,
              ci.kids_session_id, ci.child_person_id, a.station_id, a.volunteer_id,
              auth.uid(), a.actor_name);
      RETURN;
    END IF;
    _method := 'security_code';
  END IF;

  FOREACH _id IN ARRAY _live LOOP
    UPDATE church.kids_check_ins k
       SET status = 'checked_out',
           checked_out_at = now(),
           checked_out_by_station_id = a.station_id,
           checked_out_by_volunteer_id = a.volunteer_id,
           checked_out_by_name = a.actor_name,
           picked_up_by_person_id = _picked_up_by_person_id,
           picked_up_by_name = coalesce(_picked_up_by_name, 'unrecorded'),
           checkout_method = _method,
           override_reason = _override_reason,
           override_verification = _override_verification,
           override_authorized_by_volunteer_id = _authorizer,
           override_authorized_by_name = _authorizer_name
     WHERE k.id = _id
       AND k.organization_id = a.organization_id
       AND k.batch_id = ci.batch_id
       AND k.kids_session_id = ci.kids_session_id
       AND k.status = 'checked_in';

    -- Only audit what actually changed. The loop used to write a success row
    -- unconditionally, so re-sending an already-collected child produced a
    -- second check_out â indistinguishable from a duplicate collection, which
    -- is precisely the incident this log exists to detect.
    GET DIAGNOSTICS _updated = ROW_COUNT;
    IF _updated = 0 THEN CONTINUE; END IF;
    _released := _released || _id;

    INSERT INTO church.check_in_audit
      (organization_id, action, check_in_id, batch_id, kids_session_id,
       child_person_id, station_id, volunteer_id, actor_auth_user_id,
       actor_name, detail)
    SELECT a.organization_id,
           CASE WHEN _method = 'operator_override' THEN 'override' ELSE 'check_out' END,
           c.id, c.batch_id, c.kids_session_id, c.child_person_id,
           a.station_id, a.volunteer_id, auth.uid(), a.actor_name,
           jsonb_build_object('method', _method,
                              'picked_up_by', _picked_up_by_name,
                              'picked_up_by_person_id', _picked_up_by_person_id,
                              'override_reason', _override_reason,
                              'verification', _override_verification,
                              'authorized_by', coalesce(_authorizer_name, 'unknown'))
    FROM church.kids_check_ins c WHERE c.id = _id;

    -- Was this collection late? Placed HERE deliberately, and nowhere else:
    --
    --   * every denial path above RETURNs zero rows, so a family who failed a
    --     code check has not collected anyone and must not be recorded,
    --   * _updated = 0 means another station already released this child and
    --     the loop CONTINUEd, so this line is not reached twice for one row,
    --   * _method = 'operator_override' IS STILL A COLLECTION. A child
    --     released at 14:30 by an admin override is still two hours late.
    --     Overrides are deliberately not exempt.
    --
    -- kids_record_late_pickup swallows its own errors, so nothing it does can
    -- roll back a checkout that has already happened.
    PERFORM church.kids_record_late_pickup(_id, 'checkout');
  END LOOP;

  UPDATE church.kids_check_in_secrets s
     SET consumed_at = now()
   WHERE s.batch_id = ci.batch_id
     AND NOT EXISTS (SELECT 1 FROM church.kids_check_ins c
                     WHERE c.batch_id = ci.batch_id AND c.status = 'checked_in');

  -- Only children released by THIS call, so the caller cannot be told it
  -- collected someone who went home an hour ago.
  RETURN QUERY
  SELECT c.id, c.label_child_name, c.checked_out_at
  FROM church.kids_check_ins c
  WHERE c.id = ANY(_released);
END;
$function$
;

CREATE OR REPLACE FUNCTION church.expire_stale_check_ins()
 RETURNS integer
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO 'church', 'public', 'extensions'
AS $function$
DECLARE
  _n INTEGER := 0;
  -- {organization_id: [child names]}. A jsonb rather than a temp table: this
  -- is SECURITY DEFINER with a pinned search_path, and pg_temp does not belong
  -- in one of those.
  _grouped JSONB := '{}'::jsonb;
  _org TEXT;
  _names JSONB;
BEGIN
  WITH stale AS (
    UPDATE church.kids_check_ins ci
       SET status = 'expired', checked_out_at = now(),
           checkout_method = 'system_auto',
           checked_out_by_name = 'system (auto-expire)',
           updated_at = now()
      FROM church.kids_sessions ks, church.kids_events ke
     WHERE ks.id = ci.kids_session_id AND ke.id = ks.kids_event_id
       AND ci.status = 'checked_in'
       AND now() > ks.ends_at + make_interval(mins => ke.auto_expire_minutes_after_end)
    RETURNING ci.id, ci.organization_id, ci.child_person_id,
              ci.kids_session_id, ci.room_id, ci.label_child_name
  ), noted AS (
    -- A child nobody recorded collecting is the most serious version of
    -- exactly what this counter measures, so it is recorded - but the
    -- evidence is weaker and it is marked as such. minutes_late here is the
    -- expiry window, a FLOOR rather than a measurement.
    --
    -- Set-based rather than a call per row: the sweep runs every ten minutes
    -- and its predicate stays true forever after, so this must be cheap AND
    -- idempotent. The unique index on check_in_id is what makes the second
    -- run a no-op.
    INSERT INTO church.kids_late_pickups
      (organization_id, child_person_id, check_in_id, kids_session_id, room_id,
       session_date, minutes_late, source)
    SELECT s.organization_id, s.child_person_id, s.id, s.kids_session_id,
           s.room_id, ks.session_date,
           coalesce(ke.auto_expire_minutes_after_end, 240), 'never_collected'
    FROM stale s
    JOIN church.kids_sessions ks ON ks.id = s.kids_session_id
    JOIN church.kids_events ke ON ke.id = ks.kids_event_id
    ON CONFLICT (check_in_id) WHERE check_in_id IS NOT NULL DO NOTHING
    RETURNING 1
  ), audited AS (
    -- A data-modifying CTE runs to completion whether or not the outer query
    -- reads it, so the audit is written even though nothing selects from here.
    INSERT INTO church.check_in_audit
      (organization_id, action, outcome, check_in_id, kids_session_id,
       child_person_id, actor_name, detail)
    SELECT organization_id, 'auto_expired', 'success', id, kids_session_id,
           child_person_id, 'system',
           jsonb_build_object('reason', 'past auto_expire_minutes_after_end')
    FROM stale
    RETURNING 1
  ), grouped AS (
    SELECT organization_id::TEXT AS org,
           array_agg(label_child_name ORDER BY label_child_name) AS names,
           count(*)::INTEGER AS cnt
    FROM stale GROUP BY organization_id
  )
  SELECT coalesce(jsonb_object_agg(org, to_jsonb(names)), '{}'::jsonb),
         coalesce(sum(cnt), 0)::INTEGER
    INTO _grouped, _n
  FROM grouped;

  IF coalesce(_n, 0) = 0 THEN RETURN 0; END IF;

  FOR _org, _names IN SELECT key, value FROM jsonb_each(_grouped)
  LOOP
    PERFORM church.kids_notify_expired(
      _org::UUID,
      ARRAY(SELECT jsonb_array_elements_text(_names)),
      true, 'system');
  END LOOP;

  RETURN _n;
END;
$function$
;

CREATE OR REPLACE FUNCTION church.kids_expire_open_check_ins(_organization_id uuid, _kids_session_id uuid DEFAULT NULL::uuid, _note text DEFAULT NULL::text)
 RETURNS TABLE(expired_count integer, child_names text[])
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO 'church', 'public', 'extensions'
AS $function$
DECLARE
  _actor TEXT;
  _names TEXT[];
  _n INTEGER := 0;
BEGIN
  IF NOT church.has_permission_in_org(
       _organization_id, ARRAY['kids_admin']::church.module_permission[]) THEN
    RAISE EXCEPTION 'not_permitted' USING ERRCODE = '42501',
      HINT = 'Closing off the whole board is a Kids Ministry leader action.';
  END IF;

  SELECT coalesce(full_name, 'A Kids Ministry leader') INTO _actor
    FROM public.profiles WHERE id = auth.uid();
  _actor := coalesce(_actor, 'A Kids Ministry leader');

  WITH cleared AS (
    UPDATE church.kids_check_ins ci
       SET status = 'expired', checked_out_at = now(),
           checkout_method = 'system_auto',
           checked_out_by_name = _actor || ' (closed off the board)',
           today_note = coalesce(_note, ci.today_note),
           updated_at = now()
     WHERE ci.organization_id = _organization_id
       AND ci.status = 'checked_in'
       AND (_kids_session_id IS NULL OR ci.kids_session_id = _kids_session_id)
    RETURNING ci.id, ci.child_person_id, ci.kids_session_id, ci.room_id,
              ci.label_child_name
  ), noted AS (
    -- Clearing the board by hand means the same thing the automatic sweep
    -- means: nobody recorded a collection. Recorded identically, so the two
    -- routes do not produce different history for the same situation.
    INSERT INTO church.kids_late_pickups
      (organization_id, child_person_id, check_in_id, kids_session_id, room_id,
       session_date, minutes_late, source)
    SELECT _organization_id, c.child_person_id, c.id, c.kids_session_id,
           c.room_id, ks.session_date,
           coalesce(ke.auto_expire_minutes_after_end, 240), 'never_collected'
    FROM cleared c
    JOIN church.kids_sessions ks ON ks.id = c.kids_session_id
    JOIN church.kids_events ke ON ke.id = ks.kids_event_id
    ON CONFLICT (check_in_id) WHERE check_in_id IS NOT NULL DO NOTHING
    RETURNING 1
  ), audited AS (
    INSERT INTO church.check_in_audit
      (organization_id, action, outcome, check_in_id, kids_session_id,
       child_person_id, actor_auth_user_id, actor_name, detail)
    SELECT _organization_id, 'auto_expired', 'success', id, kids_session_id,
           child_person_id, auth.uid(), _actor,
           jsonb_build_object(
             'reason', 'closed off from the live board',
             'note', _note)
    FROM cleared
    RETURNING 1
  )
  SELECT array_agg(label_child_name ORDER BY label_child_name), count(*)::INTEGER
    INTO _names, _n
  FROM cleared;

  IF coalesce(_n, 0) = 0 THEN
    RETURN QUERY SELECT 0, ARRAY[]::TEXT[];
    RETURN;
  END IF;

  -- The leaders hear about this one too. The admin who pressed it knows; the
  -- other five do not, and "who cleared the board and when" is exactly the
  -- question asked afterwards.
  PERFORM church.kids_notify_expired(_organization_id, _names, false, _actor);

  RETURN QUERY SELECT _n, _names;
END;
$function$
;

NOTIFY pgrst, 'reload schema';
