/**
 * The by-month budget review: one screen for the local leaders and the Board.
 *
 * Local leaders (an admin of the branch) review preliminary requests, edit
 * months, approve for the Board and send batches. The Board sees only what was
 * sent to it, across branches, adds a Recommended amount and Comment per
 * request, and sends the batch back or gives final approval. The Board never
 * edits a figure.
 *
 * What each row allows comes from getRowPermissions for the viewer's role in
 * that row's branch; the database enforces the same rules.
 */

import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import { Loader2 } from "lucide-react";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/shared/components/ui/card";
import { Button } from "@/shared/components/ui/button";
import { Textarea } from "@/shared/components/ui/textarea";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/shared/components/ui/select";
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from "@/shared/components/ui/dialog";
import { useAuth } from "@/shared/contexts/AuthContext";
import { useOrganization } from "@/shared/contexts/OrganizationContext";
import { useUserProfile } from "@/hooks/useUserProfile";
import { useToast } from "@/shared/hooks/use-toast";
import { errorMessage } from "@/shared/lib/errorMessage";
import {
  useAllocationRequestsAcrossBranches,
  useBoardDecideMany,
  useBoardFeedback,
  useCouncilDecision,
  useSaveBoardFeedback,
  useSendToBoard,
} from "../../hooks/useBoardReview";
import { AllocationRequestForm } from "../AllocationRequestForm";
import {
  buildReviewRow,
  groupByMinistry,
  isReviewable,
  type ReviewRow,
} from "../../utils/reviewMatrix";
import { getRowPermissions, isVisibleToBoard, type ReviewRole } from "../../utils/reviewStage";
import type { AllocationBoardFeedback } from "../../types";
import { draftFrom, parseDraft, type FeedbackDraft } from "../../utils/feedbackDraft";
import { MonthEditorDialog } from "./MonthEditorDialog";
import { ReviewActionBar, type BulkAction } from "./ReviewActionBar";
import { ReviewTable } from "./ReviewTable";

interface BudgetReviewSectionProps {
  /** The budget year under review (2027), a number: each branch has its own fiscal year row. */
  year: number;
  /** Branches in view. One for the local leaders; the Board's branches for the Board. */
  organizationIds: string[];
  title?: string;
  description?: string;
  /** Hide the "All branches" selector even when there are several. */
  onRefresh?: () => void;
}

const ALL = "all";

