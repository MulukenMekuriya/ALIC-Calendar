import { describe, it, expect } from "vitest";
import { getReviewStage, getRowPermissions, isVisibleToBoard } from "./reviewStage";

const req = (status: string, board_round = 0, period_type = "monthly") => ({ status, board_round, period_type });

describe("getReviewStage", () => {
  it.each([
    ["pending", 0, "leaders_preliminary"],
    ["under_review", 0, "leaders_preliminary"],
    ["conditionally_approved", 0, "leaders_preliminary"],
    ["board_review", 1, "board_preliminary"],
    ["under_review", 1, "leaders_updated"],
    ["conditionally_approved", 1, "leaders_updated"],
    ["board_review", 2, "board_final"],
    ["board_review", 3, "board_final"],
    ["approved", 2, "approved"],
    ["partially_approved", 1, "approved"],
    ["denied", 0, "denied"],
    ["draft", 0, "closed"],
    ["cancelled", 0, "closed"],
  ])("%s at round %i is %s", (status, round, stage) => {
    expect(getReviewStage(req(status, round))).toBe(stage);
  });

  it("treats a missing round as 0", () => {
    expect(getReviewStage({ status: "pending" })).toBe("leaders_preliminary");
  });
});

describe("getRowPermissions", () => {
  it("lets an admin edit, approve for the Board and deny while it is theirs", () => {
    expect(getRowPermissions(req("pending"), "admin")).toMatchObject({
      canEdit: true, canApproveForBoard: true, canDeny: true, canSend: false,
    });
    expect(getRowPermissions(req("conditionally_approved"), "admin")).toMatchObject({
      canEdit: true, canApproveForBoard: false, canDeny: true, canSend: true,
    });
  });

  it("gives an admin nothing while it is with the Board, or after", () => {
    for (const s of ["board_review", "approved", "denied", "draft"]) {
      const p = getRowPermissions(req(s), "admin");
      expect(Object.values(p).some(Boolean)).toBe(false);
    }
  });

  it("cannot edit the months of an annual request", () => {
    expect(getRowPermissions(req("pending", 0, "annual"), "admin").canEdit).toBe(false);
  });

  it("lets the Board give feedback and decide only while it is with them, and never edit", () => {
    expect(getRowPermissions(req("board_review", 1), "board")).toEqual({
      canEdit: false, canApproveForBoard: false, canDeny: false, canSend: false,
      canBoardDecide: true, canGiveFeedback: true,
    });
    for (const s of ["pending", "under_review", "conditionally_approved", "approved", "denied"]) {
      expect(Object.values(getRowPermissions(req(s), "board")).some(Boolean)).toBe(false);
    }
  });

  it("gives anyone else nothing", () => {
    for (const s of ["pending", "board_review", "conditionally_approved"]) {
      expect(Object.values(getRowPermissions(req(s), "other")).some(Boolean)).toBe(false);
    }
  });
});

describe("isVisibleToBoard", () => {
  it("shows the Board only what was sent to it and what came of it", () => {
    expect(["pending", "under_review", "conditionally_approved", "draft", "cancelled"].some((s) => isVisibleToBoard(req(s)))).toBe(false);
    expect(["board_review", "approved", "partially_approved", "denied"].every((s) => isVisibleToBoard(req(s)))).toBe(true);
  });
});
