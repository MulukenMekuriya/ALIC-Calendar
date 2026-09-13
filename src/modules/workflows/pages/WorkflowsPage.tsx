/**
 * Follow-up — the board of people somebody owes a phone call.
 *
 * Overdue first, always. A follow-up list sorted by anything else is a list
 * whose top is a matter of taste, and the whole value of the board is that the
 * thing at the top is the thing that has been waiting longest.
 */

import { useEffect, useMemo, useState } from "react";
import DashboardLayout from "@/shared/components/layout/DashboardLayout";
import {
  Card,
  CardContent,
  CardDescription,
  CardHeader,
  CardTitle,
} from "@/shared/components/ui/card";
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from "@/shared/components/ui/table";
import { Button } from "@/shared/components/ui/button";
import { Badge } from "@/shared/components/ui/badge";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/shared/components/ui/select";
import {
  Route,
  Loader2,
  AlertTriangle,
  Sparkles,
  UserRound,
  Plus,
} from "lucide-react";
import { useOrganization } from "@/shared/contexts/OrganizationContext";
import { useCapabilities } from "@/shared/hooks/useCapabilities";
import { workflowService } from "../services";
import {
  useWorkflowSummaries,
  useWorkflowBoard,
} from "../hooks";
import { CardSheet } from "../components/CardSheet";
import { AddToWorkflowDialog } from "../components/AddToWorkflowDialog";
import type { BoardCard } from "../types";

