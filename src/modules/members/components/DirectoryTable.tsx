/**
 * The directory, as a table the office can work from.
 *
 * Everyone is already in the browser (utils/directory), so every column
 * sorts, every filter is instant, the counts are exact, and the spreadsheet
 * is exactly the rows filtered — not the page on screen.
 *
 * A members admin can tick people and give them all one membership status:
 * the way through the 404 adults who had none on 10 October. The database
 * records each change in the person's history, as it does for one edit.
 */

import { useEffect, useMemo, useState } from "react";
import { useNavigate } from "react-router-dom";
import { Button } from "@/shared/components/ui/button";
import { Input } from "@/shared/components/ui/input";
import { Label } from "@/shared/components/ui/label";
import { Checkbox } from "@/shared/components/ui/checkbox";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectSeparator,
  SelectTrigger,
  SelectValue,
} from "@/shared/components/ui/select";
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from "@/shared/components/ui/dialog";
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
  Baby,
  ChevronLeft,
  ChevronRight,
  Download,
  Loader2,
  Search,
  Tags,
  UserRound,
  X,
} from "lucide-react";
import { toast } from "sonner";
import { cn } from "@/lib/utils";
import { toCSV, withUTF8BOM, downloadFile, getDateStamp } from "@/shared/lib/exportPrimitives";
import type { MembershipStatus } from "../types";
import {
  ATTENTION,
  NO_FILTERS,
  NO_STATUS,
  ageOrGrade,
  filterPeople,
  formatPhone,
  personName,
  sortPeople,
  type DirectoryFilters,
  type DirectoryPerson,
  type PeopleSort,
  type SortDir,
} from "../utils/directory";
import { useSetMembershipStatus } from "../hooks/useDirectory";
import { usePersonPhotos, primaryPhotoUrl } from "../hooks/usePersonPhotos";
import { PersonAvatar } from "./PersonAvatar";
import { StatusBadge } from "./StatusBadge";

const PAGE_SIZES = [25, 50, 100];

const added = (iso: string) =>
  new Date(iso).toLocaleDateString("en-US", { month: "short", day: "numeric", year: "numeric" });

interface Props {
  organizationId: string | undefined;
  people: DirectoryPerson[];
  statuses: MembershipStatus[];
  duplicates: ReadonlySet<string>;
  filters: DirectoryFilters;
  onFiltersChange: (filters: DirectoryFilters) => void;
  /** members.write: may tick people and set their status. */
  canWrite: boolean;
  isLoading: boolean;
}

