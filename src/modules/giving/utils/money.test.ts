import { describe, it, expect } from "vitest";
import { formatMoney, formatMoneyShort, parseMoneyToCents, parseDateToIso } from "./money";

describe("formatMoney", () => {
  it("formats cents as dollars", () => {
    expect(formatMoney(123456)).toBe("$1,234.56");
    expect(formatMoney(0)).toBe("$0.00");
    expect(formatMoney(5)).toBe("$0.05");
  });
  it("treats null as zero rather than throwing", () => {
    expect(formatMoney(null)).toBe("$0.00");
    expect(formatMoney(undefined)).toBe("$0.00");
  });
  it("drops the pennies in the short form", () => {
    expect(formatMoneyShort(123456)).toBe("$1,235");
  });
});

describe("parseMoneyToCents", () => {
  it("reads the forms a bank export actually uses", () => {
    expect(parseMoneyToCents("$1,234.56")).toBe(123456);
    expect(parseMoneyToCents("1234.56")).toBe(123456);
    expect(parseMoneyToCents("1,234")).toBe(123400);
    expect(parseMoneyToCents("  12.5  ")).toBe(1250);
    expect(parseMoneyToCents("45.00 USD")).toBe(4500);
    expect(parseMoneyToCents(100)).toBe(10000);
  });

  it("keeps refunds negative instead of turning them into gifts", () => {
    expect(parseMoneyToCents("(45.00)")).toBe(-4500);
    expect(parseMoneyToCents("-45.00")).toBe(-4500);
  });

  it("returns null for anything it cannot read", () => {
    // A zero here would become a silent zero-dollar gift.
    expect(parseMoneyToCents("")).toBeNull();
    expect(parseMoneyToCents("   ")).toBeNull();
    expect(parseMoneyToCents("n/a")).toBeNull();
    expect(parseMoneyToCents("twelve")).toBeNull();
    expect(parseMoneyToCents("12.3.4")).toBeNull();
    expect(parseMoneyToCents(".")).toBeNull();
    expect(parseMoneyToCents(null)).toBeNull();
  });

  it("rounds to the cent rather than truncating", () => {
    expect(parseMoneyToCents("0.005")).toBe(1);
    expect(parseMoneyToCents("19.999")).toBe(2000);
  });
});

describe("parseDateToIso", () => {
  it("accepts ISO, with or without a time part", () => {
    expect(parseDateToIso("2026-01-04")).toBe("2026-01-04");
    expect(parseDateToIso("2026-01-04 15:04:00")).toBe("2026-01-04");
  });

  it("accepts US month-first dates with a four-digit year", () => {
    expect(parseDateToIso("01/04/2026")).toBe("2026-01-04");
    expect(parseDateToIso("1/4/2026")).toBe("2026-01-04");
  });

  it("accepts written month names in either order", () => {
    expect(parseDateToIso("4 Jan 2026")).toBe("2026-01-04");
    expect(parseDateToIso("January 4, 2026")).toBe("2026-01-04");
  });

  it("refuses to guess at two-digit years", () => {
    // 01/04/26 could be 1926 or 2026, and the wrong answer is a gift filed in
    // the wrong tax year.
    expect(parseDateToIso("01/04/26")).toBeNull();
  });

  it("rejects impossible dates rather than rolling them over", () => {
    expect(parseDateToIso("2026-02-31")).toBeNull();
    expect(parseDateToIso("13/01/2026")).toBeNull();
    expect(parseDateToIso("")).toBeNull();
    expect(parseDateToIso("last Sunday")).toBeNull();
  });
});
