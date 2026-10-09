/**
 * Attendance by child: one row per child, one column per date shown.
 *
 * The question it answers is the one a leader asks on a Monday: who is
 * coming, who is new, and who has stopped. Each has a filter, and "Missing 3+
 * weeks" is the follow-up list. It names children and classrooms only; there
 * is no parent contact here, by the ministry's choice.
 *
 * The columns are the report's own dates (Sundays only unless the report shows
 * every date), newest first beside the name, so "4 of 6" and the grid agree
 * and the most recent Sundays are what a narrow screen shows.
 *
 * Fetched only while this view is open: it is one row per child per date, and
 * the summary tabs above do not need it.
 */

import { useMemo, useState } from "react";
import { Button } from "@/shared/components/ui/button";
import { Input } from "@/shared/components/ui/input";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/shared/components/ui/select";
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from "@/shared/components/ui/table";
import { ArrowDown, Check, Download, Loader2, Search } from "lucide-react";
import { cn } from "@/lib/utils";
import { toCSV, withUTF8BOM, downloadFile, getDateStamp } from "@/shared/lib/exportPrimitives";
import { useKidsChildAttendance } from "../hooks/useKidsLeader";
import {
  filterChildren,
  pivotChildren,
  sortChildren,
  type ChildFilter,
  type ChildSort,
} from "../utils/childAttendance";

interface Props {
  organizationId: string | undefined;
  from: string;
  to: string;
  /** The report's dates, newest first. */
  dates: string[];
}

const PAGE = 50;
const ALL_ROOMS = "__all__";

const asDate = (iso: string) => new Date(`${iso}T00:00:00`);
const md = (iso: string) => `${asDate(iso).getMonth() + 1}/${asDate(iso).getDate()}`;
const short = (iso: string) =>
  asDate(iso).toLocaleDateString("en-US", { month: "short", day: "numeric" });

const FILTERS: { key: ChildFilter; label: string; hint: string }[] = [
  { key: "all", label: "All children", hint: "Everyone who came in this range" },
  { key: "regular", label: "Regulars", hint: "Came to three in four of these dates or more" },
  { key: "new", label: "New", hint: "First ever check-in in this range" },
  { key: "missing", label: "Missing 3+ weeks", hint: "Came at least twice, but not in the last three weeks" },
];