export function DirectoryTable({
  organizationId,
  people,
  statuses,
  duplicates,
  filters,
  onFiltersChange,
  canWrite,
  isLoading,
}: Props) {
  const navigate = useNavigate();
  const [sort, setSort] = useState<{ by: PeopleSort; dir: SortDir }>({ by: "name", dir: "asc" });
  const [page, setPage] = useState(0);
  const [pageSize, setPageSize] = useState(50);
  const [selected, setSelected] = useState<Set<string>>(new Set());
  const [bulkOpen, setBulkOpen] = useState(false);

  const shown = useMemo(
    () => sortPeople(filterPeople(people, filters, duplicates), sort.by, sort.dir),
    [people, filters, duplicates, sort],
  );
  const lastPage = Math.max(0, Math.ceil(shown.length / pageSize) - 1);
  const pageRows = shown.slice(page * pageSize, (page + 1) * pageSize);
  const { data: photos } = usePersonPhotos(pageRows.map((p) => p.id));

  // A new filter starts at the first page, and a page past the end comes back.
  useEffect(() => setPage(0), [filters, pageSize]);
  useEffect(() => {
    if (page > lastPage) setPage(lastPage);
  }, [page, lastPage]);

  const set = (patch: Partial<DirectoryFilters>) => onFiltersChange({ ...filters, ...patch });
  const filtered =
    filters.search.trim() !== "" ||
    filters.status !== "all" ||
    filters.type !== "all" ||
    filters.attention !== "all" ||
    filters.includeInactive;

  const pageIds = pageRows.map((p) => p.id);
  const pageAllSelected = pageIds.length > 0 && pageIds.every((id) => selected.has(id));
  const allShownSelected = shown.length > 0 && shown.every((p) => selected.has(p.id));

  function toggle(id: string) {
    const next = new Set(selected);
    if (next.has(id)) next.delete(id);
    else next.add(id);
    setSelected(next);
  }
  function togglePage() {
    const next = new Set(selected);
    for (const id of pageIds) {
      if (pageAllSelected) next.delete(id);
      else next.add(id);
    }
    setSelected(next);
  }

  function sortBy(by: PeopleSort) {
    setSort((s) => (s.by === by ? { by, dir: s.dir === "asc" ? "desc" : "asc" } : { by, dir: by === "added" ? "desc" : "asc" }));
  }

  function exportRows() {
    downloadFile(
      withUTF8BOM(
        toCSV(
          ["First name", "Last name", "Preferred name", "Adult or child", "Membership", "Family", "Phone", "Email", "Grade", "Birth month", "Birth year", "Active", "Has login", "Added"],
          shown.map((p) => [
            p.first_name,
            p.last_name,
            p.preferred_name,
            p.is_child ? "Child" : "Adult",
            p.membership_name ?? "",
            p.household_name ?? "",
            formatPhone(p.phone),
            p.email ?? "",
            p.grade_name ?? "",
            p.birth_month,
            p.birth_year,
            p.is_active ? "Yes" : "No",
            p.has_login ? "Yes" : "No",
            p.created_at.slice(0, 10),
          ]),
        ),
      ),
      `church-directory-${getDateStamp()}.csv`,
      "text/csv",
    );
  }

  function sortHead(by: PeopleSort, label: string, className?: string) {
    const active = sort.by === by;
    const Icon = !active ? ArrowUpDown : sort.dir === "asc" ? ArrowUp : ArrowDown;
    return (
      <TableHead
        className={className}
        aria-sort={active ? (sort.dir === "asc" ? "ascending" : "descending") : "none"}
      >
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

  return (
    <div className="space-y-3">
      {/* Filters ------------------------------------------------------- */}
      <div className="flex flex-col gap-2 xl:flex-row xl:items-center">
        <div className="relative flex-1">
          <Search className="absolute left-3 top-1/2 h-4 w-4 -translate-y-1/2 text-muted-foreground" />
          <Input
            className="pl-9"
            placeholder="Search by name, family, email or phone"
            value={filters.search}
            onChange={(e) => set({ search: e.target.value })}
            aria-label="Search the directory"
          />
        </div>
        <div className="grid grid-cols-2 gap-2 sm:flex sm:flex-wrap sm:items-center">
          <Select value={filters.status} onValueChange={(v) => set({ status: v })}>
            <SelectTrigger className="sm:w-44" aria-label="Membership status">
              <SelectValue />
            </SelectTrigger>
            <SelectContent>
              <SelectItem value="all">All statuses</SelectItem>
              <SelectItem value={NO_STATUS}>No status</SelectItem>
              <SelectSeparator />
              {statuses.map((s) => (
                <SelectItem key={s.id} value={s.id}>
                  {s.display_name}
                </SelectItem>
              ))}
            </SelectContent>
          </Select>
          <Select value={filters.type} onValueChange={(v) => set({ type: v as DirectoryFilters["type"] })}>
            <SelectTrigger className="sm:w-36" aria-label="Adults or children">
              <SelectValue />
            </SelectTrigger>
            <SelectContent>
              <SelectItem value="all">Everyone</SelectItem>
              <SelectItem value="adults">Adults</SelectItem>
              <SelectItem value="children">Children</SelectItem>
            </SelectContent>
          </Select>
          <Select
            value={filters.attention}
            onValueChange={(v) => set({ attention: v as DirectoryFilters["attention"] })}
          >
            <SelectTrigger className="col-span-2 sm:w-56" aria-label="Needs attention">
              <SelectValue />
            </SelectTrigger>
            <SelectContent>
              <SelectItem value="all">Anything missing or not</SelectItem>
              <SelectSeparator />
              {ATTENTION.map((a) => (
                <SelectItem key={a.key} value={a.key}>
                  {a.label}
                </SelectItem>
              ))}
            </SelectContent>
          </Select>
          <div className="col-span-2 flex items-center justify-between gap-2 sm:justify-start">
            <div className="flex items-center gap-2 px-1">
              <Checkbox
                id="include-inactive"
                checked={filters.includeInactive}
                onCheckedChange={(v) => set({ includeInactive: v === true })}
              />
              <Label htmlFor="include-inactive" className="whitespace-nowrap text-sm font-normal">
                Include inactive
              </Label>
            </div>
            <Button variant="outline" size="sm" onClick={exportRows} disabled={shown.length === 0}>
              <Download className="h-4 w-4" />
              Export
            </Button>
          </div>
        </div>
      </div>

      {/* What is showing, and what is ticked ------------------------------- */}
      <div className="flex min-h-9 flex-wrap items-center justify-between gap-2 text-sm">
        <span className="text-muted-foreground">
          {isLoading ? (
            <span className="inline-flex items-center gap-2">
              <Loader2 className="h-4 w-4 animate-spin" /> Loading the directory…
            </span>
          ) : (
            <>
              <span className="font-medium text-foreground">{shown.length.toLocaleString("en-US")}</span>{" "}
              {shown.length === 1 ? "person" : "people"}
              {filtered && (
                <Button
                  variant="link"
                  size="sm"
                  className="h-auto px-2 py-0"
                  onClick={() => onFiltersChange(NO_FILTERS)}
                >
                  Clear filters
                </Button>
              )}
            </>
          )}
        </span>
        {canWrite && selected.size > 0 && (
          <div className="flex flex-wrap items-center gap-2 rounded-md border bg-muted/50 px-2 py-1">
            <span className="px-1 font-medium">{selected.size.toLocaleString("en-US")} selected</span>
            {pageAllSelected && !allShownSelected && (
              <Button
                variant="link"
                size="sm"
                className="h-auto px-1 py-0"
                onClick={() => setSelected(new Set([...selected, ...shown.map((p) => p.id)]))}
              >
                Select all {shown.length.toLocaleString("en-US")}
              </Button>
            )}
            <Button size="sm" onClick={() => setBulkOpen(true)}>
              <Tags className="h-4 w-4" />
              Set membership status
            </Button>
            <Button variant="ghost" size="sm" onClick={() => setSelected(new Set())} aria-label="Clear selection">
              <X className="h-4 w-4" />
            </Button>
          </div>
        )}
      </div>

      {/* The table --------------------------------------------------------- */}
      {!isLoading && shown.length === 0 ? (
        <div className="rounded-md border py-16 text-center">
          <UserRound className="mx-auto h-10 w-10 text-muted-foreground/50" />
          <p className="mt-3 text-sm text-muted-foreground">Nobody matches these filters.</p>
        </div>
      ) : (
        <div className="overflow-x-auto rounded-md border">
          <Table>
            <TableHeader className="bg-muted/50">
              <TableRow>
                {canWrite && (
                  <TableHead className="w-10">
                    <Checkbox
                      checked={pageAllSelected}
                      onCheckedChange={togglePage}
                      aria-label="Select everyone on this page"
                    />
                  </TableHead>
                )}
                {sortHead("name", "Name", "min-w-[14rem]")}
                {sortHead("status", "Membership")}
                {sortHead("family", "Family", "hidden md:table-cell")}
                <TableHead className="hidden lg:table-cell">Phone</TableHead>
                <TableHead className="hidden xl:table-cell">Email</TableHead>
                <TableHead className="hidden sm:table-cell">Age / grade</TableHead>
                {sortHead("added", "Added", "hidden 2xl:table-cell")}
              </TableRow>
            </TableHeader>
            <TableBody>
              {pageRows.map((p) => (
                <TableRow
                  key={p.id}
                  className={cn("cursor-pointer", selected.has(p.id) && "bg-primary/5")}
                  onClick={() => navigate(`/members/${p.id}`)}
                >
                  {canWrite && (
                    <TableCell onClick={(e) => e.stopPropagation()}>
                      <Checkbox
                        checked={selected.has(p.id)}
                        onCheckedChange={() => toggle(p.id)}
                        aria-label={`Select ${personName(p)}`}
                      />
                    </TableCell>
                  )}
                  <TableCell>
                    <span className="flex items-center gap-2.5">
                      <PersonAvatar url={primaryPhotoUrl(photos, p.id)} name={personName(p)} size="sm" />
                      <span className="min-w-0">
                        <span className="flex items-center gap-1.5 font-medium">
                          {personName(p)}
                          {p.is_child && <Baby className="h-3.5 w-3.5 text-muted-foreground" aria-label="Child" />}
                          {!p.is_active && (
                            <span className="rounded bg-muted px-1.5 text-[11px] font-normal text-muted-foreground">
                              Inactive
                            </span>
                          )}
                          {duplicates.has(p.id) && (
                            <span className="rounded bg-amber-100 px-1.5 text-[11px] font-normal text-amber-900 dark:bg-amber-950 dark:text-amber-200">
                              Possible duplicate
                            </span>
                          )}
                        </span>
                        {/* On narrow screens the family moves under the name. */}
                        {p.household_name && (
                          <span className="block text-xs text-muted-foreground md:hidden">{p.household_name}</span>
                        )}
                      </span>
                    </span>
                  </TableCell>
                  <TableCell>
                    {/* A child rarely has a status of their own; their family's
                        is what counts, so a blank is not a gap to flag. */}
                    {p.is_child && !p.membership_code ? (
                      <span className="text-muted-foreground">—</span>
                    ) : (
                      <StatusBadge code={p.membership_code} name={p.membership_name} />
                    )}
                  </TableCell>
                  <TableCell className="hidden text-muted-foreground md:table-cell">
                    {p.household_name ?? <span className="italic">No family</span>}
                  </TableCell>
                  <TableCell className="hidden whitespace-nowrap tabular-nums text-muted-foreground lg:table-cell">
                    {formatPhone(p.phone) || "—"}
                  </TableCell>
                  <TableCell className="hidden max-w-[16rem] truncate text-muted-foreground xl:table-cell">
                    {p.email ?? "—"}
                  </TableCell>
                  <TableCell className="hidden whitespace-nowrap text-muted-foreground sm:table-cell">
                    {ageOrGrade(p) || "—"}
                  </TableCell>
                  <TableCell className="hidden whitespace-nowrap text-muted-foreground 2xl:table-cell">
                    {added(p.created_at)}
                  </TableCell>
                </TableRow>
              ))}
            </TableBody>
          </Table>
        </div>
      )}

      {/* Pages ------------------------------------------------------------- */}
      {shown.length > 0 && (
        <div className="flex flex-col gap-2 text-sm text-muted-foreground sm:flex-row sm:items-center sm:justify-between">
          <div className="flex items-center gap-2">
            <span>Rows</span>
            <Select value={String(pageSize)} onValueChange={(v) => setPageSize(Number(v))}>
              <SelectTrigger className="h-8 w-20" aria-label="Rows per page">
                <SelectValue />
              </SelectTrigger>
              <SelectContent>
                {PAGE_SIZES.map((n) => (
                  <SelectItem key={n} value={String(n)}>
                    {n}
                  </SelectItem>
                ))}
              </SelectContent>
            </Select>
            <span className="tabular-nums">
              {(page * pageSize + 1).toLocaleString("en-US")}–
              {Math.min((page + 1) * pageSize, shown.length).toLocaleString("en-US")} of{" "}
              {shown.length.toLocaleString("en-US")}
            </span>
          </div>
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

      <BulkStatusDialog
        open={bulkOpen}
        onOpenChange={setBulkOpen}
        organizationId={organizationId}
        people={people.filter((p) => selected.has(p.id))}
        statuses={statuses}
        onDone={() => setSelected(new Set())}
      />
    </div>
  );
}

/** One status for everyone ticked, after saying what will change. */
function BulkStatusDialog({
  open,
  onOpenChange,
  organizationId,
  people,
  statuses,
  onDone,
}: {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  organizationId: string | undefined;
  people: DirectoryPerson[];
  statuses: MembershipStatus[];
  onDone: () => void;
}) {
  const [statusId, setStatusId] = useState<string>("");
  const save = useSetMembershipStatus(organizationId);
  const chosen = statuses.find((s) => s.id === statusId);
  const already = people.filter((p) => p.membership_status_id === statusId).length;
  const children = people.filter((p) => p.is_child).length;
  const changing = people.length - already;

  useEffect(() => {
    if (!open) setStatusId("");
  }, [open]);

  async function apply() {
    if (!chosen) return;
    try {
      const n = await save.mutateAsync({ personIds: people.map((p) => p.id), statusId: chosen.id });
      toast.success(`${n.toLocaleString("en-US")} ${n === 1 ? "person is" : "people are"} now ${chosen.display_name}`, {
        description: "Each change is recorded in the person's history.",
      });
      onDone();
      onOpenChange(false);
    } catch (err) {
      toast.error("Could not set the status", {
        description: err instanceof Error ? err.message : String(err),
      });
    }
  }

  return (
    <Dialog open={open} onOpenChange={(o) => !save.isPending && onOpenChange(o)}>
      <DialogContent className="sm:max-w-md">
        <DialogHeader>
          <DialogTitle>Set membership status</DialogTitle>
          <DialogDescription>
            For the {people.length.toLocaleString("en-US")} {people.length === 1 ? "person" : "people"} you
            selected. Each change is recorded in their history with your name.
          </DialogDescription>
        </DialogHeader>
        <div className="space-y-3">
          <Select value={statusId} onValueChange={setStatusId}>
            <SelectTrigger aria-label="New status">
              <SelectValue placeholder="Choose a status" />
            </SelectTrigger>
            <SelectContent>
              {statuses.map((s) => (
                <SelectItem key={s.id} value={s.id}>
                  {s.display_name}
                </SelectItem>
              ))}
            </SelectContent>
          </Select>
          {chosen && (
            <ul className="space-y-1 rounded-md bg-muted/50 p-3 text-sm">
              <li>
                <span className="font-medium">{changing.toLocaleString("en-US")}</span> will change to{" "}
                {chosen.display_name}
              </li>
              {already > 0 && (
                <li className="text-muted-foreground">
                  {already.toLocaleString("en-US")} already {already === 1 ? "has" : "have"} it and stay as they are
                </li>
              )}
              {children > 0 && (
                <li className="text-muted-foreground">
                  {children.toLocaleString("en-US")} {children === 1 ? "is a child" : "are children"}; children
                  usually take their family&rsquo;s status
                </li>
              )}
            </ul>
          )}
        </div>
        <DialogFooter>
          <Button variant="outline" onClick={() => onOpenChange(false)} disabled={save.isPending}>
            Cancel
          </Button>
          <Button onClick={apply} disabled={!chosen || changing === 0 || save.isPending}>
            {save.isPending && <Loader2 className="h-4 w-4 animate-spin" />}
            {chosen ? `Set ${changing.toLocaleString("en-US")} to ${chosen.display_name}` : "Set status"}
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}
