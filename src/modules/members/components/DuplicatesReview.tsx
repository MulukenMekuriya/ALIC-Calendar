/**
 * People who share a name, side by side, so an admin can tell one person
 * entered twice from two people with one name.
 *
 * There is no merge yet. Fixing a real duplicate is done by hand: open both,
 * keep the fuller record, move what belongs to the other, and mark the other
 * inactive. Two different people are marked as such, and the group is not
 * offered again unless someone else with the name is added.
 */

import { useState } from "react";
import { useNavigate } from "react-router-dom";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/shared/components/ui/card";
import { Button } from "@/shared/components/ui/button";
import {
  AlertDialog,
  AlertDialogAction,
  AlertDialogCancel,
  AlertDialogContent,
  AlertDialogDescription,
  AlertDialogFooter,
  AlertDialogHeader,
  AlertDialogTitle,
} from "@/shared/components/ui/alert-dialog";
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from "@/shared/components/ui/table";
import { CheckCircle2, ExternalLink, KeyRound, Loader2 } from "lucide-react";
import { toast } from "sonner";
import { formatPhone, personName, type DuplicateGroup } from "../utils/directory";
import { useDismissDuplicates } from "../hooks/useDirectory";
import { StatusBadge } from "./StatusBadge";

/** What the records in a group have in common, beyond the name. */
function inCommon(group: DuplicateGroup): string[] {
  const same = (pick: (p: DuplicateGroup["people"][number]) => string | null | undefined) => {
    const values = group.people.map((p) => pick(p)?.trim().toLowerCase() || null);
    return values.every((v) => v !== null && v === values[0]);
  };
  return [
    same((p) => p.phone?.replace(/\D/g, "")) && "Same phone",
    same((p) => p.email) && "Same email",
    same((p) => p.household_id) && "Same family",
  ].filter((x): x is string => !!x);
}

const shortDate = (iso: string) =>
  new Date(iso).toLocaleDateString("en-US", { month: "short", day: "numeric", year: "numeric" });

interface Props {
  organizationId: string | undefined;
  groups: DuplicateGroup[];
  canWrite: boolean;
}