export function ChildAttendanceTable({ organizationId, from, to, dates }: Props) {
  const { data, isLoading, isPlaceholderData, error } = useKidsChildAttendance(
    organizationId,
    from,
    to,
    true,
  );
  const [filter, setFilter] = useState<ChildFilter>("all");
  const [room, setRoom] = useState<string>(ALL_ROOMS);
  const [query, setQuery] = useState("");
  const [sort, setSort] = useState<ChildSort>("name");
  const [limit, setLimit] = useState(PAGE);

  const children = useMemo(() => pivotChildren(data ?? [], dates), [data, dates]);
  const rooms = useMemo(() => [...new Set(children.map((c) => c.room))].sort(), [children]);
  const counts = useMemo(
    () => ({
      all: children.length,
      regular: children.filter((c) => c.isRegular).length,
      new: children.filter((c) => c.isNew).length,
      missing: children.filter((c) => c.isMissing).length,
    }),
    [children],
  );
  const shown = useMemo(
    () =>
      sortChildren(
        filterChildren(children, filter, query, room === ALL_ROOMS ? null : room),
        sort,
      ),
    [children, filter, query, room, sort],
  );

  function exportChildren() {
    downloadFile(
      withUTF8BOM(
        toCSV(
          [
            "Child",
            "Classroom",
            "Attended",
            "Of",
            "Rate",
            "Last seen",
            "First check-in",
            "New",
            "Missing 3+ weeks",
            ...dates,
          ],
          shown.map((c) => [
            c.name,
            c.room,
            c.attended,
            c.of,
            `${Math.round(c.rate * 100)}%`,
            c.lastSeen,
            c.firstCheckIn,
            c.isNew ? "Yes" : "",
            c.isMissing ? "Yes" : "",
            ...dates.map((d) => (c.visits.has(d) ? "Yes" : "")),
          ]),
        ),
      ),
      `kids-attendance-by-child-${getDateStamp()}.csv`,
      "text/csv",
    );
  }

  // A helper, not a component: defined inside, a component would re-mount on
  // every keystroke in the search box.
  function sortHead(by: ChildSort, label: string, className?: string) {
    return (
      <TableHead className={className} aria-sort={sort === by ? (by === "name" ? "ascending" : "descending") : "none"}>
        <button
          type="button"
          onClick={() => setSort(by)}
          className={cn(
            "inline-flex items-center gap-1 hover:text-foreground",
            sort === by && "text-foreground",
          )}
        >
          {label}
          {sort === by && <ArrowDown className={cn("h-3.5 w-3.5", by === "name" && "rotate-180")} />}
        </button>
      </TableHead>
    );
  }

  if (error) {
    return <p className="py-10 text-center text-sm text-muted-foreground">The list could not be loaded.</p>;
  }
  if (isLoading) {
    return (
      <div className="flex justify-center py-10">
        <Loader2 className="h-5 w-5 animate-spin text-muted-foreground" />
      </div>
    );
  }

  return (
    <div className={cn("space-y-3 transition-opacity", isPlaceholderData && "opacity-60")}>
      {/* Filters, in one row above the table they scope. */}
      <div className="flex flex-col gap-2 lg:flex-row lg:items-center lg:justify-between">
        <div className="flex flex-wrap gap-1.5" role="group" aria-label="Show">
          {FILTERS.map((f) => (
            <Button
              key={f.key}
              type="button"
              size="sm"
              variant={filter === f.key ? "secondary" : "ghost"}
              aria-pressed={filter === f.key}
              title={f.hint}
              onClick={() => {
                setFilter(f.key);
                setLimit(PAGE);
              }}
            >
              {f.label}
              <span className="ml-1.5 tabular-nums text-muted-foreground">{counts[f.key]}</span>
            </Button>
          ))}
        </div>
        <div className="flex flex-wrap items-center gap-2">
          <Select value={room} onValueChange={(v) => { setRoom(v); setLimit(PAGE); }}>
            <SelectTrigger className="h-9 w-48" aria-label="Classroom">
              <SelectValue />
            </SelectTrigger>
            <SelectContent>
              <SelectItem value={ALL_ROOMS}>All classrooms</SelectItem>
              {rooms.map((r) => (
                <SelectItem key={r} value={r}>
                  {r}
                </SelectItem>
              ))}
            </SelectContent>
          </Select>
          <div className="relative">
            <Search className="absolute left-2.5 top-1/2 h-4 w-4 -translate-y-1/2 text-muted-foreground" />
            <Input
              value={query}
              onChange={(e) => { setQuery(e.target.value); setLimit(PAGE); }}
              placeholder="Child's name"
              className="h-9 w-48 pl-8"
              aria-label="Search children"
            />
          </div>
          <Button variant="outline" size="sm" onClick={exportChildren} disabled={shown.length === 0}>
            <Download className="h-4 w-4" />
            CSV
          </Button>
        </div>
      </div>

      {filter === "missing" && (
        <p className="text-xs text-muted-foreground">
          Children who came at least twice in this range, but not in the last three weeks of it.
        </p>
      )}

      <div className="overflow-x-auto rounded-md border">
        <Table>
          <TableHeader className="bg-muted/50">
            <TableRow>
              {sortHead("name", "Child", "sticky left-0 z-10 min-w-[14rem] bg-muted")}
              {sortHead("attended", "Attended", "min-w-[9rem]")}
              {sortHead("last", "Last seen", "whitespace-nowrap")}
              {dates.map((d) => (
                <TableHead key={d} className="w-12 px-2 text-center tabular-nums" title={short(d)}>
                  {md(d)}
                </TableHead>
              ))}
            </TableRow>
          </TableHeader>
          <TableBody>
            {shown.length === 0 ? (
              <TableRow>
                <TableCell colSpan={3 + dates.length} className="py-10 text-center text-muted-foreground">
                  No children match.
                </TableCell>
              </TableRow>
            ) : (
              shown.slice(0, limit).map((c) => (
                <TableRow key={c.id} className="group">
                  <TableCell className="sticky left-0 z-10 bg-background group-hover:bg-muted/50">
                    <div className="flex flex-wrap items-center gap-1.5">
                      <span className="font-medium">{c.name}</span>
                      {c.isNew && (
                        <span className="rounded bg-sky-100 px-1.5 py-0.5 text-[11px] font-medium text-sky-900 dark:bg-sky-950 dark:text-sky-200">
                          New
                        </span>
                      )}
                      {c.isMissing && (
                        <span className="rounded bg-amber-100 px-1.5 py-0.5 text-[11px] font-medium text-amber-900 dark:bg-amber-950 dark:text-amber-200">
                          Missing
                        </span>
                      )}
                    </div>
                    <span className="text-xs text-muted-foreground">{c.room}</span>
                  </TableCell>
                  <TableCell>
                    <div className="flex items-center gap-2">
                      <span className="w-14 whitespace-nowrap tabular-nums">
                        {c.attended} of {c.of}
                      </span>
                      <div className="h-1.5 w-12 overflow-hidden rounded-full bg-muted" aria-hidden>
                        <div
                          className="h-full rounded-full bg-primary/70"
                          style={{ width: `${Math.round(c.rate * 100)}%` }}
                        />
                      </div>
                      <span className="w-9 text-right text-xs tabular-nums text-muted-foreground">
                        {Math.round(c.rate * 100)}%
                      </span>
                    </div>
                  </TableCell>
                  <TableCell className="whitespace-nowrap tabular-nums">{short(c.lastSeen)}</TableCell>
                  {dates.map((d) => {
                    const where = c.visits.get(d);
                    return (
                      <TableCell key={d} className="px-2 text-center">
                        {where ? (
                          <span
                            className="inline-flex"
                            title={`${short(d)} · ${where}`}
                            aria-label={`Came on ${short(d)}, ${where}`}
                          >
                            <Check className="h-4 w-4 text-primary" strokeWidth={3} aria-hidden />
                          </span>
                        ) : (
                          <span
                            className="mx-auto block h-1.5 w-1.5 rounded-full bg-muted-foreground/25"
                            aria-label={`Not on ${short(d)}`}
                          />
                        )}
                      </TableCell>
                    );
                  })}
                </TableRow>
              ))
            )}
          </TableBody>
        </Table>
      </div>

      <div className="flex flex-wrap items-center justify-between gap-2 text-xs text-muted-foreground">
        <span className="inline-flex items-center gap-3">
          <span className="inline-flex items-center gap-1">
            <Check className="h-3.5 w-3.5 text-primary" strokeWidth={3} aria-hidden /> came
          </span>
          <span className="inline-flex items-center gap-1">
            <span className="h-1.5 w-1.5 rounded-full bg-muted-foreground/25" aria-hidden /> did not come
          </span>
          <span>Hover a tick for the classroom that day.</span>
        </span>
        <span className="inline-flex items-center gap-2">
          Showing {Math.min(limit, shown.length)} of {shown.length}
          {limit < shown.length && (
            <Button variant="ghost" size="sm" onClick={() => setLimit(limit + PAGE)}>
              Show {Math.min(PAGE, shown.length - limit)} more
            </Button>
          )}
        </span>
      </div>
    </div>
  );
}
