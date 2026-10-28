/** The Board's Recommended amount and Comment as typed, and as the database stores them. */

import type { AllocationBoardFeedback } from "../types";

export interface FeedbackDraft {
  amount: string;
  comment: string;
}

export const draftFrom = (feedback?: AllocationBoardFeedback): FeedbackDraft => ({
  amount: feedback?.recommended_amount != null ? String(feedback.recommended_amount) : "",
  comment: feedback?.comment ?? "",
});

/** A draft as the database stores it, or null if what was typed is not a usable amount. */
export function parseDraft(draft: FeedbackDraft): { amount: number | null; comment: string | null } | null {
  const raw = draft.amount.trim().replace(/[$,]/g, "");
  const amount = raw === "" ? null : Number(raw);
  if (amount !== null && (!Number.isFinite(amount) || amount < 0)) return null;
  return { amount, comment: draft.comment.trim() || null };
}
