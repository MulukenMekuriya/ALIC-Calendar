/**
 * MonthlyBudgetSummary - Admin view for consolidated monthly budget requests
 * Shows all ministries with their monthly budget breakdown in a professional format
 *
 * Annual requests are counted too. They carry no month-by-month split, so
 * their requested amount sits in its own Annual column and in the totals.
 * Until 24 Oct 2026 they were filtered out, and the summary read "5
 * Ministries" while 8 had submitted (Teaching & Discipleship, Deacons and Ha
 * Choir filed annual).
 */

import {
  Card,
  CardContent,
  CardDescription,
  CardHeader,
  CardTitle,
} from "@/shared/components/ui/card";
import { Badge } from "@/shared/components/ui/badge";
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from "@/shared/components/ui/table";
import {
  Tooltip,
  TooltipContent,
  TooltipProvider,
  TooltipTrigger,
} from "@/shared/components/ui/tooltip";
import { Calendar, TrendingUp, Building2, DollarSign } from "lucide-react";
import type { AllocationRequestWithRelations } from "../types";

const MONTH_LABELS = ["Jan", "Feb", "Mar", "Apr", "May", "Jun", "Jul", "Aug", "Sep", "Oct", "Nov", "Dec"];
const MONTH_KEYS = ["jan", "feb", "mar", "apr", "may", "jun", "jul", "aug", "sep", "oct", "nov", "dec"] as const;

interface MonthlyData {
  jan?: number;
  feb?: number;
  mar?: number;
  apr?: number;
  may?: number;
  jun?: number;
  jul?: number;
  aug?: number;
  sep?: number;
  oct?: number;
  nov?: number;
  dec?: number;
}

interface BudgetBreakdownItem {
  category: string;
  description: string;
  amount: number;
  monthly_data?: MonthlyData & {
    chart_of_accounts?: string;
    description?: string;
  };
}

interface MinistryMonthlyData {
  ministryName: string;
  ministryId: string;
  requests: {
    requestId: string;
    status: string;
    requesterName: string;
    items: BudgetBreakdownItem[];
  }[];
  monthlyTotals: number[];
  /** Requested amount of annual requests, which have no monthly split. */
  annualTotal: number;
  grandTotal: number;
}

interface MonthlyBudgetSummaryProps {
  allocations: AllocationRequestWithRelations[];
  title?: string;
  description?: string;
}

