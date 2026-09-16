import { describe, it, expect } from "vitest";
import {
  describeWhen,
  describeMeeting,
  birthdaysThisMonth,
  monthName,
  greeting,
  clockTime,
} from "./whenIsIt";

/** Local-time helper, so these assertions do not depend on the runner's zone. */
const at = (y: number, m: number, d: number, h = 0, min = 0) =>
  new Date(y, m - 1, d, h, min).toISOString();

describe("describeWhen", () => {
  const now = new Date(2026, 8, 11, 9, 30); // Friday 11 September 2026, 9:30am

  it("says an event in progress is happening now", () => {
    const result = describeWhen(at(2026, 9, 11, 9), at(2026, 9, 11, 11), now);
    expect(result).toEqual({ label: "Happening now", isNow: true, isToday: true });
  });

  it("does not call an event that has only just finished 'now'", () => {
    expect(describeWhen(at(2026, 9, 11, 7), at(2026, 9, 11, 9), now).isNow).toBe(false);
  });

  it("uses today and tomorrow before it uses a weekday", () => {
    expect(describeWhen(at(2026, 9, 11, 19), at(2026, 9, 11, 21), now).label)
      .toBe("Today, 7 PM");
    expect(describeWhen(at(2026, 9, 12, 10), at(2026, 9, 12, 11), now).label)
      .toBe("Tomorrow, 10 AM");
  });

  it("names the weekday inside a week and dates anything further out", () => {
    expect(describeWhen(at(2026, 9, 13, 9), at(2026, 9, 13, 11), now).label)
      .toBe("Sunday, 9 AM");
    expect(describeWhen(at(2026, 9, 20, 9), at(2026, 9, 20, 11), now).label)
      .toBe("Sun, Sep 20, 9 AM");
  });

  it("marks today without claiming the event has started", () => {
    const later = describeWhen(at(2026, 9, 11, 19), at(2026, 9, 11, 21), now);
    expect(later.isToday).toBe(true);
    expect(later.isNow).toBe(false);
  });

  it("keeps the minutes only when there are any", () => {
    expect(clockTime(new Date(2026, 8, 11, 9, 0))).toBe("9 AM");
    expect(clockTime(new Date(2026, 8, 11, 9, 30))).toBe("9:30 AM");
  });
});

describe("describeMeeting", () => {
  it("pluralises a weekday and joins the place with a separator", () => {
    expect(describeMeeting("Wednesday", "19:00:00", "Fellowship Hall"))
      .toBe("Wednesdays at 7 PM · Fellowship Hall");
  });

  it("leaves free text that is not a weekday exactly as it was typed", () => {
    expect(describeMeeting("First Saturday of the month", null, null))
      .toBe("First Saturday of the month");
  });

  it("reads a TIME column without shifting it by the reader's offset", () => {
    // "19:00:00" through new Date() would be an epoch timestamp and could
    // come back as 2 PM or midnight depending on where the reader is.
    expect(describeMeeting(null, "19:00:00", null)).toBe("7 PM");
    expect(describeMeeting(null, "07:45:00", null)).toBe("7:45 AM");
  });

  it("returns nothing at all rather than a lonely separator", () => {
    expect(describeMeeting(null, null, null)).toBe("");
    expect(describeMeeting("   ", null, "  ")).toBe("");
  });

  it("survives any one of the three being missing", () => {
    expect(describeMeeting("Sunday", null, "Room 2")).toBe("Sundays · Room 2");
    expect(describeMeeting(null, null, "Room 2")).toBe("Room 2");
  });
});

describe("birthdaysThisMonth", () => {
  const people = [
    { display_name: "Selam", birth_month: 9 },
    { display_name: "Dawit", birth_month: 3 },
    { display_name: "Hana", birth_month: null },
  ];

  it("matches on month and tolerates a missing one", () => {
    expect(birthdaysThisMonth(people, new Date(2026, 8, 11)).map((p) => p.display_name))
      .toEqual(["Selam"]);
    expect(birthdaysThisMonth(people, new Date(2026, 2, 1)).map((p) => p.display_name))
      .toEqual(["Dawit"]);
    expect(birthdaysThisMonth(people, new Date(2026, 0, 1))).toEqual([]);
  });

  it("names the month it is matching on", () => {
    expect(monthName(new Date(2026, 8, 11))).toBe("September");
  });
});

describe("greeting", () => {
  it("turns over at noon and at five", () => {
    expect(greeting(new Date(2026, 8, 11, 11, 59))).toBe("Good morning");
    expect(greeting(new Date(2026, 8, 11, 12, 0))).toBe("Good afternoon");
    expect(greeting(new Date(2026, 8, 11, 16, 59))).toBe("Good afternoon");
    expect(greeting(new Date(2026, 8, 11, 17, 0))).toBe("Good evening");
  });
});
