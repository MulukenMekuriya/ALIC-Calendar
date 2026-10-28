/**
 * One month of one request in the review table.
 *
 * Hovering (or focusing, or tapping) shows the line items behind the figure
 * with their justification. For a local leader the figure is also a button:
 * clicking it opens the month for editing. The Board's cells are the same
 * without the button, because the Board never edits a number.
 *
 * The popover is portaled: the table scrolls sideways on a narrow screen and
 * a popover inside it would be clipped.
 */

import { HoverCard, HoverCardContent, HoverCardTrigger } from "@/shared/components/ui/hover-card";
import { cn } from "@/lib/utils";
import { MONTH_LABELS, formatReviewAmount as formatBudgetAmount } from "../../utils/reviewMatrix";
import type { ReviewRow } from "../../utils/reviewMatrix";

interface ReviewMonthCellProps {
  row: ReviewRow;
  monthIndex: number;
  canEdit: boolean;
  onEdit: (row: ReviewRow, monthIndex: number) => void;
}

export function ReviewMonthCell({ row, monthIndex, canEdit, onEdit }: ReviewMonthCellProps) {
  const total = row.months[monthIndex];
  const lines = row.lines.filter((l) => l.months[monthIndex] > 0);
  const label = total > 0 ? formatBudgetAmount(total) : "-";
  const month = MONTH_LABELS[monthIndex];

  // Nothing to show and nothing to change: a plain dash.
  if (total === 0 && !canEdit) {
    return <span className="text-muted-foreground">-</span>;
  }

  const face = (
    <button
      type="button"
      onClick={canEdit ? () => onEdit(row, monthIndex) : undefined}
      aria-label={
        canEdit
          ? `Edit ${month} for ${row.ministryName}, now ${label}`
          : `${month} for ${row.ministryName}: ${label}`
      }
      className={cn(
        "w-full rounded px-1 py-0.5 text-right tabular-nums focus:outline-none focus-visible:ring-2 focus-visible:ring-ring",
        canEdit ? "cursor-pointer hover:bg-primary/10 underline decoration-dotted underline-offset-4" : "cursor-default",
        total === 0 && "text-muted-foreground",
      )}
    >
      {label}
    </button>
  );

  if (lines.length === 0) return face;

  return (
    <HoverCard openDelay={150} closeDelay={80}>
      <HoverCardTrigger asChild>{face}</HoverCardTrigger>
      <HoverCardContent className="w-80 text-sm" side="bottom" align="end">
        <p className="font-semibold">
          {row.ministryName} · {month}
        </p>
        <ul className="mt-2 space-y-2">
          {lines.map((l) => (
            <li key={l.index} className="flex items-start justify-between gap-3">
              <span className="min-w-0">
                <span className="block break-words">{l.justification || "No justification given"}</span>
                {l.chartOfAccounts && (
                  <span className="block text-xs text-muted-foreground">{l.chartOfAccounts}</span>
                )}
              </span>
              <span className="tabular-nums shrink-0">{formatBudgetAmount(l.months[monthIndex])}</span>
            </li>
          ))}
        </ul>
        {canEdit && <p className="mt-2 text-xs text-muted-foreground">Click the figure to edit this month.</p>}
      </HoverCardContent>
    </HoverCard>
  );
}
