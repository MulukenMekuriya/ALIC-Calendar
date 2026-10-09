import { describe, it, expect } from "vitest";
import { filterChildren, pivotChildren, sortChildren, type ChildVisitRow } from "./childAttendance";

// Six Sundays, newest first, as the report lists them.
const SUNDAYS = ["2026-10-04", "2026-09-27", "2026-09-20", "2026-09-13", "2026-09-06", "2026-08-30"];

const visit = (id: string, name: string, date: string, room = "Joy", first = "2026-01-04"): ChildVisitRow => ({
  child_person_id: id,
  child_name: name,
  session_date: date,
  room_name: room,
  first_check_in: first,
});

const ROWS: ChildVisitRow[] = [
  // Hana: five of six, last week in Shine.
  ...["2026-10-04", "2026-09-27", "2026-09-20", "2026-09-13", "2026-08-30"].map((d) =>
    visit("hana", "Hana Bekele", d, d === "2026-10-04" ? "Shine" : "Joy"),
  ),
  // Abel: came twice early on, not for the last month.
  visit("abel", "Abel Tesfaye", "2026-09-06"),
  visit("abel", "Abel Tesfaye", "2026-08-30"),
  // Ruth: first ever visit this week.
  visit("ruth", "Ruth Alemu", "2026-10-04", "Joy", "2026-10-04"),
  // A Wednesday that is not one of the dates shown.
  visit("ruth", "Ruth Alemu", "2026-10-07", "Joy", "2026-10-04"),
];

describe("pivotChildren", () => {
  const kids = pivotChildren(ROWS, SUNDAYS);
  const byId = Object.fromEntries(kids.map((k) => [k.id, k]));

  it("counts each child's dates out of the dates shown, ignoring others", () => {
    expect(byId.hana.attended).toBe(5);
    expect(byId.hana.of).toBe(6);
    expect(byId.ruth.attended).toBe(1);
  });

  it("names the classroom of their most recent date", () => {
    expect(byId.hana.room).toBe("Shine");
    expect(byId.hana.visits.get("2026-09-27")).toBe("Joy");
  });

  it("marks a regular, a newcomer, and a child who has stopped coming", () => {
    expect([byId.hana.isRegular, byId.ruth.isNew, byId.abel.isMissing]).toEqual([true, true, true]);
    expect(byId.hana.isMissing).toBe(false);
    // One visit is a visitor, not a child who has stopped coming.
    expect(byId.ruth.isMissing).toBe(false);
  });
});

describe("filterChildren and sortChildren", () => {
  const kids = pivotChildren(ROWS, SUNDAYS);

  it("filters by group, classroom and name together", () => {
    expect(filterChildren(kids, "missing").map((k) => k.id)).toEqual(["abel"]);
    expect(filterChildren(kids, "all", "", "Shine").map((k) => k.id)).toEqual(["hana"]);
    expect(filterChildren(kids, "all", "ruth").map((k) => k.id)).toEqual(["ruth"]);
  });

  it("sorts by name, by how often, or by who came most recently", () => {
    expect(sortChildren(kids, "name").map((k) => k.id)).toEqual(["abel", "hana", "ruth"]);
    expect(sortChildren(kids, "attended").map((k) => k.id)).toEqual(["hana", "abel", "ruth"]);
    expect(sortChildren(kids, "last").map((k) => k.id)).toEqual(["hana", "ruth", "abel"]);
  });
});
