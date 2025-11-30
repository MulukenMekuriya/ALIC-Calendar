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
import { Button } from "@/shared/components/ui/button";
import { Separator } from "@/shared/components/ui/separator";
import {
  Card,
  CardContent,
  CardHeader,
  CardTitle,
} from "@/shared/components/ui/card";
import { Badge } from "@/shared/components/ui/badge";
import {
  DollarSign,
  Calendar,
  User,
  Building2,
  FileText,
  Clock,
  CheckCircle,
  TrendingUp,
  CalendarDays,
  XCircle,
} from "lucide-react";
import { format } from "date-fns";
import { AllocationRequestStatusBadge } from "./AllocationRequestStatusBadge";
import type {
  AllocationRequestWithRelations,
  BudgetBreakdownItem,
} from "../types";
import { getPeriodLabel, PERIOD_AMOUNT_CATEGORY } from "../types";

interface AllocationRequestDetailDialogProps {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  request: AllocationRequestWithRelations | null;
  userRole?: "admin" | "treasury" | "finance" | "requester";
  onApprove?: () => void;
  onDeny?: () => void;
}

export function AllocationRequestDetailDialog({
  open,
  onOpenChange,
  request,
  userRole = "requester",
  onApprove,
  onDeny,
}: AllocationRequestDetailDialogProps) {
  if (!request) return null;

  // Admin, treasury, and finance can review pending allocation requests
  const canReview =
    request.status === "pending" &&
    (userRole === "admin" || userRole === "treasury" || userRole === "finance");

  const breakdown = (request.budget_breakdown as BudgetBreakdownItem[]) || [];

  // Separate period amounts from other budget items
  const periodAmounts = breakdown.filter(
    (item) => item.category === PERIOD_AMOUNT_CATEGORY
  );
  const otherBreakdown = breakdown.filter(
    (item) => item.category !== PERIOD_AMOUNT_CATEGORY
  );

  // Get period type label
  const periodTypeLabel =
    request.period_type === "annual"
      ? "Annual Budget"
      : request.period_type === "quarterly"
      ? "Quarterly Budget"
      : request.period_type === "monthly"
      ? "Monthly Budget"
      : "Budget";

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="sm:max-w-[700px] max-h-[90vh] overflow-y-auto">
        <DialogHeader>
          <DialogTitle className="flex items-center gap-2 text-xl">
            <DollarSign className="h-6 w-6 text-primary" />
            Allocation Request Details
          </DialogTitle>
          <DialogDescription>
            View the complete details of this allocation request.
          </DialogDescription>
        </DialogHeader>

        <div className="space-y-6">
          {/* Status and Amount Header - Enhanced */}
          <Card className="border-2 bg-gradient-to-br from-primary/5 to-primary/10">
            <CardContent className="pt-6">
              <div className="flex items-start justify-between">
                <div className="space-y-2">
                  <AllocationRequestStatusBadge status={request.status} />
                  <div className="flex items-center gap-2 text-sm text-muted-foreground">
                    <CalendarDays className="h-4 w-4" />
                    {periodTypeLabel}
                  </div>
                </div>
                <div className="text-right">
                  <p className="text-sm text-muted-foreground mb-1">
                    Requested Amount
                  </p>
                  <p className="text-3xl font-bold text-primary">
                    $
                    {Number(request.requested_amount).toLocaleString("en-US", {
                      minimumFractionDigits: 2,
                      maximumFractionDigits: 2,
                    })}
                  </p>
                  {request.approved_amount && (
                    <div className="mt-3 pt-3 border-t">
                      <p className="text-xs text-muted-foreground mb-1">
                        Approved Amount
                      </p>
                      <p className="text-xl font-semibold text-green-600">
                        $
                        {Number(request.approved_amount).toLocaleString(
                          "en-US",
                          {
                            minimumFractionDigits: 2,
                            maximumFractionDigits: 2,
                          }
                        )}
                      </p>
                    </div>
                  )}
                </div>
              </div>
            </CardContent>
          </Card>

          <Separator />

          {/* Details Grid - Enhanced */}
          <Card>
            <CardContent className="pt-6">
              <div className="grid grid-cols-1 sm:grid-cols-2 gap-6">
                <div className="flex items-start gap-3">
                  <div className="p-2 bg-primary/10 rounded-lg">
                    <Building2 className="h-5 w-5 text-primary" />
                  </div>
                  <div>
                    <p className="text-xs font-medium text-muted-foreground uppercase tracking-wide">
                      Ministry
                    </p>
                    <p className="font-semibold text-foreground mt-1">
                      {request.ministry?.name || "-"}
                    </p>
                  </div>
                </div>

                <div className="flex items-start gap-3">
                  <div className="p-2 bg-primary/10 rounded-lg">
                    <Calendar className="h-5 w-5 text-primary" />
                  </div>
                  <div>
                    <p className="text-xs font-medium text-muted-foreground uppercase tracking-wide">
                      Fiscal Year
                    </p>
                    <p className="font-semibold text-foreground mt-1">
                      {request.fiscal_year?.name || "-"}
                    </p>
                  </div>
                </div>

                <div className="flex items-start gap-3">
                  <div className="p-2 bg-primary/10 rounded-lg">
                    <User className="h-5 w-5 text-primary" />
                  </div>
                  <div>
                    <p className="text-xs font-medium text-muted-foreground uppercase tracking-wide">
                      Requester
                    </p>
                    <p className="font-semibold text-foreground mt-1">
                      {request.requester_name}
                    </p>
                  </div>
                </div>

                <div className="flex items-start gap-3">
                  <div className="p-2 bg-primary/10 rounded-lg">
                    <Clock className="h-5 w-5 text-primary" />
                  </div>
                  <div>
                    <p className="text-xs font-medium text-muted-foreground uppercase tracking-wide">
                      Submitted
                    </p>
                    <p className="font-semibold text-foreground mt-1">
                      {format(new Date(request.created_at), "MMM d, yyyy")}
                    </p>
                    <p className="text-xs text-muted-foreground">
                      {format(new Date(request.created_at), "h:mm a")}
                    </p>
                  </div>
                </div>

                {request.reviewed_at && (
                  <div className="flex items-start gap-3 sm:col-span-2">
                    <div className="p-2 bg-green-100 rounded-lg">
                      <CheckCircle className="h-5 w-5 text-green-600" />
                    </div>
                    <div>
                      <p className="text-xs font-medium text-muted-foreground uppercase tracking-wide">
                        Reviewed
                      </p>
                      <p className="font-semibold text-foreground mt-1">
                        {format(
                          new Date(request.reviewed_at),
                          "MMM d, yyyy 'at' h:mm a"
                        )}
                      </p>
                    </div>
                  </div>
                )}
              </div>
            </CardContent>
          </Card>

          <Separator />

          {/* Justification - Enhanced */}
          <div>
            <h4 className="font-semibold flex items-center gap-2 mb-3">
              <FileText className="h-5 w-5 text-primary" />
              Justification
            </h4>
            <Card>
              <CardContent className="pt-4">
                <p className="text-foreground leading-relaxed whitespace-pre-wrap">
                  {request.justification}
                </p>
              </CardContent>
            </Card>
          </div>

          {/* Period Breakdown - Beautiful Timeline View */}
          {periodAmounts.length > 0 && (
            <>
              <Separator />
              <div>
                <h4 className="font-semibold flex items-center gap-2 mb-4">
                  <CalendarDays className="h-5 w-5 text-primary" />
                  {request.period_type === "quarterly"
                    ? "Quarterly Allocation"
                    : "Monthly Allocation"}
                </h4>
                <div className="grid grid-cols-2 sm:grid-cols-3 md:grid-cols-4 gap-3">
                  {periodAmounts.map((item, index) => (
                    <Card
                      key={index}
                      className="hover:shadow-md transition-shadow"
                    >
                      <CardContent className="p-4">
                        <div className="space-y-2">
                          <div className="flex items-center justify-between">
                            <Badge variant="outline" className="text-xs">
                              {item.description}
                            </Badge>
                          </div>
                          <p className="text-lg font-bold text-primary">
                            $
                            {Number(item.amount).toLocaleString("en-US", {
                              minimumFractionDigits: 0,
                              maximumFractionDigits: 0,
                            })}
                          </p>
                        </div>
                      </CardContent>
                    </Card>
                  ))}
                </div>
                <div className="mt-4 p-4 bg-muted/50 rounded-lg">
                  <div className="flex items-center justify-between">
                    <span className="text-sm font-medium text-muted-foreground">
                      Total{" "}
                      {request.period_type === "quarterly"
                        ? "Quarterly"
                        : "Monthly"}{" "}
                      Amount
                    </span>
                    <span className="text-xl font-bold text-primary">
                      $
                      {periodAmounts
                        .reduce((sum, item) => sum + Number(item.amount), 0)
                        .toLocaleString("en-US", {
                          minimumFractionDigits: 2,
                          maximumFractionDigits: 2,
                        })}
                    </span>
                  </div>
                </div>
              </div>
            </>
          )}

          {/* Other Budget Breakdown */}
          {otherBreakdown.length > 0 && (
            <>
              <Separator />
              <div>
                <h4 className="font-semibold flex items-center gap-2 mb-4">
                  <TrendingUp className="h-5 w-5 text-primary" />
                  Budget Breakdown by Category
                </h4>
                <Card>
                  <CardContent className="pt-4">
                    <div className="space-y-3">
                      {otherBreakdown.map((item, index) => (
                        <div
                          key={index}
                          className="flex items-center justify-between py-3 border-b last:border-0"
                        >
                          <div className="flex-1">
                            <p className="font-semibold text-foreground">
                              {item.category}
                            </p>
                            <p className="text-sm text-muted-foreground mt-1">
                              {item.description}
                            </p>
                          </div>
                          <p className="text-lg font-bold text-primary ml-4">
                            $
                            {Number(item.amount).toLocaleString("en-US", {
                              minimumFractionDigits: 2,
                              maximumFractionDigits: 2,
                            })}
                          </p>
                        </div>
                      ))}
                      <div className="flex items-center justify-between pt-3 border-t-2">
                        <span className="font-bold text-foreground">
                          Category Total
                        </span>
                        <span className="text-lg font-bold text-primary">
                          $
                          {otherBreakdown
                            .reduce((sum, item) => sum + Number(item.amount), 0)
                            .toLocaleString("en-US", {
                              minimumFractionDigits: 2,
                              maximumFractionDigits: 2,
                            })}
                        </span>
                      </div>
                    </div>
                  </CardContent>
                </Card>
              </div>
            </>
          )}

          {/* Admin Notes - Enhanced */}
          {request.admin_notes && (
            <>
              <Separator />
              <div>
                <h4 className="font-semibold flex items-center gap-2 mb-3">
                  <FileText className="h-5 w-5 text-amber-600" />
                  Admin Notes
                </h4>
                <Card className="border-amber-200 bg-amber-50/50">
                  <CardContent className="pt-4">
                    <p className="text-foreground leading-relaxed">
                      {request.admin_notes}
                    </p>
                  </CardContent>
                </Card>
              </div>
            </>
          )}

          {/* Action Buttons for Admin Review */}
          {canReview && (
            <>
              <Separator />
              <div className="flex gap-3 pt-2">
                <Button
                  className="flex-1 bg-green-600 hover:bg-green-700"
                  onClick={() => {
                    onOpenChange(false);
                    onApprove?.();
                  }}
                >
                  <CheckCircle className="mr-2 h-4 w-4" />
                  Approve
                </Button>
                <Button
                  variant="destructive"
                  className="flex-1"
                  onClick={() => {
                    onOpenChange(false);
                    onDeny?.();
                  }}
                >
                  <XCircle className="mr-2 h-4 w-4" />
                  Deny
                </Button>
              </div>
            </>
          )}
        </div>
      </DialogContent>
    </Dialog>
  );
}
