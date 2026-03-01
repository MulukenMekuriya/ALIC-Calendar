/**
 * ResolveMinistryFlagDialog - Dialog for resolving a ministry flag
 */

import { useState } from "react";
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from "@/shared/components/ui/dialog";
import { Button } from "@/shared/components/ui/button";
import { Label } from "@/shared/components/ui/label";
import { Textarea } from "@/shared/components/ui/textarea";
import { CheckCircle, Loader2 } from "lucide-react";
import { format, parseISO } from "date-fns";
import { useToast } from "@/shared/hooks/use-toast";
import { useAuth } from "@/shared/contexts/AuthContext";
import { useUserProfile } from "@/hooks/useUserProfile";
import { useResolveMinistryFlag } from "../hooks";
import { MinistryFlagBadge } from "./MinistryFlagBadge";
import type { MinistryFlagWithRelations } from "../types";

interface ResolveMinistryFlagDialogProps {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  flag: MinistryFlagWithRelations;
  onSuccess?: () => void;
}

export function ResolveMinistryFlagDialog({
  open,
  onOpenChange,
  flag,
  onSuccess,
}: ResolveMinistryFlagDialogProps) {
  const [resolutionNotes, setResolutionNotes] = useState("");
  const [isSubmitting, setIsSubmitting] = useState(false);
  const { toast } = useToast();
  const { user } = useAuth();
  const { profile } = useUserProfile();
  const resolveFlag = useResolveMinistryFlag();

  const handleResolve = async () => {
    if (!user || !profile || !resolutionNotes.trim()) return;

    setIsSubmitting(true);
    try {
      await resolveFlag.mutateAsync({
        flagId: flag.id,
        resolvedBy: user.id,
        resolvedByName: profile.full_name,
        resolutionNotes: resolutionNotes.trim(),
      });

      toast({
        title: "Flag Resolved",
        description: `Flag on ${flag.ministry?.name || "ministry"} has been resolved.`,
      });

      setResolutionNotes("");
      onOpenChange(false);
      onSuccess?.();
    } catch (error) {
      toast({
        title: "Error",
        description: "Failed to resolve flag. Please try again.",
        variant: "destructive",
      });
    } finally {
      setIsSubmitting(false);
    }
  };

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="sm:max-w-md">
        <DialogHeader>
          <DialogTitle className="flex items-center gap-2">
            <CheckCircle className="h-5 w-5 text-green-500" />
            Resolve Flag
          </DialogTitle>
          <DialogDescription>
            Resolve the flag on <strong>{flag.ministry?.name}</strong>.
          </DialogDescription>
        </DialogHeader>

        <div className="space-y-4">
          {/* Flag Details */}
          <div className="space-y-3 p-3 bg-muted/50 rounded-lg text-sm">
            <div className="flex items-center justify-between">
              <span className="text-muted-foreground">Type</span>
              <MinistryFlagBadge flagType={flag.flag_type} />
            </div>
            <div className="flex items-center justify-between">
              <span className="text-muted-foreground">Created</span>
              <span>{format(parseISO(flag.created_at), "MMM d, yyyy")}</span>
            </div>
            <div className="flex items-center justify-between">
              <span className="text-muted-foreground">Created By</span>
              <span>{flag.created_by_name}</span>
            </div>
            {flag.notes && (
              <div>
                <span className="text-muted-foreground">Notes</span>
                <p className="mt-1 text-foreground">{flag.notes}</p>
              </div>
            )}
            {flag.expense_request && (
              <div className="flex items-center justify-between">
                <span className="text-muted-foreground">Linked Expense</span>
                <span className="text-right max-w-[200px] truncate">
                  {flag.expense_request.title} ($
                  {flag.expense_request.amount.toLocaleString()})
                </span>
              </div>
            )}
          </div>

          {/* Resolution Notes */}
          <div className="space-y-2">
            <Label>
              Resolution Notes <span className="text-red-500">*</span>
            </Label>
            <Textarea
              value={resolutionNotes}
              onChange={(e) => setResolutionNotes(e.target.value)}
              placeholder="Describe how this flag was resolved (e.g., receipts received, funds returned)..."
              rows={3}
            />
          </div>
        </div>

        <DialogFooter className="gap-2 sm:gap-0">
          <Button
            variant="outline"
            onClick={() => onOpenChange(false)}
            disabled={isSubmitting}
          >
            Cancel
          </Button>
          <Button
            onClick={handleResolve}
            disabled={isSubmitting || !resolutionNotes.trim()}
            className="bg-green-600 hover:bg-green-700"
          >
            {isSubmitting ? (
              <>
                <Loader2 className="mr-2 h-4 w-4 animate-spin" />
                Resolving...
              </>
            ) : (
              <>
                <CheckCircle className="mr-2 h-4 w-4" />
                Resolve Flag
              </>
            )}
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}
