/**
 * ExpenseDetailDialog - View expense request details including attachments
 */

import { useState, useEffect } from "react";
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogHeader,
  DialogTitle,
} from "@/shared/components/ui/dialog";
import { Button } from "@/shared/components/ui/button";
import { Separator } from "@/shared/components/ui/separator";
import { Card, CardContent } from "@/shared/components/ui/card";
import { Badge } from "@/shared/components/ui/badge";
import {
  DollarSign,
  Calendar,
  User,
  Building2,
  CreditCard,
  FileText,
  Image as ImageIcon,
  Paperclip,
  ExternalLink,
  Download,
  Loader2,
  AlertCircle,
  Clock,
  Receipt,
  CheckCircle,
  XCircle,
} from "lucide-react";
import { format } from "date-fns";
import { supabase } from "@/integrations/supabase/client";
import { ExpenseStatusBadge } from "./ExpenseStatusBadge";
import type { ExpenseRequestWithRelations, AttachmentData } from "../types";
import { REIMBURSEMENT_TYPE_LABELS } from "../types";

interface ExpenseDetailDialogProps {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  expense: ExpenseRequestWithRelations | null;
  userRole?: "requester" | "leader" | "treasury" | "finance" | "admin";
  onLeaderApprove?: () => void;
  onLeaderDeny?: () => void;
  onTreasuryApprove?: () => void;
  onTreasuryDeny?: () => void;
  onFinanceProcess?: () => void;
}

interface AttachmentWithSignedUrl extends AttachmentData {
  signedUrl?: string;
  urlError?: boolean;
}

