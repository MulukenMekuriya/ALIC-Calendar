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
  CardDescription,
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
  Wallet,
  ChevronDown,
  ChevronRight,
  BarChart3,
} from "lucide-react";
import { useAuth } from "@/shared/contexts/AuthContext";
import { useOrganization } from "@/shared/contexts/OrganizationContext";
import { useUserProfile } from "@/hooks/useUserProfile";
import { useFiscalYears, useActiveFiscalYear } from "../hooks";
import { useExpenses, useExpenseStatistics } from "../hooks";
import { useOrganizationBudgetSummary } from "../hooks";
import { useAllocationRequests } from "../hooks";
import {
  ExpenseRequestForm,
  ExpenseList,
  BudgetMetricsGrid,
  EnhancedReportExport,
  BudgetOverview,
} from "../components";
import { AllocationRequestForm } from "../components/AllocationRequestForm";
import { AllocationRequestList } from "../components/AllocationRequestList";

const BudgetDashboard = () => {
  const { user, isAdmin, isTreasury, isFinance } = useAuth();
  const { currentOrganization } = useOrganization();
  const { profile } = useUserProfile();

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

  // Fetch allocation requests
  const { data: allocationRequests, refetch: refetchAllocationRequests } =
    useAllocationRequests(effectiveFiscalYearId);

  // User's expenses (requester's own) - EXCLUDE cancelled
  const myExpenses =
    expenses?.filter(
      (e) => e.requester_id === user?.id && e.status !== "cancelled"
    ) || [];

  // User's allocation requests - EXCLUDE cancelled
  const myAllocationRequests =
    allocationRequests?.filter(
      (r) => r.requester_id === user?.id && r.status !== "cancelled"
    ) || [];

  // Filtered data for admin views - EXCLUDE cancelled
  const activeExpenses =
    expenses?.filter((e) => e.status !== "cancelled") || [];
  const activeAllocationRequests =
    allocationRequests?.filter((r) => r.status !== "cancelled") || [];

  // Get ministry name from user's profile (from DB)
  const userMinistryName =
    profile?.ministry_name ||
    myExpenses[0]?.ministry?.name ||
    myAllocationRequests[0]?.ministry?.name ||
    "Ministries";

  const handleRefresh = () => {
    refetchExpenses();
    refetchAllocationRequests();
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
        <div className="flex flex-col gap-4 sm:gap-6">
          <div className="space-y-2">
            <h1 className="text-2xl sm:text-3xl md:text-4xl font-bold tracking-tight flex items-center gap-2 sm:gap-3">
              <div className="p-1.5 sm:p-2 rounded-lg sm:rounded-xl bg-primary/10">
                <DollarSign className="h-5 w-5 sm:h-6 sm:w-6 md:h-8 md:w-8 text-primary" />
              </div>
              <span className="truncate">Budget</span>
            </h1>
            <p className="text-sm sm:text-base md:text-lg text-muted-foreground line-clamp-2">
              {hasFullAccess
                ? "Manage expenses, track budgets, and process payments"
                : `Submit and track ${userMinistryName.toLowerCase()} expense requests`}
            </p>
          </div>
          <div className="flex flex-col sm:flex-row items-stretch sm:items-center gap-2 sm:gap-3">
            {/* Fiscal Year Selector */}
            <Select
              value={effectiveFiscalYearId || ""}
              onValueChange={setSelectedFiscalYearId}
            >
              <SelectTrigger className="w-full sm:w-[180px] shadow-sm">
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

            <div className="flex items-center gap-2">
              {/* Enhanced Report Export - Role-based data filtering */}
              {hasFullAccess &&
                (activeExpenses?.length > 0 ||
                  activeAllocationRequests?.length > 0) &&
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
                  <Button size="default" className="font-semibold shadow-sm flex-1 sm:flex-none">
                    <Plus className="mr-1.5 sm:mr-2 h-4 w-4" />
                    <span className="hidden xs:inline">New </span>Request
                    <ChevronDown className="ml-1.5 sm:ml-2 h-4 w-4" />
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
                        : "Comprehensive overview of budget performance with real-time data"}
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
                    expenses={expenses || []}
                    allocations={allocationRequests || []}
                  />
                </CardContent>
              </CollapsibleContent>
            </Card>
          </Collapsible>
        )}

        {/* Tabs */}
        <Tabs value={activeTab} onValueChange={setActiveTab}>
          <TabsList className="grid grid-cols-3 w-full sm:w-auto sm:inline-flex h-auto gap-1 sm:gap-2 bg-muted/50 p-1 rounded-lg">
            <TabsTrigger
              value="overview"
              className="data-[state=active]:bg-primary data-[state=active]:text-primary-foreground px-2 sm:px-4 py-2 text-xs sm:text-sm"
            >
              <FileText className="mr-1 sm:mr-2 h-3 w-3 sm:h-4 sm:w-4" />
              <span className="hidden xs:inline">Overview</span>
              <span className="xs:hidden">Home</span>
            </TabsTrigger>
            <TabsTrigger
              value="expenses"
              className="data-[state=active]:bg-primary data-[state=active]:text-primary-foreground px-2 sm:px-4 py-2 text-xs sm:text-sm"
            >
              <DollarSign className="mr-1 sm:mr-2 h-3 w-3 sm:h-4 sm:w-4" />
              <span className="hidden sm:inline">Expenses</span>
              <span className="sm:hidden">Exp</span>
              {hasFullAccess
                ? activeExpenses &&
                  activeExpenses.length > 0 && (
                    <span className="ml-1 sm:ml-2 bg-muted text-muted-foreground rounded-full px-1.5 sm:px-2 text-[10px] sm:text-xs">
                      {activeExpenses.length}
                    </span>
                  )
                : myExpenses.length > 0 && (
                    <span className="ml-1 sm:ml-2 bg-muted text-muted-foreground rounded-full px-1.5 sm:px-2 text-[10px] sm:text-xs">
                      {myExpenses.length}
                    </span>
                  )}
            </TabsTrigger>
            <TabsTrigger
              value="allocations"
              className="data-[state=active]:bg-primary data-[state=active]:text-primary-foreground px-2 sm:px-4 py-2 text-xs sm:text-sm"
            >
              <Wallet className="mr-1 sm:mr-2 h-3 w-3 sm:h-4 sm:w-4" />
              <span className="hidden sm:inline">Allocations</span>
              <span className="sm:hidden">Alloc</span>
              {hasFullAccess
                ? activeAllocationRequests &&
                  activeAllocationRequests.length > 0 && (
                    <span className="ml-1 sm:ml-2 bg-muted text-muted-foreground rounded-full px-1.5 sm:px-2 text-[10px] sm:text-xs">
                      {activeAllocationRequests.length}
                    </span>
                  )
                : myAllocationRequests.length > 0 && (
                    <span className="ml-1 sm:ml-2 bg-muted text-muted-foreground rounded-full px-1.5 sm:px-2 text-[10px] sm:text-xs">
                      {myAllocationRequests.length}
                    </span>
                  )}
            </TabsTrigger>
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
                {hasFullAccess && budgetSummary && activeExpenses && (
                  <>
                    <BudgetOverview
                      expenses={activeExpenses}
                      allocations={activeAllocationRequests || []}
                      title="Organization Overview"
                      description={`Comprehensive view of ${currentOrganization.name} expenses and budget allocations`}
                      showDetailedLists={true}
                      expenseListProps={{
                        isLoading: expensesLoading,
                        userRole: isAdmin
                          ? "admin"
                          : isTreasury
                          ? "treasury"
                          : "finance",
                        onRefresh: handleRefresh,
                      }}
                      allocationListProps={{
                        isLoading: false,
                        userRole: isAdmin
                          ? "admin"
                          : isTreasury
                          ? "treasury"
                          : "finance",
                        onRefresh: handleRefresh,
                      }}
                    />
                  </>
                )}

                {/* Contributor View - Personal budget overview */}
                {isContributor && myExpenses && myExpenses.length > 0 && (
                  <>
                    <BudgetOverview
                      expenses={expenses}
                      allocations={myAllocationRequests}
                      title={`${userMinistryName} Budget Overview`}
                      description={`${userMinistryName} expense requests and budget allocations`}
                      showDetailedLists={true}
                      expenseListProps={{
                        isLoading: expensesLoading,
                        userRole: "requester",
                        onRefresh: handleRefresh,
                      }}
                      allocationListProps={{
                        isLoading: false,
                        userRole: "requester",
                        onRefresh: handleRefresh,
                      }}
                    />
                  </>
                )}

                {/* Empty state for contributors with no expenses */}
                {isContributor && myExpenses && myExpenses.length === 0 && (
                  <>
                    {/* Show unified overview even with no expenses if there are allocations */}
                    {myAllocationRequests && myAllocationRequests.length > 0 ? (
                      <BudgetOverview
                        expenses={[]}
                        allocations={myAllocationRequests}
                        title={`${userMinistryName} Budget Overview`}
                        description={`${userMinistryName} budget allocations`}
                        showDetailedLists={true}
                        expenseListProps={{
                          isLoading: expensesLoading,
                          userRole: "requester",
                          onRefresh: handleRefresh,
                        }}
                        allocationListProps={{
                          isLoading: false,
                          userRole: "requester",
                          onRefresh: handleRefresh,
                        }}
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

          {/* Expenses Tab */}
          <TabsContent value="expenses" className="mt-6">
            <Card>
              <CardHeader>
                <CardTitle className="flex items-center gap-2">
                  <DollarSign className="h-5 w-5" />
                  {hasFullAccess
                    ? "All Organization Expenses"
                    : `${userMinistryName} Expenses`}
                </CardTitle>
                <CardDescription>
                  {hasFullAccess
                    ? `View and manage all expense requests across ${currentOrganization.name}`
                    : `View and manage your ${userMinistryName} expense requests`}
                </CardDescription>
              </CardHeader>
              <CardContent>
                <ExpenseList
                  expenses={hasFullAccess ? activeExpenses || [] : myExpenses}
                  isLoading={expensesLoading}
                  userRole={
                    isAdmin
                      ? "admin"
                      : isTreasury
                      ? "treasury"
                      : isFinance
                      ? "finance"
                      : "requester"
                  }
                  onRefresh={handleRefresh}
                />
              </CardContent>
            </Card>
          </TabsContent>

          {/* Allocations Tab */}
          <TabsContent value="allocations" className="mt-6">
            <Card>
              <CardHeader>
                <CardTitle className="flex items-center gap-2">
                  <Wallet className="h-5 w-5" />
                  {hasFullAccess
                    ? "All Organization Allocations"
                    : `${userMinistryName} Allocations`}
                </CardTitle>
                <CardDescription>
                  {hasFullAccess
                    ? `View and manage all allocation requests across ${currentOrganization.name}`
                    : `View and manage your ${userMinistryName} allocation requests`}
                </CardDescription>
              </CardHeader>
              <CardContent>
                <AllocationRequestList
                  requests={
                    hasFullAccess
                      ? activeAllocationRequests || []
                      : myAllocationRequests
                  }
                  isLoading={false}
                  userRole={
                    isAdmin
                      ? "admin"
                      : isTreasury
                      ? "treasury"
                      : isFinance
                      ? "finance"
                      : "requester"
                  }
                  onRefresh={handleRefresh}
                />
              </CardContent>
            </Card>
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
