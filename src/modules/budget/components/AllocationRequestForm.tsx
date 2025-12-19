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
  DialogDescription,
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
import {
  getJustificationsForMinistry,
  OTHER_JUSTIFICATION_VALUE,
  OTHER_JUSTIFICATION_LABEL,
} from "../constants/ministryJustifications";

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

// Monthly item schema with justification and month-by-month allocation
const monthlyItemSchema = z.object({
  justification_category: z.string().min(1, "Justification is required"),
  custom_justification: z.string().optional(),
  chart_of_accounts: z.string().optional(),
  description: z.string().optional(),
  // budget_amount is calculated from sum of months, stored for reference
  jan: z.coerce.number().min(0).optional(),
  feb: z.coerce.number().min(0).optional(),
  mar: z.coerce.number().min(0).optional(),
  apr: z.coerce.number().min(0).optional(),
  may: z.coerce.number().min(0).optional(),
  jun: z.coerce.number().min(0).optional(),
  jul: z.coerce.number().min(0).optional(),
  aug: z.coerce.number().min(0).optional(),
  sep: z.coerce.number().min(0).optional(),
  oct: z.coerce.number().min(0).optional(),
  nov: z.coerce.number().min(0).optional(),
  dec: z.coerce.number().min(0).optional(),
});

// Month keys for iteration
const MONTH_KEYS = ["jan", "feb", "mar", "apr", "may", "jun", "jul", "aug", "sep", "oct", "nov", "dec"] as const;
const MONTH_LABELS = ["Jan", "Feb", "Mar", "Apr", "May", "Jun", "Jul", "Aug", "Sep", "Oct", "Nov", "Dec"];

