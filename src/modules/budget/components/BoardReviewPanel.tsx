/**
 * Board Review — the year on one screen.
 *
 * What the Board was asked for is a consolidated sheet: every ministry, what
 * it asked for, and what that adds up to against the money the church has.
 * This is that sheet, in the app rather than in an attachment, so the figures
 * are the live ones and what the Board says goes straight back to the office
 * instead of into somebody's notes.
 *
 * BOTH BRANCHES, always. The Board is given one pot and two churches to spend
 * it on — "in consideration of the overall VA/MD budget" — so the year is read
 * across every branch the viewer belongs to, branch by branch and then added
 * up. An office admin who belongs to one branch sees one branch, which needs
 * no separate code path. A board member is given the tier in BOTH branches;
 * held in only one, they would silently be shown half the year.
 *
 * Who does what here:
 *   - the office (admin) sends requests to the Board, adjusts amounts, and
 *     approves;
 *   - the Board reads, and leaves a recommended figure and a comment;
 *   - treasury and finance read.
 *
 * The Board cannot approve. That is the process as described and it is also
 * what the policies enforce — see 20260322330000.
 */

import { Fragment, useCallback, useMemo, useState } from "react";
import type { ReactNode } from "react";
import {
  Card,
  CardContent,
  CardDescription,
  CardHeader,
  CardTitle,
} from "@/shared/components/ui/card";
import { Button } from "@/shared/components/ui/button";
import { Input } from "@/shared/components/ui/input";
import { Label } from "@/shared/components/ui/label";
import { Textarea } from "@/shared/components/ui/textarea";
import { Badge } from "@/shared/components/ui/badge";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/shared/components/ui/select";
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from "@/shared/components/ui/table";
import {
  ArrowUpDown,
  ChevronDown,
  ChevronRight,
  Eye,
  CheckCircle,
  Edit,
  Loader2,
  MessageSquare,
  Send,
  Undo2,
  Users,
  XCircle,
} from "lucide-react";
import { useToast } from "@/shared/hooks/use-toast";
import { errorMessage } from "@/shared/lib/errorMessage";
import { useAuth } from "@/shared/contexts/AuthContext";
import { useUserProfile } from "@/hooks/useUserProfile";
import { useOrganization } from "@/shared/contexts/OrganizationContext";
import {
  useAllocationRequestsAcrossBranches,
  useBoardFeedback,
  useMoveToBoardReview,
  useSaveBoardFeedback,
} from "../hooks";
import { sortBoardRows, splitByBranch, summariseBoardReview } from "../utils/boardReview";
import type {
  BoardReviewBranch,
  BoardReviewRow,
  BoardSortKey,
  SortDirection,
} from "../utils/boardReview";
import type {
  AllocationBoardFeedback,
  AllocationRequestWithRelations,
} from "../types";
import { AllocationRequestStatusBadge } from "./AllocationRequestStatusBadge";
import { AllocationRequestForm } from "./AllocationRequestForm";
import { AllocationRequestDetailDialog } from "./AllocationRequestDetailDialog";
import { AllocationReviewDialog } from "./AllocationReviewDialog";

/** Sentinel for the branch filter; not an organisation id. */
const ALL_BRANCHES = "__all__";

/** What a board member has typed but not yet saved. */
interface FeedbackDraft {
  amount: string;
  comment: string;
}

const money = (amount: number) =>
  `$${Number(amount).toLocaleString("en-US", {
    minimumFractionDigits: 0,
    maximumFractionDigits: 2,
  })}`;

interface BoardReviewPanelProps {
  /** The budget year as a number. Fiscal years are per branch; this is not. */
  year?: number;
  onRefresh?: () => void;
}

/** One figure and its label, across the top of the sheet. */
const Total = ({
  label,
  value,
  hint,
  tone = "default",
}: {
  label: string;
  value: string;
  hint?: string;
  tone?: "default" | "under" | "over";
}) => (
  // Grouped and named, so a screen reader reads "Requested, $16,000" rather
  // than a bare number three tiles into a row of them.
  <div className="rounded-lg border bg-card p-3 sm:p-4" role="group" aria-label={label}>
    <p className="text-xs sm:text-sm text-muted-foreground">{label}</p>
    <p
      className={`text-lg sm:text-2xl font-bold mt-1 ${
        tone === "under" ? "text-green-600" : tone === "over" ? "text-red-600" : ""
      }`}
    >
      {value}
    </p>
    {hint && <p className="text-[11px] sm:text-xs text-muted-foreground mt-1">{hint}</p>}
  </div>
);

