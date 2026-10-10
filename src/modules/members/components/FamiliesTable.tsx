/**
 * Every family as a table: its status, who to call, who is in it, and when a
 * child of theirs last came.
 *
 * A family's status is the strongest anyone in it holds (member, regular
 * attendee, visitor), the rule the Kids Ministry uses for a child. The tiles
 * across the top are also filters: "No phone" shows the families the check-in
 * desk cannot find by phone.
 */

import { useEffect, useMemo, useState } from "react";
import { Card, CardContent } from "@/shared/components/ui/card";
import { Button } from "@/shared/components/ui/button";
import { Input } from "@/shared/components/ui/input";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectSeparator,
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
import {
  ArrowDown,
  ArrowUp,
  ArrowUpDown,
  ChevronLeft,
  ChevronRight,
  Download,
  Home,
  Loader2,
  Search,
} from "lucide-react";
import { cn } from "@/lib/utils";
import { toCSV, withUTF8BOM, downloadFile, getDateStamp } from "@/shared/lib/exportPrimitives";
import {
  NO_FAMILY_FILTERS,
  filterFamilies,
  formatPhone,
  sortFamilies,
  type DirectoryFamily,
  type FamilyFilters,
  type FamilySort,
  type SortDir,
} from "../utils/directory";
import { StatusBadge } from "./StatusBadge";

const PAGE = 50;

const STATUS_NAME: Record<DirectoryFamily["family_status"], string | null> = {
  member: "Member",
  regular_attendee: "Regular attendee",
  visitor: "Visitor",
  not_recorded: null,
};

const shortDate = (iso: string) =>
  new Date(`${iso.slice(0, 10)}T00:00:00`).toLocaleDateString("en-US", {
    month: "short",
    day: "numeric",
    year: "numeric",
  });

interface Props {
  families: DirectoryFamily[];
  isLoading: boolean;
  onOpen: (householdId: string) => void;
}

