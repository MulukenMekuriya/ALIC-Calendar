import { describe, it, expect } from "vitest";
import { sayWhyNot } from "./sayWhyNot";

describe("sayWhyNot", () => {
  it("names the remedy for a leadership record", () => {
    expect(sayWhyNot(new Error("ask_the_office_to_end_a_leadership_role"))).toMatch(
      /church office/
    );
  });

  it("survives PostgREST's framing around the code", () => {
    const wrapped = new Error(
      'new row violates: child_not_in_your_household (SQLSTATE 42501)'
    );
    expect(sayWhyNot(wrapped)).toMatch(/check-in desk/);
  });

  it("explains both same-day collisions with one sentence", () => {
    expect(sayWhyNot("already_recorded_in_this_group_today")).toMatch(/tomorrow/);
    expect(sayWhyNot("already_recorded_in_this_ministry_today")).toMatch(/tomorrow/);
  });

  it("turns a unique-name collision into advice, not a constraint name", () => {
    expect(sayWhyNot('duplicate key value violates unique constraint "uq_households_org_name"'))
      .toMatch(/Another family/);
  });

  it("does not swallow a message it has no sentence for", () => {
    expect(sayWhyNot(new Error("connection closed"))).toBe("connection closed");
  });

  it("copes with something that is not an Error at all", () => {
    expect(sayWhyNot({ toString: () => "not_your_membership" })).toMatch(/somebody else/);
  });
});
