/**
 * BudgetAlertsPanel - Displays budget alerts for an organization
 */

import { AlertTriangle, AlertCircle, Info, Bell, X } from "lucide-react";
import { useState } from "react";
import { Button } from "@/shared/components/ui/button";
import {
  Card,
  CardContent,
  CardDescription,
  CardHeader,
  CardTitle,
} from "@/shared/components/ui/card";
import { Badge } from "@/shared/components/ui/badge";
import { useBudgetAlerts } from "../hooks/useBudgetAlerts";
import { getAlertSeverityColor, type BudgetAlert, type AlertSeverity } from "../utils/budgetAlerts";

interface BudgetAlertsPanelProps {
  organizationId: string | undefined;
  fiscalYearId: string | undefined;
  compact?: boolean;
  maxAlerts?: number;
}

const SeverityIcon = ({ severity }: { severity: AlertSeverity }) => {
  const iconClass = "h-4 w-4";
  switch (severity) {
    case "critical":
      return <AlertTriangle className={iconClass} />;
    case "warning":
      return <AlertCircle className={iconClass} />;
    case "info":
    default:
      return <Info className={iconClass} />;
  }
};

export function BudgetAlertsPanel({
  organizationId,
  fiscalYearId,
  compact = false,
  maxAlerts = 5,
}: BudgetAlertsPanelProps) {
  const [dismissedAlerts, setDismissedAlerts] = useState<Set<string>>(new Set());
  const [showAll, setShowAll] = useState(false);

  const { alerts, alertCounts, isLoading } = useBudgetAlerts(
    organizationId,
    fiscalYearId
  );

  const visibleAlerts = alerts
    .filter((alert) => !dismissedAlerts.has(alert.id))
    .slice(0, showAll ? undefined : maxAlerts);

  const dismissAlert = (alertId: string) => {
    setDismissedAlerts((prev) => new Set([...prev, alertId]));
  };

  if (isLoading) {
    return (
      <Card className={compact ? "border-0 shadow-none" : ""}>
        <CardContent className="py-4">
          <div className="flex items-center gap-2 text-muted-foreground">
            <Bell className="h-4 w-4 animate-pulse" />
            <span className="text-sm">Checking budget alerts...</span>
          </div>
        </CardContent>
      </Card>
    );
  }

  if (visibleAlerts.length === 0) {
    if (compact) return null;

    return (
      <Card>
        <CardContent className="py-6">
          <div className="flex items-center justify-center gap-2 text-muted-foreground">
            <Bell className="h-5 w-5" />
            <span>No budget alerts at this time</span>
          </div>
        </CardContent>
      </Card>
    );
  }

  return (
    <Card className={compact ? "border-0 shadow-none bg-transparent" : ""}>
      {!compact && (
        <CardHeader className="pb-3">
          <div className="flex items-center justify-between">
            <div>
              <CardTitle className="text-lg flex items-center gap-2">
                <Bell className="h-5 w-5" />
                Budget Alerts
              </CardTitle>
              <CardDescription>
                {alertCounts.total} active alert{alertCounts.total !== 1 ? "s" : ""}
              </CardDescription>
            </div>
            <div className="flex gap-2">
              {alertCounts.critical > 0 && (
                <Badge variant="destructive">{alertCounts.critical} Critical</Badge>
              )}
              {alertCounts.warning > 0 && (
                <Badge variant="outline" className="border-amber-500 text-amber-600">
                  {alertCounts.warning} Warning
                </Badge>
              )}
            </div>
          </div>
        </CardHeader>
      )}

      <CardContent className={compact ? "p-0" : "pt-0"}>
        <div className="space-y-2">
          {visibleAlerts.map((alert) => (
            <AlertItem
              key={alert.id}
              alert={alert}
              onDismiss={() => dismissAlert(alert.id)}
              compact={compact}
            />
          ))}
        </div>

        {alerts.length > maxAlerts && !showAll && (
          <Button
            variant="ghost"
            size="sm"
            className="w-full mt-3 text-muted-foreground"
            onClick={() => setShowAll(true)}
          >
            Show {alerts.length - maxAlerts} more alerts
          </Button>
        )}
      </CardContent>
    </Card>
  );
}

interface AlertItemProps {
  alert: BudgetAlert;
  onDismiss: () => void;
  compact?: boolean;
}

function AlertItem({ alert, onDismiss, compact }: AlertItemProps) {
  const colors = getAlertSeverityColor(alert.severity);

  return (
    <div
      className={`
        flex items-start gap-3 p-3 rounded-lg border
        ${colors.bg} ${colors.border}
        ${compact ? "py-2" : ""}
      `}
    >
      <div className={`mt-0.5 ${colors.icon}`}>
        <SeverityIcon severity={alert.severity} />
      </div>

      <div className="flex-1 min-w-0">
        <div className="flex items-center gap-2">
          <span className={`font-medium text-sm ${colors.text}`}>
            {alert.title}
          </span>
          {alert.percentage !== undefined && (
            <Badge variant="secondary" className="text-xs">
              {alert.percentage}%
            </Badge>
          )}
        </div>
        <p className="text-sm text-muted-foreground mt-0.5 line-clamp-2">
          {alert.message}
        </p>
      </div>

      <Button
        variant="ghost"
        size="icon"
        className="h-6 w-6 shrink-0 text-muted-foreground hover:text-foreground"
        onClick={onDismiss}
      >
        <X className="h-3 w-3" />
      </Button>
    </div>
  );
}

/**
 * Compact alert badge for header/navbar display
 */
export function BudgetAlertsBadge({
  organizationId,
  fiscalYearId,
}: {
  organizationId: string | undefined;
  fiscalYearId: string | undefined;
}) {
  const { alertCounts, hasCriticalAlerts, hasWarningAlerts } = useBudgetAlerts(
    organizationId,
    fiscalYearId
  );

  if (alertCounts.total === 0) return null;

  return (
    <div className="relative">
      <Bell className={`h-5 w-5 ${hasCriticalAlerts ? "text-red-500" : hasWarningAlerts ? "text-amber-500" : "text-muted-foreground"}`} />
      {alertCounts.total > 0 && (
        <span
          className={`
            absolute -top-1 -right-1 h-4 min-w-4 px-1
            flex items-center justify-center
            text-[10px] font-bold text-white rounded-full
            ${hasCriticalAlerts ? "bg-red-500" : hasWarningAlerts ? "bg-amber-500" : "bg-blue-500"}
          `}
        >
          {alertCounts.total}
        </span>
      )}
    </div>
  );
}
