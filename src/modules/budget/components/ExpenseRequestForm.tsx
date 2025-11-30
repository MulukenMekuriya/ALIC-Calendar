/**
 * ExpenseRequestForm - Form for creating and editing expense requests
 */

import { useState, useEffect } from "react";
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
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/shared/components/ui/select";
import { Loader2, DollarSign, Send, Save } from "lucide-react";
import { useToast } from "@/shared/hooks/use-toast";
import { useMinistries } from "../hooks";
import { useActiveFiscalYear } from "../hooks";
import { useCreateExpense, useUpdateExpense, useSubmitExpenseForReview } from "../hooks";
import { useAuth } from "@/shared/contexts/AuthContext";
import { useOrganization } from "@/shared/contexts/OrganizationContext";
import { useUserProfile } from "@/hooks/useUserProfile";
import type { ExpenseRequest, ReimbursementType } from "../types";
import { REIMBURSEMENT_TYPE_LABELS } from "../types";

// Form validation schema
const expenseFormSchema = z.object({
  ministry_id: z.string().min(1, "Please select a ministry"),
  title: z.string().min(3, "Title must be at least 3 characters"),
  description: z.string().optional(),
  amount: z.coerce.number().positive("Amount must be greater than 0"),
  reimbursement_type: z.enum(["cash", "check", "bank_transfer", "zelle", "other"]),
});

type ExpenseFormValues = z.infer<typeof expenseFormSchema>;

interface ExpenseRequestFormProps {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  expense?: ExpenseRequest | null;
  onSuccess?: () => void;
}

