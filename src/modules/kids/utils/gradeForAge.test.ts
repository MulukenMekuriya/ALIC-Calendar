import { describe, it, expect } from "vitest";
import {
  schoolYearAge,
  suggestedGradeSortOrder,
  suggestGrade,
  type GradeOption,
} from "./gradeForAge";

/** ALIC's rooms, in the order church.school_grades sorts them. */
const ROOMS: GradeOption[] = [
  { school_grade_id: "age1_3", grade_name: "Ages 1-3", sort_order: 0 },
  { school_grade_id: "prek", grade_name: "Pre-K", sort_order: 10 },
  { school_grade_id: "k", grade_name: "Kindergarten", sort_order: 20 },
  { school_grade_id: "g1", grade_name: "Grade 1", sort_order: 30 },
  { school_grade_id: "g2", grade_name: "Grade 2", sort_order: 40 },
  { school_grade_id: "g3", grade_name: "Grade 3", sort_order: 50 },
  { school_grade_id: "g4", grade_name: "Grade 4", sort_order: 60 },
  { school_grade_id: "g5", grade_name: "Grade 5", sort_order: 70 },
  { school_grade_id: "g6", grade_name: "Grade 6", sort_order: 80 },
  { school_grade_id: "g7", grade_name: "Grade 7", sort_order: 90 },
  { school_grade_id: "g8", grade_name: "Grade 8", sort_order: 100 },
];

const AUG = new Date(2026, 7, 21); // 21 Aug 2026 — new school year
const MAY = new Date(2026, 4, 10); // 10 May 2026 — old school year

describe("schoolYearAge", () => {
  it("counts the age a child turns during the school year", () => {
    expect(schoolYearAge(2021, AUG)).toBe(5);
  });

  it("does not roll over until August", () => {
    // Same child, three months earlier, is still in the previous school year.
    expect(schoolYearAge(2021, MAY)).toBe(4);
  });
});

describe("suggestedGradeSortOrder", () => {
  it("maps the US convention: 5 in Kindergarten, 13 in Grade 8", () => {
    expect(suggestedGradeSortOrder(2021, AUG)).toBe(20); // age 5  -> Kindergarten
    expect(suggestedGradeSortOrder(2013, AUG)).toBe(100); // age 13 -> Grade 8
  });

  it("puts a four-year-old in Pre-K", () => {
    expect(suggestedGradeSortOrder(2022, AUG)).toBe(10);
  });

  it("sends every nursery age to the one nursery grade", () => {
    // Kidventure takes 1 to 3 and is a single classroom, so all three ages
    // resolve to sort_order 0 rather than stepping down into negatives that
    // match no row in church.school_grades.
    expect(suggestedGradeSortOrder(2023, AUG)).toBe(0); // age 3
    expect(suggestedGradeSortOrder(2024, AUG)).toBe(0); // age 2
    expect(suggestedGradeSortOrder(2025, AUG)).toBe(0); // age 1
  });

  it("offers nothing below one or for an age that wants a human", () => {
    expect(suggestedGradeSortOrder(2026, AUG)).toBeNull(); // under one
    expect(suggestedGradeSortOrder(2000, AUG)).toBeNull(); // adult
    expect(suggestedGradeSortOrder(null, AUG)).toBeNull();
    expect(suggestedGradeSortOrder(undefined, AUG)).toBeNull();
    expect(suggestedGradeSortOrder(NaN, AUG)).toBeNull();
  });
});

describe("suggestGrade", () => {
  it("preselects the matching classroom", () => {
    expect(suggestGrade(2018, ROOMS, AUG)?.grade_name).toBe("Grade 3");
  });

  it("never silently drops an older child into the youngest room", () => {
    // A Grade 10 visitor at a church whose rooms stop at Grade 8. Falling back
    // to "nothing" sent them to the emptiest room in the building, which is how
    // a fifteen-year-old ends up sitting with the four-year-olds.
    expect(suggestGrade(2010, ROOMS, AUG)?.grade_name).toBe("Grade 8");
  });

  it("preselects the nursery room for a toddler", () => {
    expect(suggestGrade(2025, ROOMS, AUG)?.school_grade_id).toBe("age1_3");
    expect(suggestGrade(2023, ROOMS, AUG)?.school_grade_id).toBe("age1_3");
  });

  it("does not put a four-year-old in the nursery", () => {
    // The boundary that matters: Pre-K starts at four and Kidventure stops at
    // three, so an off-by-one here puts a school-age child with the toddlers.
    expect(suggestGrade(2022, ROOMS, AUG)?.school_grade_id).toBe("prek");
  });

  it("falls back to the closest room at a church with no nursery", () => {
    // Still a suggestion the volunteer can change, not an assignment.
    const noNursery = ROOMS.filter((r) => r.school_grade_id !== "age1_3");
    expect(suggestGrade(2025, noNursery, AUG)?.school_grade_id).toBe("prek");
  });

  it("offers nothing for a baby under one", () => {
    expect(suggestGrade(2026, ROOMS, AUG)).toBeNull();
  });

  it("copes with a church that offers no classrooms", () => {
    expect(suggestGrade(2018, [], AUG)).toBeNull();
  });

  it("is stable across the whole Pre-K to Grade 8 range", () => {
    const expected = [
      [2022, "Pre-K"], [2021, "Kindergarten"], [2020, "Grade 1"],
      [2019, "Grade 2"], [2018, "Grade 3"], [2017, "Grade 4"],
      [2016, "Grade 5"], [2015, "Grade 6"], [2014, "Grade 7"],
      [2013, "Grade 8"],
    ] as const;
    for (const [year, grade] of expected) {
      expect(suggestGrade(year, ROOMS, AUG)?.grade_name, `born ${year}`).toBe(grade);
    }
  });
});
