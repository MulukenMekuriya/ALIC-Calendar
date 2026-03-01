/**
 * CreateMinistryFlagDialog - Dialog for flagging a ministry
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
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/shared/components/ui/select";
import { AlertTriangle, Loader2, ShieldAlert } from "lucide-react";
import { useToast } from "@/shared/hooks/use-toast";
import { useAuth } from "@/shared/contexts/AuthContext";
import { useUserProfile } from "@/hooks/useUserProfile";
import { useCreateMinistryFlag } from "../hooks";
import type { MinistryFlagType } from "../types";
import { MINISTRY_FLAG_TYPE_CONFIG } from "../types";

interface CreateMinistryFlagDialogProps {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  ministryId: string;
  ministryName: string;
  organizationId: string;
  expenseRequestId?: string | null;
  onSuccess?: () => void;
}

export function CreateMinistryFlagDialog({
  open,
  onOpenChange,
  ministryId,
  ministryName,
  organizationId,
  expenseRequestId,
  onSuccess,
}: CreateMinistryFlagDialogProps) {
  const [flagType, setFlagType] = useState<MinistryFlagType>("missing_receipts");
  const [notes, setNotes] = useState("");
  const [isSubmitting, setIsSubmitting] = useState(false);
  const { toast } = useToast();
  const { user } = useAuth();
  const { profile } = useUserProfile();
  const createFlag = useCreateMinistryFlag();

  const handleSubmit = async () => {
    if (!user || !profile || !notes.trim()) return;

    setIsSubmitting(true);
    try {
      await createFlag.mutateAsync({
        ministry_id: ministryId,
        organization_id: organizationId,
        flag_type: flagType,
        expense_request_id: expenseRequestId || null,
        created_by: user.id,
        created_by_name: profile.full_name,
        notes: notes.trim(),
      });

      toast({
        title: "Ministry Flagged",
        description: `${ministryName} has been flagged for ${MINISTRY_FLAG_TYPE_CONFIG[flagType].label.toLowerCase()}. New expense submissions are now blocked.`,
      });

      setFlagType("missing_receipts");
      setNotes("");
      onOpenChange(false);
      onSuccess?.();
    } catch (error) {
      toast({
        title: "Error",
        description: "Failed to create ministry flag. Please try again.",
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
            <ShieldAlert className="h-5 w-5 text-red-500" />
            Flag Ministry
          </DialogTitle>
          <DialogDescription>
            Flag <strong>{ministryName}</strong> for follow-up action.
          </DialogDescription>
        </DialogHeader>

        <div className="space-y-4">
          {/* Warning Banner */}
          <div className="flex items-start gap-3 p-3 bg-red-50 border border-red-200 rounded-lg">
            <AlertTriangle className="h-5 w-5 text-red-500 mt-0.5 shrink-0" />
            <div className="text-sm text-red-700">
              <p className="font-medium">This will block new expense submissions</p>
              <p className="mt-1 text-red-600">
                Members of this ministry will not be able to submit new expense
                requests until all flags are resolved.
              </p>
            </div>
          </div>

          {/* Flag Type */}
          <div className="space-y-2">
            <Label>Flag Type</Label>
            <Select
              value={flagType}
              onValueChange={(v) => setFlagType(v as MinistryFlagType)}
            >
              <SelectTrigger>
                <SelectValue />
              </SelectTrigger>
              <SelectContent>
                {Object.entries(MINISTRY_FLAG_TYPE_CONFIG).map(
                  ([key, config]) => (
                    <SelectItem key={key} value={key}>
                      {config.label}
                    </SelectItem>
                  )
                )}
              </SelectContent>
            </Select>
            <p className="text-xs text-muted-foreground">
              {MINISTRY_FLAG_TYPE_CONFIG[flagType].description}
            </p>
          </div>

          {/* Notes */}
          <div className="space-y-2">
            <Label>
              Notes <span className="text-red-500">*</span>
            </Label>
            <Textarea
              value={notes}
              onChange={(e) => setNotes(e.target.value)}
              placeholder="Describe the reason for flagging this ministry..."
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
            variant="destructive"
            onClick={handleSubmit}
            disabled={isSubmitting || !notes.trim()}
          >
            {isSubmitting ? (
              <>
                <Loader2 className="mr-2 h-4 w-4 animate-spin" />
                Flagging...
              </>
            ) : (
              <>
                <AlertTriangle className="mr-2 h-4 w-4" />
                Flag Ministry
              </>
            )}
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}
