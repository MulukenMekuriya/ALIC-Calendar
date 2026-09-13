/**
 * React Query hooks for the giving module.
 *
 * Cache keys are namespaced by organization because a treasurer at Silver
 * Spring switching branches must not see Springfield's ledger from cache.
 */

import { useQuery, useMutation, useQueryClient } from "@tanstack/react-query";
import { givingService } from "../services";
import type {
  DonationFilters,
  DonationInsert,
} from "../types";
import type { GivingImportRow } from "../utils/csvGiving";

export const givingKeys = {
  all: ["church", "giving"] as const,
  funds: (orgId: string) => [...givingKeys.all, "funds", orgId] as const,
  overview: (orgId: string, year: number) =>
    [...givingKeys.all, "overview", orgId, year] as const,
  fundTotals: (orgId: string, year: number) =>
    [...givingKeys.all, "fund-totals", orgId, year] as const,
  donations: (orgId: string, filters: DonationFilters, page: number) =>
    [...givingKeys.all, "donations", orgId, filters, page] as const,
  batches: (orgId: string) => [...givingKeys.all, "batches", orgId] as const,
  donorSearch: (orgId: string, term: string) =>
    [...givingKeys.all, "donor-search", orgId, term] as const,
  recipients: (orgId: string, year: number, minCents: number) =>
    [...givingKeys.all, "statement-recipients", orgId, year, minCents] as const,
  statement: (orgId: string, year: number, hh: string | null, person: string | null) =>
    [...givingKeys.all, "statement", orgId, year, hh, person] as const,
  myGiving: (year: number | null) => [...givingKeys.all, "mine", year] as const,
  myGivingYears: () => [...givingKeys.all, "mine", "years"] as const,
};

export function useGivingFunds(orgId: string | undefined, includeInactive = false) {
  return useQuery({
    queryKey: [...givingKeys.funds(orgId ?? ""), includeInactive],
    queryFn: () => givingService.listFunds(orgId!, includeInactive),
    enabled: !!orgId,
    staleTime: 5 * 60_000,
  });
}

export function useGivingOverview(orgId: string | undefined, year: number) {
  return useQuery({
    queryKey: givingKeys.overview(orgId ?? "", year),
    queryFn: () => givingService.overview(orgId!, year),
    enabled: !!orgId,
  });
}

export function useFundTotals(orgId: string | undefined, year: number) {
  return useQuery({
    queryKey: givingKeys.fundTotals(orgId ?? "", year),
    queryFn: () => givingService.fundTotals(orgId!, year),
    enabled: !!orgId,
  });
}

export function useDonations(
  orgId: string | undefined,
  filters: DonationFilters,
  page: number
) {
  return useQuery({
    queryKey: givingKeys.donations(orgId ?? "", filters, page),
    queryFn: () => givingService.listDonations(orgId!, filters, page),
    enabled: !!orgId,
    placeholderData: (previous) => previous,
  });
}

export function useGivingBatches(orgId: string | undefined) {
  return useQuery({
    queryKey: givingKeys.batches(orgId ?? ""),
    queryFn: () => givingService.listBatches(orgId!),
    enabled: !!orgId,
  });
}

export function useDonorSearch(orgId: string | undefined, term: string) {
  return useQuery({
    queryKey: givingKeys.donorSearch(orgId ?? "", term),
    queryFn: () => givingService.searchDonors(orgId!, term),
    enabled: !!orgId && term.trim().length >= 3,
    staleTime: 30_000,
  });
}

export function useStatementRecipients(
  orgId: string | undefined,
  year: number,
  minCents: number,
  enabled: boolean
) {
  return useQuery({
    queryKey: givingKeys.recipients(orgId ?? "", year, minCents),
    queryFn: () => givingService.statementRecipients(orgId!, year, minCents),
    // Every call writes a church.giving_access_audit row, so this must not run
    // on a page load nobody asked for.
    enabled: !!orgId && enabled,
    staleTime: 0,
    gcTime: 0,
  });
}

export function useMyGiving(year: number | null) {
  return useQuery({
    queryKey: givingKeys.myGiving(year),
    queryFn: () => givingService.myGiving(year),
  });
}

export function useMyGivingYears() {
  return useQuery({
    queryKey: givingKeys.myGivingYears(),
    queryFn: () => givingService.myGivingYears(),
  });
}

/** Everything that writes invalidates the whole module — the numbers all move together. */
function useGivingMutation<TArgs, TResult>(fn: (args: TArgs) => Promise<TResult>) {
  const queryClient = useQueryClient();
  return useMutation({
    mutationFn: fn,
    onSuccess: () => {
      void queryClient.invalidateQueries({ queryKey: givingKeys.all });
    },
  });
}

export function useRecordDonation() {
  return useGivingMutation((donation: DonationInsert) =>
    givingService.recordDonation(donation)
  );
}

export function useSetDonor() {
  return useGivingMutation(({ donationId, personId }: { donationId: string; personId: string | null }) =>
    givingService.setDonor(donationId, personId)
  );
}

export function useRefundDonation() {
  return useGivingMutation(({ donationId, reason }: { donationId: string; reason: string }) =>
    givingService.refundDonation(donationId, reason)
  );
}

export function useCreateBatch() {
  return useGivingMutation((batch: Parameters<typeof givingService.createBatch>[0]) =>
    givingService.createBatch(batch)
  );
}

export function usePostBatch() {
  return useGivingMutation((batchId: string) => givingService.postBatch(batchId));
}

export function useCreateFund() {
  return useGivingMutation((fund: Parameters<typeof givingService.createFund>[0]) =>
    givingService.createFund(fund)
  );
}

export function useImportCommit() {
  return useGivingMutation(
    ({
      organizationId,
      batchId,
      rows,
    }: {
      organizationId: string;
      batchId: string | null;
      rows: GivingImportRow[];
    }) => givingService.importCommit(organizationId, batchId, rows)
  );
}
