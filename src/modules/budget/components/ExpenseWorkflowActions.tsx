/**
 * ExpenseWorkflowActions - Action dialogs for expense approval workflow
 */

import { useState } from "react";
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogHeader,
  DialogTitle,
  DialogFooter,
} from "@/shared/components/ui/dialog";
import { Button } from "@/shared/components/ui/button";
import { Textarea } from "@/shared/components/ui/textarea";
import { Input } from "@/shared/components/ui/input";
import { Label } from "@/shared/components/ui/label";
import { Loader2, CheckCircle, XCircle, CreditCard } from "lucide-react";
import { useToast } from "@/shared/hooks/use-toast";
import { useAuth } from "@/shared/contexts/AuthContext";
import { useUserProfile } from "@/hooks/useUserProfile";
import {
  useLeaderApproveExpense,
  useLeaderDenyExpense,
  useTreasuryApproveExpense,
  useTreasuryDenyExpense,
  useFinanceProcessExpense,
  useCancelExpense,
} from "../hooks";
import type { ExpenseRequestWithRelations } from "../types";
import { REIMBURSEMENT_TYPE_LABELS } from "../types";
import { ExpenseStatusBadge } from "./ExpenseStatusBadge";
import {
  notifyExpenseLeaderApproved,
  notifyExpenseLeaderDenied,
  notifyExpenseTreasuryApproved,
  notifyExpenseTreasuryDenied,
  notifyExpenseCompleted,
} from "../services/notificationService";

interface BaseActionDialogProps {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  expense: ExpenseRequestWithRelations;
  onSuccess?: () => void;
}

// Helper to build notification context from expense
const getExpenseNotificationContext = (expense: ExpenseRequestWithRelations) => ({
  expenseTitle: expense.title,
  expenseAmount: expense.amount,
  ministryName: expense.ministry?.name || "Unknown Ministry",
  requesterName: expense.requester_name,
  requesterEmail: expense.requester_email || "",
});

/**
 * Leader Approve Dialog
 */
export function LeaderApproveDialog({
  open,
  onOpenChange,
  expense,
  onSuccess,
}: BaseActionDialogProps) {
  const { toast } = useToast();
  const { user } = useAuth();
  const { profile } = useUserProfile();
  const [notes, setNotes] = useState("");
  const [isSubmitting, setIsSubmitting] = useState(false);

  const leaderApprove = useLeaderApproveExpense();

  const handleApprove = async () => {
    if (!user || !profile) return;

    setIsSubmitting(true);
    try {
      await leaderApprove.mutateAsync({
        expenseId: expense.id,
        reviewerId: user.id,
        reviewerName: profile.full_name,
        notes: notes || undefined,
      });

      // Send email notification to requester (fire and forget)
      if (expense.requester_email) {
        notifyExpenseLeaderApproved(
          getExpenseNotificationContext(expense),
          profile.full_name,
          notes || undefined
        ).catch(console.error);
      }

      toast({
        title: "Expense Approved",
        description: "The expense request has been approved and forwarded to treasury.",
      });

      onOpenChange(false);
      onSuccess?.();
    } catch (error) {
      toast({
        title: "Error",
        description: error instanceof Error ? error.message : "Failed to approve expense",
        variant: "destructive",
      });
    } finally {
      setIsSubmitting(false);
    }
  };

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent>
        <DialogHeader>
          <DialogTitle className="flex items-center gap-2">
            <CheckCircle className="h-5 w-5 text-green-500" />
            Approve Expense Request
          </DialogTitle>
          <DialogDescription>
            You are about to approve this expense request. It will be forwarded to the
            treasury unit for payment approval.
          </DialogDescription>
        </DialogHeader>

        <div className="space-y-4 py-4">
          <div className="bg-muted/50 rounded-lg p-4 space-y-2">
            <div className="flex justify-between">
              <span className="text-sm text-muted-foreground">Request</span>
              <span className="text-sm font-medium">{expense.title}</span>
            </div>
            <div className="flex justify-between">
              <span className="text-sm text-muted-foreground">Amount</span>
              <span className="text-sm font-medium">
                ${Number(expense.amount).toFixed(2)}
              </span>
            </div>
            <div className="flex justify-between">
              <span className="text-sm text-muted-foreground">Ministry</span>
              <span className="text-sm font-medium">{expense.ministry?.name}</span>
            </div>
            <div className="flex justify-between">
              <span className="text-sm text-muted-foreground">Requester</span>
              <span className="text-sm font-medium">{expense.requester_name}</span>
            </div>
          </div>

          <div className="space-y-2">
            <Label htmlFor="notes">Notes (optional)</Label>
            <Textarea
              id="notes"
              placeholder="Add any notes for the treasury..."
              value={notes}
              onChange={(e) => setNotes(e.target.value)}
              rows={3}
            />
          </div>
        </div>

        <DialogFooter>
          <Button variant="outline" onClick={() => onOpenChange(false)} disabled={isSubmitting}>
            Cancel
          </Button>
          <Button onClick={handleApprove} disabled={isSubmitting} className="bg-green-600 hover:bg-green-700">
            {isSubmitting ? (
              <Loader2 className="mr-2 h-4 w-4 animate-spin" />
            ) : (
              <CheckCircle className="mr-2 h-4 w-4" />
            )}
            Approve
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}

