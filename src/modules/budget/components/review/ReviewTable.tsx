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
import { Check, ChevronDown, ChevronRight, Pencil, X } from "lucide-react";
import { useState } from "react";
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
    <div className="flex flex-nowrap items-center justify-end gap-1">
      {perms.canEdit && (
        <Button
          size="icon"
          variant="ghost"
          className="h-8 w-8"
          disabled={busy}
          title="Edit this request"
          onClick={() => props.onEditRequest(row)}
          aria-label={`Edit ${row.ministryName}`}
        >
          <Pencil className="h-4 w-4" />
        </Button>
      )}
      {perms.canApproveForBoard && (
        <Button
          size="sm"
          variant="outline"
          className="h-8 border-emerald-600/60 text-emerald-700 hover:bg-emerald-50 hover:text-emerald-800"
          disabled={busy}
          title="Approve, ready to send to the Board"
          onClick={() => props.onApproveForBoard(row)}
          aria-label={`Approve ${row.ministryName} for the Board`}
        >
          <Check className="mr-1 h-4 w-4" />
          Approve
        </Button>
      )}
      {perms.canDeny && (
        <Button
          size="icon"
          variant="ghost"
          className="h-8 w-8 text-destructive hover:bg-destructive/10 hover:text-destructive"
          disabled={busy}
          title="Deny this request"
          onClick={() => props.onDeny(row)}
          aria-label={`Deny ${row.ministryName}`}
        >
          <X className="h-4 w-4" />
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
              <th className={cn(th, "text-left sticky left-0 z-10 bg-muted min-w-[170px]")}>Ministry</th>
              {MONTH_LABELS.map((m) => (
                <th key={m} className={cn(th, "text-right min-w-[64px]")}>{m}</th>
              ))}
              {hasAnnual && <th className={cn(th, "text-right")}>Annual</th>}
              <th className={cn(th, "text-right")}>Total</th>
              {showFeedback && <th className={cn(th, "text-right")}>{anyReadOnlyFeedback ? "Board remarks" : "Recommended"}</th>}
              {showFeedback && !anyReadOnlyFeedback && <th className={cn(th, "text-left")}>Comment</th>}
              <th className={cn(th, "text-right min-w-[190px]")}>Actions</th>
            </tr>
          </thead>
          <tbody>
            {groups.map((g) => (
              <GroupRows key={g.key} group={g} props={props} hasAnnual={hasAnnual} anyReadOnlyFeedback={anyReadOnlyFeedback} />
            ))}
            <tr className="border-t-2 bg-muted/60 font-bold">
              <td />
              <td className={cn(td, "sticky left-0 z-10 bg-muted")}>Total</td>
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
        {groups.map((g) => (
          <GroupCards key={g.key} group={g} props={props} />
        ))}
        <div className="flex justify-between p-3 font-bold">
          <span>Total</span>
          <span className="tabular-nums text-primary">{formatReviewAmount(grand.total)}</span>
        </div>
      </div>
    </>
  );
}

