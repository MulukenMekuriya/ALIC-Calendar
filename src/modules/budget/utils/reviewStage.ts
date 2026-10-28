/**
 * Where a budget request is in the review, and what each person may do to it.
 *
 * The review runs: local leaders' preliminary review, the Board's preliminary
 * review, the local leaders' updated review, the Board's final review and
 * approval. No status exists for those; they come from the status plus
 * board_round (how many times the branch's admins have sent it to the Board).
 *
 * Everything the review screens show or enable is decided here, from the
 * viewer's role in the request's own branch. A user who is Board in one
 * branch and admin in another gets the right buttons on each row.
 */

import type { AllocationRequestStatus } from "../types";

export type ReviewStage =
  | "leaders_preliminary"
  | "board_preliminary"
  | "leaders_updated"
  | "board_final"
  | "approved"
  | "denied"
  | "closed";

export type ReviewRole = "admin" | "board" | "other";

/** The slice of a request this needs. */
export interface ReviewSubject {
  status: AllocationRequestStatus | string;
  board_round?: number | null;
  period_type?: string;
}

const WITH_LEADERS = ["pending", "under_review", "conditionally_approved"];

export function getReviewStage(request: ReviewSubject): ReviewStage {
  const round = request.board_round ?? 0;
  const { status } = request;

  if (WITH_LEADERS.includes(status)) return round >= 1 ? "leaders_updated" : "leaders_preliminary";
  if (status === "board_review") return round >= 2 ? "board_final" : "board_preliminary";
  if (status === "approved" || status === "partially_approved") return "approved";
  if (status === "denied") return "denied";
  return "closed";
}

export const STAGE_LABEL: Record<ReviewStage, string> = {
  leaders_preliminary: "Local leaders: preliminary review",
  board_preliminary: "Board: preliminary review",
  leaders_updated: "Local leaders: updated review",
  board_final: "Board: final review",
  approved: "Final approval",
  denied: "Denied",
  closed: "Not in review",
};

export interface RowPermissions {
  /** Click a month, change figures. */
  canEdit: boolean;
  /** "Approve for Board": conditional approval by the local leaders. */
  canApproveForBoard: boolean;
  canDeny: boolean;
  /** Tick the row for "Send for Board Review". */
  canSend: boolean;
  /** Tick the row for the Board's "Send back" / "Final approval". */
  canBoardDecide: boolean;
  /** Type a Recommended amount and Comment. */
  canGiveFeedback: boolean;
}

const NONE: RowPermissions = {
  canEdit: false,
  canApproveForBoard: false,
  canDeny: false,
  canSend: false,
  canBoardDecide: false,
  canGiveFeedback: false,
};

export function getRowPermissions(request: ReviewSubject, role: ReviewRole): RowPermissions {
  const { status } = request;

  if (role === "admin") {
    const open = WITH_LEADERS.includes(status);
    return {
      ...NONE,
      canEdit: open && request.period_type !== "annual",
      canApproveForBoard: status === "pending" || status === "under_review",
      canDeny: open,
      canSend: status === "conditionally_approved",
    };
  }

  if (role === "board" && status === "board_review") {
    return { ...NONE, canBoardDecide: true, canGiveFeedback: true };
  }

  return NONE;
}

/** What the Board may see: only requests that have been sent to it, and what came of them. */
export const BOARD_VISIBLE_STATUSES = ["board_review", "approved", "partially_approved", "denied"];

export const isVisibleToBoard = (request: ReviewSubject) =>
  BOARD_VISIBLE_STATUSES.includes(request.status);
