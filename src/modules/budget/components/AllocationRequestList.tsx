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
} from "lucide-react";
import { format } from "date-fns";
import { AllocationRequestStatusBadge } from "./AllocationRequestStatusBadge";
import { AllocationRequestForm } from "./AllocationRequestForm";
import { AllocationRequestDetailDialog } from "./AllocationRequestDetailDialog";
import { AllocationReviewDialog } from "./AllocationReviewDialog";
import { useToast } from "@/shared/hooks/use-toast";
import { useAuth } from "@/shared/contexts/AuthContext";
import { useSearch } from "@/shared/contexts/SearchContext";
import { useUserProfile } from "@/hooks/useUserProfile";
import {
  useDeleteAllocationRequest,
  useSubmitAllocationRequest,
  useCancelAllocationRequest,
} from "../hooks";
import type {
  AllocationRequestWithRelations,
  AllocationRequestStatus,
} from "../types";
import { ALLOCATION_REQUEST_STATUS_CONFIG, getPeriodLabel } from "../types";

interface AllocationRequestListProps {
  requests: AllocationRequestWithRelations[];
  isLoading?: boolean;
  userRole?: "admin" | "treasury" | "finance" | "requester";
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

  // State for dialogs
  const [selectedRequest, setSelectedRequest] =
    useState<AllocationRequestWithRelations | null>(null);
  const [isDetailDialogOpen, setIsDetailDialogOpen] = useState(false);
  const [isEditDialogOpen, setIsEditDialogOpen] = useState(false);
  const [isReviewDialogOpen, setIsReviewDialogOpen] = useState(false);
  const [reviewAction, setReviewAction] = useState<"approve" | "deny">(
    "approve"
  );

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
          error instanceof Error ? error.message : "Failed to delete request",
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
          error instanceof Error ? error.message : "Failed to submit request",
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
          error instanceof Error ? error.message : "Failed to cancel request",
        variant: "destructive",
      });
    }
  };

  const isReviewer =
    userRole === "admin" || userRole === "treasury" || userRole === "finance";

  const canEdit = (request: AllocationRequestWithRelations) =>
    request.status === "draft" &&
    (request.requester_id === user?.id || isReviewer);

  const canDelete = (request: AllocationRequestWithRelations) =>
    request.status === "draft" &&
    (request.requester_id === user?.id || isReviewer);

  const canSubmit = (request: AllocationRequestWithRelations) =>
    request.status === "draft" && request.requester_id === user?.id;

  const canCancel = (request: AllocationRequestWithRelations) =>
    request.status === "pending" &&
    (request.requester_id === user?.id || isReviewer);

  const canReview = (request: AllocationRequestWithRelations) =>
    request.status === "pending" && isReviewer;

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
                          {request.justification}
                        </p>
                        <p className="text-xs text-muted-foreground mt-1">
                          {request.ministry?.name || "-"} • {getPeriodLabel(request.period_type)}
                        </p>
                      </div>
                      <AllocationRequestStatusBadge status={request.status} />
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
                          {canReview(request) && (
                            <>
                              <DropdownMenuSeparator />
                              <DropdownMenuItem
                                onClick={() => {
                                  setSelectedRequest(request);
                                  setReviewAction("approve");
                                  setIsReviewDialogOpen(true);
                                }}
                                className="text-green-600"
                              >
                                <CheckCircle className="mr-2 h-4 w-4" />
                                Approve
                              </DropdownMenuItem>
                              <DropdownMenuItem
                                onClick={() => {
                                  setSelectedRequest(request);
                                  setReviewAction("deny");
                                  setIsReviewDialogOpen(true);
                                }}
                                className="text-red-600"
                              >
                                <XCircle className="mr-2 h-4 w-4" />
                                Deny
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
                      <TableHead>Justification</TableHead>
                      <TableHead>Ministry</TableHead>
                      <TableHead>Period</TableHead>
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
                        <TableCell
                          className="font-medium max-w-[200px] truncate"
                          title={request.justification}
                        >
                          {request.justification}
                        </TableCell>
                        <TableCell>{request.ministry?.name || "-"}</TableCell>
                        <TableCell>
                          {getPeriodLabel(request.period_type)}
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
                          <AllocationRequestStatusBadge status={request.status} />
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

                              {canReview(request) && (
                                <>
                                  <DropdownMenuSeparator />
                                  <DropdownMenuItem
                                    onClick={() => {
                                      setSelectedRequest(request);
                                      setReviewAction("approve");
                                      setIsReviewDialogOpen(true);
                                    }}
                                    className="text-green-600"
                                  >
                                    <CheckCircle className="mr-2 h-4 w-4" />
                                    Approve
                                  </DropdownMenuItem>
                                  <DropdownMenuItem
                                    onClick={() => {
                                      setSelectedRequest(request);
                                      setReviewAction("deny");
                                      setIsReviewDialogOpen(true);
                                    }}
                                    className="text-red-600"
                                  >
                                    <XCircle className="mr-2 h-4 w-4" />
                                    Deny
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
        onApprove={() => {
          setReviewAction("approve");
          setIsReviewDialogOpen(true);
        }}
        onDeny={() => {
          setReviewAction("deny");
          setIsReviewDialogOpen(true);
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
    </>
  );
}
