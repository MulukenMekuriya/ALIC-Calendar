/**
 * Budget Metrics Grid - Animated KPI cards with real-time data
 */

import { Card, CardContent } from "@/shared/components/ui/card";
import {
  DollarSign,
  TrendingUp,
  TrendingDown,
  Clock,
  CheckCircle,
  AlertCircle,
  Wallet,
  Target,
  Activity,
  PieChart as PieChartIcon,
} from "lucide-react";
import type {
  OrganizationBudgetSummary,
  ExpenseRequestWithRelations,
  AllocationRequestWithRelations,
} from "../types";
import { useEffect, useState } from "react";

interface BudgetMetricsGridProps {
  budgetSummary: OrganizationBudgetSummary;
  expenses: ExpenseRequestWithRelations[];
  allocations?: AllocationRequestWithRelations[];
}

interface MetricCardProps {
  title: string;
  value: string | number;
  subtitle?: string;
  icon: React.ReactNode;
  trend?: "up" | "down" | "neutral";
  trendValue?: string;
  colorClass: string;
  delay?: number;
}

const MetricCard = ({
  title,
  value,
  subtitle,
  icon,
  trend,
  trendValue,
  colorClass,
  delay = 0,
}: MetricCardProps) => {
  const [isVisible, setIsVisible] = useState(false);

  useEffect(() => {
    const timer = setTimeout(() => setIsVisible(true), delay);
    return () => clearTimeout(timer);
  }, [delay]);

  return (
    <Card
      className={`overflow-hidden transition-all duration-700 transform border-0 shadow-lg ${
        isVisible
          ? "opacity-100 translate-y-0 scale-100"
          : "opacity-0 translate-y-6 scale-95"
      } hover:shadow-xl hover:-translate-y-1 hover:scale-105`}
    >
      <CardContent className="pt-6 pb-6">
        <div className="flex items-start justify-between">
          <div className="flex-1 space-y-3">
            <p className="text-sm font-semibold text-muted-foreground uppercase tracking-wider">
              {title}
            </p>
            <div className="space-y-2">
              <h3 className="text-3xl font-bold tracking-tight">{value}</h3>
              {trend && trendValue && (
                <span
                  className={`flex items-center text-sm font-semibold ${
                    trend === "up"
                      ? "text-green-600 dark:text-green-400"
                      : trend === "down"
                      ? "text-red-600 dark:text-red-400"
                      : "text-muted-foreground"
                  }`}
                >
                  {trend === "up" && <TrendingUp className="h-4 w-4 mr-1" />}
                  {trend === "down" && (
                    <TrendingDown className="h-4 w-4 mr-1" />
                  )}
                  {trendValue}
                </span>
              )}
            </div>
            {subtitle && (
              <p className="text-xs text-muted-foreground font-medium">
                {subtitle}
              </p>
            )}
          </div>
          <div className={`${colorClass} p-4 rounded-xl shadow-lg`}>{icon}</div>
        </div>
      </CardContent>
    </Card>
  );
};

