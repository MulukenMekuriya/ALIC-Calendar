/**
 * MinistryFlagBadge - Red alert badge for flagged ministries
 */

import { AlertTriangle, FileWarning } from "lucide-react";
import { Badge } from "@/shared/components/ui/badge";
import {
  Tooltip,
  TooltipContent,
  TooltipProvider,
  TooltipTrigger,
} from "@/shared/components/ui/tooltip";
import { cn } from "@/lib/utils";
import type { MinistryFlagType } from "../types";
import { MINISTRY_FLAG_TYPE_CONFIG } from "../types";

interface MinistryFlagBadgeProps {
  flagType: MinistryFlagType;
  count?: number;
  showLabel?: boolean;
}

export function MinistryFlagBadge({
  flagType,
  count = 1,
  showLabel = true,
}: MinistryFlagBadgeProps) {
  const config = MINISTRY_FLAG_TYPE_CONFIG[flagType];
  const Icon = flagType === "missing_receipts" ? FileWarning : AlertTriangle;

  return (
    <TooltipProvider delayDuration={200}>
      <Tooltip>
        <TooltipTrigger asChild>
          <Badge
            variant="outline"
            className={cn(
              "font-semibold animate-pulse text-xs px-2 py-0.5",
              config.bgColor,
              config.borderColor,
              config.color
            )}
          >
            <Icon className={cn("mr-1 h-3 w-3", config.color)} />
            {showLabel && config.label}
            {count > 1 && ` (${count})`}
          </Badge>
        </TooltipTrigger>
        <TooltipContent>
          <p>{config.description}</p>
        </TooltipContent>
      </Tooltip>
    </TooltipProvider>
  );
}

interface MinistryBlockedIndicatorProps {
  isBlocked: boolean;
  flagCount?: number;
}

export function MinistryBlockedIndicator({
  isBlocked,
  flagCount = 0,
}: MinistryBlockedIndicatorProps) {
  if (!isBlocked) return null;

  return (
    <TooltipProvider delayDuration={200}>
      <Tooltip>
        <TooltipTrigger asChild>
          <span className="inline-flex items-center">
            <AlertTriangle className="h-4 w-4 text-red-500 animate-pulse" />
          </span>
        </TooltipTrigger>
        <TooltipContent>
          <p className="font-medium text-red-600">Ministry Blocked</p>
          <p className="text-xs">
            {flagCount > 0
              ? `${flagCount} unresolved flag${flagCount !== 1 ? "s" : ""} — new expense requests are blocked`
              : "Unresolved flags — new expense requests are blocked"}
          </p>
        </TooltipContent>
      </Tooltip>
    </TooltipProvider>
  );
}
