/**
 * Budget Dashboard - Enterprise Budget Management System
 */

import { useState } from "react";
import DashboardLayout from "@/shared/components/layout/DashboardLayout";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/shared/components/ui/tabs";
import { Button } from "@/shared/components/ui/button";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/shared/components/ui/card";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/shared/components/ui/select";
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuTrigger,
} from "@/shared/components/ui/dropdown-menu";
import { Loader2, DollarSign, Plus, FileText, Clock, CheckCircle, CreditCard, Settings2, Wallet, ChevronDown } from "lucide-react";
import { useAuth } from "@/shared/contexts/AuthContext";
import { useOrganization } from "@/shared/contexts/OrganizationContext";
import { useFiscalYears, useActiveFiscalYear } from "../hooks";
import { useExpenses, useExpenseStatistics, useExpensesPendingLeader, useExpensesPendingTreasury, useExpensesPendingFinance } from "../hooks";
import { useOrganizationBudgetSummary } from "../hooks";
import { useMinistriesByLeader } from "../hooks";
import { useAllocationRequests, usePendingAllocationRequests } from "../hooks";
import { ExpenseRequestForm, ExpenseList, BudgetSummaryCard, BudgetQuickStats } from "../components";
import { AllocationRequestForm } from "../components/AllocationRequestForm";
import { AllocationRequestList } from "../components/AllocationRequestList";

