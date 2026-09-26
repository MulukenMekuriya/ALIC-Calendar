-- =====================================================
-- Two new enum values: the 'board' tier, and 'board_review'
-- =====================================================
--
-- Alone in its own migration for the usual reason: ALTER TYPE ... ADD VALUE
-- cannot be used in the transaction that adds it, so both values have to be
-- committed before 20260322330000 can write a policy or a function body that
-- names them. Same reason as 20260321001500 and 20260321001000.
--
-- WHY 'board'. The budget year is not settled by the office alone. Ministries
-- submit, the office adjusts, and then the Board reads every request against
-- the money the church actually has before anything is promised. Until now the
-- Board had nowhere to stand in the system: the only way to show them the
-- requests was to read them out, and the only way to record what they said was
-- to remember it.
--
-- It is a TIER, not a grant, which is the test set out in 20260321001500:
-- app_role is exclusive (UNIQUE(user_id, organization_id)) and answers "what is
-- this person here to do". A board member is here to review the budget; they
-- are not a contributor who also sits on the board. Anything additive — a kids
-- volunteer, a members admin — still belongs in church.module_permission.
--
-- WHY 'board_review'. 'pending' meant two different things at once: sitting
-- with the office, and sitting with the Board. The office could not tell, from
-- the board, which requests it had already finished adjusting, and a request
-- could be approved out from under a Board that had not yet seen it.
-- 'board_review' is that middle step, and it sits AFTER 'pending' in the enum
-- so that ORDER BY status still reads in workflow order.

ALTER TYPE public.app_role ADD VALUE IF NOT EXISTS 'board';

ALTER TYPE budget.allocation_request_status
  ADD VALUE IF NOT EXISTS 'board_review' AFTER 'pending';
