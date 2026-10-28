/**
 * The Board's Recommended amount and Comment on one request.
 *
 * Editable by the Board while the request is with it (saved when the field is
 * left, by the container), and read-only for everyone else, which is how the
 * local leaders read the Board's remarks. The Board advises on the amount; it
 * never changes the request's own figures.
 */

import { Input } from "@/shared/components/ui/input";
import { Textarea } from "@/shared/components/ui/textarea";
import type { AllocationBoardFeedback } from "../../types";
import { formatReviewAmount } from "../../utils/reviewMatrix";

import type { FeedbackDraft } from "../../utils/feedbackDraft";

interface EditableProps {
  requestId: string;
  ministryName: string;
  draft: FeedbackDraft;
  onChange: (requestId: string, draft: FeedbackDraft) => void;
  onBlur: (requestId: string) => void;
  disabled?: boolean;
}

export function RecommendedInput({ requestId, ministryName, draft, onChange, onBlur, disabled }: EditableProps) {
  return (
    <Input
      inputMode="decimal"
      placeholder="Amount"
      aria-label={`Recommended amount for ${ministryName}`}
      className="h-8 w-28 text-right tabular-nums"
      value={draft.amount}
      disabled={disabled}
      onChange={(e) => onChange(requestId, { ...draft, amount: e.target.value })}
      onBlur={() => onBlur(requestId)}
    />
  );
}

export function CommentInput({ requestId, ministryName, draft, onChange, onBlur, disabled }: EditableProps) {
  return (
    <Textarea
      rows={1}
      placeholder="Comment"
      aria-label={`Comment on ${ministryName}`}
      className="min-h-8 w-56 resize-y py-1.5 text-sm"
      value={draft.comment}
      disabled={disabled}
      onChange={(e) => onChange(requestId, { ...draft, comment: e.target.value })}
      onBlur={() => onBlur(requestId)}
    />
  );
}

/** What the Board said, for a reader who cannot change it. */
export function BoardRemarks({ feedback }: { feedback: AllocationBoardFeedback[] }) {
  if (feedback.length === 0) return <span className="text-muted-foreground">-</span>;
  return (
    <ul className="space-y-1 text-sm">
      {feedback.map((f) => (
        <li key={f.id}>
          {f.recommended_amount != null && (
            <span className="font-medium tabular-nums">{formatReviewAmount(Number(f.recommended_amount))} </span>
          )}
          {f.comment && <span className="text-muted-foreground">{f.comment}</span>}
          <span className="block text-xs text-muted-foreground">{f.board_member_name}</span>
        </li>
      ))}
    </ul>
  );
}

