-- =====================================================
-- Clear Test Data from Budget Schema Tables
-- This migration removes all test data from the budget module tables
-- while preserving the schema structure and reference tables
-- =====================================================

-- Delete in order respecting foreign key constraints
-- Start with child tables and work up to parent tables

-- 1. Clear allocation_period_amounts (child of allocation_requests)
TRUNCATE TABLE budget.allocation_period_amounts CASCADE;

-- 2. Clear allocation_request_history (child of allocation_requests)
TRUNCATE TABLE budget.allocation_request_history CASCADE;

-- 3. Clear allocation_requests
TRUNCATE TABLE budget.allocation_requests CASCADE;

-- 4. Clear expense_history (child of expense_requests)
TRUNCATE TABLE budget.expense_history CASCADE;

-- 5. Clear expense_requests
TRUNCATE TABLE budget.expense_requests CASCADE;

-- 6. Clear budget_allocations
TRUNCATE TABLE budget.budget_allocations CASCADE;

-- Note: fiscal_years and ministries are NOT cleared as they are
-- reference/configuration tables that the application depends on.
-- If you need to clear those as well, uncomment the following lines:
-- TRUNCATE TABLE budget.ministries CASCADE;
-- TRUNCATE TABLE budget.fiscal_years CASCADE;
