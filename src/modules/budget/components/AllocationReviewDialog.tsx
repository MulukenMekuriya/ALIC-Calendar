/**
 * AllocationReviewDialog - Admin dialog to approve/deny allocation requests
 */

import { useState } from "react";
import { useForm } from "react-hook-form";
import { zodResolver } from "@hookform/resolvers/zod";
import { z } from "zod";
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogHeader,
  DialogTitle,
  DialogFooter,
} from "@/shared/components/ui/dialog";
import {
  Form,
  FormControl,
  FormDescription,
  FormField,
  FormItem,
  FormLabel,
  FormMessage,
} from "@/shared/components/ui/form";
import { Input } from "@/shared/components/ui/input";
import { Textarea } from "@/shared/components/ui/textarea";
import { Button } from "@/shared/components/ui/button";
import { Separator } from "@/shared/components/ui/separator";
import {
  Loader2,
  CheckCircle,
  XCircle,
  DollarSign,
  Building2,
  Calendar,
} from "lucide-react";
import { useToast } from "@/shared/hooks/use-toast";
import { useAuth } from "@/shared/contexts/AuthContext";
import { useUserProfile } from "@/hooks/useUserProfile";
import {
  useApproveAllocationRequest,
  useDenyAllocationRequest,
} from "../hooks";
import type { AllocationRequestWithRelations } from "../types";
import { getPeriodLabel } from "../types";

const approveFormSchema = z.object({
  approved_amount: z.coerce.number().positive("Amount must be greater than 0"),
  admin_notes: z.string().optional(),
});

const denyFormSchema = z.object({
  admin_notes: z
    .string()
    .min(10, "Please provide a reason for denial (at least 10 characters)"),
});

type ApproveFormValues = z.infer<typeof approveFormSchema>;
type DenyFormValues = z.infer<typeof denyFormSchema>;

interface AllocationReviewDialogProps {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  request: AllocationRequestWithRelations | null;
  action: "approve" | "deny";
  onSuccess?: () => void;
}