export default function WorkflowsPage() {
  const { currentOrganization } = useOrganization();
  const { can } = useCapabilities();
  const orgId = currentOrganization?.id;
  const canManage = can("members.write");

  const [workflowId, setWorkflowId] = useState<string | null>(null);
  const [includeClosed, setIncludeClosed] = useState(false);
  const [onlyMine, setOnlyMine] = useState(false);
  const [openCard, setOpenCard] = useState<BoardCard | null>(null);
  const [adding, setAdding] = useState(false);

  const { data: summaries, isLoading: summariesLoading } = useWorkflowSummaries(orgId);
  const { data: cards, isLoading: cardsLoading } = useWorkflowBoard(
    orgId,
    workflowId,
    includeClosed,
    onlyMine
  );

  // Land on the first workflow rather than an "all" view nobody asked for.
  useEffect(() => {
    if (!workflowId && summaries && summaries.length > 0) {
      setWorkflowId(summaries[0].workflow_id);
    }
  }, [summaries, workflowId]);

  // A snooze that has expired should be back on the board the next time
  // somebody looks at it, without waiting for a cron tick.
  useEffect(() => {
    if (orgId) void workflowService.wakeSnoozed(orgId).catch(() => undefined);
  }, [orgId]);

  const current = useMemo(
    () => summaries?.find((s) => s.workflow_id === workflowId),
    [summaries, workflowId]
  );

  if (!orgId) {
    return (
      <DashboardLayout>
        <p className="text-muted-foreground">No organization in context.</p>
      </DashboardLayout>
    );
  }

  return (
    <DashboardLayout>
      <div className="space-y-4 sm:space-y-6">
        <div className="flex flex-col gap-3 sm:flex-row sm:items-start sm:justify-between">
          <div className="flex items-start gap-3">
            <div className="p-2 rounded-xl bg-primary/10">
              <Route className="h-6 w-6 text-primary" />
            </div>
            <div>
              <h1 className="text-2xl sm:text-3xl font-bold">Follow-up</h1>
              <p className="text-sm text-muted-foreground mt-1">
                {currentOrganization?.name ?? "Pipelines"}
              </p>
            </div>
          </div>
          {canManage && (
            <Button onClick={() => setAdding(true)} disabled={!workflowId}>
              <Plus className="h-4 w-4 mr-1" />
              Add somebody
            </Button>
          )}
        </div>

        {summariesLoading ? (
          <div className="flex items-center justify-center py-16 text-muted-foreground">
            <Loader2 className="h-5 w-5 animate-spin mr-2" />
            Loading workflows…
          </div>
        ) : (summaries?.length ?? 0) === 0 ? (
          <Card>
            <CardContent className="py-12 text-center text-sm text-muted-foreground">
              No workflows in this branch yet.
            </CardContent>
          </Card>
        ) : (
          <>
            <div className="grid gap-3 sm:grid-cols-2 lg:grid-cols-3">
              {summaries!.map((summary) => (
                <button
                  key={summary.workflow_id}
                  onClick={() => setWorkflowId(summary.workflow_id)}
                  className={
                    "rounded-lg border p-4 text-left transition-colors " +
                    (summary.workflow_id === workflowId
                      ? "border-primary bg-primary/5"
                      : "hover:bg-muted/50")
                  }
                >
                  <div className="flex items-start justify-between gap-2">
                    <span className="font-semibold">{summary.name}</span>
                    {summary.auto_add_on_status_code && (
                      <Badge variant="secondary" className="shrink-0">
                        <Sparkles className="h-3 w-3 mr-1" />
                        automatic
                      </Badge>
                    )}
                  </div>
                  <div className="mt-2 flex flex-wrap gap-x-4 gap-y-1 text-sm">
                    <span>
                      <strong className="tabular-nums">{summary.open_count}</strong>{" "}
                      <span className="text-muted-foreground">open</span>
                    </span>
                    {summary.overdue_count > 0 && (
                      <span className="text-destructive">
                        <strong className="tabular-nums">{summary.overdue_count}</strong> overdue
                      </span>
                    )}
                    {summary.my_count > 0 && (
                      <span>
                        <strong className="tabular-nums">{summary.my_count}</strong>{" "}
                        <span className="text-muted-foreground">mine</span>
                      </span>
                    )}
                    <span className="text-muted-foreground">
                      {summary.completed_30d} finished in 30 days
                    </span>
                  </div>
                </button>
              ))}
            </div>

            <Card>
              <CardHeader className="pb-3">
                <div className="flex flex-wrap items-start justify-between gap-3">
                  <div>
                    <CardTitle className="text-base">
                      {current?.name ?? "Board"}
                    </CardTitle>
                    {current?.description && (
                      <CardDescription>{current.description}</CardDescription>
                    )}
                  </div>
                  <div className="flex gap-2">
                    <Button
                      variant={onlyMine ? "default" : "outline"}
                      size="sm"
                      onClick={() => setOnlyMine((v) => !v)}
                    >
                      <UserRound className="h-4 w-4 mr-1" />
                      Mine only
                    </Button>
                    <Select
                      value={includeClosed ? "all" : "open"}
                      onValueChange={(v) => setIncludeClosed(v === "all")}
                    >
                      <SelectTrigger className="w-36"><SelectValue /></SelectTrigger>
                      <SelectContent>
                        <SelectItem value="open">Open only</SelectItem>
                        <SelectItem value="all">Include finished</SelectItem>
                      </SelectContent>
                    </Select>
                  </div>
                </div>
              </CardHeader>
              <CardContent className="p-0">
                {cardsLoading ? (
                  <div className="flex items-center justify-center py-12 text-muted-foreground">
                    <Loader2 className="h-5 w-5 animate-spin mr-2" />
                    Loading the board…
                  </div>
                ) : (cards?.length ?? 0) === 0 ? (
                  <p className="py-12 text-center text-sm text-muted-foreground">
                    {onlyMine
                      ? "Nothing is assigned to you."
                      : "Nobody is in this workflow right now."}
                  </p>
                ) : (
                  <div className="overflow-x-auto">
                    <Table>
                      <TableHeader>
                        <TableRow>
                          <TableHead>Person</TableHead>
                          <TableHead>Step</TableHead>
                          <TableHead>Assigned to</TableHead>
                          <TableHead>Due</TableHead>
                          <TableHead>Last note</TableHead>
                        </TableRow>
                      </TableHeader>
                      <TableBody>
                        {cards!.map((card) => (
                          <TableRow
                            key={card.card_id}
                            className="cursor-pointer"
                            onClick={() => setOpenCard(card)}
                          >
                            <TableCell>
                              <span className="font-medium">{card.person_name}</span>
                              {card.household_name && (
                                <span className="block text-xs text-muted-foreground">
                                  {card.household_name}
                                </span>
                              )}
                            </TableCell>
                            <TableCell className="whitespace-nowrap">
                              {card.step_name ?? "—"}
                              <span className="block text-xs text-muted-foreground">
                                day {card.days_in_step}
                              </span>
                            </TableCell>
                            <TableCell className="whitespace-nowrap">
                              {card.assignee_name ?? (
                                <Badge variant="outline" className="text-amber-700">
                                  unassigned
                                </Badge>
                              )}
                            </TableCell>
                            <TableCell className="whitespace-nowrap">
                              {card.status === "completed" || card.status === "removed" ? (
                                <Badge variant="secondary">
                                  {card.status === "completed" ? "finished" : "removed"}
                                </Badge>
                              ) : card.is_overdue ? (
                                <span className="inline-flex items-center text-destructive font-medium">
                                  <AlertTriangle className="h-3.5 w-3.5 mr-1" />
                                  {card.due_on}
                                </span>
                              ) : card.status === "snoozed" ? (
                                <span className="text-muted-foreground">
                                  snoozed to {card.snooze_until}
                                </span>
                              ) : (
                                (card.due_on ?? "—")
                              )}
                            </TableCell>
                            <TableCell className="max-w-[18rem]">
                              <span className="block truncate text-sm text-muted-foreground">
                                {card.last_note ?? "—"}
                              </span>
                            </TableCell>
                          </TableRow>
                        ))}
                      </TableBody>
                    </Table>
                  </div>
                )}
              </CardContent>
            </Card>
          </>
        )}
      </div>

      <CardSheet
        card={openCard}
        workflowId={workflowId}
        onOpenChange={(open) => { if (!open) setOpenCard(null); }}
        canManage={canManage}
      />

      <AddToWorkflowDialog
        open={adding}
        onOpenChange={setAdding}
        organizationId={orgId}
        workflowId={workflowId}
        workflowName={current?.name ?? ""}
      />
    </DashboardLayout>
  );
}
