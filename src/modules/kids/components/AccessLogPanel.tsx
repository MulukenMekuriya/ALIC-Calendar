/**
 * Who read what.
 *
 * church.station_child_safety_card has written an audit row on every call
 * since March, and the consent PDF, the incident detail and the kiosk prefill
 * now do the same. Nothing has ever displayed one — and an audit trail nobody
 * can read is a promise rather than a control.
 *
 * SUMMARY FIRST, ORDERED BY BREADTH. A thousand undifferentiated rows is the
 * same as no answer. What is worth noticing is not that somebody opened forty
 * safety cards; it is that somebody opened forty DIFFERENT CHILDREN'S safety
 * cards. One volunteer re-reading one child's allergy card all morning is a
 * volunteer doing their job. So "children" is the first column and the sort
 * key, and "reads" comes after it.
 *
 * IT IS NOT AN ACCUSATION. A kids leader legitimately reads across the whole
 * ministry, and the copy says so plainly — a screen that implies wrongdoing
 * from a number is a screen that gets ignored the first time it is wrong
 * about somebody everyone trusts.
 *
 * NOTHING LOADS UNTIL IT IS OPENED. Every call writes an access_log_read row,
 * so a query firing on mount would fill the trail with reads nobody made.
 */

import { useMemo, useState } from "react";
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
import { Badge } from "@/shared/components/ui/badge";
import { Button } from "@/shared/components/ui/button";
import { Download, Eye, ChevronLeft } from "lucide-react";
import { useAccessSummary, useAccessDetail } from "../hooks/useKidsLeader";
import type { AccessSummaryRow } from "../services/kidsLeaderService";

interface Props {
  organizationId: string | undefined;
  from: string;
  to: string;
}

/** Plain words for the record types the audit rows carry. */
const RECORD_LABELS: Record<string, string> = {
  safety_card: "Safety card",
  consent_pdf: "Consent form",
  consent_prefill: "Health details at the desk",
  incident: "Incident report",
  incident_pdf: "Injury record",
};

function label(record: string): string {
  return RECORD_LABELS[record] ?? record.replace(/_/g, " ");
}

function when(iso: string): string {
  const d = new Date(iso);
  return Number.isNaN(d.getTime())
    ? iso
    : d.toLocaleString(undefined, {
        day: "numeric",
        month: "short",
        hour: "numeric",
        minute: "2-digit",
      });
}