export function AllocationReviewDialog({
  open,
  onOpenChange,
  request,
  action,
  onSuccess,
}: AllocationReviewDialogProps) {
  const { toast } = useToast();
  const { user } = useAuth();
  const { profile } = useUserProfile();
  const [isSubmitting, setIsSubmitting] = useState(false);

  const approveRequest = useApproveAllocationRequest();
  const denyRequest = useDenyAllocationRequest();

  const approveForm = useForm<ApproveFormValues>({
    resolver: zodResolver(approveFormSchema),
    defaultValues: {
      approved_amount: request?.requested_amount || 0,
      admin_notes: "",
    },
  });

  const denyForm = useForm<DenyFormValues>({
    resolver: zodResolver(denyFormSchema),
    defaultValues: {
      admin_notes: "",
    },
  });

  // Reset forms when dialog opens
  useState(() => {
    if (open && request) {
      approveForm.reset({
        approved_amount: request.requested_amount,
        admin_notes: "",
      });
      denyForm.reset({
        admin_notes: "",
      });
    }
  });

  const handleApprove = async (values: ApproveFormValues) => {
    if (!request || !user || !profile) return;

    setIsSubmitting(true);
    try {
      await approveRequest.mutateAsync({
        requestId: request.id,
        approvedAmount: values.approved_amount,
        adminNotes: values.admin_notes,
        actorId: user.id,
        actorName: profile.full_name,
      });

      toast({
        title: "Request approved",
        description:
          values.approved_amount === request.requested_amount
            ? "The allocation request has been approved in full."
            : `The allocation request has been partially approved for $${values.approved_amount.toFixed(
                2
              )}.`,
      });

      onOpenChange(false);
      onSuccess?.();
    } catch (error) {
      toast({
        title: "Error",
        description:
          error instanceof Error ? error.message : "Failed to approve request",
        variant: "destructive",
      });
    } finally {
      setIsSubmitting(false);
    }
  };

  const handleDeny = async (values: DenyFormValues) => {
    if (!request || !user || !profile) return;

    setIsSubmitting(true);
    try {
      await denyRequest.mutateAsync({
        requestId: request.id,
        adminNotes: values.admin_notes,
        actorId: user.id,
        actorName: profile.full_name,
      });

      toast({
        title: "Request denied",
        description: "The allocation request has been denied.",
      });

      onOpenChange(false);
      onSuccess?.();
    } catch (error) {
      toast({
        title: "Error",
        description:
          error instanceof Error ? error.message : "Failed to deny request",
        variant: "destructive",
      });
    } finally {
      setIsSubmitting(false);
    }
  };

  if (!request) return null;

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="sm:max-w-[500px]">
        <DialogHeader>
          <DialogTitle className="flex items-center gap-2">
            {action === "approve" ? (
              <>
                <CheckCircle className="h-5 w-5 text-green-600" />
                Approve Allocation Request
              </>
            ) : (
              <>
                <XCircle className="h-5 w-5 text-red-600" />
                Deny Allocation Request
              </>
            )}
          </DialogTitle>
          <DialogDescription>
            {action === "approve"
              ? "Approve this budget allocation request. You can adjust the approved amount if needed."
              : "Deny this budget allocation request. Please provide a reason."}
          </DialogDescription>
        </DialogHeader>

        {/* Request Summary */}
        <div className="bg-muted p-4 rounded-lg space-y-2">
          <div className="flex items-center gap-2">
            <Building2 className="h-4 w-4 text-muted-foreground" />
            <span className="font-medium">{request.ministry?.name}</span>
          </div>
          <div className="flex items-center gap-2">
            <Calendar className="h-4 w-4 text-muted-foreground" />
            <span>
              {request.fiscal_year?.name} -{" "}
              {getPeriodLabel(request.period_type)}
            </span>
          </div>
          <div className="flex items-center gap-2">
            <DollarSign className="h-4 w-4 text-muted-foreground" />
            <span className="font-bold text-lg">
              $
              {Number(request.requested_amount).toLocaleString("en-US", {
                minimumFractionDigits: 2,
                maximumFractionDigits: 2,
              })}
            </span>
            <span className="text-muted-foreground">requested</span>
          </div>
        </div>

        <Separator />

        {action === "approve" ? (
          <Form {...approveForm}>
            <form
              onSubmit={approveForm.handleSubmit(handleApprove)}
              className="space-y-4"
            >
              <FormField
                control={approveForm.control}
                name="approved_amount"
                render={({ field }) => (
                  <FormItem>
                    <FormLabel>Approved Amount *</FormLabel>
                    <FormControl>
                      <div className="relative">
                        <span className="absolute left-3 top-1/2 -translate-y-1/2 text-muted-foreground">
                          $
                        </span>
                        <Input
                          type="number"
                          step="0.01"
                          min="0"
                          className="pl-7"
                          {...field}
                        />
                      </div>
                    </FormControl>
                    <FormDescription>
                      {field.value === request.requested_amount
                        ? "Full amount will be approved"
                        : field.value < request.requested_amount
                        ? "Partial approval - less than requested"
                        : "More than requested amount"}
                    </FormDescription>
                    <FormMessage />
                  </FormItem>
                )}
              />

              <FormField
                control={approveForm.control}
                name="admin_notes"
                render={({ field }) => (
                  <FormItem>
                    <FormLabel>Notes (Optional)</FormLabel>
                    <FormControl>
                      <Textarea
                        placeholder="Add any notes for the requester..."
                        className="resize-none"
                        rows={3}
                        {...field}
                      />
                    </FormControl>
                    <FormMessage />
                  </FormItem>
                )}
              />

              <DialogFooter>
                <Button
                  type="button"
                  variant="outline"
                  onClick={() => onOpenChange(false)}
                  disabled={isSubmitting}
                >
                  Cancel
                </Button>
                <Button
                  type="submit"
                  disabled={isSubmitting}
                  className="bg-green-600 hover:bg-green-700"
                >
                  {isSubmitting ? (
                    <Loader2 className="mr-2 h-4 w-4 animate-spin" />
                  ) : (
                    <CheckCircle className="mr-2 h-4 w-4" />
                  )}
                  Approve Request
                </Button>
              </DialogFooter>
            </form>
          </Form>
        ) : (
          <Form {...denyForm}>
            <form
              onSubmit={denyForm.handleSubmit(handleDeny)}
              className="space-y-4"
            >
              <FormField
                control={denyForm.control}
                name="admin_notes"
                render={({ field }) => (
                  <FormItem>
                    <FormLabel>Reason for Denial *</FormLabel>
                    <FormControl>
                      <Textarea
                        placeholder="Explain why this request is being denied..."
                        className="resize-none"
                        rows={4}
                        {...field}
                      />
                    </FormControl>
                    <FormDescription>
                      This will be shared with the requester.
                    </FormDescription>
                    <FormMessage />
                  </FormItem>
                )}
              />

              <DialogFooter>
                <Button
                  type="button"
                  variant="outline"
                  onClick={() => onOpenChange(false)}
                  disabled={isSubmitting}
                >
                  Cancel
                </Button>
                <Button
                  type="submit"
                  disabled={isSubmitting}
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
            </form>
          </Form>
        )}
      </DialogContent>
    </Dialog>
  );
}
