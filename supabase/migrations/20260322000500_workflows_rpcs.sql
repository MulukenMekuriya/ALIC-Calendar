-- =====================================================
-- Follow-up workflows: working the cards
-- =====================================================
--
-- Every state change goes through a function here rather than an UPDATE from
-- the client, for one reason: each of them writes a row to
-- church.workflow_card_activities in the same transaction. A card whose
-- history can be silently skipped is a card whose history nobody trusts.
--
-- The permission rule throughout: a members_admin may act on any card in the
-- branch; the person a card is ASSIGNED to may act on that card. Nobody else.
--
-- All eight writers are SECURITY DEFINER, and have to be. church.
-- workflow_card_activities carries no INSERT grant for `authenticated` at all
-- — an activity log its own users can hand-write is not a log — and the
-- assignee case is the entire point of the module: a connections volunteer
-- holding six cards and no module grant must be able to add a note and move a
-- card on. Running as the caller, every one of these failed for exactly the
-- person they were written for. church.assert_workflow_actor at the top of
-- each is what replaces the RLS check they step around; nothing here touches a
-- card without going through it first.

-- ---------------------------------------------------------------------------
-- Who may touch this card
-- ---------------------------------------------------------------------------
--
-- Returns the card's organization so callers do not fetch the row twice.
CREATE OR REPLACE FUNCTION church.assert_workflow_actor(_card_id UUID)
RETURNS UUID
LANGUAGE plpgsql STABLE SECURITY DEFINER
SET search_path = church, public
AS $$
DECLARE
  v_org UUID;
  v_assignee UUID;
BEGIN
  SELECT c.organization_id, c.assignee_person_id
  INTO v_org, v_assignee
  FROM church.workflow_cards c
  WHERE c.id = _card_id;

  IF v_org IS NULL THEN
    RAISE EXCEPTION 'card_not_found' USING ERRCODE = 'P0002';
  END IF;

  IF church.can_manage_workflows(v_org) THEN
    RETURN v_org;
  END IF;

  IF v_assignee IS NOT NULL
     AND v_assignee IN (SELECT * FROM church.my_person_ids()) THEN
    RETURN v_org;
  END IF;

  RAISE EXCEPTION 'not_permitted' USING ERRCODE = '42501';
END;
$$;

-- Due date for a card arriving on a step. NULL expected_days means no clock.
CREATE OR REPLACE FUNCTION church.workflow_due_date(_step_id UUID)
RETURNS DATE
LANGUAGE sql STABLE
SET search_path = church, public
AS $$
  SELECT CASE WHEN s.expected_days IS NULL THEN NULL
              ELSE CURRENT_DATE + s.expected_days END
  FROM church.workflow_steps s WHERE s.id = _step_id
$$;

-- ---------------------------------------------------------------------------
-- Opening a card
-- ---------------------------------------------------------------------------
CREATE OR REPLACE FUNCTION church.add_person_to_workflow(
  _organization_id UUID,
  _workflow_id UUID,
  _person_id UUID,
  _assignee_person_id UUID DEFAULT NULL,
  _note TEXT DEFAULT NULL
)
RETURNS UUID
LANGUAGE plpgsql SECURITY DEFINER
SET search_path = church, public
AS $$
DECLARE
  v_step UUID;
  v_assignee UUID;
  v_card UUID;
  v_actor TEXT := church.current_profile_name();
BEGIN
  IF NOT church.can_manage_workflows(_organization_id) THEN
    RAISE EXCEPTION 'not_permitted' USING ERRCODE = '42501';
  END IF;

  -- Already being followed up. Returning the existing card rather than
  -- raising, so that a double-click and a re-run of the auto-add both do
  -- nothing rather than something.
  SELECT c.id INTO v_card
  FROM church.workflow_cards c
  WHERE c.workflow_id = _workflow_id
    AND c.person_id = _person_id
    AND c.status IN ('open', 'snoozed');
  IF v_card IS NOT NULL THEN
    RETURN v_card;
  END IF;

  SELECT s.id INTO v_step
  FROM church.workflow_steps s
  WHERE s.workflow_id = _workflow_id AND s.is_active
  ORDER BY s.sequence
  LIMIT 1;

  IF v_step IS NULL THEN
    RAISE EXCEPTION 'workflow_has_no_steps' USING
      ERRCODE = '23514',
      HINT = 'Add at least one step before putting people into this workflow.';
  END IF;

  SELECT coalesce(_assignee_person_id, w.default_assignee_person_id)
  INTO v_assignee
  FROM church.workflows w WHERE w.id = _workflow_id;

  INSERT INTO church.workflow_cards
    (organization_id, workflow_id, person_id, current_step_id,
     assignee_person_id, due_on, created_by, created_by_name)
  VALUES
    (_organization_id, _workflow_id, _person_id, v_step,
     v_assignee, church.workflow_due_date(v_step), auth.uid(), v_actor)
  RETURNING id INTO v_card;

  INSERT INTO church.workflow_card_activities
    (organization_id, card_id, kind, body, to_step_id, assignee_person_id,
     actor_auth_user, actor_name)
  VALUES
    (_organization_id, v_card, 'created', _note, v_step, v_assignee,
     auth.uid(), v_actor);

  RETURN v_card;