export function DuplicatesReview({ organizationId, groups, canWrite }: Props) {
  const navigate = useNavigate();
  const dismiss = useDismissDuplicates(organizationId);
  const [confirming, setConfirming] = useState<DuplicateGroup | null>(null);

  async function markDifferent(group: DuplicateGroup) {
    try {
      await dismiss.mutateAsync(group.people.map((p) => p.id));
      toast.success(`${personName(group.people[0])}: marked as different people`);
    } catch (err) {
      toast.error("Could not save that", { description: err instanceof Error ? err.message : String(err) });
    } finally {
      setConfirming(null);
    }
  }

  return (
    <div className="space-y-4">
      <Card>
        <CardHeader>
          <CardTitle className="text-base">Likely duplicates</CardTitle>
          <CardDescription>
            Active people with the same first and last name. For one person entered twice, open both
            records, keep the fuller one up to date, and mark the other inactive. Two different people
            can be marked as such, and they are not shown again.
          </CardDescription>
        </CardHeader>
        {groups.length === 0 && (
          <CardContent className="flex items-center gap-2 text-sm text-emerald-700 dark:text-emerald-400">
            <CheckCircle2 className="h-4 w-4" aria-hidden /> No likely duplicates.
          </CardContent>
        )}
      </Card>

      {groups.map((group) => (
        <Card key={group.key}>
          <CardHeader className="flex-row items-center justify-between gap-3 space-y-0 pb-3">
            <div>
              <CardTitle className="text-base">{personName(group.people[0])}</CardTitle>
              <CardDescription className="flex flex-wrap items-center gap-1.5">
                {group.people.length} records with this name
                {inCommon(group).map((c) => (
                  <span
                    key={c}
                    className="rounded-full bg-amber-100 px-2 py-0.5 text-[11px] font-medium text-amber-900 dark:bg-amber-950 dark:text-amber-200"
                  >
                    {c}
                  </span>
                ))}
              </CardDescription>
            </div>
            {canWrite && (
              <Button variant="outline" size="sm" onClick={() => setConfirming(group)}>
                Different people
              </Button>
            )}
          </CardHeader>
          <CardContent className="pt-0">
            <div className="overflow-x-auto rounded-md border">
              {/* Fixed columns, so every group lines up with the next. */}
              <Table className="min-w-[52rem] table-fixed">
                <TableHeader className="bg-muted/50">
                  <TableRow>
                    <TableHead className="w-[20%]">Record</TableHead>
                    <TableHead className="w-[12%]">Membership</TableHead>
                    <TableHead className="w-[17%]">Family</TableHead>
                    <TableHead className="w-[14%]">Phone</TableHead>
                    <TableHead className="w-[21%]">Email</TableHead>
                    <TableHead className="w-[12%]">Added</TableHead>
                    <TableHead className="w-12" />
                  </TableRow>
                </TableHeader>
                <TableBody>
                  {group.people.map((p) => (
                    <TableRow key={p.id}>
                      <TableCell className="whitespace-nowrap">
                        <span className="font-medium">{p.is_child ? "Child" : "Adult"}</span>
                        {p.has_login && (
                          <span className="ml-2 inline-flex items-center gap-1 text-xs text-muted-foreground">
                            <KeyRound className="h-3 w-3" aria-hidden /> Signs in
                          </span>
                        )}
                        {p.last_check_in && (
                          <span className="block text-xs text-muted-foreground">
                            Last checked in {shortDate(p.last_check_in)}
                          </span>
                        )}
                      </TableCell>
                      <TableCell>
                        {p.is_child && !p.membership_code ? (
                          <span className="text-muted-foreground">—</span>
                        ) : (
                          <StatusBadge code={p.membership_code} name={p.membership_name} />
                        )}
                      </TableCell>
                      <TableCell className="truncate text-muted-foreground">{p.household_name ?? "—"}</TableCell>
                      <TableCell className="whitespace-nowrap tabular-nums text-muted-foreground">
                        {formatPhone(p.phone) || "—"}
                      </TableCell>
                      <TableCell className="truncate text-muted-foreground" title={p.email ?? undefined}>
                        {p.email ?? "—"}
                      </TableCell>
                      <TableCell className="whitespace-nowrap text-muted-foreground">
                        {shortDate(p.created_at)}
                        {p.created_by_name && <span className="block text-xs">{p.created_by_name}</span>}
                      </TableCell>
                      <TableCell>
                        <Button
                          variant="ghost"
                          size="sm"
                          onClick={() => navigate(`/members/${p.id}`)}
                          aria-label={`Open ${personName(p)}, added ${shortDate(p.created_at)}`}
                        >
                          <ExternalLink className="h-4 w-4" />
                        </Button>
                      </TableCell>
                    </TableRow>
                  ))}
                </TableBody>
              </Table>
            </div>
          </CardContent>
        </Card>
      ))}

      <AlertDialog open={!!confirming} onOpenChange={(o) => !o && !dismiss.isPending && setConfirming(null)}>
        <AlertDialogContent>
          <AlertDialogHeader>
            <AlertDialogTitle>These are different people?</AlertDialogTitle>
            <AlertDialogDescription>
              The {confirming?.people.length} records named {confirming ? personName(confirming.people[0]) : ""} will
              no longer be offered as duplicates. Nothing about them changes.
            </AlertDialogDescription>
          </AlertDialogHeader>
          <AlertDialogFooter>
            <AlertDialogCancel disabled={dismiss.isPending}>Cancel</AlertDialogCancel>
            <AlertDialogAction
              disabled={dismiss.isPending}
              onClick={(e) => {
                e.preventDefault();
                if (confirming) void markDifferent(confirming);
              }}
            >
              {dismiss.isPending && <Loader2 className="h-4 w-4 animate-spin" />}
              Yes, different people
            </AlertDialogAction>
          </AlertDialogFooter>
        </AlertDialogContent>
      </AlertDialog>
    </div>
  );
}
