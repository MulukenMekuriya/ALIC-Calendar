/**
 * FlaggedMinistriesPanel - Dashboard panel showing all unresolved ministry flags
 */

import { useState } from "react";
import {
  Card,
  CardContent,
  CardDescription,
  CardHeader,
  CardTitle,
} from "@/shared/components/ui/card";
import { Badge } from "@/shared/components/ui/badge";
import { Button } from "@/shared/components/ui/button";
import { AlertTriangle, CheckCircle, ShieldAlert } from "lucide-react";
import { format, parseISO } from "date-fns";
import { useMinistryFlags } from "../hooks";
import { MinistryFlagBadge } from "./MinistryFlagBadge";
import { ResolveMinistryFlagDialog } from "./ResolveMinistryFlagDialog";
import type { MinistryFlagWithRelations } from "../types";

interface FlaggedMinistriesPanelProps {
  organizationId: string | undefined;
}

export default function FlaggedMinistriesPanel({
  organizationId,
}: FlaggedMinistriesPanelProps) {
  const { data: flags = [], isLoading } = useMinistryFlags(organizationId, {
    unresolvedOnly: true,
  });
  const [selectedFlag, setSelectedFlag] =
    useState<MinistryFlagWithRelations | null>(null);
  const [isResolveOpen, setIsResolveOpen] = useState(false);

  if (isLoading) return null;
  if (flags.length === 0) return null;

  return (
    <>
      <Card className="border-red-200 bg-red-50/30">
        <CardHeader className="pb-3">
          <div className="flex items-center justify-between">
            <div className="flex items-center gap-2">
              <ShieldAlert className="h-5 w-5 text-red-500" />
              <CardTitle className="text-lg text-red-700">
                Flagged Ministries
              </CardTitle>
            </div>
            <Badge
              variant="destructive"
              className="text-xs"
            >
              {flags.length} unresolved
            </Badge>
          </div>
          <CardDescription className="text-red-600/70">
            These ministries are blocked from submitting new expense requests
          </CardDescription>
        </CardHeader>
        <CardContent>
          <div className="space-y-3">
            {flags.map((flag) => (
              <div
                key={flag.id}
                className="flex items-start justify-between gap-3 p-3 bg-white rounded-lg border border-red-100"
              >
                <div className="flex-1 min-w-0 space-y-1.5">
                  <div className="flex items-center gap-2 flex-wrap">
                    <span className="font-medium text-sm">
                      {flag.ministry?.name || "Unknown Ministry"}
                    </span>
                    <MinistryFlagBadge flagType={flag.flag_type} />
                  </div>
                  {flag.notes && (
                    <p className="text-xs text-muted-foreground line-clamp-2">
                      {flag.notes}
                    </p>
                  )}
                  <div className="flex items-center gap-3 text-xs text-muted-foreground">
                    <span>
                      {format(parseISO(flag.created_at), "MMM d, yyyy")}
                    </span>
                    <span>by {flag.created_by_name}</span>
                    {flag.expense_request && (
                      <span className="truncate max-w-[150px]">
                        Re: {flag.expense_request.title}
                      </span>
                    )}
                  </div>
                </div>
                <Button
                  size="sm"
                  variant="outline"
                  className="shrink-0 text-green-600 hover:text-green-700 hover:bg-green-50 border-green-200"
                  onClick={() => {
                    setSelectedFlag(flag);
                    setIsResolveOpen(true);
                  }}
                >
                  <CheckCircle className="mr-1 h-3.5 w-3.5" />
                  Resolve
                </Button>
              </div>
            ))}
          </div>
        </CardContent>
      </Card>

      {selectedFlag && (
        <ResolveMinistryFlagDialog
          open={isResolveOpen}
          onOpenChange={setIsResolveOpen}
          flag={selectedFlag}
          onSuccess={() => setSelectedFlag(null)}
        />
      )}
    </>
  );
}
