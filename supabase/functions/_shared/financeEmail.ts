/**
 * A finance notice in the church's email: expenses, budget requests and
 * ministry flags, to the person who asked and to whoever acts next.
 *
 * The same look as the Children's Ministry emails and the budget request
 * reminder, from _shared/churchEmail.ts. The amount stands in the box where
 * the reminder puts its deadline, coloured for how it went; a reviewer's
 * notes are quoted beneath; the button opens the Budget page at the right
 * list. No verse: these are notices about one request, not letters.
 */

import {
  type ChurchEmail,
  keepLastWordsTogether,
  type Tone,
} from "./churchEmail.ts";

/** The Budget page. alic.org/budget sends anyone not signed in to sign in and back. */
export const BUDGET_URL = "https://alic.org/budget";

/**
 * Not finance@addislidet.info, the old default: alic.org is verified in
 * Resend, is the app's own domain, and is what the button links to.
 */
export const FINANCE_FROM_EMAIL = "Addis Lidet International Church <no-reply@alic.org>";

const NO_REPLY = keepLastWordsTogether(
  "Replies to this email are not read. For questions about a request, please speak to the finance team.",
);

/** What one notice says, before it is addressed to anyone. */
export interface FinanceMessage {
  subject: string;
  /** After "Finance ·" in the band: "Expenses", "Budget requests". */
  area: string;
  title: string;
  paragraphs: string[];
  fact: { label: string; value: string; note: string; tone: Tone };
  notes?: { heading: string; text: string } | null;
  button?: { label: string; url: string } | null;
}

/** "Notes from Abebe Kebede", or just "Notes" when nobody is named. */
export function notesFrom(name: string | null | undefined): string {
  return name ? `Notes from ${name}` : "Notes";
}

/**
 * The notice as the church's email: the first paragraph, the amount, the
 * rest, the notes, then the button.
 */
export function financeEmail(recipientName: string | null, m: FinanceMessage): ChurchEmail {
  const [first, ...rest] = m.paragraphs;
  return {
    subject: m.subject,
    subtitle: `Finance · ${m.area}`,
    title: m.title,
    recipientName,
    blocks: [
      { kind: "paragraph", text: first },
      { kind: "fact", ...m.fact },
      ...rest.map((text) => ({ kind: "paragraph" as const, text })),
      ...(m.notes ? [{ kind: "quote" as const, ...m.notes }] : []),
      ...(m.button ? [{ kind: "button" as const, ...m.button }] : []),
    ],
    signOff: { line: "Blessings,", from: "ALIC Finance" },
    verse: null,
    noReply: NO_REPLY,
  };
}