END;
$$;

-- ---------------------------------------------------------------------------
-- Moving, assigning, snoozing, finishing
-- ---------------------------------------------------------------------------
CREATE OR REPLACE FUNCTION church.advance_workflow_card(
  _card_id UUID,
  _to_step_id UUID DEFAULT NULL,
  _note TEXT DEFAULT NULL
)
RETURNS JSONB
LANGUAGE plpgsql SECURITY DEFINER
SET search_path = church, public
AS $$
DECLARE
  v_org UUID := church.assert_workflow_actor(_card_id);
  v_from UUID;
  v_workflow UUID;
  v_next UUID;
  v_actor TEXT := church.current_profile_name();
BEGIN
  SELECT c.current_step_id, c.workflow_id INTO v_from, v_workflow
  FROM church.workflow_cards c WHERE c.id = _card_id;

  IF _to_step_id IS NOT NULL THEN
    v_next := _to_step_id;
    -- A card must not be moved into another workflow's step.
    PERFORM 1 FROM church.workflow_steps s
    WHERE s.id = v_next AND s.workflow_id = v_workflow;
    IF NOT FOUND THEN
      RAISE EXCEPTION 'step_not_in_workflow' USING ERRCODE = '23514';
    END IF;
  ELSE
    -- The next active step in sequence.
    SELECT s.id INTO v_next
    FROM church.workflow_steps s
    WHERE s.workflow_id = v_workflow
      AND s.is_active
      AND s.sequence > coalesce(
        (SELECT s2.sequence FROM church.workflow_steps s2 WHERE s2.id = v_from), 0)
    ORDER BY s.sequence
    LIMIT 1;
  END IF;

  -- Off the end of the list is a finish, not an error: a volunteer pressing
  -- "next" on the last step means the same thing as pressing "done".
  IF v_next IS NULL THEN
    RETURN church.complete_workflow_card(_card_id, 'completed_final_step', _note);
  END IF;

  UPDATE church.workflow_cards
  SET current_step_id = v_next,
      entered_step_at = now(),
      due_on = church.workflow_due_date(v_next),
      status = 'open',
      snooze_until = NULL
  WHERE id = _card_id;

  INSERT INTO church.workflow_card_activities
    (organization_id, card_id, kind, body, from_step_id, to_step_id,
     actor_auth_user, actor_name)
  VALUES
    (v_org, _card_id, 'step_change', _note, v_from, v_next, auth.uid(), v_actor);

  RETURN jsonb_build_object('card_id', _card_id, 'step_id', v_next, 'status', 'open');
END;
$$;

CREATE OR REPLACE FUNCTION church.assign_workflow_card(
  _card_id UUID,
  _assignee_person_id UUID,
  _note TEXT DEFAULT NULL
)
RETURNS VOID
LANGUAGE plpgsql SECURITY DEFINER
SET search_path = church, public
AS $$
DECLARE
  v_org UUID := church.assert_workflow_actor(_card_id);
  v_actor TEXT := church.current_profile_name();
BEGIN
  UPDATE church.workflow_cards
  SET assignee_person_id = _assignee_person_id
  WHERE id = _card_id;

  INSERT INTO church.workflow_card_activities
    (organization_id, card_id, kind, body, assignee_person_id,
     actor_auth_user, actor_name)
  VALUES
    (v_org, _card_id, 'assigned', _note, _assignee_person_id, auth.uid(), v_actor);