const BudgetDashboard = () => {
  const { user, isAdmin, isTreasury, isFinance } = useAuth();
  const { currentOrganization } = useOrganization();

  // State
  const [isExpenseFormOpen, setIsExpenseFormOpen] = useState(false);
  const [isAllocationFormOpen, setIsAllocationFormOpen] = useState(false);
  const [selectedFiscalYearId, setSelectedFiscalYearId] = useState<string | null>(null);
  const [activeTab, setActiveTab] = useState("overview");

  // Fetch fiscal years
  const { data: fiscalYears, isLoading: fiscalYearsLoading } = useFiscalYears(
    currentOrganization?.id
  );
  const { data: activeFiscalYear } = useActiveFiscalYear(currentOrganization?.id);

  // Use active fiscal year if none selected
  const effectiveFiscalYearId = selectedFiscalYearId || activeFiscalYear?.id;

  // Fetch expenses and statistics
  const { data: expenses, isLoading: expensesLoading, refetch: refetchExpenses } = useExpenses(
    currentOrganization?.id,
    effectiveFiscalYearId ? { fiscal_year_id: effectiveFiscalYearId } : undefined
  );

  const { data: statistics, isLoading: statisticsLoading } = useExpenseStatistics(
    currentOrganization?.id,
    effectiveFiscalYearId
  );

  const { data: budgetSummary, isLoading: summaryLoading } = useOrganizationBudgetSummary(
    currentOrganization?.id,
    effectiveFiscalYearId
  );

  // Fetch ministry leader's ministries
  const { data: leaderMinistries } = useMinistriesByLeader(user?.id);
  const isMinistryLeader = (leaderMinistries?.length || 0) > 0;

  // Fetch pending expenses for different roles
  const { data: pendingLeader, refetch: refetchPendingLeader } = useExpensesPendingLeader(
    isMinistryLeader ? user?.id : undefined
  );
  const { data: pendingTreasury, refetch: refetchPendingTreasury } = useExpensesPendingTreasury(
    (isAdmin || isTreasury) ? currentOrganization?.id : undefined
  );
  const { data: pendingFinance, refetch: refetchPendingFinance } = useExpensesPendingFinance(
    (isAdmin || isFinance) ? currentOrganization?.id : undefined
  );

  // Fetch allocation requests
  const { data: allocationRequests, refetch: refetchAllocationRequests } = useAllocationRequests(
    effectiveFiscalYearId
  );
  const { data: pendingAllocations, refetch: refetchPendingAllocations } = usePendingAllocationRequests(
    currentOrganization?.id
  );

  // My expenses (requester's own)
  const myExpenses = expenses?.filter((e) => e.requester_id === user?.id) || [];

  // My allocation requests
  const myAllocationRequests = allocationRequests?.filter((r) => r.requester_id === user?.id) || [];

  const handleRefresh = () => {
    refetchExpenses();
    refetchPendingLeader();
    refetchPendingTreasury();
    refetchPendingFinance();
    refetchAllocationRequests();
    refetchPendingAllocations();
  };

  const isLoading = fiscalYearsLoading || expensesLoading || statisticsLoading || summaryLoading;

  if (!currentOrganization) {
    return (
      <DashboardLayout>
        <div className="flex items-center justify-center h-[60vh]">
          <Loader2 className="h-8 w-8 animate-spin text-muted-foreground" />
        </div>
      </DashboardLayout>
    );
  }

  return (
    <DashboardLayout>
      <div className="space-y-6">
        {/* Header */}
        <div className="flex flex-col md:flex-row md:items-center md:justify-between gap-4">
          <div>
            <h1 className="text-3xl font-bold flex items-center gap-2">
              <DollarSign className="h-8 w-8" />
              Budget Management
            </h1>
            <p className="text-muted-foreground mt-1">
              Manage expenses, track budgets, and process payments
            </p>
          </div>
          <div className="flex items-center gap-3">
            {/* Fiscal Year Selector */}
            <Select
              value={effectiveFiscalYearId || ""}
              onValueChange={setSelectedFiscalYearId}
            >
              <SelectTrigger className="w-[180px]">
                <SelectValue placeholder="Select fiscal year" />
              </SelectTrigger>
              <SelectContent>
                {fiscalYears?.map((fy) => (
                  <SelectItem key={fy.id} value={fy.id}>
                    {fy.name} {fy.is_active && "(Active)"}
                  </SelectItem>
                ))}
              </SelectContent>
            </Select>

            {/* New Request Dropdown */}
            <DropdownMenu>
              <DropdownMenuTrigger asChild>
                <Button>
                  <Plus className="mr-2 h-4 w-4" />
                  New Request
                  <ChevronDown className="ml-2 h-4 w-4" />
                </Button>
              </DropdownMenuTrigger>
              <DropdownMenuContent align="end">
                <DropdownMenuItem onClick={() => setIsExpenseFormOpen(true)}>
                  <DollarSign className="mr-2 h-4 w-4" />
                  Expense Request
                </DropdownMenuItem>
                <DropdownMenuItem onClick={() => setIsAllocationFormOpen(true)}>
                  <Wallet className="mr-2 h-4 w-4" />
                  Budget Allocation Request
                </DropdownMenuItem>
              </DropdownMenuContent>
            </DropdownMenu>
          </div>
        </div>

        {/* Quick Stats */}
        {statistics && (
          <BudgetQuickStats
            totalAllocated={budgetSummary?.total_allocated || 0}
            totalSpent={statistics.total_amount_completed}
            totalRemaining={budgetSummary?.total_remaining || 0}
            pendingCount={statistics.pending_requests}
          />
        )}

        {/* Tabs */}
        <Tabs value={activeTab} onValueChange={setActiveTab}>
          <TabsList className="flex flex-wrap h-auto gap-2 bg-transparent p-0">
            <TabsTrigger
              value="overview"
              className="data-[state=active]:bg-primary data-[state=active]:text-primary-foreground"
            >
              <FileText className="mr-2 h-4 w-4" />
              Overview
            </TabsTrigger>
            <TabsTrigger
              value="my-expenses"
              className="data-[state=active]:bg-primary data-[state=active]:text-primary-foreground"
            >
              <DollarSign className="mr-2 h-4 w-4" />
              My Expenses
              {myExpenses.length > 0 && (
                <span className="ml-2 bg-muted text-muted-foreground rounded-full px-2 text-xs">
                  {myExpenses.length}
                </span>
              )}
            </TabsTrigger>
            <TabsTrigger
              value="my-allocations"
              className="data-[state=active]:bg-primary data-[state=active]:text-primary-foreground"
            >
              <Wallet className="mr-2 h-4 w-4" />
              My Allocations
              {myAllocationRequests.length > 0 && (
                <span className="ml-2 bg-muted text-muted-foreground rounded-full px-2 text-xs">
                  {myAllocationRequests.length}
                </span>
              )}
            </TabsTrigger>
            {(isMinistryLeader || isAdmin) && (
              <TabsTrigger
                value="leader-review"
                className="data-[state=active]:bg-primary data-[state=active]:text-primary-foreground"
              >
                <Clock className="mr-2 h-4 w-4" />
                Leader Review
                {(pendingLeader?.length || 0) > 0 && (
                  <span className="ml-2 bg-yellow-500 text-white rounded-full px-2 text-xs">
                    {pendingLeader?.length}
                  </span>
                )}
              </TabsTrigger>
            )}
            {(isAdmin || isTreasury) && (
              <TabsTrigger
                value="treasury"
                className="data-[state=active]:bg-primary data-[state=active]:text-primary-foreground"
              >
                <CheckCircle className="mr-2 h-4 w-4" />
                Treasury
                {(pendingTreasury?.length || 0) > 0 && (
                  <span className="ml-2 bg-orange-500 text-white rounded-full px-2 text-xs">
                    {pendingTreasury?.length}
                  </span>
                )}
              </TabsTrigger>
            )}
            {(isAdmin || isFinance) && (
              <TabsTrigger
                value="finance"
                className="data-[state=active]:bg-primary data-[state=active]:text-primary-foreground"
              >
                <CreditCard className="mr-2 h-4 w-4" />
                Finance
                {(pendingFinance?.length || 0) > 0 && (
                  <span className="ml-2 bg-purple-500 text-white rounded-full px-2 text-xs">
                    {pendingFinance?.length}
                  </span>
                )}
              </TabsTrigger>
            )}
            {isAdmin && (
              <TabsTrigger
                value="allocation-review"
                className="data-[state=active]:bg-primary data-[state=active]:text-primary-foreground"
              >
                <Settings2 className="mr-2 h-4 w-4" />
                Allocation Review
                {(pendingAllocations?.length || 0) > 0 && (
                  <span className="ml-2 bg-blue-500 text-white rounded-full px-2 text-xs">
                    {pendingAllocations?.length}
                  </span>
                )}
              </TabsTrigger>
            )}
          </TabsList>

          {/* Overview Tab */}
          <TabsContent value="overview" className="space-y-6 mt-6">
            {isLoading ? (
              <div className="flex items-center justify-center py-12">
                <Loader2 className="h-8 w-8 animate-spin text-muted-foreground" />
              </div>
            ) : (
              <>
                {/* Budget Summary */}
                {budgetSummary && (
                  <BudgetSummaryCard summary={budgetSummary} type="organization" />
                )}

                {/* Ministry Budgets */}
                {budgetSummary?.ministry_summaries && budgetSummary.ministry_summaries.length > 0 && (
                  <Card>
                    <CardHeader>
                      <CardTitle className="flex items-center gap-2">
                        <Settings2 className="h-5 w-5" />
                        Ministry Budgets
                      </CardTitle>
                      <CardDescription>
                        Budget allocation and spending by ministry
                      </CardDescription>
                    </CardHeader>
                    <CardContent>
                      <div className="grid gap-4 md:grid-cols-2 lg:grid-cols-3">
                        {budgetSummary.ministry_summaries.map((ministry) => (
                          <div
                            key={ministry.ministry_id}
                            className="p-4 border rounded-lg space-y-2"
                          >
                            <h4 className="font-medium">{ministry.ministry_name}</h4>
                            <div className="grid grid-cols-2 gap-2 text-sm">
                              <div>
                                <span className="text-muted-foreground">Allocated:</span>
                                <span className="ml-1 font-medium">
                                  ${ministry.allocated_amount.toLocaleString()}
                                </span>
                              </div>
                              <div>
                                <span className="text-muted-foreground">Spent:</span>
                                <span className="ml-1 font-medium text-green-600">
                                  ${ministry.total_spent.toLocaleString()}
                                </span>
                              </div>
                              <div>
                                <span className="text-muted-foreground">Pending:</span>
                                <span className="ml-1 font-medium text-yellow-600">
                                  ${ministry.total_pending.toLocaleString()}
                                </span>
                              </div>
                              <div>
                                <span className="text-muted-foreground">Remaining:</span>
                                <span className="ml-1 font-medium text-blue-600">
                                  ${ministry.remaining.toLocaleString()}
                                </span>
                              </div>
                            </div>
                          </div>
                        ))}
                      </div>
                    </CardContent>
                  </Card>
                )}

                {/* All Expenses */}
                {isAdmin && expenses && (
                  <ExpenseList
                    expenses={expenses}
                    isLoading={expensesLoading}
                    userRole="admin"
                    onRefresh={handleRefresh}
                  />
                )}
              </>
            )}
          </TabsContent>

          {/* My Expenses Tab */}
          <TabsContent value="my-expenses" className="mt-6">
            <ExpenseList
              expenses={myExpenses}
              isLoading={expensesLoading}
              userRole="requester"
              onRefresh={handleRefresh}
            />
          </TabsContent>

          {/* My Allocations Tab */}
          <TabsContent value="my-allocations" className="mt-6">
            <AllocationRequestList
              requests={myAllocationRequests}
              isLoading={false}
              isAdmin={false}
              onRefresh={handleRefresh}
            />
          </TabsContent>

          {/* Leader Review Tab */}
          <TabsContent value="leader-review" className="mt-6">
            {isMinistryLeader || isAdmin ? (
              <ExpenseList
                expenses={pendingLeader || []}
                isLoading={false}
                userRole="leader"
                onRefresh={handleRefresh}
              />
            ) : (
              <Card>
                <CardContent className="py-12 text-center text-muted-foreground">
                  You are not assigned as a ministry leader.
                </CardContent>
              </Card>
            )}
          </TabsContent>

          {/* Treasury Tab */}
          <TabsContent value="treasury" className="mt-6">
            {(isAdmin || isTreasury) ? (
              <ExpenseList
                expenses={pendingTreasury || []}
                isLoading={false}
                userRole="treasury"
                onRefresh={handleRefresh}
              />
            ) : (
              <Card>
                <CardContent className="py-12 text-center text-muted-foreground">
                  You don't have access to treasury functions.
                </CardContent>
              </Card>
            )}
          </TabsContent>

          {/* Finance Tab */}
          <TabsContent value="finance" className="mt-6">
            {(isAdmin || isFinance) ? (
              <ExpenseList
                expenses={pendingFinance || []}
                isLoading={false}
                userRole="finance"
                onRefresh={handleRefresh}
              />
            ) : (
              <Card>
                <CardContent className="py-12 text-center text-muted-foreground">
                  You don't have access to finance functions.
                </CardContent>
              </Card>
            )}
          </TabsContent>

          {/* Allocation Review Tab (Admin Only) */}
          <TabsContent value="allocation-review" className="mt-6">
            {isAdmin ? (
              <AllocationRequestList
                requests={pendingAllocations || []}
                isLoading={false}
                isAdmin={true}
                onRefresh={handleRefresh}
              />
            ) : (
              <Card>
                <CardContent className="py-12 text-center text-muted-foreground">
                  You don't have access to allocation review functions.
                </CardContent>
              </Card>
            )}
          </TabsContent>
        </Tabs>
      </div>

      {/* New Expense Form Dialog */}
      <ExpenseRequestForm
        open={isExpenseFormOpen}
        onOpenChange={setIsExpenseFormOpen}
        onSuccess={handleRefresh}
      />

      {/* New Allocation Request Form Dialog */}
      <AllocationRequestForm
        open={isAllocationFormOpen}
        onOpenChange={setIsAllocationFormOpen}
        onSuccess={handleRefresh}
      />
    </DashboardLayout>
  );
};

export default BudgetDashboard;
