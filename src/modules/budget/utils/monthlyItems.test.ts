import { describe, it, expect } from "vitest";
import {
  MONTH_KEYS,
  monthlyItemsFromBreakdown,
  monthlyItemsToBreakdown,
  monthlyItemTotal,
  nonMonthlyBreakdown,
  type MonthlyFormItem,
} from "./monthlyItems";

const OTHER = "__other__";
const OPTIONS = ["Visiting members meeting", "Post-production"];

const zeros = Object.fromEntries(MONTH_KEYS.map((m) => [m, 0])) as Record<(typeof MONTH_KEYS)[number], number>;

const line = (over: Partial<MonthlyFormItem>): MonthlyFormItem => ({
  justification_category: OPTIONS[0],
  custom_justification: "",
  chart_of_accounts: "",
  description: "",
  ...zeros,
  ...over,
});

describe("monthly lines, saved and loaded", () => {
  it("come back exactly as they were entered", () => {
    const entered = [
      line({ justification_category: OPTIONS[0], chart_of_accounts: "5100", description: "Ministry kick off", apr: 1000, nov: 1000 }),
      line({ justification_category: OTHER, custom_justification: "A thing nobody listed", jan: 500, feb: 250.5 }),
    ];

    const stored = monthlyItemsToBreakdown(entered, OTHER);
    const loaded = monthlyItemsFromBreakdown(stored, OPTIONS, OTHER);

    expect(loaded).toEqual(entered);
  });

  it("keep each line's total as the sum of its months", () => {
    const stored = monthlyItemsToBreakdown([line({ apr: 1000, nov: 1000.25 })], OTHER);
    expect(stored[0].amount).toBe(2000.25);
    expect(monthlyItemTotal(line({ jan: 1, feb: 2, dec: 3 }))).toBe(6);
  });

  it("come back as Other, text kept, when the justification is no longer on the ministry's list", () => {
    const stored = [
      { category: "monthly_budget_item", description: "Retired option", amount: 10, monthly_data: { jan: 10 } },
    ];
    const [loaded] = monthlyItemsFromBreakdown(stored, OPTIONS, OTHER);

    expect(loaded.justification_category).toBe(OTHER);
    expect(loaded.custom_justification).toBe("Retired option");
  });

  it("load a line with only some months stored (the seeded shape), the rest zero", () => {
    const stored = [
      { category: "monthly_budget_item", description: OPTIONS[0], amount: 2000, monthly_data: { apr: 1000, nov: 1000 } },
    ];
    const [loaded] = monthlyItemsFromBreakdown(stored, OPTIONS, OTHER);

    expect(loaded.apr).toBe(1000);
    expect(loaded.jan).toBe(0);
    expect(monthlyItemTotal(loaded)).toBe(2000);
  });

  it("load a line with no monthly_data, or nonsense in it, as zeros rather than NaN", () => {
    const loaded = monthlyItemsFromBreakdown(
      [
        { category: "monthly_budget_item", description: OPTIONS[1], amount: 5 },
        { category: "monthly_budget_item", description: OPTIONS[1], amount: 5, monthly_data: { jan: "x" as unknown as number } },
      ],
      OPTIONS,
      OTHER,
    );

    expect(loaded.map(monthlyItemTotal)).toEqual([0, 0]);
  });

  it("an empty justification loads as Other with no text, never as an unselectable blank", () => {
    const [loaded] = monthlyItemsFromBreakdown(
      [{ category: "monthly_budget_item", description: "", amount: 0 }],
      OPTIONS,
      OTHER,
    );
    expect(loaded.justification_category).toBe(OTHER);
  });

  it("load nothing from a request with no breakdown", () => {
    expect(monthlyItemsFromBreakdown(null, OPTIONS, OTHER)).toEqual([]);
    expect(monthlyItemsFromBreakdown(undefined, OPTIONS, OTHER)).toEqual([]);
  });

  it("ignore lines that are not monthly lines", () => {
    const loaded = monthlyItemsFromBreakdown(
      [
        { category: "Keyboard", description: "Songwriting", amount: 1600 },
        { category: "__period_amount__", description: "Jan", amount: 5 },
        null,
      ],
      OPTIONS,
      OTHER,
    );
    expect(loaded).toEqual([]);
  });
});

describe("nonMonthlyBreakdown", () => {
  it("leaves only the lines the generic breakdown owns, so a save does not store the monthly ones twice", () => {
    const kept = nonMonthlyBreakdown([
      { category: "monthly_budget_item", description: "a", amount: 1 },
      { category: "__period_amount__", description: "Jan", amount: 2 },
      { category: "Keyboard", description: "Songwriting", amount: 3 },
    ]);

    expect(kept).toEqual([{ category: "Keyboard", description: "Songwriting", amount: 3 }]);
  });

  it("copes with no breakdown", () => {
    expect(nonMonthlyBreakdown(null)).toEqual([]);
  });
});
