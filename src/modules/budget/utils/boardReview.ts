/**
 * The budget year, read as one table.
 *
 * The Board does not review a request; it reviews the year. Its question is
 * always "what does all of this add up to, against what we have" — which is
 * why the useful unit here is the whole fiscal year with every ministry's
 * request beside every other one, and why the totals matter as much as the
 * rows.
 */

import type {
  AllocationBoardFeedback,
  AllocationRequestStatus,
  AllocationRequestWithRelations,
} from "../types";

/** The statuses that are actually part of this year's decision. */
export const IN_THE_YEAR: AllocationRequestStatus[] = [
  "pending",
  "under_review",
  "conditionally_approved",
  "board_review",
  "approved",
  "partially_approved",
];

export interface BoardReviewRow {
  request: AllocationRequestWithRelations;
  feedback: AllocationBoardFeedback[];
  /**
   * What the Board would spend on this ministry: the average of the figures
   * board members put forward, or null if none of them named one.
   *
   * An average rather than a vote because the Board advises — the office makes
   * the call, and it is better served by the middle of the room's opinion plus
   * every individual figure underneath it than by a number that pretends to be
   * a decision.
   */
  recommendedAverage: number | null;
  /** The spread, when board members disagree. Null when nobody named a figure. */
  recommendedRange: { low: number; high: number } | null;
  /** What this ministry would get if nobody changed anything today. */
  standingAmount: number;
}

export interface BoardReviewSummary {
  rows: BoardReviewRow[];
  totalRequested: number;
  /** Requested, except where the Board named a figure. */
  totalRecommended: number;
  /** Recommended minus requested: negative is a cut. */
  difference: number;
  withTheBoard: number;
  awaitingTheOffice: number;
  decided: number;
  requestsWithFeedback: number;
  boardMembersHeardFrom: number;
}

const round2 = (value: number) => Math.round(value * 100) / 100;

/** The columns a board sheet can be read in order of. */
export type BoardSortKey = "ministry" | "requested" | "board" | "status";

export type SortDirection = "asc" | "desc";

/** Workflow order, so sorting by status reads the way the year runs. */
const STATUS_ORDER: Record<string, number> = {
  pending: 0,
  under_review: 1,
  conditionally_approved: 2,
  board_review: 3,
  partially_approved: 4,
  approved: 5,
};

/**
 * Put a branch's rows in the order somebody asked for.
 *
 * Defaults to the largest ask first, because that is how a board reads a
 * budget: the four requests that decide the year are at the top, and the
 * £200 ones can wait. Ties break on ministry name so the order is stable
 * between renders rather than shuffling as feedback arrives.
 */
export const sortBoardRows = (
  rows: BoardReviewRow[],
  key: BoardSortKey = "requested",
  direction: SortDirection = "desc",
): BoardReviewRow[] => {
  const name = (row: BoardReviewRow) =>
    (row.request.ministry?.name || "").toLowerCase();

  const value = (row: BoardReviewRow): number | string => {
    switch (key) {
      case "ministry":
        return name(row);
      case "requested":
        return Number(row.request.requested_amount || 0);
      case "board":
        // A request nobody has put a figure on sorts as what it asked for,
        // which is what it would cost if the Board said nothing.
        return row.recommendedAverage ?? Number(row.request.requested_amount || 0);
      case "status":
        return STATUS_ORDER[row.request.status] ?? 99;
    }
  };

  const flip = direction === "asc" ? 1 : -1;

  return [...rows].sort((a, b) => {
    const left = value(a);
    const right = value(b);

    if (left < right) return -1 * flip;
    if (left > right) return 1 * flip;

    return name(a).localeCompare(name(b));
  });
};

export interface BoardReviewBranch {
  organizationId: string;
  organizationName: string;
  rows: BoardReviewRow[];
  totalRequested: number;
  totalRecommended: number;
}

