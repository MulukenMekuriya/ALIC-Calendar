/**
 * Create Budget Allocation Using Real Data from Supabase Screenshot
 * Use this in browser console to create the missing budget allocation
 */

// Real data from your Supabase allocation_requests table (visible in screenshot)
const realBudgetData = {
  organizationId: "a0eebc99-9c0b-4ef8-bb6d-6bb9bd380a11",
  ministryId: "573b2781-1c72-44f6-9bca-3d5b48e5c950",
  fiscalYearId: "85094e42-db58-4a7c-81f1-36c40d363c2b",
  requesterId: "bacb3a03-a984-4320-8019-36c40d363c2b",
  allocatedAmount: 200.0, // Set to the amount that was approved
};

console.log("Real budget allocation data:", realBudgetData);

/**
 * Execute this function to create the budget allocation
 * Copy and paste this into your browser console while on your app
 */
async function createRealBudgetAllocation() {
  try {
    // Import supabase client (this works if you're in the app context)
    const { supabase } = await import("@/integrations/supabase/client");

    // Create the budget allocation record
    const { data: allocation, error } = await supabase
      .schema("budget")
      .from("budget_allocations")
      .insert({
        organization_id: realBudgetData.organizationId,
        ministry_id: realBudgetData.ministryId,
        fiscal_year_id: realBudgetData.fiscalYearId,
        allocated_amount: realBudgetData.allocatedAmount,
        created_by: realBudgetData.requesterId,
        created_at: new Date().toISOString(),
        updated_at: new Date().toISOString(),
      })
      .select()
      .single();

    if (error) {
      console.error("Error creating budget allocation:", error);
      return { success: false, error: error.message };
    }

    console.log("✅ Budget allocation created successfully:", allocation);
    console.log("🎉 Your Total Budget should now show $200 instead of $0!");

    return {
      success: true,
      allocation,
      message: `Budget allocation of $${realBudgetData.allocatedAmount} created successfully`,
    };
  } catch (error) {
    console.error("❌ Error:", error);
    return {
      success: false,
      error: error instanceof Error ? error.message : "Unexpected error",
    };
  }
}

// Alternative: Direct SQL insert you can run in Supabase SQL editor (EXCLUDING cancelled requests)
const directSQLInsert = `
-- Run this in Supabase SQL Editor to create budget allocation from APPROVED requests only
INSERT INTO budget.budget_allocations (
  organization_id,
  ministry_id,
  fiscal_year_id,
  allocated_amount
) 
SELECT 
  organization_id,
  ministry_id,
  fiscal_year_id,
  approved_amount as allocated_amount
FROM budget.allocation_requests 
WHERE status IN ('approved', 'partially_approved')
  AND status != 'cancelled'  -- Explicitly exclude cancelled requests
  AND approved_amount > 0;
`;

console.log("🔧 Direct SQL Insert:", directSQLInsert);

export { createRealBudgetAllocation, realBudgetData, directSQLInsert };
