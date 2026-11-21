/**
 * A request's Green / Yellow / Red, small, for lists and the detail view.
 * Shows nothing until a split exists. "proposed" while the Board has not
 * decided yet. With `showReason`, the Yellow reason follows.
 */

import { cn } from "@/lib/utils";
import { formatReviewAmount } from "../../utils/reviewMatrix";
import { splitOf, SPLIT_COLORS, type SplitColor } from "../../utils/split";
import type { AllocationRequest } from "../../types";

const NAMES: Record<SplitColor, string> = { green: "Green", yellow: "Yellow", red: "Red" };

export function SplitChips({
  request,
  showReason = false,
  className,
}: {
  request: Pick<AllocationRequest, "status" | "requested_amount" | "approved_amount" | "green_amount" | "yellow_amount" | "yellow_reason">;
  showReason?: boolean;
  className?: string;
}) {
  const s = splitOf(request);
  if (s.state === "none") return null;
  // Denied outright, or all Green: the status badge already says it.
  if (s.state === "final" && (s.green >= s.requested || (s.green === 0 && s.yellow === 0))) return null;

  const chip = (color: SplitColor, amount: number) =>
    amount > 0 ? (
      <span
        key={color}
        className={cn(
          "inline-flex items-center gap-1 rounded border px-1.5 py-0.5 text-xs tabular-nums",
          SPLIT_COLORS[color].text,
          s.state === "proposed" ? cn("border-dashed", SPLIT_COLORS[color].border) : cn(SPLIT_COLORS[color].bg, SPLIT_COLORS[color].border),
        )}
      >
        <span className={cn("h-1.5 w-1.5 rounded-full", SPLIT_COLORS[color].dot)} aria-hidden />
        {NAMES[color]} {formatReviewAmount(amount)}
      </span>
    ) : null;

  return (
    <div className={cn("space-y-1", className)}>
      <div className="flex flex-wrap items-center gap-1">
        {chip("green", s.green)}
        {chip("yellow", s.yellow)}
        {chip("red", s.red)}
        {s.state === "proposed" && <span className="text-xs text-muted-foreground">proposed</span>}
      </div>
      {showReason && s.yellow > 0 && request.yellow_reason && (
        <p className={cn("text-xs", SPLIT_COLORS.yellow.text)}>
          Yellow (justified, waiting on giving): {request.yellow_reason}
        </p>
      )}
    </div>
  );
}
