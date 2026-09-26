import { describe, it, expect } from "vitest";
import { ALL_YEARS, eventYear, filterEventsByYear, yearsInEvents } from "./eventYear";

const at = (iso: string) => ({ starts_at: iso });

describe("filterEventsByYear", () => {
  const events = [
    at("2027-12-04T09:00:00-05:00"), // Quarterly Prayer Conference
    at("2027-11-06T09:00:00-05:00"),
    at("2026-09-20T10:00:00-05:00"),
    at("2025-01-01T10:00:00-05:00"),
  ];

  it("keeps only the chosen year", () => {
    expect(filterEventsByYear(events, "2027")).toHaveLength(2);
    expect(filterEventsByYear(events, "2026")).toHaveLength(1);
    expect(filterEventsByYear(events, "2028")).toHaveLength(0);
  });

  it("hands the whole list back when no year is chosen", () => {
    expect(filterEventsByYear(events, ALL_YEARS)).toHaveLength(4);
  });

  it("narrows by when the event happens, not when it was requested", () => {
    // The 2027 calendar is reviewed during 2026. Filtering on created_at would
    // put next year's requests under this year and leave 2027 looking empty.
    const nextYearRequest = { starts_at: "2027-12-04T09:00:00-05:00", created_at: "2026-09-22T14:00:00-05:00" };
    expect(filterEventsByYear([nextYearRequest], "2027")).toHaveLength(1);
    expect(filterEventsByYear([nextYearRequest], "2026")).toHaveLength(0);
  });
});

describe("eventYear", () => {
  it("reads a timestamp on the viewer's clock", () => {
    const newYearsEveEvening = new Date(2026, 11, 31, 19, 0).toISOString();
    expect(eventYear(newYearsEveEvening)).toBe(2026);
  });
});

describe("yearsInEvents", () => {
  const today = new Date(2026, 8, 26); // 26 September 2026

  it("offers every year on the board, newest first", () => {
    expect(
      yearsInEvents(
        [[at("2025-05-01T10:00:00-05:00")], [at("2027-12-04T09:00:00-05:00")], [at("2026-02-01T10:00:00-05:00")]],
        today
      )
    ).toEqual([2027, 2026, 2025]);
  });

  it("lists a year once however many events fall in it", () => {
    expect(
      yearsInEvents([[at("2027-01-01T10:00:00-05:00"), at("2027-07-04T10:00:00-05:00")]], today)
    ).toEqual([2027, 2026]);
  });

  it("always offers the current year, even on an empty board", () => {
    expect(yearsInEvents([undefined, null, []], today)).toEqual([2026]);
  });

  it("leaves out a date it cannot read rather than offering NaN", () => {
    expect(yearsInEvents([[at("not a date")]], today)).toEqual([2026]);
  });
});