/**
 * A ministry with several requests is one row: the months and total added up,
 * with a chevron that opens the individual requests, which is where Edit,
 * Approve, Deny and the line-by-line months live. A ministry with one request
 * is just that request.
 */
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
  const [open, setOpen] = useState(false);
  const merged = group.rows.length > 1;

  const requestRow = (row: ReviewRow, nested: boolean) => {
    const perms = getRowPermissions(row.request, props.roleFor(row.organizationId));
    const stage = getReviewStage(row.request);
    return (
      <tr key={row.request.id} className={cn("border-b hover:bg-muted/30", nested && "bg-muted/10")}>
        <td className={td}><SelectBox row={row} props={props} /></td>
        <td className={cn(td, "sticky left-0 z-10", nested ? "bg-muted pl-6" : "bg-background")}>
          <div className={nested ? "text-sm" : "font-medium"}>{row.ministryName}</div>
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
  };

  if (!merged) return requestRow(group.rows[0], false);

  const selectable = group.rows.filter((r) => {
    const p = getRowPermissions(r.request, props.roleFor(r.organizationId));
    return p.canSend || p.canBoardDecide;
  });
  const ticked = selectable.filter((r) => props.selected.has(r.request.id)).length;
  const stages = [...new Set(group.rows.map((r) => STAGE_LABEL[getReviewStage(r.request)]))];

  // The month figures of all the requests, so the hover shows every line behind the sum.
  const combined: ReviewRow = {
    ...group.rows[0],
    isMonthly: true,
    lines: group.rows.flatMap((r) => r.lines),
    months: group.months,
    annual: group.annual,
    total: group.total,
  };
  const toggle = () => setOpen((o) => !o);

  return (
    <>
      <tr className="border-b bg-muted/20 hover:bg-muted/40 font-medium">
        <td className={td}>
          {selectable.length > 0 && (
            <Checkbox
              aria-label={`Select all of ${group.ministryName}`}
              checked={ticked === 0 ? false : ticked === selectable.length ? true : "indeterminate"}
              onCheckedChange={(c) => selectable.forEach((r) => props.onToggle(r.request.id, c === true))}
            />
          )}
        </td>
        <td className="sticky left-0 z-10 bg-muted px-2 py-2 align-top text-sm">
          <button
            type="button"
            onClick={toggle}
            aria-expanded={open}
            aria-label={`${open ? "Hide" : "Show"} the ${group.rows.length} requests of ${group.ministryName}`}
            className="flex items-start gap-1 text-left"
          >
            {open ? <ChevronDown className="mt-0.5 h-4 w-4 shrink-0" /> : <ChevronRight className="mt-0.5 h-4 w-4 shrink-0" />}
            <span>
              <span className="block font-medium">{group.ministryName}</span>
              <span className="block text-xs font-normal text-muted-foreground">
                {branchNames(props, group)}{group.rows.length} requests · {stages.join(", ")}
              </span>
            </span>
          </button>
        </td>
        {group.months.map((v, i) => (
          <td key={i} className={cn(td, "text-right")} onClick={toggle}>
            <ReviewMonthCell row={combined} monthIndex={i} canEdit={false} onEdit={props.onEditMonth} />
          </td>
        ))}
        {hasAnnual && <td className={cn(td, "text-right tabular-nums")}>{group.annual > 0 ? formatReviewAmount(group.annual) : "-"}</td>}
        <td className={cn(td, "text-right tabular-nums font-semibold")}>{formatReviewAmount(group.total)}</td>
        {showFeedback && <td />}
        {showFeedback && !anyReadOnlyFeedback && <td />}
        <td />
      </tr>
      {open && group.rows.map((row) => requestRow(row, true))}
    </>
  );
}

function branchNames(props: ReviewTableProps, group: ReviewGroup) {
  const name = props.branchNames?.[group.organizationId];
  return name ? `${name} · ` : "";
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

/** Phone: a ministry with several requests is one card that opens into them. */
function GroupCards({ group, props }: { group: ReviewGroup; props: ReviewTableProps }) {
  const [open, setOpen] = useState(false);
  if (group.rows.length === 1) return <ReviewCard row={group.rows[0]} props={props} />;
  return (
    <div>
      <button
        type="button"
        onClick={() => setOpen((o) => !o)}
        aria-expanded={open}
        aria-label={`${open ? "Hide" : "Show"} the ${group.rows.length} requests of ${group.ministryName}`}
        className="flex w-full items-center gap-2 bg-muted/20 p-3 text-left"
      >
        {open ? <ChevronDown className="h-4 w-4 shrink-0" /> : <ChevronRight className="h-4 w-4 shrink-0" />}
        <span className="min-w-0 flex-1">
          <span className="block font-medium">{group.ministryName}</span>
          <span className="block text-xs text-muted-foreground">
            {branchNames(props, group)}{group.rows.length} requests
          </span>
        </span>
        <span className="font-semibold tabular-nums">{formatReviewAmount(group.total)}</span>
      </button>
      {open && (
        <div className="divide-y border-l-4 border-muted">
          {group.rows.map((row) => (
            <ReviewCard key={row.request.id} row={row} props={props} />
          ))}
        </div>
      )}
    </div>
  );
}