/**
 * One request opened up: what was asked for, what the Board has said, and the
 * controls for whoever is looking.
 *
 * Defined at module scope, not inside the panel. Nested inside, it was a NEW
 * component type on every parent render, so React unmounted and remounted this
 * subtree each time — and since the feedback draft lives in the panel's state,
 * every keystroke re-rendered the panel and took the cursor out of the box
 * being typed in.
 */
const RowDetail = ({
  row,
  draft,
  mine,
  currentUserId,
  isAdmin,
  isBoard,
  saving,
  onDraftChange,
  onSaveFeedback,
  onMove,
  onEdit,
  onReview,
  onViewDetails,
}: {
  row: BoardReviewRow;
  draft: FeedbackDraft;
  mine?: AllocationBoardFeedback;
  currentUserId?: string;
  isAdmin: boolean;
  isBoard: boolean;
  saving: boolean;
  onDraftChange: (patch: Partial<FeedbackDraft>) => void;
  onSaveFeedback: () => void;
  onMove: (direction: "to_board" | "back_to_office") => void;
  onEdit: () => void;
  onReview: (action: "approve" | "deny") => void;
  onViewDetails: () => void;
}) => {
  // What is in the boxes is not what is saved. Said plainly, because a board
  // member who navigates away mid-sentence loses it.
  const unsaved =
    draft.amount !==
      (mine?.recommended_amount !== null && mine?.recommended_amount !== undefined
        ? String(mine.recommended_amount)
        : "") || draft.comment !== (mine?.comment ?? "");

    return (
      <div className="space-y-4 bg-muted/30 p-4">
        <div>
          <p className="text-xs font-medium text-muted-foreground uppercase tracking-wide">
            What they asked for
          </p>
          <p className="text-sm mt-1 whitespace-pre-wrap">
            {row.request.justification || "No justification given."}
          </p>
        </div>

        <div>
          <p className="text-xs font-medium text-muted-foreground uppercase tracking-wide mb-2">
            The Board ({row.feedback.length})
          </p>
          {row.feedback.length === 0 ? (
            <p className="text-sm text-muted-foreground">Nobody has commented yet.</p>
          ) : (
            <ul className="space-y-2">
              {row.feedback.map((note) => (
                <li key={note.id} className="rounded-md border bg-background p-3">
                  <div className="flex flex-wrap items-center gap-2">
                    <span className="text-sm font-medium">{note.board_member_name}</span>
                    {note.recommended_amount !== null && (
                      <Badge variant="secondary">
                        Recommends {money(Number(note.recommended_amount))}
                      </Badge>
                    )}
                    {note.board_member_id === currentUserId && (
                      <Badge variant="outline" className="text-[10px]">
                        You
                      </Badge>
                    )}
                  </div>
                  {note.comment && (
                    <p className="text-sm text-muted-foreground mt-1 whitespace-pre-wrap">
                      {note.comment}
                    </p>
                  )}
                </li>
              ))}
            </ul>
          )}
        </div>

        {isBoard && (
          <div className="rounded-md border bg-background p-3 space-y-3">
            <p className="text-sm font-medium flex items-center gap-2">
              {mine ? "Your feedback" : "Add your feedback"}
              {unsaved && (
                <Badge variant="outline" className="text-[10px] font-normal">
                  Unsaved
                </Badge>
              )}
            </p>
            <div className="grid gap-3 sm:grid-cols-[200px_1fr]">
              <div className="space-y-1.5">
                <Label htmlFor={`amount-${row.request.id}`} className="text-xs">
                  Recommended amount
                </Label>
                <Input
                  id={`amount-${row.request.id}`}
                  inputMode="decimal"
                  placeholder="Leave blank for no change"
                  value={draft.amount}
                  onChange={(e) => onDraftChange({ amount: e.target.value })}
                />
              </div>
              <div className="space-y-1.5">
                <Label htmlFor={`comment-${row.request.id}`} className="text-xs">
                  Comment
                </Label>
                <Textarea
                  id={`comment-${row.request.id}`}
                  rows={2}
                  placeholder="What the office should know"
                  value={draft.comment}
                  onChange={(e) => onDraftChange({ comment: e.target.value })}
                />
              </div>
            </div>
            <Button
              size="sm"
              onClick={onSaveFeedback}
              disabled={saving}
            >
              {saving ? (
                <Loader2 className="h-4 w-4 mr-2 animate-spin" />
              ) : (
                <MessageSquare className="h-4 w-4 mr-2" />
              )}
              {mine ? "Update my feedback" : "Record my feedback"}
            </Button>
          </div>
        )}

        <div className="flex flex-wrap gap-2">
          <Button size="sm" variant="outline" onClick={onViewDetails}>
            <Eye className="h-4 w-4 mr-2" />
            Full breakdown
          </Button>
        </div>

        {isAdmin && (
          <div className="flex flex-wrap gap-2">
            <Button
              size="sm"
              variant="outline"
              onClick={onEdit}
            >
              <Edit className="h-4 w-4 mr-2" />
              Adjust amount
            </Button>
            {row.request.status === "pending" && (
              <Button
                size="sm"
                variant="outline"
                className="text-purple-600"
                onClick={() => onMove("to_board")}
              >
                <Send className="h-4 w-4 mr-2" />
                Send to the Board
              </Button>
            )}
            {row.request.status === "board_review" && (
              <Button
                size="sm"
                variant="outline"
                onClick={() => onMove("back_to_office")}
              >
                <Undo2 className="h-4 w-4 mr-2" />
                Return to the office
              </Button>
            )}
            {(row.request.status === "pending" ||
              row.request.status === "board_review") && (
              <>
                <Button
                  size="sm"
                  className="bg-green-600 hover:bg-green-700"
                  onClick={() => onReview("approve")}
                >
                  <CheckCircle className="h-4 w-4 mr-2" />
                  Approve
                </Button>
                <Button
                  size="sm"
                  variant="destructive"
                  onClick={() => onReview("deny")}
                >
                  <XCircle className="h-4 w-4 mr-2" />
                  Deny
                </Button>
              </>
            )}
          </div>
        )}
      </div>
  );
};

