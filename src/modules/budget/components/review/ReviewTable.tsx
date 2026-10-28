/**
 * The ministry-by-month review table, and its phone layout.
 *
 * One row per request, grouped under the ministry with a subtotal. What each
 * row offers comes from getRowPermissions for the viewer's role in that row's
 * own branch, so the same table serves local leaders, the Board, and someone
 * who is both in different branches.
 */

import { Button } from "@/shared/components/ui/button";
import { Checkbox } from "@/shared/components/ui/checkbox";
import { Check, Pencil, X } from "lucide-react";
import { cn } from "@/lib/utils";
import type { AllocationBoardFeedback } from "../../types";
import { getReviewStage, getRowPermissions, STAGE_LABEL, type ReviewRole } from "../../utils/reviewStage";
import { MONTH_LABELS, formatReviewAmount, totalsOf, type ReviewGroup, type ReviewRow } from "../../utils/reviewMatrix";
import { ReviewMonthCell } from "./ReviewMonthCell";
import { BoardRemarks, CommentInput, RecommendedInput } from "./BoardFeedbackCells";
import type { FeedbackDraft } from "../../utils/feedbackDraft";

export interface ReviewTableProps {
  groups: ReviewGroup[];
  roleFor: (organizationId: string) => ReviewRole;
  /** Name the branch beside each ministry (when more than one is in view). */
  branchNames?: Record<string, string>;
  selected: Set<string>;
  onToggle: (requestId: string, checked: boolean) => void;
  showFeedback: boolean;
  feedback: Record<string, AllocationBoardFeedback[]>;
  drafts: Record<string, FeedbackDraft>;
  onDraftChange: (requestId: string, draft: FeedbackDraft) => void;
  onDraftBlur: (requestId: string) => void;
  onEditMonth: (row: ReviewRow, monthIndex: number) => void;
  onEditRequest: (row: ReviewRow) => void;
  onApproveForBoard: (row: ReviewRow) => void;
  onDeny: (row: ReviewRow) => void;
  busyRequestId?: string | null;
}

const th = "px-2 py-2 text-xs font-semibold text-muted-foreground whitespace-nowrap";
const td = "px-2 py-2 align-top text-sm";

function RowActions({ row, props }: { row: ReviewRow; props: ReviewTableProps }) {
  const perms = getRowPermissions(row.request, props.roleFor(row.organizationId));
  const busy = props.busyRequestId === row.request.id;
  if (!perms.canEdit && !perms.canApproveForBoard && !perms.canDeny) return null;
  return (
    <div className="flex flex-wrap justify-end gap-1">
      {perms.canEdit && (
        <Button size="sm" variant="outline" disabled={busy} onClick={() => props.onEditRequest(row)} aria-label={`Edit ${row.ministryName}`}>
          <Pencil className="h-3.5 w-3.5 sm:mr-1" />
          <span className="hidden sm:inline">Edit</span>
        </Button>
      )}
      {perms.canApproveForBoard && (
        <Button size="sm" variant="outline" disabled={busy} onClick={() => props.onApproveForBoard(row)} aria-label={`Approve ${row.ministryName} for the Board`}>
          <Check className="h-3.5 w-3.5 sm:mr-1" />
          <span className="hidden sm:inline">Approve</span>
        </Button>
      )}
      {perms.canDeny && (
        <Button size="sm" variant="outline" className="text-destructive" disabled={busy} onClick={() => props.onDeny(row)} aria-label={`Deny ${row.ministryName}`}>
          <X className="h-3.5 w-3.5 sm:mr-1" />
          <span className="hidden sm:inline">Deny</span>
        </Button>
      )}
    </div>
  );
}

function SelectBox({ row, props }: { row: ReviewRow; props: ReviewTableProps }) {
  const perms = getRowPermissions(row.request, props.roleFor(row.organizationId));
  if (!perms.canSend && !perms.canBoardDecide) return null;
  return (
    <Checkbox
      aria-label={`Select ${row.ministryName}`}
      checked={props.selected.has(row.request.id)}
      onCheckedChange={(c) => props.onToggle(row.request.id, c === true)}
    />
  );
}

