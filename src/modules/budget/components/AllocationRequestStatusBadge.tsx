/**
 * AllocationRequestStatusBadge - Visual status indicator for allocation requests
 */

import { Badge } from "@/shared/components/ui/badge";
import { FileEdit, Clock, CheckCircle, XCircle, Ban, History } from "lucide-react";
import type { AllocationRequestStatus } from "../types";
import { ALLOCATION_REQUEST_STATUS_CONFIG } from "../types";

interface AllocationRequestStatusBadgeProps {
  status: AllocationRequestStatus;
  className?: string;
}

const iconMap = {
  FileEdit,
  Clock,
  CheckCircle,
  XCircle,
  Ban,
};

export function AllocationRequestStatusBadge({
  status,
  className = "",
}: AllocationRequestStatusBadgeProps) {
  const config = ALLOCATION_REQUEST_STATUS_CONFIG[status];
  const IconComponent = iconMap[config.icon as keyof typeof iconMap] || Clock;

  return (
    <Badge
      variant="outline"
      className={`${config.bgColor} ${config.color} ${config.borderColor} ${className} px-3 py-1.5 font-semibold text-sm`}
    >
      <IconComponent className="h-4 w-4 mr-1.5" />
      {config.label}
    </Badge>
  );
}

/**
 * Shown beside the status of a request copied from last year's because the
 * ministry submitted nothing by 1 November.
 */
export function CarriedOverBadge({ className = "" }: { className?: string }) {
  return (
    <Badge
      variant="outline"
      title="Nothing was submitted by the deadline, so last year's budget was carried over."
      className={`border-slate-300 bg-slate-50 text-slate-600 dark:border-slate-700 dark:bg-slate-900 dark:text-slate-300 ${className} px-2 py-1 text-xs font-medium`}
    >
      <History className="h-3.5 w-3.5 mr-1" />
      Carried over
    </Badge>
  );
}
