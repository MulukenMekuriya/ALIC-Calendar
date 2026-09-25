/**
 * Attendance history and the exceptions review.
 *
 * The exceptions report is sourced from check_in_audit rather than from the
 * check-in rows, because a DENIED attempt leaves no check-in row at all — a
 * report built only from check-ins would show a clean sheet on exactly the
 * Sundays that most need reviewing.
 */

import { Fragment, useMemo, useState } from "react";
import {
  Card,
  CardContent,
  CardDescription,
  CardHeader,
  CardTitle,
} from "@/shared/components/ui/card";
import { Button } from "@/shared/components/ui/button";
import { Input } from "@/shared/components/ui/input";
import { Label } from "@/shared/components/ui/label";
import { Badge } from "@/shared/components/ui/badge";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/shared/components/ui/tabs";
import {
  Table,
  TableBody,
  TableCell,
  TableFooter,
  TableHead,
  TableHeader,
  TableRow,
} from "@/shared/components/ui/table";
import {
  ChevronDown,
  ChevronRight,
  Download,
  Loader2,
} from "lucide-react";
import {
  toCSV,
  withUTF8BOM,
  downloadFile,
  getDateStamp,
} from "@/shared/lib/exportPrimitives";
import { useKidsAttendance, useKidsExceptions } from "../hooks/useKidsLeader";
import { LatePickupsPanel } from "./LatePickupsPanel";
import { ConsentCoverageCard } from "./ConsentCoverageCard";
import { ConsentRuleCard } from "./ConsentRuleCard";
import { AccessLogPanel } from "./AccessLogPanel";
import { useConsentPolicy } from "../hooks/useConsent";
import { useCapabilities } from "@/shared/hooks/useCapabilities";
import type {
  ExceptionCategory,
  ExceptionRow,
} from "../services/kidsLeaderService";
import {
  groupByDay,
  sumAttendance,
  type AttendanceTotals,
} from "../utils/attendanceTotals";

/** Default window: the last 12 weeks, which is about a quarter of Sundays. */
function defaultRange() {
  const to = new Date();
  const from = new Date();
  from.setDate(from.getDate() - 84);
  return { from: from.toISOString().slice(0, 10), to: to.toISOString().slice(0, 10) };
}

/**
 * The five numeric cells of a total row. Shared so a day subtotal and the
 * grand total cannot drift apart in which columns they fill or how they
 * align — the bug where a footer silently omits a column is invisible until
 * somebody adds the numbers up by hand.
 */
function TotalCells({ totals }: { totals: AttendanceTotals }) {
  return (
    <>
      <TableCell className="text-right font-medium tabular-nums">
        {totals.children}
      </TableCell>
      <TableCell className="text-right font-medium tabular-nums">
        {totals.first_time_visitors}
      </TableCell>
      <TableCell className="text-right font-medium tabular-nums">
        {totals.volunteers}
      </TableCell>
      <TableCell className="text-right font-medium tabular-nums">
        {totals.overrides}
      </TableCell>
      <TableCell className="text-right font-medium tabular-nums">
        {totals.not_checked_out}
      </TableCell>
    </>
  );
}

/**
 * How each category of exception is introduced, in the order the SQL returns
 * them. Grouping rather than one flat list, because 164 children nobody
 * recorded collecting and 108 routine age-band placements are not the same
 * kind of event and must not share a scrollbar.
 */
const EXCEPTION_GROUPS: {
  category: ExceptionCategory;
  title: string;
  blurb: string;
  tone: "serious" | "neutral";
  startsOpen: boolean;
}[] = [
  {
    category: "not_collected",
    title: "Never collected",
    blurb:
      "Nobody recorded collecting these children. The record was closed off automatically after the service.",
    tone: "serious",
    startsOpen: true,
  },
  {
    category: "refused",
    title: "Refused",
    blurb: "Pickup codes that did not match, and blocked pickup attempts.",
    tone: "serious",
    startsOpen: true,
  },
  {
    category: "override",
    title: "Overrides",
    blurb: "A leader released a child, or a full room was used anyway.",
    tone: "serious",
    startsOpen: true,
  },
  {
    category: "error",
    title: "Errors",
    blurb: "Something failed part-way through.",
    tone: "serious",
    startsOpen: true,
  },
  {
    category: "transfer",
    title: "Transfers",
    blurb: "Children moved between classrooms mid-service.",
    tone: "neutral",
    startsOpen: false,
  },
  {
    category: "placement",
    title: "Placed without a grade",
    blurb:
      "These children have no school grade on file, so check-in used their age instead. Worth fixing in the directory, but nothing went wrong on the day.",
    tone: "neutral",
    startsOpen: false,
  },
];

