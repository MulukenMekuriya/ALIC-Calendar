/**
 * Saying when something is, the way a person would say it.
 *
 * "2026-09-14T13:00:00+00:00" is not an answer to "when is the prayer
 * meeting". "Sunday, 9:00 AM" is, and "Happening now" is better still. Pure,
 * with `now` passed in, so every branch is testable without mocking the clock.
 *
 * All of it works in the reader's local time, which is the right frame for a
 * member deciding whether to leave the house — and the same frame the calendar
 * module already renders in, so the two never disagree.
 */

const DAY_MS = 24 * 60 * 60 * 1000;

/** "9:00 AM"; the minutes are dropped when they are zero. */
export function clockTime(date: Date): string {
  const minutes = date.getMinutes();
  return date
    .toLocaleTimeString("en-US", {
      hour: "numeric",
      ...(minutes === 0 ? {} : { minute: "2-digit" }),
      hour12: true,
    })
    .replace(/\s/g, " ");
}

/** Midnight local, for comparing two instants by the day they fall on. */
function startOfDay(date: Date): Date {
  const copy = new Date(date);
  copy.setHours(0, 0, 0, 0);
  return copy;
}

export interface WhenLabel {
  /** "Happening now", "Today, 10 AM", "Sunday, 9 AM", "Sun, Oct 12, 9 AM". */
  label: string;
  /** Started and not yet finished. The page gives this one a live dot. */
  isNow: boolean;
  isToday: boolean;
}

export function describeWhen(startsAt: string, endsAt: string, now: Date): WhenLabel {
  const start = new Date(startsAt);
  const end = new Date(endsAt);

  // In progress beats every other description: someone reading this at 10:20
  // on a Sunday wants to know the service has begun, not that it began at ten.
  if (start <= now && end > now) {
    return { label: "Happening now", isNow: true, isToday: true };
  }

  const daysAway = Math.round(
    (startOfDay(start).getTime() - startOfDay(now).getTime()) / DAY_MS
  );
  const time = clockTime(start);

  if (daysAway === 0) return { label: `Today, ${time}`, isNow: false, isToday: true };
  if (daysAway === 1) return { label: `Tomorrow, ${time}`, isNow: false, isToday: false };

  // Inside a week a weekday name is unambiguous and reads faster than a date.
  // Past that it stops being unambiguous, so the date comes back.
  if (daysAway > 1 && daysAway < 7) {
    const weekday = start.toLocaleDateString("en-US", { weekday: "long" });
    return { label: `${weekday}, ${time}`, isNow: false, isToday: false };
  }

  const stamp = start.toLocaleDateString("en-US", {
    weekday: "short",
    day: "numeric",
    month: "short",
  });
  return { label: `${stamp}, ${time}`, isNow: false, isToday: false };
}

/**
 * How a group meets: "Wednesdays at 7 PM · Fellowship Hall".
 *
 * Every part is optional in the database and so is optional here. A group with
 * none of the three returns an empty string rather than a lonely separator,
 * and the caller renders nothing at all — which is honest, because what the
 * church knows about that group is just its name.
 *
 * meeting_day is free text on church.groups. It is pluralised only when it
 * looks like a weekday, so "Wednesday" becomes "Wednesdays" and "First
 * Saturday of the month" is left exactly as somebody typed it.
 */
const WEEKDAYS = [
  "sunday", "monday", "tuesday", "wednesday", "thursday", "friday", "saturday",
];

export function describeMeeting(
  day: string | null,
  time: string | null,
  place: string | null
): string {
  const parts: string[] = [];

  const trimmedDay = day?.trim();
  if (trimmedDay) {
    parts.push(
      WEEKDAYS.includes(trimmedDay.toLowerCase()) ? `${trimmedDay}s` : trimmedDay
    );
  }

  // A TIME column arrives as "19:00:00" — no date and no zone, so it must not
  // go anywhere near `new Date(value)`, which would read it as a local
  // timestamp on the epoch and shift it by the reader's offset.
  const match = time?.match(/^(\d{2}):(\d{2})/);
  if (match) {
    const [, hh, mm] = match;
    const asDate = new Date(2000, 0, 1, Number(hh), Number(mm));
    parts.push(parts.length ? `at ${clockTime(asDate)}` : clockTime(asDate));
  }

  const when = parts.join(" ");
  const trimmedPlace = place?.trim();
  if (when && trimmedPlace) return `${when} · ${trimmedPlace}`;
  return when || trimmedPlace || "";
}

/**
 * Whose birthday falls in the month being read.
 *
 * church.people carries a birth month and no birth day, which sets the shape
 * of this: a month is enough to say "Selam has a birthday this month" and not
 * enough to put a date on a card. That is a smaller promise than most church
 * software makes, and it is one this database can actually keep.
 *
 * Children included — they are the ones who care most.
 */
export function birthdaysThisMonth<T extends { display_name: string; birth_month: number | null }>(
  members: T[],
  now: Date
): T[] {
  const month = now.getMonth() + 1;
  return members.filter((m) => m.birth_month === month);
}

/** "September" — the heading that sits above the names. */
export function monthName(now: Date): string {
  return now.toLocaleDateString("en-US", { month: "long" });
}

/**
 * "Good morning" / "Good afternoon" / "Good evening".
 *
 * Small, and the reason it is here rather than inline is that a greeting keyed
 * to the reader's clock is the one thing on the page that proves it was
 * rendered for them just now.
 */
export function greeting(now: Date): string {
  const hour = now.getHours();
  if (hour < 12) return "Good morning";
  if (hour < 17) return "Good afternoon";
  return "Good evening";
}

/**
 * "Today", "Yesterday", "3 days ago", "Mar 12, 2025".
 *
 * For a ledger of things that have already happened, where the reader mostly
 * wants to know "was that this week or last month" and only occasionally wants
 * the exact date. Takes a DATE-ish string ("2026-09-07") or a timestamp;
 * either way only the day is compared, so a gift recorded at 23:50 and read at
 * 00:10 says "Yesterday" rather than "14 minutes ago", which is what a person
 * means by it.
 */
export function relativeDay(value: string, now: Date): string {
  // A bare "2026-09-07" through new Date() is parsed as UTC midnight and can
  // land on the previous day for readers west of Greenwich. Split it instead.
  const dateOnly = value.match(/^(\d{4})-(\d{2})-(\d{2})$/);
  const then = dateOnly
    ? new Date(Number(dateOnly[1]), Number(dateOnly[2]) - 1, Number(dateOnly[3]))
    : new Date(value);

  const days = Math.round(
    (startOfDay(now).getTime() - startOfDay(then).getTime()) / DAY_MS
  );

  if (days === 0) return "Today";
  if (days === 1) return "Yesterday";
  if (days < 7) return `${days} days ago`;
  if (days < 14) return "Last week";
  if (days < 31) return `${Math.floor(days / 7)} weeks ago`;

  return then.toLocaleDateString("en-US", {
    day: "numeric",
    month: "short",
    // The year only once it is not this one. "Mar 12" is plenty inside the
    // current year and "Mar 12, 2025" stops being ambiguous outside it.
    ...(then.getFullYear() === now.getFullYear() ? {} : { year: "numeric" }),
  });
}