/**
 * A column header that sorts, and says so to a screen reader.
 *
 * aria-sort is the part that is easy to leave out and the part that makes the
 * table navigable without sight of the little arrow.
 */
const SortableHead = ({
  label,
  sortBy,
  sortKey,
  sortDirection,
  onSort,
  align = "left",
}: {
  label: string;
  sortBy: BoardSortKey;
  sortKey: BoardSortKey;
  sortDirection: SortDirection;
  onSort: (key: BoardSortKey) => void;
  align?: "left" | "right";
}) => {
  const active = sortKey === sortBy;

  return (
    <TableHead
      className={align === "right" ? "text-right" : undefined}
      aria-sort={
        active ? (sortDirection === "asc" ? "ascending" : "descending") : "none"
      }
    >
      <button
        type="button"
        onClick={() => onSort(sortBy)}
        className={`inline-flex items-center gap-1 hover:text-foreground ${
          active ? "text-foreground font-medium" : ""
        }`}
      >
        {label}
        <ArrowUpDown className="h-3 w-3 opacity-60" aria-hidden="true" />
      </button>
    </TableHead>
  );
};

/** One branch's rows. Hoisted for the same reason RowDetail is. */
const BranchSheet = ({
  branch,
  showBranchName,
  expandedId,
  sortKey,
  sortDirection,
  onSort,
  onToggle,
  renderDetail,
}: {
  branch: BoardReviewBranch;
  showBranchName: boolean;
  expandedId: string | null;
  sortKey: BoardSortKey;
  sortDirection: SortDirection;
  onSort: (key: BoardSortKey) => void;
  onToggle: (requestId: string) => void;
  renderDetail: (row: BoardReviewRow) => ReactNode;
}) => (
    <div className="space-y-2">
      {showBranchName && (
        <div className="flex flex-wrap items-baseline justify-between gap-2 border-b pb-1">
          <h3 className="text-sm font-semibold">{branch.organizationName}</h3>
          <p className="text-xs text-muted-foreground">
            {branch.rows.length} {branch.rows.length === 1 ? "ministry" : "ministries"} ·
            requested {money(branch.totalRequested)} · board{" "}
            {money(branch.totalRecommended)}
          </p>
        </div>
      )}

      {/* Desktop */}
      <div className="hidden md:block rounded-md border">
        <Table>
          <TableHeader>
            <TableRow>
              <TableHead className="w-8" />
              <SortableHead
                label="Ministry"
                sortBy="ministry"
                sortKey={sortKey}
                sortDirection={sortDirection}
                onSort={onSort}
              />
              <TableHead>Requested by</TableHead>
              <SortableHead
                label="Requested"
                sortBy="requested"
                align="right"
                sortKey={sortKey}
                sortDirection={sortDirection}
                onSort={onSort}
              />
              <SortableHead
                label="Board"
                sortBy="board"
                align="right"
                sortKey={sortKey}
                sortDirection={sortDirection}
                onSort={onSort}
              />
              <SortableHead
                label="Status"
                sortBy="status"
                sortKey={sortKey}
                sortDirection={sortDirection}
                onSort={onSort}
              />
            </TableRow>
          </TableHeader>
          <TableBody>
            {branch.rows.map((row) => {
              const isOpen = expandedId === row.request.id;
              return (
                <Fragment key={row.request.id}>
                  <TableRow
                    className="cursor-pointer focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring"
                    onClick={() => onToggle(row.request.id)}
                    // A row that only opens on click is a row a keyboard cannot
                    // open. The Board reads this sheet for an hour at a time.
                    tabIndex={0}
                    role="button"
                    aria-expanded={isOpen}
                    aria-label={`${row.request.ministry?.name || "Ministry"}, ${
                      isOpen ? "collapse" : "expand"
                    } details`}
                    onKeyDown={(event) => {
                      if (event.key === "Enter" || event.key === " ") {
                        event.preventDefault();
                        onToggle(row.request.id);
                      }
                    }}
                  >
                    <TableCell>
                      {isOpen ? (
                        <ChevronDown className="h-4 w-4" aria-hidden="true" />
                      ) : (
                        <ChevronRight className="h-4 w-4" aria-hidden="true" />
                      )}
                    </TableCell>
                    <TableCell className="font-medium">
                      {row.request.ministry?.name || "Unknown ministry"}
                    </TableCell>
                    <TableCell className="text-muted-foreground">
                      {row.request.requester_name}
                    </TableCell>
                    <TableCell className="text-right">
                      {money(Number(row.request.requested_amount || 0))}
                    </TableCell>
                    <TableCell className="text-right">
                      {row.recommendedAverage === null ? (
                        <span className="text-muted-foreground">
                          {row.feedback.length > 0 ? "Comment only" : "\u2014"}
                        </span>
                      ) : (
                        <span
                          className={
                            row.recommendedAverage <
                            Number(row.request.requested_amount || 0)
                              ? "text-red-600 font-medium"
                              : "font-medium"
                          }
                        >
                          {money(row.recommendedAverage)}
                          {row.recommendedRange &&
                            row.recommendedRange.low !== row.recommendedRange.high && (
                              <span className="block text-[11px] text-muted-foreground font-normal">
                                {money(row.recommendedRange.low)}\u2013
                                {money(row.recommendedRange.high)}
                              </span>
                            )}
                        </span>
                      )}
                    </TableCell>
                    <TableCell>
                      <AllocationRequestStatusBadge status={row.request.status} />
                    </TableCell>
                  </TableRow>
                  {isOpen && (
                    <TableRow>
                      <TableCell colSpan={6} className="p-0">
                        {renderDetail(row)}
                      </TableCell>
                    </TableRow>
                  )}
                </Fragment>
              );
            })}
          </TableBody>
        </Table>
      </div>

      {/* Mobile */}
      <div className="md:hidden space-y-3">
        {branch.rows.map((row) => {
          const isOpen = expandedId === row.request.id;
          return (
            <div key={row.request.id} className="rounded-lg border bg-card">
              <button
                type="button"
                className="w-full text-left p-3"
                onClick={() => onToggle(row.request.id)}
              >
                <div className="flex items-start justify-between gap-2">
                  <div className="min-w-0">
                    <p className="font-medium text-sm truncate">
                      {row.request.ministry?.name || "Unknown ministry"}
                    </p>
                    <p className="text-xs text-muted-foreground truncate">
                      {row.request.requester_name}
                    </p>
                  </div>
                  <AllocationRequestStatusBadge
                    status={row.request.status}
                    className="text-[10px] px-2 py-1 shrink-0"
                  />
                </div>
                <div className="flex items-center justify-between mt-2 text-sm">
                  <span>{money(Number(row.request.requested_amount || 0))}</span>
                  <span className="text-muted-foreground">
                    {row.recommendedAverage === null
                      ? row.feedback.length > 0
                        ? "Comment only"
                        : "No recommendation"
                      : `Board: ${money(row.recommendedAverage)}`}
                  </span>
                </div>
              </button>
              {isOpen && renderDetail(row)}
            </div>
          );
        })}
      </div>
    </div>
  );