export function AccessLogPanel({ organizationId, from, to }: Props) {
  const [opened, setOpened] = useState(false);
  const [who, setWho] = useState<AccessSummaryRow | null>(null);

  const summary = useAccessSummary(organizationId, from, to, opened);
  const detail = useAccessDetail(organizationId, from, to, who?.actor_auth_user_id ?? null);

  const totals = useMemo(() => {
    const rows = summary.data ?? [];
    return {
      people: rows.length,
      reads: rows.reduce((n, r) => n + r.reads, 0),
    };
  }, [summary.data]);

  function exportCsv() {
    const rows = summary.data ?? [];
    const header = "Person,Children,Reads,Days,Records,First,Last";
    const body = rows
      .map((r) =>
        [
          `"${r.actor_name.replace(/"/g, '""')}"`,
          r.children_seen,
          r.reads,
          r.on_days,
          `"${r.record_types.map(label).join("; ")}"`,
          r.first_read,
          r.last_read,
        ].join(","),
      )
      .join("\n");
    const blob = new Blob([`${header}\n${body}`], { type: "text/csv" });
    const url = URL.createObjectURL(blob);
    const a = document.createElement("a");
    a.href = url;
    a.download = `kids-access-log-${from}-to-${to}.csv`;
    a.click();
    URL.revokeObjectURL(url);
  }

  if (!opened) {
    return (
      <Card>
        <CardHeader>
          <CardTitle className="text-base">Who read what</CardTitle>
          <CardDescription>
            Every time somebody opens a child's safety card, consent form or
            incident report, it is recorded. Opening this log is recorded too.
          </CardDescription>
        </CardHeader>
        <CardContent>
          <Button variant="outline" onClick={() => setOpened(true)}>
            <Eye className="h-4 w-4 mr-2" aria-hidden />
            Open the access log
          </Button>
        </CardContent>
      </Card>
    );
  }

  // --- one person's rows ---------------------------------------------------
  if (who) {
    return (
      <Card>
        <CardHeader className="pb-3">
          <Button
            variant="ghost"
            size="sm"
            className="w-fit -ml-2 mb-1"
            onClick={() => setWho(null)}
          >
            <ChevronLeft className="h-4 w-4 mr-1" aria-hidden />
            Back to everyone
          </Button>
          <CardTitle className="text-base">{who.actor_name}</CardTitle>
          <CardDescription>
            {who.reads} {who.reads === 1 ? "read" : "reads"}, covering{" "}
            {who.children_seen}{" "}
            {who.children_seen === 1 ? "child" : "children"}, on {who.on_days}{" "}
            {who.on_days === 1 ? "day" : "days"}.
          </CardDescription>
        </CardHeader>
        <CardContent className="p-0">
          {detail.isLoading ? (
            <p className="px-6 pb-6 text-sm text-muted-foreground">Loading…</p>
          ) : (
            <div className="overflow-x-auto">
              <Table>
                <TableHeader>
                  <TableRow>
                    <TableHead>When</TableHead>
                    <TableHead>Child</TableHead>
                    <TableHead>What was opened</TableHead>
                  </TableRow>
                </TableHeader>
                <TableBody>
                  {(detail.data ?? []).map((r, i) => (
                    <TableRow key={`${r.viewed_at}-${i}`}>
                      <TableCell className="whitespace-nowrap">
                        {when(r.viewed_at)}
                      </TableCell>
                      <TableCell>{r.child_name ?? "—"}</TableCell>
                      <TableCell>{label(r.record)}</TableCell>
                    </TableRow>
                  ))}
                </TableBody>
              </Table>
            </div>
          )}
        </CardContent>
      </Card>
    );
  }

  // --- everyone ------------------------------------------------------------
  return (
    <Card>
      <CardHeader className="pb-3 flex-row items-start justify-between space-y-0 gap-3">
        <div>
          <CardTitle className="text-base">Who read what</CardTitle>
          <CardDescription>
            {summary.isLoading
              ? "Loading…"
              : `${totals.people} ${totals.people === 1 ? "person" : "people"}, ${totals.reads} ${totals.reads === 1 ? "read" : "reads"} in this range.`}
          </CardDescription>
        </div>
        <Button
          variant="outline"
          size="sm"
          onClick={exportCsv}
          disabled={(summary.data?.length ?? 0) === 0}
        >
          <Download className="h-4 w-4 mr-2" aria-hidden />
          CSV
        </Button>
      </CardHeader>

      <CardContent className="p-0">
        {/*
          Said before the numbers, not after. A leader reads across the whole
          ministry as a matter of course, and a screen that implies wrongdoing
          from a count is one that gets ignored the first time it is wrong
          about somebody everybody trusts.
        */}
        <p className="px-6 pb-3 text-xs text-muted-foreground">
          Sorted by how many different children each person opened, which is
          usually the more useful number. A leader reading across the whole
          ministry is ordinary — this is here so the church can answer "who has
          seen my child's details", not to keep score.
        </p>

        {(summary.data?.length ?? 0) === 0 && !summary.isLoading ? (
          <p className="px-6 pb-6 text-sm text-muted-foreground">
            Nobody opened a child's records in this range.
          </p>
        ) : (
          <div className="overflow-x-auto">
            <Table>
              <TableHeader>
                <TableRow>
                  <TableHead>Person</TableHead>
                  {/* Breadth first, deliberately: it is the column worth
                      reading, so it sits where the eye lands. */}
                  <TableHead className="text-right">Children</TableHead>
                  <TableHead className="text-right">Reads</TableHead>
                  <TableHead className="text-right">Days</TableHead>
                  <TableHead>What</TableHead>
                  <TableHead>Last</TableHead>
                  <TableHead className="w-10" />
                </TableRow>
              </TableHeader>
              <TableBody>
                {(summary.data ?? []).map((r) => (
                  <TableRow key={`${r.actor_name}-${r.actor_auth_user_id ?? "x"}`}>
                    <TableCell className="font-medium">{r.actor_name}</TableCell>
                    <TableCell className="text-right tabular-nums font-medium">
                      {r.children_seen}
                    </TableCell>
                    <TableCell className="text-right tabular-nums text-muted-foreground">
                      {r.reads}
                    </TableCell>
                    <TableCell className="text-right tabular-nums text-muted-foreground">
                      {r.on_days}
                    </TableCell>
                    <TableCell>
                      <span className="flex flex-wrap gap-1">
                        {r.record_types.map((t) => (
                          <Badge key={t} variant="outline" className="font-normal">
                            {label(t)}
                          </Badge>
                        ))}
                      </span>
                    </TableCell>
                    <TableCell className="whitespace-nowrap text-muted-foreground">
                      {when(r.last_read)}
                    </TableCell>
                    <TableCell>
                      {r.actor_auth_user_id && (
                        <Button
                          variant="ghost"
                          size="sm"
                          onClick={() => setWho(r)}
                          title={`See what ${r.actor_name} opened`}
                        >
                          <Eye className="h-4 w-4" aria-hidden />
                          <span className="sr-only">
                            See what {r.actor_name} opened
                          </span>
                        </Button>
                      )}
                    </TableCell>
                  </TableRow>
                ))}
              </TableBody>
            </Table>
          </div>
        )}
      </CardContent>
    </Card>
  );
}