END;
$$;

CREATE OR REPLACE FUNCTION church.snooze_workflow_card(
  _card_id UUID,
  _until DATE,
  _note TEXT DEFAULT NULL
)
RETURNS VOID
LANGUAGE plpgsql SECURITY DEFINER
SET search_path = church, public
AS $$
DECLARE
  v_org UUID := church.assert_workflow_actor(_card_id);
  v_actor TEXT := church.current_profile_name();
BEGIN
  IF _until IS NULL OR _until <= CURRENT_DATE THEN
    RAISE EXCEPTION 'snooze_must_be_in_the_future' USING ERRCODE = '22023';
  END IF;

  UPDATE church.workflow_cards
  SET status = 'snoozed', snooze_until = _until, due_on = _until
  WHERE id = _card_id AND status IN ('open', 'snoozed');

  IF NOT FOUND THEN
    RAISE EXCEPTION 'card_not_open' USING ERRCODE = '23514';
  END IF;

  INSERT INTO church.workflow_card_activities
    (organization_id, card_id, kind, body, actor_auth_user, actor_name)
  VALUES
    (v_org, _card_id, 'snoozed',
     coalesce(_note, 'Snoozed until ' || _until::TEXT), auth.uid(), v_actor);
END;
$$;

CREATE OR REPLACE FUNCTION church.complete_workflow_card(
  _card_id UUID,
  _outcome TEXT DEFAULT NULL,
  _note TEXT DEFAULT NULL
)
RETURNS JSONB
LANGUAGE plpgsql SECURITY DEFINER
SET search_path = church, public
AS $$
DECLARE
  v_org UUID := church.assert_workflow_actor(_card_id);
  v_actor TEXT := church.current_profile_name();
BEGIN
  UPDATE church.workflow_cards
  SET status = 'completed',
      outcome = _outcome,
      completed_at = now(),
      completed_by_name = v_actor,
      snooze_until = NULL
  WHERE id = _card_id AND status IN ('open', 'snoozed');

  IF NOT FOUND THEN
    RAISE EXCEPTION 'card_not_open' USING ERRCODE = '23514';
  END IF;

  INSERT INTO church.workflow_card_activities
    (organization_id, card_id, kind, body, actor_auth_user, actor_name)
  VALUES (v_org, _card_id, 'completed', _note, auth.uid(), v_actor);

  RETURN jsonb_build_object('card_id', _card_id, 'status', 'completed', 'outcome', _outcome);
END;
$$;

-- Taking somebody off a list is different from finishing with them, and the
-- reports have to be able to tell the two apart: a removed card is not a
-- follow-up that worked.
CREATE OR REPLACE FUNCTION church.remove_workflow_card(
  _card_id UUID,
  _reason TEXT DEFAULT NULL
)
RETURNS VOID
LANGUAGE plpgsql SECURITY DEFINER
SET search_path = church, public
AS $$
DECLARE
  v_org UUID := church.assert_workflow_actor(_card_id);
  v_actor TEXT := church.current_profile_name();
BEGIN
  UPDATE church.workflow_cards
  SET status = 'removed', outcome = _reason, completed_at = now(),
      completed_by_name = v_actor, snooze_until = NULL
  WHERE id = _card_id AND status IN ('open', 'snoozed');

  IF NOT FOUND THEN
    RAISE EXCEPTION 'card_not_open' USING ERRCODE = '23514';
  END IF;

  INSERT INTO church.workflow_card_activities
    (organization_id, card_id, kind, body, actor_auth_user, actor_name)
  VALUES (v_org, _card_id, 'removed', _reason, auth.uid(), v_actor);
END;
$$;

CREATE OR REPLACE FUNCTION church.reopen_workflow_card(
  _card_id UUID,
  _note TEXT DEFAULT NULL
)
RETURNS VOID
LANGUAGE plpgsql SECURITY DEFINER
SET search_path = church, public
AS $$
DECLARE
  v_org UUID := church.assert_workflow_actor(_card_id);
  v_actor TEXT := church.current_profile_name();
BEGIN
  UPDATE church.workflow_cards
  SET status = 'open', completed_at = NULL, completed_by_name = NULL, outcome = NULL
  WHERE id = _card_id AND status IN ('completed', 'removed');

  IF NOT FOUND THEN
    RAISE EXCEPTION 'card_not_closed' USING ERRCODE = '23514';
  END IF;

  INSERT INTO church.workflow_card_activities
    (organization_id, card_id, kind, body, actor_auth_user, actor_name)
  VALUES (v_org, _card_id, 'reopened', _note, auth.uid(), v_actor);
