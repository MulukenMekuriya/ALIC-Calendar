/**
 * Budget Alerts Utility
 * Provides budget threshold monitoring and alert generation
 */

import type { MinistryBudgetSummary } from "../types";

// Alert severity levels
export type AlertSeverity = "info" | "warning" | "critical";

// Budget alert types
export type BudgetAlertType =
  | "approaching_limit"
  | "exceeded_limit"
  | "high_pending"
  | "no_allocation"
  | "low_remaining";

export interface BudgetAlert {
  id: string;
  type: BudgetAlertType;
  severity: AlertSeverity;
  title: string;
  message: string;
  ministryId: string;
  ministryName: string;
  fiscalYearId: string;
  percentage?: number;
  amount?: number;
  createdAt: string;
}

// Alert thresholds configuration
export interface AlertThresholds {
  warningPercentage: number;  // e.g., 75 - warn when 75% used
  criticalPercentage: number; // e.g., 90 - critical when 90% used
  highPendingPercentage: number; // e.g., 50 - warn when 50% is pending
  lowRemainingAmount: number; // e.g., 1000 - warn when less than $1000 remaining
}

export const DEFAULT_THRESHOLDS: AlertThresholds = {
  warningPercentage: 75,
  criticalPercentage: 90,
  highPendingPercentage: 50,
  lowRemainingAmount: 1000,
};

/**
 * Generate budget alerts for a ministry based on its budget summary
 */
export const generateMinistryAlerts = (
  summary: MinistryBudgetSummary,
  thresholds: AlertThresholds = DEFAULT_THRESHOLDS
): BudgetAlert[] => {
  const alerts: BudgetAlert[] = [];
  const now = new Date().toISOString();

  // Check for no allocation
  if (summary.allocated_amount === 0) {
    alerts.push({
      id: `${summary.ministry_id}-no-allocation`,
      type: "no_allocation",
      severity: "warning",
      title: "No Budget Allocated",
      message: `${summary.ministry_name} has no budget allocated for ${summary.fiscal_year_name}.`,
      ministryId: summary.ministry_id,
      ministryName: summary.ministry_name,
      fiscalYearId: summary.fiscal_year_id,
      createdAt: now,
    });
    return alerts; // No point checking other thresholds
  }

  const totalCommitted = summary.total_pending + summary.total_approved + summary.total_spent;
  const usagePercentage = (totalCommitted / summary.allocated_amount) * 100;
  const spentPercentage = (summary.total_spent / summary.allocated_amount) * 100;
  const pendingPercentage = (summary.total_pending / summary.allocated_amount) * 100;

  // Check if budget is exceeded
  if (usagePercentage >= 100) {
    alerts.push({
      id: `${summary.ministry_id}-exceeded`,
      type: "exceeded_limit",
      severity: "critical",
      title: "Budget Exceeded",
      message: `${summary.ministry_name} has exceeded its budget by ${formatCurrency(totalCommitted - summary.allocated_amount)}.`,
      ministryId: summary.ministry_id,
      ministryName: summary.ministry_name,
      fiscalYearId: summary.fiscal_year_id,
      percentage: Math.round(usagePercentage),
      amount: totalCommitted - summary.allocated_amount,
      createdAt: now,
    });
  }
  // Check if approaching critical threshold
  else if (usagePercentage >= thresholds.criticalPercentage) {
    alerts.push({
      id: `${summary.ministry_id}-critical`,
      type: "approaching_limit",
      severity: "critical",
      title: "Budget Nearly Exhausted",
      message: `${summary.ministry_name} has used ${Math.round(usagePercentage)}% of its budget. Only ${formatCurrency(summary.remaining)} remaining.`,
      ministryId: summary.ministry_id,
      ministryName: summary.ministry_name,
      fiscalYearId: summary.fiscal_year_id,
      percentage: Math.round(usagePercentage),
      amount: summary.remaining,
      createdAt: now,
    });
  }
  // Check if approaching warning threshold
  else if (usagePercentage >= thresholds.warningPercentage) {
    alerts.push({
      id: `${summary.ministry_id}-warning`,
      type: "approaching_limit",
      severity: "warning",
      title: "Budget Usage High",
      message: `${summary.ministry_name} has used ${Math.round(usagePercentage)}% of its budget.`,
      ministryId: summary.ministry_id,
      ministryName: summary.ministry_name,
      fiscalYearId: summary.fiscal_year_id,
      percentage: Math.round(usagePercentage),
      amount: summary.remaining,
      createdAt: now,
    });
  }

  // Check for high pending amounts
  if (pendingPercentage >= thresholds.highPendingPercentage) {
    alerts.push({
      id: `${summary.ministry_id}-high-pending`,
      type: "high_pending",
      severity: "info",
      title: "High Pending Expenses",
      message: `${summary.ministry_name} has ${formatCurrency(summary.total_pending)} (${Math.round(pendingPercentage)}%) in pending expenses.`,
      ministryId: summary.ministry_id,
      ministryName: summary.ministry_name,
      fiscalYearId: summary.fiscal_year_id,
      percentage: Math.round(pendingPercentage),
      amount: summary.total_pending,
      createdAt: now,
    });
  }

  // Check for low remaining budget
  if (summary.remaining > 0 && summary.remaining < thresholds.lowRemainingAmount) {
    alerts.push({
      id: `${summary.ministry_id}-low-remaining`,
      type: "low_remaining",
      severity: "warning",
      title: "Low Remaining Budget",
      message: `${summary.ministry_name} has only ${formatCurrency(summary.remaining)} remaining in budget.`,
      ministryId: summary.ministry_id,
      ministryName: summary.ministry_name,
      fiscalYearId: summary.fiscal_year_id,
      amount: summary.remaining,
      createdAt: now,
    });
  }

  return alerts;
};