/**
 * Leader Deny Dialog
 */
export function LeaderDenyDialog({
  open,
  onOpenChange,
  expense,
  onSuccess,
}: BaseActionDialogProps) {
  const { toast } = useToast();
  const { user } = useAuth();
  const { profile } = useUserProfile();
  const [reason, setReason] = useState("");
  const [isSubmitting, setIsSubmitting] = useState(false);

  const leaderDeny = useLeaderDenyExpense();

  const handleDeny = async () => {
    if (!user || !profile) return;
    if (!reason.trim()) {
      toast({
        title: "Reason Required",
        description: "Please provide a reason for denying this request.",
        variant: "destructive",
      });
      return;
    }

    setIsSubmitting(true);
    try {
      await leaderDeny.mutateAsync({
        expenseId: expense.id,
        reviewerId: user.id,
        reviewerName: profile.full_name,
        notes: reason,
      });

      // Send email notification to requester (fire and forget)
      if (expense.requester_email) {
        notifyExpenseLeaderDenied(
          getExpenseNotificationContext(expense),
          profile.full_name,
          reason
        ).catch(console.error);
      }

      toast({
        title: "Expense Denied",
        description: "The expense request has been denied.",
      });

      onOpenChange(false);
      onSuccess?.();
    } catch (error) {
      toast({
        title: "Error",
        description: error instanceof Error ? error.message : "Failed to deny expense",
        variant: "destructive",
      });
    } finally {
      setIsSubmitting(false);
    }
  };

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent>
        <DialogHeader>
          <DialogTitle className="flex items-center gap-2">
            <XCircle className="h-5 w-5 text-red-500" />
            Deny Expense Request
          </DialogTitle>
          <DialogDescription>
            Please provide a reason for denying this expense request. The requester
            will be notified.
          </DialogDescription>
        </DialogHeader>

        <div className="space-y-4 py-4">
          <div className="bg-muted/50 rounded-lg p-4 space-y-2">
            <div className="flex justify-between">
              <span className="text-sm text-muted-foreground">Request</span>
              <span className="text-sm font-medium">{expense.title}</span>
            </div>
            <div className="flex justify-between">
              <span className="text-sm text-muted-foreground">Amount</span>
              <span className="text-sm font-medium">
                ${Number(expense.amount).toFixed(2)}
              </span>
            </div>
          </div>

          <div className="space-y-2">
            <Label htmlFor="reason">Reason for Denial *</Label>
            <Textarea
              id="reason"
              placeholder="Explain why this request is being denied..."
              value={reason}
              onChange={(e) => setReason(e.target.value)}
              rows={3}
              required
            />
          </div>
        </div>

        <DialogFooter>
          <Button variant="outline" onClick={() => onOpenChange(false)} disabled={isSubmitting}>
            Cancel
          </Button>
          <Button
            onClick={handleDeny}
            disabled={isSubmitting || !reason.trim()}
            variant="destructive"
          >
            {isSubmitting ? (
              <Loader2 className="mr-2 h-4 w-4 animate-spin" />
            ) : (
              <XCircle className="mr-2 h-4 w-4" />
            )}
            Deny Request
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}

/**
 * Treasury Approve Dialog
 */