END;
$$;

CREATE OR REPLACE FUNCTION church.add_workflow_card_note(
  _card_id UUID,
  _body TEXT
)
RETURNS VOID
LANGUAGE plpgsql SECURITY DEFINER
SET search_path = church, public
AS $$
DECLARE
  v_org UUID := church.assert_workflow_actor(_card_id);
BEGIN
  IF nullif(trim(coalesce(_body, '')), '') IS NULL THEN
    RAISE EXCEPTION 'note_is_empty' USING ERRCODE = '22023';
  END IF;

  INSERT INTO church.workflow_card_activities
    (organization_id, card_id, kind, body, actor_auth_user, actor_name)
  VALUES (v_org, _card_id, 'note', trim(_body), auth.uid(), church.current_profile_name());
END;
$$;

-- ---------------------------------------------------------------------------
-- Reading
-- ---------------------------------------------------------------------------
--
-- SECURITY DEFINER for the same reason the giving lists are: the board shows
-- a person's name and phone number, and the assignee working six cards holds
-- no directory permission at all.
CREATE OR REPLACE FUNCTION church.workflow_board(
  _organization_id UUID,
  _workflow_id UUID,
  _include_closed BOOLEAN DEFAULT false,
  _only_mine BOOLEAN DEFAULT false
)
RETURNS TABLE (
  card_id UUID,
  person_id UUID,
  person_name TEXT,
  person_phone TEXT,
  person_email TEXT,
  household_name TEXT,
  step_id UUID,
  step_name TEXT,
  step_sequence INTEGER,
  assignee_person_id UUID,
  assignee_name TEXT,
  status TEXT,
  due_on DATE,
  snooze_until DATE,
  is_overdue BOOLEAN,
  days_in_step INTEGER,
  outcome TEXT,
  last_note TEXT,
  last_activity_at TIMESTAMPTZ,
  created_at TIMESTAMPTZ
)
LANGUAGE plpgsql STABLE SECURITY DEFINER
SET search_path = church, public
AS $$
DECLARE
  v_can_read BOOLEAN := church.can_read_workflows(_organization_id);
BEGIN
  IF NOT v_can_read THEN
    -- Not a reader: they may still hold cards, and then they see those only.
    _only_mine := true;
  END IF;

  RETURN QUERY
  SELECT
    c.id,
    c.person_id,
    trim(p.first_name || ' ' || p.last_name),
    p.phone,
    p.email,
    h.name,
    c.current_step_id,
    s.name,
    s.sequence,
    c.assignee_person_id,
    trim(a.first_name || ' ' || a.last_name),
    c.status,
    c.due_on,
    c.snooze_until,
    (c.status IN ('open', 'snoozed') AND c.due_on IS NOT NULL AND c.due_on < CURRENT_DATE),
    (CURRENT_DATE - c.entered_step_at::DATE)::INTEGER,
    c.outcome,
    act.body,
    act.created_at,
    c.created_at
  FROM church.workflow_cards c
  JOIN church.people p ON p.id = c.person_id
  LEFT JOIN church.workflow_steps s ON s.id = c.current_step_id
  LEFT JOIN church.people a ON a.id = c.assignee_person_id
  LEFT JOIN LATERAL (
    SELECT hm.household_id FROM church.household_members hm
    WHERE hm.person_id = c.person_id AND hm.end_date IS NULL
    ORDER BY hm.is_primary_contact DESC, hm.created_at LIMIT 1
  ) hh ON true
  LEFT JOIN church.households h ON h.id = hh.household_id
  LEFT JOIN LATERAL (
    SELECT wa.body, wa.created_at
    FROM church.workflow_card_activities wa
    WHERE wa.card_id = c.id AND wa.body IS NOT NULL
    ORDER BY wa.created_at DESC LIMIT 1
  ) act ON true
  WHERE c.organization_id = _organization_id
    AND (_workflow_id IS NULL OR c.workflow_id = _workflow_id)
    AND (_include_closed OR c.status IN ('open', 'snoozed'))
    AND (NOT _only_mine
         OR c.assignee_person_id IN (SELECT * FROM church.my_person_ids()))
  ORDER BY
    -- Overdue first, then by when it is due, then oldest in step.
    (c.status IN ('open','snoozed') AND c.due_on IS NOT NULL AND c.due_on < CURRENT_DATE) DESC,
    c.due_on NULLS LAST,
    c.entered_step_at;
