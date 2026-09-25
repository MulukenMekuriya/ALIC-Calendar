import { describe, it, expect } from "vitest";
import { sundaysBefore, signaturesPerSunday } from "./consentSchedule";

/** Local midnight, so the test does not depend on the runner's timezone. */
function on(y: number, m: number, d: number): Date {
  return new Date(y, m - 1, d);
}

const ENFORCE = "2026-11-01"; // A Sunday, and the first enforced service.

describe("sundaysBefore", () => {
  it("does not count the enforcement Sunday itself", () => {
    // 1 November 2026 is a Sunday. A family arriving that morning without a
    // form is being turned away — it is not another chance to collect. From
    // 26 October the only Sundays left would be none.
    expect(sundaysBefore(ENFORCE, on(2026, 10, 26))).toBe(0);
  });

  it("counts the five warn Sundays from the end of September", () => {
    // 27 Sep, 4, 11, 18, 25 Oct.
    expect(sundaysBefore(ENFORCE, on(2026, 9, 26))).toBe(5);
  });

  it("counts a Sunday that is today", () => {
    // Standing on 25 October, that morning is still a chance to collect.
    expect(sundaysBefore(ENFORCE, on(2026, 10, 25))).toBe(1);
  });

  it("counts four from the Monday after the first warn Sunday", () => {
    expect(sundaysBefore(ENFORCE, on(2026, 9, 28))).toBe(4);
  });

  it("returns zero on the enforcement date", () => {
    expect(sundaysBefore(ENFORCE, on(2026, 11, 1))).toBe(0);
  });

  it("returns zero once the date has passed", () => {
    expect(sundaysBefore(ENFORCE, on(2026, 11, 8))).toBe(0);
  });

  it("returns zero rather than guessing on an unparseable date", () => {
    // Claiming Sundays the church does not have is the expensive way to be
    // wrong, so an unreadable date reads as "none left".
    expect(sundaysBefore("not-a-date", on(2026, 9, 26))).toBe(0);
  });

  it("handles a year boundary", () => {
    // 2027-01-01 is a Friday: Sundays on 27 Dec only.
    expect(sundaysBefore("2027-01-01", on(2026, 12, 22))).toBe(1);
  });
});

describe("signaturesPerSunday", () => {
  it("rounds up, because a part signature is not a thing", () => {
    expect(signaturesPerSunday(216, 5)).toBe(44);
  });

  it("reports the harder number when Sundays are lost to a late ship", () => {
    // Three warn Sundays instead of five, which is the difference between
    // 44 a Sunday and 72.
    expect(signaturesPerSunday(216, 3)).toBe(72);
  });

  it("is null when there is nothing left to collect", () => {
    expect(signaturesPerSunday(0, 5)).toBeNull();
  });

  it("is null rather than Infinity when no Sundays are left", () => {
    expect(signaturesPerSunday(30, 0)).toBeNull();
  });
});
