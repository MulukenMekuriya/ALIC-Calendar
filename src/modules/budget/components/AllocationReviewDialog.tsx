/**
 * AllocationReviewDialog - every decision on a budget request.
 *
 *   conditional  the Leadership Council's conditional approval
 *   approve      the Board's final approval (credits the ministry's budget)
 *   return       the Board sends it back to the Council
 *   deny         either, at their own step
 *
 * Each goes through a database function (20260322440700) that refuses a
 * request no longer at the step it was opened on.
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
  Undo2,
  ShieldCheck,
} from "lucide-react";
import { useToast } from "@/shared/hooks/use-toast";
import { useAuth } from "@/shared/contexts/AuthContext";
import { useUserProfile } from "@/hooks/useUserProfile";
import {
  useBoardDecision,
  useCouncilDecision,
  useRecallAllocationApproval,
} from "../hooks";
import { errorMessage } from "@/shared/lib/errorMessage";
import type { AllocationRequestWithRelations } from "../types";
import { getPeriodLabel } from "../types";

const approveFormSchema = z.object({
  approved_amount: z.coerce.number().positive("Amount must be greater than 0"),
  admin_notes: z.string().optional(),
});

const notesFormSchema = z.object({
  admin_notes: z.string(),
});

type ApproveFormValues = z.infer<typeof approveFormSchema>;
type NotesFormValues = z.infer<typeof notesFormSchema>;

export type ReviewAction = "conditional" | "approve" | "return" | "deny";

/** What each notes-only action is called, and whether it needs a reason. */
const NOTES_ACTIONS: Record<
  Exclude<ReviewAction, "approve">,
  { title: string; description: string; label: string; placeholder: string; required: boolean; button: string; done: string }
> = {
  conditional: {
    title: "Conditionally Approve",
    description:
      "Approve this request at the Leadership Council level. Nothing is credited yet: it goes to the Board for final approval.",
    label: "Notes (Optional)",
    placeholder: "Anything the Board or the ministry should know...",
    required: false,
    button: "Conditionally Approve",
    done: "Conditionally approved. Send it to the Board when the Council is done.",
  },
  return: {
    title: "Return to the Leadership Council",
    description: "Send this request back to the Leadership Council to look at again.",
    label: "What should the Council look at? *",
    placeholder: "Explain what the Board wants reconsidered...",
    required: true,
    button: "Return to Council",
    done: "Returned to the Leadership Council.",
  },
  deny: {
    title: "Deny Budget Request",
    description: "Deny this budget request. Please provide a reason.",
    label: "Reason for Denial *",
    placeholder: "Explain why this request is being denied...",
    required: true,
    button: "Deny Request",
    done: "The budget request has been denied.",
  },
};

interface AllocationReviewDialogProps {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  request: AllocationRequestWithRelations | null;
  action: ReviewAction;
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

  const councilDecision = useCouncilDecision();
  const boardDecision = useBoardDecision();

  const approveForm = useForm<ApproveFormValues>({
    resolver: zodResolver(approveFormSchema),
    defaultValues: {
      approved_amount: request?.requested_amount || 0,
      admin_notes: "",
    },
  });

  const denyForm = useForm<NotesFormValues>({
    resolver: zodResolver(notesFormSchema),
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
      await boardDecision.mutateAsync({
        requestId: request.id,
        decision: "approve",
        approvedAmount: values.approved_amount,
        notes: values.admin_notes,
      });

      toast({
        title: "Final approval given",
        description:
          values.approved_amount === request.requested_amount
            ? "The budget request has final approval in full."
            : `The budget request has final approval for $${values.approved_amount.toFixed(2)}.`,
      });

      onOpenChange(false);
      onSuccess?.();
    } catch (error) {
      toast({
        title: "Error",
        description: errorMessage(error, "Failed to approve request"),
        variant: "destructive",
      });
    } finally {
      setIsSubmitting(false);
    }
  };

