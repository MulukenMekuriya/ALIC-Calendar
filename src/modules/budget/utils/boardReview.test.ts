import { describe, it, expect } from "vitest";
import {
  sortBoardRows,
  splitByBranch,
  summariseBoardReview,
  standingAmount,
} from "./boardReview";
import type {
  AllocationBoardFeedback,
  AllocationRequestStatus,
  AllocationRequestWithRelations,
} from "../types";

const request = (
  id: string,
  ministry: string,
  requested: number,
  status: AllocationRequestStatus,
  approved: number | null = null,
) =>
  ({
    id,
    ministry_id: `m-${id}`,
    ministry: { id: `m-${id}`, name: ministry },
    requested_amount: requested,
    approved_amount: approved,
    status,
    requester_name: "A Leader",
  }) as unknown as AllocationRequestWithRelations;

const note = (
  requestId: string,
  member: string,
  amount: number | null,
  comment: string | null = null,
) =>
  ({
    id: `${requestId}-${member}`,
    request_id: requestId,
    organization_id: "org",
    board_member_id: member,
    board_member_name: member,
    recommended_amount: amount,
    comment,
  }) as unknown as AllocationBoardFeedback;

describe("summariseBoardReview", () => {
  const year = [
    request("youth", "Youth", 10000, "board_review"),
    request("worship", "Worship", 6000, "board_review"),
    request("prayer", "Prayer", 2000, "pending"),
    request("media", "Media", 5000, "approved", 4000),
    request("old", "Withdrawn", 9999, "cancelled"),
    request("said-no", "Denied", 8888, "denied"),
  ];

  it("leaves out the requests that are not part of the decision", () => {
    const summary = summariseBoardReview(year, []);
    expect(summary.rows.map((row) => row.request.id)).toEqual([
      "youth",
      "worship",
      "prayer",
      "media",
    ]);
  });

  it("counts where the year has got to", () => {
    const summary = summariseBoardReview(year, []);
    expect(summary.withTheBoard).toBe(2);
    expect(summary.awaitingTheOffice).toBe(1);
    expect(summary.decided).toBe(1);
  });

  it("averages the figures the Board put forward, and keeps the spread", () => {
    const summary = summariseBoardReview(year, [
      note("youth", "abel", 8000),
      note("youth", "sara", 7000),
      note("youth", "daniel", null, "Ask them to re-plan the retreat"),
    ]);

    const youth = summary.rows.find((row) => row.request.id === "youth");
    expect(youth?.recommendedAverage).toBe(7500);
    expect(youth?.recommendedRange).toEqual({ low: 7000, high: 8000 });
    expect(youth?.feedback).toHaveLength(3);
  });

  it("says nothing rather than zero when the Board only commented", () => {
    const summary = summariseBoardReview(year, [
      note("worship", "abel", null, "Fine as it stands"),
    ]);

    const worship = summary.rows.find((row) => row.request.id === "worship");
    expect(worship?.recommendedAverage).toBeNull();
    expect(worship?.recommendedRange).toBeNull();
  });

  it("totals the year, holding un-reviewed requests at what they asked for", () => {
    // Without that, a year the Board is halfway through would total up as
    // though the ministries it had not reached wanted nothing.
    const summary = summariseBoardReview(year, [note("youth", "abel", 8000)]);

    expect(summary.totalRequested).toBe(23000); // 10000 + 6000 + 2000 + 5000
    expect(summary.totalRecommended).toBe(21000); // youth cut to 8000
    expect(summary.difference).toBe(-2000);
  });

  it("counts how much of the Board has been heard from", () => {
    const summary = summariseBoardReview(year, [
      note("youth", "abel", 8000),
      note("worship", "abel", 6000),
      note("worship", "sara", 5500),
      // A note on a request that is not part of this year's decision does not
      // make its author heard from.
      note("old", "daniel", 1),
    ]);

    expect(summary.requestsWithFeedback).toBe(2);
    expect(summary.boardMembersHeardFrom).toBe(2);
  });

  it("does not round a fraction of a cent into the totals", () => {
    const summary = summariseBoardReview(
      [request("a", "A", 1000, "board_review")],
      [note("a", "one", 100), note("a", "two", 100), note("a", "three", 101)],
    );

    expect(summary.rows[0].recommendedAverage).toBe(100.33);
    expect(summary.totalRecommended).toBe(100.33);
  });
});

