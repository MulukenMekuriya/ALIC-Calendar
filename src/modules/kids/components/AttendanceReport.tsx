/**
 * Attendance, laid out as a report a leader can read at a glance.
 *
 * Three layers, each answering the next question down:
 *
 *   the headline numbers   how many, how many usually, how did last Sunday go
 *   the trend              children per Sunday across the range
 *   the detail             each Sunday's classrooms, or each classroom across
 *                          the range, which is also the chart's table view
 *
 * Everything is computed from the one church.kids_attendance_report result by
 * the pure helpers in utils/attendanceTotals, so the tiles, the chart and the
 * table always agree, and the CSV is the same numbers again.
 *
 * VOLUNTEERS. The column only appears once a volunteer has been signed in to a
 * classroom somewhere in the range. Until the desk records staffing, a column
 * of zeros reads as "nobody served", which is not true; a sentence under the
 * table says so instead.
 */

import { Fragment, useMemo, useState } from "react";
import {
  Bar,
  BarChart,
  CartesianGrid,
  Cell,
  LabelList,
  ResponsiveContainer,
  Tooltip,
  XAxis,
  YAxis,
} from "recharts";
import {
  Card,
  CardContent,
  CardDescription,
  CardHeader,
  CardTitle,
} from "@/shared/components/ui/card";
import { Button } from "@/shared/components/ui/button";
import { Tabs, TabsList, TabsTrigger } from "@/shared/components/ui/tabs";
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
  AlertTriangle,
  ArrowDownRight,
  ArrowUpRight,
  CheckCircle2,
  ChevronDown,
  ChevronRight,
  Download,
  Loader2,
  Minus,
} from "lucide-react";
import { cn } from "@/lib/utils";
import type { AttendanceRow } from "../services/kidsLeaderService";
import {
  formatStay,
  groupByDay,
  summarizeDays,
  summarizeRooms,
  type AttendanceTotals,
} from "../utils/attendanceTotals";

interface Props {
  rows: AttendanceRow[] | undefined;
  isLoading: boolean;
  /** Showing the previous range while the new one loads. */
  isStale: boolean;
  /** Given exactly the rows on screen, so the spreadsheet and the report agree. */
  onExport: (rows: AttendanceRow[]) => void;
}

/** A report date is a calendar date, not an instant: read it as local midnight. */
function asDate(iso: string): Date {
  return new Date(`${iso}T00:00:00`);
}

const fmt = {
  short: (iso: string) =>
    asDate(iso).toLocaleDateString("en-US", { month: "short", day: "numeric" }),
  medium: (iso: string) =>
    asDate(iso).toLocaleDateString("en-US", {
      weekday: "short",
      month: "short",
      day: "numeric",
      year: "numeric",
    }),
  long: (iso: string) =>
    asDate(iso).toLocaleDateString("en-US", { weekday: "long", month: "long", day: "numeric" }),
};

const number = (n: number) => n.toLocaleString("en-US");

/** A zero is real data, and quiet. */
function Count({ value, tone }: { value: number; tone?: "warn" | "bad" }) {
  if (value === 0) return <span className="text-muted-foreground/60">0</span>;
  if (!tone) return <>{number(value)}</>;
  return (
    <span
      className={cn(
        "inline-flex min-w-[1.75rem] justify-center rounded-full px-2 py-0.5 text-xs font-semibold",
        tone === "warn"
          ? "bg-amber-100 text-amber-900 dark:bg-amber-950 dark:text-amber-200"
          : "bg-rose-100 text-rose-900 dark:bg-rose-950 dark:text-rose-200",
      )}
    >
      {number(value)}
    </span>
  );
}

/** A number with a thin bar beside it, so a column of counts reads as a shape. */
function BarCount({ value, max, strong }: { value: number; max: number; strong?: boolean }) {
  const pct = max > 0 ? Math.max(2, Math.round((value / max) * 100)) : 0;
  return (
    <div className="flex items-center justify-end gap-3">
      <div className="hidden h-1.5 w-20 overflow-hidden rounded-full bg-muted sm:block">
        <div className="h-full rounded-full bg-primary/70" style={{ width: `${pct}%` }} />
      </div>
      <span className={cn("w-10 text-right tabular-nums", strong && "font-semibold")}>
        {number(value)}
      </span>
    </div>
  );
}

