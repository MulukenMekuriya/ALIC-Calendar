import { describe, it, expect } from "vitest";
import { buildReviewRow, groupByMinistry, totalsOf } from "./reviewMatrix";
import type { AllocationRequestWithRelations } from "../types";

const line = (description: string, data: Record<string, number>) => ({
  category: "monthly_budget_item",
  description,
  amount: Object.values(data).reduce((a, b) => a + b, 0),
  monthly_data: { chart_of_accounts: "6000", ...data },
});

const request = (over: Record<string, unknown>) =>
  ({
    id: "r",
    organization_id: "md",
    ministry_id: "m1",
    ministry: { name: "Deacons" },
    period_type: "monthly",
    requested_amount: 0,
    status: "pending",
    budget_breakdown: [],
    ...over,
  }) as unknown as AllocationRequestWithRelations;

describe("buildReviewRow", () => {
  it("spreads a monthly request over its months and keeps each line's position", () => {
    const row = buildReviewRow(
      request({
        budget_breakdown: [
          { category: "other", description: "x", amount: 1 },
          line("Supplies", { jan: 100, feb: 50 }),
          line("Travel", { jan: 25 }),
        ],
      }),
    );
    expect(row.months.slice(0, 3)).toEqual([125, 50, 0]);
    expect(row.total).toBe(175);
    expect(row.lines.map((l) => l.index)).toEqual([1, 2]);
    expect(row.lines[0].justification).toBe("Supplies");
    expect(row.lines[0].chartOfAccounts).toBe("6000");
  });

  it("puts an annual request in its own column, with no months", () => {
    const row = buildReviewRow(request({ period_type: "annual", requested_amount: 4000 }));
    expect(row.isMonthly).toBe(false);
    expect(row.annual).toBe(4000);
    expect(row.total).toBe(4000);
    expect(row.months.every((m) => m === 0)).toBe(true);
    expect(row.lines).toEqual([]);
  });

  it("copes with a missing breakdown", () => {
    expect(buildReviewRow(request({ budget_breakdown: null })).total).toBe(0);
  });
});

describe("groupByMinistry", () => {
  it("groups a ministry's requests with a subtotal, biggest first, branches apart", () => {
    const a = buildReviewRow(request({ id: "a", budget_breakdown: [line("a", { jan: 100 })] }));
    const b = buildReviewRow(request({ id: "b", budget_breakdown: [line("b", { jan: 50 })] }));
    const c = buildReviewRow(
      request({ id: "c", ministry_id: "m2", ministry: { name: "Choir" }, budget_breakdown: [line("c", { feb: 900 })] }),
    );
    const d = buildReviewRow(
      request({ id: "d", organization_id: "va", budget_breakdown: [line("d", { jan: 10 })] }),
    );
    const groups = groupByMinistry([a, b, c, d]);
    expect(groups.map((g) => [g.ministryName, g.organizationId, g.total])).toEqual([
      ["Choir", "md", 900],
      ["Deacons", "md", 150],
      ["Deacons", "va", 10],
    ]);
    expect(groups[1].rows).toHaveLength(2);
    expect(groups[1].months[0]).toBe(150);
  });
});

describe("totalsOf", () => {
  it("adds months, annual and total", () => {
    const a = buildReviewRow(request({ budget_breakdown: [line("a", { jan: 100 })] }));
    const b = buildReviewRow(request({ period_type: "annual", requested_amount: 500 }));
    expect(totalsOf([a, b])).toMatchObject({ annual: 500, total: 600 });
  });
});

describe("formatReviewAmount", () => {
  it("drops .00 and keeps real cents", async () => {
    const { formatReviewAmount } = await import("./reviewMatrix");
    expect(formatReviewAmount(1234)).toBe("$1,234");
    expect(formatReviewAmount(1234.5)).toBe("$1,234.50");
    expect(formatReviewAmount(0)).toBe("$0");
  });
});

describe("Green, Yellow and Red totals", () => {
  const annual = (over: Record<string, unknown>) =>
    buildReviewRow(request({ period_type: "annual", requested_amount: 1200, ...over }));

  it("counts the local leaders' Green and the Board's in Total, and keeps them apart in the sums", () => {
    const decided = annual({ id: "a", status: "partially_approved", approved_amount: 800, green_amount: 800, yellow_amount: 400 });
    const proposed = annual({ id: "b", status: "conditionally_approved", green_amount: 600, yellow_amount: 600 });
    const denied = annual({ id: "c", status: "denied", green_amount: 0, yellow_amount: 0 });
    const fresh = annual({ id: "d", status: "pending" });

    expect([decided.approved, proposed.approved, denied.approved, fresh.approved]).toEqual([800, 600, 0, 0]);
    expect(proposed.splitState).toBe("proposed");

    const t = totalsOf([decided, proposed, denied, fresh]);
    expect(t.approved).toBe(1400);
    expect(t.split).toMatchObject({
      finalGreen: 800, finalYellow: 400, finalRed: 1200,
      proposedGreen: 600, proposedYellow: 600, proposedRed: 0,
      undecided: 1200,
    });
    expect(t.total).toBe(4800);
  });

  it("grows Total as Yellow turns Green", () => {
    const later = annual({ status: "approved", approved_amount: 1200, green_amount: 1200, yellow_amount: 0 });
    expect(later.approved).toBe(1200);
    expect(later.red).toBe(0);
  });

  it("reads a request approved before the split existed as all Green", () => {
    expect(annual({ status: "approved", approved_amount: 1200 }).approved).toBe(1200);
  });
});

describe("month-by-month marking", () => {
  const monthly = (over: Record<string, unknown>) =>
    request({
      requested_amount: 1200,
      budget_breakdown: [line("Venue", { jan: 500, feb: 500 }), line("Snacks", { mar: 200 })],
      ...over,
    });

  it("tints each month by its cells", () => {
    const row = buildReviewRow(
      monthly({
        status: "conditionally_approved",
        green_amount: 700,
        yellow_amount: 300,
        split_cells: [
          { index: 0, month: "jan", amount: 500, green: 500, yellow: 0 },
          { index: 0, month: "feb", amount: 500, green: 200, yellow: 300 },
          { index: 1, month: "mar", amount: 200, green: 0, yellow: 0 },
        ],
      }),
    );
    expect(row.monthSplit.slice(0, 3)).toEqual([
      { green: 500, yellow: 0, red: 0 },
      { green: 200, yellow: 300, red: 0 },
      { green: 0, yellow: 0, red: 200 },
    ]);
    expect([row.green, row.yellow, row.red, row.approved]).toEqual([700, 300, 200, 700]);
  });

  it("an all-Green request with no stored cells is Green in every month; an unmarked one is not tinted", () => {
    const green = buildReviewRow(monthly({ status: "conditionally_approved", green_amount: 1200, yellow_amount: 0 }));
    expect(green.monthSplit[2]).toEqual({ green: 200, yellow: 0, red: 0 });
    const fresh = buildReviewRow(monthly({ status: "pending" }));
    expect(fresh.monthSplit.every((m) => m.green + m.yellow + m.red === 0)).toBe(true);
  });
});
