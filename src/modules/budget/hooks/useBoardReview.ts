/**
 * The Board's step in the budget year.
 *
 * The year runs: a ministry submits, the office reads and adjusts, the Board
 * sees every ministry's request together against the money the church has,
 * says what it thinks, and only then does the office make its final edit and
 * approve. These are the two moves that middle step needs — putting requests
 * in front of the Board, and recording what came back.
 *
 * Approval is deliberately not here. The Board advises; the office decides,
 * through the approve/deny hooks that were already in useAllocationRequests.
 */

import { useQuery, useMutation, useQueryClient } from "@tanstack/react-query";
import { supabase } from "@/integrations/supabase/client";
import type {
  AllocationBoardFeedback,
  AllocationRequest,
  AllocationRequestStatus,
  AllocationRequestWithRelations,
} from "../types";

const ALLOCATION_REQUESTS_KEY = "allocation-requests";
const BOARD_FEEDBACK_KEY = "allocation-board-feedback";

/**
 * The budget year across every branch the viewer belongs to.
 *
 * The Board reviews the church's budget, not a branch's: MD and VA are weighed
 * against one pot, which is what "in consideration of the overall VA/MD
 * budget" means. budget.fiscal_years is a row PER BRANCH, so the year is a
 * number here — 2027 — resolved to one fiscal year id in each branch.
 *
 * A viewer who belongs to one branch gets one branch back, which is the right
 * answer for the office and needs no separate code path.
 */
export function useAllocationRequestsAcrossBranches(
  year?: number,
  organizationIds?: string[],
) {
  const orgKey = [...(organizationIds || [])].sort().join(",");

  return useQuery({
    queryKey: [ALLOCATION_REQUESTS_KEY, "across-branches", year, orgKey],
    queryFn: async () => {
      if (!year || !organizationIds || organizationIds.length === 0) return [];

      const { data: years, error: yearsError } = await supabase
        .schema("budget")
        .from("fiscal_years")
        .select("id")
        .eq("year", year)
        .in("organization_id", organizationIds);

      if (yearsError) throw yearsError;
      if (!years || years.length === 0) return [];

      const { data, error } = await supabase
        .schema("budget")
        .from("allocation_requests")
        .select(
          `
          *,
          ministry:ministries(*),
          fiscal_year:fiscal_years(*)
        `,
        )
        .in(
          "fiscal_year_id",
          years.map((fiscalYear) => fiscalYear.id),
        )
        .order("created_at", { ascending: false });

      if (error) throw error;

      return (data || []) as unknown as AllocationRequestWithRelations[];
    },
    enabled: !!year && !!organizationIds && organizationIds.length > 0,
  });
}

/**
 * Every board member's line, for the branches the viewer can see.
 *
 * Fetched per branch rather than per request because the screen shows the year
 * as one table: one query for the page beats one per row, and a board is a
 * handful of people leaving a handful of notes. Rows for other years are
 * harmless — the summary matches them up by request and ignores the rest.
 *
 * Row-level security answers this with nothing at all for a ministry leader,
 * which is intended: the Board is weighing their request against everybody
 * else's, and that conversation is not addressed to them.
 */
export function useBoardFeedback(organizationIds?: string[]) {
  const orgKey = [...(organizationIds || [])].sort().join(",");

  return useQuery({
    queryKey: [BOARD_FEEDBACK_KEY, orgKey],
    queryFn: async () => {
      if (!organizationIds || organizationIds.length === 0) return [];

      const { data, error } = await supabase
        .schema("budget")
        .from("allocation_board_feedback")
        .select("*")
        .in("organization_id", organizationIds)
        .order("created_at", { ascending: true });

      if (error) throw error;

      return (data || []) as AllocationBoardFeedback[];
    },
    enabled: !!organizationIds && organizationIds.length > 0,
  });
}

/**
 * The Leadership Council's step on one request (the branch's admins):
 * 'review' (Submitted -> Under Review), 'conditional' (-> Conditionally
 * Approved) or 'deny'. budget.council_decide refuses a request that is not at
 * the step before, and writes the history row itself.
 */
export function useCouncilDecision() {
  const queryClient = useQueryClient();

  return useMutation({
    mutationFn: async ({
      requestId,
      decision,
      notes,
    }: {
      requestId: string;
      decision: "review" | "conditional" | "deny";
      notes?: string | null;
    }) => {
      const { data, error } = await supabase
        .schema("budget")
        .rpc("council_decide", {
          _request_id: requestId,
          _decision: decision,
          _notes: notes ?? null,
        });

      if (error) throw error;
      return data as unknown as AllocationRequest;
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: [ALLOCATION_REQUESTS_KEY] });
    },
  });
}

/**
 * Send conditionally approved requests to the Board, one or the whole year.
 *
 * Returns how many moved: a request that is no longer conditionally approved
 * is skipped, not failed. board@alic.org gets one email for the batch.
 */
export function useSendToBoard() {
  const queryClient = useQueryClient();

  return useMutation({
    mutationFn: async (requestIds: string[]) => {
      if (requestIds.length === 0) return 0;

      const { data, error } = await supabase
        .schema("budget")
        .rpc("send_to_board", { _request_ids: requestIds });

      if (error) throw error;
      return (data as number) ?? 0;
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: [ALLOCATION_REQUESTS_KEY] });
    },
  });
}

/**
 * The Board's decision on one request: 'approve' (final approval, which
 * credits the ministry's budget), 'return' (back to the Council) or 'deny'.
 * An admin of the branch may act for the Board.
 */
