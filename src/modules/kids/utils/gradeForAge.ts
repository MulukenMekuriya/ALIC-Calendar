/**
 * Suggesting a classroom for a child nobody has met before.
 *
 * ALIC's ten classrooms are keyed to SCHOOL GRADE — Joy A is Pre-K, Redeemed C
 * is Grade 8 — so grade, not age band, is what actually decides where a child
 * sits. The five age bands are far too coarse to help: "Elementary (5-10)"
 * spans six grades and five different rooms.
 *
 * A visiting family has no grade on file, which is why placement fell through
 * to "the emptiest open room, any grade" and a four-year-old could land in
 * Grade 8. The desk knows one thing about a visiting child within seconds of
 * asking — roughly how old they are — so that is what this turns into a
 * starting point.
 *
 * IT IS A SUGGESTION, NOT A DECISION. Held-back years, skipped years, birthdays
 * that fall the wrong side of the cutoff, and families new to the US school
 * system all make the arithmetic wrong for a real child. The volunteer picks
 * the class; this only decides which option is already selected when the
 * dropdown opens.
 *
 * THE ARITHMETIC. US convention: a child is 5 in Kindergarten, 6 in Grade 1,
 * and so on to 13 in Grade 8; Pre-K is 4. Grades run from the autumn, so from
 * August onward a child is treated as being in the year they are about to
 * start rather than the one they have just finished.
 *
 * BELOW SCHOOL AGE. Kidventure takes ages 1 to 3, which is one classroom and
 * therefore one grade — "Ages 1-3" at sort_order 0. The formula already sends
 * age 3 to 0, so ages 1 and 2 are clamped there rather than continuing down
 * into negative orders that match no row. A one-year-old and a three-year-old
 * are suggested the same room because it is the same room.
 *
 * Only birth YEAR is on file — the plan dropped day-of-month deliberately — so
 * the age here is an approximation and the September cutoff cannot be applied
 * exactly. That is a further reason this is a default and not an assignment.
 */

/** Where the school year turns over. August, so the new year is anticipated. */
const SCHOOL_YEAR_STARTS_MONTH = 8;

/** Youngest and oldest ages this maps; outside it, no suggestion is offered. */
const YOUNGEST_AGE = 1;
const OLDEST_AGE = 18;

/**
 * The floor of the grade ladder. Ages 1-3 all sit in one nursery-age room, so
 * everything below Pre-K resolves to the same sort_order rather than stepping
 * on down into negatives.
 */
const YOUNGEST_GRADE_SORT_ORDER = 0;

export interface GradeOption {
  school_grade_id: string;
  grade_name: string;
  sort_order: number;
}

/**
 * The school year a child is in, given only their birth year.
 *
 * Returns the age they turn during the current school year.
 */
export function schoolYearAge(birthYear: number, today: Date): number {
  const year = today.getFullYear();
  // getMonth() is zero-based; +1 to compare against a real month number.
  const inNewSchoolYear = today.getMonth() + 1 >= SCHOOL_YEAR_STARTS_MONTH;
  return (inNewSchoolYear ? year : year - 1) - birthYear;
}

/**
 * The `sort_order` of the grade a child of this age is most likely in.
 *
 * Pre-K is 10 and each grade steps by 10, matching church.school_grades, so
 * age 4 -> 10 (Pre-K), age 5 -> 20 (Kindergarten), age 13 -> 100 (Grade 8).
 * Ages 1, 2 and 3 all return 0, which is "Ages 1-3" — one room, one grade.
 *
 * Returns null outside the range — a nineteen-year-old wants a human decision,
 * not a guess.
 */
export function suggestedGradeSortOrder(
  birthYear: number | null | undefined,
  today: Date
): number | null {
  if (!birthYear || !Number.isFinite(birthYear)) return null;
  const age = schoolYearAge(birthYear, today);
  if (age < YOUNGEST_AGE || age > OLDEST_AGE) return null;
  return Math.max((age - 3) * 10, YOUNGEST_GRADE_SORT_ORDER);
}

/**
 * Pick the classroom option to preselect.
 *
 * Falls back to the CLOSEST offered grade rather than to nothing: a Grade 10
 * visitor at a church whose rooms stop at Grade 8 should land in the oldest
 * room on the list, where the volunteer can see and change it — not in the
 * emptiest room in the building, which is how a fifteen-year-old ends up
 * sitting with the four-year-olds.
 */
export function suggestGrade(
  birthYear: number | null | undefined,
  options: GradeOption[],
  today: Date
): GradeOption | null {
  if (options.length === 0) return null;
  const target = suggestedGradeSortOrder(birthYear, today);
  if (target === null) return null;

  const exact = options.find((o) => o.sort_order === target);
  if (exact) return exact;

  return options.reduce((best, o) =>
    Math.abs(o.sort_order - target) < Math.abs(best.sort_order - target) ? o : best
  );
}