END;
$$;

CREATE OR REPLACE FUNCTION church.workflow_summaries(_organization_id UUID)
RETURNS TABLE (
  workflow_id UUID,
  name TEXT,
  description TEXT,
  category TEXT,
  is_active BOOLEAN,
  auto_add_on_status_code TEXT,
  step_count INTEGER,
  open_count INTEGER,
  overdue_count INTEGER,
  snoozed_count INTEGER,
  my_count INTEGER,
  completed_30d INTEGER
)
LANGUAGE plpgsql STABLE SECURITY DEFINER
SET search_path = church, public
AS $$
BEGIN
  IF NOT church.can_read_workflows(_organization_id) THEN
    RAISE EXCEPTION 'not_permitted' USING ERRCODE = '42501';
  END IF;

  RETURN QUERY
  SELECT
    w.id, w.name, w.description, w.category, w.is_active, w.auto_add_on_status_code,
    (SELECT count(*)::INTEGER FROM church.workflow_steps s
      WHERE s.workflow_id = w.id AND s.is_active),
    count(*) FILTER (WHERE c.status = 'open')::INTEGER,
    count(*) FILTER (WHERE c.status IN ('open','snoozed')
                       AND c.due_on IS NOT NULL AND c.due_on < CURRENT_DATE)::INTEGER,
    count(*) FILTER (WHERE c.status = 'snoozed')::INTEGER,
    count(*) FILTER (WHERE c.status IN ('open','snoozed')
                       AND c.assignee_person_id IN (SELECT * FROM church.my_person_ids()))::INTEGER,
    count(*) FILTER (WHERE c.status = 'completed'
                       AND c.completed_at >= now() - INTERVAL '30 days')::INTEGER
  FROM church.workflows w
  LEFT JOIN church.workflow_cards c ON c.workflow_id = w.id
  WHERE w.organization_id = _organization_id
  GROUP BY w.id, w.name, w.description, w.category, w.is_active,
           w.auto_add_on_status_code, w.created_at
  ORDER BY w.is_active DESC, w.created_at;
END;
$$;

CREATE OR REPLACE FUNCTION church.workflow_card_history(_card_id UUID)
RETURNS TABLE (
  id UUID,
  kind TEXT,
  body TEXT,
  from_step_name TEXT,
  to_step_name TEXT,
  assignee_name TEXT,
  actor_name TEXT,
  created_at TIMESTAMPTZ
)
LANGUAGE plpgsql STABLE SECURITY DEFINER
SET search_path = church, public
AS $$
BEGIN
  PERFORM church.assert_workflow_actor(_card_id);

  RETURN QUERY
  SELECT
    wa.id, wa.kind, wa.body,
    fs.name, ts.name,
    trim(pa.first_name || ' ' || pa.last_name),
    wa.actor_name, wa.created_at
  FROM church.workflow_card_activities wa
  LEFT JOIN church.workflow_steps fs ON fs.id = wa.from_step_id
  LEFT JOIN church.workflow_steps ts ON ts.id = wa.to_step_id
  LEFT JOIN church.people pa ON pa.id = wa.assignee_person_id
  WHERE wa.card_id = _card_id
  ORDER BY wa.created_at;
END;
$$;

-- Everything on one volunteer's plate, across every workflow.
CREATE OR REPLACE FUNCTION church.my_workflow_cards(_organization_id UUID)
RETURNS TABLE (
  card_id UUID,
  workflow_id UUID,
  workflow_name TEXT,
  person_name TEXT,
  person_phone TEXT,
  step_name TEXT,
  due_on DATE,
  is_overdue BOOLEAN,
  status TEXT
)
LANGUAGE sql STABLE SECURITY DEFINER
SET search_path = church, public
AS $$
  SELECT
    c.id, w.id, w.name,
    trim(p.first_name || ' ' || p.last_name),
    p.phone,
    s.name,
    c.due_on,
    (c.due_on IS NOT NULL AND c.due_on < CURRENT_DATE),
    c.status
  FROM church.workflow_cards c
  JOIN church.workflows w ON w.id = c.workflow_id
  JOIN church.people p ON p.id = c.person_id
  LEFT JOIN church.workflow_steps s ON s.id = c.current_step_id
  WHERE c.organization_id = _organization_id
    AND c.status IN ('open', 'snoozed')
    AND c.assignee_person_id IN (SELECT * FROM church.my_person_ids())
  ORDER BY (c.due_on IS NOT NULL AND c.due_on < CURRENT_DATE) DESC,
           c.due_on NULLS LAST
