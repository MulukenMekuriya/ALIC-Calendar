/**
 * What each expense and budget request notice says, and who it goes to.
 *
 * For every status change: one notice to the person who made the request,
 * and one to everyone in the role that acts next (admin, treasury, finance).
 * Either may be null. The recipients and transitions are as they were; the
 * words are the same facts in the church's voice, and the look is
 * _shared/financeEmail.ts.
 *
 * Kept apart from index.ts, with no Deno imports, so notification-logic.test.ts
 * tests this file itself rather than a copy of it.
 */

import { formatCurrency } from "../_shared/churchEmail.ts";
import { BUDGET_URL, type FinanceMessage, notesFrom } from "../_shared/financeEmail.ts";

export interface ExpenseRecord {
  id: string;
  title: string;
  amount: number;
  ministryName: string;
  organizationId: string;
  requesterName: string;
  requesterEmail: string | null;
  reviewerName: string | null;
  reviewerNotes: string | null;
  paymentReference: string | null;
}

export interface AllocationRecord {
  id: string;
  ministryName: string;
  organizationId: string;
  requesterName: string;
  requesterEmail: string | null;
  requestedAmount: number;
  approvedAmount: number | null;
  adminNotes: string | null;
  /** The fiscal year asked for: "your 2027 budget request". */
  fiscalYear: number | null;
  reviewerName: string | null;
}

export interface NotificationPlan {
  requesterContent: FinanceMessage | null;
  reviewerContent: FinanceMessage | null;
  reviewerRole: string | null;
}

const NOTHING: NotificationPlan = { requesterContent: null, reviewerContent: null, reviewerRole: null };

const EXPENSES_URL = `${BUDGET_URL}?tab=expenses`;
const ALLOCATIONS_URL = `${BUDGET_URL}?tab=allocations`;
const OPEN_EXPENSES = { label: "Open the Budget page", url: EXPENSES_URL };
const OPEN_ALLOCATIONS = { label: "Open the Budget page", url: ALLOCATIONS_URL };

