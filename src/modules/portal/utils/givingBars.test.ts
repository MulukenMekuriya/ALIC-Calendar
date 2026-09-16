import { describe, it, expect } from "vitest";
import { buildGivingBars, lastCompletedYear } from "./givingBars";

const YEARS = [
  { tax_year: 2026, total_cents: 50_000, gift_count: 5 },
  { tax_year: 2025, total_cents: 200_000, gift_count: 24 },
  { tax_year: 2024, total_cents: 100_000, gift_count: 12 },
];

describe("buildGivingBars", () => {
  it("returns the newest years first and marks the running one", () => {
    const bars = buildGivingBars(YEARS, 2026);
    expect(bars.map((b) => b.year)).toEqual([2026, 2025, 2024]);
    expect(bars.map((b) => b.inProgress)).toEqual([true, false, false]);
  });

  it("scales against the largest year in the window", () => {
    const bars = buildGivingBars(YEARS, 2026);
    expect(bars[1].widthPercent).toBe(100);
    expect(bars[2].widthPercent).toBe(50);
    expect(bars[0].widthPercent).toBe(25);
  });

  it("keeps a small year visible rather than rendering it as nothing", () => {
    const bars = buildGivingBars(
      [
        { tax_year: 2026, total_cents: 100, gift_count: 1 },
        { tax_year: 2025, total_cents: 1_000_000, gift_count: 40 },
      ],
      2026
    );
    expect(bars[0].widthPercent).toBe(4);
  });

  it("gives a genuinely empty year no width at all", () => {
    const bars = buildGivingBars(
      [
        { tax_year: 2026, total_cents: 0, gift_count: 0 },
        { tax_year: 2025, total_cents: 500, gift_count: 1 },
      ],
      2026
    );
    expect(bars[0].widthPercent).toBe(0);
  });

  it("does not divide by zero when nothing has ever been given", () => {
    const bars = buildGivingBars([{ tax_year: 2026, total_cents: 0, gift_count: 0 }], 2026);
    expect(bars[0].widthPercent).toBe(0);
  });

  it("shows only the most recent few years", () => {
    const many = Array.from({ length: 9 }, (_, i) => ({
      tax_year: 2026 - i,
      total_cents: 1000,
      gift_count: 1,
    }));
    expect(buildGivingBars(many, 2026).map((b) => b.year)).toEqual([2026, 2025, 2024, 2023, 2022]);
  });
});

describe("lastCompletedYear", () => {
  it("skips the year still being lived", () => {
    expect(lastCompletedYear(YEARS, 2026)?.tax_year).toBe(2025);
  });

  it("is null before there is a completed year", () => {
    expect(lastCompletedYear([{ tax_year: 2026, total_cents: 1, gift_count: 1 }], 2026)).toBeNull();
    expect(lastCompletedYear([], 2026)).toBeNull();
  });
});
