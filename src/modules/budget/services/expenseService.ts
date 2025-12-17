/**
 * Expense Request service - handles expense requests and approval workflow
 * Uses the 'budget' schema
 */

import { supabase } from "@/integrations/supabase/client";
import type {
  ExpenseRequest,
  ExpenseRequestInsert,
  ExpenseRequestUpdate,
  ExpenseRequestWithRelations,
  ExpenseHistory,
  ExpenseHistoryInsert,
  ExpenseFilters,
  ExpenseStatus,
  ExpenseHistoryWithActor,
} from "../types";

// Helper to get the budget schema client
const budgetSchema = () => supabase.schema("budget");

export const expenseService = {
  /**
   * List expense requests with filters
   */
  async list(
    organizationId: string,
    filters?: ExpenseFilters
  ): Promise<ExpenseRequestWithRelations[]> {
    let query = budgetSchema()
      .from("expense_requests")
      .select(
        `
        *,
        ministries(id, name, description),
        fiscal_years(id, name, year)
      `
      )
      .eq("organization_id", organizationId)
      .neq("status", "cancelled") // Exclude cancelled requests by default
      .order("created_at", { ascending: false });

    // Apply filters
    if (filters?.status) {
      if (Array.isArray(filters.status)) {
        query = query.in("status", filters.status);
      } else {
        query = query.eq("status", filters.status);
      }
    }
    if (filters?.ministry_id) {
      query = query.eq("ministry_id", filters.ministry_id);
    }
    if (filters?.fiscal_year_id) {
      query = query.eq("fiscal_year_id", filters.fiscal_year_id);
    }
    if (filters?.requester_id) {
      query = query.eq("requester_id", filters.requester_id);
    }
    if (filters?.date_from) {
      query = query.gte("created_at", filters.date_from);
    }
    if (filters?.date_to) {
      query = query.lte("created_at", filters.date_to);
    }
    if (filters?.search) {
      query = query.or(
        `title.ilike.%${filters.search}%,description.ilike.%${filters.search}%,requester_name.ilike.%${filters.search}%`
      );
    }

    const { data, error } = await query;
    if (error) throw error;

    return (data || []).map((expense) => ({
      ...expense,
      ministry: expense.ministries,
      fiscal_year: expense.fiscal_years,
    })) as unknown as ExpenseRequestWithRelations[];
  },

  /**
   * Get expense requests pending admin review (leader approval stage)
   * Only ADMIN role can approve/deny at this stage
   */
  async listPendingForAdmin(
    organizationId: string
  ): Promise<ExpenseRequestWithRelations[]> {
    const { data, error } = await budgetSchema()
      .from("expense_requests")
      .select(
        `
        *,
        ministries(id, name, description),
        fiscal_years(id, name, year)
      `
      )
      .eq("organization_id", organizationId)
      .eq("status", "pending_leader")
      .order("created_at", { ascending: true });

    if (error) throw error;

    return (data || []).map((expense) => ({
      ...expense,
      ministry: expense.ministries,
      fiscal_year: expense.fiscal_years,
    })) as unknown as ExpenseRequestWithRelations[];
  },

  /**
   * Get expense requests pending treasury review
   */
  async listPendingForTreasury(
    organizationId: string
  ): Promise<ExpenseRequestWithRelations[]> {
    const { data, error } = await budgetSchema()
      .from("expense_requests")
      .select(
        `
        *,
        ministries(id, name, description),
        fiscal_years(id, name, year)
      `
      )
      .eq("organization_id", organizationId)
      .in("status", ["leader_approved", "pending_treasury"])
      .order("leader_reviewed_at", { ascending: true });

    if (error) throw error;

    return (data || []).map((expense) => ({
      ...expense,
      ministry: expense.ministries,
      fiscal_year: expense.fiscal_years,
    })) as unknown as ExpenseRequestWithRelations[];
  },

  /**
   * Get expense requests pending finance processing
   */
  async listPendingForFinance(
    organizationId: string
  ): Promise<ExpenseRequestWithRelations[]> {
    const { data, error } = await budgetSchema()
      .from("expense_requests")
      .select(
        `
        *,
        ministries(id, name, description),
        fiscal_years(id, name, year)
      `
      )
      .eq("organization_id", organizationId)
      .in("status", ["treasury_approved", "pending_finance"])
      .order("treasury_reviewed_at", { ascending: true });

    if (error) throw error;

    return (data || []).map((expense) => ({
      ...expense,
      ministry: expense.ministries,
      fiscal_year: expense.fiscal_years,
    })) as unknown as ExpenseRequestWithRelations[];
  },

  /**
   * Get a single expense request by ID
   */
  async get(expenseId: string): Promise<ExpenseRequestWithRelations | null> {
    const { data, error } = await budgetSchema()
      .from("expense_requests")
      .select(
        `
        *,
        ministries(id, name, description),
        fiscal_years(id, name, year)
      `
      )
      .eq("id", expenseId)
      .single();

    if (error) throw error;
    if (!data) return null;

    // Collect all unique profile IDs to fetch in a single query
    const profileIds = [
      data.requester_id,
      data.leader_reviewer_id,
      data.treasury_reviewer_id,
      data.finance_processor_id,
    ].filter((id): id is string => !!id);

    // Batch fetch all profiles in a single query
    const profilesMap: Record<
      string,
      {
        id: string;
        full_name: string;
        email?: string;
        phone_number?: string | null;
      }
    > = {};

    if (profileIds.length > 0) {
      const { data: profiles } = await supabase
        .from("profiles")
        .select("id, full_name, email, phone_number")
        .in("id", profileIds);

      if (profiles) {
        for (const profile of profiles) {
          profilesMap[profile.id] = profile;
        }
      }
    }

    return {
      ...data,
      ministry: data.ministries,
      fiscal_year: data.fiscal_years,
      requester_profile: data.requester_id
        ? profilesMap[data.requester_id] || null
        : null,
      leader_reviewer_profile: data.leader_reviewer_id
        ? profilesMap[data.leader_reviewer_id] || null
        : null,
      treasury_reviewer_profile: data.treasury_reviewer_id
        ? profilesMap[data.treasury_reviewer_id] || null
        : null,
      finance_processor_profile: data.finance_processor_id
        ? profilesMap[data.finance_processor_id] || null
        : null,
    } as unknown as ExpenseRequestWithRelations;
  },

  /**
   * Create a new expense request
   */
  async create(
    expenseData: ExpenseRequestInsert,
    actorId: string,
    actorName: string
  ): Promise<ExpenseRequest> {
    const { data, error } = await budgetSchema()
      .from("expense_requests")
      .insert(expenseData)
      .select()
      .single();

    if (error) throw error;

    // Create history entry
    await this.addHistory({
      expense_request_id: data.id,
      action: "created",
      previous_status: null,
      new_status: data.status,
      actor_id: actorId,
      actor_name: actorName,
      notes: "Expense request created",
    });

    return data;
  },

  /**
   * Update an expense request
   */
  async update(
    expenseId: string,
    expenseData: ExpenseRequestUpdate
  ): Promise<ExpenseRequest> {
    const { data, error } = await budgetSchema()
      .from("expense_requests")
      .update({
        ...expenseData,
        updated_at: new Date().toISOString(),
      })
      .eq("id", expenseId)
      .select()
      .single();

    if (error) throw error;
    return data;
  },

  /**
   * Delete an expense request (only drafts)
   */
  async delete(expenseId: string): Promise<void> {
    const { error } = await budgetSchema()
      .from("expense_requests")
      .delete()
      .eq("id", expenseId);

    if (error) throw error;
  },

  /**
   * Submit expense request for leader review
   */
  async submitForReview(
    expenseId: string,
    actorId: string,
    actorName: string
  ): Promise<ExpenseRequest> {
    const { data: current } = await budgetSchema()
      .from("expense_requests")
      .select("status")
      .eq("id", expenseId)
      .single();

    const previousStatus = current?.status as ExpenseStatus;

    const { data, error } = await budgetSchema()
      .from("expense_requests")
      .update({
        status: "pending_leader",
        submitted_at: new Date().toISOString(),
        updated_at: new Date().toISOString(),
      })
      .eq("id", expenseId)
      .select()
      .single();

    if (error) throw error;

    await this.addHistory({
      expense_request_id: expenseId,
      action: "submitted",
      previous_status: previousStatus,
      new_status: "pending_leader",
      actor_id: actorId,
      actor_name: actorName,
      notes: "Submitted for leader review",
    });

    return data;
  },

  /**
   * Leader approves expense request
   */
  async leaderApprove(
    expenseId: string,
    reviewerId: string,
    reviewerName: string,
    notes?: string
  ): Promise<ExpenseRequest> {
    const { data: current } = await budgetSchema()
      .from("expense_requests")
      .select("status")
      .eq("id", expenseId)
      .single();

    const previousStatus = current?.status as ExpenseStatus;

    const { data, error } = await budgetSchema()
      .from("expense_requests")
      .update({
        status: "leader_approved",
        leader_reviewer_id: reviewerId,
        leader_reviewed_at: new Date().toISOString(),
        leader_notes: notes,
        updated_at: new Date().toISOString(),
      })
      .eq("id", expenseId)
      .select()
      .single();

    if (error) throw error;

    await this.addHistory({
      expense_request_id: expenseId,
      action: "leader_approved",
      previous_status: previousStatus,
      new_status: "leader_approved",
      actor_id: reviewerId,
      actor_name: reviewerName,
      notes: notes || "Approved by admin",
    });

    return data;
  },

  /**
   * Leader denies expense request
   */
  async leaderDeny(
    expenseId: string,
    reviewerId: string,
    reviewerName: string,
    notes: string
  ): Promise<ExpenseRequest> {
    const { data: current } = await budgetSchema()
      .from("expense_requests")
      .select("status")
      .eq("id", expenseId)
      .single();

    const previousStatus = current?.status as ExpenseStatus;

    const { data, error } = await budgetSchema()
      .from("expense_requests")
      .update({
        status: "leader_denied",
        leader_reviewer_id: reviewerId,
        leader_reviewed_at: new Date().toISOString(),
        leader_notes: notes,
        updated_at: new Date().toISOString(),
      })
      .eq("id", expenseId)
      .select()
      .single();

    if (error) throw error;

    await this.addHistory({
      expense_request_id: expenseId,
      action: "leader_denied",
      previous_status: previousStatus,
      new_status: "leader_denied",
      actor_id: reviewerId,
      actor_name: reviewerName,
      notes,
    });

    return data;
  },

  /**
   * Treasury approves payment
   */
  async treasuryApprove(
    expenseId: string,
    reviewerId: string,
    reviewerName: string,
    notes?: string
  ): Promise<ExpenseRequest> {
    const { data: current } = await budgetSchema()
      .from("expense_requests")
      .select("status")
      .eq("id", expenseId)
      .single();

    const previousStatus = current?.status as ExpenseStatus;

    const { data, error } = await budgetSchema()
      .from("expense_requests")
      .update({
        status: "treasury_approved",
        treasury_reviewer_id: reviewerId,
        treasury_reviewed_at: new Date().toISOString(),
        treasury_notes: notes,
        updated_at: new Date().toISOString(),
      })
      .eq("id", expenseId)
      .select()
      .single();

    if (error) throw error;

    await this.addHistory({
      expense_request_id: expenseId,
      action: "treasury_approved",
      previous_status: previousStatus,
      new_status: "treasury_approved",
      actor_id: reviewerId,
      actor_name: reviewerName,
      notes: notes || "Payment approved by treasury",
    });

    return data;
  },

  /**
   * Treasury denies payment
   */
  async treasuryDeny(
    expenseId: string,
    reviewerId: string,
    reviewerName: string,
    notes: string
  ): Promise<ExpenseRequest> {
    const { data: current } = await budgetSchema()
      .from("expense_requests")
      .select("status")
      .eq("id", expenseId)
      .single();

    const previousStatus = current?.status as ExpenseStatus;

    const { data, error } = await budgetSchema()
      .from("expense_requests")
      .update({
        status: "treasury_denied",
        treasury_reviewer_id: reviewerId,
        treasury_reviewed_at: new Date().toISOString(),
        treasury_notes: notes,
        updated_at: new Date().toISOString(),
      })
      .eq("id", expenseId)
      .select()
      .single();

    if (error) throw error;

    await this.addHistory({
      expense_request_id: expenseId,
      action: "treasury_denied",
      previous_status: previousStatus,
      new_status: "treasury_denied",
      actor_id: reviewerId,
      actor_name: reviewerName,
      notes,
    });

    return data;
  },

  /**
   * Finance processes payment
   */
  async financeProcess(
    expenseId: string,
    processorId: string,
    processorName: string,
    paymentReference: string,
    notes?: string
  ): Promise<ExpenseRequest> {
    const { data: current } = await budgetSchema()
      .from("expense_requests")
      .select("status")
      .eq("id", expenseId)
      .single();

    const previousStatus = current?.status as ExpenseStatus;

    const { data, error } = await budgetSchema()
      .from("expense_requests")
      .update({
        status: "completed",
        finance_processor_id: processorId,
        finance_processed_at: new Date().toISOString(),
        finance_notes: notes,
        payment_reference: paymentReference,
        updated_at: new Date().toISOString(),
      })
      .eq("id", expenseId)
      .select()
      .single();

    if (error) throw error;

    await this.addHistory({
      expense_request_id: expenseId,
      action: "completed",
      previous_status: previousStatus,
      new_status: "completed",
      actor_id: processorId,
      actor_name: processorName,
      notes: `Payment processed. Reference: ${paymentReference}${
        notes ? `. ${notes}` : ""
      }`,
    });

    return data;
  },

  /**
   * Cancel an expense request
   */
  async cancel(
    expenseId: string,
    actorId: string,
    actorName: string,
    reason: string
  ): Promise<ExpenseRequest> {
    const { data: current } = await budgetSchema()
      .from("expense_requests")
      .select("status")
      .eq("id", expenseId)
      .single();

    const previousStatus = current?.status as ExpenseStatus;

    const { data, error } = await budgetSchema()
      .from("expense_requests")
      .update({
        status: "cancelled",
        updated_at: new Date().toISOString(),
      })
      .eq("id", expenseId)
      .select()
      .single();

    if (error) throw error;

    await this.addHistory({
      expense_request_id: expenseId,
      action: "cancelled",
      previous_status: previousStatus,
      new_status: "cancelled",
      actor_id: actorId,
      actor_name: actorName,
      notes: reason,
    });

    return data;
  },

  /**
   * Add history entry
   */
  async addHistory(historyData: ExpenseHistoryInsert): Promise<ExpenseHistory> {
    const { data, error } = await budgetSchema()
      .from("expense_history")
      .insert(historyData)
      .select()
      .single();

    if (error) throw error;
    return data;
  },

  /**
   * Get expense history
   */
  async getHistory(expenseId: string): Promise<ExpenseHistoryWithActor[]> {
    const { data, error } = await budgetSchema()
      .from("expense_history")
      .select("*")
      .eq("expense_request_id", expenseId)
      .order("created_at", { ascending: false });

    if (error) throw error;
    if (!data || data.length === 0) return [];

    // Collect unique actor IDs and batch fetch profiles
    const actorIds = [
      ...new Set(
        data.map((h) => h.actor_id).filter((id): id is string => !!id)
      ),
    ];

    const profilesMap: Record<string, { id: string; full_name: string }> = {};

    if (actorIds.length > 0) {
      const { data: profiles } = await supabase
        .from("profiles")
        .select("id, full_name")
        .in("id", actorIds);

      if (profiles) {
        for (const profile of profiles) {
          profilesMap[profile.id] = profile;
        }
      }
    }

    return data.map((history) => ({
      ...history,
      actor_profile: history.actor_id
        ? profilesMap[history.actor_id] || null
        : null,
    }));
  },

  /**
   * Get expense statistics for dashboard
   */
  async getStatistics(
    organizationId: string,
    fiscalYearId?: string
  ): Promise<{
    total_requests: number;
    pending_requests: number;
    approved_requests: number;
    completed_requests: number;
    denied_requests: number;
    total_amount_pending: number;
    total_amount_approved: number;
    total_amount_completed: number;
  }> {
    let query = budgetSchema()
      .from("expense_requests")
      .select("status, amount")
      .eq("organization_id", organizationId);

    if (fiscalYearId) {
      query = query.eq("fiscal_year_id", fiscalYearId);
    }

    const { data, error } = await query;
    if (error) throw error;

    const stats = (data || []).reduce(
      (acc, exp) => {
        const amount = Number(exp.amount);
        acc.total_requests++;

        if (
          ["pending_leader", "leader_approved", "pending_treasury"].includes(
            exp.status
          )
        ) {
          acc.pending_requests++;
          acc.total_amount_pending += amount;
        } else if (
          ["treasury_approved", "pending_finance"].includes(exp.status)
        ) {
          acc.approved_requests++;
          acc.total_amount_approved += amount;
        } else if (exp.status === "completed") {
          acc.completed_requests++;
          acc.total_amount_completed += amount;
        } else if (["leader_denied", "treasury_denied"].includes(exp.status)) {
          acc.denied_requests++;
        }

        return acc;
      },
      {
        total_requests: 0,
        pending_requests: 0,
        approved_requests: 0,
        completed_requests: 0,
        denied_requests: 0,
        total_amount_pending: 0,
        total_amount_approved: 0,
        total_amount_completed: 0,
      }
    );

    return stats;
  },
};
