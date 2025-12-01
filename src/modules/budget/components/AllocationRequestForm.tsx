/**
 * AllocationRequestForm - Premium Budget Allocation Request Form
 * Clean, modern UI with elegant period-based amount inputs
 */

import { useState, useEffect } from "react";
import { useForm, useFieldArray } from "react-hook-form";
import { zodResolver } from "@hookform/resolvers/zod";
import { z } from "zod";
import {
  Dialog,
  DialogContent,
  DialogHeader,
  DialogTitle,
} from "@/shared/components/ui/dialog";
import {
  Form,
  FormControl,
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
  Send,
  Save,
  Plus,
  Trash2,
  Calendar,
  TrendingUp,
} from "lucide-react";
import { useToast } from "@/shared/hooks/use-toast";
import { useAuth } from "@/shared/contexts/AuthContext";
import { useOrganization } from "@/shared/contexts/OrganizationContext";
import { useUserProfile } from "@/hooks/useUserProfile";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/shared/components/ui/select";
import {
  useMinistries,
  useFiscalYears,
  useActiveFiscalYear,
  useCreateAllocationRequest,
  useUpdateAllocationRequest,
  useSubmitAllocationRequest,
} from "../hooks";
import type { AllocationRequest, BudgetBreakdownItem } from "../types";
import { PERIOD_AMOUNT_CATEGORY } from "../types";

// Form validation schema
const breakdownItemSchema = z.object({
  category: z.string().min(1, "Required"),
  description: z.string().min(1, "Required"),
  amount: z.coerce.number().positive("Must be > 0"),
});

const periodAmountSchema = z.object({
  period: z.number(),
  label: z.string(),
  shortLabel: z.string(),
  amount: z.coerce.number().min(0),
});

const allocationRequestFormSchema = z.object({
  period_type: z.enum(["annual", "quarterly", "monthly"]),
  annual_amount: z.coerce.number().min(0).optional(),
  period_amounts: z.array(periodAmountSchema).optional(),
  justification: z.string().min(10, "Please provide at least 10 characters"),
  budget_breakdown: z.array(breakdownItemSchema).optional(),
});

type AllocationRequestFormValues = z.infer<typeof allocationRequestFormSchema>;

interface AllocationRequestFormProps {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  request?: AllocationRequest | null;
  onSuccess?: () => void;
}

// Short labels for compact display
const QUARTERLY_SHORT = [
  { value: 1, label: "Q1 (Jan-Mar)", shortLabel: "Q1" },
  { value: 2, label: "Q2 (Apr-Jun)", shortLabel: "Q2" },
  { value: 3, label: "Q3 (Jul-Sep)", shortLabel: "Q3" },
  { value: 4, label: "Q4 (Oct-Dec)", shortLabel: "Q4" },
];

const MONTHLY_SHORT = [
  { value: 1, label: "January", shortLabel: "Jan" },
  { value: 2, label: "February", shortLabel: "Feb" },
  { value: 3, label: "March", shortLabel: "Mar" },
  { value: 4, label: "April", shortLabel: "Apr" },
  { value: 5, label: "May", shortLabel: "May" },
  { value: 6, label: "June", shortLabel: "Jun" },
  { value: 7, label: "July", shortLabel: "Jul" },
  { value: 8, label: "August", shortLabel: "Aug" },
  { value: 9, label: "September", shortLabel: "Sep" },
  { value: 10, label: "October", shortLabel: "Oct" },
  { value: 11, label: "November", shortLabel: "Nov" },
  { value: 12, label: "December", shortLabel: "Dec" },
];

const createQuarterlyAmounts = () =>
  QUARTERLY_SHORT.map((q) => ({
    period: q.value,
    label: q.label,
    shortLabel: q.shortLabel,
    amount: 0,
  }));

const createMonthlyAmounts = () =>
  MONTHLY_SHORT.map((m) => ({
    period: m.value,
    label: m.label,
    shortLabel: m.shortLabel,
    amount: 0,
  }));

