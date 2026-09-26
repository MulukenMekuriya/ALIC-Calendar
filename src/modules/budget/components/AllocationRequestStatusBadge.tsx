/**
 * AllocationRequestStatusBadge - Visual status indicator for allocation requests
 */

import { Badge } from "@/shared/components/ui/badge";
import { FileEdit, Clock, CheckCircle, XCircle, Ban, Users } from "lucide-react";
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
  Users,
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
