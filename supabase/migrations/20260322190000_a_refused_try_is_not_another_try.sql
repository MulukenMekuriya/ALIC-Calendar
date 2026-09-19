-- =====================================================
-- A refused try is not another try
-- =====================================================
--
-- The rate limiter on the QR code page (20260322100000) recorded every call it
-- saw, including the ones it refused. The window is the last hour, so each
-- refused press pushed the hour forward: somebody locked out at 15:56 who kept
-- pressing was still locked out at 16:06, and would have been at 17:06, and
-- had no way to learn that the waiting only starts when the pressing stops.
-- The sentence on the screen says "wait an hour", and the function made that
-- untrue.
--
-- 19 September, for the record, is what surfaced it. A fault of ours made
-- every registration started from the Phone tab fail — the browser left the
-- email address out of the request, the server answered email_required, and
-- the page reported it as the church's system being unreachable. Six presses
-- of a button that could not work, and the seventh was answered by this
-- function instead, which told six people to come back in an hour and then
-- kept moving the hour. Thirty of the forty-six registration attempts that
-- morning were one of those six people pressing again.
--
-- So: count first, and record only what is allowed through. The ceilings are
-- unchanged and mean exactly what they said — 6 lookups, 3 sends, 6
-- registrations per address per hour, 240 per address block. What changes is
-- that the hour after the sixth one is now an hour, however impatient the
-- person in front of the screen is.
--
-- The abuse case is not weakened by this. A script's budget was never the
-- refusals, which cost it nothing and only ever punished the person who did
-- not understand why the button had stopped working; it is the 6 that get
-- through, and that is still 6.
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

  IF _per_id >= _ceiling OR (_ip IS NOT NULL AND _per_ip >= 240) THEN
    RETURN false;
  END IF;

  -- Still one function rather than a check and a separate insert, so a caller
  -- cannot do the first and forget the second.
  INSERT INTO church.claim_attempts (ip, identifier, action)
  VALUES (_ip, _key, _action);

  RETURN true;
END;
$$;

GRANT EXECUTE ON FUNCTION church.claim_note_attempt(TEXT, TEXT, TEXT) TO service_role;

COMMENT ON FUNCTION church.claim_note_attempt(TEXT, TEXT, TEXT) IS
  'Records a call to the QR code page and says whether it may proceed. A '
  'refused call is NOT recorded: the window is the last hour and counting '
  'refusals would push the hour forward every time somebody pressed the '
  'button again.';

NOTIFY pgrst, 'reload schema';
