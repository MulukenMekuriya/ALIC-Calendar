-- Assertions for 20260322400000, inside BEGIN/ROLLBACK.
--
-- The reminder links to the church app at alic.org, on a line of its own
-- (the sender draws that line as the button), and nowhere to addislidet.info.

DO $a$
DECLARE _def TEXT := pg_get_functiondef(
  'church.kids_queue_consent_reminders(uuid,uuid[],boolean,uuid,text)'::regprocedure);
BEGIN
  IF position('https://alic.org/my?tab=children&consent=1' IN _def) = 0 THEN
    RAISE EXCEPTION 'FAIL 1: the reminder does not link to alic.org/my';
  END IF;
  IF position('addislidet.info' IN _def) > 0 THEN
    RAISE EXCEPTION 'FAIL 1a: the reminder still links to addislidet.info';
  END IF;
  -- The link still stands on its own line, which is what makes it a button.
  IF position('E''\n\n'' || _link || E''\n\n''' IN _def) = 0 THEN
    RAISE EXCEPTION 'FAIL 1b: the link is no longer on a line of its own';
  END IF;
  RAISE NOTICE 'PASS 1';
END;
$a$;
