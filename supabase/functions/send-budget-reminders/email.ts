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
 * The look is send-kids-notification's: the red band with the logo and the
 * church's name, a greeting, the blessing, a verse, and a footer that says
 * replies are not read. Kept apart from index.ts, with no Deno imports, so
 * vitest can test it and a preview can be rendered without deploying.
 */

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

export const CHURCH_NAME = "Addis Lidet International Church";
export const DEFAULT_LOGO_URL = "https://alic.org/alic-logo.png";
const CHURCH_WEBSITE = "alic.org";
const CAMPUSES = "Silver Spring, MD · Alexandria, VA";
/** Signed in already: alic.org/budget sends anyone else to sign in and back. */
export const FORM_URL = "https://alic.org/budget?request=budget";
const VERSE =
  "“Commit to the LORD whatever you do, and he will establish your plans.” Proverbs 16:3";

const RED = "#b22222";
const INK = "#18181b";
const MUTED = "#71717a";

function escapeHtml(value: string): string {
  return value
    .replace(/&/g, "&amp;")
    .replace(/</g, "&lt;")
    .replace(/>/g, "&gt;")
    .replace(/"/g, "&quot;")
    .replace(/'/g, "&#39;");
}

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
  // The last words held together, as the kids emails do, so no word sits
  // alone on a line.
  return `Replies to this email are not read. For questions about budget requests, please contact the ${signedBy.replace(/ (\S+ \S+)$/, (_, w: string) => " " + w.replace(" ", " "))}.`;
}

export function renderEmail(row: ReminderRow, logoUrl: string = DEFAULT_LOGO_URL): string {
  const c = compose(row);
  const para = `margin:0 0 16px;font-size:16px;line-height:1.65;color:${INK};`;

  const fact = `<table role="presentation" width="100%" cellpadding="0" cellspacing="0" style="margin:0 0 18px;border:2px solid ${RED};border-radius:10px;background:#fdf2f2;">
          <tr><td style="padding:14px 18px;text-align:center;">
            <div style="font-size:12px;font-weight:600;letter-spacing:0.12em;text-transform:uppercase;color:#8b0000;">${escapeHtml(c.fact.label)}</div>
            <div style="font-size:26px;font-weight:800;line-height:1.3;color:${INK};">${escapeHtml(c.fact.value)}</div>
            <div style="font-size:14px;font-weight:600;color:${RED};">${escapeHtml(c.fact.note)}</div>
          </td></tr>
        </table>`;

  const button = c.button
    ? `<table role="presentation" cellpadding="0" cellspacing="0" style="margin:0 0 20px;">
          <tr><td style="border-radius:8px;background:${RED};">
            <a href="${escapeHtml(c.button.url)}" style="display:inline-block;padding:12px 22px;font-size:16px;font-weight:600;color:#ffffff;text-decoration:none;">${escapeHtml(c.button.label)}</a>
          </td></tr>
        </table>`
    : "";

  // The fact after the first paragraph, the button after the encouragement
  // to submit: where a reader who has understood wants to act.
  const [first, ...rest] = c.paragraphs;
  const p = (text: string) => `<p style="${para}">${escapeHtml(text)}</p>`;
  const lastTwo = rest.slice(-2);
  const middle = rest.slice(0, -2);

  return `<!DOCTYPE html>
<html>
  <head><meta charset="utf-8"><meta name="viewport" content="width=device-width, initial-scale=1"><title>${escapeHtml(c.subject)}</title></head>
  <body style="margin:0;padding:24px;background:#f4f4f5;font-family:-apple-system,BlinkMacSystemFont,'Segoe UI',Roboto,'Noto Sans Ethiopic',sans-serif;">
    <div style="max-width:520px;margin:0 auto;background:#ffffff;border-radius:12px;overflow:hidden;border:1px solid #e4e4e7;">
      <table role="presentation" width="100%" cellpadding="0" cellspacing="0" style="background:${RED};">
        <tr>
          <td style="padding:16px 0 16px 22px;width:44px;vertical-align:middle;">
            <img src="${escapeHtml(logoUrl)}" width="44" height="44" alt="" style="display:block;border-radius:50%;background:#ffffff;">
          </td>
          <td style="padding:16px 22px 16px 14px;vertical-align:middle;color:#ffffff;">
            <div style="font-size:15px;font-weight:600;line-height:1.25;">${escapeHtml(CHURCH_NAME)}</div>
            <div style="font-size:12.5px;opacity:0.9;">Budget &amp; Calendar Requests · ${row.fiscal_year}</div>
          </td>
        </tr>
      </table>
      <div style="padding:22px 22px 4px;">
        <p style="margin:0 0 14px;font-size:19px;font-weight:600;line-height:1.3;color:${INK};">${escapeHtml(c.title)}</p>
        <p style="${para}">${escapeHtml(c.greeting)}</p>
        ${p(first)}
        ${fact}
        ${middle.map(p).join("\n        ")}
        ${button}
        ${lastTwo.map(p).join("\n        ")}
        <p style="${para}">Blessings,<br>${escapeHtml(row.signed_by)}</p>
        <p style="margin:0 0 16px;padding-top:14px;border-top:1px solid #f0e4e4;font-size:13px;font-style:italic;line-height:1.5;color:${MUTED};">${escapeHtml(VERSE)}</p>
      </div>
      <div style="padding:16px 22px 18px;background:#fafafa;border-top:1px solid #e4e4e7;font-size:12px;line-height:1.6;color:${MUTED};text-align:center;">
        <p style="margin:0 0 10px;">${escapeHtml(noReply(row.signed_by))}</p>
        <p style="margin:0;"><span style="font-weight:600;color:#52525b;">${escapeHtml(CHURCH_NAME)}</span><br>
        ${CAMPUSES}<br>
        <a href="https://${CHURCH_WEBSITE}" style="color:${RED};text-decoration:none;">${CHURCH_WEBSITE}</a></p>
      </div>
    </div>
  </body>
</html>`;
}

/**
 * The same email as plain text, sent alongside: a mail client that shows no
 * HTML still gets all of it, and spam filters trust both more than HTML alone.
 */
export function renderText(row: ReminderRow): string {
  const c = compose(row);
  const [first, ...rest] = c.paragraphs;
  return [
    c.greeting,
    first,
    `${c.fact.label.toUpperCase()}:  ${c.fact.value} (${c.fact.note})`,
    ...rest.slice(0, -2),
    c.button ? `${c.button.label}:\n${c.button.url}` : null,
    ...rest.slice(-2),
    `Blessings,\n${row.signed_by}`,
    VERSE,
    `${noReply(row.signed_by)}\n\n${CHURCH_NAME}\n${CAMPUSES}\n${CHURCH_WEBSITE}`,
  ]
    .filter(Boolean)
    .join("\n\n");
}