export function getExpenseNotificationContent(
  oldStatus: string,
  newStatus: string,
  record: ExpenseRecord,
): NotificationPlan {
  const { title, amount, ministryName, requesterName, reviewerName, reviewerNotes, paymentReference } = record;
  const value = formatCurrency(amount);
  const reviewer = reviewerName || "the reviewer";
  const notes = reviewerNotes ? { heading: notesFrom(reviewerName), text: reviewerNotes } : null;
  const area = "Expenses";

  if (oldStatus === "leader_approved" && newStatus === "pending_leader") {
    return {
      requesterContent: {
        subject: `Expense approval recalled: ${title}`,
        area,
        title: "The approval of your expense was recalled",
        paragraphs: [
          `The approval of your expense request “${title}” has been recalled, and it is back waiting for review.`,
        ],
        fact: { label: "Expense", value, note: "Back to waiting for review", tone: "amber" },
        notes,
        button: OPEN_EXPENSES,
      },
      reviewerContent: null,
      reviewerRole: null,
    };
  }

  switch (newStatus) {
    case "pending_leader":
      return {
        requesterContent: {
          subject: `Expense submitted: ${title}`,
          area,
          title: "Your expense request was submitted",
          paragraphs: [
            `Your expense request “${title}” has been submitted for review. We’ll email you as soon as it has been reviewed.`,
          ],
          fact: { label: "Expense", value, note: "Waiting for review", tone: "amber" },
          button: OPEN_EXPENSES,
        },
        reviewerContent: {
          subject: `New expense request: ${title}`,
          area,
          title: "An expense request is waiting for your review",
          paragraphs: [`${requesterName} from ${ministryName} has submitted an expense request for “${title}”.`],
          fact: { label: "Expense", value, note: "Waiting for your review", tone: "amber" },
          button: { label: "Review the request", url: EXPENSES_URL },
        },
        reviewerRole: "admin",
      };

    case "leader_approved":
      return {
        requesterContent: {
          subject: `Expense approved: ${title}`,
          area,
          title: "Your expense request was approved",
          paragraphs: [
            `Your expense request “${title}” has been approved by ${reviewer}. It now goes to the treasury for payment approval.`,
          ],
          fact: { label: "Expense", value, note: "Approved", tone: "green" },
          notes,
          button: OPEN_EXPENSES,
        },
        reviewerContent: {
          subject: `Expense awaiting payment approval: ${title}`,
          area,
          title: "An expense is waiting for your payment approval",
          paragraphs: [
            `An expense request for “${title}” from ${ministryName} has been approved by ${reviewerName || "the leader"} and needs your payment approval.`,
          ],
          fact: { label: "Expense", value, note: "Waiting for payment approval", tone: "amber" },
          button: { label: "Review the payment", url: EXPENSES_URL },
        },
        reviewerRole: "treasury",
      };

    case "leader_denied":
      return {
        requesterContent: {
          subject: `Expense not approved: ${title}`,
          area,
          title: "Your expense request was not approved",
          paragraphs: [
            `Your expense request “${title}” was not approved by ${reviewer}.${notes ? " Their notes are below." : ""}`,
          ],
          fact: { label: "Expense", value, note: "Not approved", tone: "red" },
          notes,
          button: OPEN_EXPENSES,
        },
        reviewerContent: null,
        reviewerRole: null,
      };

    case "treasury_approved":
      return {
        requesterContent: {
          subject: `Payment approved: ${title}`,
          area,
          title: "Your payment was approved",
          paragraphs: [
            `The payment for “${title}” has been approved by the treasury. The finance team will process it shortly.`,
          ],
          fact: { label: "Payment", value, note: "Approved", tone: "green" },
          notes,
          button: OPEN_EXPENSES,
        },
        reviewerContent: {
          subject: `Payment ready to process: ${title}`,
          area,
          title: "A payment is ready to process",
          paragraphs: [
            `The payment for “${title}” from ${ministryName} has been approved by the treasury and is ready to process.`,
          ],
          fact: { label: "Payment", value, note: "Ready to process", tone: "amber" },
          button: { label: "Process the payment", url: EXPENSES_URL },
        },
        reviewerRole: "finance",
      };

    case "treasury_denied":
      return {
        requesterContent: {
          subject: `Payment not approved: ${title}`,
          area,
          title: "Your payment was not approved",
          paragraphs: [
            `The payment for “${title}” was not approved by the treasury.${notes ? " Their notes are below." : ""}`,
          ],
          fact: { label: "Payment", value, note: "Not approved", tone: "red" },
          notes,
          button: OPEN_EXPENSES,
        },
        reviewerContent: null,
        reviewerRole: null,
      };

    case "completed":
      return {
        requesterContent: {
          subject: `Payment complete: ${title}`,
          area,
          title: "Your payment has been processed",
          paragraphs: [`Your expense request “${title}” has been fully processed.`],
          fact: {
            label: "Paid",
            value,
            note: paymentReference ? `Reference ${paymentReference}` : "Payment complete",
            tone: "green",
          },
          notes,
          button: OPEN_EXPENSES,
        },
        reviewerContent: null,
        reviewerRole: null,
      };

    case "cancelled":
      return {
        requesterContent: {
          subject: `Expense cancelled: ${title}`,
          area,
          title: "An expense request was cancelled",
          paragraphs: [`The expense request “${title}” has been cancelled.`],
          fact: { label: "Expense", value, note: "Cancelled", tone: "gray" },
        },
        reviewerContent: null,
        reviewerRole: null,
      };

    default:
      return NOTHING;
  }
}

