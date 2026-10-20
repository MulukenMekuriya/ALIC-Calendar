/**
 * The budget request reminder, in the words of the ALIC MD Leadership Council
 * and the look of the church's other emails.
 *
 * The words are Abel's (ALIC head), sent on 20 October 2026, with three
 * changes: the lock names budget requests only, because calendars are not
 * locked ("only budget requests need to be locked"); "if you have already
 * submitted, please disregard this" became the ministries still missing,
 * because a reminder only goes to those who have not; and a line says last
 * year's budget is carried over for a ministry that sends nothing.
 *
 * The look is the church's, drawn by _shared/churchEmail.ts. Kept apart from
 * index.ts, with no Deno imports, so vitest can test it and a preview can be
 * rendered without deploying.
 */

import {
  type ChurchEmail,
  DEFAULT_LOGO_URL,
  keepLastWordsTogether,
  renderChurchEmail,
  renderChurchText,
} from "../_shared/churchEmail.ts";

export { DEFAULT_LOGO_URL };

export type Stage = "upcoming" | "opened" | "reminder" | "final";

/** A row of budget.request_reminders, as claim_request_reminders returns it. */
export interface ReminderRow {
  id: string;
  stage: Stage;
  fiscal_year: number;
  send_on: string;
  opens_on: string;
  last_day: string;
  recipient_name: string | null;
  recipient_email: string;
  ministry_names: string[];
  signed_by: string;
}

/** Signed in already: alic.org/budget sends anyone else to sign in and back. */
export const FORM_URL = "https://alic.org/budget?request=budget";
const VERSE =
  "“Commit to the LORD whatever you do, and he will establish your plans.” Proverbs 16:3";

/** A YYYY-MM-DD date read as a calendar day, never shifted by a time zone. */
function day(iso: string): Date {
  const [y, m, d] = iso.split("-").map(Number);
  return new Date(Date.UTC(y, m - 1, d));
}

/** "November 1", as Abel writes it. */
export function monthDay(iso: string): string {
  return day(iso).toLocaleDateString("en-US", { month: "long", day: "numeric", timeZone: "UTC" });
}

/**
 * "Sunday, November 1", the day held to its month: on a phone the deadline
 * box wrapped and left the "1" alone on a line.
 */
export function weekdayMonthDay(iso: string): string {
  return day(iso)
    .toLocaleDateString("en-US", {
      weekday: "long", month: "long", day: "numeric", timeZone: "UTC",
    })
    .replace(/ (\d+)$/, "\u00a0$1");
}

/** Days from the day it is sent to the last day: 0 on the last day itself. */
export function daysLeft(row: Pick<ReminderRow, "send_on" | "last_day">): number {
  return Math.round((day(row.last_day).getTime() - day(row.send_on).getTime()) / 86_400_000);
}

function joinNames(names: string[]): string {
  if (names.length <= 1) return names[0] ?? "";
  return `${names.slice(0, -1).join(", ")} and ${names[names.length - 1]}`;
}

function leftLabel(n: number): string {
  return n === 0 ? "Today is the last day" : n === 1 ? "1 day left" : `${n} days left`;
}

/** Everything the email says, decided once so the HTML and the text agree. */
export function compose(row: ReminderRow) {
  const year = row.fiscal_year;
  const deadline = monthDay(row.last_day);
  const opens = monthDay(row.opens_on);
  const n = daysLeft(row);
  const firstName = (row.recipient_name ?? "").trim().split(/\s+/)[0];
  const greeting = firstName ? `Selam ${firstName},` : "Selam,";

  if (row.stage === "upcoming") {
    return {
      subject: `The ${year} budget and calendar request form opens ${opens}`,
      title: `Budget and calendar requests open ${opens}`,
      greeting,
      paragraphs: [
        `The Budget and Calendar Request Form for the upcoming year will officially open on ${opens}. All ministry leaders are encouraged to begin preparing their proposed budgets and ministry calendars in advance to ensure timely submission once the system opens.`,
        "Thank you for your cooperation and commitment to planning ahead for the upcoming ministry year!",
      ],
      fact: { label: "Opens", value: weekdayMonthDay(row.opens_on), note: `Requests close ${deadline}` },
      button: null,
    };
  }

  const subject =
    row.stage === "opened"
      ? `The ${year} budget and calendar request form is now open`
      : row.stage === "reminder"
        ? `Reminder: ${year} budget requests are due ${deadline}`
        : n === 0
          ? `Last day: ${year} budget requests are due today`
          : `${leftLabel(n)}: ${year} budget requests are due ${deadline}`;

  const title =
    row.stage === "opened"
      ? `The ${year} request form is now open`
      : row.stage === "final"
        ? n === 0
          ? `Today is the last day for ${year} budget requests`
          : `${leftLabel(n)} to submit your ${year} budget request`
        : `${year} budget requests are due ${deadline}`;

  // Not on the day it opens: nobody has had the chance yet.
  const missing =
    row.stage === "opened"
      ? null
      : row.ministry_names.length > 0
        ? `We have not yet received a ${year} budget request for ${joinNames(row.ministry_names)}.`
        : `We have not yet received a ${year} budget request from you.`;

  return {
    subject,
    title,
    greeting,
    paragraphs: [
      "The Budget and Calendar Request Form for the upcoming year is now open!",
      ...(missing ? [missing] : []),
      `All ministry leaders are encouraged to be proactive and submit their proposed budgets and ministry calendars as early as possible, ahead of the ${deadline} deadline.`,
      `You may review, edit, and update your submissions at any time before the deadline. Please note that the system will automatically lock budget requests after ${deadline}, and no further changes or submissions will be accepted.`,
      `If no request has been submitted by ${deadline}, last year’s budget will be carried over for ${year}.`,
      "Thank you for your cooperation and commitment to planning ahead for the upcoming ministry year!",
    ],
    fact: {
      label: "Deadline",
      value: weekdayMonthDay(row.last_day),
      note: n === 0 ? "Today is the last day" : leftLabel(n),
    },
    button: { label: "Open the budget request form", url: FORM_URL },
  };
}

function noReply(signedBy: string): string {
  return keepLastWordsTogether(
    `Replies to this email are not read. For questions about budget requests, please contact the ${signedBy}.`,
  );
}

/**
 * The email as blocks: the fact after the first paragraph, the button after
 * the encouragement to submit, where a reader who has understood wants to act.
 */
export function churchEmail(row: ReminderRow): ChurchEmail {
  const c = compose(row);
  const [first, ...rest] = c.paragraphs;
  const p = (text: string) => ({ kind: "paragraph" as const, text });
  return {
    subject: c.subject,
    subtitle: `Budget & Calendar Requests · ${row.fiscal_year}`,
    title: c.title,
    recipientName: row.recipient_name,
    blocks: [
      p(first),
      { kind: "fact", ...c.fact },
      ...rest.slice(0, -2).map(p),
      ...(c.button ? [{ kind: "button" as const, ...c.button }] : []),
      ...rest.slice(-2).map(p),
    ],
    signOff: { line: "Blessings,", from: row.signed_by },
    verse: VERSE,
    noReply: noReply(row.signed_by),
  };
}

export function renderEmail(row: ReminderRow, logoUrl: string = DEFAULT_LOGO_URL): string {
  return renderChurchEmail(churchEmail(row), logoUrl);
}

export function renderText(row: ReminderRow): string {
  return renderChurchText(churchEmail(row));
}