export function FamiliesTable({ families, isLoading, onOpen }: Props) {
  const [filters, setFilters] = useState<FamilyFilters>(NO_FAMILY_FILTERS);
  const [sort, setSort] = useState<{ by: FamilySort; dir: SortDir }>({ by: "name", dir: "asc" });
  const [page, setPage] = useState(0);

  const shown = useMemo(
    () => sortFamilies(filterFamilies(families, filters), sort.by, sort.dir),
    [families, filters, sort],
  );
  const lastPage = Math.max(0, Math.ceil(shown.length / PAGE) - 1);
  const rows = shown.slice(page * PAGE, (page + 1) * PAGE);
  useEffect(() => setPage(0), [filters]);

  const tiles = useMemo(
    () => ({
      all: families.length,
      withChildren: families.filter((f) => f.child_count > 0).length,
      members: families.filter((f) => f.family_status === "member").length,
      visitors: families.filter((f) => f.family_status === "visitor").length,
      noPhone: families.filter((f) => !f.primary_phone?.trim()).length,
    }),
    [families],
  );

  const set = (patch: Partial<FamilyFilters>) => setFilters({ ...filters, ...patch });
  const filtered =
    filters.search.trim() !== "" || filters.status !== "all" || filters.children !== "all" || filters.attention !== "all";

  function sortBy(by: FamilySort) {
    setSort((s) =>
      s.by === by
        ? { by, dir: s.dir === "asc" ? "desc" : "asc" }
        : { by, dir: by === "name" || by === "status" ? "asc" : "desc" },
    );
  }

  function sortHead(by: FamilySort, label: string, className?: string) {
    const active = sort.by === by;
    const Icon = !active ? ArrowUpDown : sort.dir === "asc" ? ArrowUp : ArrowDown;
    return (
      <TableHead className={className} aria-sort={active ? (sort.dir === "asc" ? "ascending" : "descending") : "none"}>
        <button
          type="button"
          onClick={() => sortBy(by)}
          className={cn("inline-flex items-center gap-1 hover:text-foreground", active && "text-foreground")}
        >
          {label}
          <Icon className={cn("h-3.5 w-3.5", !active && "opacity-40")} aria-hidden />
        </button>
      </TableHead>
    );
  }

  function exportRows() {
    downloadFile(
      withUTF8BOM(
        toCSV(
          ["Family", "Status", "Primary contact", "Phone", "Email", "Adults", "Children", "City", "Last check-in", "Added"],
          shown.map((f) => [
            f.name,
            STATUS_NAME[f.family_status] ?? "Not recorded",
            f.primary_contact_name ?? "",
            formatPhone(f.primary_phone),
            f.primary_email ?? "",
            f.adult_count,
            f.child_count,
            f.city ?? "",
            f.last_check_in ?? "",
            f.created_at.slice(0, 10),
          ]),
        ),
      ),
      `church-families-${getDateStamp()}.csv`,
      "text/csv",
    );
  }

  // A tile is a shortcut to one filter, and shows when it is the one applied.
  const tile = (
    label: string,
    value: number,
    patch: Partial<FamilyFilters> | null,
    active: boolean,
    warn = false,
  ) => (
    <Card
      className={cn(
        "cursor-pointer transition-colors hover:bg-muted/40",
        active && "ring-2 ring-primary/40",
        warn && value > 0 && "border-amber-300 dark:border-amber-800",
      )}
      onClick={() => setFilters(patch ? { ...NO_FAMILY_FILTERS, ...patch } : NO_FAMILY_FILTERS)}
      role="button"
      aria-pressed={active}
    >
      <CardContent className="p-4">
        <p className="text-xs text-muted-foreground">{label}</p>
        <p className="mt-1 text-2xl font-semibold tabular-nums">
          {isLoading ? <Loader2 className="h-5 w-5 animate-spin" /> : value.toLocaleString("en-US")}
        </p>
      </CardContent>
    </Card>
  );

  return (
    <div className="space-y-4">
      <div className="grid grid-cols-2 gap-3 lg:grid-cols-5">
        {tile("Families", tiles.all, null, !filtered)}
        {tile("With children", tiles.withChildren, { children: "with" },
          filters.children === "with" && filters.status === "all" && filters.attention === "all")}
        {tile("Member families", tiles.members, { status: "member" },
          filters.status === "member" && filters.children === "all" && filters.attention === "all")}
        {tile("Visitor families", tiles.visitors, { status: "visitor" },
          filters.status === "visitor" && filters.children === "all" && filters.attention === "all")}
        {tile("No phone number", tiles.noPhone, { attention: "no_phone" },
          filters.attention === "no_phone" && filters.status === "all" && filters.children === "all", true)}
      </div>

      {/* Filters ------------------------------------------------------- */}
      <div className="flex flex-col gap-2 lg:flex-row lg:items-center">
        <div className="relative flex-1">
          <Search className="absolute left-3 top-1/2 h-4 w-4 -translate-y-1/2 text-muted-foreground" />
          <Input
            className="pl-9"
            placeholder="Search by family, contact, email or phone"
            value={filters.search}
            onChange={(e) => set({ search: e.target.value })}
            aria-label="Search families"
          />
        </div>
        <div className="grid grid-cols-2 gap-2 sm:flex sm:flex-wrap sm:items-center">
          <Select value={filters.status} onValueChange={(v) => set({ status: v as FamilyFilters["status"] })}>
            <SelectTrigger className="sm:w-44" aria-label="Family status">
              <SelectValue />
            </SelectTrigger>
            <SelectContent>
              <SelectItem value="all">All statuses</SelectItem>
              <SelectSeparator />
              <SelectItem value="member">Member</SelectItem>
              <SelectItem value="regular_attendee">Regular attendee</SelectItem>
              <SelectItem value="visitor">Visitor</SelectItem>
              <SelectItem value="not_recorded">No status</SelectItem>
            </SelectContent>
          </Select>
          <Select value={filters.children} onValueChange={(v) => set({ children: v as FamilyFilters["children"] })}>
            <SelectTrigger className="sm:w-56" aria-label="Children">
              <SelectValue />
            </SelectTrigger>
            <SelectContent>
              <SelectItem value="all">With or without children</SelectItem>
              <SelectItem value="with">With children</SelectItem>
              <SelectItem value="without">Without children</SelectItem>
            </SelectContent>
          </Select>
          <Select value={filters.attention} onValueChange={(v) => set({ attention: v as FamilyFilters["attention"] })}>
            <SelectTrigger className="sm:w-56" aria-label="Needs attention">
              <SelectValue />
            </SelectTrigger>
            <SelectContent>
              <SelectItem value="all">Anything missing or not</SelectItem>
              <SelectSeparator />
              <SelectItem value="no_phone">No phone number</SelectItem>
              <SelectItem value="no_email">No email address</SelectItem>
              <SelectItem value="no_adult">No adult in the family</SelectItem>
            </SelectContent>
          </Select>
          <Button variant="outline" size="sm" className="h-10" onClick={exportRows} disabled={shown.length === 0}>
            <Download className="h-4 w-4" />
            Export
          </Button>
        </div>
      </div>

      <div className="flex min-h-6 items-center text-sm text-muted-foreground">
        <span className="font-medium text-foreground">{shown.length.toLocaleString("en-US")}</span>
        &nbsp;{shown.length === 1 ? "family" : "families"}
        {filtered && (
          <Button variant="link" size="sm" className="h-auto px-2 py-0" onClick={() => setFilters(NO_FAMILY_FILTERS)}>
            Clear filters
          </Button>
        )}
      </div>

      {/* The table --------------------------------------------------------- */}
      {isLoading ? (
        <div className="flex justify-center py-16">
          <Loader2 className="h-6 w-6 animate-spin text-muted-foreground" />
        </div>
      ) : shown.length === 0 ? (
        <div className="rounded-md border py-16 text-center">
          <Home className="mx-auto h-10 w-10 text-muted-foreground/50" />
          <p className="mt-3 text-sm text-muted-foreground">No families match these filters.</p>
        </div>
      ) : (
        <div className="overflow-x-auto rounded-md border">
          <Table>
            <TableHeader className="bg-muted/50">
              <TableRow>
                {sortHead("name", "Family", "min-w-[13rem]")}
                {sortHead("status", "Status")}
                <TableHead className="hidden md:table-cell">Primary contact</TableHead>
                <TableHead className="hidden lg:table-cell">Phone</TableHead>
                <TableHead className="text-right">Adults</TableHead>
                {sortHead("children", "Children", "text-right")}
                {sortHead("last_check_in", "Last check-in", "hidden sm:table-cell")}
                {sortHead("added", "Added", "hidden xl:table-cell")}
              </TableRow>
            </TableHeader>
            <TableBody>
              {rows.map((f) => (
                <TableRow key={f.household_id} className="cursor-pointer" onClick={() => onOpen(f.household_id)}>
                  <TableCell>
                    <span className="font-medium">{f.name}</span>
                    {f.city && <span className="block text-xs text-muted-foreground">{f.city}</span>}
                    {/* On narrow screens the contact moves under the name. */}
                    <span className="block text-xs text-muted-foreground md:hidden">
                      {f.primary_contact_name ?? "No adult on file"}
                    </span>
                  </TableCell>
                  <TableCell>
                    <StatusBadge code={f.family_status} name={STATUS_NAME[f.family_status]} />
                  </TableCell>
                  <TableCell className="hidden text-muted-foreground md:table-cell">
                    {f.primary_contact_name ?? <span className="italic">No adult on file</span>}
                  </TableCell>
                  <TableCell className="hidden whitespace-nowrap tabular-nums text-muted-foreground lg:table-cell">
                    {formatPhone(f.primary_phone) || (
                      <span className="text-amber-700 dark:text-amber-400">No phone</span>
                    )}
                  </TableCell>
                  <TableCell className="text-right tabular-nums">{f.adult_count}</TableCell>
                  <TableCell className="text-right tabular-nums">
                    {f.child_count === 0 ? <span className="text-muted-foreground/60">0</span> : f.child_count}
                  </TableCell>
                  <TableCell className="hidden whitespace-nowrap text-muted-foreground sm:table-cell">
                    {f.last_check_in ? shortDate(f.last_check_in) : "—"}
                  </TableCell>
                  <TableCell className="hidden whitespace-nowrap text-muted-foreground xl:table-cell">
                    {shortDate(f.created_at)}
                  </TableCell>
                </TableRow>
              ))}
            </TableBody>
          </Table>
        </div>
      )}

      {shown.length > PAGE && (
        <div className="flex items-center justify-between text-sm text-muted-foreground">
          <span className="tabular-nums">
            {(page * PAGE + 1).toLocaleString("en-US")}–{Math.min((page + 1) * PAGE, shown.length).toLocaleString("en-US")} of{" "}
            {shown.length.toLocaleString("en-US")}
          </span>
          <div className="flex items-center gap-2">
            <Button variant="outline" size="sm" disabled={page === 0} onClick={() => setPage(page - 1)}>
              <ChevronLeft className="h-4 w-4" />
              Previous
            </Button>
            <Button variant="outline" size="sm" disabled={page >= lastPage} onClick={() => setPage(page + 1)}>
              Next
              <ChevronRight className="h-4 w-4" />
            </Button>
          </div>
        </div>
      )}
    </div>
  );
}
