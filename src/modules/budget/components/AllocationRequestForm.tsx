/**
 * AllocationRequestForm - Form for ministry leaders to request budget allocations
 */

import { useState, useEffect } from "react";
import { useForm, useFieldArray } from "react-hook-form";
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
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/shared/components/ui/select";
import { Card, CardContent } from "@/shared/components/ui/card";
import {
  Loader2,
  DollarSign,
  Send,
  Save,
  Plus,
  Trash2,
  Calendar,
} from "lucide-react";
import { useToast } from "@/shared/hooks/use-toast";
import { useAuth } from "@/shared/contexts/AuthContext";
import { useOrganization } from "@/shared/contexts/OrganizationContext";
import { useUserProfile } from "@/hooks/useUserProfile";
import {
  useMinistries,
  useActiveFiscalYear,
  useCreateAllocationRequest,
  useUpdateAllocationRequest,
  useSubmitAllocationRequest,
} from "../hooks";
import type {
  AllocationRequest,
  AllocationPeriodType,
  BudgetBreakdownItem,
} from "../types";
import {
  PERIOD_TYPE_LABELS,
  QUARTERLY_PERIODS,
  MONTHLY_PERIODS,
} from "../types";

// Form validation schema
const breakdownItemSchema = z.object({
  category: z.string().min(1, "Category is required"),
  description: z.string().min(1, "Description is required"),
  amount: z.coerce.number().positive("Amount must be greater than 0"),
});

const allocationRequestFormSchema = z.object({
  period_type: z.enum(["annual", "quarterly", "monthly"]),
  period_number: z.coerce.number().nullable().optional(),
  requested_amount: z.coerce.number().positive("Amount must be greater than 0"),
  justification: z.string().min(10, "Please provide a detailed justification (at least 10 characters)"),
  budget_breakdown: z.array(breakdownItemSchema).optional(),
});

type AllocationRequestFormValues = z.infer<typeof allocationRequestFormSchema>;

interface AllocationRequestFormProps {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  request?: AllocationRequest | null;
  onSuccess?: () => void;
}