export function MonthlyBudgetSummary({
  allocations,
  title = "Monthly Budget Summary",
  description = "Consolidated view of all ministry monthly budget requests",
}: MonthlyBudgetSummaryProps) {
  const summarised = allocations.filter((a) => a.status !== "cancelled");

  if (summarised.length === 0) {
    return null;
  }

  // Group by ministry and aggregate monthly data
  const ministryDataMap = new Map<string, MinistryMonthlyData>();

  summarised.forEach((allocation) => {
    const ministryId = allocation.ministry_id;
    const ministryName = allocation.ministry?.name || "Unknown Ministry";
    const breakdown = (allocation.budget_breakdown as BudgetBreakdownItem[]) || [];
    const isMonthly = allocation.period_type === "monthly";
    const monthlyItems = isMonthly
      ? breakdown.filter((item) => item.category === "monthly_budget_item")
      : [];

    if (!ministryDataMap.has(ministryId)) {
      ministryDataMap.set(ministryId, {
        ministryName,
        ministryId,
        requests: [],
        monthlyTotals: new Array(12).fill(0),
        annualTotal: 0,
        grandTotal: 0,
      });
    }

    const ministryData = ministryDataMap.get(ministryId)!;

    // Add request data
    ministryData.requests.push({
      requestId: allocation.id,
      status: allocation.status,
      requesterName: allocation.requester_name,
      items: isMonthly ? monthlyItems : breakdown,
    });

    if (!isMonthly) {
      const amount = Number(allocation.requested_amount) || 0;
      ministryData.annualTotal += amount;
      ministryData.grandTotal += amount;
      return;
    }

    // Aggregate monthly totals from all items in this request
    monthlyItems.forEach((item) => {
      if (item.monthly_data) {
        MONTH_KEYS.forEach((monthKey, index) => {
          const value = item.monthly_data?.[monthKey] || 0;
          ministryData.monthlyTotals[index] += value;
          ministryData.grandTotal += value;
        });
      }
    });
  });

  // Convert to array and sort by total amount
  const ministryDataList = Array.from(ministryDataMap.values()).sort(
    (a, b) => b.grandTotal - a.grandTotal
  );

  // Calculate overall totals
  const overallMonthlyTotals = new Array(12).fill(0);
  let overallAnnualTotal = 0;
  let overallGrandTotal = 0;

  ministryDataList.forEach((ministry) => {
    ministry.monthlyTotals.forEach((total, index) => {
      overallMonthlyTotals[index] += total;
    });
    overallAnnualTotal += ministry.annualTotal;
    overallGrandTotal += ministry.grandTotal;
  });
  const hasAnnual = overallAnnualTotal > 0;

  // Find highest month for highlighting
  const maxMonthIndex = overallMonthlyTotals.indexOf(Math.max(...overallMonthlyTotals));

  // Status badge styling
  const getStatusBadge = (status: string) => {
    const statusConfig: Record<string, { variant: "default" | "secondary" | "destructive" | "outline"; label: string }> = {
      draft: { variant: "secondary", label: "Draft" },
      pending: { variant: "outline", label: "Pending" },
      approved: { variant: "default", label: "Approved" },
      partially_approved: { variant: "default", label: "Partial" },
      denied: { variant: "destructive", label: "Denied" },
    };
    const config = statusConfig[status] || { variant: "secondary", label: status };
    return <Badge variant={config.variant}>{config.label}</Badge>;
  };

  // Format currency
  const formatCurrency = (amount: number) => {
    if (amount === 0) return "-";
    return `$${amount.toLocaleString()}`;
  };

  return (
    <Card>
      <CardHeader className="pb-4">
        <div className="flex items-center justify-between">
          <div className="flex items-center gap-3">
            <div className="p-2 bg-primary/10 rounded-lg">
              <Calendar className="h-5 w-5 text-primary" />
            </div>
            <div>
              <CardTitle className="text-lg">{title}</CardTitle>
              <CardDescription>{description}</CardDescription>
            </div>
          </div>
          <div className="flex items-center gap-4 text-sm">
            <div className="flex items-center gap-2">
              <Building2 className="h-4 w-4 text-muted-foreground" />
              <span className="text-muted-foreground">
                {ministryDataList.length} {ministryDataList.length === 1 ? "Ministry" : "Ministries"}
              </span>
            </div>
            <div className="flex items-center gap-2">
              <DollarSign className="h-4 w-4 text-emerald-600" />
              <span className="font-semibold text-emerald-600">
                ${overallGrandTotal.toLocaleString()}
              </span>
            </div>
          </div>
        </div>
      </CardHeader>
      <CardContent className="p-0">
        <div className="overflow-x-auto">
          <Table>
            <TableHeader>
              <TableRow className="bg-muted/50">
                <TableHead className="font-semibold min-w-[200px] sticky left-0 bg-muted/50">
                  Ministry
                </TableHead>
                {MONTH_LABELS.map((month, index) => (
                  <TableHead
                    key={month}
                    className={`text-right font-semibold min-w-[80px] ${
                      index === maxMonthIndex ? "bg-emerald-50 text-emerald-700" : ""
                    }`}
                  >
                    {month}
                  </TableHead>
                ))}
                {hasAnnual && (
                  <TableHead
                    className="text-right font-semibold min-w-[90px]"
                    title="Requests filed as annual, with no month-by-month split"
                  >
                    Annual
                  </TableHead>
                )}
                <TableHead className="text-right font-semibold min-w-[100px] bg-primary/5">
                  Total
                </TableHead>
              </TableRow>
            </TableHeader>
            <TableBody>
              {ministryDataList.map((ministry) => (
                <TooltipProvider key={ministry.ministryId}>
                  <Tooltip>
                    <TooltipTrigger asChild>
                      <TableRow className="hover:bg-muted/30 cursor-pointer">
                        <TableCell className="font-medium sticky left-0 bg-white">
                          <div className="flex flex-col">
                            <span className="truncate max-w-[180px]">{ministry.ministryName}</span>
                            <span className="text-xs text-muted-foreground">
                              {ministry.requests.length} {ministry.requests.length === 1 ? "request" : "requests"}
                            </span>
                          </div>
                        </TableCell>
                        {ministry.monthlyTotals.map((total, index) => (
                          <TableCell
                            key={index}
                            className={`text-right tabular-nums ${
                              index === maxMonthIndex && total > 0 ? "bg-emerald-50" : ""
                            } ${total === 0 ? "text-muted-foreground" : ""}`}
                          >
                            {formatCurrency(total)}
                          </TableCell>
                        ))}
                        {hasAnnual && (
                          <TableCell
                            className={`text-right tabular-nums ${
                              ministry.annualTotal === 0 ? "text-muted-foreground" : ""
                            }`}
                          >
                            {formatCurrency(ministry.annualTotal)}
                          </TableCell>
                        )}
                        <TableCell className="text-right font-semibold tabular-nums bg-primary/5 text-primary">
                          ${ministry.grandTotal.toLocaleString()}
                        </TableCell>
                      </TableRow>
                    </TooltipTrigger>
                    <TooltipContent side="bottom" className="max-w-md">
                      <div className="space-y-2">
                        <p className="font-semibold">{ministry.ministryName}</p>
                        <div className="space-y-1">
                          {ministry.requests.map((req) => (
                            <div key={req.requestId} className="flex items-center gap-2 text-sm">
                              {getStatusBadge(req.status)}
                              <span>{req.requesterName}</span>
                              <span className="text-muted-foreground">
                                ({req.items.length} items)
                              </span>
                            </div>
                          ))}
                        </div>
                      </div>
                    </TooltipContent>
                  </Tooltip>
                </TooltipProvider>
              ))}

              {/* Totals Row */}
              <TableRow className="bg-muted/70 font-bold border-t-2">
                <TableCell className="sticky left-0 bg-muted/70">
                  <div className="flex items-center gap-2">
                    <TrendingUp className="h-4 w-4 text-primary" />
                    <span>Total</span>
                  </div>
                </TableCell>
                {overallMonthlyTotals.map((total, index) => (
                  <TableCell
                    key={index}
                    className={`text-right tabular-nums ${
                      index === maxMonthIndex ? "bg-emerald-100 text-emerald-700" : ""
                    }`}
                  >
                    {formatCurrency(total)}
                  </TableCell>
                ))}
                {hasAnnual && (
                  <TableCell className="text-right tabular-nums">
                    {formatCurrency(overallAnnualTotal)}
                  </TableCell>
                )}
                <TableCell className="text-right tabular-nums bg-primary/10 text-primary text-lg">
                  ${overallGrandTotal.toLocaleString()}
                </TableCell>
              </TableRow>
            </TableBody>
          </Table>
        </div>

        {/* Summary Stats */}
        <div className="grid grid-cols-2 md:grid-cols-4 gap-4 p-4 border-t bg-muted/20">
          <div className="text-center">
            <p className="text-2xl font-bold text-primary">{ministryDataList.length}</p>
            <p className="text-xs text-muted-foreground uppercase tracking-wide">Ministries</p>
          </div>
          <div className="text-center">
            <p className="text-2xl font-bold text-primary">
              {ministryDataList.reduce((sum, m) => sum + m.requests.length, 0)}
            </p>
            <p className="text-xs text-muted-foreground uppercase tracking-wide">Requests</p>
          </div>
          <div className="text-center">
            <p className="text-2xl font-bold text-emerald-600">
              ${Math.round(overallGrandTotal / 12).toLocaleString()}
            </p>
            <p className="text-xs text-muted-foreground uppercase tracking-wide">Avg/Month</p>
          </div>
          <div className="text-center">
            <p className="text-2xl font-bold text-emerald-600">
              ${overallGrandTotal.toLocaleString()}
            </p>
            <p className="text-xs text-muted-foreground uppercase tracking-wide">Total Budget</p>
          </div>
        </div>
      </CardContent>
    </Card>
  );
}

export default MonthlyBudgetSummary;