export function useBoardDecision() {
  const queryClient = useQueryClient();

  return useMutation({
    mutationFn: async ({
      requestId,
      decision,
      approvedAmount,
      notes,
    }: {
      requestId: string;
      decision: "approve" | "return" | "deny";
      approvedAmount?: number | null;
      notes?: string | null;
    }) => {
      const { data, error } = await supabase
        .schema("budget")
        .rpc("board_decide", {
          _request_id: requestId,
          _decision: decision,
          _approved_amount: approvedAmount ?? null,
          _notes: notes ?? null,
        });

      if (error) throw error;
      return data as unknown as AllocationRequest;
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: [ALLOCATION_REQUESTS_KEY] });
      queryClient.invalidateQueries({ queryKey: ["budget-allocations"] });
      queryClient.invalidateQueries({ queryKey: ["budget-summary"] });
    },
  });
}

/**
 * One board member's answer, written or revised.
 *
 * Upsert on (request_id, board_member_id): a board member who changes their
 * mind replaces their own line rather than adding a second one, and nobody
 * else's is touched.
 */
export function useSaveBoardFeedback() {
  const queryClient = useQueryClient();

  return useMutation({
    mutationFn: async ({
      requestId,
      organizationId,
      boardMemberId,
      boardMemberName,
      recommendedAmount,
      comment,
    }: {
      requestId: string;
      organizationId: string;
      boardMemberId: string;
      boardMemberName: string;
      recommendedAmount: number | null;
      comment: string | null;
    }) => {
      const { data, error } = await supabase
        .schema("budget")
        .from("allocation_board_feedback")
        .upsert(
          {
            request_id: requestId,
            organization_id: organizationId,
            board_member_id: boardMemberId,
            board_member_name: boardMemberName,
            recommended_amount: recommendedAmount,
            comment: comment,
          },
          { onConflict: "request_id,board_member_id" },
        )
        .select()
        .single();

      if (error) throw error;

      return data as AllocationBoardFeedback;
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: [BOARD_FEEDBACK_KEY] });
    },
  });
}

export function useDeleteBoardFeedback() {
  const queryClient = useQueryClient();

  return useMutation({
    mutationFn: async (feedbackId: string) => {
      const { data, error } = await supabase
        .schema("budget")
        .from("allocation_board_feedback")
        .delete()
        .eq("id", feedbackId)
        .select("id");

      if (error) throw error;

      // The policies refuse by matching nothing rather than by erroring.
      if (!data || data.length === 0) {
        throw new Error("That note could not be withdrawn. It may not be yours.");
      }

      return feedbackId;
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: [BOARD_FEEDBACK_KEY] });
    },
  });
}

export interface BulkDecisionResult {
  moved: number;
  skipped: { id: string; reason: string }[];
}

/**
 * The Board's bulk "Final approval" / "Send back to local leaders".
 *
 * Final approval approves exactly the requested amounts. A request that is no
 * longer with the Board is skipped with a reason and the rest go ahead.
 */
export function useBoardDecideMany() {
  const queryClient = useQueryClient();

  return useMutation({
    mutationFn: async ({
      requestIds,
      decision,
      notes,
    }: {
      requestIds: string[];
      decision: "approve" | "return";
      notes?: string | null;
    }) => {
      const { data, error } = await supabase
        .schema("budget")
        .rpc("board_decide_many", {
          _request_ids: requestIds,
          _decision: decision,
          _notes: notes ?? undefined,
        });

      if (error) throw error;
      return data as unknown as BulkDecisionResult;
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: [ALLOCATION_REQUESTS_KEY] });
      queryClient.invalidateQueries({ queryKey: [BOARD_FEEDBACK_KEY] });
      queryClient.invalidateQueries({ queryKey: ["budget-allocations"] });
      queryClient.invalidateQueries({ queryKey: ["budget-summary"] });
      queryClient.invalidateQueries({ queryKey: ["ministry-budget-summary"] });
    },
  });
}

/**
 * A local leader changes one month of a request. `amounts` names lines by
 * their position in budget_breakdown. `expectedUpdatedAt` is the updated_at
 * the screen was drawn from; if the request has changed since, the database
 * refuses rather than overwriting the other change.
 */
export function useEditRequestMonth() {
  const queryClient = useQueryClient();

  return useMutation({
    mutationFn: async ({
      requestId,
      month,
      amounts,
      expectedUpdatedAt,
    }: {
      requestId: string;
      month: string;
      amounts: { index: number; amount: number }[];
      expectedUpdatedAt?: string | null;
    }) => {
      const { data, error } = await supabase
        .schema("budget")
        .rpc("edit_request_month", {
          _request_id: requestId,
          _month: month,
          _amounts: amounts,
          _expected_updated_at: expectedUpdatedAt ?? undefined,
        });

      if (error) throw error;
      return data as unknown as AllocationRequest;
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: [ALLOCATION_REQUESTS_KEY] });
    },
  });
}

export interface MinistryBudgetTotals {
  organization_id: string;
  organization_name: string;
  ministry_id: string;
  ministry_name: string;
  approved: number;
  spent: number;
}

/**
 * Approved budget against what has been paid, by ministry, for every branch
 * the viewer works in. Totals only: the Board cannot read other people's
 * expenses, and does not need to.
 */
export function useMinistryTotals(year?: number) {
  return useQuery({
    queryKey: ["ministry-budget-summary", year],
    queryFn: async () => {
      const { data, error } = await supabase
        .schema("budget")
        .rpc("ministry_budget_summary", { _year: year as number });

      if (error) throw error;
      return ((data ?? []) as MinistryBudgetTotals[]).map((r) => ({
        ...r,
        approved: Number(r.approved) || 0,
        spent: Number(r.spent) || 0,
      }));
    },
    enabled: !!year,
  });
}