export function AllocationRequestForm({
  open,
  onOpenChange,
  request,
  onSuccess,
}: AllocationRequestFormProps) {
  const { toast } = useToast();
  const { user } = useAuth();
  const { profile } = useUserProfile();
  const { currentOrganization } = useOrganization();
  const [isSubmitting, setIsSubmitting] = useState(false);

  const { data: ministries, isLoading: ministriesLoading } = useMinistries(
    currentOrganization?.id
  );
  const { data: activeFiscalYear, isLoading: fiscalYearLoading } = useActiveFiscalYear(
    currentOrganization?.id
  );

  const createRequest = useCreateAllocationRequest();
  const updateRequest = useUpdateAllocationRequest();
  const submitForReview = useSubmitAllocationRequest();

  const isEditing = !!request;

  const form = useForm<AllocationRequestFormValues>({
    resolver: zodResolver(allocationRequestFormSchema),
    defaultValues: {
      period_type: "annual",
      period_number: null,
      requested_amount: 0,
      justification: "",
      budget_breakdown: [],
    },
  });

  const { fields, append, remove } = useFieldArray({
    control: form.control,
    name: "budget_breakdown",
  });

  const periodType = form.watch("period_type");

  // Get the user's ministry from their profile
  const userMinistry = ministries?.find(
    (m) => m.name.toLowerCase() === profile?.ministry_name?.toLowerCase()
  );

  // Update form values when request changes (for editing)
  useEffect(() => {
    if (request) {
      form.reset({
        period_type: request.period_type,
        period_number: request.period_number,
        requested_amount: request.requested_amount,
        justification: request.justification,
        budget_breakdown: request.budget_breakdown || [],
      });
    } else {
      form.reset({
        period_type: "annual",
        period_number: null,
        requested_amount: 0,
        justification: "",
        budget_breakdown: [],
      });
    }
  }, [request, form]);

  // Calculate total from breakdown
  const breakdownTotal = fields.reduce((sum, _, index) => {
    const amount = form.watch(`budget_breakdown.${index}.amount`) || 0;
    return sum + Number(amount);
  }, 0);

  const handleSave = async (values: AllocationRequestFormValues, submit: boolean = false) => {
    if (!currentOrganization || !user || !activeFiscalYear) {
      toast({
        title: "Error",
        description: "Missing required data. Please try again.",
        variant: "destructive",
      });
      return;
    }

    if (!userMinistry) {
      toast({
        title: "Error",
        description: "You are not assigned to a ministry. Please contact an administrator.",
        variant: "destructive",
      });
      return;
    }

    // Validate period number for quarterly/monthly
    if (values.period_type === "quarterly" && !values.period_number) {
      toast({
        title: "Error",
        description: "Please select a quarter.",
        variant: "destructive",
      });
      return;
    }
    if (values.period_type === "monthly" && !values.period_number) {
      toast({
        title: "Error",
        description: "Please select a month.",
        variant: "destructive",
      });
      return;
    }

    setIsSubmitting(true);

    try {
      if (isEditing && request) {
        // Update existing request
        await updateRequest.mutateAsync({
          requestId: request.id,
          data: {
            period_type: values.period_type,
            period_number: values.period_type === "annual" ? null : values.period_number,
            requested_amount: values.requested_amount,
            justification: values.justification,
            budget_breakdown: values.budget_breakdown as BudgetBreakdownItem[],
          },
        });

        if (submit) {
          await submitForReview.mutateAsync({
            requestId: request.id,
            actorId: user.id,
            actorName: profile?.full_name || "Unknown",
          });
        }

        toast({
          title: submit ? "Request submitted" : "Request updated",
          description: submit
            ? "Your allocation request has been submitted for review."
            : "Your allocation request has been saved as a draft.",
        });
      } else {
        // Create new request
        const newRequest = await createRequest.mutateAsync({
          requestData: {
            organization_id: currentOrganization.id,
            fiscal_year_id: activeFiscalYear.id,
            ministry_id: userMinistry.id,
            requester_id: user.id,
            requester_name: profile?.full_name || "Unknown",
            period_type: values.period_type,
            period_number: values.period_type === "annual" ? null : values.period_number,
            requested_amount: values.requested_amount,
            justification: values.justification,
            budget_breakdown: values.budget_breakdown as BudgetBreakdownItem[],
            status: "draft",
          },
          actorId: user.id,
          actorName: profile?.full_name || "Unknown",
        });

        if (submit) {
          await submitForReview.mutateAsync({
            requestId: newRequest.id,
            actorId: user.id,
            actorName: profile?.full_name || "Unknown",
          });
        }

        toast({
          title: submit ? "Request submitted" : "Request created",
          description: submit
            ? "Your allocation request has been submitted for review."
            : "Your allocation request has been saved as a draft.",
        });
      }

      onOpenChange(false);
      onSuccess?.();
    } catch (error) {
      toast({
        title: "Error",
        description:
          error instanceof Error ? error.message : "Failed to save allocation request",
        variant: "destructive",
      });
    } finally {
      setIsSubmitting(false);
    }
  };

  const isLoading = ministriesLoading || fiscalYearLoading;

  if (!activeFiscalYear && !fiscalYearLoading) {
    return (
      <Dialog open={open} onOpenChange={onOpenChange}>
        <DialogContent>
          <DialogHeader>
            <DialogTitle>No Active Fiscal Year</DialogTitle>
            <DialogDescription>
              There is no active fiscal year configured. Please contact an administrator
              to set up a fiscal year before requesting budget allocations.
            </DialogDescription>
          </DialogHeader>
          <DialogFooter>
            <Button onClick={() => onOpenChange(false)}>Close</Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    );
  }

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="sm:max-w-[700px] max-h-[90vh] overflow-y-auto">
        <DialogHeader>
          <DialogTitle className="flex items-center gap-2">
            <DollarSign className="h-5 w-5" />
            {isEditing ? "Edit Allocation Request" : "Request Budget Allocation"}
          </DialogTitle>
          <DialogDescription>
            {isEditing
              ? "Update your budget allocation request."
              : "Submit a request for budget allocation for your ministry."}
            <span className="block mt-1 text-xs">
              {activeFiscalYear && <>Fiscal Year: {activeFiscalYear.name}</>}
              {activeFiscalYear && userMinistry && <> • </>}
              {userMinistry && <>Ministry: {userMinistry.name}</>}
            </span>
          </DialogDescription>
        </DialogHeader>

        {isLoading ? (
          <div className="flex items-center justify-center py-8">
            <Loader2 className="h-8 w-8 animate-spin text-muted-foreground" />
          </div>
        ) : !userMinistry ? (
          <div className="py-8 text-center">
            <p className="text-muted-foreground">
              You are not assigned to a ministry. Please contact an administrator to be
              assigned to a ministry before requesting budget allocations.
            </p>
            <Button className="mt-4" onClick={() => onOpenChange(false)}>
              Close
            </Button>
          </div>
        ) : (
          <Form {...form}>
            <form className="space-y-6">
              {/* Period Selection */}
              <div className="grid grid-cols-2 gap-4">
                <FormField
                  control={form.control}
                  name="period_type"
                  render={({ field }) => (
                    <FormItem>
                      <FormLabel>Period Type *</FormLabel>
                      <Select
                        onValueChange={(value) => {
                          field.onChange(value);
                          // Reset period number when type changes
                          form.setValue("period_number", null);
                        }}
                        value={field.value}
                      >
                        <FormControl>
                          <SelectTrigger>
                            <SelectValue placeholder="Select period type" />
                          </SelectTrigger>
                        </FormControl>
                        <SelectContent>
                          {(Object.entries(PERIOD_TYPE_LABELS) as [AllocationPeriodType, string][]).map(
                            ([value, label]) => (
                              <SelectItem key={value} value={value}>
                                {label}
                              </SelectItem>
                            )
                          )}
                        </SelectContent>
                      </Select>
                      <FormDescription>
                        How often do you need this allocation?
                      </FormDescription>
                      <FormMessage />
                    </FormItem>
                  )}
                />

                {periodType !== "annual" && (
                  <FormField
                    control={form.control}
                    name="period_number"
                    render={({ field }) => (
                      <FormItem>
                        <FormLabel>
                          {periodType === "quarterly" ? "Quarter" : "Month"} *
                        </FormLabel>
                        <Select
                          onValueChange={(value) => field.onChange(parseInt(value))}
                          value={field.value?.toString() || ""}
                        >
                          <FormControl>
                            <SelectTrigger>
                              <SelectValue
                                placeholder={`Select ${periodType === "quarterly" ? "quarter" : "month"}`}
                              />
                            </SelectTrigger>
                          </FormControl>
                          <SelectContent>
                            {(periodType === "quarterly"
                              ? QUARTERLY_PERIODS
                              : MONTHLY_PERIODS
                            ).map((period) => (
                              <SelectItem
                                key={period.value}
                                value={period.value.toString()}
                              >
                                {period.label}
                              </SelectItem>
                            ))}
                          </SelectContent>
                        </Select>
                        <FormMessage />
                      </FormItem>
                    )}
                  />
                )}
              </div>

              {/* Amount */}
              <FormField
                control={form.control}
                name="requested_amount"
                render={({ field }) => (
                  <FormItem>
                    <FormLabel>Requested Amount (USD) *</FormLabel>
                    <FormControl>
                      <div className="relative">
                        <span className="absolute left-3 top-1/2 -translate-y-1/2 text-muted-foreground">
                          $
                        </span>
                        <Input
                          type="number"
                          step="0.01"
                          min="0"
                          placeholder="0.00"
                          className="pl-7"
                          {...field}
                        />
                      </div>
                    </FormControl>
                    {breakdownTotal > 0 && breakdownTotal !== field.value && (
                      <FormDescription className="text-yellow-600">
                        Note: Breakdown total (${breakdownTotal.toFixed(2)}) differs from requested amount
                      </FormDescription>
                    )}
                    <FormMessage />
                  </FormItem>
                )}
              />

              {/* Justification */}
              <FormField
                control={form.control}
                name="justification"
                render={({ field }) => (
                  <FormItem>
                    <FormLabel>Justification *</FormLabel>
                    <FormControl>
                      <Textarea
                        placeholder="Explain why this budget allocation is needed, how it will be used, and the expected outcomes..."
                        className="resize-none"
                        rows={4}
                        {...field}
                      />
                    </FormControl>
                    <FormDescription>
                      Provide a clear explanation for this budget request.
                    </FormDescription>
                    <FormMessage />
                  </FormItem>
                )}
              />

              {/* Budget Breakdown (Optional) */}
              <div className="space-y-3">
                <div className="flex items-center justify-between">
                  <FormLabel>Budget Breakdown (Optional)</FormLabel>
                  <Button
                    type="button"
                    variant="outline"
                    size="sm"
                    onClick={() =>
                      append({ category: "", description: "", amount: 0 })
                    }
                  >
                    <Plus className="h-4 w-4 mr-1" />
                    Add Item
                  </Button>
                </div>

                {fields.length > 0 && (
                  <Card>
                    <CardContent className="pt-4 space-y-4">
                      {fields.map((field, index) => (
                        <div
                          key={field.id}
                          className="grid grid-cols-12 gap-2 items-start"
                        >
                          <div className="col-span-3">
                            <Input
                              placeholder="Category"
                              {...form.register(`budget_breakdown.${index}.category`)}
                            />
                          </div>
                          <div className="col-span-5">
                            <Input
                              placeholder="Description"
                              {...form.register(`budget_breakdown.${index}.description`)}
                            />
                          </div>
                          <div className="col-span-3">
                            <div className="relative">
                              <span className="absolute left-2 top-1/2 -translate-y-1/2 text-muted-foreground text-sm">
                                $
                              </span>
                              <Input
                                type="number"
                                step="0.01"
                                min="0"
                                placeholder="0.00"
                                className="pl-5"
                                {...form.register(`budget_breakdown.${index}.amount`)}
                              />
                            </div>
                          </div>
                          <div className="col-span-1">
                            <Button
                              type="button"
                              variant="ghost"
                              size="icon"
                              onClick={() => remove(index)}
                              className="text-red-500 hover:text-red-700"
                            >
                              <Trash2 className="h-4 w-4" />
                            </Button>
                          </div>
                        </div>
                      ))}

                      {fields.length > 0 && (
                        <div className="flex justify-end pt-2 border-t">
                          <span className="text-sm font-medium">
                            Total: ${breakdownTotal.toFixed(2)}
                          </span>
                        </div>
                      )}
                    </CardContent>
                  </Card>
                )}

                <p className="text-xs text-muted-foreground">
                  Optionally break down how the budget will be allocated across different categories.
                </p>
              </div>

              <DialogFooter className="flex-col sm:flex-row gap-2 pt-4">
                <Button
                  type="button"
                  variant="outline"
                  onClick={() => onOpenChange(false)}
                  disabled={isSubmitting}
                >
                  Cancel
                </Button>
                <Button
                  type="button"
                  variant="secondary"
                  onClick={form.handleSubmit((values) => handleSave(values, false))}
                  disabled={isSubmitting}
                >
                  {isSubmitting ? (
                    <Loader2 className="mr-2 h-4 w-4 animate-spin" />
                  ) : (
                    <Save className="mr-2 h-4 w-4" />
                  )}
                  Save as Draft
                </Button>
                <Button
                  type="button"
                  onClick={form.handleSubmit((values) => handleSave(values, true))}
                  disabled={isSubmitting}
                >
                  {isSubmitting ? (
                    <Loader2 className="mr-2 h-4 w-4 animate-spin" />
                  ) : (
                    <Send className="mr-2 h-4 w-4" />
                  )}
                  Submit for Review
                </Button>
              </DialogFooter>
            </form>
          </Form>
        )}
      </DialogContent>
    </Dialog>
  );
}
