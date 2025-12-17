/**
 * BudgetOverview - Enterprise-grade unified budget analytics dashboard
 * Combines expenses and allocations in a single, cohesive interface
 */

import { useState } from "react";
import {
  Tabs,
  TabsContent,
  TabsList,
  TabsTrigger,
} from "@/shared/components/ui/tabs";
import { Badge } from "@/shared/components/ui/badge";
import { DollarSign, Wallet, TrendingUp, BarChart3 } from "lucide-react";
import BudgetSection from "./BudgetSection";
import { ExpenseList } from "./ExpenseList";
import { AllocationRequestList } from "./AllocationRequestList";
import type {
  ExpenseRequestWithRelations,
  AllocationRequestWithRelations,
} from "../types";

interface BudgetOverviewProps {
  expenses: ExpenseRequestWithRelations[];
  allocations: AllocationRequestWithRelations[];
  title?: string;
  description?: string;
  defaultView?: "expenses" | "allocations" | "combined";
  // Props for detailed lists
  showDetailedLists?: boolean;
  expenseListProps?: {
    isLoading?: boolean;
    userRole?: "admin" | "treasury" | "finance" | "requester";
    onRefresh?: () => void;
  };
  allocationListProps?: {
    isLoading?: boolean;
    userRole?: "admin" | "treasury" | "finance" | "requester";
    onRefresh?: () => void;
  };
}

