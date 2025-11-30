/**
 * Budget Dashboard - Enterprise Budget Management System
 */

import { useState } from "react";
import DashboardLayout from "@/shared/components/layout/DashboardLayout";
import {
  Tabs,
  TabsContent,
  TabsList,
  TabsTrigger,
} from "@/shared/components/ui/tabs";
import { Button } from "@/shared/components/ui/button";
import {
  Card,
  CardContent,
  CardHeader,
  CardTitle,
} from "@/shared/components/ui/card";
import {
  Collapsible,
  CollapsibleContent,
  CollapsibleTrigger,
} from "@/shared/components/ui/collapsible";
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
import {
  Loader2,
  DollarSign,
  Plus,
  FileText,
  CheckCircle,
  CreditCard,
  Settings2,
  Wallet,
  ChevronDown,
  ChevronRight,
  BarChart3,
} from "lucide-react";
import { useAuth } from "@/shared/contexts/AuthContext";
import { useOrganization } from "@/shared/contexts/OrganizationContext";
import { useFiscalYears, useActiveFiscalYear } from "../hooks";
import {
  useExpenses,
  useExpenseStatistics,
  useExpensesPendingTreasury,
  useExpensesPendingFinance,
} from "../hooks";
import { useOrganizationBudgetSummary } from "../hooks";
import { useAllocationRequests, usePendingAllocationRequests } from "../hooks";
import {
  ExpenseRequestForm,
  ExpenseList,
  BudgetMetricsGrid,
  BudgetReportExport,
  EnhancedReportExport,
  BudgetOverview,
} from "../components";
import { AllocationRequestForm } from "../components/AllocationRequestForm";
import { AllocationRequestList } from "../components/AllocationRequestList";

