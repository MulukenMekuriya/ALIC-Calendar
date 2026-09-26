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
 * Move a request to the Board, or bring it back.
 *
 * Both directions write a history row, because "who sent the Youth request to
 * the Board, and when" is exactly the question asked three weeks later when
 * nobody remembers.
 */
export function useMoveToBoardReview() {
  const queryClient = useQueryClient();

  return useMutation({
    mutationFn: async ({
      requestIds,
      direction,
      actorId,
      actorName,
      notes,
    }: {
      requestIds: string[];
      direction: "to_board" | "back_to_office";
      actorId: string;
      actorName: string;
      notes?: string;
    }) => {
      if (requestIds.length === 0) return [];

      const from: AllocationRequestStatus =
        direction === "to_board" ? "pending" : "board_review";
      const to: AllocationRequestStatus =
        direction === "to_board" ? "board_review" : "pending";

      // Only requests still at the expected step move. Sending the whole year
      // to the Board must not drag an already-approved ministry backwards.
      const { data, error } = await supabase
        .schema("budget")
        .from("allocation_requests")
        .update({ status: to })
        .in("id", requestIds)
        .eq("status", from)
        .select();

      if (error) throw error;

      const moved = (data || []) as unknown as AllocationRequest[];

      if (moved.length > 0) {
        const { error: historyError } = await supabase
          .schema("budget")
          .from("allocation_request_history")
          .insert(
            moved.map((request) => ({
              request_id: request.id,
              action: direction === "to_board" ? "sent_to_board_review" : "returned_from_board_review",
              actor_id: actorId,
              actor_name: actorName,
              old_status: from,
              new_status: to,
              notes: notes || null,
            })),
          );

        if (historyError) console.error("History insert error:", historyError);
      }

      return moved;
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: [ALLOCATION_REQUESTS_KEY] });
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