export function BudgetReviewSection({
  year,
  organizationIds,
  title = "Consolidated Monthly Budget Summary",
  description,
  onRefresh,
}: BudgetReviewSectionProps) {
  const { user } = useAuth();
  const { userOrganizations } = useOrganization();
  const { profile } = useUserProfile();
  const { toast } = useToast();

  const [branch, setBranch] = useState<string>(ALL);
  const orgIds = useMemo(
    () => (branch === ALL ? organizationIds : organizationIds.filter((id) => id === branch)),
    [branch, organizationIds],
  );

  const { data: requests = [], isLoading } = useAllocationRequestsAcrossBranches(year, orgIds);
  const { data: allFeedback = [] } = useBoardFeedback(orgIds);

  const roleOf = useMemo(() => {
    const map = new Map<string, ReviewRole>();
    for (const m of userOrganizations) {
      map.set(m.organization_id, m.role === "admin" ? "admin" : m.role === "board" ? "board" : "other");
    }
    return map;
  }, [userOrganizations]);
  const roleFor = useCallback((orgId: string): ReviewRole => roleOf.get(orgId) ?? "other", [roleOf]);

  const branchNames = useMemo(
    () =>
      Object.fromEntries(
        userOrganizations.filter((m) => m.organization).map((m) => [m.organization_id, m.organization!.name]),
      ) as Record<string, string>,
    [userOrganizations],
  );

  // Rows: reviewable requests; where the viewer is only the Board, only what has been sent to it.
  const rows = useMemo(
    () =>
      requests
        .filter((r) => isReviewable(r.status))
        .filter((r) => roleFor(r.organization_id) !== "board" || isVisibleToBoard(r))
        .map(buildReviewRow),
    [requests, roleFor],
  );
  const groups = useMemo(() => groupByMinistry(rows), [rows]);

  const hasAdmin = organizationIds.some((id) => roleFor(id) === "admin");
  const hasBoard = organizationIds.some((id) => roleFor(id) === "board");
  const mode: "leaders" | "board" = hasAdmin ? "leaders" : "board";

  // The Board's feedback for each request: the current round's, from every member.
  const feedback = useMemo(() => {
    const byRequest: Record<string, AllocationBoardFeedback[]> = {};
    for (const f of allFeedback) (byRequest[f.request_id] ??= []).push(f);
    for (const id of Object.keys(byRequest)) {
      const top = Math.max(...byRequest[id].map((f) => f.round ?? 0));
      byRequest[id] = byRequest[id].filter((f) => (f.round ?? 0) === top);
    }
    return byRequest;
  }, [allFeedback]);

  const showFeedback = hasBoard || Object.keys(feedback).length > 0;

  // Selection. The Board's rows start ticked; the leaders' do not.
  const [selected, setSelected] = useState<Set<string>>(new Set());
  const seen = useRef<Set<string>>(new Set());
  useEffect(() => {
    const add: string[] = [];
    for (const row of rows) {
      if (seen.current.has(row.request.id)) continue;
      seen.current.add(row.request.id);
      if (getRowPermissions(row.request, roleFor(row.organizationId)).canBoardDecide) add.push(row.request.id);
    }
    if (add.length) setSelected((prev) => new Set([...prev, ...add]));
  }, [rows, roleFor]);

  const toggle = (id: string, checked: boolean) =>
    setSelected((prev) => {
      const next = new Set(prev);
      if (checked) next.add(id);
      else next.delete(id);
      return next;
    });

  const permsOf = (row: ReviewRow) => getRowPermissions(row.request, roleFor(row.organizationId));
  const sendRows = rows.filter((r) => selected.has(r.request.id) && permsOf(r).canSend);
  const boardRows = rows.filter((r) => selected.has(r.request.id) && permsOf(r).canBoardDecide);

  // Recommended amount and Comment, kept as typed and saved when the field is left.
  const [drafts, setDrafts] = useState<Record<string, FeedbackDraft>>({});
  const mine = useMemo(() => {
    const map: Record<string, AllocationBoardFeedback | undefined> = {};
    for (const [id, list] of Object.entries(feedback)) map[id] = list.find((f) => f.board_member_id === user?.id);
    return map;
  }, [feedback, user?.id]);
  useEffect(() => {
    setDrafts((prev) => {
      const next = { ...prev };
      let changed = false;
      for (const row of rows) {
        if (next[row.request.id]) continue;
        next[row.request.id] = draftFrom(mine[row.request.id]);
        changed = true;
      }
      return changed ? next : prev;
    });
  }, [rows, mine]);

  const saveFeedback = useSaveBoardFeedback();
  const persisted = (id: string) => draftFrom(mine[id]);

  /** Saves one request's draft if it differs from what is stored. Returns false if it could not. */
  const saveDraft = async (row: ReviewRow, draft: FeedbackDraft): Promise<boolean> => {
    const stored = persisted(row.request.id);
    if (stored.amount === draft.amount.trim() && stored.comment === draft.comment.trim()) return true;
    const parsed = parseDraft(draft);
    if (!parsed) {
      toast({ title: "Recommended amount", description: `Enter $0 or more for ${row.ministryName}.`, variant: "destructive" });
      return false;
    }
    if (!user) return false;
    try {
      await saveFeedback.mutateAsync({
        requestId: row.request.id,
        organizationId: row.organizationId,
        boardMemberId: user.id,
        boardMemberName: profile?.full_name || user.email || "Board member",
        recommendedAmount: parsed.amount,
        comment: parsed.comment,
      });
      return true;
    } catch (error) {
      toast({ title: "Your note could not be saved", description: errorMessage(error), variant: "destructive" });
      return false;
    }
  };

  const rowById = useMemo(() => new Map(rows.map((r) => [r.request.id, r])), [rows]);
  const onDraftBlur = (id: string) => {
    const row = rowById.get(id);
    if (row && getRowPermissions(row.request, roleFor(row.organizationId)).canGiveFeedback) {
      void saveDraft(row, drafts[id] ?? { amount: "", comment: "" });
    }
  };

  /** Saves every pending note on the rows about to be acted on, so a typed-but-unsaved one is not lost. */
  const flush = async (targets: ReviewRow[]) => {
    const results = await Promise.all(
      targets.map((r) => saveDraft(r, drafts[r.request.id] ?? { amount: "", comment: "" })),
    );
    return results.every(Boolean);
  };

  // Actions
  const council = useCouncilDecision();
  const sendToBoard = useSendToBoard();
  const decideMany = useBoardDecideMany();

  const [editMonth, setEditMonth] = useState<{ row: ReviewRow; month: number } | null>(null);
  const [editing, setEditing] = useState<ReviewRow | null>(null);
  const [denying, setDenying] = useState<ReviewRow | null>(null);
  const [denyNote, setDenyNote] = useState("");

  const approveForBoard = async (row: ReviewRow) => {
    try {
      await council.mutateAsync({ requestId: row.request.id, decision: "conditional" });
      toast({ title: "Approved for the Board", description: row.ministryName });
    } catch (error) {
      toast({ title: "Could not approve", description: errorMessage(error), variant: "destructive" });
    }
  };

  const deny = async () => {
    if (!denying) return;
    try {
      await council.mutateAsync({ requestId: denying.request.id, decision: "deny", notes: denyNote.trim() || null });
      toast({ title: "Request denied", description: denying.ministryName });
      setDenying(null);
      setDenyNote("");
    } catch (error) {
      toast({ title: "Could not deny", description: errorMessage(error), variant: "destructive" });
    }
  };

  const confirmBulk = async (action: BulkAction, note: string | null) => {
    try {
      if (action === "send") {
        const moved = await sendToBoard.mutateAsync(sendRows.map((r) => r.request.id));
        toast({ title: `${moved} sent to the Board`, description: "The Board has been told." });
      } else {
        if (!(await flush(boardRows))) return;
        const result = await decideMany.mutateAsync({
          requestIds: boardRows.map((r) => r.request.id),
          decision: action,
          notes: note,
        });
        const skipped = result.skipped.length;
        toast({
          title: action === "approve" ? `${result.moved} given final approval` : `${result.moved} sent back to the local leaders`,
          description: skipped ? `${skipped} skipped: ${result.skipped[0].reason}` : undefined,
          variant: skipped ? "destructive" : "default",
        });
      }
      setSelected(new Set());
      onRefresh?.();
    } catch (error) {
      toast({ title: "That did not go through", description: errorMessage(error), variant: "destructive" });
    }
  };

  const busy = sendToBoard.isPending || decideMany.isPending || saveFeedback.isPending;

  return (
    <Card>
      <CardHeader className="p-3 sm:p-6">
        <div className="flex flex-wrap items-start justify-between gap-3">
          <div>
            <CardTitle className="text-base sm:text-lg">{title}</CardTitle>
            <CardDescription className="text-xs sm:text-sm">
              {description ??
                (mode === "board"
                  ? `${year} budget requests the local leaders have sent for your review`
                  : `${year} budget requests by ministry and month. Hover a month for its line items; click it to edit.`)}
            </CardDescription>
          </div>
          {organizationIds.length > 1 && (
            <Select value={branch} onValueChange={setBranch}>
              <SelectTrigger className="w-44" aria-label="Branch">
                <SelectValue />
              </SelectTrigger>
              <SelectContent>
                <SelectItem value={ALL}>All branches</SelectItem>
                {organizationIds.map((id) => (
                  <SelectItem key={id} value={id}>
                    {branchNames[id] ?? "Branch"}
                  </SelectItem>
                ))}
              </SelectContent>
            </Select>
          )}
        </div>
      </CardHeader>

      <CardContent className="p-0">
        {isLoading ? (
          <div className="flex justify-center py-12">
            <Loader2 className="h-6 w-6 animate-spin text-muted-foreground" />
          </div>
        ) : rows.length === 0 ? (
          <p className="p-6 text-sm text-muted-foreground">
            {mode === "board"
              ? "Nothing has been sent to the Board for this year yet."
              : `No ${year} budget requests have been submitted yet.`}
          </p>
        ) : (
          <>
            <ReviewTable
              groups={groups}
              roleFor={roleFor}
              branchNames={organizationIds.length > 1 ? branchNames : undefined}
              selected={selected}
              onToggle={toggle}
              showFeedback={showFeedback}
              feedback={feedback}
              drafts={drafts}
              onDraftChange={(id, d) => setDrafts((prev) => ({ ...prev, [id]: d }))}
              onDraftBlur={onDraftBlur}
              onEditMonth={(row, month) => setEditMonth({ row, month })}
              onEditRequest={setEditing}
              onApproveForBoard={approveForBoard}
              onDeny={setDenying}
              busyRequestId={council.isPending ? council.variables?.requestId : null}
            />
            <ReviewActionBar
              mode={mode}
              sendRows={sendRows}
              boardRows={boardRows}
              busy={busy}
              onConfirm={confirmBulk}
            />
          </>
        )}
      </CardContent>

      <MonthEditorDialog
        row={editMonth ? rowById.get(editMonth.row.request.id) ?? editMonth.row : null}
        monthIndex={editMonth?.month ?? null}
        onClose={() => setEditMonth(null)}
      />

      <AllocationRequestForm
        open={!!editing}
        onOpenChange={(o) => !o && setEditing(null)}
        request={editing?.request ?? null}
        onSuccess={() => {
          setEditing(null);
          onRefresh?.();
        }}
      />

      <Dialog open={!!denying} onOpenChange={(o) => !o && setDenying(null)}>
        <DialogContent>
          <DialogHeader>
            <DialogTitle>Deny {denying?.ministryName}?</DialogTitle>
            <DialogDescription>The ministry is told. A short reason helps them.</DialogDescription>
          </DialogHeader>
          <Textarea rows={3} aria-label="Reason" value={denyNote} onChange={(e) => setDenyNote(e.target.value)} />
          <DialogFooter>
            <Button variant="outline" onClick={() => setDenying(null)}>
              Cancel
            </Button>
            <Button variant="destructive" onClick={deny} disabled={council.isPending}>
              Deny
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </Card>
  );
}

export default BudgetReviewSection;
