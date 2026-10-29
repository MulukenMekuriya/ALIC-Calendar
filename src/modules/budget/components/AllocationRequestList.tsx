/**
 * AllocationRequestList - List of allocation requests with filtering and actions
 */

import { useState } from "react";
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from "@/shared/components/ui/table";
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuSeparator,
  DropdownMenuTrigger,
} from "@/shared/components/ui/dropdown-menu";
import { Button } from "@/shared/components/ui/button";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/shared/components/ui/select";
import {
  Card,
  CardContent,
  CardHeader,
  CardTitle,
} from "@/shared/components/ui/card";
import {
  MoreHorizontal,
  Eye,
  Edit,
  Trash2,
  Send,
  Loader2,
  Wallet,
  CheckCircle,
  XCircle,
  Undo2,
  Users,
  ShieldCheck,
} from "lucide-react";
import { format } from "date-fns";
import { AllocationRequestStatusBadge, CarriedOverBadge } from "./AllocationRequestStatusBadge";
import { AllocationRequestForm } from "./AllocationRequestForm";
import { AllocationRequestDetailDialog } from "./AllocationRequestDetailDialog";
import {
  AllocationReviewDialog,
  RecallAllocationDialog,
  type ReviewAction,
} from "./AllocationReviewDialog";
import { useToast } from "@/shared/hooks/use-toast";
import { errorMessage } from "@/shared/lib/errorMessage";
import { useAuth } from "@/shared/contexts/AuthContext";
import { useSearch } from "@/shared/contexts/SearchContext";
import { useUserProfile } from "@/hooks/useUserProfile";
import { useOrganization } from "@/shared/contexts/OrganizationContext";
import { isRequestLocked } from "../utils/requestSeason";
import {
  useDeleteAllocationRequest,
  useSubmitAllocationRequest,
  useCancelAllocationRequest,
  useRequestSeason,
  useSendToBoard,
} from "../hooks";
import type {
  AllocationRequestWithRelations,
  AllocationRequestStatus,
} from "../types";
import { ALLOCATION_REQUEST_STATUS_CONFIG } from "../types";

/** Where the Leadership Council (an admin) can still adjust a request. */
const OFFICE_EDITABLE: AllocationRequestStatus[] = [
  "pending",
  "under_review",
  "conditionally_approved",
];

interface AllocationRequestListProps {
  requests: AllocationRequestWithRelations[];
  isLoading?: boolean;
  userRole?: "admin" | "treasury" | "finance" | "board" | "requester";
  onRefresh?: () => void;
}

