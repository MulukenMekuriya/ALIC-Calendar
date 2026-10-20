/**
 * The budget request season, as the Budget page shows it.
 *
 * The rule itself is budget.assert_request_season, which refuses whatever the
 * screen offers. This is so the screen does not offer a button that is going
 * to be refused, and says why.
 */

import type { RequestSeason } from "../types";

/** "Sunday, November 1", from a YYYY-MM-DD day, never shifted by a time zone. */
export function seasonDay(iso: string): string {
  const [y, m, d] = iso.split("-").map(Number);
  return new Date(Date.UTC(y, m - 1, d)).toLocaleDateString("en-US", {
    weekday: "long",
    month: "long",
    day: "numeric",
    timeZone: "UTC",
  });
}

/**
 * Whether a request in this fiscal year is closed to the person looking.
 *
 * Nothing is locked in a branch without a season, or for an admin of the
 * branch. Otherwise only the year in season can be changed, and only while it
 * is open.
 */
export function isRequestLocked(
  season: RequestSeason | null | undefined,
  fiscalYearId: string | null | undefined,
): boolean {
  if (!season || !season.enforced || season.can_bypass) return false;
  return !(
    season.state === "open" &&
    !!fiscalYearId &&
    fiscalYearId === season.fiscal_year_id
  );
}

/** Whether the person looking may start a new request at all. */
export function canStartRequest(season: RequestSeason | null | undefined): boolean {
  return !isRequestLocked(season, season?.fiscal_year_id);
}

export interface SeasonNotice {
  tone: "open" | "urgent" | "closed" | "upcoming";
  title: string;
  body: string;
}

const UPCOMING_NOTICE_DAYS = 30;

/**
 * What the banner says, or nothing. `submitted` is whether the person's
 * ministry already has a request in for the year in season.
 */
export function seasonNotice(
  season: RequestSeason | null | undefined,
  submitted: boolean,
  now: Date = new Date(),
): SeasonNotice | null {
  if (!season || !season.enforced) return null;
  const year = season.fiscal_year;
  const deadline = seasonDay(season.last_day);

  if (season.state === "open") {
    const n = season.days_left ?? 0;
    const left = n === 0 ? "Today is the last day" : n === 1 ? "1 day left" : `${n} days left`;
    if (submitted) {
      return {
        tone: "open",
        title: `Your ${year} budget request is in`,
        body: `You can still review and edit it until ${deadline}.`,
      };
    }
    return {
      tone: n <= 4 ? "urgent" : "open",
      title: `${year} budget requests are due ${deadline}`,
      body: season.can_bypass
        ? `${left}. After the deadline only administrators can add or change requests, and ministries that sent nothing have last year's budget carried over.`
        : `${left}. After the deadline requests lock, and a ministry that has sent nothing has last year's budget carried over.`,
    };
  }

  if (season.state === "closed") {
    return {
      tone: "closed",
      title: `${year} budget requests closed on ${deadline}`,
      body: season.can_bypass
        ? "As an administrator you can still add or change requests."
        : "To change a request now, please ask an administrator.",
    };
  }

  const daysToOpen = (Date.parse(season.opens_at) - now.getTime()) / 86_400_000;
  if (daysToOpen > UPCOMING_NOTICE_DAYS) return null;
  return {
    tone: "upcoming",
    title: `${year} budget requests open on ${seasonDay(season.opens_on)}`,
    body: `They can be made until ${deadline}. Now is a good time to prepare your ministry's budget and calendar.`,
  };
}
