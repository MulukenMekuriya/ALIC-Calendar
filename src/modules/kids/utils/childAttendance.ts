/**
 * Attendance per child: the rows of church.kids_child_attendance (a child, on
 * a date they came) turned into one row per child across the dates shown.
 *
 * Pure, so the three things a leader acts on can be tested:
 *
 *   regular    came to most of the dates shown (75%+, and more than once)
 *   new        their first check-in ever falls inside the range
 *   missing    came at least twice, but not in the last three weeks of the
 *              range: the family a leader might ring
 *
 * "The dates shown" is the report's own list (Sundays only unless the report
 * shows every date), so a child's "4 of 6" and the grid's columns agree.
 */

export interface ChildVisitRow {
  child_person_id: string;
  child_name: string;
  session_date: string;
  room_name: string;
  first_check_in: string;
}

export interface ChildAttendance {
  id: string;
  name: string;
  /** Their classroom on the most recent date they came. */
  room: string;
  /** Date they came -> the classroom they were in. */
  visits: Map<string, string>;
  attended: number;
  /** Of the dates shown. */
  of: number;
  /** attended / of, 0 to 1. */
  rate: number;
  lastSeen: string;
  firstCheckIn: string;
  isNew: boolean;
  isRegular: boolean;
  isMissing: boolean;
}

export type ChildFilter = "all" | "regular" | "new" | "missing";
export type ChildSort = "name" | "attended" | "last";

const DAY = 86_400_000;
const days = (a: string, b: string) =>
  Math.round((new Date(`${a}T00:00:00`).getTime() - new Date(`${b}T00:00:00`).getTime()) / DAY);

/**
 * @param dates the dates shown, newest first (the report's own order)
 */
export function pivotChildren(rows: readonly ChildVisitRow[], dates: readonly string[]): ChildAttendance[] {
  if (dates.length === 0) return [];
  const shown = new Set(dates);
  const latest = dates[0];
  const earliest = dates[dates.length - 1];

  const byChild = new Map<string, ChildVisitRow[]>();
  for (const row of rows) {
    if (!shown.has(row.session_date)) continue;
    const bucket = byChild.get(row.child_person_id);
    if (bucket) bucket.push(row);
    else byChild.set(row.child_person_id, [row]);
  }

  return [...byChild.values()].map((visits) => {
    const sorted = [...visits].sort((a, b) => b.session_date.localeCompare(a.session_date));
    const last = sorted[0];
    const attended = sorted.length;
    const rate = attended / dates.length;
    return {
      id: last.child_person_id,
      name: last.child_name,
      room: last.room_name,
      visits: new Map(sorted.map((v) => [v.session_date, v.room_name])),
      attended,
      of: dates.length,
      rate,
      lastSeen: last.session_date,
      firstCheckIn: last.first_check_in,
      isNew: last.first_check_in >= earliest,
      isRegular: attended >= 2 && rate >= 0.75,
      isMissing: attended >= 2 && days(latest, last.session_date) >= 21,
    };
  });
}

export function filterChildren(
  children: readonly ChildAttendance[],
  filter: ChildFilter,
  query = "",
  room: string | null = null,
): ChildAttendance[] {
  const q = query.trim().toLowerCase();
  return children.filter(
    (c) =>
      (filter === "all" ||
        (filter === "regular" && c.isRegular) ||
        (filter === "new" && c.isNew) ||
        (filter === "missing" && c.isMissing)) &&
      (!room || c.room === room) &&
      (!q || c.name.toLowerCase().includes(q)),
  );
}

export function sortChildren(children: readonly ChildAttendance[], sort: ChildSort): ChildAttendance[] {
  const byName = (a: ChildAttendance, b: ChildAttendance) => a.name.localeCompare(b.name);
  return [...children].sort((a, b) =>
    sort === "attended"
      ? b.attended - a.attended || byName(a, b)
      : sort === "last"
        ? b.lastSeen.localeCompare(a.lastSeen) || byName(a, b)
        : byName(a, b),
  );
}
