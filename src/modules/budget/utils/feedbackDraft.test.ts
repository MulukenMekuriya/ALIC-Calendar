import { describe, it, expect } from "vitest";
import { draftFrom, parseDraft } from "./feedbackDraft";
import type { AllocationBoardFeedback } from "../types";

describe("parseDraft", () => {
  it("reads an amount with a dollar sign and commas", () => {
    expect(parseDraft({ amount: "$1,250.50", comment: " trim " })).toEqual({ amount: 1250.5, comment: "trim" });
  });
  it("lets the amount be empty: a comment alone is feedback", () => {
    expect(parseDraft({ amount: "  ", comment: "" })).toEqual({ amount: null, comment: null });
  });
  it("refuses a negative or non-numeric amount", () => {
    expect(parseDraft({ amount: "-5", comment: "" })).toBeNull();
    expect(parseDraft({ amount: "abc", comment: "" })).toBeNull();
  });
});

describe("draftFrom", () => {
  it("starts blank and fills from a stored note", () => {
    expect(draftFrom(undefined)).toEqual({ amount: "", comment: "" });
    expect(
      draftFrom({ recommended_amount: 400, comment: "ok" } as unknown as AllocationBoardFeedback),
    ).toEqual({ amount: "400", comment: "ok" });
  });
});