export function ExpenseDetailDialog({
  open,
  onOpenChange,
  expense,
  userRole = "requester",
  onLeaderApprove,
  onLeaderDeny,
  onTreasuryApprove,
  onTreasuryDeny,
  onFinanceProcess,
}: ExpenseDetailDialogProps) {
  const [attachmentsWithUrls, setAttachmentsWithUrls] = useState<
    AttachmentWithSignedUrl[]
  >([]);
  const [loadingUrls, setLoadingUrls] = useState(false);

  // Generate signed URLs when dialog opens
  useEffect(() => {
    if (!open || !expense) {
      setAttachmentsWithUrls([]);
      return;
    }

    const rawAttachments = (expense.attachments as AttachmentData[]) || [];
    if (rawAttachments.length === 0) {
      setAttachmentsWithUrls([]);
      return;
    }

    const generateSignedUrls = async () => {
      setLoadingUrls(true);
      const updatedAttachments: AttachmentWithSignedUrl[] = [];

      for (const attachment of rawAttachments) {
        try {
          // Extract the file path - handle both old (full URL) and new (path only) formats
          let filePath = attachment.url || attachment.id;

          // If it's a full Supabase URL, extract just the path
          if (filePath.includes("supabase.co/storage")) {
            // Extract path after /expense-attachments/
            const match = filePath.match(/expense-attachments\/(.+)$/);
            if (match) {
              filePath = match[1];
            }
          }

          const { data, error } = await supabase.storage
            .from("expense-attachments")
            .createSignedUrl(filePath, 3600); // 1 hour expiry

          if (error) {
            console.error("Error creating signed URL:", error);
            updatedAttachments.push({ ...attachment, urlError: true });
          } else {
            updatedAttachments.push({
              ...attachment,
              signedUrl: data.signedUrl,
            });
          }
        } catch (error) {
          console.error("Error generating signed URL:", error);
          updatedAttachments.push({ ...attachment, urlError: true });
        }
      }

      setAttachmentsWithUrls(updatedAttachments);
      setLoadingUrls(false);
    };

    generateSignedUrls();
  }, [open, expense]);

  if (!expense) return null;

  // Format file size
  const formatFileSize = (bytes: number) => {
    if (bytes < 1024) return `${bytes} B`;
    if (bytes < 1024 * 1024) return `${(bytes / 1024).toFixed(1)} KB`;
    return `${(bytes / (1024 * 1024)).toFixed(1)} MB`;
  };

  // Check if file is an image
  const isImageFile = (type: string) => type.startsWith("image/");

  const rawAttachments = (expense.attachments as AttachmentData[]) || [];

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="sm:max-w-[700px] max-h-[90vh] overflow-y-auto">
        <DialogHeader>
          <DialogTitle className="flex items-center gap-2 text-xl">
            <Receipt className="h-6 w-6 text-primary" />
            Expense Details
          </DialogTitle>
          <DialogDescription>
            View the complete details of this expense request.
          </DialogDescription>
        </DialogHeader>

        <div className="space-y-6">
          {/* Status and Amount Header - Enhanced */}
          <Card className="border-2 bg-gradient-to-br from-primary/5 to-primary/10">
            <CardContent className="pt-6">
              <div className="flex items-start justify-between">
                <div className="space-y-2">
                  <ExpenseStatusBadge status={expense.status} />
                  <div className="flex items-center gap-2 text-sm text-muted-foreground">
                    <CreditCard className="h-4 w-4" />
                    {REIMBURSEMENT_TYPE_LABELS[expense.reimbursement_type]}
                  </div>
                </div>
                <div className="text-right">
                  <p className="text-sm text-muted-foreground mb-1">
                    Expense Amount
                  </p>
                  <p className="text-3xl font-bold text-primary">
                    $
                    {Number(expense.amount).toLocaleString("en-US", {
                      minimumFractionDigits: 2,
                      maximumFractionDigits: 2,
                    })}
                  </p>
                </div>
              </div>
            </CardContent>
          </Card>

          {/* Title and Description - Enhanced */}
          <Card>
            <CardContent className="pt-6">
              <div className="flex items-start gap-3">
                <div className="p-2 bg-primary/10 rounded-lg">
                  <FileText className="h-5 w-5 text-primary" />
                </div>
                <div className="flex-1">
                  <h3 className="font-semibold text-lg mb-2">
                    {expense.title}
                  </h3>
                  {expense.description && (
                    <p className="text-muted-foreground leading-relaxed">
                      {expense.description}
                    </p>
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
                      {expense.ministry?.name || "-"}
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
                      {expense.fiscal_year?.name || "-"}
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
                      {expense.requester_name}
                    </p>
                    {expense.requester_email && (
                      <p className="text-xs text-muted-foreground mt-0.5">
                        {expense.requester_email}
                      </p>
                    )}
                  </div>
                </div>

                <div className="flex items-start gap-3">
                  <div className="p-2 bg-primary/10 rounded-lg">
                    <CreditCard className="h-5 w-5 text-primary" />
                  </div>
                  <div>
                    <p className="text-xs font-medium text-muted-foreground uppercase tracking-wide">
                      Reimbursement Type
                    </p>
                    <p className="font-semibold text-foreground mt-1">
                      {expense.reimbursement_type ? REIMBURSEMENT_TYPE_LABELS[expense.reimbursement_type] : "-"}
                    </p>
                  </div>
                </div>

                {expense.tin && (
                  <div className="flex items-start gap-3">
                    <div className="p-2 bg-primary/10 rounded-lg">
                      <FileText className="h-5 w-5 text-primary" />
                    </div>
                    <div>
                      <p className="text-xs font-medium text-muted-foreground uppercase tracking-wide">
                        TIN
                      </p>
                      <p className="font-semibold text-foreground mt-1">
                        {expense.tin}
                      </p>
                    </div>
                  </div>
                )}

                {expense.is_advance_payment && (
                  <div className="flex items-start gap-3">
                    <div className="p-2 bg-amber-100 rounded-lg">
                      <FileText className="h-5 w-5 text-amber-600" />
                    </div>
                    <div>
                      <p className="text-xs font-medium text-muted-foreground uppercase tracking-wide">
                        Payment Type
                      </p>
                      <p className="font-semibold text-amber-600 mt-1">
                        Advance Payment
                      </p>
                    </div>
                  </div>
                )}

                <div className="flex items-start gap-3">
                  <div className="p-2 bg-primary/10 rounded-lg">
                    <Clock className="h-5 w-5 text-primary" />
                  </div>
                  <div>
                    <p className="text-xs font-medium text-muted-foreground uppercase tracking-wide">
                      Submitted
                    </p>
                    <p className="font-semibold text-foreground mt-1">
                      {format(new Date(expense.created_at), "MMM d, yyyy")}
                    </p>
                    <p className="text-xs text-muted-foreground">
                      {format(new Date(expense.created_at), "h:mm a")}
                    </p>
                  </div>
                </div>

                {expense.payment_reference && (
                  <div className="flex items-start gap-3">
                    <div className="p-2 bg-primary/10 rounded-lg">
                      <Receipt className="h-5 w-5 text-primary" />
                    </div>
                    <div>
                      <p className="text-xs font-medium text-muted-foreground uppercase tracking-wide">
                        Payment Reference
                      </p>
                      <p className="font-semibold text-foreground mt-1">
                        {expense.payment_reference}
                      </p>
                    </div>
                  </div>
                )}
              </div>

              {/* Payment Recipient Section */}
              {expense.is_different_recipient && expense.recipient_name && (
                <div className="mt-6 pt-6 border-t border-dashed">
                  <h4 className="text-xs font-medium text-muted-foreground uppercase tracking-wide mb-4 flex items-center gap-2">
                    <User className="h-4 w-4" />
                    Payment Recipient (Different from Requester)
                  </h4>
                  <div className="grid grid-cols-1 sm:grid-cols-3 gap-4">
                    <div>
                      <p className="text-xs text-muted-foreground">Name</p>
                      <p className="font-semibold text-foreground mt-0.5">
                        {expense.recipient_name}
                      </p>
                    </div>
                    {expense.recipient_phone && (
                      <div>
                        <p className="text-xs text-muted-foreground">Phone</p>
                        <p className="font-semibold text-foreground mt-0.5">
                          {expense.recipient_phone}
                        </p>
                      </div>
                    )}
                    {expense.recipient_email && (
                      <div>
                        <p className="text-xs text-muted-foreground">Email</p>
                        <p className="font-semibold text-foreground mt-0.5">
                          {expense.recipient_email}
                        </p>
                      </div>
                    )}
                  </div>
                </div>
              )}
            </CardContent>
          </Card>

          {/* Workflow Notes - Enhanced */}
          {(expense.leader_notes ||
            expense.treasury_notes ||
            expense.finance_notes) && (
            <>
              <Separator />
              <div className="space-y-3">
                <h4 className="font-semibold flex items-center gap-2">
                  <FileText className="h-5 w-5 text-primary" />
                  Workflow Notes
                </h4>

                <div className="space-y-3">
                  {expense.leader_notes && (
                    <Card className="border-blue-200 bg-blue-50/50">
                      <CardContent className="pt-4">
                        <div className="flex items-center gap-2 mb-2">
                          <Badge
                            variant="outline"
                            className="bg-blue-100 text-blue-700 border-blue-300"
                          >
                            Leader Review
                          </Badge>
                        </div>
                        <p className="text-foreground leading-relaxed">
                          {expense.leader_notes}
                        </p>
                      </CardContent>
                    </Card>
                  )}

                  {expense.treasury_notes && (
                    <Card className="border-purple-200 bg-purple-50/50">
                      <CardContent className="pt-4">
                        <div className="flex items-center gap-2 mb-2">
                          <Badge
                            variant="outline"
                            className="bg-purple-100 text-purple-700 border-purple-300"
                          >
                            Treasury Review
                          </Badge>
                        </div>
                        <p className="text-foreground leading-relaxed">
                          {expense.treasury_notes}
                        </p>
                      </CardContent>
                    </Card>
                  )}

                  {expense.finance_notes && (
                    <Card className="border-green-200 bg-green-50/50">
                      <CardContent className="pt-4">
                        <div className="flex items-center gap-2 mb-2">
                          <Badge
                            variant="outline"
                            className="bg-green-100 text-green-700 border-green-300"
                          >
                            Finance Processing
                          </Badge>
                        </div>
                        <p className="text-foreground leading-relaxed">
                          {expense.finance_notes}
                        </p>
                      </CardContent>
                    </Card>
                  )}
                </div>
              </div>
            </>
          )}

          {/* Attachments - Enhanced */}
          {rawAttachments.length > 0 && (
            <>
              <Separator />
              <div className="space-y-4">
                <div className="flex items-center justify-between">
                  <h4 className="font-semibold flex items-center gap-2">
                    <Paperclip className="h-5 w-5 text-primary" />
                    Attachments
                  </h4>
                  <Badge variant="secondary" className="font-semibold">
                    {rawAttachments.length}{" "}
                    {rawAttachments.length === 1 ? "file" : "files"}
                  </Badge>
                </div>

                {loadingUrls ? (
                  <Card>
                    <CardContent className="pt-6">
                      <div className="flex items-center justify-center py-8">
                        <Loader2 className="h-6 w-6 animate-spin text-primary" />
                        <span className="ml-3 text-sm text-muted-foreground">
                          Loading attachments...
                        </span>
                      </div>
                    </CardContent>
                  </Card>
                ) : (
                  <div className="space-y-3">
                    {attachmentsWithUrls.map((attachment) => (
                      <Card
                        key={attachment.id}
                        className="hover:shadow-md transition-shadow"
                      >
                        <CardContent className="p-4">
                          <div className="flex items-center justify-between">
                            <div className="flex items-center gap-4 min-w-0 flex-1">
                              <div
                                className={`p-3 rounded-lg flex-shrink-0 ${
                                  isImageFile(attachment.type)
                                    ? "bg-blue-100"
                                    : "bg-orange-100"
                                }`}
                              >
                                {isImageFile(attachment.type) ? (
                                  <ImageIcon className="h-6 w-6 text-blue-600" />
                                ) : (
                                  <FileText className="h-6 w-6 text-orange-600" />
                                )}
                              </div>
                              <div className="min-w-0 flex-1">
                                <p className="text-sm font-semibold truncate text-foreground">
                                  {attachment.name}
                                </p>
                                <div className="flex items-center gap-2 mt-1">
                                  <Badge variant="outline" className="text-xs">
                                    {formatFileSize(attachment.size)}
                                  </Badge>
                                  <span className="text-xs text-muted-foreground">
                                    {format(
                                      new Date(attachment.uploaded_at),
                                      "MMM d, yyyy"
                                    )}
                                  </span>
                                </div>
                              </div>
                            </div>
                            <div className="flex gap-2 flex-shrink-0 ml-4">
                              {attachment.urlError ? (
                                <div className="flex items-center text-red-500 text-xs font-medium">
                                  <AlertCircle className="h-4 w-4 mr-1" />
                                  Error
                                </div>
                              ) : attachment.signedUrl ? (
                                <>
                                  <Button
                                    variant="outline"
                                    size="sm"
                                    onClick={() =>
                                      window.open(
                                        attachment.signedUrl,
                                        "_blank"
                                      )
                                    }
                                    className="h-9 w-9 p-0"
                                  >
                                    <ExternalLink className="h-4 w-4" />
                                  </Button>
                                  <Button
                                    variant="outline"
                                    size="sm"
                                    className="h-9 w-9 p-0"
                                    asChild
                                  >
                                    <a
                                      href={attachment.signedUrl}
                                      download={attachment.name}
                                    >
                                      <Download className="h-4 w-4" />
                                    </a>
                                  </Button>
                                </>
                              ) : (
                                <Loader2 className="h-5 w-5 animate-spin text-muted-foreground" />
                              )}
                            </div>
                          </div>
                        </CardContent>
                      </Card>
                    ))}
                  </div>
                )}
              </div>
            </>
          )}

          {/* Action Buttons based on status and user role */}
          {/* Leader Review Actions */}
          {expense.status === "pending_leader" &&
            (userRole === "leader" || userRole === "admin") && (
              <>
                <Separator />
                <div className="flex gap-3 pt-2">
                  <Button
                    className="flex-1 bg-green-600 hover:bg-green-700"
                    onClick={() => {
                      onOpenChange(false);
                      onLeaderApprove?.();
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
                      onLeaderDeny?.();
                    }}
                  >
                    <XCircle className="mr-2 h-4 w-4" />
                    Deny
                  </Button>
                </div>
              </>
            )}

          {/* Treasury Review Actions */}
          {(expense.status === "leader_approved" ||
            expense.status === "pending_treasury") &&
            (userRole === "treasury" || userRole === "admin") && (
              <>
                <Separator />
                <div className="flex gap-3 pt-2">
                  <Button
                    className="flex-1 bg-green-600 hover:bg-green-700"
                    onClick={() => {
                      onOpenChange(false);
                      onTreasuryApprove?.();
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
                      onTreasuryDeny?.();
                    }}
                  >
                    <XCircle className="mr-2 h-4 w-4" />
                    Deny
                  </Button>
                </div>
              </>
            )}

          {/* Finance Process Actions */}
          {(expense.status === "treasury_approved" ||
            expense.status === "pending_finance") &&
            (userRole === "finance" || userRole === "admin") && (
              <>
                <Separator />
                <div className="flex gap-3 pt-2">
                  <Button
                    className="flex-1 bg-green-600 hover:bg-green-700"
                    onClick={() => {
                      onOpenChange(false);
                      onFinanceProcess?.();
                    }}
                  >
                    <CheckCircle className="mr-2 h-4 w-4" />
                    Process Payment
                  </Button>
                </div>
              </>
            )}
        </div>
      </DialogContent>
    </Dialog>
  );
}
