/**
 * Budget Allocation service - handles ministry budget allocations
 * Uses the 'budget' schema
 */

import { supabase } from "@/integrations/supabase/client";
import type {
  BudgetAllocation,
  BudgetAllocationInsert,
  BudgetAllocationUpdate,
  BudgetAllocationWithRelations,
  MinistryBudgetSummary,
  OrganizationBudgetSummary,
} from "../types";

// Helper to get the budget schema client
const budgetSchema = () => supabase.schema("budget");

export const budgetAllocationService = {
  /**
   * List all budget allocations for a fiscal year
   */
  async listByFiscalYear(fiscalYearId: string): Promise<BudgetAllocationWithRelations[]> {
    const { data, error } = await budgetSchema()
      .from("budget_allocations")
      .select(`
        *,
        ministries(id, name, description),
        fiscal_years(id, name, year)
      `)
      .eq("fiscal_year_id", fiscalYearId)
      .order("created_at", { ascending: false });

    if (error) throw error;

    return (data || []).map((allocation) => ({
      ...allocation,
      ministry: allocation.ministries,
      fiscal_year: allocation.fiscal_years,
    })) as unknown as BudgetAllocationWithRelations[];
  },

  /**
   * Get budget allocation for a specific ministry and fiscal year
   */
  async getByMinistryAndFiscalYear(
    ministryId: string,
    fiscalYearId: string
  ): Promise<BudgetAllocationWithRelations | null> {
    const { data, error } = await budgetSchema()
      .from("budget_allocations")
      .select(`
        *,
        ministries(id, name, description),
        fiscal_years(id, name, year)
      `)
      .eq("ministry_id", ministryId)
      .eq("fiscal_year_id", fiscalYearId)
      .single();

    if (error && error.code !== "PGRST116") throw error;
    if (!data) return null;

    return {
      ...data,
      ministry: data.ministries,
      fiscal_year: data.fiscal_years,
    } as unknown as BudgetAllocationWithRelations;
  },

  /**
   * Create or update budget allocation
   */
  async upsert(allocationData: BudgetAllocationInsert): Promise<BudgetAllocation> {
    const { data, error } = await budgetSchema()
      .from("budget_allocations")
      .upsert(allocationData, {
        onConflict: "fiscal_year_id,ministry_id",
      })
      .select()
      .single();

    if (error) throw error;
    return data;
  },

  /**
   * Create a new budget allocation
   */
  async create(allocationData: BudgetAllocationInsert): Promise<BudgetAllocation> {
    const { data, error } = await budgetSchema()
      .from("budget_allocations")
      .insert(allocationData)
      .select()
      .single();

    if (error) throw error;
    return data;
  },

  /**
   * Update a budget allocation
   */
  async update(
    allocationId: string,
    allocationData: BudgetAllocationUpdate
  ): Promise<BudgetAllocation> {
    const { data, error } = await budgetSchema()
      .from("budget_allocations")
      .update({
        ...allocationData,
        updated_at: new Date().toISOString(),
      })
      .eq("id", allocationId)
      .select()
      .single();

    if (error) throw error;
    return data;
  },

  /**
   * Delete a budget allocation
   */
  async delete(allocationId: string): Promise<void> {
    const { error } = await budgetSchema()
      .from("budget_allocations")
      .delete()
      .eq("id", allocationId);

    if (error) throw error;
  },

  /**
   * Get ministry budget summary with spending data
   */
  async getMinistryBudgetSummary(
    ministryId: string,
    fiscalYearId: string
  ): Promise<MinistryBudgetSummary | null> {
    // Get the budget allocation
    const allocation = await this.getByMinistryAndFiscalYear(ministryId, fiscalYearId);
    if (!allocation) return null;

    // Get expense totals by status (EXCLUDING cancelled expenses)
    const { data: expenses, error } = await budgetSchema()
      .from("expense_requests")
      .select("amount, status")
      .eq("ministry_id", ministryId)
      .eq("fiscal_year_id", fiscalYearId)
      .neq("status", "cancelled"); // Exclude cancelled expenses

    if (error) throw error;

    const totals = (expenses || []).reduce(
      (acc, exp) => {
        const amount = Number(exp.amount);
        if (
          ["pending_leader", "leader_approved", "pending_treasury"].includes(exp.status)
        ) {
          acc.pending += amount;
        } else if (
          ["treasury_approved", "pending_finance"].includes(exp.status)
        ) {
          acc.approved += amount;
        } else if (exp.status === "completed") {
          acc.spent += amount;
        }
        return acc;
      },
      { pending: 0, approved: 0, spent: 0 }
    );

    const allocatedAmount = Number(allocation.allocated_amount);
    const remaining = allocatedAmount - totals.pending - totals.approved - totals.spent;

    return {
      ministry_id: ministryId,
      ministry_name: allocation.ministry.name,
      fiscal_year_id: fiscalYearId,
      fiscal_year_name: allocation.fiscal_year.name,
      allocated_amount: allocatedAmount,
      total_pending: totals.pending,
      total_approved: totals.approved,
      total_spent: totals.spent,
      remaining: Math.max(0, remaining),
    };
  },

  /**
   * Get organization-wide budget summary
   */
  async getOrganizationBudgetSummary(
    organizationId: string,
    fiscalYearId: string
  ): Promise<OrganizationBudgetSummary> {
    // Get all allocations for this fiscal year
    const { data: allocations, error: allocError } = await budgetSchema()
      .from("budget_allocations")
      .select(`
        *,
        ministries(id, name)
      `)
      .eq("organization_id", organizationId)
      .eq("fiscal_year_id", fiscalYearId);

    if (allocError) throw allocError;

    // Get fiscal year info
    const { data: fiscalYear, error: fyError } = await budgetSchema()
      .from("fiscal_years")
      .select("name")
      .eq("id", fiscalYearId)
      .single();

    if (fyError) throw fyError;

    // Get all expenses for this fiscal year (EXCLUDING cancelled expenses)
    const { data: expenses, error: expError } = await budgetSchema()
      .from("expense_requests")
      .select("ministry_id, amount, status")
      .eq("organization_id", organizationId)
      .eq("fiscal_year_id", fiscalYearId)
      .neq("status", "cancelled"); // Exclude cancelled expenses

    if (expError) throw expError;

    // Build ministry summaries
    const ministrySummaries: MinistryBudgetSummary[] = (allocations || []).map(
      (allocation) => {
        const ministryExpenses = (expenses || []).filter(
          (e) => e.ministry_id === allocation.ministry_id
        );

        const totals = ministryExpenses.reduce(
          (acc, exp) => {
            const amount = Number(exp.amount);
            if (
              ["pending_leader", "leader_approved", "pending_treasury"].includes(
                exp.status
              )
            ) {
              acc.pending += amount;
            } else if (
              ["treasury_approved", "pending_finance"].includes(exp.status)
            ) {
              acc.approved += amount;
            } else if (exp.status === "completed") {
              acc.spent += amount;
            }
            return acc;
          },
          { pending: 0, approved: 0, spent: 0 }
        );

        const allocatedAmount = Number(allocation.allocated_amount);
        const remaining =
          allocatedAmount - totals.pending - totals.approved - totals.spent;

        return {
          ministry_id: allocation.ministry_id,
          ministry_name: (allocation.ministries as { id: string; name: string }).name,
          fiscal_year_id: fiscalYearId,
          fiscal_year_name: fiscalYear.name,
          allocated_amount: allocatedAmount,
          total_pending: totals.pending,
          total_approved: totals.approved,
          total_spent: totals.spent,
          remaining: Math.max(0, remaining),
        };
      }
    );

    // Calculate organization totals
    const orgTotals = ministrySummaries.reduce(
      (acc, summary) => {
        acc.allocated += summary.allocated_amount;
        acc.pending += summary.total_pending;
        acc.approved += summary.total_approved;
        acc.spent += summary.total_spent;
        acc.remaining += summary.remaining;
        return acc;
      },
      { allocated: 0, pending: 0, approved: 0, spent: 0, remaining: 0 }
    );

    return {
      fiscal_year_id: fiscalYearId,
      fiscal_year_name: fiscalYear.name,
      total_allocated: orgTotals.allocated,
      total_pending: orgTotals.pending,
      total_approved: orgTotals.approved,
      total_spent: orgTotals.spent,
      total_remaining: orgTotals.remaining,
      ministry_summaries: ministrySummaries,
    };
  },
};
