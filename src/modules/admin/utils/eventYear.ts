/**
 * Reading the event review board one year at a time.
 *
 * Requests for next year's calendar are submitted while the current year is
 * still running, so the four tab counts hold two calendars at once and stop
 * answering the question they are there to answer: how much of THIS year has
 * been approved, published, rejected. Narrowing is by the date the event
 * happens on — the year the calendar is for, not the year it was typed in.
 */

/** Sentinel for "no year chosen": the whole board, which is how it read before. */
export const ALL_YEARS = "all";

/**
 * The year an event belongs to, read in the viewer's timezone — the same clock
 * the board already formats every date with, so the two never disagree.
 */
export const eventYear = (startsAt: string): number => new Date(startsAt).getFullYear();

/** Narrow a list to one calendar year. ALL_YEARS hands the list straight back. */
export const filterEventsByYear = <T extends { starts_at: string }>(
  events: T[],
  year: string
): T[] => {
  if (year === ALL_YEARS) return events;
  return events.filter((event) => String(eventYear(event.starts_at)) === year);
};

/**
 * The years the picker offers: every year the board actually holds, newest
 * first, with the current year always present so a calendar that has not been
 * filled in yet still offers something to choose. An unparseable date is left
 * out rather than offering a NaN year.
 */
export const yearsInEvents = (
  lists: Array<{ starts_at: string }[] | undefined | null>,
  today: Date = new Date()
): number[] => {
  const years = new Set<number>([today.getFullYear()]);

  lists.forEach((list) => {
    (list || []).forEach((event) => {
      const year = eventYear(event.starts_at);
      if (!Number.isNaN(year)) years.add(year);
    });
  });

  return Array.from(years).sort((a, b) => b - a);
};