export function getAllocationNotificationContent(
  oldStatus: string,
  newStatus: string,
  record: AllocationRecord,
): NotificationPlan {
  const { ministryName, requesterName, requestedAmount, approvedAmount, adminNotes, fiscalYear, reviewerName } = record;
  const year = fiscalYear ? `${fiscalYear} ` : "";
  const label = fiscalYear ? `Budget request · ${fiscalYear}` : "Budget request";
  const requested = formatCurrency(requestedAmount);
  const granted = formatCurrency(approvedAmount || requestedAmount);
  const notes = adminNotes ? { heading: notesFrom(reviewerName), text: adminNotes } : null;
  const area = "Budget requests";

  if (oldStatus === "approved" && newStatus === "pending") {
    return {
      requesterContent: {
        subject: `Budget request approval recalled: ${ministryName}`,
        area,
        title: "The approval of your budget request was recalled",
        paragraphs: [
          `The approval of the ${year}budget request for ${ministryName} has been recalled, and it is back waiting for review.`,
        ],
        fact: { label, value: granted, note: "Back to waiting for review", tone: "amber" },
        notes,
        button: OPEN_ALLOCATIONS,
      },
      reviewerContent: null,
      reviewerRole: null,
    };
  }

  switch (newStatus) {
    case "pending":
      return {
        requesterContent: null,
        reviewerContent: {
          subject: `New budget request: ${ministryName}`,
          area,
          title: `A ${year}budget request is waiting for your review`,
          paragraphs: [`${requesterName} from ${ministryName} has submitted a ${year}budget request.`],
          fact: { label, value: requested, note: "Waiting for your review", tone: "amber" },
          button: { label: "Review the request", url: ALLOCATIONS_URL },
        },
        reviewerRole: "admin",
      };

    // The Leadership Council's conditional approval. Nothing is promised yet,
    // and the email says so: the Board gives the final approval.
    case "conditionally_approved":
      return {
        requesterContent: {
          subject: `Budget request conditionally approved: ${ministryName}`,
          area,
          title: `Your ${year}budget request was conditionally approved`,
          paragraphs: [
            `The Leadership Council has conditionally approved the ${year}budget request for ${ministryName}.`,
            "It now goes to the Board, which gives the final approval. You will hear again once the Board has decided.",
          ],
          fact: { label, value: requested, note: "Conditionally approved · with the Board next", tone: "amber" },
          notes,
          button: OPEN_ALLOCATIONS,
        },
        reviewerContent: null,
        reviewerRole: null,
      };

    // A request reaching 'board_review' says nothing on its own: the batch
    // that sent it is announced once, to the Board, by getBoardDigestContent.
    // 'under_review' (the Council starting, or the Board returning it) is
    // internal and says nothing either; both fall through to NOTHING.

    case "approved":
    case "partially_approved": {
      const partly = newStatus === "partially_approved" && approvedAmount != null && approvedAmount < requestedAmount;
      return {
        requesterContent: {
          subject: `Budget request approved: ${ministryName}`,
          area,
          title: `Your ${year}budget request was approved`,
          paragraphs: [
            partly
              ? `The Board has given final approval to the ${year}budget request for ${ministryName}, for ${granted} of the ${requested} requested.`
              : `The Board has given final approval to the ${year}budget request for ${ministryName}.`,
          ],
          fact: {
            label,
            value: granted,
            note: partly ? `Approved, of ${requested} requested` : "Approved",
            tone: "green",
          },
          notes,
          button: OPEN_ALLOCATIONS,
        },
        reviewerContent: null,
        reviewerRole: null,
      };
    }

    case "denied":
      return {
        requesterContent: {
          subject: `Budget request not approved: ${ministryName}`,
          area,
          title: `Your ${year}budget request was not approved`,
          paragraphs: [
            `The ${year}budget request for ${ministryName} was not approved.${notes ? " The notes are below." : ""}`,
          ],
          fact: { label, value: requested, note: "Not approved", tone: "red" },
          notes,
          button: OPEN_ALLOCATIONS,
        },
        reviewerContent: null,
        reviewerRole: null,
      };

    case "cancelled":
      return {
        requesterContent: {
          subject: `Budget request cancelled: ${ministryName}`,
          area,
          title: "A budget request was cancelled",
          paragraphs: [`The ${year}budget request for ${ministryName} has been cancelled.`],
          fact: { label, value: requested, note: "Cancelled", tone: "gray" },
        },
        reviewerContent: null,
        reviewerRole: null,
      };

    default:
      return NOTHING;
  }
}

/** board@alic.org unless the BOARD_EMAIL secret says otherwise. */
export const BOARD_URL = `${BUDGET_URL}?tab=board`;

/**
 * One notice to the Board for a batch the Leadership Council has sent, rather
 * than one per request: the Council sends the whole year's budget at once.
 */
export function getBoardDigestContent(records: AllocationRecord[]): FinanceMessage | null {
  if (records.length === 0) return null;

  const years = [...new Set(records.map((r) => r.fiscalYear).filter((y): y is number => y != null))];
  const year = years.length === 1 ? `${years[0]} ` : "";
  const total = records.reduce((sum, r) => sum + r.requestedAmount, 0);
  const n = records.length;
  const list = [...records]
    .sort((a, b) => b.requestedAmount - a.requestedAmount)
    .map((r) => `${r.ministryName}: ${formatCurrency(r.requestedAmount)}`);

  return {
    subject: `${year}budget: ${n} ${n === 1 ? "request" : "requests"} sent for Board review`.replace(/^budget/, "Budget"),
    area: "Budget requests",
    title: `${n} ${n === 1 ? "budget request is" : "budget requests are"} ready for the Board`,
    paragraphs: [
      `The Leadership Council has conditionally approved ${n === 1 ? "this request" : "these requests"} and sent ${n === 1 ? "it" : "them"} to the Board for final approval.`,
      list.join(" · "),
      "Open Board Review to read each request, comment, and give final approval, return it to the Council, or deny it.",
    ],
    fact: {
      label: `Sent for Board review${year ? ` · ${year.trim()}` : ""}`,
      value: formatCurrency(total),
      note: `${n} ${n === 1 ? "request" : "requests"} awaiting final approval`,
      tone: "amber",
    },
    button: { label: "Open Board Review", url: BOARD_URL },
  };
}

