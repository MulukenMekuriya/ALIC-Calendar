/**
 * The ledger, with the unmatched worklist built into it.
 *
 * "Unmatched" is a filter rather than a separate screen because the work of
 * identifying a Zelle line is the same work as reading the ledger, and a
 * separate screen is one more place for it to be forgotten.
 */

import { useState } from "react";
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
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from "@/shared/components/ui/dialog";
import { Loader2, UserPlus, ChevronLeft, ChevronRight, Undo2 } from "lucide-react";
import { useToast } from "@/shared/hooks/use-toast";
import { DonorPicker } from "./DonorPicker";
import { useDonations, useSetDonor } from "../hooks";
import { formatMoney, METHOD_LABELS } from "../utils/money";
import {
  DONATION_PAGE_SIZE,
  type DonationFilters,
  type DonationRow,
  type DonorCandidate,
} from "../types";

interface DonationsTableProps {
  organizationId: string;
  filters: DonationFilters;
  canWrite: boolean;
}

export function DonationsTable({ organizationId, filters, canWrite }: DonationsTableProps) {
  const { toast } = useToast();
  const [page, setPage] = useState(0);
  const [matching, setMatching] = useState<DonationRow | null>(null);
  const [donor, setDonor] = useState<DonorCandidate | null>(null);

  const { data, isLoading, isError, error } = useDonations(organizationId, filters, page);
  const setDonorMutation = useSetDonor();

  const rows = data?.rows ?? [];
  const total = data?.total ?? 0;
  const pageCount = Math.max(1, Math.ceil(total / DONATION_PAGE_SIZE));

  const attach = async () => {
    if (!matching || !donor) return;
    try {
      await setDonorMutation.mutateAsync({
        donationId: matching.id,
        personId: donor.person_id,
      });
      toast({
        title: "Donor attached",
        description: `${formatMoney(matching.amount_cents)} now credited to ${donor.display_name}.`,
      });
      setMatching(null);
      setDonor(null);
    } catch (err) {
      toast({
        title: "Could not attach the donor",
        description: err instanceof Error ? err.message : "Unknown error",
        variant: "destructive",
      });
    }
  };

  if (isLoading) {
    return (
      <div className="flex items-center justify-center py-12 text-muted-foreground">
        <Loader2 className="h-5 w-5 animate-spin mr-2" />
        Loading the ledger…
      </div>
    );
  }

  if (isError) {
    return (
      <p className="py-8 text-center text-sm text-destructive">
        {error instanceof Error ? error.message : "Could not load donations."}
      </p>
    );
  }

  if (rows.length === 0) {
    return (
      <p className="py-12 text-center text-sm text-muted-foreground">
        {filters.only_unmatched
          ? "Nothing is waiting to be identified. "
          : "No gifts recorded for these filters yet."}
      </p>
    );
  }

  return (
    <>
      <div className="overflow-x-auto">
        <Table>
          <TableHeader>
            <TableRow>
              <TableHead className="whitespace-nowrap">Date</TableHead>
              <TableHead>Donor</TableHead>
              <TableHead>Fund</TableHead>
              <TableHead>Method</TableHead>
              <TableHead className="text-right whitespace-nowrap">Amount</TableHead>
              <TableHead>Batch</TableHead>
              {canWrite && <TableHead className="w-10" />}
            </TableRow>
          </TableHeader>
          <TableBody>
            {rows.map((row) => (
              <TableRow key={row.id} className={row.refunded_at ? "opacity-60" : undefined}>
                <TableCell className="whitespace-nowrap">{row.received_on}</TableCell>
                <TableCell>
                  {row.donor_name ? (
                    <div className="min-w-0">
                      <div className="truncate">{row.donor_name}</div>
                      {row.household_name && (
                        <div className="truncate text-xs text-muted-foreground">
                          {row.household_name}
                        </div>
                      )}
                    </div>
                  ) : (
                    <div className="min-w-0">
                      <Badge variant="outline" className="text-muted-foreground">
                        Unmatched
                      </Badge>
                      {row.donor_name_raw && (
                        <div className="truncate text-xs text-muted-foreground mt-0.5">
                          File said “{row.donor_name_raw}”
                        </div>
                      )}
                    </div>
                  )}
                </TableCell>
                <TableCell className="whitespace-nowrap">
                  {row.fund_name}
                  {!row.is_tax_deductible && (
                    <Badge variant="secondary" className="ml-1.5">Not deductible</Badge>
                  )}
                </TableCell>
                <TableCell className="whitespace-nowrap">
                  {METHOD_LABELS[row.method] ?? row.method}
                  {row.check_number && (
                    <span className="text-xs text-muted-foreground"> #{row.check_number}</span>
                  )}
                </TableCell>
                <TableCell className="text-right font-medium whitespace-nowrap">
                  {formatMoney(row.amount_cents)}
                  {row.refunded_at && (
                    <span className="ml-1.5 inline-flex items-center text-xs text-muted-foreground">
                      <Undo2 className="h-3 w-3 mr-0.5" />
                      refunded
                    </span>
                  )}
                </TableCell>
                <TableCell className="whitespace-nowrap text-xs text-muted-foreground">
                  {row.batch_name ?? "—"}
                  {row.batch_status === "posted" && (
                    <Badge variant="secondary" className="ml-1.5">posted</Badge>
                  )}
                </TableCell>
                {canWrite && (
                  <TableCell>
                    {!row.person_id && !row.refunded_at && (
                      <Button
                        variant="ghost"
                        size="sm"
                        onClick={() => { setMatching(row); setDonor(null); }}
                        title="Attach a donor"
                      >
                        <UserPlus className="h-4 w-4" />
                        <span className="sr-only">Attach a donor</span>
                      </Button>
                    )}
                  </TableCell>
                )}
              </TableRow>
            ))}
          </TableBody>
        </Table>
      </div>

      {pageCount > 1 && (
        <div className="flex items-center justify-between pt-3">
          <p className="text-sm text-muted-foreground">
            {total} gift{total === 1 ? "" : "s"} · page {page + 1} of {pageCount}
          </p>
          <div className="flex gap-2">
            <Button
              variant="outline"
              size="sm"
              disabled={page === 0}
              onClick={() => setPage((p) => Math.max(0, p - 1))}
            >
              <ChevronLeft className="h-4 w-4" />
            </Button>
            <Button
              variant="outline"
              size="sm"
              disabled={page + 1 >= pageCount}
              onClick={() => setPage((p) => p + 1)}
            >
              <ChevronRight className="h-4 w-4" />
            </Button>
          </div>
        </div>
      )}

      <Dialog open={!!matching} onOpenChange={(open) => { if (!open) { setMatching(null); setDonor(null); } }}>
        <DialogContent className="sm:max-w-md">
          <DialogHeader>
            <DialogTitle>Who gave this?</DialogTitle>
            <DialogDescription>
              {matching && (
                <>
                  {formatMoney(matching.amount_cents)} on {matching.received_on}
                  {matching.donor_name_raw ? `, recorded as “${matching.donor_name_raw}”.` : "."}
                </>
              )}
            </DialogDescription>
          </DialogHeader>

          <DonorPicker
            organizationId={organizationId}
            value={donor}
            onChange={setDonor}
          />

          <DialogFooter>
            <Button variant="outline" onClick={() => setMatching(null)}>Cancel</Button>
            <Button onClick={attach} disabled={!donor || setDonorMutation.isPending}>
              {setDonorMutation.isPending && <Loader2 className="h-4 w-4 mr-1 animate-spin" />}
              Attach
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </>
  );
}
