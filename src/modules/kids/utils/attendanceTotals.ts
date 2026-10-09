/**
 * Totals for the attendance report.
 *
 * church.kids_attendance_report returns one row per room per service, and
 * nothing anywhere added them up — a leader asking "how many children came on
 * Sunday" had to do it in their head across eleven rooms.
 *
 * WHAT MAY BE SUMMED, AND WHAT MAY NOT. The report's own grouping decides
 * this, and getting it wrong produces a number that looks authoritative and
 * is not:
 *
 *   children             count(DISTINCT child) per session+room. A child holds
 *                        exactly one open check-in per session
 *                        (uq_kids_check_ins_one_active_per_session) and a
 *                        transfer UPDATEs the room rather than adding a row,
 *                        so summing ACROSS ROOMS within a service is exact.
 *   volunteers           count(DISTINCT person) per session+room, and
 *                        uq_kids_staffing_one_active allows one active row per
 *                        person per session, so again exact across rooms.
 *   overrides,           plain count(*) over check-in rows. Always summable.
 *   not_checked_out
 *   avg_minutes          an AVERAGE. Summing it is meaningless and averaging
 *                        the averages weights a room of two the same as a room
 *                        of thirty, so it is weighted by `children` here.
 *
 * ACROSS SERVICES IS THE ONE THAT IS NOT EXACT. A child at both the 9:00 and
 * the 11:00 is two check-ins and counts twice in a day that has two services.
 * That is the right answer for "how many children did we look after today" and
 * the wrong one for "how many different children came". ALIC runs one service
 * a date today, so the two coincide, but the schema allows more — so the group
 * carries `serviceCount` and the screen says so rather than quietly picking a
 * meaning.
 */

export interface AttendanceTotalsRow {
  session_date: string;
  service_label?: string | null;
  children: number;
  first_time_visitors: number;
  volunteers: number;
  overrides: number;
  not_checked_out: number;
  avg_minutes: number | null;
}

export interface AttendanceTotals {
  children: number;
  first_time_visitors: number;
  volunteers: number;
  overrides: number;
  not_checked_out: number;
  /** Weighted by `children`; null when nothing was checked out. */
  avg_minutes: number | null;
}

export interface AttendanceDay<T extends AttendanceTotalsRow> {
  session_date: string;
  rows: T[];
  totals: AttendanceTotals;
  /** Distinct service_labels on this date. >1 means children may count twice. */
  serviceCount: number;
}

const ZERO: AttendanceTotals = {
  children: 0,
  first_time_visitors: 0,
  volunteers: 0,
  overrides: 0,
  not_checked_out: 0,
  avg_minutes: null,
};

export function sumAttendance(
  rows: readonly AttendanceTotalsRow[]
): AttendanceTotals {
  if (rows.length === 0) return { ...ZERO };

  let minuteWeight = 0;
  let minuteTotal = 0;
  const totals = rows.reduce<AttendanceTotals>(
    (acc, r) => {
      // A room where nobody was collected contributes no average and no
      // weight, rather than dragging the mean towards zero.
      if (r.avg_minutes !== null && r.children > 0) {
        minuteTotal += r.avg_minutes * r.children;
        minuteWeight += r.children;
      }
      return {
        children: acc.children + r.children,
        first_time_visitors: acc.first_time_visitors + r.first_time_visitors,
        volunteers: acc.volunteers + r.volunteers,
        overrides: acc.overrides + r.overrides,
        not_checked_out: acc.not_checked_out + r.not_checked_out,
        avg_minutes: null,
      };
    },
    { ...ZERO }
  );

  totals.avg_minutes =
    minuteWeight > 0 ? Math.round(minuteTotal / minuteWeight) : null;
  return totals;
}

/**
 * Group the report by date, newest first, preserving the row order the server
 * gave within each date.
 */