const BudgetMetricsGrid = ({
  budgetSummary,
  expenses,
  allocations = [],
}: BudgetMetricsGridProps) => {
  // Ensure we have valid data to prevent errors
  const safeExpenses = Array.isArray(expenses) ? expenses : [];
  const safeAllocations = Array.isArray(allocations) ? allocations : [];
  const safeBudgetSummary = budgetSummary || {
    total_allocated: 0,
    total_spent: 0,
    total_pending: 0,
    total_remaining: 0,
    fiscal_year_name: "Current Year",
  };

  // Calculate metrics from real database data
  const totalBudget = safeBudgetSummary.total_allocated || 0;
  const totalSpent = safeBudgetSummary.total_spent || 0;
  const totalPending = safeBudgetSummary.total_pending || 0;
  const totalRemaining = safeBudgetSummary.total_remaining || 0;

  const utilizationRate =
    totalBudget > 0 ? ((totalSpent / totalBudget) * 100).toFixed(1) : "0";

  // Expense calculations from real data (EXCLUDING cancelled requests)
  const activeExpenses = safeExpenses.filter((e) => e.status !== "cancelled");
  
  const pendingExpenses = activeExpenses.filter(
    (e) =>
      e.status === "pending_leader" ||
      e.status === "pending_treasury" ||
      e.status === "pending_finance"
  ).length;

  const completedExpenses = activeExpenses.filter(
    (e) => e.status === "treasury_approved" || e.status === "leader_approved"
  ).length;

  const deniedExpenses = activeExpenses.filter(
    (e) => e.status === "leader_denied" || e.status === "treasury_denied"
  ).length;

  const totalExpenses = activeExpenses.length;

  // Allocation calculations from real data (EXCLUDING cancelled requests)
  const activeAllocations = safeAllocations.filter((a) => a.status !== "cancelled");
  
  const pendingAllocations = activeAllocations.filter(
    (a) => a.status === "pending"
  ).length;

  const approvedAllocations = activeAllocations.filter(
    (a) => a.status === "approved" || a.status === "partially_approved"
  ).length;

  const deniedAllocations = activeAllocations.filter(
    (a) => a.status === "denied"
  ).length;

  const totalAllocations = activeAllocations.length;

  // Combined metrics
  const totalRequests = totalExpenses + totalAllocations;
  const totalPendingRequests = pendingExpenses + pendingAllocations;
  const totalApprovedRequests = completedExpenses + approvedAllocations;

  const completionRate =
    totalExpenses > 0
      ? ((completedExpenses / totalExpenses) * 100).toFixed(1)
      : "0";

  const averageExpense =
    completedExpenses > 0 ? Math.round(totalSpent / completedExpenses) || 0 : 0;

  const approvalRate =
    totalRequests > 0
      ? (
          (totalApprovedRequests /
            (totalRequests - deniedExpenses - deniedAllocations)) *
          100
        ).toFixed(1)
      : "0";

  // Calculate budget health
  const budgetHealth =
    parseFloat(utilizationRate) > 100
      ? "over"
      : parseFloat(utilizationRate) > 90
      ? "warning"
      : parseFloat(utilizationRate) > 75
      ? "good"
      : "excellent";

  const metrics: MetricCardProps[] = [
    {
      title: "Total Budget",
      value: `$${totalBudget.toLocaleString()}`,
      subtitle: budgetSummary.fiscal_year_name,
      icon: <DollarSign className="h-5 w-5 text-white" />,
      colorClass: "bg-blue-500",
      delay: 0,
    },
    {
      title: "Total Spent",
      value: `$${totalSpent.toLocaleString()}`,
      subtitle: `${utilizationRate}% of budget`,
      icon: <TrendingUp className="h-5 w-5 text-white" />,
      trend:
        parseFloat(utilizationRate) > 75
          ? ("up" as const)
          : ("neutral" as const),
      trendValue: `${utilizationRate}%`,
      colorClass:
        parseFloat(utilizationRate) > 100
          ? "bg-red-500"
          : parseFloat(utilizationRate) > 90
          ? "bg-yellow-500"
          : "bg-green-500",
      delay: 50,
    },
    {
      title: "Available Balance",
      value: `$${totalRemaining.toLocaleString()}`,
      subtitle: totalRemaining < 0 ? "Over budget" : "Remaining funds",
      icon: <Wallet className="h-5 w-5 text-white" />,
      colorClass: totalRemaining < 0 ? "bg-red-500" : "bg-purple-500",
      delay: 100,
    },
    {
      title: "Pending Approvals",
      value: totalPendingRequests,
      subtitle: `$${totalPending.toLocaleString()} total`,
      icon: <Clock className="h-5 w-5 text-white" />,
      colorClass: totalPendingRequests > 10 ? "bg-yellow-500" : "bg-orange-500",
      delay: 150,
    },
    {
      title: "Budget Utilization",
      value: `${utilizationRate}%`,
      subtitle:
        budgetHealth === "over"
          ? "Over budget!"
          : budgetHealth === "warning"
          ? "Near limit"
          : budgetHealth === "good"
          ? "On track"
          : "Healthy",
      icon: <Target className="h-5 w-5 text-white" />,
      trend:
        parseFloat(utilizationRate) > 100
          ? ("up" as const)
          : ("neutral" as const),
      colorClass:
        budgetHealth === "over"
          ? "bg-red-500"
          : budgetHealth === "warning"
          ? "bg-yellow-500"
          : budgetHealth === "good"
          ? "bg-blue-500"
          : "bg-green-500",
      delay: 200,
    },
    {
      title: "Total Expenses",
      value: totalExpenses,
      subtitle: `${completedExpenses} completed`,
      icon: <Activity className="h-5 w-5 text-white" />,
      colorClass: "bg-indigo-500",
      delay: 250,
    },
    {
      title: "Average Expense",
      value: `$${averageExpense.toLocaleString()}`,
      subtitle:
        completedExpenses > 0
          ? `From ${completedExpenses} expenses`
          : "No completed expenses",
      icon: <PieChartIcon className="h-5 w-5 text-white" />,
      colorClass: "bg-teal-500",
      delay: 300,
    },
    {
      title: "Completion Rate",
      value: `${completionRate}%`,
      subtitle: `${completedExpenses} of ${totalExpenses} completed`,
      icon: <CheckCircle className="h-5 w-5 text-white" />,
      trend:
        parseFloat(completionRate) > 50 ? ("up" as const) : ("down" as const),
      trendValue: `${approvalRate}% approved`,
      colorClass:
        parseFloat(completionRate) > 75
          ? "bg-green-500"
          : parseFloat(completionRate) > 50
          ? "bg-yellow-500"
          : "bg-red-500",
      delay: 350,
    },
  ];

  return (
    <div className="space-y-6">
      {/* Essential Financial Metrics - Most Important */}
      <div className="grid gap-6 md:grid-cols-2 lg:grid-cols-4">
        <MetricCard
          title="Total Budget"
          value={`$${totalBudget.toLocaleString()}`}
          subtitle={safeBudgetSummary.fiscal_year_name}
          icon={<DollarSign className="h-6 w-6 text-white" />}
          colorClass="bg-gradient-to-br from-blue-500 to-blue-600"
          delay={0}
        />
        <MetricCard
          title="Total Spent"
          value={`$${totalSpent.toLocaleString()}`}
          subtitle={`${utilizationRate}% of budget`}
          icon={<TrendingUp className="h-6 w-6 text-white" />}
          trend={
            parseFloat(utilizationRate) > 75
              ? ("up" as const)
              : ("neutral" as const)
          }
          trendValue={`${utilizationRate}%`}
          colorClass={
            parseFloat(utilizationRate) > 100
              ? "bg-gradient-to-br from-red-500 to-red-600"
              : parseFloat(utilizationRate) > 90
              ? "bg-gradient-to-br from-yellow-500 to-yellow-600"
              : "bg-gradient-to-br from-green-500 to-green-600"
          }
          delay={100}
        />
        <MetricCard
          title="Available Balance"
          value={`$${totalRemaining.toLocaleString()}`}
          subtitle={totalRemaining < 0 ? "Over budget" : "Remaining funds"}
          icon={<Wallet className="h-6 w-6 text-white" />}
          colorClass={
            totalRemaining < 0
              ? "bg-gradient-to-br from-red-500 to-red-600"
              : "bg-gradient-to-br from-purple-500 to-purple-600"
          }
          delay={200}
        />
        <MetricCard
          title="Pending Approvals"
          value={totalPendingRequests}
          subtitle={`$${totalPending.toLocaleString()} total`}
          icon={<Clock className="h-6 w-6 text-white" />}
          colorClass={
            totalPendingRequests > 10
              ? "bg-gradient-to-br from-yellow-500 to-yellow-600"
              : "bg-gradient-to-br from-orange-500 to-orange-600"
          }
          delay={300}
        />
      </div>

      {/* Activity & Performance Metrics */}
      <div className="grid gap-6 md:grid-cols-2">
        <MetricCard
          title="Activity Summary"
          value={totalRequests}
          subtitle={`${totalExpenses} expenses${
            totalAllocations > 0 ? ` + ${totalAllocations} allocations` : ""
          }`}
          icon={<Activity className="h-6 w-6 text-white" />}
          colorClass="bg-gradient-to-br from-indigo-500 to-indigo-600"
          delay={400}
        />
        <MetricCard
          title="Overall Success Rate"
          value={`${approvalRate}%`}
          subtitle={`${totalApprovedRequests} of ${totalRequests} approved`}
          icon={<CheckCircle className="h-6 w-6 text-white" />}
          trend={
            parseFloat(approvalRate) > 75
              ? ("up" as const)
              : ("neutral" as const)
          }
          trendValue={`${completionRate}% completed`}
          colorClass={
            parseFloat(approvalRate) > 90
              ? "bg-gradient-to-br from-green-500 to-green-600"
              : parseFloat(approvalRate) > 75
              ? "bg-gradient-to-br from-blue-500 to-blue-600"
              : "bg-gradient-to-br from-yellow-500 to-yellow-600"
          }
          delay={500}
        />
      </div>
    </div>
  );
};

export default BudgetMetricsGrid;