export function BoardReviewPanel({ year, onRefresh }: BoardReviewPanelProps) {
  const { toast } = useToast();
  const { user, isAdmin, isBoard } = useAuth();
  const { profile } = useUserProfile();
  const { userOrganizations } = useOrganization();

  const branches = useMemo(
    () =>
      userOrganizations
        .map((membership) => ({
          id: membership.organization_id,
          name: membership.organization?.name || "Branch",
        }))
        .sort((a, b) => a.name.localeCompare(b.name)),
    [userOrganizations],
  );

  const branchIds = useMemo(() => branches.map((branch) => branch.id), [branches]);

  const {
    data: requests,
    isLoading: requestsLoading,
    error: requestsError,
    refetch: refetchRequests,
  } = useAllocationRequestsAcrossBranches(year, branchIds);
  const {
    data: feedback,
    isLoading: feedbackLoading,
    error: feedbackError,
  } = useBoardFeedback(branchIds);
  const moveToBoardReview = useMoveToBoardReview();
  const saveFeedback = useSaveBoardFeedback();

  const [expandedId, setExpandedId] = useState<string | null>(null);
  // The sheet opens on the whole church, because that is the question the
  // Board is answering. One branch at a time is a way of reading it, not the
  // default way.
  const [branchFilter, setBranchFilter] = useState<string>(ALL_BRANCHES);
  // Largest ask first: the four requests that decide the year are the ones the
  // Board spends its hour on.
  const [sortKey, setSortKey] = useState<BoardSortKey>("requested");
  const [sortDirection, setSortDirection] = useState<SortDirection>("desc");
  const [isDetailOpen, setIsDetailOpen] = useState(false);
  const [drafts, setDrafts] = useState<Record<string, FeedbackDraft>>({});
  const [savingId, setSavingId] = useState<string | null>(null);
  const [selectedRequest, setSelectedRequest] =
    useState<AllocationRequestWithRelations | null>(null);
  const [isEditOpen, setIsEditOpen] = useState(false);
  const [isReviewOpen, setIsReviewOpen] = useState(false);
  const [reviewAction, setReviewAction] = useState<"approve" | "deny">("approve");

  const summary = useMemo(
    () => summariseBoardReview(requests, feedback),
    [requests, feedback],
  );

  const allBranchSheets = useMemo(
    () =>
      splitByBranch(summary.rows, branches).map((branch) => ({
        ...branch,
        rows: sortBoardRows(branch.rows, sortKey, sortDirection),
      })),
    [summary.rows, branches, sortKey, sortDirection],
  );

  // Clicking the column you are already sorted by turns it round.
  const handleSort = (key: BoardSortKey) => {
    if (key === sortKey) {
      setSortDirection((current) => (current === "asc" ? "desc" : "asc"));
      return;
    }
    setSortKey(key);
    setSortDirection(key === "ministry" || key === "status" ? "asc" : "desc");
  };

  const branchSheets =
    branchFilter === ALL_BRANCHES
      ? allBranchSheets
      : allBranchSheets.filter((sheet) => sheet.organizationId === branchFilter);

  const isLoading = requestsLoading || feedbackLoading;

  const pendingIds = summary.rows
    .filter((row) => row.request.status === "pending")
    .map((row) => row.request.id);

  const myNote = (row: BoardReviewRow) =>
    row.feedback.find((note) => note.board_member_id === user?.id);

  const draftFor = (row: BoardReviewRow) => {
    const existing = myNote(row);
    return (
      drafts[row.request.id] ?? {
        amount:
          existing?.recommended_amount !== null && existing?.recommended_amount !== undefined
            ? String(existing.recommended_amount)
            : "",
        comment: existing?.comment ?? "",
      }
    );
  };

  const setDraft = useCallback(
    (requestId: string, patch: Partial<FeedbackDraft>) =>
      setDrafts((current) => ({
        ...current,
        [requestId]: { ...(current[requestId] ?? { amount: "", comment: "" }), ...patch },
      })),
    [],
  );

  const handleMove = async (
    requestIds: string[],
    direction: "to_board" | "back_to_office",
  ) => {
    if (!user || requestIds.length === 0) return;

    try {
      const moved = await moveToBoardReview.mutateAsync({
        requestIds,
        direction,
        actorId: user.id,
        actorName: profile?.full_name || "Unknown",
      });

      if (moved.length === 0) {
        toast({
          title: "Nothing moved",
          description: "Those requests are no longer at the step they were on.",
          variant: "destructive",
        });
        return;
      }

      toast({
        title:
          direction === "to_board"
            ? `${moved.length} ${moved.length === 1 ? "request is" : "requests are"} with the Board`
            : "Returned to the office",
      });

      onRefresh?.();
    } catch (error) {
      toast({
        title: "Error",
        description: errorMessage(error, "Failed to move the request"),
        variant: "destructive",
      });
    }
  };

  const handleSaveFeedback = async (row: BoardReviewRow) => {
    if (!user) return;

    const draft = draftFor(row);
    const trimmedComment = draft.comment.trim();
    const amount = draft.amount.trim() === "" ? null : Number(draft.amount);

    if (amount !== null && (Number.isNaN(amount) || amount < 0)) {
      toast({
        title: "That is not an amount",
        description: "Leave the figure blank if you only want to comment.",
        variant: "destructive",
      });
      return;
    }

    // The table refuses a row that says nothing, and it is friendlier to say so
    // here than to hand back a constraint name.
    if (amount === null && trimmedComment === "") {
      toast({
        title: "Nothing to record",
        description: "Give a figure, a comment, or both.",
        variant: "destructive",
      });
      return;
    }

    setSavingId(row.request.id);
    try {
      await saveFeedback.mutateAsync({
        requestId: row.request.id,
        // The branch the REQUEST belongs to, not the branch the viewer happens
        // to be looking at: a board member reads both and the note has to land
        // where the money is.
        organizationId: row.request.organization_id,
        boardMemberId: user.id,
        boardMemberName: profile?.full_name || "Board member",
        recommendedAmount: amount,
        comment: trimmedComment || null,
      });

      setDrafts((current) => {
        const next = { ...current };
        delete next[row.request.id];
        return next;
      });

      toast({ title: "Your feedback is recorded" });
    } catch (error) {
      toast({
        title: "Error",
        description: errorMessage(error, "Failed to save feedback"),
        variant: "destructive",
      });
    } finally {
      setSavingId(null);
    }
  };

  const openReview = (
    request: AllocationRequestWithRelations,
    action: "approve" | "deny",
  ) => {
    setSelectedRequest(request);
    setReviewAction(action);
    setIsReviewOpen(true);
  };

  const renderDetail = (row: BoardReviewRow) => (
    <RowDetail
      row={row}
      draft={draftFor(row)}
      mine={myNote(row)}
      currentUserId={user?.id}
      isAdmin={isAdmin}
      isBoard={isBoard}
      saving={savingId === row.request.id}
      onDraftChange={(patch) => setDraft(row.request.id, patch)}
      onSaveFeedback={() => handleSaveFeedback(row)}
      onMove={(direction) => handleMove([row.request.id], direction)}
      onEdit={() => {
        setSelectedRequest(row.request);
        setIsEditOpen(true);
      }}
      onReview={(action) => openReview(row.request, action)}
      onViewDetails={() => {
        setSelectedRequest(row.request);
        setIsDetailOpen(true);
      }}
    />
  );

  return (
    <div className="space-y-4">
      <Card>
        <CardHeader className="pb-3">
          <div className="flex flex-col sm:flex-row sm:items-start sm:justify-between gap-3">
            <div>
              <CardTitle className="flex items-center gap-2 text-base sm:text-lg">
                <Users className="h-5 w-5" />
                Board Review{year ? ` — ${year}` : ""}
              </CardTitle>
              <CardDescription>
                {branchSheets.length > 1
                  ? "Every ministry in both branches, side by side, and what the Board says about each one."
                  : "Every ministry's request for the year, side by side, and what the Board says about each one."}
              </CardDescription>
            </div>
            <div className="flex items-center gap-2 self-start">
              {branches.length > 1 && (
                <Select value={branchFilter} onValueChange={setBranchFilter}>
                  <SelectTrigger className="h-9 w-[150px]" aria-label="Filter by branch">
                    <SelectValue />
                  </SelectTrigger>
                  <SelectContent>
                    <SelectItem value={ALL_BRANCHES}>Both branches</SelectItem>
                    {branches.map((branch) => (
                      <SelectItem key={branch.id} value={branch.id}>
                        {branch.name}
                      </SelectItem>
                    ))}
                  </SelectContent>
                </Select>
              )}
              {isAdmin && pendingIds.length > 0 && (
              <Button
                size="sm"
                className="self-start bg-purple-600 hover:bg-purple-700"
                onClick={() => handleMove(pendingIds, "to_board")}
                disabled={moveToBoardReview.isPending}
              >
                {moveToBoardReview.isPending ? (
                  <Loader2 className="h-4 w-4 mr-2 animate-spin" />
                ) : (
                  <Send className="h-4 w-4 mr-2" />
                )}
                Send {pendingIds.length} to the Board
              </Button>
              )}
            </div>
          </div>
        </CardHeader>
        <CardContent className="space-y-4">
          {feedbackError && (
            // Silence here would read as "the Board has said nothing", which is
            // the opposite of what an unreachable table means.
            <div className="rounded-md border border-amber-300 bg-amber-50 p-3 text-sm text-amber-900 dark:border-amber-800 dark:bg-amber-950 dark:text-amber-200">
              The Board's feedback could not be loaded, so the figures below show
              what was requested and nothing the Board has said. Refresh, and tell
              somebody if it persists.
            </div>
          )}

          <div className="grid grid-cols-2 lg:grid-cols-4 gap-3">
            <Total
              label="Requested"
              value={money(summary.totalRequested)}
              hint={`${summary.rows.length} ministries`}
            />
            <Total
              label="Board's recommendation"
              value={money(summary.totalRecommended)}
              hint={
                summary.requestsWithFeedback === 0
                  ? "Nothing recommended yet"
                  : `${summary.requestsWithFeedback} of ${summary.rows.length} reviewed`
              }
            />
            <Total
              label="Difference"
              value={`${summary.difference > 0 ? "+" : ""}${money(summary.difference)}`}
              tone={summary.difference < 0 ? "under" : summary.difference > 0 ? "over" : "default"}
              hint={summary.difference === 0 ? "As requested" : "Against what was asked"}
            />
            <Total
              label="With the Board"
              value={String(summary.withTheBoard)}
              hint={`${summary.awaitingTheOffice} at the office, ${summary.decided} decided`}
            />
          </div>

          {isLoading ? (
            <div className="flex items-center justify-center py-10">
              <Loader2 className="h-6 w-6 animate-spin text-muted-foreground" />
            </div>
          ) : requestsError ? (
            // An empty sheet and an unreachable one look identical, and one of
            // them means "the Board has nothing to review this year".
            <div className="py-10 text-center space-y-3">
              <p className="text-sm text-muted-foreground">
                The budget requests could not be loaded.
              </p>
              <Button variant="outline" size="sm" onClick={() => refetchRequests()}>
                Try again
              </Button>
            </div>
          ) : branchSheets.length === 0 ? (
            <p className="text-center text-sm text-muted-foreground py-10">
              No budget requests for {year ?? "this year"} yet.
            </p>
          ) : (
            <div className="space-y-6">
              {branchSheets.map((branch) => (
                <BranchSheet
                  key={branch.organizationId}
                  branch={branch}
                  showBranchName={branchSheets.length > 1}
                  expandedId={expandedId}
                  sortKey={sortKey}
                  sortDirection={sortDirection}
                  onSort={handleSort}
                  onToggle={(requestId) =>
                    setExpandedId(expandedId === requestId ? null : requestId)
                  }
                  renderDetail={renderDetail}
                />
              ))}
            </div>
          )}
        </CardContent>
      </Card>

      {selectedRequest && (
        <AllocationRequestForm
          open={isEditOpen}
          onOpenChange={setIsEditOpen}
          request={selectedRequest}
          onSuccess={() => {
            setIsEditOpen(false);
            onRefresh?.();
          }}
        />
      )}

      <AllocationRequestDetailDialog
        open={isDetailOpen}
        onOpenChange={setIsDetailOpen}
        request={selectedRequest}
        userRole={isAdmin ? "admin" : "requester"}
      />

      <AllocationReviewDialog
        open={isReviewOpen}
        onOpenChange={setIsReviewOpen}
        request={selectedRequest}
        action={reviewAction}
        onSuccess={() => {
          setIsReviewOpen(false);
          onRefresh?.();
        }}
      />
    </div>
  );
}