/**
 * The same rows, split into the branches they belong to.
 *
 * The Board is given one pot and two churches to spend it on, so it reads the
 * year branch by branch and then adds them up. Branches come back in the order
 * the caller named them, so MD does not swap places with VA between renders.
 */
export const splitByBranch = (
  rows: BoardReviewRow[],
  branches: Array<{ id: string; name: string }>,
): BoardReviewBranch[] =>
  branches
    .map(({ id, name }) => {
      const mine = rows.filter((row) => row.request.organization_id === id);

      return {
        organizationId: id,
        organizationName: name,
        rows: mine,
        totalRequested: round2(
          mine.reduce((sum, row) => sum + Number(row.request.requested_amount || 0), 0),
        ),
        totalRecommended: round2(
          mine.reduce(
            (sum, row) =>
              sum + (row.recommendedAverage ?? Number(row.request.requested_amount || 0)),
            0,
          ),
        ),
      };
    })
    // A branch with nothing in it this year is noise on the sheet.
    .filter((branch) => branch.rows.length > 0);

/**
 * What a request is worth today: the approved figure once there is one, the
 * requested figure until then. A partially approved request is worth what it
 * was cut to, not what it asked for.
 */
export const standingAmount = (request: AllocationRequestWithRelations): number =>
  request.approved_amount !== null && request.approved_amount !== undefined
    ? Number(request.approved_amount)
    : Number(request.requested_amount || 0);

export const summariseBoardReview = (
  requests: AllocationRequestWithRelations[] | undefined,
  feedback: AllocationBoardFeedback[] | undefined,
): BoardReviewSummary => {
  const inTheYear = (requests || []).filter((request) =>
    IN_THE_YEAR.includes(request.status),
  );

  const byRequest = new Map<string, AllocationBoardFeedback[]>();
  (feedback || []).forEach((note) => {
    byRequest.set(note.request_id, [...(byRequest.get(note.request_id) || []), note]);
  });

  const rows: BoardReviewRow[] = inTheYear.map((request) => {
    const notes = byRequest.get(request.id) || [];
    const amounts = notes
      .map((note) => note.recommended_amount)
      .filter((amount): amount is number => amount !== null && amount !== undefined)
      .map(Number);

    const recommendedAverage =
      amounts.length > 0
        ? round2(amounts.reduce((sum, amount) => sum + amount, 0) / amounts.length)
        : null;

    return {
      request,
      feedback: notes,
      recommendedAverage,
      recommendedRange:
        amounts.length > 0
          ? { low: Math.min(...amounts), high: Math.max(...amounts) }
          : null,
      standingAmount: standingAmount(request),
    };
  });

  const totalRequested = round2(
    rows.reduce((sum, row) => sum + Number(row.request.requested_amount || 0), 0),
  );

  // Where the Board has not spoken, the request stands as asked — otherwise a
  // half-reviewed year would total up as though the silent ministries wanted
  // nothing.
  const totalRecommended = round2(
    rows.reduce(
      (sum, row) =>
        sum + (row.recommendedAverage ?? Number(row.request.requested_amount || 0)),
      0,
    ),
  );

  const boardMembers = new Set(
    (feedback || [])
      .filter((note) => rows.some((row) => row.request.id === note.request_id))
      .map((note) => note.board_member_id),
  );

  return {
    rows,
    totalRequested,
    totalRecommended,
    difference: round2(totalRecommended - totalRequested),
    withTheBoard: rows.filter((row) => row.request.status === "board_review").length,
    // Still with the Leadership Council, conditional approval included.
    awaitingTheOffice: rows.filter((row) =>
      ["pending", "under_review", "conditionally_approved"].includes(row.request.status),
    ).length,
    decided: rows.filter(
      (row) =>
        row.request.status === "approved" ||
        row.request.status === "partially_approved",
    ).length,
    requestsWithFeedback: rows.filter((row) => row.feedback.length > 0).length,
    boardMembersHeardFrom: boardMembers.size,
  };
};