  // conditional / return / deny: a decision and some words.
  const handleNotes = async (values: NotesFormValues) => {
    if (!request || !user || !profile || action === "approve") return;

    const words = NOTES_ACTIONS[action];
    const notes = values.admin_notes.trim();
    if (words.required && notes.length < 10) {
      denyForm.setError("admin_notes", {
        message: "Please give a reason (at least 10 characters)",
      });
      return;
    }

    setIsSubmitting(true);
    try {
      // The Board decides at its own step; everything before it is the
      // Council's.
      if (action === "return" || (action === "deny" && request.status === "board_review")) {
        await boardDecision.mutateAsync({
          requestId: request.id,
          decision: action,
          notes,
        });
      } else {
        await councilDecision.mutateAsync({
          requestId: request.id,
          decision: action === "conditional" ? "conditional" : "deny",
          notes: notes || null,
        });
      }

      toast({ title: words.title, description: words.done });

      onOpenChange(false);
      onSuccess?.();
    } catch (error) {
      toast({
        title: "Error",
        description: errorMessage(error),
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
                Final Approval
              </>
            ) : action === "conditional" ? (
              <>
                <ShieldCheck className="h-5 w-5 text-teal-600" />
                {NOTES_ACTIONS.conditional.title}
              </>
            ) : action === "return" ? (
              <>
                <Undo2 className="h-5 w-5 text-orange-600" />
                {NOTES_ACTIONS.return.title}
              </>
            ) : (
              <>
                <XCircle className="h-5 w-5 text-red-600" />
                {NOTES_ACTIONS.deny.title}
              </>
            )}
          </DialogTitle>
          <DialogDescription>
            {action === "approve"
              ? "The Board's final approval. The approved amount is added to the ministry's budget for the year. You can adjust it if needed."
              : NOTES_ACTIONS[action].description}
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
                  Give Final Approval
                </Button>
              </DialogFooter>
            </form>
          </Form>
        ) : (
          <Form {...denyForm}>
            <form
              onSubmit={denyForm.handleSubmit(handleNotes)}
              className="space-y-4"
            >
              <FormField
                control={denyForm.control}
                name="admin_notes"
                render={({ field }) => (
                  <FormItem>
                    <FormLabel>{NOTES_ACTIONS[action].label}</FormLabel>
                    <FormControl>
                      <Textarea
                        placeholder={NOTES_ACTIONS[action].placeholder}
                        className="resize-none"
                        rows={4}
                        {...field}
                      />
                    </FormControl>
                    <FormDescription>
                      {action === "return"
                        ? "The Leadership Council sees this."
                        : "This will be shared with the requester."}
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
                  variant={action === "deny" ? "destructive" : "default"}
                  className={action === "conditional" ? "bg-teal-600 hover:bg-teal-700" : undefined}
                >
                  {isSubmitting ? (
                    <Loader2 className="mr-2 h-4 w-4 animate-spin" />
                  ) : action === "deny" ? (
                    <XCircle className="mr-2 h-4 w-4" />
                  ) : action === "return" ? (
                    <Undo2 className="mr-2 h-4 w-4" />
                  ) : (
                    <ShieldCheck className="mr-2 h-4 w-4" />
                  )}
                  {NOTES_ACTIONS[action].button}
                </Button>
              </DialogFooter>
            </form>
          </Form>
        )}
      </DialogContent>
    </Dialog>
  );
}

/**
 * RecallAllocationDialog - Admin dialog to recall an approved allocation request
 */
interface RecallAllocationDialogProps {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  request: AllocationRequestWithRelations | null;
  onSuccess?: () => void;
}

export function RecallAllocationDialog({
  open,
  onOpenChange,
  request,
  onSuccess,
}: RecallAllocationDialogProps) {
  const { toast } = useToast();
  const { user } = useAuth();
  const { profile } = useUserProfile();
  const [notes, setNotes] = useState("");
  const [isSubmitting, setIsSubmitting] = useState(false);

  const recallApproval = useRecallAllocationApproval();

  if (!request) return null;

  const handleRecall = async () => {
    if (!user || !profile) return;
    if (!notes.trim()) {
      toast({
        title: "Reason Required",
        description: "Please provide a reason for recalling the approval.",
        variant: "destructive",
      });
      return;
    }

    setIsSubmitting(true);
    try {
      await recallApproval.mutateAsync({
        requestId: request.id,
        adminNotes: notes,
        actorId: user.id,
        actorName: profile.full_name,
      });

      toast({
        title: "Approval Recalled",
        description: "The budget request has been reverted to pending review.",
      });

      onOpenChange(false);
      setNotes("");
      onSuccess?.();
    } catch (error) {
      toast({
        title: "Error",
        description: error instanceof Error ? error.message : "Failed to recall approval",
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
            <Undo2 className="h-5 w-5 text-orange-500" />
            Recall Approval
          </DialogTitle>
          <DialogDescription>
            Recall your approval and revert this budget request back to pending review.
            The approved budget allocation will be reversed.
          </DialogDescription>
        </DialogHeader>

        <div className="space-y-4 py-4">
          <div className="bg-muted/50 rounded-lg p-4 space-y-2">
            <div className="flex justify-between">
              <span className="text-sm text-muted-foreground">Ministry</span>
              <span className="text-sm font-medium">{request.ministry?.name}</span>
            </div>
            <div className="flex justify-between">
              <span className="text-sm text-muted-foreground">Period</span>
              <span className="text-sm font-medium">{getPeriodLabel(request.period_type)}</span>
            </div>
            <div className="flex justify-between">
              <span className="text-sm text-muted-foreground">Requested</span>
              <span className="text-sm font-medium">
                ${Number(request.requested_amount).toLocaleString("en-US", { minimumFractionDigits: 2 })}
              </span>
            </div>
            {request.approved_amount && (
              <div className="flex justify-between">
                <span className="text-sm text-muted-foreground">Approved</span>
                <span className="text-sm font-medium text-green-600">
                  ${Number(request.approved_amount).toLocaleString("en-US", { minimumFractionDigits: 2 })}
                </span>
              </div>
            )}
          </div>

          <div className="space-y-2">
            <label htmlFor="recall-allocation-notes" className="text-sm font-medium">
              Reason for Recall *
            </label>
            <Textarea
              id="recall-allocation-notes"
              placeholder="Explain why you are recalling this approval..."
              value={notes}
              onChange={(e) => setNotes(e.target.value)}
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
            onClick={handleRecall}
            disabled={isSubmitting || !notes.trim()}
            className="bg-orange-600 hover:bg-orange-700"
          >
            {isSubmitting ? (
              <Loader2 className="mr-2 h-4 w-4 animate-spin" />
            ) : (
              <Undo2 className="mr-2 h-4 w-4" />
            )}
            Recall Approval
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}