function StatTile({
  label,
  value,
  detail,
  status,
}: {
  label: string;
  value: string;
  detail: React.ReactNode;
  status?: "ok" | "warn";
}) {
  return (
    <Card className={cn(status === "warn" && "border-amber-300 dark:border-amber-800")}>
      <CardContent className="p-4">
        <p className="text-sm text-muted-foreground">{label}</p>
        <p className="mt-1 text-3xl font-semibold tracking-tight">{value}</p>
        <div className="mt-1 text-xs text-muted-foreground">{detail}</div>
      </CardContent>
    </Card>
  );
}

function Change({ now, before, beforeDate }: { now: number; before: number | null; beforeDate?: string }) {
  if (before === null) return <span>The first date in this range</span>;
  const diff = now - before;
  const Icon = diff > 0 ? ArrowUpRight : diff < 0 ? ArrowDownRight : Minus;
  return (
    <span className="inline-flex items-center gap-1">
      <span
        className={cn(
          "inline-flex items-center gap-0.5 font-medium",
          diff > 0 && "text-emerald-700 dark:text-emerald-400",
          diff < 0 && "text-rose-700 dark:text-rose-400",
        )}
      >
        <Icon className="h-3.5 w-3.5" aria-hidden />
        {diff > 0 ? `+${diff}` : diff}
      </span>
      {beforeDate ? `vs ${fmt.short(beforeDate)}` : "vs the date before"}
    </span>
  );
}

interface ChartPoint {
  date: string;
  label: string;
  children: number;
  first_time_visitors: number;
  rooms: number;
  latest: boolean;
  peak: boolean;
}

function ChartTip({ active, payload }: { active?: boolean; payload?: { payload: ChartPoint }[] }) {
  if (!active || !payload?.length) return null;
  const p = payload[0].payload;
  return (
    <div className="rounded-md border bg-popover px-3 py-2 text-popover-foreground shadow-md">
      <p className="text-sm font-semibold">{number(p.children)} children</p>
      <p className="text-xs text-muted-foreground">{fmt.medium(p.date)}</p>
      <p className="mt-1 text-xs text-muted-foreground">
        {p.first_time_visitors} first-time · {p.rooms} {p.rooms === 1 ? "room" : "rooms"}
      </p>
    </div>
  );
}

function TotalsCells({
  totals,
  showVolunteers,
  strong,
  max,
}: {
  totals: AttendanceTotals;
  showVolunteers: boolean;
  strong?: boolean;
  max?: number;
}) {
  return (
    <>
      <TableCell className="text-right">
        {max !== undefined ? (
          <BarCount value={totals.children} max={max} strong={strong} />
        ) : (
          <span className={cn("tabular-nums", strong && "font-semibold")}>{number(totals.children)}</span>
        )}
      </TableCell>
      <TableCell className="text-right tabular-nums">
        <Count value={totals.first_time_visitors} />
      </TableCell>
      {showVolunteers && (
        <TableCell className="text-right tabular-nums">
          <Count value={totals.volunteers} />
        </TableCell>
      )}
      <TableCell className="text-right tabular-nums whitespace-nowrap">
        {formatStay(totals.avg_minutes)}
      </TableCell>
      <TableCell className="text-right tabular-nums">
        <Count value={totals.overrides} tone="warn" />
      </TableCell>
      <TableCell className="text-right tabular-nums">
        <Count value={totals.not_checked_out} tone="bad" />
      </TableCell>
    </>
  );
}

/** Sunday is day 0. A service date is a calendar date, read as local. */
const isSunday = (iso: string) => asDate(iso).getDay() === 0;

