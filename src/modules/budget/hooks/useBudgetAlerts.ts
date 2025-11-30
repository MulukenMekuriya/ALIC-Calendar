/**
 * useBudgetAlerts Hook
 * Provides budget alert monitoring for ministries
 */

import { useMemo } from "react";
import { useQuery } from "@tanstack/react-query";
import { budgetAllocationService } from "../services";
import {
  generateOrganizationAlerts,
  type BudgetAlert,
  type AlertThresholds,
  DEFAULT_THRESHOLDS,
} from "../utils/budgetAlerts";

// Query keys
export const budgetAlertKeys = {
  all: ["budget-alerts"] as const,
  organization: (orgId: string, fiscalYearId: string) =>
    [...budgetAlertKeys.all, "organization", orgId, fiscalYearId] as const,
};

interface UseBudgetAlertsOptions {
  thresholds?: AlertThresholds;
  enabled?: boolean;
}

/**
 * Hook to get budget alerts for an organization
 */
export const useBudgetAlerts = (
  organizationId: string | undefined,
  fiscalYearId: string | undefined,
  options: UseBudgetAlertsOptions = {}
) => {
  const { thresholds = DEFAULT_THRESHOLDS, enabled = true } = options;

  const { data: budgetSummary, isLoading, error } = useQuery({
    queryKey: budgetAlertKeys.organization(organizationId || "", fiscalYearId || ""),
    queryFn: () =>
      budgetAllocationService.getOrganizationBudgetSummary(organizationId!, fiscalYearId!),
    enabled: enabled && !!organizationId && !!fiscalYearId,
    staleTime: 5 * 60 * 1000, // 5 minutes
    refetchInterval: 5 * 60 * 1000, // Refresh every 5 minutes
  });

  const alerts = useMemo<BudgetAlert[]>(() => {
    if (!budgetSummary?.ministry_summaries) return [];
    return generateOrganizationAlerts(budgetSummary.ministry_summaries, thresholds);
  }, [budgetSummary?.ministry_summaries, thresholds]);

  const alertCounts = useMemo(() => {
    return alerts.reduce(
      (counts, alert) => {
        counts[alert.severity]++;
        counts.total++;
        return counts;
      },
      { critical: 0, warning: 0, info: 0, total: 0 }
    );
  }, [alerts]);

  const hasCriticalAlerts = alertCounts.critical > 0;
  const hasWarningAlerts = alertCounts.warning > 0;

  return {
    alerts,
    alertCounts,
    hasCriticalAlerts,
    hasWarningAlerts,
    isLoading,
    error,
    budgetSummary,
  };
};

/**
 * Hook to get alerts for a specific ministry
 */
export const useMinistryBudgetAlerts = (
  ministryId: string | undefined,
  fiscalYearId: string | undefined,
  options: UseBudgetAlertsOptions = {}
) => {
  const { thresholds = DEFAULT_THRESHOLDS, enabled = true } = options;

  const { data: summary, isLoading, error } = useQuery({
    queryKey: ["ministry-budget-summary", ministryId, fiscalYearId],
    queryFn: () =>
      budgetAllocationService.getMinistryBudgetSummary(ministryId!, fiscalYearId!),
    enabled: enabled && !!ministryId && !!fiscalYearId,
    staleTime: 5 * 60 * 1000,
  });

  const alerts = useMemo<BudgetAlert[]>(() => {
    if (!summary) return [];
    return generateOrganizationAlerts([summary], thresholds);
  }, [summary, thresholds]);

  return {
    alerts,
    isLoading,
    error,
    summary,
  };
};
