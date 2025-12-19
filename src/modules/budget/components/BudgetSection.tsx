/**
 * BudgetSection - Unified component for displaying budget analytics sections
 * Handles both expenses and allocations with a single, reusable component
 */

import {
  Card,
  CardContent,
  CardDescription,
  CardHeader,
  CardTitle,
} from "@/shared/components/ui/card";
import {
  PieChart,
  Pie,
  BarChart,
  Bar,
  XAxis,
  YAxis,
  CartesianGrid,
  Tooltip,
  ResponsiveContainer,
  Cell,
  Area,
  AreaChart,
} from "recharts";
import {
  TrendingUp,
  DollarSign,
  AlertCircle,
  Wallet,
  CheckCircle,
} from "lucide-react";
import type {
  ExpenseRequestWithRelations,
  AllocationRequestWithRelations,
} from "../types";

// Configuration for different section types
type SectionType = "expenses" | "allocations";
type BudgetItem = ExpenseRequestWithRelations | AllocationRequestWithRelations;

interface SectionConfig {
  title: string;
  icon: typeof DollarSign;
  statusColors: Record<string, string>;
  getAmount: (item: BudgetItem) => number;
  getStatus: (item: BudgetItem) => string;
  getMinistry: (item: BudgetItem) => string;
  getDate: (item: BudgetItem) => string;
  approvedStatuses: string[];
  pendingStatuses: string[];
  deniedStatuses: string[];
}

interface BudgetSectionProps {
  type: SectionType;
  data: ExpenseRequestWithRelations[] | AllocationRequestWithRelations[];
  title?: string;
  description?: string;
  showHeader?: boolean;
  showMinistryBreakdown?: boolean;
}

// Color palette
const COLORS = {
  primary: "#3b82f6",
  success: "#10b981",
  warning: "#f59e0b",
  danger: "#ef4444",
  purple: "#8b5cf6",
  teal: "#14b8a6",
  pink: "#ec4899",
  indigo: "#6366f1",
};

const MINISTRY_COLORS = [
  COLORS.primary,
  COLORS.success,
  COLORS.purple,
  COLORS.warning,
  COLORS.teal,
  COLORS.pink,
  COLORS.indigo,
  COLORS.danger,
];

// Section configurations
const SECTION_CONFIGS: Record<SectionType, SectionConfig> = {
  expenses: {
    title: "Expense Requests",
    icon: DollarSign,
    statusColors: {
      draft: COLORS.primary,
      pending_leader: COLORS.warning,
      leader_approved: COLORS.success,
      leader_denied: COLORS.danger,
      pending_treasury: COLORS.warning,
      treasury_approved: COLORS.success,
      treasury_denied: COLORS.danger,
      pending_finance: COLORS.warning,
      cancelled: COLORS.danger,
    },
    getAmount: (item: ExpenseRequestWithRelations) => item.amount,
    getStatus: (item: ExpenseRequestWithRelations) => item.status,
    getMinistry: (item: ExpenseRequestWithRelations) =>
      item.ministry?.name || "Unknown",
    getDate: (item: ExpenseRequestWithRelations) => item.created_at,
    approvedStatuses: ["treasury_approved", "leader_approved"],
    pendingStatuses: ["pending_leader", "pending_treasury", "pending_finance"],
    deniedStatuses: ["leader_denied", "treasury_denied"],
  },
  allocations: {
    title: "Budget Allocations",
    icon: Wallet,
    statusColors: {
      draft: COLORS.primary,
      pending: COLORS.warning,
      approved: COLORS.success,
      partially_approved: COLORS.teal,
      denied: COLORS.danger,
      cancelled: COLORS.danger,
    },
    getAmount: (item: AllocationRequestWithRelations) => item.requested_amount,
    getStatus: (item: AllocationRequestWithRelations) => item.status,
    getMinistry: (item: AllocationRequestWithRelations) =>
      item.ministry?.name || "Unknown",
    getDate: (item: AllocationRequestWithRelations) => item.created_at,
    approvedStatuses: ["approved", "partially_approved"],
    pendingStatuses: ["pending"],
    deniedStatuses: ["denied"],
  },
};

