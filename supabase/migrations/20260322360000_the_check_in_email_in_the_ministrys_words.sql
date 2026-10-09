-- =====================================================
-- The check-in email, in the ministry's own words
-- =====================================================
--
-- The closing of the family check-in email from 20260322350000, replaced with
-- the wording the ministry wrote:
--
--   We’re so glad your children are joining us this morning! Please keep your
--   pickup slip with you, as you’ll need it when you pick up your children.
--
--   May you be blessed and encouraged as you worship in God’s presence.
--
-- "Your child" when only one child is checked in. The pickup code stays, on a
-- line of its own above those words, as the ministry asked on 8 October. The
-- list of children and their classrooms, the subject, and the pickup email are
-- unchanged. Same signature, so CREATE OR REPLACE keeps everything that calls
-- it.

/**
 * The subject and body of a family's check-in or pickup email.
 *
 * Built from the check-ins it covers, so the same function writes the first
 * child's email and rewrites it as each sibling joins. The greeting and the
 * blessing are not here: send-kids-notification puts them around every
 * parent's email, so the bodies stay plain sentences.
 */
CREATE OR REPLACE FUNCTION church.kids_family_notice(
  _kind TEXT, _check_in_ids UUID[], _with_code BOOLEAN,
  OUT subject TEXT, OUT body TEXT)
LANGUAGE plpgsql STABLE SECURITY DEFINER
SET search_path = church, public, extensions
AS $$
DECLARE
  _names TEXT[];
  _rooms TEXT[];
  _batch UUID;
  _at TIMESTAMPTZ;
  _by TEXT;
  _n INTEGER;
  _who TEXT;
  _them TEXT;
  _code TEXT;
  _list TEXT;
BEGIN
  SELECT array_agg(coalesce(p.preferred_name, p.first_name, ci.label_child_name)
                   ORDER BY ci.tag_number, ci.id),
         array_agg(coalesce(ci.label_room_name, 'the Children''s Ministry')
                   ORDER BY ci.tag_number, ci.id),
         (array_agg(ci.batch_id))[1],
         max(ci.checked_out_at),
         (array_agg(ci.picked_up_by_name ORDER BY ci.checked_out_at DESC NULLS LAST))[1]
    INTO _names, _rooms, _batch, _at, _by
  FROM church.kids_check_ins ci
  LEFT JOIN church.people p ON p.id = ci.child_person_id
  WHERE ci.id = ANY(_check_in_ids);

  _n := coalesce(array_length(_names, 1), 0);
  IF _n = 0 THEN RETURN; END IF;
  _who := church.kids_join_names(_names);
  _them := CASE WHEN _n = 1 THEN _who ELSE 'them' END;

  IF _kind = 'check_in' THEN
    IF _with_code THEN
      -- Only a copy that still matches its hash: a stale one is a dead code.
      SELECT s.pickup_code INTO _code
      FROM church.kids_check_in_secrets s
      WHERE s.batch_id = _batch
        AND s.pickup_code IS NOT NULL
        AND s.code_hash = church.hash_pickup(s.pickup_code);
      -- Grouped the way it is printed, so the email and the slip read alike.
      IF length(_code) = 6 THEN
        _code := left(_code, 3) || '-' || right(_code, 3);
      END IF;
    END IF;

    subject := _who || CASE WHEN _n = 1 THEN ' is checked in' ELSE ' are checked in' END;

    IF _n = 1 THEN
      body := _who || ' is checked in to ' || _rooms[1] || '.';
    ELSE
      SELECT string_agg('• ' || _names[i] || ', ' || _rooms[i], E'\n' ORDER BY i)
        INTO _list
      FROM generate_subscripts(_names, 1) AS i;
      body := _who || ' are checked in and with their teachers:' || E'\n' || _list;
    END IF;

    -- The ministry's own words, from here to the end. "Your child" for one,
    -- "your children" for more. The code, when there is one, stays above them.
    body := body || E'\n\n'
      || CASE WHEN _code IS NOT NULL
              THEN 'Your pickup code is ' || _code || '.' || E'\n\n' ELSE '' END
      || 'We’re so glad your '
      || CASE WHEN _n = 1 THEN 'child is' ELSE 'children are' END
      || ' joining us this morning! Please keep your pickup slip with you, as '
      || 'you’ll need it when you pick up your '
      || CASE WHEN _n = 1 THEN 'child' ELSE 'children' END || '.'
      || E'\n\n'
      || 'May you be blessed and encouraged as you worship in God’s presence.';

  ELSE
    subject := _who || CASE WHEN _n = 1 THEN ' has been picked up' ELSE ' have been picked up' END;
    body := _who || CASE WHEN _n = 1 THEN ' was' ELSE ' were' END || ' picked up'
      || coalesce(' at ' || to_char(_at AT TIME ZONE 'America/New_York', 'FMHH12:MI AM'), '')
      || CASE WHEN nullif(btrim(coalesce(_by, '')), '') IS NOT NULL AND _by <> 'unrecorded'
              THEN ' by ' || _by ELSE '' END
      || '.' || E'\n\n'
      || 'Thank you for worshipping with us today. It was a joy to have ' || _them
      || ', and we look forward to seeing your family next Sunday.';
  END IF;
END;
$$;

REVOKE ALL ON FUNCTION church.kids_family_notice(TEXT, UUID[], BOOLEAN) FROM PUBLIC, anon, authenticated;

NOTIFY pgrst, 'reload schema';
