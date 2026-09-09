/**
 * Formatting a Postgres DATE for a human.
 *
 * `session_date` is a calendar date — 2026-08-21 is that Sunday everywhere, not
 * an instant. But `new Date("2026-08-21")` parses the bare form as midnight
 * UTC, and `toLocaleDateString` then renders that instant in the browser's
 * zone. In Maryland (UTC-4) midnight UTC is 8pm the evening BEFORE, so every
 * label printed at ALIC read "Aug 20" on the 21st.
 *
 * Splitting the parts and building a LOCAL date keeps the calendar day the
 * database meant. Nothing here is an instant, so nothing can shift across a
 * zone boundary.
 */

/** Render a Postgres DATE ("YYYY-MM-DD") as e.g. "Aug 21". */
export function formatSessionDate(
  isoDate: string | null | undefined,
  options: Intl.DateTimeFormatOptions = { month: "short", day: "numeric" }
): string {
  const parts = parseIsoDate(isoDate);
  if (!parts) return "";
  return parts.toLocaleDateString("en-US", options);
}

/**
 * "YYYY-MM-DD" to a Date at local midnight, or null if it is not a date.
 *
 * Returns null rather than an Invalid Date: a label that silently prints
 * "Invalid Date" is worse than one that prints nothing.
 */
export function parseIsoDate(isoDate: string | null | undefined): Date | null {
  if (!isoDate) return null;
  const m = /^(\d{4})-(\d{2})-(\d{2})/.exec(isoDate);
  if (!m) return null;
  const [, y, mo, d] = m;
  const date = new Date(Number(y), Number(mo) - 1, Number(d));
  return Number.isNaN(date.getTime()) ? null : date;
}

/**
 * Render an instant as a wall-clock time, e.g. "10:32 AM".
 *
 * This is the one thing in this file that IS an instant, and the exception is
 * deliberate. Everything above is careful not to treat session_date as a moment
 * — a calendar day must not shift across a zone boundary. The time a label was
 * printed is the opposite: a real moment, and the browser's own zone is the
 * right one to render it in, because the desk, the printer and the volunteer
 * reading the tag are all standing in it.
 */
export function formatClockTime(at: Date = new Date()): string {
  return at.toLocaleTimeString("en-US", { hour: "numeric", minute: "2-digit" });
}