export function TreasuryApproveDialog({
  open,
  onOpenChange,
  expense,
  onSuccess,
}: BaseActionDialogProps) {
  const { toast } = useToast();
  const { user } = useAuth();
  const { profile } = useUserProfile();
  const [notes, setNotes] = useState("");
  const [isSubmitting, setIsSubmitting] = useState(false);

  const treasuryApprove = useTreasuryApproveExpense();

  const handleApprove = async () => {
    if (!user || !profile) return;

    setIsSubmitting(true);
    try {
      await treasuryApprove.mutateAsync({
        expenseId: expense.id,
        reviewerId: user.id,
        reviewerName: profile.full_name,
        notes: notes || undefined,
      });

      // Send email notification to requester (fire and forget)
      if (expense.requester_email) {
        notifyExpenseTreasuryApproved(
          getExpenseNotificationContext(expense),
          profile.full_name,
          notes || undefined
        ).catch(console.error);
      }

      toast({
        title: "Payment Approved",
        description: "The payment has been approved and sent to finance for processing.",
      });

      onOpenChange(false);
      onSuccess?.();
    } catch (error) {
      toast({
        title: "Error",
        description: error instanceof Error ? error.message : "Failed to approve payment",
        variant: "destructive",
      });
    } finally {
      setIsSubmitting(false);
    }
  };

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent>
        <DialogHeader>
          <DialogTitle className="flex items-center gap-2">
            <CheckCircle className="h-5 w-5 text-green-500" />
            Approve Payment
          </DialogTitle>
          <DialogDescription>
            Confirm that funds are available and approve this payment. It will be sent
            to finance for processing.
          </DialogDescription>
        </DialogHeader>

        <div className="space-y-4 py-4">
          <div className="bg-muted/50 rounded-lg p-4 space-y-2">
            <div className="flex justify-between">
              <span className="text-sm text-muted-foreground">Request</span>
              <span className="text-sm font-medium">{expense.title}</span>
            </div>
            <div className="flex justify-between">
              <span className="text-sm text-muted-foreground">Amount</span>
              <span className="text-sm font-medium text-lg">
                ${Number(expense.amount).toFixed(2)}
              </span>
            </div>
            <div className="flex justify-between">
              <span className="text-sm text-muted-foreground">Ministry</span>
              <span className="text-sm font-medium">{expense.ministry?.name}</span>
            </div>
            <div className="flex justify-between">
              <span className="text-sm text-muted-foreground">Leader Approval</span>
              <ExpenseStatusBadge status="leader_approved" size="sm" />
            </div>
          </div>

          <div className="space-y-2">
            <Label htmlFor="notes">Notes (optional)</Label>
            <Textarea
              id="notes"
              placeholder="Add any notes for the finance team..."
              value={notes}
              onChange={(e) => setNotes(e.target.value)}
              rows={3}
            />
          </div>
        </div>

        <DialogFooter>
          <Button variant="outline" onClick={() => onOpenChange(false)} disabled={isSubmitting}>
            Cancel
          </Button>
          <Button onClick={handleApprove} disabled={isSubmitting} className="bg-green-600 hover:bg-green-700">
            {isSubmitting ? (
              <Loader2 className="mr-2 h-4 w-4 animate-spin" />
            ) : (
              <CheckCircle className="mr-2 h-4 w-4" />
            )}
            Approve Payment
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}

/**
 * Treasury Deny Dialog
 */
export function TreasuryDenyDialog({
  open,
  onOpenChange,
  expense,
  onSuccess,
}: BaseActionDialogProps) {
  const { toast } = useToast();
  const { user } = useAuth();
  const { profile } = useUserProfile();
  const [reason, setReason] = useState("");
  const [isSubmitting, setIsSubmitting] = useState(false);

  const treasuryDeny = useTreasuryDenyExpense();

  const handleDeny = async () => {
    if (!user || !profile) return;
    if (!reason.trim()) {
      toast({
        title: "Reason Required",
        description: "Please provide a reason for denying this payment.",
        variant: "destructive",
      });
      return;
    }

    setIsSubmitting(true);
    try {
      await treasuryDeny.mutateAsync({
        expenseId: expense.id,
        reviewerId: user.id,
        reviewerName: profile.full_name,
        notes: reason,
      });

      // Send email notification to requester (fire and forget)
      if (expense.requester_email) {
        notifyExpenseTreasuryDenied(
          getExpenseNotificationContext(expense),
          profile.full_name,
          reason
        ).catch(console.error);
      }

      toast({
        title: "Payment Denied",
        description: "The payment has been denied.",
      });

      onOpenChange(false);
      onSuccess?.();
    } catch (error) {
      toast({
        title: "Error",
        description: error instanceof Error ? error.message : "Failed to deny payment",
        variant: "destructive",
      });
    } finally {
      setIsSubmitting(false);
    }
  };

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent>
        <DialogHeader>
          <DialogTitle className="flex items-center gap-2">
            <XCircle className="h-5 w-5 text-red-500" />
            Deny Payment
          </DialogTitle>
          <DialogDescription>
            Please provide a reason for denying this payment request.
          </DialogDescription>
        </DialogHeader>

        <div className="space-y-4 py-4">
          <div className="bg-muted/50 rounded-lg p-4 space-y-2">
            <div className="flex justify-between">
              <span className="text-sm text-muted-foreground">Request</span>
              <span className="text-sm font-medium">{expense.title}</span>
            </div>
            <div className="flex justify-between">
              <span className="text-sm text-muted-foreground">Amount</span>
              <span className="text-sm font-medium">
                ${Number(expense.amount).toFixed(2)}
              </span>
            </div>
          </div>

          <div className="space-y-2">
            <Label htmlFor="reason">Reason for Denial *</Label>
            <Textarea
              id="reason"
              placeholder="Explain why this payment is being denied..."
              value={reason}
              onChange={(e) => setReason(e.target.value)}
              rows={3}
              required
            />
          </div>
        </div>

        <DialogFooter>
          <Button variant="outline" onClick={() => onOpenChange(false)} disabled={isSubmitting}>
            Cancel
          </Button>
          <Button
            onClick={handleDeny}
            disabled={isSubmitting || !reason.trim()}
            variant="destructive"
          >
            {isSubmitting ? (
              <Loader2 className="mr-2 h-4 w-4 animate-spin" />
            ) : (
              <XCircle className="mr-2 h-4 w-4" />
            )}
            Deny Payment
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}

