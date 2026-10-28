import { describe, expect, it } from "vitest";
import { formatBudgetAmount, ministryBudgetRows, ministryBudgetTotals } from "./ministryBudget";

const budgets = [
  { ministry_id: "children", ministry_name: "Alic MD Children", allocated_amount: 25000 },
  { ministry_id: "youth", ministry_name: "Alic MD Youth", allocated_amount: 14800 },
];
const expense = (ministry_id: string, name: string, amount: number, status: string) => ({
  ministry_id,
  amount,
  status,
  ministry: { name },
});

describe("the Ministry Summary", () => {
  it("sets what each ministry has paid against its approved budget", () => {
    const rows = ministryBudgetRows(budgets, [
      expense("children", "Alic MD Children", 1000, "completed"),
      expense("children", "Alic MD Children", "500.50" as unknown as number, "completed"),
      expense("youth", "Alic MD Youth", 200, "completed"),
    ]);
    expect(rows).toEqual([
      { ministryId: "children", ministry: "Alic MD Children", approved: 25000, spent: 1500.5, remaining: 23499.5 },
      { ministryId: "youth", ministry: "Alic MD Youth", approved: 14800, spent: 200, remaining: 14600 },
    ]);
  });

  it("counts an expense only once it is paid", () => {
    const rows = ministryBudgetRows(budgets, [
      expense("children", "Alic MD Children", 900, "treasury_approved"),
      expense("children", "Alic MD Children", 800, "leader_approved"),
      expense("children", "Alic MD Children", 700, "pending_leader"),
      expense("children", "Alic MD Children", 600, "leader_denied"),
    ]);
    expect(rows[0].spent).toBe(0);
    expect(rows[0].remaining).toBe(25000);
  });

  it("shows a ministry that spent with no budget, overspent", () => {
    const rows = ministryBudgetRows(budgets, [expense("admin", "Emu - Admin Office", 19085.57, "completed")]);
    const admin = rows.find((r) => r.ministryId === "admin");
    expect(admin).toEqual({ ministryId: "admin", ministry: "Emu - Admin Office", approved: 0, spent: 19085.57, remaining: -19085.57 });
    // Largest budget first; a ministry with none comes after those that have one.
    expect(rows.map((r) => r.ministryId)).toEqual(["children", "youth", "admin"]);
  });

  it("leaves out a ministry with neither budget nor payment", () => {
    expect(ministryBudgetRows([{ ministry_id: "x", ministry_name: "X", allocated_amount: 0 }], [])).toEqual([]);
  });

  it("totals the columns, overspends included", () => {
    const rows = ministryBudgetRows(budgets, [
      expense("youth", "Alic MD Youth", 15000, "completed"),
      expense("admin", "Emu - Admin Office", 100, "completed"),
    ]);
    expect(ministryBudgetTotals(rows)).toEqual({ approved: 39800, spent: 15100, remaining: 24700 });
  });

  it("writes an overspend with a minus sign", () => {
    expect(formatBudgetAmount(1234.5)).toBe("$1,234.50");
    expect(formatBudgetAmount(-200)).toBe("−$200.00");
    expect(formatBudgetAmount(0)).toBe("$0.00");
  });
});

describe("ministryRowsFromTotals", () => {
  it("builds the same rows the Home screen does, from the database's totals", async () => {
    const { ministryRowsFromTotals } = await import("./ministryBudget");
    const rows = ministryRowsFromTotals([
      { ministry_id: "a", ministry_name: "Choir", approved: 100, spent: 40 },
      { ministry_id: "b", ministry_name: "Deacons", approved: 500, spent: 600 },
      { ministry_id: "c", ministry_name: "Idle", approved: 0, spent: 0 },
    ]);
    expect(rows.map((r) => [r.ministry, r.remaining])).toEqual([
      ["Deacons", -100],
      ["Choir", 60],
    ]);
  });
});