const BudgetDashboard = () => {
  const { user, isAdmin, isTreasury, isFinance } = useAuth();
  const { currentOrganization } = useOrganization();

  // State
  const [isExpenseFormOpen, setIsExpenseFormOpen] = useState(false);
  const [isAllocationFormOpen, setIsAllocationFormOpen] = useState(false);
  const [selectedFiscalYearId, setSelectedFiscalYearId] = useState<
    string | null
  >(null);
  const [activeTab, setActiveTab] = useState("overview");
  const [isMetricsCollapsed, setIsMetricsCollapsed] = useState(true);

  // Determine if user has elevated permissions (can see all data)
  const hasFullAccess = isAdmin || isTreasury || isFinance;
  const isContributor = !hasFullAccess;

  // Fetch fiscal years
  const { data: fiscalYears, isLoading: fiscalYearsLoading } = useFiscalYears(
    currentOrganization?.id
  );
  const { data: activeFiscalYear } = useActiveFiscalYear(
    currentOrganization?.id
  );

  // Use active fiscal year if none selected
  const effectiveFiscalYearId = selectedFiscalYearId || activeFiscalYear?.id;

  // Fetch expenses - filter by requester for contributors
  const expenseFilters = effectiveFiscalYearId
    ? {
        fiscal_year_id: effectiveFiscalYearId,
        ...(isContributor && user?.id ? { requester_id: user.id } : {}),
      }
    : isContributor && user?.id
    ? { requester_id: user.id }
    : undefined;

  const {
    data: expenses,
    isLoading: expensesLoading,
    refetch: refetchExpenses,
  } = useExpenses(currentOrganization?.id, expenseFilters);

  const { data: statistics, isLoading: statisticsLoading } =
    useExpenseStatistics(currentOrganization?.id, effectiveFiscalYearId);

  const { data: budgetSummary, isLoading: summaryLoading } =
    useOrganizationBudgetSummary(
      currentOrganization?.id,
      effectiveFiscalYearId
    );

  // Fetch pending expenses for different roles
  const { data: pendingTreasury, refetch: refetchPendingTreasury } =
    useExpensesPendingTreasury(
      isAdmin || isTreasury ? currentOrganization?.id : undefined
    );
  const { data: pendingFinance, refetch: refetchPendingFinance } =
    useExpensesPendingFinance(
      isAdmin || isFinance ? currentOrganization?.id : undefined
    );

  // Fetch allocation requests
  const { data: allocationRequests, refetch: refetchAllocationRequests } =
    useAllocationRequests(effectiveFiscalYearId);
  const { data: pendingAllocations, refetch: refetchPendingAllocations } =
    usePendingAllocationRequests(currentOrganization?.id);

  // User's expenses (requester's own)
  const myExpenses = expenses?.filter((e) => e.requester_id === user?.id) || [];

  // User's allocation requests
  const myAllocationRequests =
    allocationRequests?.filter((r) => r.requester_id === user?.id) || [];

  // Extract ministry name from user's expenses or allocations
  const userMinistryName =
    myExpenses[0]?.ministry?.name ||
    myAllocationRequests[0]?.ministry?.name ||
    "Ministries";

  const handleRefresh = () => {
    refetchExpenses();
    if ((isAdmin || isTreasury) && currentOrganization?.id) {
      refetchPendingTreasury();
    }
    if ((isAdmin || isFinance) && currentOrganization?.id) {
      refetchPendingFinance();
    }
    refetchAllocationRequests();
    if (currentOrganization?.id) {
      refetchPendingAllocations();
    }
  };

  const isLoading =
    fiscalYearsLoading ||
    expensesLoading ||
    statisticsLoading ||
    summaryLoading;

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
      <div className="space-y-8">
        {/* Header */}
        <div className="flex flex-col md:flex-row md:items-center md:justify-between gap-6">
          <div className="space-y-2">
            <h1 className="text-4xl font-bold tracking-tight flex items-center gap-3">
              <div className="p-2 rounded-xl bg-primary/10">
                <DollarSign className="h-8 w-8 text-primary" />
              </div>
              Budget Management
            </h1>
            <p className="text-lg text-muted-foreground">
              {hasFullAccess
                ? "Manage expenses, track budgets, and process payments"
                : `Submit and track ${userMinistryName.toLowerCase()} expense requests`}
            </p>
          </div>
          <div className="flex items-center gap-3 flex-wrap">
            {/* Fiscal Year Selector */}
            <Select
              value={effectiveFiscalYearId || ""}
              onValueChange={setSelectedFiscalYearId}
            >
              <SelectTrigger className="w-[200px] shadow-sm">
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

            {/* Export Report Button */}
            {hasFullAccess && budgetSummary && expenses && (
              <BudgetReportExport
                budgetSummary={budgetSummary}
                expenses={expenses}
                organizationName={currentOrganization.name}
              />
            )}
            {/* Enhanced Report Export - Role-based data filtering */}
            {hasFullAccess &&
              (expenses?.length > 0 || allocationRequests?.length > 0) &&
              user && (
                <EnhancedReportExport
                  expenses={expenses || []}
                  allocations={allocationRequests || []}
                  userName={user.email || "User"}
                  organizationName={currentOrganization.name}
                  ministryName="All Ministries"
                  fiscalYearName={
                    fiscalYears?.find((fy) => fy.id === effectiveFiscalYearId)
                      ?.name
                  }
                  isContributor={false}
                />
              )}
            {isContributor &&
              (myExpenses?.length > 0 || myAllocationRequests?.length > 0) &&
              user && (
                <EnhancedReportExport
                  expenses={myExpenses}
                  allocations={myAllocationRequests}
                  userName={user.email || "User"}
                  organizationName={currentOrganization.name}
                  ministryName={userMinistryName}
                  fiscalYearName={
                    fiscalYears?.find((fy) => fy.id === effectiveFiscalYearId)
                      ?.name
                  }
                  isContributor={true}
                />
              )}

            {/* New Request Dropdown */}
            <DropdownMenu>
              <DropdownMenuTrigger asChild>
                <Button size="lg" className="font-semibold shadow-sm">
                  <Plus className="mr-2 h-4 w-4" />
                  New Request
                  <ChevronDown className="ml-2 h-4 w-4" />
                </Button>
              </DropdownMenuTrigger>
              <DropdownMenuContent align="end" className="w-56">
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

        {/* Metrics Grid - World Class KPIs for Full Access Users */}
        {!isLoading && budgetSummary && expenses && hasFullAccess && (
          <Collapsible
            open={!isMetricsCollapsed}
            onOpenChange={(open) => setIsMetricsCollapsed(!open)}
          >
            <Card className="border shadow-sm">
              <CollapsibleTrigger asChild>
                <CardHeader className="cursor-pointer hover:bg-muted/50 transition-colors collapsible-trigger">
                  <div className="flex items-center justify-between">
                    <CardTitle className="flex items-center gap-2 text-xl font-bold">
                      <BarChart3 className="h-5 w-5 text-primary" />
                      <span className="hidden sm:inline">Budget Metrics</span>
                      <span className="sm:hidden">Metrics</span>
                    </CardTitle>
                    <div className="flex items-center gap-2 text-muted-foreground">
                      <span className="text-sm font-medium hidden md:inline">
                        {isMetricsCollapsed ? "Show details" : "Hide details"}
                      </span>
                      {isMetricsCollapsed ? (
                        <ChevronRight className="h-4 w-4 transition-transform collapsible-icon" />
                      ) : (
                        <ChevronDown className="h-4 w-4 transition-transform collapsible-icon" />
                      )}
                    </div>
                  </div>
                  <div className="flex items-center justify-between mt-2">
                    <p className="text-sm text-muted-foreground">
                      {isMetricsCollapsed
                        ? "Click to view detailed financial metrics"
                        : "Comprehensive overview of budget performance"}
                    </p>
                    {isMetricsCollapsed && (
                      <div className="flex flex-col sm:flex-row items-start sm:items-center gap-2 sm:gap-4 text-xs text-muted-foreground">
                        <span className="font-medium">
                          Budget: $
                          {budgetSummary.total_allocated.toLocaleString()}
                        </span>
                        <span className="font-medium">
                          Spent: ${budgetSummary.total_spent.toLocaleString()}
                        </span>
                        <span className="font-medium">
                          Remaining: $
                          {budgetSummary.total_remaining.toLocaleString()}
                        </span>
                      </div>
                    )}
                  </div>
                </CardHeader>
              </CollapsibleTrigger>
              <CollapsibleContent className="collapsible-content">
                <CardContent className="pt-0">
                  <BudgetMetricsGrid
                    budgetSummary={budgetSummary}
                    expenses={expenses}
                  />
                </CardContent>
              </CollapsibleContent>
            </Card>
          </Collapsible>
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
              {userMinistryName} Expenses
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
              {userMinistryName} Allocations
              {myAllocationRequests.length > 0 && (
                <span className="ml-2 bg-muted text-muted-foreground rounded-full px-2 text-xs">
                  {myAllocationRequests.length}
                </span>
              )}
            </TabsTrigger>
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

          {/* Overview Tab - World Class Analytics */}
          <TabsContent value="overview" className="space-y-6 mt-6">
            {isLoading ? (
              <div className="flex items-center justify-center py-12">
                <Loader2 className="h-8 w-8 animate-spin text-muted-foreground" />
              </div>
            ) : (
              <>
                {/* World-Class Overview for Admin/Treasury/Finance */}
                {hasFullAccess && budgetSummary && expenses && (
                  <>
                    <BudgetOverview
                      expenses={expenses}
                      allocations={allocationRequests || []}
                      title="Organization Overview"
                      description={`Comprehensive view of ${currentOrganization.name} expenses and budget allocations`}
                    />

                    {/* Detailed Expense List */}
                    <div className="mt-12">
                      <h3 className="text-xl font-semibold mb-4">
                        All Expense Requests
                      </h3>
                      <ExpenseList
                        expenses={expenses}
                        isLoading={expensesLoading}
                        userRole={
                          isAdmin
                            ? "admin"
                            : isTreasury
                            ? "treasury"
                            : "finance"
                        }
                        onRefresh={handleRefresh}
                      />
                    </div>
                  </>
                )}

                {/* Contributor View - Personal budget overview */}
                {isContributor && expenses && expenses.length > 0 && (
                  <>
                    <BudgetOverview
                      expenses={expenses}
                      allocations={myAllocationRequests}
                      title={`${userMinistryName} Budget Overview`}
                      description={`${userMinistryName} expense requests and budget allocations`}
                    />

                    <div className="mt-12">
                      <h3 className="text-xl font-semibold mb-4">
                        {userMinistryName} Expense Requests
                      </h3>
                      <ExpenseList
                        expenses={expenses}
                        isLoading={expensesLoading}
                        userRole="requester"
                        onRefresh={handleRefresh}
                      />
                    </div>
                  </>
                )}

                {/* Empty state for contributors with no expenses */}
                {isContributor && expenses && expenses.length === 0 && (
                  <>
                    {/* Show unified overview even with no expenses if there are allocations */}
                    {myAllocationRequests && myAllocationRequests.length > 0 ? (
                      <BudgetOverview
                        expenses={[]}
                        allocations={myAllocationRequests}
                        title={`${userMinistryName} Budget Overview`}
                        description={`${userMinistryName} budget allocations`}
                      />
                    ) : (
                      /* Empty state card */
                      <Card>
                        <CardContent className="pt-6">
                          <div className="text-center py-12">
                            <DollarSign className="h-12 w-12 text-muted-foreground mx-auto mb-4" />
                            <h3 className="text-lg font-semibold mb-2">
                              No Budget Activity
                            </h3>
                            <p className="text-muted-foreground mb-4">
                              Start by creating your first expense request or
                              budget allocation.
                            </p>
                            <Button onClick={() => setIsExpenseFormOpen(true)}>
                              <Plus className="mr-2 h-4 w-4" />
                              Create Expense Request
                            </Button>
                          </div>
                        </CardContent>
                      </Card>
                    )}
                  </>
                )}
              </>
            )}
          </TabsContent>

          {/* User Expenses Tab */}
          <TabsContent value="my-expenses" className="mt-6">
            <ExpenseList
              expenses={myExpenses}
              isLoading={expensesLoading}
              userRole="requester"
              onRefresh={handleRefresh}
            />
          </TabsContent>

          {/* User Allocations Tab */}
          <TabsContent value="my-allocations" className="mt-6">
            <AllocationRequestList
              requests={myAllocationRequests}
              isLoading={false}
              isAdmin={false}
              onRefresh={handleRefresh}
            />
          </TabsContent>

          {/* Treasury Tab */}
          <TabsContent value="treasury" className="mt-6">
            {isAdmin || isTreasury ? (
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
            {isAdmin || isFinance ? (
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
