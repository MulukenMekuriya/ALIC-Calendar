import { describe, it, expect } from "vitest";
import { buildNextSteps, joinNames, type NextStepInputs } from "./nextSteps";

/** A member with nothing outstanding: linked, contactable, serving, in a group. */
const SETTLED: NextStepInputs = {
  linked: true,
  phone: "301-555-0100",
  email: "member@example.com",
  householdSize: 4,
  servingCount: 2,
  groupCount: 1,
  children: [{ display_name: "Selam", grade_name: "Grade 3" }],
  givingYears: [],
  cards: [],
  today: new Date(2026, 8, 11), // 11 September 2026
};

const ids = (input: NextStepInputs) => buildNextSteps(input).map((s) => s.id);

describe("buildNextSteps", () => {
  it("has nothing to say to a member with nothing outstanding", () => {
    expect(buildNextSteps(SETTLED)).toEqual([]);
  });

  it("says nothing at all to a login with no member record", () => {
    expect(buildNextSteps({ ...SETTLED, linked: false, phone: null, cards: [{ is_overdue: true }] }))
      .toEqual([]);
  });

  it("puts overdue follow-ups first and marks them for attention", () => {
    const steps = buildNextSteps({
      ...SETTLED,
      phone: null,
      cards: [{ is_overdue: true }, { is_overdue: false }],
    });
    expect(steps[0].id).toBe("followups-overdue");
    expect(steps[0].tone).toBe("attention");
    expect(steps[0].title).toContain("1 follow-up is");
  });

  it("does not shout when follow-ups are merely open", () => {
    const steps = buildNextSteps({ ...SETTLED, cards: [{ is_overdue: false }, { is_overdue: false }] });
    expect(steps[0].id).toBe("followups-open");
    expect(steps[0].tone).toBe("todo");
    expect(steps[0].title).toContain("2 people are");
  });

  it("asks for a phone number rather than both contact details at once", () => {
    expect(ids({ ...SETTLED, phone: null, email: null })).toEqual(["no-phone"]);
    expect(ids({ ...SETTLED, phone: "  ", email: null })).toEqual(["no-phone"]);
  });

  it("falls through to email only once a phone number is on file", () => {
    expect(ids({ ...SETTLED, email: null })).toEqual(["no-email"]);
  });

  it("offers last year's statement, and never one for a year still running", () => {
    const years = [{ tax_year: 2026 }, { tax_year: 2025 }, { tax_year: 2024 }];
    expect(ids({ ...SETTLED, givingYears: years })).toEqual(["statement-2025"]);
    expect(ids({ ...SETTLED, givingYears: [{ tax_year: 2026 }] })).toEqual([]);
  });

  it("names the children whose grade is missing", () => {
    const steps = buildNextSteps({
      ...SETTLED,
      children: [
        { display_name: "Selam", grade_name: null },
        { display_name: "Dawit", grade_name: null },
        { display_name: "Hana", grade_name: "Grade 1" },
      ],
    });
    expect(steps).toHaveLength(1);
    expect(steps[0].title).toContain("Selam and Dawit");
    expect(steps[0].title).not.toContain("Hana");
  });

  it("caps invitations at one, however many apply", () => {
    const steps = buildNextSteps({
      ...SETTLED,
      servingCount: 0,
      groupCount: 0,
      householdSize: 1,
    });
    expect(steps.map((s) => s.tone).filter((t) => t === "offer")).toHaveLength(1);
    expect(steps[0].id).toBe("not-serving");
  });

  it("falls to the next invitation when the first does not apply", () => {
    expect(ids({ ...SETTLED, groupCount: 0, householdSize: 1 })).toEqual(["no-group"]);
    expect(ids({ ...SETTLED, householdSize: 1 })).toEqual(["household-of-one"]);
  });

  it("points the household nudge at the member, not at the office", () => {
    // Somebody who registered themselves from the QR code lands with a
    // household of one, and that tab is now where they add their address and
    // their children — so the invitation must not tell them to ring somebody.
    const [step] = buildNextSteps({ ...SETTLED, householdSize: 1 });
    expect(step.tab).toBe("household");
    expect(step.detail).not.toMatch(/office/i);
    expect(step.actionLabel).toMatch(/add/i);
  });

  it("keeps tasks above invitations", () => {
    const steps = buildNextSteps({
      ...SETTLED,
      phone: null,
      servingCount: 0,
      cards: [{ is_overdue: true }],
    });
    expect(steps.map((s) => s.id)).toEqual([
      "followups-overdue",
      "no-phone",
      "not-serving",
    ]);
  });

  it("treats missing counts as zero rather than as satisfied", () => {
    expect(ids({ ...SETTLED, servingCount: undefined, householdSize: undefined }))
      .toEqual(["not-serving"]);
  });
});

describe("joinNames", () => {
  it("reads the way a person would say it", () => {
    expect(joinNames([])).toBe("");
    expect(joinNames(["Selam"])).toBe("Selam");
    expect(joinNames(["Selam", "Dawit"])).toBe("Selam and Dawit");
    expect(joinNames(["Selam", "Dawit", "Hana"])).toBe("Selam, Dawit and Hana");
  });
});