$$;

-- ---------------------------------------------------------------------------
-- Waking a snoozed card
-- ---------------------------------------------------------------------------
--
-- Called when somebody opens the Follow-up board, which is the only moment a
-- woken card matters. Idempotent, so opening the board twice does nothing
-- twice.
--
-- NOT on the pg_cron tick that drives the kids notification queue: the
-- permission check below is written in terms of auth.uid(), and cron runs as
-- `postgres` with no session user. A snoozed card being technically still
-- snoozed until a human looks at the board is the correct trade for not having
-- a second ungated SECURITY DEFINER writer in this schema.
CREATE OR REPLACE FUNCTION church.wake_snoozed_workflow_cards(
  _organization_id UUID
)
RETURNS INTEGER
LANGUAGE plpgsql SECURITY DEFINER
SET search_path = church, public
AS $$
DECLARE
  v_count INTEGER;
BEGIN
  -- Scoped and permission-checked even though waking a card is close to
  -- harmless, because an ungated SECURITY DEFINER writer is exactly what
  -- 20260321000400 had to go back and clean up across 26 functions.
  IF NOT church.can_read_workflows(_organization_id) THEN
    RAISE EXCEPTION 'not_permitted' USING ERRCODE = '42501';
  END IF;

  UPDATE church.workflow_cards
  SET status = 'open', snooze_until = NULL
  WHERE organization_id = _organization_id
    AND status = 'snoozed'
    AND snooze_until <= CURRENT_DATE;
  GET DIAGNOSTICS v_count = ROW_COUNT;
  RETURN v_count;
END;
$$;

-- ---------------------------------------------------------------------------
-- The automatic part
-- ---------------------------------------------------------------------------
--
-- A visitor family registered at the check-in desk becomes follow-up work
-- without anybody remembering to make it so. This is the only automation in
-- the module and it does exactly one thing: open a card.
--
-- Children are skipped. station_register_visitor_family marks the children
-- 'visitor' too, and a follow-up card for a four-year-old is noise that
-- teaches people to ignore the board.
CREATE OR REPLACE FUNCTION church.workflow_auto_add_person()
RETURNS TRIGGER
LANGUAGE plpgsql SECURITY DEFINER
SET search_path = church, public
AS $$
DECLARE
  w RECORD;
  v_status_code TEXT;
  v_step UUID;
  v_assignee UUID;
  v_card UUID;
BEGIN
  IF NEW.is_child OR NEW.membership_status_id IS NULL THEN
    RETURN NEW;
  END IF;

  SELECT ms.code INTO v_status_code
  FROM church.membership_statuses ms WHERE ms.id = NEW.membership_status_id;

  IF v_status_code IS NULL THEN
    RETURN NEW;
  END IF;

  FOR w IN
    SELECT wf.id, wf.default_assignee_person_id
    FROM church.workflows wf
    WHERE wf.organization_id = NEW.organization_id
      AND wf.is_active
      AND wf.auto_add_on_status_code = v_status_code
  LOOP
    SELECT s.id INTO v_step
    FROM church.workflow_steps s
    WHERE s.workflow_id = w.id AND s.is_active
    ORDER BY s.sequence LIMIT 1;

    -- A workflow with no steps yet is a half-built workflow, not a reason to
    -- fail the registration of a family standing at the desk.
    CONTINUE WHEN v_step IS NULL;

    v_assignee := w.default_assignee_person_id;
    -- Reset per iteration: the RETURNING below writes nothing when the card
    -- already exists, and a stale id from the previous workflow would log an
    -- activity row against the wrong card.
    v_card := NULL;

    INSERT INTO church.workflow_cards
      (organization_id, workflow_id, person_id, current_step_id,
       assignee_person_id, due_on, created_by_name)
    VALUES
      (NEW.organization_id, w.id, NEW.id, v_step, v_assignee,
       church.workflow_due_date(v_step), 'Automatic')
    ON CONFLICT DO NOTHING
    RETURNING id INTO v_card;

    IF v_card IS NOT NULL THEN
      INSERT INTO church.workflow_card_activities
        (organization_id, card_id, kind, body, to_step_id,
         assignee_person_id, actor_name)
      VALUES
        (NEW.organization_id, v_card, 'created',
         'Added automatically — new ' || v_status_code || ' record.',
         v_step, v_assignee, 'Automatic');
    END IF;
  END LOOP;

  RETURN NEW;