const BudgetSection = ({
  type,
  data,
  title,
  description,
  showHeader = true,
  showMinistryBreakdown = true,
}: BudgetSectionProps) => {
  const config = SECTION_CONFIGS[type];
  const Icon = config.icon;

  if (data.length === 0) {
    return null;
  }

  // Calculate totals using config
  const totalAmount = data.reduce(
    (sum, item) => sum + config.getAmount(item),
    0
  );
  const approvedAmount = data
    .filter((item) => config.approvedStatuses.includes(config.getStatus(item)))
    .reduce((sum, item) => sum + config.getAmount(item), 0);
  const pendingAmount = data
    .filter((item) => config.pendingStatuses.includes(config.getStatus(item)))
    .reduce((sum, item) => sum + config.getAmount(item), 0);
  const deniedAmount = data
    .filter((item) => config.deniedStatuses.includes(config.getStatus(item)))
    .reduce((sum, item) => sum + config.getAmount(item), 0);

  // Status breakdown
  const statusBreakdown = data.reduce((acc, item) => {
    const status = config.getStatus(item);
    if (!acc[status]) {
      acc[status] = { count: 0, amount: 0 };
    }
    acc[status].count += 1;
    acc[status].amount += config.getAmount(item);
    return acc;
  }, {} as Record<string, { count: number; amount: number }>);

  const statusData = Object.entries(statusBreakdown).map(([status, data]) => ({
    name: status.replace(/_/g, " ").replace(/\b\w/g, (l) => l.toUpperCase()),
    value: data.amount,
    count: data.count,
    status: status,
  }));

  // Monthly trend
  const monthlyData = Object.values(
    data.reduce((acc, item) => {
      const date = new Date(config.getDate(item));
      const monthKey = `${date.getFullYear()}-${String(
        date.getMonth() + 1
      ).padStart(2, "0")}`;
      const monthName = date.toLocaleDateString("en-US", {
        month: "short",
        year: "numeric",
      });

      if (!acc[monthKey]) {
        acc[monthKey] = { month: monthName, amount: 0, count: 0 };
      }
      acc[monthKey].amount += config.getAmount(item);
      acc[monthKey].count += 1;
      return acc;
    }, {} as Record<string, { month: string; amount: number; count: number }>)
  ).sort((a, b) => a.month.localeCompare(b.month));

  // Ministry breakdown
  const ministryData = Object.entries(
    data.reduce((acc, item) => {
      const ministryName = config.getMinistry(item);
      if (!acc[ministryName]) {
        acc[ministryName] = { count: 0, amount: 0 };
      }
      acc[ministryName].count += 1;
      acc[ministryName].amount += config.getAmount(item);
      return acc;
    }, {} as Record<string, { count: number; amount: number }>)
  )
    .map(([name, data]) => ({
      name: name.length > 20 ? name.substring(0, 20) + "..." : name,
      fullName: name,
      amount: data.amount,
      count: data.count,
    }))
    .sort((a, b) => b.amount - a.amount);

  // Approval rate
  const totalRequests = data.length;
  const approvedCount = data.filter((item) =>
    config.approvedStatuses.includes(config.getStatus(item))
  ).length;
  const approvalRate =
    totalRequests > 0
      ? ((approvedCount / totalRequests) * 100).toFixed(1)
      : "0";

  // Amount breakdown for bar chart
  const amountData = [
    { name: "Approved", amount: approvedAmount, color: COLORS.success },
    { name: "Pending", amount: pendingAmount, color: COLORS.warning },
    { name: "Denied", amount: deniedAmount, color: COLORS.danger },
  ].filter((item) => item.amount > 0);

  return (
    <div className="space-y-4 sm:space-y-6">
      {/* Header */}
      {showHeader && (
        <div className="flex items-center gap-2 sm:gap-3 mb-4 sm:mb-6">
          <Icon className="h-5 w-5 sm:h-6 sm:w-6 text-primary" />
          <div>
            <h2 className="text-xl sm:text-2xl font-bold">{title || config.title}</h2>
            {description && (
              <p className="text-xs sm:text-sm text-muted-foreground">{description}</p>
            )}
          </div>
        </div>
      )}

      {/* Summary Stats */}
      <div className="grid gap-3 sm:gap-4 grid-cols-2 md:grid-cols-4">
        <Card>
          <CardContent className="pt-4 sm:pt-6 p-3 sm:p-6">
            <div className="flex items-center justify-between gap-2">
              <div className="min-w-0">
                <p className="text-xs sm:text-sm font-medium text-muted-foreground truncate">
                  Total Requested
                </p>
                <h3 className="text-lg sm:text-2xl font-bold mt-1 sm:mt-2 truncate">
                  ${totalAmount.toLocaleString()}
                </h3>
              </div>
              <DollarSign className="h-6 w-6 sm:h-8 sm:w-8 text-blue-500 flex-shrink-0" />
            </div>
          </CardContent>
        </Card>
        <Card>
          <CardContent className="pt-4 sm:pt-6 p-3 sm:p-6">
            <div className="flex items-center justify-between gap-2">
              <div className="min-w-0">
                <p className="text-xs sm:text-sm font-medium text-muted-foreground truncate">
                  Approved
                </p>
                <h3 className="text-lg sm:text-2xl font-bold mt-1 sm:mt-2 text-green-600 truncate">
                  ${approvedAmount.toLocaleString()}
                </h3>
              </div>
              <CheckCircle className="h-6 w-6 sm:h-8 sm:w-8 text-green-500 flex-shrink-0" />
            </div>
          </CardContent>
        </Card>
        <Card>
          <CardContent className="pt-4 sm:pt-6 p-3 sm:p-6">
            <div className="flex items-center justify-between gap-2">
              <div className="min-w-0">
                <p className="text-xs sm:text-sm font-medium text-muted-foreground truncate">
                  Pending
                </p>
                <h3 className="text-lg sm:text-2xl font-bold mt-1 sm:mt-2 text-yellow-600 truncate">
                  ${pendingAmount.toLocaleString()}
                </h3>
              </div>
              <AlertCircle className="h-6 w-6 sm:h-8 sm:w-8 text-yellow-500 flex-shrink-0" />
            </div>
          </CardContent>
        </Card>
        <Card>
          <CardContent className="pt-4 sm:pt-6 p-3 sm:p-6">
            <div className="flex items-center justify-between gap-2">
              <div className="min-w-0">
                <p className="text-xs sm:text-sm font-medium text-muted-foreground truncate">
                  Approval Rate
                </p>
                <h3 className="text-lg sm:text-2xl font-bold mt-1 sm:mt-2 text-blue-600 truncate">
                  {approvalRate}%
                </h3>
              </div>
              <TrendingUp className="h-6 w-6 sm:h-8 sm:w-8 text-blue-500 flex-shrink-0" />
            </div>
          </CardContent>
        </Card>
      </div>

      {/* Charts Row */}
      <div className="grid gap-4 sm:gap-6 md:grid-cols-2">
        {/* Status Breakdown Pie Chart */}
        <Card>
          <CardHeader className="p-3 sm:p-6">
            <CardTitle className="text-base sm:text-lg">Status Distribution</CardTitle>
            <CardDescription className="text-xs sm:text-sm">Breakdown by current status</CardDescription>
          </CardHeader>
          <CardContent className="p-3 sm:p-6 pt-0">
            <ResponsiveContainer width="100%" height={250} className="sm:h-[300px]">
              <PieChart>
                <Pie
                  data={statusData}
                  cx="50%"
                  cy="50%"
                  labelLine={false}
                  label={({ name, percent }) =>
                    `${name} ${(percent * 100).toFixed(0)}%`
                  }
                  outerRadius={100}
                  fill="#8884d8"
                  dataKey="value"
                >
                  {statusData.map((entry, index) => (
                    <Cell
                      key={`cell-${index}`}
                      fill={config.statusColors[entry.status] || COLORS.primary}
                    />
                  ))}
                </Pie>
                <Tooltip
                  content={({ active, payload }) => {
                    if (active && payload && payload.length) {
                      const data = payload[0].payload;
                      return (
                        <div className="bg-background border rounded-lg shadow-lg p-3">
                          <p className="font-semibold">{data.name}</p>
                          <p className="text-sm text-muted-foreground">
                            Amount:{" "}
                            <span className="font-medium text-foreground">
                              ${data.value.toLocaleString()}
                            </span>
                          </p>
                          <p className="text-sm text-muted-foreground">
                            Count:{" "}
                            <span className="font-medium text-foreground">
                              {data.count}
                            </span>
                          </p>
                        </div>
                      );
                    }
                    return null;
                  }}
                />
              </PieChart>
            </ResponsiveContainer>
          </CardContent>
        </Card>

        {/* Amount Breakdown Bar Chart */}
        {amountData.length > 0 && (
          <Card>
            <CardHeader className="p-3 sm:p-6">
              <CardTitle className="text-base sm:text-lg">Amount by Status</CardTitle>
              <CardDescription className="text-xs sm:text-sm">Total amounts in each category</CardDescription>
            </CardHeader>
            <CardContent className="p-3 sm:p-6 pt-0">
              <ResponsiveContainer width="100%" height={250} className="sm:h-[300px]">
                <BarChart data={amountData}>
                  <CartesianGrid
                    strokeDasharray="3 3"
                    className="stroke-muted"
                  />
                  <XAxis dataKey="name" tick={{ fontSize: 12 }} />
                  <YAxis tick={{ fontSize: 12 }} />
                  <Tooltip
                    content={({ active, payload }) => {
                      if (active && payload && payload.length) {
                        return (
                          <div className="bg-background border rounded-lg shadow-lg p-3">
                            <p className="font-semibold">
                              {payload[0].payload.name}
                            </p>
                            <p className="text-sm text-muted-foreground">
                              Amount:{" "}
                              <span className="font-medium text-foreground">
                                ${payload[0].value?.toLocaleString()}
                              </span>
                            </p>
                          </div>
                        );
                      }
                      return null;
                    }}
                  />
                  <Bar dataKey="amount" radius={[8, 8, 0, 0]}>
                    {amountData.map((entry, index) => (
                      <Cell key={`cell-${index}`} fill={entry.color} />
                    ))}
                  </Bar>
                </BarChart>
              </ResponsiveContainer>
            </CardContent>
          </Card>
        )}
      </div>

      {/* Monthly Trend */}
      {monthlyData.length > 0 && (
        <Card>
          <CardHeader className="p-3 sm:p-6">
            <CardTitle className="text-base sm:text-lg">Monthly Trend</CardTitle>
            <CardDescription className="text-xs sm:text-sm">Activity over time</CardDescription>
          </CardHeader>
          <CardContent className="p-3 sm:p-6 pt-0">
            <ResponsiveContainer width="100%" height={250} className="sm:h-[300px]">
              <AreaChart data={monthlyData}>
                <defs>
                  <linearGradient
                    id={`color${type}`}
                    x1="0"
                    y1="0"
                    x2="0"
                    y2="1"
                  >
                    <stop
                      offset="5%"
                      stopColor={
                        type === "allocations" ? COLORS.purple : COLORS.primary
                      }
                      stopOpacity={0.8}
                    />
                    <stop
                      offset="95%"
                      stopColor={
                        type === "allocations" ? COLORS.purple : COLORS.primary
                      }
                      stopOpacity={0}
                    />
                  </linearGradient>
                </defs>
                <CartesianGrid strokeDasharray="3 3" className="stroke-muted" />
                <XAxis dataKey="month" tick={{ fontSize: 12 }} />
                <YAxis tick={{ fontSize: 12 }} />
                <Tooltip
                  content={({ active, payload }) => {
                    if (active && payload && payload.length) {
                      return (
                        <div className="bg-background border rounded-lg shadow-lg p-3">
                          <p className="font-semibold">
                            {payload[0].payload.month}
                          </p>
                          <p className="text-sm text-muted-foreground">
                            Amount:{" "}
                            <span className="font-medium text-foreground">
                              ${payload[0].value?.toLocaleString()}
                            </span>
                          </p>
                          <p className="text-sm text-muted-foreground">
                            Count:{" "}
                            <span className="font-medium text-foreground">
                              {payload[0].payload.count}
                            </span>
                          </p>
                        </div>
                      );
                    }
                    return null;
                  }}
                />
                <Area
                  type="monotone"
                  dataKey="amount"
                  stroke={
                    type === "allocations" ? COLORS.purple : COLORS.primary
                  }
                  fillOpacity={1}
                  fill={`url(#color${type})`}
                />
              </AreaChart>
            </ResponsiveContainer>
          </CardContent>
        </Card>
      )}

      {/* Ministry Breakdown Table - Only show for admins (not contributors) */}
      {showMinistryBreakdown && (
        <Card>
          <CardHeader className="p-3 sm:p-6">
            <CardTitle className="text-base sm:text-lg">Ministry Summary</CardTitle>
            <CardDescription className="text-xs sm:text-sm">Breakdown by ministry</CardDescription>
          </CardHeader>
          <CardContent className="p-3 sm:p-6 pt-0">
            <div className="overflow-x-auto -mx-3 sm:mx-0">
              <table className="w-full min-w-[400px]">
                <thead>
                  <tr className="border-b">
                    <th className="text-left py-2 sm:py-3 px-3 sm:px-4 font-medium text-xs sm:text-sm">Ministry</th>
                    <th className="text-right py-2 sm:py-3 px-3 sm:px-4 font-medium text-xs sm:text-sm">Count</th>
                    <th className="text-right py-2 sm:py-3 px-3 sm:px-4 font-medium text-xs sm:text-sm">
                      Total Amount
                    </th>
                    <th className="text-right py-2 sm:py-3 px-3 sm:px-4 font-medium text-xs sm:text-sm hidden sm:table-cell">
                      Avg. Amount
                    </th>
                  </tr>
                </thead>
                <tbody>
                  {ministryData.map((ministry) => {
                    const avgAmount = ministry.amount / ministry.count;
                    return (
                      <tr
                        key={ministry.fullName}
                        className="border-b hover:bg-muted/50"
                      >
                        <td className="py-2 sm:py-3 px-3 sm:px-4 font-medium text-xs sm:text-sm">
                          {ministry.fullName}
                        </td>
                        <td className="text-right py-2 sm:py-3 px-3 sm:px-4 text-xs sm:text-sm">{ministry.count}</td>
                        <td className="text-right py-2 sm:py-3 px-3 sm:px-4 font-medium text-blue-600 text-xs sm:text-sm">
                          ${ministry.amount.toLocaleString()}
                        </td>
                        <td className="text-right py-2 sm:py-3 px-3 sm:px-4 text-muted-foreground text-xs sm:text-sm hidden sm:table-cell">
                          ${avgAmount.toLocaleString()}
                        </td>
                      </tr>
                    );
                  })}
                </tbody>
                <tfoot>
                  <tr className="border-t-2 font-bold">
                    <td className="py-2 sm:py-3 px-3 sm:px-4 text-xs sm:text-sm">Total</td>
                    <td className="text-right py-2 sm:py-3 px-3 sm:px-4 text-xs sm:text-sm">{totalRequests}</td>
                    <td className="text-right py-2 sm:py-3 px-3 sm:px-4 text-xs sm:text-sm">
                      ${totalAmount.toLocaleString()}
                    </td>
                    <td className="text-right py-2 sm:py-3 px-3 sm:px-4 text-xs sm:text-sm hidden sm:table-cell">
                      ${(totalAmount / totalRequests).toLocaleString()}
                    </td>
                  </tr>
                </tfoot>
              </table>
            </div>
          </CardContent>
        </Card>
      )}
    </div>
  );
};

export default BudgetSection;
