/**
 * AllocationRequestStatusBadge - Visual status indicator for allocation requests
 */

import { Badge } from "@/shared/components/ui/badge";
import {
  FileEdit,
  Clock,
  CheckCircle,
  XCircle,
  Ban,
} from "lucide-react";
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
      className={`${config.bgColor} ${config.color} ${config.borderColor} ${className}`}
    >
      <IconComponent className="h-3 w-3 mr-1" />
      {config.label}
    </Badge>
  );
}