/**
 * Finance Process Payment Dialog
 */
export function FinanceProcessDialog({
  open,
  onOpenChange,
  expense,
  onSuccess,
}: BaseActionDialogProps) {
  const { toast } = useToast();
  const { user } = useAuth();
  const { profile } = useUserProfile();
  const [paymentReference, setPaymentReference] = useState("");
  const [notes, setNotes] = useState("");
  const [isSubmitting, setIsSubmitting] = useState(false);

  const financeProcess = useFinanceProcessExpense();

  const handleProcess = async () => {
    if (!user || !profile) return;
    if (!paymentReference.trim()) {
      toast({
        title: "Reference Required",
        description: "Please enter a payment reference (check number, transaction ID, etc.).",
        variant: "destructive",
      });
      return;
    }

    setIsSubmitting(true);
    try {
      await financeProcess.mutateAsync({
        expenseId: expense.id,
        processorId: user.id,
        processorName: profile.full_name,
        paymentReference: paymentReference,
        notes: notes || undefined,
      });

      // Send email notification to requester (fire and forget)
      if (expense.requester_email) {
        notifyExpenseCompleted(
          getExpenseNotificationContext(expense),
          paymentReference,
          notes || undefined
        ).catch(console.error);
      }

      toast({
        title: "Payment Processed",
        description: "The payment has been completed successfully.",
      });

      onOpenChange(false);
      onSuccess?.();
    } catch (error) {
      toast({
        title: "Error",
        description: error instanceof Error ? error.message : "Failed to process payment",
        variant: "destructive",
      });
    } finally {
      setIsSubmitting(false);
    }
  };

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent>
        <DialogHeader>
          <DialogTitle className="flex items-center gap-2">
            <CreditCard className="h-5 w-5 text-purple-500" />
            Process Payment
          </DialogTitle>
          <DialogDescription>
            Complete this payment and enter the payment reference for record-keeping.
          </DialogDescription>
        </DialogHeader>

        <div className="space-y-4 py-4">
          <div className="bg-muted/50 rounded-lg p-4 space-y-2">
            <div className="flex justify-between">
              <span className="text-sm text-muted-foreground">Request</span>
              <span className="text-sm font-medium">{expense.title}</span>
            </div>
            <div className="flex justify-between">
              <span className="text-sm text-muted-foreground">Amount</span>
              <span className="text-lg font-bold text-green-600">
                ${Number(expense.amount).toFixed(2)}
              </span>
            </div>
            <div className="flex justify-between">
              <span className="text-sm text-muted-foreground">Requester</span>
              <span className="text-sm font-medium">{expense.requester_name}</span>
            </div>
            <div className="flex justify-between">
              <span className="text-sm text-muted-foreground">Reimbursement Type</span>
              <span className="text-sm font-medium">
                {expense.reimbursement_type ? REIMBURSEMENT_TYPE_LABELS[expense.reimbursement_type] : "-"}
              </span>
            </div>
            {expense.tin && (
              <div className="flex justify-between">
                <span className="text-sm text-muted-foreground">TIN</span>
                <span className="text-sm font-medium">{expense.tin}</span>
              </div>
            )}
            {expense.is_advance_payment && (
              <div className="flex justify-between">
                <span className="text-sm text-muted-foreground">Payment Type</span>
                <span className="text-sm font-medium text-amber-600">Advance Payment</span>
              </div>
            )}
          </div>

          {/* Payment Recipient Section */}
          {expense.is_different_recipient && expense.recipient_name && (
            <div className="bg-emerald-50 border border-emerald-200 rounded-lg p-4 space-y-2">
              <p className="text-xs font-medium text-emerald-700 uppercase tracking-wide">
                Payment Recipient (Different from Requester)
              </p>
              <div className="flex justify-between">
                <span className="text-sm text-muted-foreground">Name</span>
                <span className="text-sm font-medium">{expense.recipient_name}</span>
              </div>
              {expense.recipient_phone && (
                <div className="flex justify-between">
                  <span className="text-sm text-muted-foreground">Phone</span>
                  <span className="text-sm font-medium">{expense.recipient_phone}</span>
                </div>
              )}
              {expense.recipient_email && (
                <div className="flex justify-between">
                  <span className="text-sm text-muted-foreground">Email</span>
                  <span className="text-sm font-medium">{expense.recipient_email}</span>
                </div>
              )}
            </div>
          )}

          <div className="space-y-2">
            <Label htmlFor="reference">Payment Reference *</Label>
            <Input
              id="reference"
              placeholder="Check #, Transaction ID, Zelle confirmation..."
              value={paymentReference}
              onChange={(e) => setPaymentReference(e.target.value)}
              required
            />
          </div>

          <div className="space-y-2">
            <Label htmlFor="notes">Notes (optional)</Label>
            <Textarea
              id="notes"
              placeholder="Any additional notes about this payment..."
              value={notes}
              onChange={(e) => setNotes(e.target.value)}
              rows={2}
            />
          </div>
        </div>

        <DialogFooter>
          <Button variant="outline" onClick={() => onOpenChange(false)} disabled={isSubmitting}>
            Cancel
          </Button>
          <Button
            onClick={handleProcess}
            disabled={isSubmitting || !paymentReference.trim()}
            className="bg-purple-600 hover:bg-purple-700"
          >
            {isSubmitting ? (
              <Loader2 className="mr-2 h-4 w-4 animate-spin" />
            ) : (
              <CreditCard className="mr-2 h-4 w-4" />
            )}
            Complete Payment
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}

