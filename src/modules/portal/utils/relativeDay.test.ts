import { describe, it, expect } from "vitest";
import { relativeDay } from "./whenIsIt";

describe("relativeDay", () => {
  const now = new Date(2026, 8, 11, 9, 30); // Friday 11 September 2026

  it("uses words for the recent past and a date for the rest", () => {
    expect(relativeDay("2026-09-11", now)).toBe("Today");
    expect(relativeDay("2026-09-10", now)).toBe("Yesterday");
    expect(relativeDay("2026-09-08", now)).toBe("3 days ago");
    expect(relativeDay("2026-09-01", now)).toBe("Last week");
    expect(relativeDay("2026-08-20", now)).toBe("3 weeks ago");
  });

  it("adds the year only once it is not the current one", () => {
    expect(relativeDay("2026-03-12", now)).toBe("Mar 12");
    expect(relativeDay("2025-03-12", now)).toBe("Mar 12, 2025");
  });

  it("reads a bare date in local time, not as UTC midnight", () => {
    // Through new Date("2026-09-11") this is UTC midnight, which is still the
    // 10th anywhere west of Greenwich — the label would read "Yesterday" for
    // something that happened today.
    expect(relativeDay("2026-09-11", now)).toBe("Today");
  });

  it("accepts a full timestamp and compares only the day", () => {
    expect(relativeDay(new Date(2026, 8, 10, 23, 50).toISOString(), now)).toBe("Yesterday");
    expect(relativeDay(new Date(2026, 8, 11, 0, 5).toISOString(), now)).toBe("Today");
  });
});