/**
 * Where rows land when the server does not group them.
 *
 * `category` arrives with a migration. Until that is deployed — and again if it
 * is ever rolled back — every row comes back without one, and grouping by a
 * field that does not exist would render NOTHING while the tab badge still
 * said 124. A safety report that silently shows an empty list is worse than
 * the unsorted list it replaced, so unknown and missing categories fall
 * through to here rather than disappearing.
 */
const UNGROUPED = {
  category: "__ungrouped__" as ExceptionCategory,
  title: "Exceptions",
  blurb: "Overrides, refused pickups and children never collected.",
  tone: "serious" as const,
  startsOpen: true,
};

const KNOWN_CATEGORIES = new Set<string>(EXCEPTION_GROUPS.map((g) => g.category));

interface KidsReportsTabProps {
  organizationId: string | undefined;
  /** kids.write — a leader who may send a note or dismiss one. */
  canReview?: boolean;
}

export function KidsReportsTab({
  organizationId,
  canReview = false,
}: KidsReportsTabProps) {
  const initial = defaultRange();
  const [from, setFrom] = useState(initial.from);
  const [to, setTo] = useState(initial.to);

  // Only a kids_admin may change the rule. kids.write is that grant's
  // capability; a leadership_viewer reading this tab sees the card without
  // the buttons.
  const { can } = useCapabilities();
  const canWrite = can("kids.write");

  // The card's countdown needs the date, and the date lives on the policy.
  const policy = useConsentPolicy(organizationId);
  const enforceFrom = policy.data?.enforce_from ?? null;

  const attendance = useKidsAttendance(organizationId, from, to);
  const exceptions = useKidsExceptions(organizationId, from, to);

  const days = useMemo(() => groupByDay(attendance.data ?? []), [attendance.data]);
  const grand = useMemo(() => sumAttendance(attendance.data ?? []), [attendance.data]);

  const [openGroups, setOpenGroups] = useState<
    Partial<Record<ExceptionCategory, boolean>>
  >({});

  const byCategory = useMemo(() => {
    const map = new Map<ExceptionCategory, ExceptionRow[]>();
    for (const row of exceptions.data ?? []) {
      // A row whose category the client does not recognise still has to be
      // shown. Never drop a safety row on the floor because a column is
      // missing or a value is newer than this build.
      const key = KNOWN_CATEGORIES.has(row.category)
        ? row.category
        : UNGROUPED.category;
      const bucket = map.get(key);
      if (bucket) bucket.push(row);
      else map.set(key, [row]);
    }
    return map;
  }, [exceptions.data]);

  // Only offer the groups that actually have rows, plus the catch-all when
  // anything landed in it.
  const groupsToRender = useMemo(
    () =>
      byCategory.has(UNGROUPED.category)
        ? [...EXCEPTION_GROUPS, UNGROUPED]
        : EXCEPTION_GROUPS,
    [byCategory]
  );

  // total_count is how many rows MATCHED; the RPC returns at most 500. The
  // badge and the banner both report the true number, because the old screen
  // showed the truncated one as though it were the whole story.
  // total_count also arrives with that migration. Falling back to the number
  // of rows in hand keeps the badge honest rather than showing 0.
  const exceptionTotal =
    exceptions.data?.[0]?.total_count ?? exceptions.data?.length ?? 0;
  const truncated = exceptionTotal > (exceptions.data?.length ?? 0);

  function exportAttendance() {
    // Each day's rooms, then that day's total, then a grand total — the same
    // shape as the screen, so a spreadsheet and the report agree.
    const rows: (string | number | null)[][] = [];
    for (const day of days) {
      for (const row of day.rows) {
        rows.push([
          row.session_date,
          row.service_label,
          row.room_name,
          row.age_band_name,
          row.children,
          row.first_time_visitors,
          row.volunteers,
          row.overrides,
          row.not_checked_out,
          row.avg_minutes,
        ]);
      }
      rows.push([
        day.session_date,
        day.serviceCount > 1 ? `Total (${day.serviceCount} services)` : "Total",
        "",
        "",
        day.totals.children,
        day.totals.first_time_visitors,
        day.totals.volunteers,
        day.totals.overrides,
        day.totals.not_checked_out,
        day.totals.avg_minutes,
      ]);
    }
    if (days.length > 1) {
      rows.push([
        "",
        `All ${days.length} days`,
        "",
        "",
        grand.children,
        grand.first_time_visitors,
        grand.volunteers,
        grand.overrides,
        grand.not_checked_out,
        grand.avg_minutes,
      ]);
    }
    downloadFile(
      withUTF8BOM(
        toCSV(
          [
            "Date",
            "Service",
            "Room",
            "Age group",
            "Children",
            "First-time",
            "Volunteers",
            "Overrides",
            "Not collected",
            "Avg minutes",
          ],
          rows
        )
      ),
      `kids-attendance-${getDateStamp()}.csv`,
      "text/csv"
    );
  }

  function exportExceptions() {
    const rows = (exceptions.data ?? []).map((row) => [
      row.occurred_at,
      row.session_date,
      row.category,
      row.action,
      row.outcome,
      row.child_name,
      row.room_name,
      row.actor_name,
      row.reason,
    ]);
    downloadFile(
      withUTF8BOM(
        toCSV(
          [
            "When",
            "Service date",
            "Category",
            "Event",
            "Outcome",
            "Child",
            "Room",
            "By",
            "Reason",
          ],
          rows
        )
      ),
      `kids-exceptions-${getDateStamp()}.csv`,
      "text/csv"
    );
  }

  return (
    <div className="space-y-4">
      <div className="flex flex-wrap items-end gap-3">
        <div className="space-y-1.5">
          <Label className="text-xs">From</Label>
          <Input
            type="date"
            value={from}
            onChange={(e) => setFrom(e.target.value)}
            className="w-40"
          />
        </div>
        <div className="space-y-1.5">
          <Label className="text-xs">To</Label>
          <Input
            type="date"
            value={to}
            onChange={(e) => setTo(e.target.value)}
            className="w-40"
          />
        </div>
      </div>

      <Tabs defaultValue="attendance">
        <TabsList>
          <TabsTrigger value="attendance">Attendance</TabsTrigger>
          <TabsTrigger value="late">Late collections</TabsTrigger>
          <TabsTrigger value="exceptions">
            Exceptions
            {(exceptions.data?.length ?? 0) > 0 && (
              <Badge variant="secondary" className="ml-1.5">
                {exceptionTotal || exceptions.data?.length}
              </Badge>
            )}
          </TabsTrigger>
          <TabsTrigger value="consent">Consent</TabsTrigger>
          {/* kids_admin only — reading who read what is itself a sensitive
              act, and a read-only reporting role is not a safeguarding one.
              The server refuses it too; this just avoids offering a tab that
              would error. */}
          {canWrite && <TabsTrigger value="access">Who read what</TabsTrigger>}
        </TabsList>

        <TabsContent value="attendance" className="pt-4">
          <Card>
            <CardHeader className="flex-row items-start justify-between space-y-0">
              <div>
                <CardTitle className="text-base">Attendance by Sunday</CardTitle>
                <CardDescription>
                  One row per room per service.
                </CardDescription>
              </div>
              <Button
                variant="outline"
                size="sm"
                onClick={exportAttendance}
                disabled={!attendance.data?.length}
              >
                <Download className="h-4 w-4" />
                CSV
              </Button>
            </CardHeader>
            <CardContent>
              {attendance.isLoading ? (
                <div className="flex justify-center py-10">
                  <Loader2 className="h-5 w-5 animate-spin text-muted-foreground" />
                </div>
              ) : (attendance.data?.length ?? 0) === 0 ? (
                <p className="py-10 text-center text-sm text-muted-foreground">
                  No check-ins in this period.
                </p>
              ) : (
                <div className="overflow-x-auto">
                  <Table>
                    <TableHeader>
                      <TableRow>
                        <TableHead>Date</TableHead>
                        <TableHead>Room</TableHead>
                        <TableHead className="text-right">Children</TableHead>
                        <TableHead className="text-right">New</TableHead>
                        <TableHead className="text-right">Volunteers</TableHead>
                        <TableHead className="text-right">Overrides</TableHead>
                        <TableHead className="text-right">Not collected</TableHead>
                      </TableRow>
                    </TableHeader>
                    <TableBody>
                      {days.map((day) => (
                        <Fragment key={day.session_date}>
                          {day.rows.map((row, index) => (
                            <TableRow key={`${row.room_name}-${index}`}>
                              <TableCell className="whitespace-nowrap">
                                {row.session_date}
                                <span className="block text-xs text-muted-foreground">
                                  {row.service_label}
                                </span>
                              </TableCell>
                              <TableCell>
                                {row.room_name}
                                <span className="block text-xs text-muted-foreground">
                                  {row.age_band_name ?? "—"}
                                </span>
                              </TableCell>
                              <TableCell className="text-right tabular-nums">
                                {row.children}
                              </TableCell>
                              <TableCell className="text-right tabular-nums">
                                {row.first_time_visitors}
                              </TableCell>
                              <TableCell className="text-right tabular-nums">
                                {row.volunteers}
                              </TableCell>
                              <TableCell className="text-right tabular-nums">
                                {row.overrides > 0 ? (
                                  <Badge variant="outline" className="border-amber-400">
                                    {row.overrides}
                                  </Badge>
                                ) : (
                                  0
                                )}
                              </TableCell>
                              <TableCell className="text-right tabular-nums">
                                {row.not_checked_out > 0 ? (
                                  <Badge variant="destructive">
                                    {row.not_checked_out}
                                  </Badge>
                                ) : (
                                  0
                                )}
                              </TableCell>
                            </TableRow>
                          ))}
                          <TableRow className="border-t-2 bg-muted/40 hover:bg-muted/40">
                            <TableCell colSpan={2} className="font-medium">
                              Total for {day.session_date}
                              {day.serviceCount > 1 && (
                                <span className="block text-xs font-normal text-muted-foreground">
                                  across {day.serviceCount} services — a child at
                                  more than one is counted once per service
                                </span>
                              )}
                            </TableCell>
                            <TotalCells totals={day.totals} />
                          </TableRow>
                        </Fragment>
                      ))}
                    </TableBody>
                    {days.length > 1 && (
                      <TableFooter>
                        <TableRow className="hover:bg-transparent">
                          <TableCell colSpan={2} className="font-semibold">
                            All {days.length} days
                          </TableCell>
                          <TotalCells totals={grand} />
                        </TableRow>
                      </TableFooter>
                    )}
                  </Table>
                </div>
              )}
            </CardContent>
          </Card>
        </TabsContent>

        <TabsContent value="late" className="pt-4">
          <LatePickupsPanel
            organizationId={organizationId}
            from={from}
            to={to}
            canReview={canReview}
          />
        </TabsContent>

        <TabsContent value="exceptions" className="pt-4">
          <Card>
            <CardHeader className="flex-row items-start justify-between space-y-0">
              <div>
                <CardTitle className="text-base">Exceptions</CardTitle>
                <CardDescription>
                  Children never collected, refused pickups, overrides and
                  errors — including attempts that left no check-in behind.
                </CardDescription>
              </div>
              <Button
                variant="outline"
                size="sm"
                onClick={exportExceptions}
                disabled={!exceptions.data?.length}
              >
                <Download className="h-4 w-4" />
                CSV
              </Button>
            </CardHeader>
            <CardContent>
              {exceptions.isLoading ? (
                <div className="flex justify-center py-10">
                  <Loader2 className="h-5 w-5 animate-spin text-muted-foreground" />
                </div>
              ) : (exceptions.data?.length ?? 0) === 0 ? (
                <p className="py-10 text-center text-sm text-muted-foreground">
                  Nothing to review in this period.
                </p>
              ) : (
                <div className="space-y-4">
                  {truncated && (
                    <p className="rounded-md border border-amber-400 p-2 text-xs text-amber-700 dark:text-amber-500">
                      Showing the first {exceptions.data?.length} of{" "}
                      {exceptionTotal}. Narrow the dates to see the rest.
                    </p>
                  )}
                  {groupsToRender.map((group) => {
                    const rows = byCategory.get(group.category);
                    if (!rows || rows.length === 0) return null;
                    const open = openGroups[group.category] ?? group.startsOpen;
                    return (
                      <div key={group.category}>
                        <button
                          type="button"
                          className="flex w-full items-center gap-2 rounded-md px-1 py-1.5 text-left hover:bg-muted/50"
                          onClick={() =>
                            setOpenGroups((g) => ({ ...g, [group.category]: !open }))
                          }
                        >
                          {open ? (
                            <ChevronDown className="h-4 w-4 shrink-0" />
                          ) : (
                            <ChevronRight className="h-4 w-4 shrink-0" />
                          )}
                          <span className="text-sm font-medium">{group.title}</span>
                          <Badge
                            variant={
                              group.tone === "serious" ? "destructive" : "secondary"
                            }
                          >
                            {rows.length}
                          </Badge>
                        </button>
                        <p className="pb-2 pl-7 text-xs text-muted-foreground">
                          {group.blurb}
                        </p>
                        {open && (
                          <div className="space-y-2 pl-7">
                            {rows.map((row, index) => (
                              <div
                                key={`${row.occurred_at}-${index}`}
                                className="rounded-md border p-3 space-y-1"
                              >
                                <div className="flex flex-wrap items-center gap-2">
                                  <Badge
                                    variant={
                                      group.tone === "serious"
                                        ? "destructive"
                                        : "outline"
                                    }
                                  >
                                    {row.action.replace(/_/g, " ")}
                                  </Badge>
                                  {row.outcome !== "success" && (
                                    <Badge variant="outline">{row.outcome}</Badge>
                                  )}
                                  <span className="text-sm font-medium">
                                    {row.child_name}
                                  </span>
                                  {row.room_name && (
                                    <span className="text-xs text-muted-foreground">
                                      {row.room_name}
                                    </span>
                                  )}
                                  <span className="ml-auto text-xs text-muted-foreground">
                                    {row.session_date ?? "—"}
                                    {" · "}
                                    {new Date(row.occurred_at).toLocaleTimeString()}
                                  </span>
                                </div>
                                {row.reason && (
                                  <p className="text-sm text-muted-foreground">
                                    {row.reason}
                                  </p>
                                )}
                                {row.actor_name && (
                                  <p className="text-xs text-muted-foreground">
                                    by {row.actor_name}
                                  </p>
                                )}
                              </div>
                            ))}
                          </div>
                        )}
                      </div>
                    );
                  })}
                </div>
              )}
            </CardContent>
          </Card>
        </TabsContent>

        {/*
          * Outside the date range on purpose. Every other pane answers "what
          * happened between these two dates"; this one answers "where do we
          * stand today", and wiring it to the range would let somebody scroll
          * back to September and read 0% as the current position.
          */}
        {canWrite && (
          <TabsContent value="access" className="pt-4">
            <AccessLogPanel organizationId={organizationId} from={from} to={to} />
          </TabsContent>
        )}

        <TabsContent value="consent" className="pt-4 space-y-4">
          {/* The rule first, then the numbers. Somebody opening this tab on a
              difficult Sunday morning is looking for the pause button, not
              for a progress bar. */}
          <ConsentRuleCard organizationId={organizationId} canEdit={canWrite} />
          <ConsentCoverageCard
            organizationId={organizationId}
            enforceFrom={enforceFrom}
          />
        </TabsContent>
      </Tabs>
    </div>
  );
}