END;
$$;

CREATE TRIGGER people_auto_add_to_workflows
  AFTER INSERT ON church.people
  FOR EACH ROW EXECUTE FUNCTION church.workflow_auto_add_person();

-- ---------------------------------------------------------------------------
-- The workflow ALIC actually needs on day one
-- ---------------------------------------------------------------------------
--
-- Seeded per branch and wired to the 'visitor' membership status, which is
-- what church.station_register_visitor_family stamps on a guardian registered
-- at the kids desk. The step names and intervals are a starting point a
-- members_admin can edit on the screen; nothing depends on them.
INSERT INTO church.workflows
  (organization_id, name, description, category, auto_add_on_status_code, created_by_name)
SELECT o.id,
       'First-time visitor follow-up',
       'Opens automatically when a new visitor is recorded, including visitor families registered at the Kids check-in desk.',
       'visitor',
       'visitor',
       'System'
FROM public.organizations o
ON CONFLICT (organization_id, name) DO NOTHING;

INSERT INTO church.workflow_steps
  (organization_id, workflow_id, sequence, name, description, expected_days)
SELECT w.organization_id, w.id, v.sequence, v.name, v.description, v.expected_days
FROM church.workflows w
CROSS JOIN (VALUES
  (1, 'Welcome call',        'Ring within the week. Thank them for coming and ask how they found us.', 7),
  (2, 'Invite to a home cell','Offer a cell near where they live, or the young adults group.',          14),
  (3, 'Second contact',      'A follow-up after they have been once more, or a check-in if they have not.', 30),
  (4, 'Settled or closed',   'Either they are in a group and known, or we record why not.',            NULL)
) AS v(sequence, name, description, expected_days)
WHERE w.name = 'First-time visitor follow-up'
ON CONFLICT (workflow_id, sequence) DO NOTHING;

-- ---------------------------------------------------------------------------
-- Grants
-- ---------------------------------------------------------------------------
GRANT EXECUTE ON FUNCTION church.add_person_to_workflow(UUID, UUID, UUID, UUID, TEXT) TO authenticated;
GRANT EXECUTE ON FUNCTION church.advance_workflow_card(UUID, UUID, TEXT) TO authenticated;
GRANT EXECUTE ON FUNCTION church.assign_workflow_card(UUID, UUID, TEXT) TO authenticated;
GRANT EXECUTE ON FUNCTION church.snooze_workflow_card(UUID, DATE, TEXT) TO authenticated;
GRANT EXECUTE ON FUNCTION church.complete_workflow_card(UUID, TEXT, TEXT) TO authenticated;
GRANT EXECUTE ON FUNCTION church.remove_workflow_card(UUID, TEXT) TO authenticated;
GRANT EXECUTE ON FUNCTION church.reopen_workflow_card(UUID, TEXT) TO authenticated;
GRANT EXECUTE ON FUNCTION church.add_workflow_card_note(UUID, TEXT) TO authenticated;
GRANT EXECUTE ON FUNCTION church.workflow_board(UUID, UUID, BOOLEAN, BOOLEAN) TO authenticated;
GRANT EXECUTE ON FUNCTION church.workflow_summaries(UUID) TO authenticated;
GRANT EXECUTE ON FUNCTION church.workflow_card_history(UUID) TO authenticated;
GRANT EXECUTE ON FUNCTION church.my_workflow_cards(UUID) TO authenticated;
GRANT EXECUTE ON FUNCTION church.wake_snoozed_workflow_cards(UUID) TO authenticated;

-- Internal: assert_workflow_actor, workflow_due_date, workflow_auto_add_person,
-- can_manage_workflows, can_read_workflows. Not granted.

NOTIFY pgrst, 'reload schema';
