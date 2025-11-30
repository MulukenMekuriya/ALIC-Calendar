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
import { Input } from "@/shared/components/ui/input";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/shared/components/ui/select";
import { Card, CardContent, CardHeader, CardTitle } from "@/shared/components/ui/card";
import {
  MoreHorizontal,
  Search,
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
import {
  useDeleteAllocationRequest,
  useSubmitAllocationRequest,
  useCancelAllocationRequest,
} from "../hooks";
import type { AllocationRequestWithRelations, AllocationRequestStatus } from "../types";
import { ALLOCATION_REQUEST_STATUS_CONFIG, getPeriodLabel } from "../types";

interface AllocationRequestListProps {
  requests: AllocationRequestWithRelations[];
  isLoading?: boolean;
  isAdmin?: boolean;
  onRefresh?: () => void;
}

export function AllocationRequestList({
  requests,
  isLoading = false,
  isAdmin = false,
  onRefresh,
}: AllocationRequestListProps) {
  const { toast } = useToast();
  const { user, profile } = useAuth();

  // State for dialogs
  const [selectedRequest, setSelectedRequest] = useState<AllocationRequestWithRelations | null>(null);
  const [isDetailDialogOpen, setIsDetailDialogOpen] = useState(false);
  const [isEditDialogOpen, setIsEditDialogOpen] = useState(false);
  const [isReviewDialogOpen, setIsReviewDialogOpen] = useState(false);
  const [reviewAction, setReviewAction] = useState<"approve" | "deny">("approve");

  // Filters
  const [searchQuery, setSearchQuery] = useState("");
  const [statusFilter, setStatusFilter] = useState<AllocationRequestStatus | "all">("all");

  // Mutations
  const deleteRequest = useDeleteAllocationRequest();
  const submitRequest = useSubmitAllocationRequest();
  const cancelRequest = useCancelAllocationRequest();

  // Filter requests
  const filteredRequests = requests.filter((request) => {
    const matchesSearch =
      request.justification.toLowerCase().includes(searchQuery.toLowerCase()) ||
      request.ministry?.name?.toLowerCase().includes(searchQuery.toLowerCase()) ||
      request.requester_name.toLowerCase().includes(searchQuery.toLowerCase());

    const matchesStatus =
      statusFilter === "all" || request.status === statusFilter;

    return matchesSearch && matchesStatus;
  });

  const handleDelete = async (request: AllocationRequestWithRelations) => {
    if (!confirm("Are you sure you want to delete this allocation request?")) return;

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
        description: error instanceof Error ? error.message : "Failed to delete request",
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
        description: error instanceof Error ? error.message : "Failed to submit request",
        variant: "destructive",
      });
    }
  };

  const handleCancel = async (request: AllocationRequestWithRelations) => {
    if (!user || !profile) return;
    if (!confirm("Are you sure you want to cancel this allocation request?")) return;

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
        description: error instanceof Error ? error.message : "Failed to cancel request",
        variant: "destructive",
      });
    }
  };

  const canEdit = (request: AllocationRequestWithRelations) =>
    request.status === "draft" && (request.requester_id === user?.id || isAdmin);

  const canDelete = (request: AllocationRequestWithRelations) =>
    request.status === "draft" && (request.requester_id === user?.id || isAdmin);

  const canSubmit = (request: AllocationRequestWithRelations) =>
    request.status === "draft" && request.requester_id === user?.id;

  const canCancel = (request: AllocationRequestWithRelations) =>
    request.status === "pending" && (request.requester_id === user?.id || isAdmin);

  const canReview = (request: AllocationRequestWithRelations) =>
    request.status === "pending" && isAdmin;

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
            Allocation Requests
          </CardTitle>
        </CardHeader>
        <CardContent>
          {/* Filters */}
          <div className="flex flex-col md:flex-row gap-4 mb-6">
            <div className="relative flex-1">
              <Search className="absolute left-3 top-1/2 -translate-y-1/2 h-4 w-4 text-muted-foreground" />
              <Input
                placeholder="Search by justification, ministry, or requester..."
                value={searchQuery}
                onChange={(e) => setSearchQuery(e.target.value)}
                className="pl-9"
              />
            </div>
            <Select
              value={statusFilter}
              onValueChange={(value) => setStatusFilter(value as AllocationRequestStatus | "all")}
            >
              <SelectTrigger className="w-full md:w-[200px]">
                <SelectValue placeholder="Filter by status" />
              </SelectTrigger>
              <SelectContent>
                <SelectItem value="all">All Statuses</SelectItem>
                {Object.entries(ALLOCATION_REQUEST_STATUS_CONFIG).map(([status, config]) => (
                  <SelectItem key={status} value={status}>
                    {config.label}
                  </SelectItem>
                ))}
              </SelectContent>
            </Select>
          </div>

          {/* Table */}
          {filteredRequests.length === 0 ? (
            <div className="text-center py-12 text-muted-foreground">
              <Wallet className="h-12 w-12 mx-auto mb-4 opacity-20" />
              <p>No allocation requests found</p>
            </div>
          ) : (
            <div className="rounded-md border">
              <Table>
                <TableHeader>
                  <TableRow>
                    <TableHead>Ministry</TableHead>
                    <TableHead>Period</TableHead>
                    <TableHead>Amount</TableHead>
                    <TableHead>Requester</TableHead>
                    <TableHead>Status</TableHead>
                    <TableHead>Date</TableHead>
                    <TableHead className="w-[50px]"></TableHead>
                  </TableRow>
                </TableHeader>
                <TableBody>
                  {filteredRequests.map((request) => (
                    <TableRow key={request.id}>
                      <TableCell className="font-medium">
                        {request.ministry?.name || "-"}
                      </TableCell>
                      <TableCell>
                        {getPeriodLabel(request.period_type, request.period_number)}
                      </TableCell>
                      <TableCell className="font-medium">
                        ${Number(request.requested_amount).toLocaleString("en-US", {
                          minimumFractionDigits: 2,
                          maximumFractionDigits: 2,
                        })}
                        {request.approved_amount && request.approved_amount !== request.requested_amount && (
                          <span className="block text-xs text-green-600">
                            Approved: ${Number(request.approved_amount).toLocaleString("en-US", {
                              minimumFractionDigits: 2,
                              maximumFractionDigits: 2,
                            })}
                          </span>
                        )}
                      </TableCell>
                      <TableCell>{request.requester_name}</TableCell>
                      <TableCell>
                        <AllocationRequestStatusBadge status={request.status} />
                      </TableCell>
                      <TableCell className="text-muted-foreground">
                        {format(new Date(request.created_at), "MMM d, yyyy")}
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
                      </TableCell>
                    </TableRow>
                  ))}
                </TableBody>
              </Table>
            </div>
          )}
        </CardContent>
      </Card>

      {/* Detail Dialog */}
      <AllocationRequestDetailDialog
        open={isDetailDialogOpen}
        onOpenChange={setIsDetailDialogOpen}
        request={selectedRequest}
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
