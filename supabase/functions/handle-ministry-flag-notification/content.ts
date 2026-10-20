/**
 * What the ministry flag notice says. It goes to whoever made the expense
 * the flag is about; the look is _shared/financeEmail.ts. No Deno imports,
 * so vitest can test it.
 */

import { formatCurrency } from "../_shared/churchEmail.ts";
import { BUDGET_URL, type FinanceMessage, notesFrom } from "../_shared/financeEmail.ts";

export const FLAG_TYPE_LABELS: Record<string, string> = {
  missing_receipts: "Missing Receipts",
  unreturned_funds: "Unreturned Funds",
};

/** What clears the flag, in a sentence the leader can act on. */
const WHAT_TO_DO: Record<string, string> = {
  missing_receipts: "Please send the missing receipts as soon as you can.",
  unreturned_funds: "Please return the unspent funds as soon as you can.",
};

export interface FlagNotice {
  ministryName: string;
  flagType: string;
  flaggedByName: string | null;
  notes: string | null;
  expenseTitle: string;
  expenseAmount: number | null;
}

export function flagMessage(f: FlagNotice): FinanceMessage {
  const label = FLAG_TYPE_LABELS[f.flagType] || f.flagType;
  const what = label.toLowerCase();
  return {
    subject: `Ministry flagged: ${f.ministryName} — ${label}`,
    area: "Ministry flags",
    title: `${f.ministryName} has been flagged for ${what}`,
    paragraphs: [
      `${f.flaggedByName || "The finance team"} has flagged ${f.ministryName} for ${what}.`,
      `New expense requests from the ministry are on hold until the flag is resolved. ${
        WHAT_TO_DO[f.flagType] ?? "Please send what is needed as soon as you can."
      }`,
    ],
    fact: f.expenseAmount
      ? { label: "Related expense", value: formatCurrency(f.expenseAmount), note: `“${f.expenseTitle}”`, tone: "red" }
      : { label: "Related expense", value: f.expenseTitle, note: label, tone: "red" },
    notes: f.notes ? { heading: notesFrom(f.flaggedByName), text: f.notes } : null,
    button: { label: "Open the Budget page", url: `${BUDGET_URL}?tab=expenses` },
  };
}