/**
 * Determines if a period (quarter or month) is in the past based on the fiscal year.
 * @param fiscalYear - The fiscal year (e.g., 2025)
 * @param periodType - "quarterly" or "monthly"
 * @param periodNumber - 1-4 for quarters, 1-12 for months
 * @returns true if the period is in the past
 */
const isPeriodInPast = (
  fiscalYear: number,
  periodType: "quarterly" | "monthly",
  periodNumber: number
): boolean => {
  const now = new Date();
  const currentYear = now.getFullYear();
  const currentMonth = now.getMonth() + 1; // 1-12

  // If fiscal year is in the past, all periods are in the past
  if (fiscalYear < currentYear) {
    return true;
  }

  // If fiscal year is in the future, no periods are in the past
  if (fiscalYear > currentYear) {
    return false;
  }

  // Fiscal year is current year - check the specific period
  if (periodType === "monthly") {
    return periodNumber < currentMonth;
  }

  // For quarterly: Q1=Jan-Mar (1-3), Q2=Apr-Jun (4-6), Q3=Jul-Sep (7-9), Q4=Oct-Dec (10-12)
  const currentQuarter = Math.ceil(currentMonth / 3);
  return periodNumber < currentQuarter;
};

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
  const { data: fiscalYears, isLoading: fiscalYearsLoading } = useFiscalYears(
    currentOrganization?.id
  );
  const { data: activeFiscalYear } = useActiveFiscalYear(
    currentOrganization?.id
  );

  // Selected fiscal year state - defaults to active fiscal year
  const [selectedFiscalYearId, setSelectedFiscalYearId] = useState<string | null>(null);

  // Get the effective fiscal year (selected or active)
  const selectedFiscalYear = fiscalYears?.find(
    (fy) => fy.id === (selectedFiscalYearId || activeFiscalYear?.id)
  ) || activeFiscalYear;

  const createRequest = useCreateAllocationRequest();
  const updateRequest = useUpdateAllocationRequest();
  const submitForReview = useSubmitAllocationRequest();

  const isEditing = !!request;

  const form = useForm<AllocationRequestFormValues>({
    resolver: zodResolver(allocationRequestFormSchema),
    defaultValues: {
      period_type: "annual",
      annual_amount: 0,
      period_amounts: [],
      justification: "",
      budget_breakdown: [],
    },
  });

  const {
    fields: breakdownFields,
    append: appendBreakdown,
    remove: removeBreakdown,
  } = useFieldArray({
    control: form.control,
    name: "budget_breakdown",
  });

  const periodType = form.watch("period_type");
  const periodAmounts = form.watch("period_amounts") || [];
  const annualAmount = form.watch("annual_amount") || 0;

  const userMinistry = ministries?.find(
    (m) => m.name.toLowerCase() === profile?.ministry_name?.toLowerCase()
  );

  // Calculate totals
  const periodAmountsTotal = periodAmounts.reduce(
    (sum, pa) => sum + Number(pa.amount || 0),
    0
  );
  const totalAmount =
    periodType === "annual" ? annualAmount : periodAmountsTotal;

  const breakdownTotal = breakdownFields.reduce((sum, _, index) => {
    const amount = form.watch(`budget_breakdown.${index}.amount`) || 0;
    return sum + Number(amount);
  }, 0);

  // Update period amounts when period type changes
  useEffect(() => {
    if (periodType === "quarterly") {
      form.setValue("period_amounts", createQuarterlyAmounts());
    } else if (periodType === "monthly") {
      form.setValue("period_amounts", createMonthlyAmounts());
    } else {
      form.setValue("period_amounts", []);
    }
  }, [periodType, form]);

  // Update form values when request changes (for editing)
  useEffect(() => {
    if (request) {
      const breakdown = request.budget_breakdown || [];
      const periodAmountsFromBreakdown = breakdown.filter(
        (item) => item.category === PERIOD_AMOUNT_CATEGORY
      );

      if (request.period_type === "annual") {
        form.reset({
          period_type: request.period_type,
          annual_amount: request.requested_amount,
          period_amounts: [],
          justification: request.justification,
          budget_breakdown: breakdown.filter(
            (item) => item.category !== PERIOD_AMOUNT_CATEGORY
          ),
        });
      } else if (request.period_type === "quarterly") {
        const quarterAmounts = createQuarterlyAmounts().map((q) => {
          const found = periodAmountsFromBreakdown.find(
            (p) => p.description === q.label
          );
          return { ...q, amount: found?.amount || 0 };
        });
        form.reset({
          period_type: request.period_type,
          annual_amount: 0,
          period_amounts: quarterAmounts,
          justification: request.justification,
          budget_breakdown: breakdown.filter(
            (item) => item.category !== PERIOD_AMOUNT_CATEGORY
          ),
        });
      } else if (request.period_type === "monthly") {
        const monthAmounts = createMonthlyAmounts().map((m) => {
          const found = periodAmountsFromBreakdown.find(
            (p) => p.description === m.label
          );
          return { ...m, amount: found?.amount || 0 };
        });
        form.reset({
          period_type: request.period_type,
          annual_amount: 0,
          period_amounts: monthAmounts,
          justification: request.justification,
          budget_breakdown: breakdown.filter(
            (item) => item.category !== PERIOD_AMOUNT_CATEGORY
          ),
        });
      }
    } else {
      form.reset({
        period_type: "annual",
        annual_amount: 0,
        period_amounts: [],
        justification: "",
        budget_breakdown: [],
      });
    }
  }, [request, form]);

  const handleSave = async (
    values: AllocationRequestFormValues,
    submit: boolean = false
  ) => {
    if (!currentOrganization || !user || !selectedFiscalYear) {
      toast({
        title: "Error",
        description: "Missing required data.",
        variant: "destructive",
      });
      return;
    }

    if (!userMinistry) {
      toast({
        title: "Error",
        description: "You are not assigned to a ministry.",
        variant: "destructive",
      });
      return;
    }

    let finalAmount = 0;
    if (values.period_type === "annual") {
      finalAmount = values.annual_amount || 0;
    } else {
      finalAmount = (values.period_amounts || []).reduce(
        (sum, pa) => sum + Number(pa.amount || 0),
        0
      );
    }

    if (finalAmount <= 0) {
      toast({
        title: "Error",
        description: "Total amount must be greater than 0.",
        variant: "destructive",
      });
      return;
    }

    // Prepare period amounts for quarterly/monthly requests
    const periodAmountsData = (values.period_amounts || [])
      .filter((pa) => pa.amount > 0)
      .map((pa) => ({
        period_number: pa.period,
        amount: pa.amount,
        notes: pa.label,
      }));

    // Keep a copy in budget_breakdown for backward compatibility and display
    const periodAmountsAsBreakdown: BudgetBreakdownItem[] = (
      values.period_amounts || []
    )
      .filter((pa) => pa.amount > 0)
      .map((pa) => ({
        category: PERIOD_AMOUNT_CATEGORY,
        description: pa.label,
        amount: pa.amount,
      }));

    const combinedBreakdown = [
      ...periodAmountsAsBreakdown,
      ...((values.budget_breakdown as BudgetBreakdownItem[]) || []),
    ];

    setIsSubmitting(true);

    try {
      if (isEditing && request) {
        await updateRequest.mutateAsync({
          requestId: request.id,
          data: {
            period_type: values.period_type,
            requested_amount: finalAmount,
            justification: values.justification,
            budget_breakdown: combinedBreakdown,
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
            ? "Your request has been submitted for review."
            : "Your request has been saved.",
        });
      } else {
        const newRequest = await createRequest.mutateAsync({
          requestData: {
            organization_id: currentOrganization.id,
            fiscal_year_id: selectedFiscalYear.id,
            ministry_id: userMinistry.id,
            requester_id: user.id,
            requester_name: profile?.full_name || "Unknown",
            period_type: values.period_type,
            requested_amount: finalAmount,
            justification: values.justification,
            budget_breakdown: combinedBreakdown,
            status: "draft",
          },
          periodAmounts:
            periodAmountsData.length > 0 ? periodAmountsData : undefined,
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
            ? "Your request has been submitted for review."
            : "Your request has been saved as draft.",
        });
      }

      onOpenChange(false);
      onSuccess?.();
    } catch (error) {
      toast({
        title: "Error",
        description:
          error instanceof Error ? error.message : "Failed to save request",
        variant: "destructive",
      });
    } finally {
      setIsSubmitting(false);
    }
  };

  const isLoading = ministriesLoading || fiscalYearsLoading;

  if (!selectedFiscalYear && !fiscalYearsLoading) {
    return (
      <Dialog open={open} onOpenChange={onOpenChange}>
        <DialogContent className="sm:max-w-md">
          <DialogHeader>
            <DialogTitle>No Active Fiscal Year</DialogTitle>
          </DialogHeader>
          <p className="text-muted-foreground text-sm">
            Please contact an administrator to set up a fiscal year.
          </p>
          <Button onClick={() => onOpenChange(false)} className="mt-4">
            Close
          </Button>
        </DialogContent>
      </Dialog>
    );
  }

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="sm:max-w-[580px] max-h-[90vh] overflow-hidden p-0 flex flex-col">
        {/* Header */}
        <div className="flex-shrink-0 bg-gradient-to-r from-violet-600 to-indigo-600 px-6 py-5 text-white">
          <DialogTitle className="text-xl font-semibold">
            {isEditing
              ? "Edit Allocation Request"
              : "Budget Allocation Request"}
          </DialogTitle>
          <div className="flex items-center gap-2 mt-2 text-violet-100 text-sm">
            <Calendar className="h-4 w-4" />
            <Select
              value={selectedFiscalYearId || activeFiscalYear?.id || ""}
              onValueChange={setSelectedFiscalYearId}
            >
              <SelectTrigger className="h-7 w-auto gap-1 border-violet-400/50 bg-violet-500/30 text-white hover:bg-violet-500/50 focus:ring-violet-300 [&>svg]:text-white">
                <SelectValue placeholder="Select year" />
              </SelectTrigger>
              <SelectContent>
                {fiscalYears?.map((fy) => (
                  <SelectItem key={fy.id} value={fy.id}>
                    {fy.name} {fy.is_active && "(Active)"}
                  </SelectItem>
                ))}
              </SelectContent>
            </Select>
            <span className="opacity-50">•</span>
            <span>{userMinistry?.name || "No Ministry"}</span>
          </div>
        </div>

        {isLoading ? (
          <div className="flex items-center justify-center py-16">
            <Loader2 className="h-8 w-8 animate-spin text-muted-foreground" />
          </div>
        ) : !userMinistry ? (
          <div className="p-6 text-center">
            <p className="text-muted-foreground">
              You are not assigned to a ministry.
            </p>
            <Button className="mt-4" onClick={() => onOpenChange(false)}>
              Close
            </Button>
          </div>
        ) : (
          <Form {...form}>
            <form className="flex flex-col flex-1 overflow-hidden">
              {/* Scrollable Content */}
              <div className="flex-1 overflow-y-auto p-6 space-y-6">
              {/* Period Type Toggle */}
              <div>
                <FormLabel className="text-xs uppercase tracking-wide text-muted-foreground mb-3 block">
                  Allocation Period
                </FormLabel>
                <div className="grid grid-cols-3 gap-2">
                  {(["annual", "quarterly", "monthly"] as const).map((type) => (
                    <button
                      key={type}
                      type="button"
                      onClick={() => form.setValue("period_type", type)}
                      className={`
                        py-3 px-4 rounded-lg border-2 text-sm font-medium transition-all
                        ${
                          periodType === type
                            ? "border-violet-500 bg-violet-50 text-violet-700"
                            : "border-gray-200 hover:border-gray-300 text-gray-600"
                        }
                      `}
                    >
                      {type.charAt(0).toUpperCase() + type.slice(1)}
                    </button>
                  ))}
                </div>
              </div>

              {/* Amount Section */}
              <div className="bg-gradient-to-br from-slate-50 to-gray-100 rounded-2xl p-5 border border-slate-200/60">
                {periodType === "annual" ? (
                  <FormField
                    control={form.control}
                    name="annual_amount"
                    render={({ field }) => (
                      <FormItem>
                        <FormLabel className="text-sm font-medium text-slate-600">
                          Annual Budget Amount
                        </FormLabel>
                        <FormControl>
                          <div className="relative mt-2">
                            <span className="absolute left-4 top-1/2 -translate-y-1/2 text-slate-400 text-xl font-medium">
                              $
                            </span>
                            <Input
                              type="number"
                              step="0.01"
                              min="0"
                              placeholder="0.00"
                              className="pl-10 h-14 text-2xl font-semibold border-slate-200 bg-white rounded-xl shadow-sm focus:ring-2 focus:ring-violet-500/20 focus:border-violet-400"
                              {...field}
                            />
                          </div>
                        </FormControl>
                        <FormMessage />
                      </FormItem>
                    )}
                  />
                ) : periodType === "quarterly" ? (
                  <div className="space-y-4">
                    <div className="flex items-center justify-between">
                      <span className="text-sm font-medium text-slate-600">
                        Quarterly Allocation
                      </span>
                      <div className="flex items-center gap-2 bg-white px-3 py-1.5 rounded-full border border-slate-200 shadow-sm">
                        <span className="text-xs text-slate-500">Total:</span>
                        <span className="text-sm font-bold text-violet-600">
                          ${periodAmountsTotal.toLocaleString()}
                        </span>
                      </div>
                    </div>
                    <div className="grid grid-cols-2 gap-3">
                      {periodAmounts.map((pa, index) => {
                        const isPast = selectedFiscalYear
                          ? isPeriodInPast(selectedFiscalYear.year, "quarterly", pa.period)
                          : false;
                        return (
                          <FormField
                            key={pa.period}
                            control={form.control}
                            name={`period_amounts.${index}.amount`}
                            render={({ field }) => (
                              <FormItem>
                                <div
                                  className={`bg-white rounded-xl border p-3 shadow-sm transition-all duration-200 ${
                                    isPast
                                      ? "border-slate-200 bg-slate-50 opacity-60 cursor-not-allowed"
                                      : "border-slate-200 hover:shadow-md hover:border-violet-300"
                                  }`}
                                >
                                  <div className="flex items-center justify-between mb-2">
                                    <span
                                      className={`text-xs font-bold px-2 py-0.5 rounded-md ${
                                        isPast
                                          ? "text-slate-400 bg-slate-100"
                                          : "text-violet-600 bg-violet-50"
                                      }`}
                                    >
                                      {pa.shortLabel}
                                    </span>
                                    <span className="text-[10px] text-slate-400 font-medium">
                                      {pa.label.replace(/Q\d\s/, "")}
                                    </span>
                                  </div>
                                  <FormControl>
                                    <div className="relative">
                                      <span className="absolute left-3 top-1/2 -translate-y-1/2 text-slate-400 text-sm font-medium">
                                        $
                                      </span>
                                      <Input
                                        type="number"
                                        step="0.01"
                                        min="0"
                                        placeholder="0.00"
                                        disabled={isPast}
                                        className={`pl-7 h-11 text-right text-base font-semibold border-0 rounded-lg ${
                                          isPast
                                            ? "bg-slate-100 text-slate-400 cursor-not-allowed"
                                            : "bg-slate-50 focus:bg-white focus:ring-2 focus:ring-violet-500/20"
                                        }`}
                                        {...field}
                                      />
                                    </div>
                                  </FormControl>
                                </div>
                              </FormItem>
                            )}
                          />
                        );
                      })}
                    </div>
                  </div>
                ) : (
                  <div className="space-y-3">
                    <span className="text-sm font-medium text-slate-600">
                      Monthly Allocation
                    </span>
                    {/* Clean 3-column layout with rows */}
                    <div className="bg-white rounded-xl border border-slate-200 overflow-hidden shadow-sm">
                      {[0, 1, 2, 3].map((rowIndex) => (
                        <div
                          key={rowIndex}
                          className={`grid grid-cols-3 ${
                            rowIndex > 0 ? "border-t border-slate-100" : ""
                          }`}
                        >
                          {periodAmounts
                            .slice(rowIndex * 3, rowIndex * 3 + 3)
                            .map((pa, colIndex) => {
                              const actualIndex = rowIndex * 3 + colIndex;
                              const isPast = selectedFiscalYear
                                ? isPeriodInPast(selectedFiscalYear.year, "monthly", pa.period)
                                : false;
                              return (
                                <FormField
                                  key={pa.period}
                                  control={form.control}
                                  name={`period_amounts.${actualIndex}.amount`}
                                  render={({ field }) => (
                                    <FormItem
                                      className={`p-3 ${
                                        colIndex > 0
                                          ? "border-l border-slate-100"
                                          : ""
                                      } ${isPast ? "bg-slate-50 opacity-60" : ""}`}
                                    >
                                      <div className="flex items-center justify-between mb-1.5">
                                        <span
                                          className={`text-[11px] font-semibold uppercase tracking-wider ${
                                            isPast ? "text-slate-400" : "text-slate-500"
                                          }`}
                                        >
                                          {pa.shortLabel}
                                        </span>
                                      </div>
                                      <FormControl>
                                        <div
                                          className={`relative flex items-center border rounded-lg overflow-hidden transition-all ${
                                            isPast
                                              ? "bg-slate-100 border-slate-200 cursor-not-allowed"
                                              : "bg-white border-slate-200 focus-within:ring-2 focus-within:ring-violet-500/20 focus-within:border-violet-400"
                                          }`}
                                        >
                                          <span className="pl-3 pr-1 text-slate-400 text-sm font-medium select-none">
                                            $
                                          </span>
                                          <Input
                                            type="number"
                                            step="0.01"
                                            min="0"
                                            placeholder="0.00"
                                            disabled={isPast}
                                            className={`h-10 pl-0 pr-3 text-right text-sm font-semibold border-0 bg-transparent focus-visible:ring-0 focus-visible:ring-offset-0 [appearance:textfield] [&::-webkit-outer-spin-button]:appearance-none [&::-webkit-inner-spin-button]:appearance-none ${
                                              isPast ? "text-slate-400 cursor-not-allowed" : ""
                                            }`}
                                            {...field}
                                          />
                                        </div>
                                      </FormControl>
                                    </FormItem>
                                  )}
                                />
                              );
                            })}
                        </div>
                      ))}
                      {/* Total row */}
                      <div className="border-t-2 border-slate-200 bg-gradient-to-r from-violet-50 to-indigo-50 px-4 py-3 flex items-center justify-between">
                        <span className="text-sm font-medium text-slate-600">
                          Total Annual Budget
                        </span>
                        <span className="text-lg font-bold text-violet-700">
                          $
                          {periodAmountsTotal.toLocaleString("en-US", {
                            minimumFractionDigits: 2,
                          })}
                        </span>
                      </div>
                    </div>
                  </div>
                )}
              </div>

              {/* Total Display */}
              {totalAmount > 0 && (
                <div className="flex items-center justify-between p-4 bg-gradient-to-r from-green-50 to-emerald-50 rounded-xl border border-green-200">
                  <div className="flex items-center gap-2">
                    <TrendingUp className="h-5 w-5 text-green-600" />
                    <span className="text-sm font-medium text-green-800">
                      Total Request
                    </span>
                  </div>
                  <span className="text-2xl font-bold text-green-700">
                    $
                    {totalAmount.toLocaleString("en-US", {
                      minimumFractionDigits: 2,
                    })}
                  </span>
                </div>
              )}

              <Separator />

              {/* Justification */}
              <FormField
                control={form.control}
                name="justification"
                render={({ field }) => (
                  <FormItem>
                    <FormLabel>Justification</FormLabel>
                    <FormControl>
                      <Textarea
                        placeholder="Explain why this budget is needed and how it will be used..."
                        className="resize-none min-h-[100px]"
                        {...field}
                      />
                    </FormControl>
                    <FormMessage />
                  </FormItem>
                )}
              />

              {/* Budget Breakdown (Collapsible) */}
              <div className="space-y-3">
                <div className="flex items-center justify-between">
                  <span className="text-sm font-medium text-gray-700">
                    Budget Categories
                  </span>
                  <Button
                    type="button"
                    variant="ghost"
                    size="sm"
                    className="text-violet-600 hover:text-violet-700 hover:bg-violet-50"
                    onClick={() =>
                      appendBreakdown({
                        category: "",
                        description: "",
                        amount: 0,
                      })
                    }
                  >
                    <Plus className="h-4 w-4 mr-1" />
                    Add Category
                  </Button>
                </div>

                {breakdownFields.length > 0 && (
                  <div className="space-y-2 p-3 bg-gray-50 rounded-lg">
                    {breakdownFields.map((field, index) => (
                      <div key={field.id} className="flex items-center gap-2">
                        <Input
                          placeholder="Category"
                          className="flex-[1] h-9 text-sm"
                          {...form.register(
                            `budget_breakdown.${index}.category`
                          )}
                        />
                        <Input
                          placeholder="Description"
                          className="flex-[2] h-9 text-sm"
                          {...form.register(
                            `budget_breakdown.${index}.description`
                          )}
                        />
                        <div className="relative flex-[1]">
                          <span className="absolute left-2 top-1/2 -translate-y-1/2 text-gray-400 text-xs">
                            $
                          </span>
                          <Input
                            type="number"
                            step="0.01"
                            min="0"
                            placeholder="0"
                            className="pl-5 h-9 text-sm"
                            {...form.register(
                              `budget_breakdown.${index}.amount`
                            )}
                          />
                        </div>
                        <Button
                          type="button"
                          variant="ghost"
                          size="icon"
                          className="h-9 w-9 text-red-400 hover:text-red-600 hover:bg-red-50"
                          onClick={() => removeBreakdown(index)}
                        >
                          <Trash2 className="h-4 w-4" />
                        </Button>
                      </div>
                    ))}
                    {breakdownTotal > 0 && (
                      <div className="text-right text-sm text-gray-500 pt-2 border-t">
                        Category Total:{" "}
                        <span className="font-medium">
                          ${breakdownTotal.toFixed(2)}
                        </span>
                      </div>
                    )}
                  </div>
                )}
              </div>
              </div>

              {/* Fixed Actions Footer */}
              <div className="flex-shrink-0 border-t bg-slate-50 px-6 py-4">
                <div className="flex items-center gap-3">
                  <Button
                    type="button"
                    variant="outline"
                    className="flex-1"
                    onClick={() => onOpenChange(false)}
                    disabled={isSubmitting}
                  >
                    Cancel
                  </Button>
                  <Button
                    type="button"
                    variant="secondary"
                    className="flex-1"
                    onClick={form.handleSubmit((v) => handleSave(v, false))}
                    disabled={isSubmitting}
                  >
                    {isSubmitting ? (
                      <Loader2 className="h-4 w-4 animate-spin" />
                    ) : (
                      <Save className="h-4 w-4 mr-2" />
                    )}
                    Save Draft
                  </Button>
                  <Button
                    type="button"
                    className="flex-1 bg-violet-600 hover:bg-violet-700"
                    onClick={form.handleSubmit((v) => handleSave(v, true))}
                    disabled={isSubmitting}
                  >
                    {isSubmitting ? (
                      <Loader2 className="h-4 w-4 animate-spin" />
                    ) : (
                      <Send className="h-4 w-4 mr-2" />
                    )}
                    Submit
                  </Button>
                </div>
              </div>
            </form>
          </Form>
        )}
      </DialogContent>
    </Dialog>
  );
}
