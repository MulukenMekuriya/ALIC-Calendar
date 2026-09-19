-- =====================================================
-- Telling somebody they have access is a notification too
-- =====================================================
--
-- 32 Kids Ministry teachers need to be told their account exists and where the
-- check-in station is. The obvious way to send 32 emails is to send them from
-- somebody's mailbox, and that is the wrong way: nothing would record that
-- they were sent, a failure would be invisible, a retry would be manual, and
-- they would arrive from a person rather than from the church.
--
-- church.notification_log already solves all four. It is queued, claimed with
-- FOR UPDATE SKIP LOCKED, retried up to five times, and drained by
-- send-kids-notification through Resend from the church's own domain. What it
-- lacked was permission to carry this kind of message.
--
-- WHY A NEW KIND rather than reusing one. 'volunteer_message' is rendered in
-- red under the heading "Please come to the Children's Ministry" — it is the
-- message that makes a parent stand up and walk to a classroom. An account
-- email wearing that styling is a false alarm. 'check_in' and 'check_out' are
-- written by triggers on a child's record and mean something specific about a
-- child; an access email is about an adult and belongs to neither.
--
-- These rows also stay in the log afterwards, which is the point: six months
-- from now "was this volunteer ever told they had access, and did it deliver?"
-- is answerable from the table rather than from somebody's sent folder.
ALTER TABLE church.notification_log
  DROP CONSTRAINT IF EXISTS chk_notification_kind;

ALTER TABLE church.notification_log
  ADD CONSTRAINT chk_notification_kind CHECK (kind IN
    ('check_in', 'check_out', 'volunteer_message', 'kids_auto_expired',
     'kids_access_granted'));

COMMENT ON COLUMN church.notification_log.kind IS
  'check_in / check_out — written by triggers on church.kids_check_ins, sent '
  'to a parent. volunteer_message — a volunteer calling a parent to the room, '
  'rendered urgently. kids_auto_expired — the leaders'' summary when the board '
  'is closed off (20260322140000). kids_access_granted — telling a volunteer '
  'their login exists and what it opens.';

NOTIFY pgrst, 'reload schema';
