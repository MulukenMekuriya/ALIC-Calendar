-- =====================================================
-- The Board's seat, and the steps a budget request walks through
-- =====================================================
--
-- New enum values only, alone in their own migration: ALTER TYPE ... ADD VALUE
-- cannot be used in the transaction that adds it, so these must be committed
-- before 20260322440700 writes anything that uses them. (Written on 26 Sept as
-- 20260322320000 on an unmerged branch; renumbered, and two steps added.)
--
-- The finance office asked on 24 October 2026 for the budget year to read:
--
--   Submitted -> Under Review -> Conditionally Approved
--             -> Sent for Board Review -> Final Approval
--
-- with the Leadership Council (the office) giving a conditional approval and
-- the Board the final one. 'pending' stays as Submitted. Each new status sits
-- after the one before it, so ORDER BY status reads in workflow order.
--
-- 'board' is a TIER in public.app_role, not a module grant: app_role answers
-- "what is this person here to do", and the Board is here to approve the
-- year's budget.

ALTER TYPE public.app_role ADD VALUE IF NOT EXISTS 'board';

ALTER TYPE budget.allocation_request_status
  ADD VALUE IF NOT EXISTS 'under_review' AFTER 'pending';
ALTER TYPE budget.allocation_request_status
  ADD VALUE IF NOT EXISTS 'conditionally_approved' AFTER 'under_review';
ALTER TYPE budget.allocation_request_status
  ADD VALUE IF NOT EXISTS 'board_review' AFTER 'conditionally_approved';
