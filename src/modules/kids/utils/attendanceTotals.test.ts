import { describe, it, expect } from "vitest";
import {
  sumAttendance,
  groupByDay,
  type AttendanceTotalsRow,
} from "./attendanceTotals";

function row(p: Partial<AttendanceTotalsRow> = {}): AttendanceTotalsRow {
  return {
    session_date: "2026-09-20",
    service_label: "Sunday Service",
    children: 0,
    first_time_visitors: 0,
    volunteers: 0,
    overrides: 0,
    not_checked_out: 0,
    avg_minutes: null,
    ...p,
  };
}

describe("sumAttendance", () => {
  it("adds the countable columns across rooms", () => {
    const t = sumAttendance([
      row({ children: 12, first_time_visitors: 2, volunteers: 3, overrides: 1, not_checked_out: 0 }),
      row({ children: 8, first_time_visitors: 1, volunteers: 2, overrides: 0, not_checked_out: 2 }),
    ]);
    expect(t.children).toBe(20);
    expect(t.first_time_visitors).toBe(3);
    expect(t.volunteers).toBe(5);
    expect(t.overrides).toBe(1);
    expect(t.not_checked_out).toBe(2);
  });

  it("weights avg_minutes by children rather than averaging the averages", () => {
    // 30 children at 100 min and 2 at 10 min. The naive mean of the means is
    // 55, which is wrong by almost a factor of two.
    const t = sumAttendance([
      row({ children: 30, avg_minutes: 100 }),
      row({ children: 2, avg_minutes: 10 }),
    ]);
    expect(t.avg_minutes).toBe(Math.round((30 * 100 + 2 * 10) / 32));
    expect(t.avg_minutes).not.toBe(55);
  });

  it("never sums avg_minutes", () => {
    const t = sumAttendance([
      row({ children: 1, avg_minutes: 60 }),
      row({ children: 1, avg_minutes: 60 }),
    ]);
    expect(t.avg_minutes).toBe(60);
  });

  it("ignores rooms where nobody was collected instead of pulling the mean down", () => {
    const t = sumAttendance([
      row({ children: 10, avg_minutes: 90 }),
      row({ children: 5, avg_minutes: null }),
    ]);
    expect(t.avg_minutes).toBe(90);
    expect(t.children).toBe(15);
  });

  it("returns a null average when nothing was collected anywhere", () => {
    const t = sumAttendance([row({ children: 4, avg_minutes: null })]);
    expect(t.avg_minutes).toBeNull();
  });

  it("returns zeroes for an empty report", () => {
    const t = sumAttendance([]);
    expect(t).toEqual({
      children: 0,
      first_time_visitors: 0,
      volunteers: 0,
      overrides: 0,
      not_checked_out: 0,
      avg_minutes: null,
    });
  });

  it("does not let a zero-child room contribute weight", () => {
    const t = sumAttendance([
      row({ children: 0, avg_minutes: 999 }),
      row({ children: 4, avg_minutes: 50 }),
    ]);
    expect(t.avg_minutes).toBe(50);
  });
});

describe("groupByDay", () => {
  it("groups rooms into one row per date, newest first", () => {
    const days = groupByDay([
      row({ session_date: "2026-09-13", children: 5 }),
      row({ session_date: "2026-09-20", children: 12 }),
      row({ session_date: "2026-09-20", children: 8 }),
    ]);
    expect(days.map((d) => d.session_date)).toEqual(["2026-09-20", "2026-09-13"]);
    expect(days[0].totals.children).toBe(20);
    expect(days[0].rows).toHaveLength(2);
    expect(days[1].totals.children).toBe(5);
  });

  it("counts one service when a Sunday has one, which is how ALIC runs", () => {
    const days = groupByDay([
      row({ children: 12, service_label: "Sunday Service" }),
      row({ children: 8, service_label: "Sunday Service" }),
    ]);
    expect(days[0].serviceCount).toBe(1);
  });

  it("flags a date with two services, where a child may be counted twice", () => {
    const days = groupByDay([
      row({ children: 12, service_label: "9:00" }),
      row({ children: 11, service_label: "11:00" }),
    ]);
    expect(days[0].serviceCount).toBe(2);
    expect(days[0].totals.children).toBe(23);
  });

  it("preserves the server's room order within a date", () => {
    const days = groupByDay([
      row({ session_date: "2026-09-20", children: 1, volunteers: 7 }),
      row({ session_date: "2026-09-20", children: 2, volunteers: 9 }),
    ]);
    expect(days[0].rows.map((r) => r.volunteers)).toEqual([7, 9]);
  });

  it("handles an empty report", () => {
    expect(groupByDay([])).toEqual([]);
  });
});