const BudgetOverview = ({
  expenses,
  allocations,
  title = "Budget Overview",
  description = "Comprehensive view of your financial requests and allocations",
  defaultView = "combined",
  showDetailedLists = false,
  expenseListProps = {},
  allocationListProps = {},
}: BudgetOverviewProps) => {
  const [activeView, setActiveView] = useState(defaultView);

  // Filter out cancelled requests completely
  const activeExpenses = expenses.filter((e) => e.status !== "cancelled");
  const activeAllocations = allocations.filter((a) => a.status !== "cancelled");

  const hasExpenses = activeExpenses.length > 0;
  const hasAllocations = activeAllocations.length > 0;

  // Calculate quick stats (excluding cancelled requests)
  const expenseTotal = activeExpenses.reduce((sum, e) => sum + e.amount, 0);
  const allocationTotal = activeAllocations.reduce(
    (sum, a) => sum + a.requested_amount,
    0
  );
  const totalBudgetActivity = expenseTotal + allocationTotal;

  // Determine default tab based on available data
  const getDefaultTab = () => {
    if (defaultView === "combined") {
      return hasExpenses
        ? "expenses"
        : hasAllocations
        ? "allocations"
        : "expenses";
    }
    return defaultView;
  };

  return (
    <div className="space-y-6 sm:space-y-8">
      {/* Header with Summary Stats */}
      <div className="space-y-4 sm:space-y-6">
        <div className="flex flex-col md:flex-row md:items-start md:justify-between gap-4 sm:gap-6">
          <div className="space-y-1 sm:space-y-2">
            <h2 className="text-xl sm:text-2xl md:text-3xl font-bold tracking-tight flex items-center gap-2 sm:gap-3">
              <div className="p-1.5 sm:p-2 rounded-lg bg-primary/10">
                <BarChart3 className="h-5 w-5 sm:h-6 sm:w-6 text-primary" />
              </div>
              {title}
            </h2>
            <p className="text-sm sm:text-base md:text-lg text-muted-foreground">{description}</p>
          </div>

          {/* Quick Summary Cards */}
          <div className="grid grid-cols-2 sm:flex sm:flex-wrap gap-2 sm:gap-4">
            {hasExpenses && (
              <div className="bg-gradient-to-br from-blue-50 to-blue-100 dark:from-blue-950 dark:to-blue-900 rounded-xl sm:rounded-2xl px-3 sm:px-6 py-3 sm:py-4 border border-blue-200 dark:border-blue-800 shadow-sm">
                <div className="flex items-center gap-2 sm:gap-3">
                  <div className="p-1.5 sm:p-2 bg-blue-500 rounded-lg">
                    <DollarSign className="h-4 w-4 sm:h-5 sm:w-5 text-white" />
                  </div>
                  <div>
                    <p className="text-[10px] sm:text-xs text-blue-600 dark:text-blue-400 font-semibold uppercase tracking-wide">
                      Expenses
                    </p>
                    <p className="text-base sm:text-xl font-bold text-blue-900 dark:text-blue-100">
                      ${expenseTotal.toLocaleString()}
                    </p>
                  </div>
                </div>
              </div>
            )}

            {hasAllocations && (
              <div className="bg-gradient-to-br from-purple-50 to-purple-100 dark:from-purple-950 dark:to-purple-900 rounded-xl sm:rounded-2xl px-3 sm:px-6 py-3 sm:py-4 border border-purple-200 dark:border-purple-800 shadow-sm">
                <div className="flex items-center gap-2 sm:gap-3">
                  <div className="p-1.5 sm:p-2 bg-purple-500 rounded-lg">
                    <Wallet className="h-4 w-4 sm:h-5 sm:w-5 text-white" />
                  </div>
                  <div>
                    <p className="text-[10px] sm:text-xs text-purple-600 dark:text-purple-400 font-semibold uppercase tracking-wide">
                      Allocations
                    </p>
                    <p className="text-base sm:text-xl font-bold text-purple-900 dark:text-purple-100">
                      ${allocationTotal.toLocaleString()}
                    </p>
                  </div>
                </div>
              </div>
            )}

            {hasExpenses && hasAllocations && (
              <div className="col-span-2 sm:col-span-1 bg-gradient-to-br from-emerald-50 to-emerald-100 dark:from-emerald-950 dark:to-emerald-900 rounded-xl sm:rounded-2xl px-3 sm:px-6 py-3 sm:py-4 border border-emerald-200 dark:border-emerald-800 shadow-sm">
                <div className="flex items-center gap-2 sm:gap-3">
                  <div className="p-1.5 sm:p-2 bg-emerald-500 rounded-lg">
                    <TrendingUp className="h-4 w-4 sm:h-5 sm:w-5 text-white" />
                  </div>
                  <div>
                    <p className="text-[10px] sm:text-xs text-emerald-600 dark:text-emerald-400 font-semibold uppercase tracking-wide">
                      Total Activity
                    </p>
                    <p className="text-base sm:text-xl font-bold text-emerald-900 dark:text-emerald-100">
                      ${totalBudgetActivity.toLocaleString()}
                    </p>
                  </div>
                </div>
              </div>
            )}
          </div>
        </div>
      </div>

      {/* Tabbed Interface */}
      {hasExpenses || hasAllocations ? (
        <div className="space-y-4 sm:space-y-6">
          <Tabs
            defaultValue={getDefaultTab()}
            value={activeView !== "combined" ? activeView : undefined}
            onValueChange={(value) => setActiveView(value as typeof activeView)}
            className="w-full"
          >
            {/* Enhanced Tab Navigation */}
            <div className="flex flex-col space-y-3 sm:space-y-4">
              <div className="flex flex-col sm:flex-row sm:items-center sm:justify-between gap-3">
                <div>
                  <h3 className="text-base sm:text-lg font-semibold text-foreground">
                    Financial Overview
                  </h3>
                  <p className="text-xs sm:text-sm text-muted-foreground">
                    Breakdown by category
                  </p>
                </div>
                <TabsList className="inline-flex items-center justify-center rounded-xl sm:rounded-2xl bg-gradient-to-br from-muted/50 to-muted/30 p-1 shadow-lg border backdrop-blur-sm w-full sm:w-auto">
                  {hasExpenses && (
                    <TabsTrigger
                      value="expenses"
                      className="relative inline-flex items-center gap-1 sm:gap-2 px-3 sm:px-6 py-2 sm:py-3 rounded-lg sm:rounded-xl font-semibold text-xs sm:text-sm transition-all duration-200 data-[state=active]:bg-white data-[state=active]:text-primary data-[state=active]:shadow-lg data-[state=active]:shadow-primary/20 hover:bg-white/50 flex-1 sm:flex-none justify-center"
                    >
                      <div className="flex items-center gap-1 sm:gap-2">
                        <div className="p-1 sm:p-1.5 rounded-lg bg-blue-500/10 text-blue-600">
                          <DollarSign className="h-3 w-3 sm:h-4 sm:w-4" />
                        </div>
                        <span className="hidden xs:inline">Expenses</span>
                        <span className="xs:hidden">Exp</span>
                        <Badge
                          variant="secondary"
                          className="ml-0.5 sm:ml-1 bg-blue-100 text-blue-700 border-0 px-1.5 sm:px-2 py-0.5 text-[10px] sm:text-xs font-bold"
                        >
                          {activeExpenses.length}
                        </Badge>
                      </div>
                    </TabsTrigger>
                  )}
                  {hasAllocations && (
                    <TabsTrigger
                      value="allocations"
                      className="relative inline-flex items-center gap-1 sm:gap-2 px-3 sm:px-6 py-2 sm:py-3 rounded-lg sm:rounded-xl font-semibold text-xs sm:text-sm transition-all duration-200 data-[state=active]:bg-white data-[state=active]:text-primary data-[state=active]:shadow-lg data-[state=active]:shadow-primary/20 hover:bg-white/50 flex-1 sm:flex-none justify-center"
                    >
                      <div className="flex items-center gap-1 sm:gap-2">
                        <div className="p-1 sm:p-1.5 rounded-lg bg-purple-500/10 text-purple-600">
                          <Wallet className="h-3 w-3 sm:h-4 sm:w-4" />
                        </div>
                        <span className="hidden xs:inline">Allocations</span>
                        <span className="xs:hidden">Alloc</span>
                        <Badge
                          variant="secondary"
                          className="ml-0.5 sm:ml-1 bg-purple-100 text-purple-700 border-0 px-1.5 sm:px-2 py-0.5 text-[10px] sm:text-xs font-bold"
                        >
                          {activeAllocations.length}
                        </Badge>
                      </div>
                    </TabsTrigger>
                  )}
                </TabsList>
              </div>

              {/* Tab Content with Enhanced Styling */}
              <div className="relative">
                <div className="absolute inset-0 bg-gradient-to-r from-blue-50/30 via-purple-50/30 to-emerald-50/30 rounded-xl sm:rounded-2xl blur-3xl opacity-60" />
                <div className="relative bg-white/80 backdrop-blur-sm border border-white/20 rounded-xl sm:rounded-2xl shadow-xl p-3 sm:p-6">
                  {/* Tab Content */}
                  <div className="space-y-3 sm:space-y-4">
                    {/* Expense Tab */}
                    {hasExpenses && (
                      <TabsContent value="expenses" className="mt-0">
                        <div className="space-y-6 sm:space-y-8">
                          <BudgetSection
                            type="expenses"
                            data={activeExpenses}
                            showHeader={false}
                          />

                          {/* Detailed Expense List */}
                          {showDetailedLists && (
                            <div>
                              <h3 className="text-base sm:text-xl font-semibold mb-3 sm:mb-4 flex items-center gap-2">
                                <DollarSign className="h-4 w-4 sm:h-5 sm:w-5" />
                                All Expense Requests
                              </h3>
                              <ExpenseList
                                expenses={activeExpenses}
                                isLoading={expenseListProps.isLoading || false}
                                userRole={expenseListProps.userRole || "admin"}
                                onRefresh={
                                  expenseListProps.onRefresh || (() => {})
                                }
                              />
                            </div>
                          )}
                        </div>
                      </TabsContent>
                    )}

                    {/* Allocation Tab */}
                    {hasAllocations && (
                      <TabsContent value="allocations" className="mt-0">
                        <div className="space-y-6 sm:space-y-8">
                          <BudgetSection
                            type="allocations"
                            data={activeAllocations}
                            showHeader={false}
                          />

                          {/* Detailed Allocation List */}
                          {showDetailedLists && (
                            <div>
                              <h3 className="text-base sm:text-xl font-semibold mb-3 sm:mb-4 flex items-center gap-2">
                                <Wallet className="h-4 w-4 sm:h-5 sm:w-5" />
                                All Budget Requests
                              </h3>
                              <AllocationRequestList
                                requests={activeAllocations}
                                isLoading={
                                  allocationListProps.isLoading || false
                                }
                                userRole={
                                  allocationListProps.userRole || "requester"
                                }
                                onRefresh={
                                  allocationListProps.onRefresh || (() => {})
                                }
                              />
                            </div>
                          )}
                        </div>
                      </TabsContent>
                    )}
                  </div>
                </div>
              </div>
            </div>
          </Tabs>
        </div>
      ) : (
        // Empty state
        <div className="text-center py-8 sm:py-16 bg-muted/30 rounded-xl sm:rounded-2xl border border-dashed">
          <div className="space-y-3 sm:space-y-4">
            <div className="mx-auto w-12 h-12 sm:w-16 sm:h-16 bg-muted/50 rounded-full flex items-center justify-center">
              <BarChart3 className="h-6 w-6 sm:h-8 sm:w-8 text-muted-foreground" />
            </div>
            <div>
              <h3 className="text-lg sm:text-xl font-semibold mb-2">No Budget Activity</h3>
              <p className="text-sm sm:text-base text-muted-foreground">
                Start by creating an expense request or budget allocation
              </p>
            </div>
          </div>
        </div>
      )}
    </div>
  );
};

export default BudgetOverview;
