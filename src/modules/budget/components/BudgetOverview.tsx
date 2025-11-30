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
}

const BudgetOverview = ({
  expenses,
  allocations,
  title = "Budget Overview",
  description = "Comprehensive view of your financial requests and allocations",
  defaultView = "combined",
}: BudgetOverviewProps) => {
  const [activeView, setActiveView] = useState(defaultView);

  const hasExpenses = expenses.length > 0;
  const hasAllocations = allocations.length > 0;

  // Calculate quick stats
  const expenseTotal = expenses.reduce((sum, e) => sum + e.amount, 0);
  const allocationTotal = allocations.reduce(
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
    <div className="space-y-8">
      {/* Header with Summary Stats */}
      <div className="space-y-6">
        <div className="flex flex-col md:flex-row md:items-start md:justify-between gap-6">
          <div className="space-y-2">
            <h2 className="text-3xl font-bold tracking-tight flex items-center gap-3">
              <div className="p-2 rounded-lg bg-primary/10">
                <BarChart3 className="h-6 w-6 text-primary" />
              </div>
              {title}
            </h2>
            <p className="text-muted-foreground text-lg">{description}</p>
          </div>

          {/* Quick Summary Cards */}
          <div className="flex flex-wrap gap-4">
            {hasExpenses && (
              <div className="bg-gradient-to-br from-blue-50 to-blue-100 dark:from-blue-950 dark:to-blue-900 rounded-2xl px-6 py-4 border border-blue-200 dark:border-blue-800 shadow-sm">
                <div className="flex items-center gap-3">
                  <div className="p-2 bg-blue-500 rounded-lg">
                    <DollarSign className="h-5 w-5 text-white" />
                  </div>
                  <div>
                    <p className="text-xs text-blue-600 dark:text-blue-400 font-semibold uppercase tracking-wide">
                      Expenses
                    </p>
                    <p className="text-xl font-bold text-blue-900 dark:text-blue-100">
                      ${expenseTotal.toLocaleString()}
                    </p>
                  </div>
                </div>
              </div>
            )}

            {hasAllocations && (
              <div className="bg-gradient-to-br from-purple-50 to-purple-100 dark:from-purple-950 dark:to-purple-900 rounded-2xl px-6 py-4 border border-purple-200 dark:border-purple-800 shadow-sm">
                <div className="flex items-center gap-3">
                  <div className="p-2 bg-purple-500 rounded-lg">
                    <Wallet className="h-5 w-5 text-white" />
                  </div>
                  <div>
                    <p className="text-xs text-purple-600 dark:text-purple-400 font-semibold uppercase tracking-wide">
                      Allocations
                    </p>
                    <p className="text-xl font-bold text-purple-900 dark:text-purple-100">
                      ${allocationTotal.toLocaleString()}
                    </p>
                  </div>
                </div>
              </div>
            )}

            {hasExpenses && hasAllocations && (
              <div className="bg-gradient-to-br from-emerald-50 to-emerald-100 dark:from-emerald-950 dark:to-emerald-900 rounded-2xl px-6 py-4 border border-emerald-200 dark:border-emerald-800 shadow-sm">
                <div className="flex items-center gap-3">
                  <div className="p-2 bg-emerald-500 rounded-lg">
                    <TrendingUp className="h-5 w-5 text-white" />
                  </div>
                  <div>
                    <p className="text-xs text-emerald-600 dark:text-emerald-400 font-semibold uppercase tracking-wide">
                      Total Activity
                    </p>
                    <p className="text-xl font-bold text-emerald-900 dark:text-emerald-100">
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
        <div className="border-t pt-8">
          <Tabs
            defaultValue={getDefaultTab()}
            value={activeView !== "combined" ? activeView : undefined}
            onValueChange={(value) => setActiveView(value as typeof activeView)}
            className="w-full"
          >
            <div className="flex items-center justify-center">
              <TabsList
                className="grid w-auto bg-muted/50 p-1 rounded-xl border shadow-sm"
                style={{
                  gridTemplateColumns: `repeat(${
                    (hasExpenses ? 1 : 0) + (hasAllocations ? 1 : 0)
                  }, 1fr)`,
                }}
              >
                {hasExpenses && (
                  <TabsTrigger
                    value="expenses"
                    className="flex items-center gap-2 px-6 py-3 rounded-lg data-[state=active]:bg-white data-[state=active]:shadow-sm font-medium"
                  >
                    <DollarSign className="h-4 w-4" />
                    Expenses
                    <Badge variant="secondary" className="ml-1">
                      {expenses.length}
                    </Badge>
                  </TabsTrigger>
                )}
                {hasAllocations && (
                  <TabsTrigger
                    value="allocations"
                    className="flex items-center gap-2 px-6 py-3 rounded-lg data-[state=active]:bg-white data-[state=active]:shadow-sm font-medium"
                  >
                    <Wallet className="h-4 w-4" />
                    Allocations
                    <Badge variant="secondary" className="ml-1">
                      {allocations.length}
                    </Badge>
                  </TabsTrigger>
                )}
              </TabsList>
            </div>

            {/* Tab Content */}
            <div className="mt-8">
              {/* Expense Tab */}
              {hasExpenses && (
                <TabsContent value="expenses" className="mt-0">
                  <BudgetSection
                    type="expenses"
                    data={expenses}
                    showHeader={false}
                  />
                </TabsContent>
              )}

              {/* Allocation Tab */}
              {hasAllocations && (
                <TabsContent value="allocations" className="mt-0">
                  <BudgetSection
                    type="allocations"
                    data={allocations}
                    showHeader={false}
                  />
                </TabsContent>
              )}
            </div>
          </Tabs>
        </div>
      ) : (
        // Empty state
        <div className="text-center py-16 bg-muted/30 rounded-2xl border border-dashed">
          <div className="space-y-4">
            <div className="mx-auto w-16 h-16 bg-muted/50 rounded-full flex items-center justify-center">
              <BarChart3 className="h-8 w-8 text-muted-foreground" />
            </div>
            <div>
              <h3 className="text-xl font-semibold mb-2">No Budget Activity</h3>
              <p className="text-muted-foreground">
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