const allocationRequestFormSchema = z.object({
  ministry_id: z.string().min(1, "Ministry is required"),
  period_type: z.enum(["annual", "quarterly", "monthly"]),
  annual_amount: z.coerce.number().min(0).optional(),
  period_amounts: z.array(periodAmountSchema).optional(),
  monthly_items: z.array(monthlyItemSchema).optional(),
  justification: z.string().optional(), // Optional for monthly (justification is in the spreadsheet)
  budget_breakdown: z.array(breakdownItemSchema).optional(),
}).refine((data) => {
  // Justification is required for annual/quarterly, but not for monthly
  if (data.period_type !== "monthly") {
    return data.justification && data.justification.length >= 10;
  }
  return true;
}, {
  message: "Please provide at least 10 characters",
  path: ["justification"],
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
      ministry_id: "",
      period_type: "annual",
      annual_amount: 0,
      period_amounts: [],
      monthly_items: [{ justification_category: "", custom_justification: "", chart_of_accounts: "", description: "", jan: 0, feb: 0, mar: 0, apr: 0, may: 0, jun: 0, jul: 0, aug: 0, sep: 0, oct: 0, nov: 0, dec: 0 }],
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

  const {
    fields: monthlyItemFields,
    append: appendMonthlyItem,
    remove: removeMonthlyItem,
  } = useFieldArray({
    control: form.control,
    name: "monthly_items",
  });

  const periodType = form.watch("period_type");
  const periodAmounts = form.watch("period_amounts") || [];
  const monthlyItems = form.watch("monthly_items") || [];
  const annualAmount = form.watch("annual_amount") || 0;

  const userMinistry = ministries?.find(
    (m) => m.name.toLowerCase() === profile?.ministry_name?.toLowerCase()
  );

  const selectedMinistryId = form.watch("ministry_id");
  const selectedMinistry = ministries?.find((m) => m.id === selectedMinistryId);

  // Get justification options for the selected ministry
  const justificationOptions = selectedMinistry
    ? getJustificationsForMinistry(selectedMinistry.name)
    : [];

  // Calculate totals
  const periodAmountsTotal = periodAmounts.reduce(
    (sum, pa) => sum + Number(pa.amount || 0),
    0
  );
  // Calculate monthly items total by summing all month values for each item
  const monthlyItemsTotal = monthlyItems.reduce((sum, item) => {
    const itemTotal = MONTH_KEYS.reduce((monthSum, month) => {
      return monthSum + Number(item[month] || 0);
    }, 0);
    return sum + itemTotal;
  }, 0);
  const totalAmount =
    periodType === "annual"
      ? annualAmount
      : periodType === "monthly"
        ? monthlyItemsTotal
        : periodAmountsTotal;

  const breakdownTotal = breakdownFields.reduce((sum, _, index) => {
    const amount = form.watch(`budget_breakdown.${index}.amount`) || 0;
    return sum + Number(amount);
  }, 0);

  // Set default ministry when user's ministry is available
  useEffect(() => {
    if (userMinistry && !form.getValues("ministry_id")) {
      form.setValue("ministry_id", userMinistry.id);
    }
  }, [userMinistry, form]);

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

    if (!values.ministry_id) {
      toast({
        title: "Error",
        description: "Please select a ministry.",
        variant: "destructive",
      });
      return;
    }

    let finalAmount = 0;
    if (values.period_type === "annual") {
      finalAmount = values.annual_amount || 0;
    } else if (values.period_type === "monthly") {
      // Calculate total from monthly items (sum of all month values)
      finalAmount = (values.monthly_items || []).reduce((sum, item) => {
        const itemTotal = MONTH_KEYS.reduce((monthSum, month) => {
          return monthSum + Number(item[month] || 0);
        }, 0);
        return sum + itemTotal;
      }, 0);
    } else {
      // Quarterly
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

    // Prepare period amounts for quarterly requests
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

    // For monthly, convert monthly_items to budget_breakdown format
    const monthlyItemsAsBreakdown = values.period_type === "monthly"
      ? (values.monthly_items || []).map((item) => {
          const itemTotal = MONTH_KEYS.reduce((sum, month) => sum + Number(item[month] || 0), 0);
          const justification = item.justification_category === OTHER_JUSTIFICATION_VALUE
            ? item.custom_justification
            : item.justification_category;
          return {
            category: "monthly_budget_item",
            description: justification || "",
            amount: itemTotal,
            // Store full monthly item data for detailed view
            monthly_data: {
              chart_of_accounts: item.chart_of_accounts,
              description: item.description,
              jan: item.jan, feb: item.feb, mar: item.mar, apr: item.apr,
              may: item.may, jun: item.jun, jul: item.jul, aug: item.aug,
              sep: item.sep, oct: item.oct, nov: item.nov, dec: item.dec,
            },
          };
        })
      : [];

    const combinedBreakdown = [
      ...periodAmountsAsBreakdown,
      ...monthlyItemsAsBreakdown,
      ...((values.budget_breakdown as BudgetBreakdownItem[]) || []),
    ];

    // For monthly requests, create a summary justification from the items
    const finalJustification = values.period_type === "monthly"
      ? (values.monthly_items || [])
          .map((item) => {
            const justification = item.justification_category === OTHER_JUSTIFICATION_VALUE
              ? item.custom_justification
              : item.justification_category;
            const itemTotal = MONTH_KEYS.reduce((sum, month) => sum + Number(item[month] || 0), 0);
            return `${justification}: $${itemTotal.toLocaleString()}`;
          })
          .join("; ") || "Monthly budget request"
      : values.justification || "";

    setIsSubmitting(true);

    try {
      if (isEditing && request) {
        await updateRequest.mutateAsync({
          requestId: request.id,
          data: {
            period_type: values.period_type,
            requested_amount: finalAmount,
            justification: finalJustification,
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
            ministry_id: values.ministry_id,
            requester_id: user.id,
            requester_name: profile?.full_name || "Unknown",
            period_type: values.period_type,
            requested_amount: finalAmount,
            justification: finalJustification,
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
            <DialogDescription>
              Please contact an administrator to set up a fiscal year.
            </DialogDescription>
          </DialogHeader>
          <Button onClick={() => onOpenChange(false)} className="mt-4">
            Close
          </Button>
        </DialogContent>
      </Dialog>
    );
  }

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="sm:max-w-[95vw] lg:max-w-[1200px] max-h-[90vh] overflow-hidden p-0 flex flex-col">
        {/* Header */}
        <div className="flex-shrink-0 bg-gradient-to-r from-violet-600 to-indigo-600 px-6 py-5 text-white">
          <DialogTitle className="text-xl font-semibold">
            {isEditing
              ? "Edit Budget Request"
              : "Budget Request"}
          </DialogTitle>
          <DialogDescription className="sr-only">
            {isEditing ? "Edit an existing budget request" : "Create a new budget request for your ministry"}
          </DialogDescription>
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
          </div>
        </div>

        {isLoading ? (
          <div className="flex items-center justify-center py-16">
            <Loader2 className="h-8 w-8 animate-spin text-muted-foreground" />
          </div>
        ) : (
          <Form {...form}>
            <form className="flex flex-col flex-1 overflow-hidden">
              {/* Scrollable Content */}
              <div className="flex-1 overflow-y-auto p-6 space-y-6">
              {/* Ministry Selection */}
              <FormField
                control={form.control}
                name="ministry_id"
                render={({ field }) => (
                  <FormItem>
                    <FormLabel className="text-xs uppercase tracking-wide text-muted-foreground">
                      Ministry
                    </FormLabel>
                    <Select
                      onValueChange={field.onChange}
                      value={field.value}
                    >
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

              {/* Period Type Toggle */}
              <div>
                <FormLabel className="text-xs uppercase tracking-wide text-muted-foreground mb-3 block">
                  Allocation Period
                </FormLabel>
                <div className="grid grid-cols-3 gap-2">
                  {(["annual", "quarterly", "monthly"] as const).map((type) => {
                    const isDisabled = type === "quarterly";
                    return (
                      <button
                        key={type}
                        type="button"
                        disabled={isDisabled}
                        onClick={() => form.setValue("period_type", type)}
                        className={`
                          py-3 px-4 rounded-lg border-2 text-sm font-medium transition-all
                          ${
                            isDisabled
                              ? "border-gray-100 bg-gray-50 text-gray-400 cursor-not-allowed"
                              : periodType === type
                                ? "border-violet-500 bg-violet-50 text-violet-700"
                                : "border-gray-200 hover:border-gray-300 text-gray-600"
                          }
                        `}
                      >
                        {type.charAt(0).toUpperCase() + type.slice(1)}
                      </button>
                    );
                  })}
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
                  <div className="space-y-4">
                    <div className="flex items-center justify-between">
                      <span className="text-sm font-medium text-slate-600">
                        Monthly Budget Breakdown
                      </span>
                      <Button
                        type="button"
                        variant="outline"
                        size="sm"
                        className="h-8 text-xs border-violet-200 text-violet-600 hover:bg-violet-50"
                        onClick={() =>
                          appendMonthlyItem({
                            justification_category: "",
                            custom_justification: "",
                            chart_of_accounts: "",
                            description: "",
                            jan: 0, feb: 0, mar: 0, apr: 0, may: 0, jun: 0,
                            jul: 0, aug: 0, sep: 0, oct: 0, nov: 0, dec: 0,
                          })
                        }
                      >
                        <Plus className="h-3.5 w-3.5 mr-1" />
                        Add Item
                      </Button>
                    </div>

                    {/* Monthly items - spreadsheet style */}
                    <div className="bg-white rounded-xl border border-slate-200 overflow-x-auto">
                      {/* Header row */}
                      <div className="bg-slate-50 border-b border-slate-200 px-3 py-2 grid grid-cols-[minmax(180px,1fr),80px,120px,80px,repeat(12,55px),40px] gap-1 text-[10px] font-semibold text-slate-500 uppercase tracking-wider min-w-[1100px]">
                        <div>Justification</div>
                        <div>Acct #</div>
                        <div>Description</div>
                        <div className="text-right">Budget</div>
                        {MONTH_LABELS.map((month) => (
                          <div key={month} className="text-center">{month}</div>
                        ))}
                        <div></div>
                      </div>

                      {/* Data rows */}
                      {monthlyItemFields.map((field, index) => {
                        const selectedCategory = form.watch(`monthly_items.${index}.justification_category`);
                        const isOther = selectedCategory === OTHER_JUSTIFICATION_VALUE;

                        // Calculate row total from month values (auto-sum for Budget)
                        const rowBudgetTotal = MONTH_KEYS.reduce((sum, month) => {
                          const val = form.watch(`monthly_items.${index}.${month}`) || 0;
                          return sum + Number(val);
                        }, 0);

                        return (
                          <div key={field.id} className="border-b border-slate-100 last:border-b-0">
                            <div className="px-3 py-2 grid grid-cols-[minmax(180px,1fr),80px,120px,80px,repeat(12,55px),40px] gap-1 items-center min-w-[1100px]">
                              {/* Justification */}
                              <div>
                                <FormField
                                  control={form.control}
                                  name={`monthly_items.${index}.justification_category`}
                                  render={({ field }) => (
                                    <Select
                                      onValueChange={field.onChange}
                                      value={field.value}
                                      disabled={!selectedMinistryId}
                                    >
                                      <SelectTrigger className="h-8 text-xs border-slate-200">
                                        <SelectValue placeholder="Select justification" />
                                      </SelectTrigger>
                                      <SelectContent>
                                        {justificationOptions.map((option) => (
                                          <SelectItem key={option} value={option} className="text-xs">
                                            {option}
                                          </SelectItem>
                                        ))}
                                        <SelectItem value={OTHER_JUSTIFICATION_VALUE} className="text-xs">
                                          {OTHER_JUSTIFICATION_LABEL}
                                        </SelectItem>
                                      </SelectContent>
                                    </Select>
                                  )}
                                />
                              </div>

                              {/* Chart of Accounts */}
                              <div>
                                <FormField
                                  control={form.control}
                                  name={`monthly_items.${index}.chart_of_accounts`}
                                  render={({ field }) => (
                                    <Input
                                      placeholder="e.g. 53130"
                                      className="h-8 text-xs border-slate-200"
                                      {...field}
                                    />
                                  )}
                                />
                              </div>

                              {/* Description */}
                              <div>
                                <FormField
                                  control={form.control}
                                  name={`monthly_items.${index}.description`}
                                  render={({ field }) => (
                                    <Input
                                      placeholder="Description"
                                      className="h-8 text-xs border-slate-200"
                                      {...field}
                                    />
                                  )}
                                />
                              </div>

                              {/* Budget Amount (Auto-calculated) */}
                              <div className="bg-slate-50 rounded px-2 py-1 text-right">
                                <span className="text-xs font-semibold text-slate-700">
                                  ${rowBudgetTotal.toLocaleString("en-US", { minimumFractionDigits: 2 })}
                                </span>
                              </div>

                              {/* Month columns */}
                              {MONTH_KEYS.map((month) => (
                                <div key={month}>
                                  <FormField
                                    control={form.control}
                                    name={`monthly_items.${index}.${month}`}
                                    render={({ field }) => (
                                      <Input
                                        type="number"
                                        step="0.01"
                                        min="0"
                                        placeholder=""
                                        className="h-8 px-1 text-[10px] text-center border-slate-200 [appearance:textfield] [&::-webkit-outer-spin-button]:appearance-none [&::-webkit-inner-spin-button]:appearance-none"
                                        {...field}
                                        value={field.value || ""}
                                      />
                                    )}
                                  />
                                </div>
                              ))}

                              {/* Delete button */}
                              <div className="flex justify-center">
                                {monthlyItemFields.length > 1 && (
                                  <Button
                                    type="button"
                                    variant="ghost"
                                    size="icon"
                                    className="h-7 w-7 text-red-400 hover:text-red-600 hover:bg-red-50"
                                    onClick={() => removeMonthlyItem(index)}
                                  >
                                    <Trash2 className="h-3.5 w-3.5" />
                                  </Button>
                                )}
                              </div>
                            </div>

                            {/* Custom justification row when "Other" is selected */}
                            {isOther && (
                              <div className="px-3 pb-2">
                                <FormField
                                  control={form.control}
                                  name={`monthly_items.${index}.custom_justification`}
                                  render={({ field }) => (
                                    <Input
                                      placeholder="Specify task/justification..."
                                      className="h-8 text-xs border-slate-200"
                                      {...field}
                                    />
                                  )}
                                />
                              </div>
                            )}

                          </div>
                        );
                      })}

                      {/* Total row */}
                      <div className="bg-gradient-to-r from-violet-50 to-indigo-50 border-t-2 border-violet-200 px-3 py-3 grid grid-cols-[minmax(180px,1fr),80px,120px,80px,repeat(12,55px),40px] gap-1 items-center min-w-[1100px]">
                        <div className="text-sm font-semibold text-slate-700">Total</div>
                        <div></div>
                        <div></div>
                        <div className="text-right text-sm font-bold text-violet-700">
                          ${monthlyItemsTotal.toLocaleString("en-US", { minimumFractionDigits: 2 })}
                        </div>
                        {MONTH_KEYS.map((month) => {
                          const monthTotal = monthlyItems.reduce((sum, item) => {
                            return sum + Number(item[month] || 0);
                          }, 0);
                          return (
                            <div key={month} className="text-center text-[10px] font-medium text-slate-600">
                              {monthTotal > 0 ? `$${monthTotal.toLocaleString()}` : ""}
                            </div>
                          );
                        })}
                        <div></div>
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

              {periodType !== "monthly" && (
                <>
                  <Separator />

                  {/* Justification - hidden for monthly since it's in the spreadsheet */}
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
                </>
              )}

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