describe("standingAmount", () => {
  it("is what was approved once something has been", () => {
    expect(standingAmount(request("a", "A", 5000, "partially_approved", 3200))).toBe(3200);
  });

  it("is what was asked for until then", () => {
    expect(standingAmount(request("b", "B", 5000, "board_review"))).toBe(5000);
  });

  it("reads an approval of zero as a decision, not as missing", () => {
    expect(standingAmount(request("c", "C", 5000, "partially_approved", 0))).toBe(0);
  });
});

describe("splitByBranch", () => {
  const acrossBranches = [
    { ...request("youth-md", "Youth", 10000, "board_review"), organization_id: "md" },
    { ...request("prayer-md", "Prayer", 2000, "board_review"), organization_id: "md" },
    { ...request("youth-va", "Youth", 4000, "board_review"), organization_id: "va" },
  ] as unknown as AllocationRequestWithRelations[];

  const branches = [
    { id: "md", name: "ALIC MD - Silver Spring" },
    { id: "va", name: "ALIC VA - Springfield" },
  ];

  it("keeps each branch's requests and subtotal apart", () => {
    const { rows } = summariseBoardReview(acrossBranches, []);
    const split = splitByBranch(rows, branches);

    expect(split.map((branch) => branch.organizationName)).toEqual([
      "ALIC MD - Silver Spring",
      "ALIC VA - Springfield",
    ]);
    expect(split[0].totalRequested).toBe(12000);
    expect(split[1].totalRequested).toBe(4000);
  });

  it("carries the Board's figures into the branch subtotal", () => {
    const { rows } = summariseBoardReview(acrossBranches, [note("youth-md", "abel", 7000)]);
    const split = splitByBranch(rows, branches);

    expect(split[0].totalRecommended).toBe(9000); // 7000 + prayer still at 2000
    expect(split[1].totalRecommended).toBe(4000);
  });

  it("leaves out a branch with nothing in the year", () => {
    const { rows } = summariseBoardReview(
      acrossBranches.filter((r) => r.organization_id === "md"),
      [],
    );

    expect(splitByBranch(rows, branches).map((b) => b.organizationId)).toEqual(["md"]);
  });
});

describe("sortBoardRows", () => {
  const rows = summariseBoardReview(
    [
      request("small", "Media", 500, "approved", 400),
      request("big", "Youth", 20000, "pending"),
      request("middle", "Worship", 6000, "board_review"),
      request("also-6000", "Anniversary", 6000, "board_review"),
    ],
    [note("big", "abel", 1000)],
  ).rows;

  const names = (sorted: typeof rows) => sorted.map((row) => row.request.ministry?.name);

  it("puts the biggest ask first by default", () => {
    expect(names(sortBoardRows(rows))).toEqual([
      "Youth",
      "Anniversary",
      "Worship",
      "Media",
    ]);
  });

  it("breaks ties on ministry name, so the order does not shuffle", () => {
    // Anniversary and Worship both asked for 6000.
    expect(names(sortBoardRows(rows)).slice(1, 3)).toEqual(["Anniversary", "Worship"]);
    expect(names(sortBoardRows(rows, "requested", "asc")).slice(1, 3)).toEqual([
      "Anniversary",
      "Worship",
    ]);
  });

  it("sorts by ministry name both ways", () => {
    expect(names(sortBoardRows(rows, "ministry", "asc"))).toEqual([
      "Anniversary",
      "Media",
      "Worship",
      "Youth",
    ]);
    expect(names(sortBoardRows(rows, "ministry", "desc"))[0]).toBe("Youth");
  });

  it("sorts by what the Board would spend, not by what was asked", () => {
    // Youth asked 20000 and the Board said 1000, so it goes to the bottom.
    expect(names(sortBoardRows(rows, "board", "desc"))).toEqual([
      "Anniversary",
      "Worship",
      "Youth",
      "Media",
    ]);
  });

  it("sorts by status in workflow order, not alphabetically", () => {
    expect(names(sortBoardRows(rows, "status", "asc"))).toEqual([
      "Youth", // pending
      "Anniversary", // board_review
      "Worship", // board_review
      "Media", // approved
    ]);
  });

  it("does not mutate what it was given", () => {
    const before = names(rows);
    sortBoardRows(rows, "ministry", "asc");
    expect(names(rows)).toEqual(before);
  });
});
