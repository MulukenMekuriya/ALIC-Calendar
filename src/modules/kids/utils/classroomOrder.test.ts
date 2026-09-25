import { describe, it, expect } from "vitest";
import {
  sortClassrooms,
  type SortableClassroom,
  type SortableGrade,
} from "./classroomOrder";

/** church.school_grades as ALIC seeds it: Pre-K 10, stepping by 10. */
const GRADES: SortableGrade[] = [
  { id: "prek", sort_order: 10 },
  { id: "k", sort_order: 20 },
  { id: "g1", sort_order: 30 },
  { id: "g2", sort_order: 40 },
];

function room(
  room_name: string,
  sort_order: number | null,
  school_grade_id: string | null = null
): SortableClassroom {
  return { room_name, config: { sort_order, school_grade_id } };
}

const names = (rooms: SortableClassroom[]) => rooms.map((r) => r.room_name);

describe("sortClassrooms", () => {
  it("orders by sort_order, which is what the live board uses", () => {
    const rooms = [room("Zulu", 10), room("Alpha", 30), room("Mike", 20)];
    expect(names(sortClassrooms(rooms, GRADES, "order"))).toEqual([
      "Zulu",
      "Mike",
      "Alpha",
    ]);
  });

  it("orders by name when asked, ignoring sort_order entirely", () => {
    const rooms = [room("Zulu", 10), room("Alpha", 30), room("Mike", 20)];
    expect(names(sortClassrooms(rooms, GRADES, "name"))).toEqual([
      "Alpha",
      "Mike",
      "Zulu",
    ]);
  });

  it("orders by the grade's own sort_order, not by the grade id", () => {
    // Ids sort "g1" < "g2" < "k" < "prek" alphabetically, which is the wrong
    // order for a school. Only the grade's sort_order gets this right.
    const rooms = [
      room("Second", null, "g2"),
      room("PreK", null, "prek"),
      room("First", null, "g1"),
      room("Kinder", null, "k"),
    ];
    expect(names(sortClassrooms(rooms, GRADES, "grade"))).toEqual([
      "PreK",
      "Kinder",
      "First",
      "Second",
    ]);
  });

  it("puts a room with no order last rather than first", () => {
    // A null sort_order must not sort as zero - Kidventure genuinely sits at
    // sort_order 0 in production, and an unconfigured room must not outrank it.
    const rooms = [room("Unset", null), room("Kidventure", 0), room("Joy", 10)];
    expect(names(sortClassrooms(rooms, GRADES, "order"))).toEqual([
      "Kidventure",
      "Joy",
      "Unset",
    ]);
  });

  it("puts a room with no grade last when sorting by grade", () => {
    const rooms = [room("Ungraded", 5, null), room("PreK", 90, "prek")];
    expect(names(sortClassrooms(rooms, GRADES, "grade"))).toEqual([
      "PreK",
      "Ungraded",
    ]);
  });

  it("breaks ties by name so the order never shuffles between renders", () => {
    const rooms = [room("Beta", 10), room("Alpha", 10)];
    expect(names(sortClassrooms(rooms, GRADES, "order"))).toEqual([
      "Alpha",
      "Beta",
    ]);
  });

  it("falls back to sort_order when two rooms teach the same grade", () => {
    const rooms = [room("Joy B", 20, "prek"), room("Joy A", 10, "prek")];
    expect(names(sortClassrooms(rooms, GRADES, "grade"))).toEqual([
      "Joy A",
      "Joy B",
    ]);
  });

  it("tolerates a room whose grade is not in the grade list", () => {
    const rooms = [room("Ghost", 10, "retired-grade"), room("Joy", 20, "prek")];
    expect(names(sortClassrooms(rooms, GRADES, "grade"))).toEqual([
      "Joy",
      "Ghost",
    ]);
  });

  it("handles a room with no config at all", () => {
    const rooms: SortableClassroom[] = [
      { room_name: "Unconfigured", config: null },
      room("Joy", 10, "prek"),
    ];
    expect(names(sortClassrooms(rooms, GRADES, "order"))).toEqual([
      "Joy",
      "Unconfigured",
    ]);
  });

  it("does not mutate the array it is given", () => {
    const rooms = [room("Zulu", 10), room("Alpha", 30)];
    const before = names(rooms);
    sortClassrooms(rooms, GRADES, "name");
    expect(names(rooms)).toEqual(before);
  });
});