/**
 * Generate alerts for all ministries in an organization
 */
export const generateOrganizationAlerts = (
  summaries: MinistryBudgetSummary[],
  thresholds: AlertThresholds = DEFAULT_THRESHOLDS
): BudgetAlert[] => {
  const allAlerts: BudgetAlert[] = [];

  for (const summary of summaries) {
    const ministryAlerts = generateMinistryAlerts(summary, thresholds);
    allAlerts.push(...ministryAlerts);
  }

  // Sort by severity (critical first, then warning, then info)
  const severityOrder: Record<AlertSeverity, number> = {
    critical: 0,
    warning: 1,
    info: 2,
  };

  return allAlerts.sort((a, b) => severityOrder[a.severity] - severityOrder[b.severity]);
};

/**
 * Get alert badge color based on severity
 */
export const getAlertSeverityColor = (severity: AlertSeverity): {
  bg: string;
  text: string;
  border: string;
  icon: string;
} => {
  switch (severity) {
    case "critical":
      return {
        bg: "bg-red-50",
        text: "text-red-700",
        border: "border-red-200",
        icon: "text-red-500",
      };
    case "warning":
      return {
        bg: "bg-amber-50",
        text: "text-amber-700",
        border: "border-amber-200",
        icon: "text-amber-500",
      };
    case "info":
    default:
      return {
        bg: "bg-blue-50",
        text: "text-blue-700",
        border: "border-blue-200",
        icon: "text-blue-500",
      };
  }
};

/**
 * Check if any critical alerts exist
 */
export const hasCriticalAlerts = (alerts: BudgetAlert[]): boolean => {
  return alerts.some((alert) => alert.severity === "critical");
};

/**
 * Get alert count by severity
 */
export const getAlertCounts = (alerts: BudgetAlert[]): Record<AlertSeverity, number> => {
  return alerts.reduce(
    (counts, alert) => {
      counts[alert.severity]++;
      return counts;
    },
    { critical: 0, warning: 0, info: 0 }
  );
};

// Helper function
const formatCurrency = (amount: number): string => {
  return new Intl.NumberFormat("en-US", {
    style: "currency",
    currency: "USD",
  }).format(amount);
};