export function AllocationRequestList({
  requests,
  isLoading = false,
  userRole = "requester",
  onRefresh,
}: AllocationRequestListProps) {
  const { toast } = useToast();
  const { user } = useAuth();
  const { profile } = useUserProfile();
  const { currentOrganization } = useOrganization();
  const { data: season } = useRequestSeason(currentOrganization?.id);

  // State for dialogs
  const [selectedRequest, setSelectedRequest] =
    useState<AllocationRequestWithRelations | null>(null);
  const [isDetailDialogOpen, setIsDetailDialogOpen] = useState(false);
  const [isEditDialogOpen, setIsEditDialogOpen] = useState(false);
  const [isReviewDialogOpen, setIsReviewDialogOpen] = useState(false);
  const [isRecallDialogOpen, setIsRecallDialogOpen] = useState(false);
  const [reviewAction, setReviewAction] = useState<ReviewAction>("approve");

  // Global search from header
  const { searchQuery } = useSearch();

  // Filters
  const [statusFilter, setStatusFilter] = useState<
    AllocationRequestStatus | "all"
  >("all");

  // Mutations
  const deleteRequest = useDeleteAllocationRequest();
  const submitRequest = useSubmitAllocationRequest();
  const cancelRequest = useCancelAllocationRequest();
  const sendToBoard = useSendToBoard();

  // Filter requests (EXCLUDE cancelled requests completely)
  const filteredRequests = requests.filter((request) => {
    // First, exclude cancelled requests entirely
    if (request.status === "cancelled") {
      return false;
    }

    const matchesSearch =
      request.justification.toLowerCase().includes(searchQuery.toLowerCase()) ||
      request.ministry?.name
        ?.toLowerCase()
        .includes(searchQuery.toLowerCase()) ||
      request.requester_name.toLowerCase().includes(searchQuery.toLowerCase());

    const matchesStatus =
      statusFilter === "all" || request.status === statusFilter;

    return matchesSearch && matchesStatus;
  });

  const handleSendToBoard = async (request: AllocationRequestWithRelations) => {
    try {
      const moved = await sendToBoard.mutateAsync([request.id]);

      // Only a conditionally approved request moves, so nothing moving means
      // somebody else got there while the menu was open.
      if (moved === 0) {
        toast({
          title: "Nothing moved",
          description: "This request is no longer conditionally approved. Refresh to see where it is.",
          variant: "destructive",
        });
        return;
      }

      toast({
        title: "Sent for Board Review",
        description: `${request.ministry?.name || "This ministry"}'s request is with the Board, and board@alic.org has been emailed.`,
      });

      onRefresh?.();
    } catch (error) {
      toast({
        title: "Error",
        description: errorMessage(error, "Failed to send the request to the Board"),
        variant: "destructive",
      });
    }
  };

  const openReview = (request: AllocationRequestWithRelations, action: ReviewAction) => {
    setSelectedRequest(request);
    setReviewAction(action);
    setIsReviewDialogOpen(true);
  };

  const handleDelete = async (request: AllocationRequestWithRelations) => {
    if (!confirm("Are you sure you want to delete this allocation request?"))
      return;

    try {
      await deleteRequest.mutateAsync(request.id);
      toast({
        title: "Request deleted",
        description: "The allocation request has been deleted.",
      });
      onRefresh?.();
    } catch (error) {
      toast({
        title: "Error",
        description:
          errorMessage(error, "Failed to delete request"),
        variant: "destructive",
      });
    }
  };

  const handleSubmit = async (request: AllocationRequestWithRelations) => {
    if (!user || !profile) return;

    try {
      await submitRequest.mutateAsync({
        requestId: request.id,
        actorId: user.id,
        actorName: profile.full_name,
      });
      toast({
        title: "Request submitted",
        description: "Your allocation request has been submitted for review.",
      });
      onRefresh?.();
    } catch (error) {
      toast({
        title: "Error",
        description:
          errorMessage(error, "Failed to submit request"),
        variant: "destructive",
      });
    }
  };

  const handleCancel = async (request: AllocationRequestWithRelations) => {
    if (!user || !profile) return;
    if (!confirm("Are you sure you want to cancel this allocation request?"))
      return;

    try {
      await cancelRequest.mutateAsync({
        requestId: request.id,
        actorId: user.id,
        actorName: profile.full_name,
      });
      toast({
        title: "Request cancelled",
        description: "The allocation request has been cancelled.",
      });
      onRefresh?.();
    } catch (error) {
      toast({
        title: "Error",
        description:
          errorMessage(error, "Failed to cancel request"),
        variant: "destructive",
      });
    }
  };

  const isReviewer =
    userRole === "admin" || userRole === "treasury" || userRole === "finance";

  // Outside its season a request is closed to everyone but an admin of the
  // branch; budget.assert_request_season refuses it either way.
  const locked = (request: AllocationRequestWithRelations) =>
    isRequestLocked(season, request.fiscal_year_id);

  // A submitted request can be edited by its requester until the deadline:
  // "You may review, edit, and update your submissions at any time before the
  // deadline." The Leadership Council (an admin) edits it at every review
  // stage, before and after the Board, and that first edit is what moves it
  // to Under Review.
  const canEdit = (request: AllocationRequestWithRelations) =>
    (!locked(request) &&
      ((request.status === "draft" &&
        (request.requester_id === user?.id || isReviewer)) ||
        // A ministry keeps its right to change its own request after review
        // has begun, until the deadline (the lock above closes it).
        (["pending", "under_review", "conditionally_approved"].includes(request.status) &&
          request.requester_id === user?.id))) ||
    (userRole === "admin" && OFFICE_EDITABLE.includes(request.status));

  const canDelete = (request: AllocationRequestWithRelations) =>
    !locked(request) &&
    ((request.status === "draft" &&
      (request.requester_id === user?.id || isReviewer)) ||
      (userRole === "admin" && request.status === "denied"));

  const canSubmit = (request: AllocationRequestWithRelations) =>
    !locked(request) &&
    request.status === "draft" &&
    request.requester_id === user?.id;

  const canCancel = (request: AllocationRequestWithRelations) =>
    !locked(request) &&
    request.status === "pending" &&
    (request.requester_id === user?.id || isReviewer);

  // The Leadership Council is the branch's admins; the Board gives final
  // approval, and an admin may act for it.
  const councilStep = (request: AllocationRequestWithRelations) =>
    userRole === "admin" &&
    (request.status === "pending" || request.status === "under_review");

  const readyForBoard = (request: AllocationRequestWithRelations) =>
    userRole === "admin" && request.status === "conditionally_approved";

  const boardStep = (request: AllocationRequestWithRelations) =>
    (userRole === "board" || userRole === "admin") && request.status === "board_review";

  /** The decisions for wherever this request is now. */
  const decisionItems = (request: AllocationRequestWithRelations) => {
    if (councilStep(request)) {
      return (
        <>
          <DropdownMenuSeparator />
          <DropdownMenuItem onClick={() => openReview(request, "conditional")} className="text-teal-600">
            <ShieldCheck className="mr-2 h-4 w-4" />
            Conditional Approval
          </DropdownMenuItem>
          <DropdownMenuItem onClick={() => openReview(request, "deny")} className="text-red-600">
            <XCircle className="mr-2 h-4 w-4" />
            Deny
          </DropdownMenuItem>
        </>
      );
    }
    if (readyForBoard(request)) {
      return (
        <>
          <DropdownMenuSeparator />
          <DropdownMenuItem onClick={() => handleSendToBoard(request)} className="text-purple-600">
            <Users className="mr-2 h-4 w-4" />
            Send for Board Review
          </DropdownMenuItem>
          <DropdownMenuItem onClick={() => openReview(request, "deny")} className="text-red-600">
            <XCircle className="mr-2 h-4 w-4" />
            Deny
          </DropdownMenuItem>
        </>
      );
    }
    if (boardStep(request)) {
      return (
        <>
          <DropdownMenuSeparator />
          <DropdownMenuItem onClick={() => openReview(request, "approve")} className="text-green-600">
            <CheckCircle className="mr-2 h-4 w-4" />
            Final Approval
          </DropdownMenuItem>
          <DropdownMenuItem onClick={() => openReview(request, "return")}>
            <Undo2 className="mr-2 h-4 w-4" />
            Return to Council
          </DropdownMenuItem>
          <DropdownMenuItem onClick={() => openReview(request, "deny")} className="text-red-600">
            <XCircle className="mr-2 h-4 w-4" />
            Deny
          </DropdownMenuItem>
        </>
      );
    }
    return null;
  };

  const canRecallApproval = (request: AllocationRequestWithRelations) =>
    (request.status === "approved" || request.status === "partially_approved") &&
    isReviewer;

  if (isLoading) {
    return (
      <Card>
        <CardContent className="flex items-center justify-center py-12">
          <Loader2 className="h-8 w-8 animate-spin text-muted-foreground" />
        </CardContent>
      </Card>
    );
  }

  return (
    <>
      <Card>
        <CardHeader>
          <CardTitle className="flex items-center gap-2">
            <Wallet className="h-5 w-5" />
            Budget Requests
          </CardTitle>
        </CardHeader>
        <CardContent>
          {/* Filters */}
          <div className="flex flex-col md:flex-row gap-4 mb-6">
            <Select
              value={statusFilter}
              onValueChange={(value) =>
                setStatusFilter(value as AllocationRequestStatus | "all")
              }
            >
              <SelectTrigger className="w-full md:w-[200px]">
                <SelectValue placeholder="Filter by status" />
              </SelectTrigger>
              <SelectContent>
                <SelectItem value="all">All Statuses</SelectItem>
                {Object.entries(ALLOCATION_REQUEST_STATUS_CONFIG).map(
                  ([status, config]) => (
                    <SelectItem key={status} value={status}>
                      {config.label}
                    </SelectItem>
                  )
                )}
              </SelectContent>
            </Select>
          </div>

          {/* Table / Cards */}
          {filteredRequests.length === 0 ? (
            <div className="text-center py-12 text-muted-foreground">
              <Wallet className="h-12 w-12 mx-auto mb-4 opacity-20" />
              <p>No allocation requests found</p>
            </div>
          ) : (
            <>
              {/* Mobile Card View */}
              <div className="md:hidden space-y-3">
                {filteredRequests.map((request) => (
                  <div
                    key={request.id}
                    className="border rounded-lg p-4 space-y-3 bg-card"
                  >
                    <div className="flex items-start justify-between gap-2">
                      <div className="flex-1 min-w-0">
                        <p className="font-medium text-sm line-clamp-2">
                          {request.ministry?.name || "-"}
                        </p>
                      </div>
                      <div className="flex flex-col items-end gap-1">
                        <AllocationRequestStatusBadge status={request.status} />
                        {request.carried_over_from && <CarriedOverBadge />}
                      </div>
                    </div>
                    <div className="flex items-center justify-between">
                      <div>
                        <p className="text-lg font-semibold">
                          ${Number(request.requested_amount).toLocaleString("en-US", {
                            minimumFractionDigits: 2,
                            maximumFractionDigits: 2,
                          })}
                        </p>
                        {request.approved_amount &&
                          request.approved_amount !== request.requested_amount && (
                            <p className="text-xs text-green-600">
                              Approved: ${Number(request.approved_amount).toLocaleString("en-US", {
                                minimumFractionDigits: 2,
                                maximumFractionDigits: 2,
                              })}
                            </p>
                          )}
                      </div>
                      <p className="text-xs text-muted-foreground">
                        {format(new Date(request.created_at), "MMM d, yyyy")}
                      </p>
                    </div>
                    <div className="flex items-center gap-2 pt-2 border-t">
                      <Button
                        variant="outline"
                        size="sm"
                        className="flex-1"
                        onClick={() => {
                          setSelectedRequest(request);
                          setIsDetailDialogOpen(true);
                        }}
                      >
                        <Eye className="h-4 w-4 mr-2" />
                        View
                      </Button>
                      <DropdownMenu>
                        <DropdownMenuTrigger asChild>
                          <Button variant="outline" size="sm">
                            <MoreHorizontal className="h-4 w-4" />
                          </Button>
                        </DropdownMenuTrigger>
                        <DropdownMenuContent align="end">
                          {canEdit(request) && (
                            <DropdownMenuItem
                              onClick={() => {
                                setSelectedRequest(request);
                                setIsEditDialogOpen(true);
                              }}
                            >
                              <Edit className="mr-2 h-4 w-4" />
                              Edit
                            </DropdownMenuItem>
                          )}
                          {canSubmit(request) && (
                            <DropdownMenuItem onClick={() => handleSubmit(request)}>
                              <Send className="mr-2 h-4 w-4" />
                              Submit for Review
                            </DropdownMenuItem>
                          )}
                          {decisionItems(request)}

                          {canRecallApproval(request) && (
                            <>
                              <DropdownMenuSeparator />
                              <DropdownMenuItem
                                onClick={() => {
                                  setSelectedRequest(request);
                                  setIsRecallDialogOpen(true);
                                }}
                                className="text-orange-600"
                              >
                                <Undo2 className="mr-2 h-4 w-4" />
                                Recall Approval
                              </DropdownMenuItem>
                            </>
                          )}
                          {canCancel(request) && (
                            <>
                              <DropdownMenuSeparator />
                              <DropdownMenuItem
                                onClick={() => handleCancel(request)}
                                className="text-orange-600"
                              >
                                <XCircle className="mr-2 h-4 w-4" />
                                Cancel Request
                              </DropdownMenuItem>
                            </>
                          )}
                          {canDelete(request) && (
                            <>
                              <DropdownMenuSeparator />
                              <DropdownMenuItem
                                onClick={() => handleDelete(request)}
                                className="text-red-600"
                              >
                                <Trash2 className="mr-2 h-4 w-4" />
                                Delete
                              </DropdownMenuItem>
                            </>
                          )}
                        </DropdownMenuContent>
                      </DropdownMenu>
                    </div>
                  </div>
                ))}
              </div>

              {/* Desktop Table View */}
              <div className="hidden md:block rounded-md border">
                <Table>
                  <TableHeader>
                    <TableRow>
                      <TableHead>Ministry</TableHead>
                      <TableHead>Amount</TableHead>
                      <TableHead>Status</TableHead>
                      <TableHead>Date</TableHead>
                      <TableHead className="w-[80px]">View</TableHead>
                      <TableHead className="w-[50px]"></TableHead>
                    </TableRow>
                  </TableHeader>
                  <TableBody>
                    {filteredRequests.map((request) => (
                      <TableRow key={request.id}>
                        <TableCell className="font-medium">
                          {request.ministry?.name || "-"}
                        </TableCell>
                        <TableCell className="font-medium">
                          $
                          {Number(request.requested_amount).toLocaleString(
                            "en-US",
                            {
                              minimumFractionDigits: 2,
                              maximumFractionDigits: 2,
                            }
                          )}
                          {request.approved_amount &&
                            request.approved_amount !==
                              request.requested_amount && (
                              <span className="block text-xs text-green-600">
                                Approved: $
                                {Number(request.approved_amount).toLocaleString(
                                  "en-US",
                                  {
                                    minimumFractionDigits: 2,
                                    maximumFractionDigits: 2,
                                  }
                                )}
                              </span>
                            )}
                        </TableCell>
                        <TableCell>
                          <div className="flex flex-wrap items-center gap-1.5">
                            <AllocationRequestStatusBadge status={request.status} />
                            {request.carried_over_from && <CarriedOverBadge />}
                          </div>
                        </TableCell>
                        <TableCell className="text-muted-foreground">
                          {format(new Date(request.created_at), "MMM d, yyyy")}
                        </TableCell>
                        <TableCell>
                          <Button
                            variant="ghost"
                            size="icon"
                            onClick={() => {
                              setSelectedRequest(request);
                              setIsDetailDialogOpen(true);
                            }}
                            title="View Details"
                          >
                            <Eye className="h-4 w-4" />
                          </Button>
                        </TableCell>
                        <TableCell>
                          <DropdownMenu>
                            <DropdownMenuTrigger asChild>
                              <Button variant="ghost" size="icon">
                                <MoreHorizontal className="h-4 w-4" />
                              </Button>
                            </DropdownMenuTrigger>
                            <DropdownMenuContent align="end">
                              <DropdownMenuItem
                                onClick={() => {
                                  setSelectedRequest(request);
                                  setIsDetailDialogOpen(true);
                                }}
                              >
                                <Eye className="mr-2 h-4 w-4" />
                                View Details
                              </DropdownMenuItem>

                              {canEdit(request) && (
                                <DropdownMenuItem
                                  onClick={() => {
                                    setSelectedRequest(request);
                                    setIsEditDialogOpen(true);
                                  }}
                                >
                                  <Edit className="mr-2 h-4 w-4" />
                                  Edit
                                </DropdownMenuItem>
                              )}

                              {canSubmit(request) && (
                                <DropdownMenuItem
                                  onClick={() => handleSubmit(request)}
                                >
                                  <Send className="mr-2 h-4 w-4" />
                                  Submit for Review
                                </DropdownMenuItem>
                              )}

                              {decisionItems(request)}

                              {canRecallApproval(request) && (
                                <>
                                  <DropdownMenuSeparator />
                                  <DropdownMenuItem
                                    onClick={() => {
                                      setSelectedRequest(request);
                                      setIsRecallDialogOpen(true);
                                    }}
                                    className="text-orange-600"
                                  >
                                    <Undo2 className="mr-2 h-4 w-4" />
                                    Recall Approval
                                  </DropdownMenuItem>
                                </>
                              )}

                              {canCancel(request) && (
                                <>
                                  <DropdownMenuSeparator />
                                  <DropdownMenuItem
                                    onClick={() => handleCancel(request)}
                                    className="text-orange-600"
                                  >
                                    <XCircle className="mr-2 h-4 w-4" />
                                    Cancel Request
                                  </DropdownMenuItem>
                                </>
                              )}

                              {canDelete(request) && (
                                <>
                                  <DropdownMenuSeparator />
                                  <DropdownMenuItem
                                    onClick={() => handleDelete(request)}
                                    className="text-red-600"
                                  >
                                    <Trash2 className="mr-2 h-4 w-4" />
                                    Delete
                                  </DropdownMenuItem>
                                </>
                              )}
                            </DropdownMenuContent>
                          </DropdownMenu>
                        </TableCell>
                      </TableRow>
                    ))}
                  </TableBody>
                </Table>
              </div>
            </>
          )}
        </CardContent>
      </Card>

      {/* Detail Dialog */}
      <AllocationRequestDetailDialog
        open={isDetailDialogOpen}
        onOpenChange={setIsDetailDialogOpen}
        request={selectedRequest}
        userRole={userRole}
        onApprove={() => selectedRequest && openReview(selectedRequest, "approve")}
        onDeny={() => selectedRequest && openReview(selectedRequest, "deny")}
        onConditionalApprove={() => selectedRequest && openReview(selectedRequest, "conditional")}
        onReturn={() => selectedRequest && openReview(selectedRequest, "return")}
        onSendToBoard={() => selectedRequest && handleSendToBoard(selectedRequest)}
        onEdit={
          selectedRequest && canEdit(selectedRequest)
            ? () => setIsEditDialogOpen(true)
            : undefined
        }
        onRecallApproval={() => {
          setIsRecallDialogOpen(true);
        }}
      />

      {/* Edit Dialog */}
      {selectedRequest && (
        <AllocationRequestForm
          open={isEditDialogOpen}
          onOpenChange={setIsEditDialogOpen}
          request={selectedRequest}
          onSuccess={onRefresh}
        />
      )}

      {/* Review Dialog (Admin) */}
      {selectedRequest && (
        <AllocationReviewDialog
          open={isReviewDialogOpen}
          onOpenChange={setIsReviewDialogOpen}
          request={selectedRequest}
          action={reviewAction}
          onSuccess={onRefresh}
        />
      )}

      {/* Recall Approval Dialog */}
      {selectedRequest && (
        <RecallAllocationDialog
          open={isRecallDialogOpen}
          onOpenChange={setIsRecallDialogOpen}
          request={selectedRequest}
          onSuccess={onRefresh}
        />
      )}
    </>
  );
}
