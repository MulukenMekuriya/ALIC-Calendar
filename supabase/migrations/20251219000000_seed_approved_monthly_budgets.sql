-- =====================================================
-- Seed Approved Monthly Budget Requests for 2026
-- Based on approved ministry budget data
-- =====================================================

DO $$
DECLARE
  v_org_id UUID;
  v_fiscal_year_id UUID;
  v_admin_id UUID;
  v_admin_name TEXT;
  v_ministry_id UUID;
  v_request_id UUID;
  v_now TIMESTAMP WITH TIME ZONE := NOW();
BEGIN
  -- Use the specific organization ID
  v_org_id := 'a0eebc99-9c0b-4ef8-bb6d-6bb9bd380a11'::UUID;

  -- Get the 2026 fiscal year
  SELECT id INTO v_fiscal_year_id
  FROM budget.fiscal_years
  WHERE organization_id = v_org_id AND year = 2026
  LIMIT 1;

  IF v_fiscal_year_id IS NULL THEN
    RAISE NOTICE 'Fiscal year 2026 not found. Skipping budget seed.';
    RETURN;
  END IF;

  -- Use the specific admin user ID and get their name
  v_admin_id := '26c90146-d058-4a7c-811f-a6346c651370'::UUID;

  SELECT full_name INTO v_admin_name
  FROM public.profiles
  WHERE id = v_admin_id;

  IF v_admin_name IS NULL THEN
    v_admin_name := 'System Admin';
  END IF;

  -- Helper function to create monthly budget breakdown JSONB
  -- Parameters: jan, feb, mar, apr, may, jun, jul, aug, sep, oct, nov, dec

  RAISE NOTICE 'Seeding approved monthly budgets for org: %, fiscal year: %, admin: %', v_org_id, v_fiscal_year_id, v_admin_name;

  -- =====================================================
  -- MD Prayer - $3,000 total
  -- =====================================================
  SELECT id INTO v_ministry_id FROM budget.ministries
  WHERE organization_id = v_org_id AND name ILIKE '%Prayer%' LIMIT 1;

  IF v_ministry_id IS NOT NULL THEN
    INSERT INTO budget.allocation_requests (
      id, organization_id, fiscal_year_id, ministry_id,
      requester_id, requester_name, period_type,
      requested_amount, justification, budget_breakdown,
      status, approved_amount, reviewed_by, reviewed_at, admin_notes,
      created_at, updated_at
    ) VALUES (
      gen_random_uuid(), v_org_id, v_fiscal_year_id, v_ministry_id,
      v_admin_id, v_admin_name, 'monthly',
      3000.00, 'Annual Ministry Budget 2026',
      '[{"category": "monthly_budget_item", "description": "Yearly prayer mountain trip", "amount": 3000, "monthly_data": {"jan": 0, "feb": 0, "mar": 0, "apr": 0, "may": 0, "jun": 0, "jul": 0, "aug": 3000, "sep": 0, "oct": 0, "nov": 0, "dec": 0}}]'::jsonb,
      'approved', 3000.00, v_admin_id, v_now, 'Budget approved for 2026',
      v_now, v_now
    ) RETURNING id INTO v_request_id;

    INSERT INTO budget.allocation_request_history (request_id, action, actor_id, actor_name, new_status, notes, created_at)
    VALUES (v_request_id, 'approved', v_admin_id, v_admin_name, 'approved', 'Initial budget approval', v_now);

    -- Update budget allocation
    INSERT INTO budget.budget_allocations (organization_id, fiscal_year_id, ministry_id, allocated_amount, approved_by, approved_at, notes)
    VALUES (v_org_id, v_fiscal_year_id, v_ministry_id, 3000.00, v_admin_id, v_now, 'Budget approved for 2026')
    ON CONFLICT (fiscal_year_id, ministry_id) DO UPDATE SET allocated_amount = EXCLUDED.allocated_amount;
  END IF;

  -- =====================================================
  -- MD Deacons - $7,450 total
  -- =====================================================
  SELECT id INTO v_ministry_id FROM budget.ministries
  WHERE organization_id = v_org_id AND name ILIKE '%Deacon%' LIMIT 1;

  IF v_ministry_id IS NOT NULL THEN
    INSERT INTO budget.allocation_requests (
      id, organization_id, fiscal_year_id, ministry_id,
      requester_id, requester_name, period_type,
      requested_amount, justification, budget_breakdown,
      status, approved_amount, reviewed_by, reviewed_at, admin_notes,
      created_at, updated_at
    ) VALUES (
      gen_random_uuid(), v_org_id, v_fiscal_year_id, v_ministry_id,
      v_admin_id, v_admin_name, 'monthly',
      7450.00, 'Annual Ministry Budget 2026',
      '[{"category": "monthly_budget_item", "description": "Office Supplies & Ministry Operations", "amount": 7450, "monthly_data": {"jan": 0, "feb": 300, "mar": 1000, "apr": 300, "may": 0, "jun": 2150, "jul": 0, "aug": 300, "sep": 0, "oct": 1200, "nov": 0, "dec": 2200}}]'::jsonb,
      'approved', 7450.00, v_admin_id, v_now, 'Budget approved for 2026',
      v_now, v_now
    ) RETURNING id INTO v_request_id;

    INSERT INTO budget.allocation_request_history (request_id, action, actor_id, actor_name, new_status, notes, created_at)
    VALUES (v_request_id, 'approved', v_admin_id, v_admin_name, 'approved', 'Initial budget approval', v_now);

    INSERT INTO budget.budget_allocations (organization_id, fiscal_year_id, ministry_id, allocated_amount, approved_by, approved_at, notes)
    VALUES (v_org_id, v_fiscal_year_id, v_ministry_id, 7450.00, v_admin_id, v_now, 'Budget approved for 2026')
    ON CONFLICT (fiscal_year_id, ministry_id) DO UPDATE SET allocated_amount = EXCLUDED.allocated_amount;
  END IF;

  -- =====================================================
  -- MD Women's Ministry - $3,500 total
  -- =====================================================
  SELECT id INTO v_ministry_id FROM budget.ministries
  WHERE organization_id = v_org_id AND name ILIKE '%Women%' LIMIT 1;

  IF v_ministry_id IS NOT NULL THEN
    INSERT INTO budget.allocation_requests (
      id, organization_id, fiscal_year_id, ministry_id,
      requester_id, requester_name, period_type,
      requested_amount, justification, budget_breakdown,
      status, approved_amount, reviewed_by, reviewed_at, admin_notes,
      created_at, updated_at
    ) VALUES (
      gen_random_uuid(), v_org_id, v_fiscal_year_id, v_ministry_id,
      v_admin_id, v_admin_name, 'monthly',
      3500.00, 'Annual Ministry Budget 2026',
      '[{"category": "monthly_budget_item", "description": "Monthly Meeting & Training", "amount": 3500, "monthly_data": {"jan": 50, "feb": 50, "mar": 1000, "apr": 50, "may": 2000, "jun": 50, "jul": 50, "aug": 50, "sep": 50, "oct": 50, "nov": 50, "dec": 50}}]'::jsonb,
      'approved', 3500.00, v_admin_id, v_now, 'Budget approved for 2026',
      v_now, v_now
    ) RETURNING id INTO v_request_id;

    INSERT INTO budget.allocation_request_history (request_id, action, actor_id, actor_name, new_status, notes, created_at)
    VALUES (v_request_id, 'approved', v_admin_id, v_admin_name, 'approved', 'Initial budget approval', v_now);

    INSERT INTO budget.budget_allocations (organization_id, fiscal_year_id, ministry_id, allocated_amount, approved_by, approved_at, notes)
    VALUES (v_org_id, v_fiscal_year_id, v_ministry_id, 3500.00, v_admin_id, v_now, 'Budget approved for 2026')
    ON CONFLICT (fiscal_year_id, ministry_id) DO UPDATE SET allocated_amount = EXCLUDED.allocated_amount;
  END IF;

  -- =====================================================
  -- MD Men's Ministry - $4,500 total
  -- =====================================================
  SELECT id INTO v_ministry_id FROM budget.ministries
  WHERE organization_id = v_org_id AND name ILIKE '%Men%' AND name NOT ILIKE '%Women%' LIMIT 1;

  IF v_ministry_id IS NOT NULL THEN
    INSERT INTO budget.allocation_requests (
      id, organization_id, fiscal_year_id, ministry_id,
      requester_id, requester_name, period_type,
      requested_amount, justification, budget_breakdown,
      status, approved_amount, reviewed_by, reviewed_at, admin_notes,
      created_at, updated_at
    ) VALUES (
      gen_random_uuid(), v_org_id, v_fiscal_year_id, v_ministry_id,
      v_admin_id, v_admin_name, 'monthly',
      4500.00, 'Annual Ministry Budget 2026',
      '[{"category": "monthly_budget_item", "description": "Men''s Retreat & Meetings", "amount": 4500, "monthly_data": {"jan": 0, "feb": 500, "mar": 0, "apr": 0, "may": 2500, "jun": 0, "jul": 0, "aug": 500, "sep": 0, "oct": 500, "nov": 0, "dec": 500}}]'::jsonb,
      'approved', 4500.00, v_admin_id, v_now, 'Budget approved for 2026',
      v_now, v_now
    ) RETURNING id INTO v_request_id;

    INSERT INTO budget.allocation_request_history (request_id, action, actor_id, actor_name, new_status, notes, created_at)
    VALUES (v_request_id, 'approved', v_admin_id, v_admin_name, 'approved', 'Initial budget approval', v_now);

    INSERT INTO budget.budget_allocations (organization_id, fiscal_year_id, ministry_id, allocated_amount, approved_by, approved_at, notes)
    VALUES (v_org_id, v_fiscal_year_id, v_ministry_id, 4500.00, v_admin_id, v_now, 'Budget approved for 2026')
    ON CONFLICT (fiscal_year_id, ministry_id) DO UPDATE SET allocated_amount = EXCLUDED.allocated_amount;
  END IF;

  -- =====================================================
  -- MD Evangelism & Discipleship - $10,400 total
  -- =====================================================
  SELECT id INTO v_ministry_id FROM budget.ministries
  WHERE organization_id = v_org_id AND (name ILIKE '%Evangelism%' OR name ILIKE '%Discipleship%') LIMIT 1;

  IF v_ministry_id IS NOT NULL THEN
    INSERT INTO budget.allocation_requests (
      id, organization_id, fiscal_year_id, ministry_id,
      requester_id, requester_name, period_type,
      requested_amount, justification, budget_breakdown,
      status, approved_amount, reviewed_by, reviewed_at, admin_notes,
      created_at, updated_at
    ) VALUES (
      gen_random_uuid(), v_org_id, v_fiscal_year_id, v_ministry_id,
      v_admin_id, v_admin_name, 'monthly',
      10400.00, 'Annual Ministry Budget 2026',
      '[{"category": "monthly_budget_item", "description": "Outreach & Discipleship Programs", "amount": 10400, "monthly_data": {"jan": 300, "feb": 0, "mar": 1600, "apr": 500, "may": 2100, "jun": 1000, "jul": 0, "aug": 3300, "sep": 0, "oct": 1000, "nov": 0, "dec": 600}}]'::jsonb,
      'approved', 10400.00, v_admin_id, v_now, 'Budget approved for 2026',
      v_now, v_now
    ) RETURNING id INTO v_request_id;

    INSERT INTO budget.allocation_request_history (request_id, action, actor_id, actor_name, new_status, notes, created_at)
    VALUES (v_request_id, 'approved', v_admin_id, v_admin_name, 'approved', 'Initial budget approval', v_now);

    INSERT INTO budget.budget_allocations (organization_id, fiscal_year_id, ministry_id, allocated_amount, approved_by, approved_at, notes)
    VALUES (v_org_id, v_fiscal_year_id, v_ministry_id, 10400.00, v_admin_id, v_now, 'Budget approved for 2026')
    ON CONFLICT (fiscal_year_id, ministry_id) DO UPDATE SET allocated_amount = EXCLUDED.allocated_amount;
  END IF;

  -- =====================================================
  -- MD True Vine - $24,950 total
  -- =====================================================
  SELECT id INTO v_ministry_id FROM budget.ministries
  WHERE organization_id = v_org_id AND name ILIKE '%True Vine%' LIMIT 1;

  IF v_ministry_id IS NOT NULL THEN
    INSERT INTO budget.allocation_requests (
      id, organization_id, fiscal_year_id, ministry_id,
      requester_id, requester_name, period_type,
      requested_amount, justification, budget_breakdown,
      status, approved_amount, reviewed_by, reviewed_at, admin_notes,
      created_at, updated_at
    ) VALUES (
      gen_random_uuid(), v_org_id, v_fiscal_year_id, v_ministry_id,
      v_admin_id, v_admin_name, 'monthly',
      24950.00, 'Annual Ministry Budget 2026',
      '[{"category": "monthly_budget_item", "description": "True Vine Ministry Operations", "amount": 24950, "monthly_data": {"jan": 1650, "feb": 450, "mar": 7700, "apr": 1950, "may": 300, "jun": 2500, "jul": 2850, "aug": 1100, "sep": 800, "oct": 1350, "nov": 100, "dec": 2400}}]'::jsonb,
      'approved', 24950.00, v_admin_id, v_now, 'Budget approved for 2026',
      v_now, v_now
    ) RETURNING id INTO v_request_id;

    INSERT INTO budget.allocation_request_history (request_id, action, actor_id, actor_name, new_status, notes, created_at)
    VALUES (v_request_id, 'approved', v_admin_id, v_admin_name, 'approved', 'Initial budget approval', v_now);

    INSERT INTO budget.budget_allocations (organization_id, fiscal_year_id, ministry_id, allocated_amount, approved_by, approved_at, notes)
    VALUES (v_org_id, v_fiscal_year_id, v_ministry_id, 24950.00, v_admin_id, v_now, 'Budget approved for 2026')
    ON CONFLICT (fiscal_year_id, ministry_id) DO UPDATE SET allocated_amount = EXCLUDED.allocated_amount;
  END IF;

  -- =====================================================
  -- MD Young Adult - $23,150 total
  -- =====================================================
  SELECT id INTO v_ministry_id FROM budget.ministries
  WHERE organization_id = v_org_id AND name ILIKE '%Young Adult%' LIMIT 1;

  IF v_ministry_id IS NOT NULL THEN
    INSERT INTO budget.allocation_requests (
      id, organization_id, fiscal_year_id, ministry_id,
      requester_id, requester_name, period_type,
      requested_amount, justification, budget_breakdown,
      status, approved_amount, reviewed_by, reviewed_at, admin_notes,
      created_at, updated_at
    ) VALUES (
      gen_random_uuid(), v_org_id, v_fiscal_year_id, v_ministry_id,
      v_admin_id, v_admin_name, 'monthly',
      23150.00, 'Annual Ministry Budget 2026',
      '[{"category": "monthly_budget_item", "description": "Young Adult Ministry Programs", "amount": 23150, "monthly_data": {"jan": 350, "feb": 1350, "mar": 3750, "apr": 1350, "may": 350, "jun": 850, "jul": 1450, "aug": 750, "sep": 4450, "oct": 1650, "nov": 850, "dec": 850}}]'::jsonb,
      'approved', 23150.00, v_admin_id, v_now, 'Budget approved for 2026',
      v_now, v_now
    ) RETURNING id INTO v_request_id;

    INSERT INTO budget.allocation_request_history (request_id, action, actor_id, actor_name, new_status, notes, created_at)
    VALUES (v_request_id, 'approved', v_admin_id, v_admin_name, 'approved', 'Initial budget approval', v_now);

    INSERT INTO budget.budget_allocations (organization_id, fiscal_year_id, ministry_id, allocated_amount, approved_by, approved_at, notes)
    VALUES (v_org_id, v_fiscal_year_id, v_ministry_id, 23150.00, v_admin_id, v_now, 'Budget approved for 2026')
    ON CONFLICT (fiscal_year_id, ministry_id) DO UPDATE SET allocated_amount = EXCLUDED.allocated_amount;
  END IF;

  -- =====================================================
  -- MD Worship (Aroma) - $18,000 total
  -- =====================================================
  SELECT id INTO v_ministry_id FROM budget.ministries
  WHERE organization_id = v_org_id AND (name ILIKE '%Worship%' OR name ILIKE '%Aroma%') LIMIT 1;

  IF v_ministry_id IS NOT NULL THEN
    INSERT INTO budget.allocation_requests (
      id, organization_id, fiscal_year_id, ministry_id,
      requester_id, requester_name, period_type,
      requested_amount, justification, budget_breakdown,
      status, approved_amount, reviewed_by, reviewed_at, admin_notes,
      created_at, updated_at
    ) VALUES (
      gen_random_uuid(), v_org_id, v_fiscal_year_id, v_ministry_id,
      v_admin_id, v_admin_name, 'monthly',
      18000.00, 'Annual Ministry Budget 2026',
      '[{"category": "monthly_budget_item", "description": "Worship Ministry Operations", "amount": 18000, "monthly_data": {"jan": 600, "feb": 0, "mar": 600, "apr": 300, "may": 600, "jun": 0, "jul": 2000, "aug": 2000, "sep": 1100, "oct": 0, "nov": 900, "dec": 1400}}]'::jsonb,
      'approved', 18000.00, v_admin_id, v_now, 'Budget approved for 2026',
      v_now, v_now
    ) RETURNING id INTO v_request_id;

    INSERT INTO budget.allocation_request_history (request_id, action, actor_id, actor_name, new_status, notes, created_at)
    VALUES (v_request_id, 'approved', v_admin_id, v_admin_name, 'approved', 'Initial budget approval', v_now);

    INSERT INTO budget.budget_allocations (organization_id, fiscal_year_id, ministry_id, allocated_amount, approved_by, approved_at, notes)
    VALUES (v_org_id, v_fiscal_year_id, v_ministry_id, 18000.00, v_admin_id, v_now, 'Budget approved for 2026')
    ON CONFLICT (fiscal_year_id, ministry_id) DO UPDATE SET allocated_amount = EXCLUDED.allocated_amount;
  END IF;

  -- =====================================================
  -- MD Aroma Worship - $9,500 total
  -- =====================================================
  SELECT id INTO v_ministry_id FROM budget.ministries
  WHERE organization_id = v_org_id AND name ILIKE '%Aroma%' LIMIT 1;

  IF v_ministry_id IS NOT NULL THEN
    INSERT INTO budget.allocation_requests (
      id, organization_id, fiscal_year_id, ministry_id,
      requester_id, requester_name, period_type,
      requested_amount, justification, budget_breakdown,
      status, approved_amount, reviewed_by, reviewed_at, admin_notes,
      created_at, updated_at
    ) VALUES (
      gen_random_uuid(), v_org_id, v_fiscal_year_id, v_ministry_id,
      v_admin_id, v_admin_name, 'monthly',
      9500.00, 'Annual Ministry Budget 2026',
      '[{"category": "monthly_budget_item", "description": "Aroma Worship Ministry", "amount": 9500, "monthly_data": {"jan": 600, "feb": 0, "mar": 600, "apr": 300, "may": 600, "jun": 0, "jul": 2000, "aug": 2000, "sep": 1100, "oct": 0, "nov": 900, "dec": 1400}}]'::jsonb,
      'approved', 9500.00, v_admin_id, v_now, 'Budget approved for 2026',
      v_now, v_now
    ) RETURNING id INTO v_request_id;

    INSERT INTO budget.allocation_request_history (request_id, action, actor_id, actor_name, new_status, notes, created_at)
    VALUES (v_request_id, 'approved', v_admin_id, v_admin_name, 'approved', 'Initial budget approval', v_now);

    INSERT INTO budget.budget_allocations (organization_id, fiscal_year_id, ministry_id, allocated_amount, approved_by, approved_at, notes)
    VALUES (v_org_id, v_fiscal_year_id, v_ministry_id, 9500.00, v_admin_id, v_now, 'Budget approved for 2026')
    ON CONFLICT (fiscal_year_id, ministry_id) DO UPDATE SET allocated_amount = EXCLUDED.allocated_amount;
  END IF;

  -- =====================================================
  -- MD Children - $25,000 total
  -- =====================================================
  SELECT id INTO v_ministry_id FROM budget.ministries
  WHERE organization_id = v_org_id AND name ILIKE '%Children%' LIMIT 1;

  IF v_ministry_id IS NOT NULL THEN
    INSERT INTO budget.allocation_requests (
      id, organization_id, fiscal_year_id, ministry_id,
      requester_id, requester_name, period_type,
      requested_amount, justification, budget_breakdown,
      status, approved_amount, reviewed_by, reviewed_at, admin_notes,
      created_at, updated_at
    ) VALUES (
      gen_random_uuid(), v_org_id, v_fiscal_year_id, v_ministry_id,
      v_admin_id, v_admin_name, 'monthly',
      25000.00, 'Annual Ministry Budget 2026',
      '[{"category": "monthly_budget_item", "description": "Children Ministry Programs", "amount": 25000, "monthly_data": {"jan": 750, "feb": 250, "mar": 850, "apr": 3900, "may": 250, "jun": 1250, "jul": 7750, "aug": 250, "sep": 4400, "oct": 850, "nov": 250, "dec": 4250}}]'::jsonb,
      'approved', 25000.00, v_admin_id, v_now, 'Budget approved for 2026',
      v_now, v_now
    ) RETURNING id INTO v_request_id;

    INSERT INTO budget.allocation_request_history (request_id, action, actor_id, actor_name, new_status, notes, created_at)
    VALUES (v_request_id, 'approved', v_admin_id, v_admin_name, 'approved', 'Initial budget approval', v_now);

    INSERT INTO budget.budget_allocations (organization_id, fiscal_year_id, ministry_id, allocated_amount, approved_by, approved_at, notes)
    VALUES (v_org_id, v_fiscal_year_id, v_ministry_id, 25000.00, v_admin_id, v_now, 'Budget approved for 2026')
    ON CONFLICT (fiscal_year_id, ministry_id) DO UPDATE SET allocated_amount = EXCLUDED.allocated_amount;
  END IF;

  -- =====================================================
  -- MD Home Cell (Bible Study) - $8,000 total
  -- =====================================================
  SELECT id INTO v_ministry_id FROM budget.ministries
  WHERE organization_id = v_org_id AND (name ILIKE '%Home Cell%' OR name ILIKE '%Bible Study%') LIMIT 1;

  IF v_ministry_id IS NOT NULL THEN
    INSERT INTO budget.allocation_requests (
      id, organization_id, fiscal_year_id, ministry_id,
      requester_id, requester_name, period_type,
      requested_amount, justification, budget_breakdown,
      status, approved_amount, reviewed_by, reviewed_at, admin_notes,
      created_at, updated_at
    ) VALUES (
      gen_random_uuid(), v_org_id, v_fiscal_year_id, v_ministry_id,
      v_admin_id, v_admin_name, 'monthly',
      8000.00, 'Annual Ministry Budget 2026',
      '[{"category": "monthly_budget_item", "description": "Home Cell & Bible Study Groups", "amount": 8000, "monthly_data": {"jan": 150, "feb": 0, "mar": 150, "apr": 2800, "may": 150, "jun": 0, "jul": 150, "aug": 500, "sep": 450, "oct": 3500, "nov": 0, "dec": 150}}]'::jsonb,
      'approved', 8000.00, v_admin_id, v_now, 'Budget approved for 2026',
      v_now, v_now
    ) RETURNING id INTO v_request_id;

    INSERT INTO budget.allocation_request_history (request_id, action, actor_id, actor_name, new_status, notes, created_at)
    VALUES (v_request_id, 'approved', v_admin_id, v_admin_name, 'approved', 'Initial budget approval', v_now);

    INSERT INTO budget.budget_allocations (organization_id, fiscal_year_id, ministry_id, allocated_amount, approved_by, approved_at, notes)
    VALUES (v_org_id, v_fiscal_year_id, v_ministry_id, 8000.00, v_admin_id, v_now, 'Budget approved for 2026')
    ON CONFLICT (fiscal_year_id, ministry_id) DO UPDATE SET allocated_amount = EXCLUDED.allocated_amount;
  END IF;

  -- =====================================================
  -- MD Welcome - $5,700 total
  -- =====================================================
  SELECT id INTO v_ministry_id FROM budget.ministries
  WHERE organization_id = v_org_id AND name ILIKE '%Welcome%' LIMIT 1;

  IF v_ministry_id IS NOT NULL THEN
    INSERT INTO budget.allocation_requests (
      id, organization_id, fiscal_year_id, ministry_id,
      requester_id, requester_name, period_type,
      requested_amount, justification, budget_breakdown,
      status, approved_amount, reviewed_by, reviewed_at, admin_notes,
      created_at, updated_at
    ) VALUES (
      gen_random_uuid(), v_org_id, v_fiscal_year_id, v_ministry_id,
      v_admin_id, v_admin_name, 'monthly',
      5700.00, 'Annual Ministry Budget 2026',
      '[{"category": "monthly_budget_item", "description": "Welcome Ministry Operations", "amount": 5700, "monthly_data": {"jan": 100, "feb": 100, "mar": 250, "apr": 1600, "may": 100, "jun": 100, "jul": 1600, "aug": 100, "sep": 100, "oct": 1600, "nov": 100, "dec": 100}}]'::jsonb,
      'approved', 5700.00, v_admin_id, v_now, 'Budget approved for 2026',
      v_now, v_now
    ) RETURNING id INTO v_request_id;

    INSERT INTO budget.allocation_request_history (request_id, action, actor_id, actor_name, new_status, notes, created_at)
    VALUES (v_request_id, 'approved', v_admin_id, v_admin_name, 'approved', 'Initial budget approval', v_now);

    INSERT INTO budget.budget_allocations (organization_id, fiscal_year_id, ministry_id, allocated_amount, approved_by, approved_at, notes)
    VALUES (v_org_id, v_fiscal_year_id, v_ministry_id, 5700.00, v_admin_id, v_now, 'Budget approved for 2026')
    ON CONFLICT (fiscal_year_id, ministry_id) DO UPDATE SET allocated_amount = EXCLUDED.allocated_amount;
  END IF;

  -- =====================================================
  -- MD Senior's - $2,500 total
  -- =====================================================
  SELECT id INTO v_ministry_id FROM budget.ministries
  WHERE organization_id = v_org_id AND name ILIKE '%Senior%' LIMIT 1;

  IF v_ministry_id IS NOT NULL THEN
    INSERT INTO budget.allocation_requests (
      id, organization_id, fiscal_year_id, ministry_id,
      requester_id, requester_name, period_type,
      requested_amount, justification, budget_breakdown,
      status, approved_amount, reviewed_by, reviewed_at, admin_notes,
      created_at, updated_at
    ) VALUES (
      gen_random_uuid(), v_org_id, v_fiscal_year_id, v_ministry_id,
      v_admin_id, v_admin_name, 'monthly',
      2500.00, 'Annual Ministry Budget 2026',
      '[{"category": "monthly_budget_item", "description": "Senior''s Fellowship", "amount": 2500, "monthly_data": {"jan": 500, "feb": 0, "mar": 500, "apr": 0, "may": 500, "jun": 0, "jul": 500, "aug": 0, "sep": 500, "oct": 0, "nov": 0, "dec": 0}}]'::jsonb,
      'approved', 2500.00, v_admin_id, v_now, 'Budget approved for 2026',
      v_now, v_now
    ) RETURNING id INTO v_request_id;

    INSERT INTO budget.allocation_request_history (request_id, action, actor_id, actor_name, new_status, notes, created_at)
    VALUES (v_request_id, 'approved', v_admin_id, v_admin_name, 'approved', 'Initial budget approval', v_now);

    INSERT INTO budget.budget_allocations (organization_id, fiscal_year_id, ministry_id, allocated_amount, approved_by, approved_at, notes)
    VALUES (v_org_id, v_fiscal_year_id, v_ministry_id, 2500.00, v_admin_id, v_now, 'Budget approved for 2026')
    ON CONFLICT (fiscal_year_id, ministry_id) DO UPDATE SET allocated_amount = EXCLUDED.allocated_amount;
  END IF;

  -- =====================================================
  -- MD Holistic - $18,200 total
  -- =====================================================
  SELECT id INTO v_ministry_id FROM budget.ministries
  WHERE organization_id = v_org_id AND name ILIKE '%Holistic%' LIMIT 1;

  IF v_ministry_id IS NOT NULL THEN
    INSERT INTO budget.allocation_requests (
      id, organization_id, fiscal_year_id, ministry_id,
      requester_id, requester_name, period_type,
      requested_amount, justification, budget_breakdown,
      status, approved_amount, reviewed_by, reviewed_at, admin_notes,
      created_at, updated_at
    ) VALUES (
      gen_random_uuid(), v_org_id, v_fiscal_year_id, v_ministry_id,
      v_admin_id, v_admin_name, 'monthly',
      18200.00, 'Annual Ministry Budget 2026',
      '[{"category": "monthly_budget_item", "description": "Holistic Ministry Support", "amount": 18200, "monthly_data": {"jan": 1700, "feb": 1500, "mar": 1500, "apr": 1500, "may": 1500, "jun": 1500, "jul": 1500, "aug": 1500, "sep": 1500, "oct": 1500, "nov": 1500, "dec": 1500}}]'::jsonb,
      'approved', 18200.00, v_admin_id, v_now, 'Budget approved for 2026',
      v_now, v_now
    ) RETURNING id INTO v_request_id;

    INSERT INTO budget.allocation_request_history (request_id, action, actor_id, actor_name, new_status, notes, created_at)
    VALUES (v_request_id, 'approved', v_admin_id, v_admin_name, 'approved', 'Initial budget approval', v_now);

    INSERT INTO budget.budget_allocations (organization_id, fiscal_year_id, ministry_id, allocated_amount, approved_by, approved_at, notes)
    VALUES (v_org_id, v_fiscal_year_id, v_ministry_id, 18200.00, v_admin_id, v_now, 'Budget approved for 2026')
    ON CONFLICT (fiscal_year_id, ministry_id) DO UPDATE SET allocated_amount = EXCLUDED.allocated_amount;
  END IF;

  -- =====================================================
  -- MD Counseling & Marriage - $12,000 total
  -- =====================================================
  SELECT id INTO v_ministry_id FROM budget.ministries
  WHERE organization_id = v_org_id AND (name ILIKE '%Counseling%' OR name ILIKE '%Marriage%') LIMIT 1;

  IF v_ministry_id IS NOT NULL THEN
    INSERT INTO budget.allocation_requests (
      id, organization_id, fiscal_year_id, ministry_id,
      requester_id, requester_name, period_type,
      requested_amount, justification, budget_breakdown,
      status, approved_amount, reviewed_by, reviewed_at, admin_notes,
      created_at, updated_at
    ) VALUES (
      gen_random_uuid(), v_org_id, v_fiscal_year_id, v_ministry_id,
      v_admin_id, v_admin_name, 'monthly',
      12000.00, 'Annual Ministry Budget 2026',
      '[{"category": "monthly_budget_item", "description": "Counseling & Marriage Programs", "amount": 12000, "monthly_data": {"jan": 0, "feb": 0, "mar": 500, "apr": 2000, "may": 500, "jun": 0, "jul": 500, "aug": 2000, "sep": 3500, "oct": 0, "nov": 0, "dec": 0}}]'::jsonb,
      'approved', 12000.00, v_admin_id, v_now, 'Budget approved for 2026',
      v_now, v_now
    ) RETURNING id INTO v_request_id;

    INSERT INTO budget.allocation_request_history (request_id, action, actor_id, actor_name, new_status, notes, created_at)
    VALUES (v_request_id, 'approved', v_admin_id, v_admin_name, 'approved', 'Initial budget approval', v_now);

    INSERT INTO budget.budget_allocations (organization_id, fiscal_year_id, ministry_id, allocated_amount, approved_by, approved_at, notes)
    VALUES (v_org_id, v_fiscal_year_id, v_ministry_id, 12000.00, v_admin_id, v_now, 'Budget approved for 2026')
    ON CONFLICT (fiscal_year_id, ministry_id) DO UPDATE SET allocated_amount = EXCLUDED.allocated_amount;
  END IF;

  -- =====================================================
  -- MD Serving - $1,500 total
  -- =====================================================
  SELECT id INTO v_ministry_id FROM budget.ministries
  WHERE organization_id = v_org_id AND name ILIKE '%Serving%' LIMIT 1;

  IF v_ministry_id IS NOT NULL THEN
    INSERT INTO budget.allocation_requests (
      id, organization_id, fiscal_year_id, ministry_id,
      requester_id, requester_name, period_type,
      requested_amount, justification, budget_breakdown,
      status, approved_amount, reviewed_by, reviewed_at, admin_notes,
      created_at, updated_at
    ) VALUES (
      gen_random_uuid(), v_org_id, v_fiscal_year_id, v_ministry_id,
      v_admin_id, v_admin_name, 'monthly',
      1500.00, 'Annual Ministry Budget 2026',
      '[{"category": "monthly_budget_item", "description": "Serving Ministry Operations", "amount": 1500, "monthly_data": {"jan": 0, "feb": 200, "mar": 0, "apr": 700, "may": 100, "jun": 0, "jul": 0, "aug": 0, "sep": 0, "oct": 500, "nov": 0, "dec": 0}}]'::jsonb,
      'approved', 1500.00, v_admin_id, v_now, 'Budget approved for 2026',
      v_now, v_now
    ) RETURNING id INTO v_request_id;

    INSERT INTO budget.allocation_request_history (request_id, action, actor_id, actor_name, new_status, notes, created_at)
    VALUES (v_request_id, 'approved', v_admin_id, v_admin_name, 'approved', 'Initial budget approval', v_now);

    INSERT INTO budget.budget_allocations (organization_id, fiscal_year_id, ministry_id, allocated_amount, approved_by, approved_at, notes)
    VALUES (v_org_id, v_fiscal_year_id, v_ministry_id, 1500.00, v_admin_id, v_now, 'Budget approved for 2026')
    ON CONFLICT (fiscal_year_id, ministry_id) DO UPDATE SET allocated_amount = EXCLUDED.allocated_amount;
  END IF;

  -- =====================================================
  -- MD Grace - $5,520 total
  -- =====================================================
  SELECT id INTO v_ministry_id FROM budget.ministries
  WHERE organization_id = v_org_id AND name ILIKE '%Grace%' LIMIT 1;

  IF v_ministry_id IS NOT NULL THEN
    INSERT INTO budget.allocation_requests (
      id, organization_id, fiscal_year_id, ministry_id,
      requester_id, requester_name, period_type,
      requested_amount, justification, budget_breakdown,
      status, approved_amount, reviewed_by, reviewed_at, admin_notes,
      created_at, updated_at
    ) VALUES (
      gen_random_uuid(), v_org_id, v_fiscal_year_id, v_ministry_id,
      v_admin_id, v_admin_name, 'monthly',
      5520.00, 'Annual Ministry Budget 2026',
      '[{"category": "monthly_budget_item", "description": "Grace Ministry Programs", "amount": 5520, "monthly_data": {"jan": 160, "feb": 1760, "mar": 1560, "apr": 160, "may": 160, "jun": 160, "jul": 760, "aug": 160, "sep": 160, "oct": 160, "nov": 160, "dec": 160}}]'::jsonb,
      'approved', 5520.00, v_admin_id, v_now, 'Budget approved for 2026',
      v_now, v_now
    ) RETURNING id INTO v_request_id;

    INSERT INTO budget.allocation_request_history (request_id, action, actor_id, actor_name, new_status, notes, created_at)
    VALUES (v_request_id, 'approved', v_admin_id, v_admin_name, 'approved', 'Initial budget approval', v_now);

    INSERT INTO budget.budget_allocations (organization_id, fiscal_year_id, ministry_id, allocated_amount, approved_by, approved_at, notes)
    VALUES (v_org_id, v_fiscal_year_id, v_ministry_id, 5520.00, v_admin_id, v_now, 'Budget approved for 2026')
    ON CONFLICT (fiscal_year_id, ministry_id) DO UPDATE SET allocated_amount = EXCLUDED.allocated_amount;
  END IF;

  -- =====================================================
  -- MD Visiting - $2,250 total
  -- =====================================================
  SELECT id INTO v_ministry_id FROM budget.ministries
  WHERE organization_id = v_org_id AND name ILIKE '%Visiting%' LIMIT 1;

  IF v_ministry_id IS NOT NULL THEN
    INSERT INTO budget.allocation_requests (
      id, organization_id, fiscal_year_id, ministry_id,
      requester_id, requester_name, period_type,
      requested_amount, justification, budget_breakdown,
      status, approved_amount, reviewed_by, reviewed_at, admin_notes,
      created_at, updated_at
    ) VALUES (
      gen_random_uuid(), v_org_id, v_fiscal_year_id, v_ministry_id,
      v_admin_id, v_admin_name, 'monthly',
      2250.00, 'Annual Ministry Budget 2026',
      '[{"category": "monthly_budget_item", "description": "Visiting Ministry Operations", "amount": 2250, "monthly_data": {"jan": 0, "feb": 0, "mar": 0, "apr": 750, "may": 0, "jun": 0, "jul": 750, "aug": 0, "sep": 0, "oct": 750, "nov": 0, "dec": 0}}]'::jsonb,
      'approved', 2250.00, v_admin_id, v_now, 'Budget approved for 2026',
      v_now, v_now
    ) RETURNING id INTO v_request_id;

    INSERT INTO budget.allocation_request_history (request_id, action, actor_id, actor_name, new_status, notes, created_at)
    VALUES (v_request_id, 'approved', v_admin_id, v_admin_name, 'approved', 'Initial budget approval', v_now);

    INSERT INTO budget.budget_allocations (organization_id, fiscal_year_id, ministry_id, allocated_amount, approved_by, approved_at, notes)
    VALUES (v_org_id, v_fiscal_year_id, v_ministry_id, 2250.00, v_admin_id, v_now, 'Budget approved for 2026')
    ON CONFLICT (fiscal_year_id, ministry_id) DO UPDATE SET allocated_amount = EXCLUDED.allocated_amount;
  END IF;

  -- =====================================================
  -- MD IT - $1,800 total
  -- =====================================================
  SELECT id INTO v_ministry_id FROM budget.ministries
  WHERE organization_id = v_org_id AND name ILIKE '%IT%' LIMIT 1;

  IF v_ministry_id IS NOT NULL THEN
    INSERT INTO budget.allocation_requests (
      id, organization_id, fiscal_year_id, ministry_id,
      requester_id, requester_name, period_type,
      requested_amount, justification, budget_breakdown,
      status, approved_amount, reviewed_by, reviewed_at, admin_notes,
      created_at, updated_at
    ) VALUES (
      gen_random_uuid(), v_org_id, v_fiscal_year_id, v_ministry_id,
      v_admin_id, v_admin_name, 'monthly',
      1800.00, 'Annual Ministry Budget 2026',
      '[{"category": "monthly_budget_item", "description": "IT Services & Subscriptions", "amount": 1800, "monthly_data": {"jan": 100, "feb": 100, "mar": 400, "apr": 100, "may": 100, "jun": 100, "jul": 100, "aug": 400, "sep": 100, "oct": 100, "nov": 100, "dec": 100}}]'::jsonb,
      'approved', 1800.00, v_admin_id, v_now, 'Budget approved for 2026',
      v_now, v_now
    ) RETURNING id INTO v_request_id;

    INSERT INTO budget.allocation_request_history (request_id, action, actor_id, actor_name, new_status, notes, created_at)
    VALUES (v_request_id, 'approved', v_admin_id, v_admin_name, 'approved', 'Initial budget approval', v_now);

    INSERT INTO budget.budget_allocations (organization_id, fiscal_year_id, ministry_id, allocated_amount, approved_by, approved_at, notes)
    VALUES (v_org_id, v_fiscal_year_id, v_ministry_id, 1800.00, v_admin_id, v_now, 'Budget approved for 2026')
    ON CONFLICT (fiscal_year_id, ministry_id) DO UPDATE SET allocated_amount = EXCLUDED.allocated_amount;
  END IF;

  -- =====================================================
  -- MD Parking - $700 total
  -- =====================================================
  SELECT id INTO v_ministry_id FROM budget.ministries
  WHERE organization_id = v_org_id AND name ILIKE '%Parking%' LIMIT 1;

  IF v_ministry_id IS NOT NULL THEN
    INSERT INTO budget.allocation_requests (
      id, organization_id, fiscal_year_id, ministry_id,
      requester_id, requester_name, period_type,
      requested_amount, justification, budget_breakdown,
      status, approved_amount, reviewed_by, reviewed_at, admin_notes,
      created_at, updated_at
    ) VALUES (
      gen_random_uuid(), v_org_id, v_fiscal_year_id, v_ministry_id,
      v_admin_id, v_admin_name, 'monthly',
      700.00, 'Annual Ministry Budget 2026',
      '[{"category": "monthly_budget_item", "description": "Parking Ministry Operations", "amount": 700, "monthly_data": {"jan": 0, "feb": 200, "mar": 0, "apr": 0, "may": 150, "jun": 0, "jul": 0, "aug": 200, "sep": 0, "oct": 0, "nov": 0, "dec": 150}}]'::jsonb,
      'approved', 700.00, v_admin_id, v_now, 'Budget approved for 2026',
      v_now, v_now
    ) RETURNING id INTO v_request_id;

    INSERT INTO budget.allocation_request_history (request_id, action, actor_id, actor_name, new_status, notes, created_at)
    VALUES (v_request_id, 'approved', v_admin_id, v_admin_name, 'approved', 'Initial budget approval', v_now);

    INSERT INTO budget.budget_allocations (organization_id, fiscal_year_id, ministry_id, allocated_amount, approved_by, approved_at, notes)
    VALUES (v_org_id, v_fiscal_year_id, v_ministry_id, 700.00, v_admin_id, v_now, 'Budget approved for 2026')
    ON CONFLICT (fiscal_year_id, ministry_id) DO UPDATE SET allocated_amount = EXCLUDED.allocated_amount;
  END IF;

  -- =====================================================
  -- MD Church Leadership - $24,300 total
  -- =====================================================
  SELECT id INTO v_ministry_id FROM budget.ministries
  WHERE organization_id = v_org_id AND (name ILIKE '%Leadership%' OR name ILIKE '%Leaders Council%') LIMIT 1;

  IF v_ministry_id IS NOT NULL THEN
    INSERT INTO budget.allocation_requests (
      id, organization_id, fiscal_year_id, ministry_id,
      requester_id, requester_name, period_type,
      requested_amount, justification, budget_breakdown,
      status, approved_amount, reviewed_by, reviewed_at, admin_notes,
      created_at, updated_at
    ) VALUES (
      gen_random_uuid(), v_org_id, v_fiscal_year_id, v_ministry_id,
      v_admin_id, v_admin_name, 'monthly',
      24300.00, 'Annual Ministry Budget 2026',
      '[{"category": "monthly_budget_item", "description": "Church Leadership & Training", "amount": 24300, "monthly_data": {"jan": 2500, "feb": 1500, "mar": 2700, "apr": 1500, "may": 2700, "jun": 1500, "jul": 2000, "aug": 2200, "sep": 2050, "oct": 1500, "nov": 2650, "dec": 1500}}]'::jsonb,
      'approved', 24300.00, v_admin_id, v_now, 'Budget approved for 2026',
      v_now, v_now
    ) RETURNING id INTO v_request_id;

    INSERT INTO budget.allocation_request_history (request_id, action, actor_id, actor_name, new_status, notes, created_at)
    VALUES (v_request_id, 'approved', v_admin_id, v_admin_name, 'approved', 'Initial budget approval', v_now);

    INSERT INTO budget.budget_allocations (organization_id, fiscal_year_id, ministry_id, allocated_amount, approved_by, approved_at, notes)
    VALUES (v_org_id, v_fiscal_year_id, v_ministry_id, 24300.00, v_admin_id, v_now, 'Budget approved for 2026')
    ON CONFLICT (fiscal_year_id, ministry_id) DO UPDATE SET allocated_amount = EXCLUDED.allocated_amount;
  END IF;

  -- =====================================================
  -- MD Media - $6,020 total
  -- =====================================================
  SELECT id INTO v_ministry_id FROM budget.ministries
  WHERE organization_id = v_org_id AND name ILIKE '%Media%' LIMIT 1;

  IF v_ministry_id IS NOT NULL THEN
    INSERT INTO budget.allocation_requests (
      id, organization_id, fiscal_year_id, ministry_id,
      requester_id, requester_name, period_type,
      requested_amount, justification, budget_breakdown,
      status, approved_amount, reviewed_by, reviewed_at, admin_notes,
      created_at, updated_at
    ) VALUES (
      gen_random_uuid(), v_org_id, v_fiscal_year_id, v_ministry_id,
      v_admin_id, v_admin_name, 'monthly',
      6020.00, 'Annual Ministry Budget 2026',
      '[{"category": "monthly_budget_item", "description": "Media Ministry Equipment & Operations", "amount": 6020, "monthly_data": {"jan": 0, "feb": 1900, "mar": 300, "apr": 1000, "may": 1000, "jun": 0, "jul": 100, "aug": 1320, "sep": 0, "oct": 400, "nov": 0, "dec": 0}}]'::jsonb,
      'approved', 6020.00, v_admin_id, v_now, 'Budget approved for 2026',
      v_now, v_now
    ) RETURNING id INTO v_request_id;

    INSERT INTO budget.allocation_request_history (request_id, action, actor_id, actor_name, new_status, notes, created_at)
    VALUES (v_request_id, 'approved', v_admin_id, v_admin_name, 'approved', 'Initial budget approval', v_now);

    INSERT INTO budget.budget_allocations (organization_id, fiscal_year_id, ministry_id, allocated_amount, approved_by, approved_at, notes)
    VALUES (v_org_id, v_fiscal_year_id, v_ministry_id, 6020.00, v_admin_id, v_now, 'Budget approved for 2026')
    ON CONFLICT (fiscal_year_id, ministry_id) DO UPDATE SET allocated_amount = EXCLUDED.allocated_amount;
  END IF;

  -- =====================================================
  -- MD Music - $7,720 total
  -- =====================================================
  SELECT id INTO v_ministry_id FROM budget.ministries
  WHERE organization_id = v_org_id AND name ILIKE '%Music%' LIMIT 1;

  IF v_ministry_id IS NOT NULL THEN
    INSERT INTO budget.allocation_requests (
      id, organization_id, fiscal_year_id, ministry_id,
      requester_id, requester_name, period_type,
      requested_amount, justification, budget_breakdown,
      status, approved_amount, reviewed_by, reviewed_at, admin_notes,
      created_at, updated_at
    ) VALUES (
      gen_random_uuid(), v_org_id, v_fiscal_year_id, v_ministry_id,
      v_admin_id, v_admin_name, 'monthly',
      7720.00, 'Annual Ministry Budget 2026',
      '[{"category": "monthly_budget_item", "description": "Music Ministry Equipment & Operations", "amount": 7720, "monthly_data": {"jan": 0, "feb": 0, "mar": 1600, "apr": 1300, "may": 940, "jun": 0, "jul": 2000, "aug": 940, "sep": 0, "oct": 0, "nov": 940, "dec": 0}}]'::jsonb,
      'approved', 7720.00, v_admin_id, v_now, 'Budget approved for 2026',
      v_now, v_now
    ) RETURNING id INTO v_request_id;

    INSERT INTO budget.allocation_request_history (request_id, action, actor_id, actor_name, new_status, notes, created_at)
    VALUES (v_request_id, 'approved', v_admin_id, v_admin_name, 'approved', 'Initial budget approval', v_now);

    INSERT INTO budget.budget_allocations (organization_id, fiscal_year_id, ministry_id, allocated_amount, approved_by, approved_at, notes)
    VALUES (v_org_id, v_fiscal_year_id, v_ministry_id, 7720.00, v_admin_id, v_now, 'Budget approved for 2026')
    ON CONFLICT (fiscal_year_id, ministry_id) DO UPDATE SET allocated_amount = EXCLUDED.allocated_amount;
  END IF;

  -- =====================================================
  -- MD Youth - $1,700 total
  -- =====================================================
  SELECT id INTO v_ministry_id FROM budget.ministries
  WHERE organization_id = v_org_id AND name ILIKE '%Youth%' AND name NOT ILIKE '%Young Adult%' LIMIT 1;

  IF v_ministry_id IS NOT NULL THEN
    INSERT INTO budget.allocation_requests (
      id, organization_id, fiscal_year_id, ministry_id,
      requester_id, requester_name, period_type,
      requested_amount, justification, budget_breakdown,
      status, approved_amount, reviewed_by, reviewed_at, admin_notes,
      created_at, updated_at
    ) VALUES (
      gen_random_uuid(), v_org_id, v_fiscal_year_id, v_ministry_id,
      v_admin_id, v_admin_name, 'monthly',
      1700.00, 'Annual Ministry Budget 2026',
      '[{"category": "monthly_budget_item", "description": "Youth Ministry Programs", "amount": 1700, "monthly_data": {"jan": 100, "feb": 600, "mar": 1950, "apr": 450, "may": 2250, "jun": 10300, "jul": 1900, "aug": 800, "sep": 1950, "oct": 250, "nov": 1350, "dec": 3050}}]'::jsonb,
      'approved', 1700.00, v_admin_id, v_now, 'Budget approved for 2026',
      v_now, v_now
    ) RETURNING id INTO v_request_id;

    INSERT INTO budget.allocation_request_history (request_id, action, actor_id, actor_name, new_status, notes, created_at)
    VALUES (v_request_id, 'approved', v_admin_id, v_admin_name, 'approved', 'Initial budget approval', v_now);

    INSERT INTO budget.budget_allocations (organization_id, fiscal_year_id, ministry_id, allocated_amount, approved_by, approved_at, notes)
    VALUES (v_org_id, v_fiscal_year_id, v_ministry_id, 1700.00, v_admin_id, v_now, 'Budget approved for 2026')
    ON CONFLICT (fiscal_year_id, ministry_id) DO UPDATE SET allocated_amount = EXCLUDED.allocated_amount;
  END IF;

  -- =====================================================
  -- MD HA Choir - $1,700 total (same as Music in spreadsheet pattern)
  -- =====================================================
  SELECT id INTO v_ministry_id FROM budget.ministries
  WHERE organization_id = v_org_id AND name ILIKE '%Choir%' LIMIT 1;

  IF v_ministry_id IS NOT NULL THEN
    INSERT INTO budget.allocation_requests (
      id, organization_id, fiscal_year_id, ministry_id,
      requester_id, requester_name, period_type,
      requested_amount, justification, budget_breakdown,
      status, approved_amount, reviewed_by, reviewed_at, admin_notes,
      created_at, updated_at
    ) VALUES (
      gen_random_uuid(), v_org_id, v_fiscal_year_id, v_ministry_id,
      v_admin_id, v_admin_name, 'monthly',
      1700.00, 'Annual Ministry Budget 2026',
      '[{"category": "monthly_budget_item", "description": "HA Choir Ministry", "amount": 1700, "monthly_data": {"jan": 0, "feb": 0, "mar": 0, "apr": 330, "may": 0, "jun": 600, "jul": 300, "aug": 0, "sep": 500, "oct": 0, "nov": 0, "dec": 0}}]'::jsonb,
      'approved', 1700.00, v_admin_id, v_now, 'Budget approved for 2026',
      v_now, v_now
    ) RETURNING id INTO v_request_id;

    INSERT INTO budget.allocation_request_history (request_id, action, actor_id, actor_name, new_status, notes, created_at)
    VALUES (v_request_id, 'approved', v_admin_id, v_admin_name, 'approved', 'Initial budget approval', v_now);

    INSERT INTO budget.budget_allocations (organization_id, fiscal_year_id, ministry_id, allocated_amount, approved_by, approved_at, notes)
    VALUES (v_org_id, v_fiscal_year_id, v_ministry_id, 1700.00, v_admin_id, v_now, 'Budget approved for 2026')
    ON CONFLICT (fiscal_year_id, ministry_id) DO UPDATE SET allocated_amount = EXCLUDED.allocated_amount;
  END IF;

  RAISE NOTICE 'Successfully seeded approved monthly budgets';

END $$;

-- Summary comment
COMMENT ON SCHEMA budget IS 'Budget management module with approved 2026 ministry budgets';
