/**
 * Hook for fetching and managing fiscal years
 */

import { useQuery, useMutation, useQueryClient } from "@tanstack/react-query";
import { fiscalYearService } from "../services";
import type { FiscalYearInsert, FiscalYearUpdate } from "../types";

// Query keys
export const fiscalYearKeys = {
  all: ["fiscal-years"] as const,
  lists: () => [...fiscalYearKeys.all, "list"] as const,
  list: (orgId: string) => [...fiscalYearKeys.lists(), orgId] as const,
  active: (orgId: string) => [...fiscalYearKeys.all, "active", orgId] as const,
  details: () => [...fiscalYearKeys.all, "detail"] as const,
  detail: (id: string) => [...fiscalYearKeys.details(), id] as const,
};

/**
 * Hook to fetch fiscal years for an organization
 */
export function useFiscalYears(organizationId: string | undefined) {
  return useQuery({
    queryKey: fiscalYearKeys.list(organizationId || ""),
    queryFn: () => fiscalYearService.list(organizationId!),
    enabled: !!organizationId,
  });
}

/**
 * Hook to fetch the active fiscal year
 */
export function useActiveFiscalYear(organizationId: string | undefined) {
  return useQuery({
    queryKey: fiscalYearKeys.active(organizationId || ""),
    queryFn: () => fiscalYearService.getActive(organizationId!),
    enabled: !!organizationId,
  });
}

/**
 * Hook to fetch where budget requests stand for a branch. Rechecked every
 * few minutes, so a page left open across midnight on 1 November locks.
 */
export function useRequestSeason(organizationId: string | undefined) {
  return useQuery({
    queryKey: [...fiscalYearKeys.all, "request-season", organizationId || ""],
    queryFn: () => fiscalYearService.getRequestSeason(organizationId!),
    enabled: !!organizationId,
    refetchInterval: 5 * 60 * 1000,
  });
}

/**
 * Hook to fetch a single fiscal year
 */
export function useFiscalYear(fiscalYearId: string | undefined) {
  return useQuery({
    queryKey: fiscalYearKeys.detail(fiscalYearId || ""),
    queryFn: () => fiscalYearService.get(fiscalYearId!),
    enabled: !!fiscalYearId,
  });
}

/**
 * Hook to create a fiscal year
 */
export function useCreateFiscalYear() {
  const queryClient = useQueryClient();

  return useMutation({
    mutationFn: (fiscalYearData: FiscalYearInsert) =>
      fiscalYearService.create(fiscalYearData),
    onSuccess: (data) => {
      queryClient.invalidateQueries({
        queryKey: fiscalYearKeys.list(data.organization_id),
      });
    },
  });
}

/**
 * Hook to update a fiscal year
 */
export function useUpdateFiscalYear() {
  const queryClient = useQueryClient();

  return useMutation({
    mutationFn: ({
      fiscalYearId,
      data,
    }: {
      fiscalYearId: string;
      data: FiscalYearUpdate;
    }) => fiscalYearService.update(fiscalYearId, data),
    onSuccess: (data) => {
      queryClient.invalidateQueries({ queryKey: fiscalYearKeys.lists() });
      queryClient.invalidateQueries({ queryKey: fiscalYearKeys.detail(data.id) });
    },
  });
}

/**
 * Hook to set a fiscal year as active
 */
export function useSetActiveFiscalYear() {
  const queryClient = useQueryClient();

  return useMutation({
    mutationFn: ({
      fiscalYearId,
      organizationId,
    }: {
      fiscalYearId: string;
      organizationId: string;
    }) => fiscalYearService.setActive(fiscalYearId, organizationId),
    onSuccess: (data) => {
      queryClient.invalidateQueries({ queryKey: fiscalYearKeys.lists() });
      queryClient.invalidateQueries({
        queryKey: fiscalYearKeys.active(data.organization_id),
      });
    },
  });
}

/**
 * Hook to delete a fiscal year
 */
export function useDeleteFiscalYear() {
  const queryClient = useQueryClient();

  return useMutation({
    mutationFn: (fiscalYearId: string) => fiscalYearService.delete(fiscalYearId),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: fiscalYearKeys.lists() });
    },
  });
}