export function ExpenseRequestForm({
  open,
  onOpenChange,
  expense,
  onSuccess,
}: ExpenseRequestFormProps) {
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

  const createExpense = useCreateExpense();
  const updateExpense = useUpdateExpense();
  const submitForReview = useSubmitExpenseForReview();

  const isEditing = !!expense;

  const form = useForm<ExpenseFormValues>({
    resolver: zodResolver(expenseFormSchema),
    defaultValues: {
      ministry_id: "",
      title: "",
      description: "",
      amount: 0,
      reimbursement_type: "check",
    },
  });

  // Auto-select ministry based on user's profile ministry_name
  useEffect(() => {
    if (!expense && profile?.ministry_name && ministries) {
      const userMinistry = ministries.find(
        (m) => m.name.toLowerCase() === profile.ministry_name?.toLowerCase()
      );
      if (userMinistry) {
        form.setValue("ministry_id", userMinistry.id);
      }
    }
  }, [profile?.ministry_name, ministries, expense, form]);

  // Update form values when expense changes (for editing)
  useEffect(() => {
    if (expense) {
      form.reset({
        ministry_id: expense.ministry_id,
        title: expense.title,
        description: expense.description || "",
        amount: expense.amount,
        reimbursement_type: expense.reimbursement_type,
      });
    } else {
      form.reset({
        ministry_id: "",
        title: "",
        description: "",
        amount: 0,
        reimbursement_type: "check",
      });
    }
  }, [expense, form]);

  const handleSave = async (values: ExpenseFormValues, submit: boolean = false) => {
    if (!currentOrganization || !user || !activeFiscalYear) {
      toast({
        title: "Error",
        description: "Missing required data. Please try again.",
        variant: "destructive",
      });
      return;
    }

    setIsSubmitting(true);

    try {
      if (isEditing && expense) {
        // Update existing expense
        await updateExpense.mutateAsync({
          expenseId: expense.id,
          data: {
            ministry_id: values.ministry_id,
            title: values.title,
            description: values.description || null,
            amount: values.amount,
            reimbursement_type: values.reimbursement_type,
            requester_name: profile?.full_name || "Unknown",
            requester_phone: profile?.phone_number || null,
            requester_email: profile?.email || null,
          },
        });

        if (submit) {
          await submitForReview.mutateAsync({
            expenseId: expense.id,
            actorId: user.id,
            actorName: profile?.full_name || "Unknown",
          });
        }

        toast({
          title: submit ? "Expense submitted" : "Expense updated",
          description: submit
            ? "Your expense request has been submitted for review."
            : "Your expense request has been saved as a draft.",
        });
      } else {
        // Create new expense
        const newExpense = await createExpense.mutateAsync({
          expenseData: {
            organization_id: currentOrganization.id,
            fiscal_year_id: activeFiscalYear.id,
            ministry_id: values.ministry_id,
            title: values.title,
            description: values.description || null,
            amount: values.amount,
            reimbursement_type: values.reimbursement_type,
            requester_id: user.id,
            requester_name: profile?.full_name || "Unknown",
            requester_phone: profile?.phone_number || null,
            requester_email: profile?.email || null,
            status: "draft",
          },
          actorId: user.id,
          actorName: profile?.full_name || "Unknown",
        });

        if (submit) {
          await submitForReview.mutateAsync({
            expenseId: newExpense.id,
            actorId: user.id,
            actorName: profile?.full_name || "Unknown",
          });
        }

        toast({
          title: submit ? "Expense submitted" : "Expense created",
          description: submit
            ? "Your expense request has been submitted for review."
            : "Your expense request has been saved as a draft.",
        });
      }

      onOpenChange(false);
      onSuccess?.();
    } catch (error) {
      toast({
        title: "Error",
        description:
          error instanceof Error ? error.message : "Failed to save expense request",
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
              to set up a fiscal year before submitting expense requests.
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
      <DialogContent className="sm:max-w-[600px] max-h-[90vh] overflow-y-auto">
        <DialogHeader>
          <DialogTitle className="flex items-center gap-2">
            <DollarSign className="h-5 w-5" />
            {isEditing ? "Edit Expense Request" : "New Expense Request"}
          </DialogTitle>
          <DialogDescription>
            {isEditing
              ? "Update your expense request details."
              : "Fill out the form to submit a new expense request."}
            {activeFiscalYear && (
              <span className="block mt-1 text-xs">
                Fiscal Year: {activeFiscalYear.name}
              </span>
            )}
          </DialogDescription>
        </DialogHeader>

        {isLoading ? (
          <div className="flex items-center justify-center py-8">
            <Loader2 className="h-8 w-8 animate-spin text-muted-foreground" />
          </div>
        ) : (
          <Form {...form}>
            <form className="space-y-4">
              <FormField
                control={form.control}
                name="ministry_id"
                render={({ field }) => (
                  <FormItem>
                    <FormLabel>Ministry *</FormLabel>
                    <Select onValueChange={field.onChange} value={field.value}>
                      <FormControl>
                        <SelectTrigger>
                          <SelectValue placeholder="Select a ministry" />
                        </SelectTrigger>
                      </FormControl>
                      <SelectContent>
                        {ministries?.map((ministry) => (
                          <SelectItem key={ministry.id} value={ministry.id}>
                            {ministry.name}
                          </SelectItem>
                        ))}
                      </SelectContent>
                    </Select>
                    <FormMessage />
                  </FormItem>
                )}
              />

              <FormField
                control={form.control}
                name="title"
                render={({ field }) => (
                  <FormItem>
                    <FormLabel>Title / Purpose *</FormLabel>
                    <FormControl>
                      <Input placeholder="e.g., Youth Ministry Supplies" {...field} />
                    </FormControl>
                    <FormMessage />
                  </FormItem>
                )}
              />

              <FormField
                control={form.control}
                name="description"
                render={({ field }) => (
                  <FormItem>
                    <FormLabel>Description</FormLabel>
                    <FormControl>
                      <Textarea
                        placeholder="Provide details about the expense..."
                        className="resize-none"
                        rows={3}
                        {...field}
                      />
                    </FormControl>
                    <FormDescription>
                      Describe what the expense is for and why it's needed.
                    </FormDescription>
                    <FormMessage />
                  </FormItem>
                )}
              />

              <div className="grid grid-cols-2 gap-4">
                <FormField
                  control={form.control}
                  name="amount"
                  render={({ field }) => (
                    <FormItem>
                      <FormLabel>Amount (USD) *</FormLabel>
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
                      <FormMessage />
                    </FormItem>
                  )}
                />

                <FormField
                  control={form.control}
                  name="reimbursement_type"
                  render={({ field }) => (
                    <FormItem>
                      <FormLabel>Reimbursement Method *</FormLabel>
                      <Select onValueChange={field.onChange} value={field.value}>
                        <FormControl>
                          <SelectTrigger>
                            <SelectValue placeholder="Select method" />
                          </SelectTrigger>
                        </FormControl>
                        <SelectContent>
                          {(
                            Object.entries(REIMBURSEMENT_TYPE_LABELS) as [
                              ReimbursementType,
                              string,
                            ][]
                          ).map(([value, label]) => (
                            <SelectItem key={value} value={value}>
                              {label}
                            </SelectItem>
                          ))}
                        </SelectContent>
                      </Select>
                      <FormMessage />
                    </FormItem>
                  )}
                />
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