function FeedbackCell({ row, props, part }: { row: ReviewRow; props: ReviewTableProps; part: "amount" | "comment" }) {
  const perms = getRowPermissions(row.request, props.roleFor(row.organizationId));
  const draft = props.drafts[row.request.id] ?? { amount: "", comment: "" };
  if (perms.canGiveFeedback) {
    const Input = part === "amount" ? RecommendedInput : CommentInput;
    return (
      <Input
        requestId={row.request.id}
        ministryName={row.ministryName}
        draft={draft}
        onChange={props.onDraftChange}
        onBlur={props.onDraftBlur}
      />
    );
  }
  // Read-only: shown once, in the Recommended column, as the whole remark.
  return part === "amount" ? <BoardRemarks feedback={props.feedback[row.request.id] ?? []} /> : null;
}

function branchOf(props: ReviewTableProps, row: ReviewRow) {
  return props.branchNames?.[row.organizationId];
}

export function ReviewTable(props: ReviewTableProps) {
  const { groups, showFeedback } = props;
  const allRows = groups.flatMap((g) => g.rows);
  const grand = totalsOf(allRows);
  const hasAnnual = grand.annual > 0;
  const anyReadOnlyFeedback = allRows.some(
    (r) => !getRowPermissions(r.request, props.roleFor(r.organizationId)).canGiveFeedback,
  );

  return (
    <>
      {/* Desktop and tablet */}
      <div className="hidden md:block overflow-x-auto">
        <table className="w-full min-w-[960px]">
          <thead>
            <tr className="border-b bg-muted/50">
              <th className={cn(th, "w-8")} />
              <th className={cn(th, "text-left sticky left-0 bg-muted/50 min-w-[170px]")}>Ministry</th>
              {MONTH_LABELS.map((m) => (
                <th key={m} className={cn(th, "text-right min-w-[64px]")}>{m}</th>
              ))}
              {hasAnnual && <th className={cn(th, "text-right")}>Annual</th>}
              <th className={cn(th, "text-right")}>Total</th>
              {showFeedback && <th className={cn(th, "text-right")}>{anyReadOnlyFeedback ? "Board remarks" : "Recommended"}</th>}
              {showFeedback && !anyReadOnlyFeedback && <th className={cn(th, "text-left")}>Comment</th>}
              <th className={cn(th, "text-right")}>Actions</th>
            </tr>
          </thead>
          <tbody>
            {groups.map((g) => (
              <GroupRows key={g.key} group={g} props={props} hasAnnual={hasAnnual} anyReadOnlyFeedback={anyReadOnlyFeedback} />
            ))}
            <tr className="border-t-2 bg-muted/60 font-bold">
              <td />
              <td className={cn(td, "sticky left-0 bg-muted/60")}>Total</td>
              {grand.months.map((v, i) => (
                <td key={i} className={cn(td, "text-right tabular-nums")}>{v > 0 ? formatReviewAmount(v) : "-"}</td>
              ))}
              {hasAnnual && <td className={cn(td, "text-right tabular-nums")}>{formatReviewAmount(grand.annual)}</td>}
              <td className={cn(td, "text-right tabular-nums text-primary")}>{formatReviewAmount(grand.total)}</td>
              {showFeedback && <td />}
              {showFeedback && !anyReadOnlyFeedback && <td />}
              <td />
            </tr>
          </tbody>
        </table>
      </div>

      {/* Phone */}
      <div className="md:hidden divide-y">
        {groups.flatMap((g) => g.rows).map((row) => (
          <ReviewCard key={row.request.id} row={row} props={props} />
        ))}
        <div className="flex justify-between p-3 font-bold">
          <span>Total</span>
          <span className="tabular-nums text-primary">{formatReviewAmount(grand.total)}</span>
        </div>
      </div>
    </>
  );
}