/**
 * Cancel Expense Dialog
 */
export function CancelExpenseDialog({
  open,
  onOpenChange,
  expense,
  onSuccess,
}: BaseActionDialogProps) {
  const { toast } = useToast();
  const { user } = useAuth();
  const { profile } = useUserProfile();
  const [isSubmitting, setIsSubmitting] = useState(false);

  const cancelExpense = useCancelExpense();

  const handleCancel = async () => {
    if (!user || !profile) return;

    setIsSubmitting(true);
    try {
      await cancelExpense.mutateAsync({
        expenseId: expense.id,
        actorId: user.id,
        actorName: profile.full_name,
        reason: "Cancelled by requester",
      });

      toast({
        title: "Expense Cancelled",
        description: "The expense request has been cancelled.",
      });

      onOpenChange(false);
      onSuccess?.();
    } catch (error) {
      toast({
        title: "Error",
        description: error instanceof Error ? error.message : "Failed to cancel expense",
        variant: "destructive",
      });
    } finally {
      setIsSubmitting(false);
    }
  };

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent>
        <DialogHeader>
          <DialogTitle className="flex items-center gap-2">
            <XCircle className="h-5 w-5 text-orange-500" />
            Cancel Expense Request
          </DialogTitle>
          <DialogDescription>
            Are you sure you want to cancel this expense request? This action cannot be undone.
          </DialogDescription>
        </DialogHeader>

        <div className="space-y-4 py-4">
          <div className="bg-muted/50 rounded-lg p-4 space-y-2">
            <div className="flex justify-between">
              <span className="text-sm text-muted-foreground">Request</span>
              <span className="text-sm font-medium">{expense.title}</span>
            </div>
            <div className="flex justify-between">
              <span className="text-sm text-muted-foreground">Amount</span>
              <span className="text-sm font-medium">
                ${Number(expense.amount).toFixed(2)}
              </span>
            </div>
            <div className="flex justify-between">
              <span className="text-sm text-muted-foreground">Status</span>
              <ExpenseStatusBadge status={expense.status} size="sm" />
            </div>
          </div>
        </div>

        <DialogFooter>
          <Button variant="outline" onClick={() => onOpenChange(false)} disabled={isSubmitting}>
            Keep Request
          </Button>
          <Button
            onClick={handleCancel}
            disabled={isSubmitting}
            className="bg-orange-600 hover:bg-orange-700"
          >
            {isSubmitting ? (
              <Loader2 className="mr-2 h-4 w-4 animate-spin" />
            ) : (
              <XCircle className="mr-2 h-4 w-4" />
            )}
            Cancel Request
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}