/**
 * Twelve hours. A longer "stay" is a check-in nobody closed until days later,
 * not time a child spent in a room, and one of them turns a three-hour
 * average into ten. Left out of the averages and said so under the table.
 */
const LONGEST_REAL_STAY = 12 * 60;

export function AttendanceReport({ rows, isLoading, isStale, onExport }: Props) {
  /*
   * SUNDAYS ONLY, BY DEFAULT. Sessions are opened midweek too, for a
   * programme, a rehearsal or simply to try the desk, and one of those with
   * a single child would otherwise be "the latest Sunday" and halve the
   * average. The switch brings them back.
   */
  const [allDates, setAllDates] = useState(false);
  const otherDates = useMemo(
    () => new Set((rows ?? []).map((r) => r.session_date).filter((d) => !isSunday(d))).size,
    [rows],
  );
  const shown = useMemo(
    () =>
      (allDates ? rows ?? [] : (rows ?? []).filter((r) => isSunday(r.session_date))).map((r) =>
        r.avg_minutes !== null && r.avg_minutes > LONGEST_REAL_STAY ? { ...r, avg_minutes: null } : r,
      ),
    [rows, allDates],
  );
  const staleStays = useMemo(
    () =>
      (allDates ? rows ?? [] : (rows ?? []).filter((r) => isSunday(r.session_date))).some(
        (r) => r.avg_minutes !== null && r.avg_minutes > LONGEST_REAL_STAY,
      ),
    [rows, allDates],
  );
  const days = useMemo(() => groupByDay(shown), [shown]);
  const summary = useMemo(() => summarizeDays(days), [days]);
  const rooms = useMemo(() => summarizeRooms(shown), [shown]);
  const per = allDates ? "date" : "Sunday";
  const perPlural = allDates ? "dates" : "Sundays";
  const [view, setView] = useState<"days" | "rooms">("days");
  // The newest date starts open; the rest are one click away.
  const [open, setOpen] = useState<Set<string> | null>(null);
  const expanded = open ?? new Set(days.slice(0, 1).map((d) => d.session_date));

  const showVolunteers = summary.volunteersRecorded;
  const chart: ChartPoint[] = useMemo(
    () =>
      [...days].reverse().map((d, i, all) => ({
        date: d.session_date,
        label: fmt.short(d.session_date),
        children: d.totals.children,
        first_time_visitors: d.totals.first_time_visitors,
        rooms: d.rows.length,
        latest: i === all.length - 1,
        peak: summary.peak?.session_date === d.session_date,
      })),
    [days, summary.peak],
  );
  const busiestRoomOnAnyDay = Math.max(0, ...days.flatMap((d) => d.rows.map((r) => r.children)));
  const busiestDay = Math.max(0, ...days.map((d) => d.totals.children));
  const busiestRoomAverage = Math.max(0, ...rooms.map((r) => r.average));

  function toggle(date: string) {
    const next = new Set(expanded);
    if (next.has(date)) next.delete(date);
    else next.add(date);
    setOpen(next);
  }
  const allOpen = days.length > 0 && days.every((d) => expanded.has(d.session_date));

  if (isLoading) {
    return (
      <div className="flex justify-center py-16">
        <Loader2 className="h-5 w-5 animate-spin text-muted-foreground" />
      </div>
    );
  }

  const scope = (
    <div className="flex flex-wrap items-center justify-between gap-2 text-sm text-muted-foreground">
      <span>
        {summary.days} {summary.days === 1 ? per : perPlural}
        {!allDates && otherDates > 0 &&
          ` · ${otherDates} midweek or test ${otherDates === 1 ? "date" : "dates"} not counted`}
      </span>
      {otherDates > 0 && (
        <Tabs value={allDates ? "all" : "sundays"} onValueChange={(v) => setAllDates(v === "all")}>
          <TabsList>
            <TabsTrigger value="sundays">Sundays</TabsTrigger>
            <TabsTrigger value="all">All dates</TabsTrigger>
          </TabsList>
        </Tabs>
      )}
    </div>
  );

  if (days.length === 0) {
    return (
      <div className="space-y-3">
        {scope}
        <Card>
          <CardContent className="py-16 text-center text-sm text-muted-foreground">
            No check-ins in this period. Choose a wider range above.
          </CardContent>
        </Card>
      </div>
    );
  }

  const exceptions = summary.totals.overrides + summary.totals.not_checked_out;

  return (
    <div className={cn("space-y-4 transition-opacity", isStale && "opacity-60")}>
      {scope}
      {/* The headline numbers ------------------------------------------- */}
      <div className="grid gap-3 sm:grid-cols-2 xl:grid-cols-5">
        <StatTile
          label="Check-ins"
          value={number(summary.totals.children)}
          detail={`Across ${summary.days} ${summary.days === 1 ? per : perPlural}`}
        />
        <StatTile
          label={`Average per ${per}`}
          value={number(summary.perDay ?? 0)}
          detail={
            summary.peak ? `Highest ${number(summary.peak.children)} on ${fmt.short(summary.peak.session_date)}` : ""
          }
        />
        <StatTile
          label={summary.latest ? `Latest · ${fmt.short(summary.latest.session_date)}` : "Latest"}
          value={number(summary.latest?.children ?? 0)}
          detail={
            summary.latest ? (
              <Change
                now={summary.latest.children}
                before={summary.latest.previous}
                beforeDate={days[1]?.session_date}
              />
            ) : (
              ""
            )
          }
        />
        <StatTile
          label="First-time visitors"
          value={number(summary.totals.first_time_visitors)}
          detail={
            summary.totals.children > 0
              ? `${Math.round((summary.totals.first_time_visitors / summary.totals.children) * 100)}% of check-ins`
              : ""
          }
        />
        <StatTile
          label={exceptions > 0 ? "Exceptions" : "Average time in a room"}
          value={exceptions > 0 ? number(exceptions) : formatStay(summary.totals.avg_minutes)}
          status={exceptions > 0 ? "warn" : undefined}
          detail={
            exceptions > 0 ? (
              <span className="inline-flex items-center gap-1 text-amber-800 dark:text-amber-300">
                <AlertTriangle className="h-3.5 w-3.5" aria-hidden />
                {summary.totals.overrides} overrides · {summary.totals.not_checked_out} not collected
              </span>
            ) : (
              <span className="inline-flex items-center gap-1">
                <CheckCircle2 className="h-3.5 w-3.5 text-emerald-600" aria-hidden />
                No overrides or uncollected children
              </span>
            )
          }
        />
      </div>

      {/* The trend -------------------------------------------------------- */}
      <Card>
        <CardHeader className="pb-2">
          <CardTitle className="text-base">Children per {per}</CardTitle>
          <CardDescription>
            Every classroom together. The latest date is highlighted; hover a column for its
            details.
          </CardDescription>
        </CardHeader>
        <CardContent>
          <div className="h-64 w-full">
            <ResponsiveContainer width="100%" height="100%">
              <BarChart data={chart} margin={{ top: 22, right: 8, bottom: 0, left: 0 }}>
                <CartesianGrid vertical={false} className="stroke-border" />
                <XAxis
                  dataKey="label"
                  tickLine={false}
                  axisLine={false}
                  tick={{ fontSize: 12, className: "fill-muted-foreground" }}
                  interval="preserveStartEnd"
                  minTickGap={12}
                />
                <YAxis
                  width={36}
                  allowDecimals={false}
                  tickLine={false}
                  axisLine={false}
                  tick={{ fontSize: 12, className: "fill-muted-foreground" }}
                />
                <Tooltip cursor={{ className: "fill-muted", opacity: 0.6 }} content={<ChartTip />} />
                {/* No grow-in animation: a report is read, not watched, and an
                    animation that never runs (a background tab) leaves no bars. */}
                <Bar
                  dataKey="children"
                  maxBarSize={24}
                  radius={[4, 4, 0, 0]}
                  isAnimationActive={false}
                >
                  {chart.map((p) => (
                    <Cell
                      key={p.date}
                      className={p.latest ? "fill-primary" : "fill-primary/35"}
                    />
                  ))}
                  {/* Labelled sparingly: the latest and the highest. */}
                  <LabelList
                    dataKey="children"
                    content={({ x, y, width, value, index }) => {
                      const p = typeof index === "number" ? chart[index] : undefined;
                      if (!p || (!p.latest && !p.peak)) return null;
                      return (
                        <text
                          x={Number(x) + Number(width) / 2}
                          y={Number(y) - 6}
                          textAnchor="middle"
                          fontSize={12}
                          fontWeight={600}
                          className="fill-foreground"
                        >
                          {value}
                        </text>
                      );
                    }}
                  />
                </Bar>
              </BarChart>
            </ResponsiveContainer>
          </div>
        </CardContent>
      </Card>

      {/* The detail -------------------------------------------------------- */}
      <Card>
        <CardHeader className="gap-3 space-y-0 sm:flex-row sm:items-start sm:justify-between">
          <div>
            <CardTitle className="text-base">Detail</CardTitle>
            <CardDescription>
              {view === "days"
                ? "Each date, and its classrooms underneath."
                : "Each classroom across the whole range, busiest first."}
            </CardDescription>
          </div>
          <div className="flex flex-wrap items-center gap-2">
            <Tabs value={view} onValueChange={(v) => setView(v as "days" | "rooms")}>
              <TabsList>
                <TabsTrigger value="days">By {per}</TabsTrigger>
                <TabsTrigger value="rooms">By room</TabsTrigger>
              </TabsList>
            </Tabs>
            {view === "days" && (
              <Button
                variant="ghost"
                size="sm"
                onClick={() =>
                  setOpen(allOpen ? new Set() : new Set(days.map((d) => d.session_date)))
                }
              >
                {allOpen ? "Collapse all" : "Expand all"}
              </Button>
            )}
            <Button variant="outline" size="sm" onClick={() => onExport(shown)}>
              <Download className="h-4 w-4" />
              CSV
            </Button>
          </div>
        </CardHeader>
        <CardContent>
          <div className="overflow-x-auto rounded-md border">
            {view === "days" ? (
              <Table>
                <TableHeader className="bg-muted/50">
                  <TableRow>
                    <TableHead className="min-w-[16rem]">Date / classroom</TableHead>
                    <TableHead className="text-right">Children</TableHead>
                    <TableHead className="text-right">First-time</TableHead>
                    {showVolunteers && <TableHead className="text-right">Volunteers</TableHead>}
                    <TableHead className="text-right">Avg stay</TableHead>
                    <TableHead className="text-right">Overrides</TableHead>
                    <TableHead className="text-right">Not collected</TableHead>
                  </TableRow>
                </TableHeader>
                <TableBody>
                  {days.map((day) => {
                    const isOpen = expanded.has(day.session_date);
                    const services = [...new Set(day.rows.map((r) => r.service_label).filter(Boolean))];
                    return (
                      <Fragment key={day.session_date}>
                        <TableRow
                          className="cursor-pointer bg-muted/20 hover:bg-muted/40"
                          onClick={() => toggle(day.session_date)}
                        >
                          <TableCell>
                            <button
                              type="button"
                              className="flex items-start gap-2 text-left"
                              aria-expanded={isOpen}
                              onClick={(e) => {
                                e.stopPropagation();
                                toggle(day.session_date);
                              }}
                            >
                              {isOpen ? (
                                <ChevronDown className="mt-0.5 h-4 w-4 shrink-0 text-muted-foreground" />
                              ) : (
                                <ChevronRight className="mt-0.5 h-4 w-4 shrink-0 text-muted-foreground" />
                              )}
                              <span>
                                <span className="font-semibold">{fmt.long(day.session_date)}</span>
                                <span className="block text-xs text-muted-foreground">
                                  {services.join(" · ") || "Service"} · {day.rows.length}{" "}
                                  {day.rows.length === 1 ? "classroom" : "classrooms"}
                                  {day.serviceCount > 1 &&
                                    " · a child at more than one service counts once per service"}
                                </span>
                              </span>
                            </button>
                          </TableCell>
                          <TotalsCells
                            totals={day.totals}
                            showVolunteers={showVolunteers}
                            strong
                            max={busiestDay}
                          />
                        </TableRow>
                        {isOpen &&
                          day.rows.map((row, i) => (
                            <TableRow key={`${day.session_date}-${row.room_name}-${i}`}>
                              <TableCell className="pl-10">
                                <span>{row.room_name}</span>
                                {row.age_band_name && (
                                  <span className="ml-2 rounded bg-muted px-1.5 py-0.5 text-xs text-muted-foreground">
                                    {row.age_band_name}
                                  </span>
                                )}
                              </TableCell>
                              <TotalsCells
                                totals={{
                                  children: row.children,
                                  first_time_visitors: row.first_time_visitors,
                                  volunteers: row.volunteers,
                                  overrides: row.overrides,
                                  not_checked_out: row.not_checked_out,
                                  avg_minutes: row.avg_minutes,
                                }}
                                showVolunteers={showVolunteers}
                                max={busiestRoomOnAnyDay}
                              />
                            </TableRow>
                          ))}
                      </Fragment>
                    );
                  })}
                </TableBody>
                {days.length > 1 && (
                  <TableFooter>
                    <TableRow className="hover:bg-transparent">
                      <TableCell className="font-semibold">
                        All {days.length} {perPlural}
                      </TableCell>
                      <TotalsCells totals={summary.totals} showVolunteers={showVolunteers} strong />
                    </TableRow>
                  </TableFooter>
                )}
              </Table>
            ) : (
              <Table>
                <TableHeader className="bg-muted/50">
                  <TableRow>
                    <TableHead className="min-w-[14rem]">Classroom</TableHead>
                    <TableHead className="text-right">Average</TableHead>
                    <TableHead className="text-right">Highest</TableHead>
                    <TableHead className="text-right">Total</TableHead>
                    <TableHead className="text-right">First-time</TableHead>
                    <TableHead className="text-right">Avg stay</TableHead>
                    <TableHead className="text-right">Dates open</TableHead>
                  </TableRow>
                </TableHeader>
                <TableBody>
                  {rooms.map((room) => (
                    <TableRow key={room.room_name}>
                      <TableCell>
                        <span className="font-medium">{room.room_name}</span>
                        {room.age_band_name && (
                          <span className="ml-2 rounded bg-muted px-1.5 py-0.5 text-xs text-muted-foreground">
                            {room.age_band_name}
                          </span>
                        )}
                      </TableCell>
                      <TableCell className="text-right">
                        <BarCount value={room.average} max={busiestRoomAverage} strong />
                      </TableCell>
                      <TableCell className="text-right tabular-nums">{number(room.peak)}</TableCell>
                      <TableCell className="text-right tabular-nums">{number(room.total)}</TableCell>
                      <TableCell className="text-right tabular-nums">
                        <Count value={room.first_time_visitors} />
                      </TableCell>
                      <TableCell className="text-right tabular-nums whitespace-nowrap">
                        {formatStay(room.avg_minutes)}
                      </TableCell>
                      <TableCell className="text-right tabular-nums">{room.sessions}</TableCell>
                    </TableRow>
                  ))}
                </TableBody>
              </Table>
            )}
          </div>
          {!showVolunteers && (
            <p className="mt-3 text-xs text-muted-foreground">
              Volunteers are not being signed in to classrooms yet, so staffing is not shown. The
              column appears here once they are.
            </p>
          )}
          {staleStays && (
            <p className="mt-2 text-xs text-muted-foreground">
              Stays over twelve hours are left out of the averages and shown as —. They are
              check-ins closed off days later, not time in a room.
            </p>
          )}
        </CardContent>
      </Card>
    </div>
  );
}