function GroupRows({
  group,
  props,
  hasAnnual,
  anyReadOnlyFeedback,
}: {
  group: ReviewGroup;
  props: ReviewTableProps;
  hasAnnual: boolean;
  anyReadOnlyFeedback: boolean;
}) {
  const { showFeedback } = props;
  return (
    <>
      {group.rows.map((row) => {
        const perms = getRowPermissions(row.request, props.roleFor(row.organizationId));
        const stage = getReviewStage(row.request);
        return (
          <tr key={row.request.id} className="border-b hover:bg-muted/30">
            <td className={td}><SelectBox row={row} props={props} /></td>
            <td className={cn(td, "sticky left-0 bg-background")}>
              <div className="font-medium">{row.ministryName}</div>
              <div className="text-xs text-muted-foreground">
                {branchOf(props, row) && <>{branchOf(props, row)} · </>}
                {STAGE_LABEL[stage]}
              </div>
            </td>
            {row.isMonthly ? (
              row.months.map((_, i) => (
                <td key={i} className={cn(td, "text-right")}>
                  <ReviewMonthCell row={row} monthIndex={i} canEdit={perms.canEdit} onEdit={props.onEditMonth} />
                </td>
              ))
            ) : (
              <td colSpan={12} className={cn(td, "text-center text-muted-foreground italic")}>Annual only</td>
            )}
            {hasAnnual && <td className={cn(td, "text-right tabular-nums")}>{row.annual > 0 ? formatReviewAmount(row.annual) : "-"}</td>}
            <td className={cn(td, "text-right tabular-nums font-semibold")}>{formatReviewAmount(row.total)}</td>
            {showFeedback && <td className={cn(td, "text-right")}><FeedbackCell row={row} props={props} part="amount" /></td>}
            {showFeedback && !anyReadOnlyFeedback && <td className={td}><FeedbackCell row={row} props={props} part="comment" /></td>}
            <td className={td}><RowActions row={row} props={props} /></td>
          </tr>
        );
      })}
      {group.rows.length > 1 && (
        <tr className="border-b bg-muted/20 text-xs">
          <td />
          <td className={cn(td, "sticky left-0 bg-muted/20 italic")}>{group.ministryName} subtotal</td>
          {group.months.map((v, i) => (
            <td key={i} className={cn(td, "text-right tabular-nums")}>{v > 0 ? formatReviewAmount(v) : "-"}</td>
          ))}
          {hasAnnual && <td className={cn(td, "text-right tabular-nums")}>{group.annual > 0 ? formatReviewAmount(group.annual) : "-"}</td>}
          <td className={cn(td, "text-right tabular-nums font-semibold")}>{formatReviewAmount(group.total)}</td>
          {showFeedback && <td />}
          {showFeedback && !anyReadOnlyFeedback && <td />}
          <td />
        </tr>
      )}
    </>
  );
}

function ReviewCard({ row, props }: { row: ReviewRow; props: ReviewTableProps }) {
  const perms = getRowPermissions(row.request, props.roleFor(row.organizationId));
  const stage = getReviewStage(row.request);
  const draft = props.drafts[row.request.id] ?? { amount: "", comment: "" };
  return (
    <div className="p-3 space-y-2">
      <div className="flex items-start gap-3">
        <SelectBox row={row} props={props} />
        <div className="min-w-0 flex-1">
          <div className="font-medium">{row.ministryName}</div>
          <div className="text-xs text-muted-foreground">
            {branchOf(props, row) && <>{branchOf(props, row)} · </>}
            {STAGE_LABEL[stage]}
          </div>
        </div>
        <div className="text-right font-semibold tabular-nums">{formatReviewAmount(row.total)}</div>
      </div>

      {row.isMonthly ? (
        <div className="flex flex-wrap gap-1.5">
          {row.months.map((v, i) =>
            v > 0 ? (
              perms.canEdit ? (
                <button
                  key={i}
                  type="button"
                  onClick={() => props.onEditMonth(row, i)}
                  aria-label={`Edit ${MONTH_LABELS[i]} for ${row.ministryName}, now ${formatReviewAmount(v)}`}
                  className="rounded-full border px-2 py-0.5 text-xs tabular-nums hover:bg-primary/10"
                >
                  {MONTH_LABELS[i]} {formatReviewAmount(v)}
                </button>
              ) : (
                <span key={i} className="rounded-full border px-2 py-0.5 text-xs tabular-nums">
                  {MONTH_LABELS[i]} {formatReviewAmount(v)}
                </span>
              )
            ) : null,
          )}
        </div>
      ) : (
        <p className="text-sm italic text-muted-foreground">Annual only</p>
      )}

      {props.showFeedback &&
        (perms.canGiveFeedback ? (
          <div className="flex flex-wrap gap-2">
            <RecommendedInput requestId={row.request.id} ministryName={row.ministryName} draft={draft} onChange={props.onDraftChange} onBlur={props.onDraftBlur} />
            <CommentInput requestId={row.request.id} ministryName={row.ministryName} draft={draft} onChange={props.onDraftChange} onBlur={props.onDraftBlur} />
          </div>
        ) : (
          (props.feedback[row.request.id] ?? []).length > 0 && <BoardRemarks feedback={props.feedback[row.request.id]} />
        ))}

      <RowActions row={row} props={props} />
    </div>
  );
}
