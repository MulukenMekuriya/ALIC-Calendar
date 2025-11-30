/**
 * AllocationRequestDetailDialog - View allocation request details
 */

import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogHeader,
  DialogTitle,
} from "@/shared/components/ui/dialog";
import { Separator } from "@/shared/components/ui/separator";
import { Card, CardContent, CardHeader, CardTitle } from "@/shared/components/ui/card";
import {
  DollarSign,
  Calendar,
  User,
  Building2,
  FileText,
  Clock,
  CheckCircle,
} from "lucide-react";
import { format } from "date-fns";
import { AllocationRequestStatusBadge } from "./AllocationRequestStatusBadge";
import type { AllocationRequestWithRelations, BudgetBreakdownItem } from "../types";
import { getPeriodLabel } from "../types";

interface AllocationRequestDetailDialogProps {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  request: AllocationRequestWithRelations | null;
}

export function AllocationRequestDetailDialog({
  open,
  onOpenChange,
  request,
}: AllocationRequestDetailDialogProps) {
  if (!request) return null;

  const breakdown = (request.budget_breakdown as BudgetBreakdownItem[]) || [];

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="sm:max-w-[600px] max-h-[90vh] overflow-y-auto">
        <DialogHeader>
          <DialogTitle className="flex items-center gap-2">
            <DollarSign className="h-5 w-5" />
            Allocation Request Details
          </DialogTitle>
          <DialogDescription>
            View the complete details of this allocation request.
          </DialogDescription>
        </DialogHeader>

        <div className="space-y-6">
          {/* Status and Amount Header */}
          <div className="flex items-center justify-between">
            <AllocationRequestStatusBadge status={request.status} />
            <div className="text-right">
              <p className="text-2xl font-bold text-primary">
                ${Number(request.requested_amount).toLocaleString("en-US", {
                  minimumFractionDigits: 2,
                  maximumFractionDigits: 2,
                })}
              </p>
              <p className="text-sm text-muted-foreground">
                {getPeriodLabel(request.period_type, request.period_number)}
              </p>
              {request.approved_amount && (
                <p className="text-sm text-green-600 font-medium">
                  Approved: ${Number(request.approved_amount).toLocaleString("en-US", {
                    minimumFractionDigits: 2,
                    maximumFractionDigits: 2,
                  })}
                </p>
              )}
            </div>
          </div>

          <Separator />

          {/* Details Grid */}
          <div className="grid grid-cols-2 gap-4">
            <div className="flex items-start gap-3">
              <Building2 className="h-4 w-4 mt-0.5 text-muted-foreground" />
              <div>
                <p className="text-sm text-muted-foreground">Ministry</p>
                <p className="font-medium">{request.ministry?.name || "-"}</p>
              </div>
            </div>

            <div className="flex items-start gap-3">
              <Calendar className="h-4 w-4 mt-0.5 text-muted-foreground" />
              <div>
                <p className="text-sm text-muted-foreground">Fiscal Year</p>
                <p className="font-medium">{request.fiscal_year?.name || "-"}</p>
              </div>
            </div>

            <div className="flex items-start gap-3">
              <User className="h-4 w-4 mt-0.5 text-muted-foreground" />
              <div>
                <p className="text-sm text-muted-foreground">Requester</p>
                <p className="font-medium">{request.requester_name}</p>
              </div>
            </div>

            <div className="flex items-start gap-3">
              <Clock className="h-4 w-4 mt-0.5 text-muted-foreground" />
              <div>
                <p className="text-sm text-muted-foreground">Submitted</p>
                <p className="font-medium">
                  {format(new Date(request.created_at), "MMM d, yyyy 'at' h:mm a")}
                </p>
              </div>
            </div>

            {request.reviewed_at && (
              <div className="flex items-start gap-3">
                <CheckCircle className="h-4 w-4 mt-0.5 text-muted-foreground" />
                <div>
                  <p className="text-sm text-muted-foreground">Reviewed</p>
                  <p className="font-medium">
                    {format(new Date(request.reviewed_at), "MMM d, yyyy 'at' h:mm a")}
                  </p>
                </div>
              </div>
            )}
          </div>

          <Separator />

          {/* Justification */}
          <div>
            <h4 className="font-medium flex items-center gap-2 mb-2">
              <FileText className="h-4 w-4" />
              Justification
            </h4>
            <p className="text-muted-foreground whitespace-pre-wrap">
              {request.justification}
            </p>
          </div>

          {/* Budget Breakdown */}
          {breakdown.length > 0 && (
            <>
              <Separator />
              <div>
                <h4 className="font-medium flex items-center gap-2 mb-3">
                  <DollarSign className="h-4 w-4" />
                  Budget Breakdown
                </h4>
                <Card>
                  <CardContent className="pt-4">
                    <div className="space-y-3">
                      {breakdown.map((item, index) => (
                        <div
                          key={index}
                          className="flex items-center justify-between py-2 border-b last:border-0"
                        >
                          <div>
                            <p className="font-medium">{item.category}</p>
                            <p className="text-sm text-muted-foreground">
                              {item.description}
                            </p>
                          </div>
                          <p className="font-medium">
                            ${Number(item.amount).toLocaleString("en-US", {
                              minimumFractionDigits: 2,
                              maximumFractionDigits: 2,
                            })}
                          </p>
                        </div>
                      ))}
                      <div className="flex items-center justify-between pt-2 font-bold">
                        <p>Total</p>
                        <p>
                          ${breakdown
                            .reduce((sum, item) => sum + Number(item.amount), 0)
                            .toLocaleString("en-US", {
                              minimumFractionDigits: 2,
                              maximumFractionDigits: 2,
                            })}
                        </p>
                      </div>
                    </div>
                  </CardContent>
                </Card>
              </div>
            </>
          )}

          {/* Admin Notes */}
          {request.admin_notes && (
            <>
              <Separator />
              <div>
                <h4 className="font-medium flex items-center gap-2 mb-2">
                  <FileText className="h-4 w-4" />
                  Admin Notes
                </h4>
                <div className="bg-muted p-3 rounded-md">
                  <p className="text-sm">{request.admin_notes}</p>
                </div>
              </div>
            </>
          )}
        </div>
      </DialogContent>
    </Dialog>
  );
}
