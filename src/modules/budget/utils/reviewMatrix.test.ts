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