export function groupByDay<T extends AttendanceTotalsRow>(
  rows: readonly T[]
): AttendanceDay<T>[] {
  const byDate = new Map<string, T[]>();
  for (const row of rows) {
    const bucket = byDate.get(row.session_date);
    if (bucket) bucket.push(row);
    else byDate.set(row.session_date, [row]);
  }

  return [...byDate.entries()]
    .sort((a, b) => b[0].localeCompare(a[0]))
    .map(([session_date, dayRows]) => ({
      session_date,
      rows: dayRows,
      totals: sumAttendance(dayRows),
      serviceCount: new Set(dayRows.map((r) => r.service_label ?? "")).size,
    }));
}

/**
 * The headline numbers for a range, read off the grouped days.
 *
 * `perDay` is the average children per date in the range, not per room, which
 * is the number a leader means by "how many do we usually have". `latest` is
 * compared with the date before it, so the change is week on week rather than
 * against an average that the latest Sunday is itself part of.
 */
export interface AttendanceSummary {
  days: number;
  totals: AttendanceTotals;
  perDay: number | null;
  peak: { session_date: string; children: number } | null;
  latest: { session_date: string; children: number; previous: number | null } | null;
  /** False when no room recorded a volunteer anywhere in the range. */
  volunteersRecorded: boolean;
}

export function summarizeDays<T extends AttendanceTotalsRow>(
  days: readonly AttendanceDay<T>[]
): AttendanceSummary {
  const totals = sumAttendance(days.flatMap((d) => d.rows));
  if (days.length === 0) {
    return { days: 0, totals, perDay: null, peak: null, latest: null, volunteersRecorded: false };
  }
  const peak = days.reduce((best, d) => (d.totals.children > best.totals.children ? d : best));
  // groupByDay is newest first.
  const [latest, previous] = days;
  return {
    days: days.length,
    totals,
    perDay: Math.round(totals.children / days.length),
    peak: { session_date: peak.session_date, children: peak.totals.children },
    latest: {
      session_date: latest.session_date,
      children: latest.totals.children,
      previous: previous ? previous.totals.children : null,
    },
    volunteersRecorded: totals.volunteers > 0,
  };
}

/** One classroom across the whole range. */
export interface RoomSummary {
  room_name: string;
  age_band_name: string | null;
  /** Dates the room was open (had a row). */
  sessions: number;
  total: number;
  /** Children per date it was open, rounded. */
  average: number;
  peak: number;
  first_time_visitors: number;
  avg_minutes: number | null;
}

/**
 * The same report turned on its side: one row per classroom, busiest first.
 * "Which rooms are growing" is a question the by-date view cannot answer
 * without a pencil.
 */
export function summarizeRooms<
  T extends AttendanceTotalsRow & { room_name: string; age_band_name?: string | null },
>(rows: readonly T[]): RoomSummary[] {
  const byRoom = new Map<string, T[]>();
  for (const row of rows) {
    const bucket = byRoom.get(row.room_name);
    if (bucket) bucket.push(row);
    else byRoom.set(row.room_name, [row]);
  }
  return [...byRoom.entries()]
    .map(([room_name, roomRows]) => {
      const totals = sumAttendance(roomRows);
      const sessions = new Set(roomRows.map((r) => r.session_date)).size;
      return {
        room_name,
        age_band_name: roomRows.find((r) => r.age_band_name)?.age_band_name ?? null,
        sessions,
        total: totals.children,
        average: sessions > 0 ? Math.round(totals.children / sessions) : 0,
        peak: Math.max(...roomRows.map((r) => r.children)),
        first_time_visitors: totals.first_time_visitors,
        avg_minutes: totals.avg_minutes,
      };
    })
    .sort((a, b) => b.average - a.average || a.room_name.localeCompare(b.room_name));
}

/** "1h 52m", "48m", or an em dash when nobody was collected. */
export function formatStay(minutes: number | null): string {
  if (minutes === null) return "—";
  if (minutes < 60) return `${minutes}m`;
  const h = Math.floor(minutes / 60);
  const m = minutes % 60;
  return m === 0 ? `${h}h` : `${h}h ${m}m`;
}
