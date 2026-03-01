/**
 * Hooks for fetching and managing ministry flags
 */

import { useQuery, useMutation, useQueryClient } from "@tanstack/react-query";
import { ministryFlagService } from "../services";
import type { MinistryFlagInsert } from "../types";

// Query keys
export const ministryFlagKeys = {
  all: ["ministry-flags"] as const,
  lists: () => [...ministryFlagKeys.all, "list"] as const,
  list: (
    orgId: string,
    options?: { unresolvedOnly?: boolean; ministryId?: string }
  ) => [...ministryFlagKeys.lists(), orgId, options] as const,
  blocked: (orgId: string) =>
    [...ministryFlagKeys.all, "blocked", orgId] as const,
  unresolvedForMinistry: (ministryId: string) =>
    [...ministryFlagKeys.all, "unresolved", ministryId] as const,
};

/**
 * Fetch all flags for an organization
 */
export function useMinistryFlags(
  organizationId: string | undefined,
  options?: { unresolvedOnly?: boolean; ministryId?: string }
) {
  return useQuery({
    queryKey: ministryFlagKeys.list(organizationId || "", options),
    queryFn: () => ministryFlagService.list(organizationId!, options),
    enabled: !!organizationId,
  });
}

/**
 * Fetch blocked ministry IDs for an organization
 */
export function useBlockedMinistryIds(organizationId: string | undefined) {
  return useQuery({
    queryKey: ministryFlagKeys.blocked(organizationId || ""),
    queryFn: () => ministryFlagService.getBlockedMinistryIds(organizationId!),
    enabled: !!organizationId,
    staleTime: 2 * 60 * 1000, // 2 minutes
  });
}

/**
 * Get unresolved flags for a specific ministry
 */
export function useUnresolvedMinistryFlags(
  ministryId: string | undefined
) {
  return useQuery({
    queryKey: ministryFlagKeys.unresolvedForMinistry(ministryId || ""),
    queryFn: () => ministryFlagService.getUnresolvedForMinistry(ministryId!),
    enabled: !!ministryId,
  });
}

/**
 * Create a ministry flag
 */
export function useCreateMinistryFlag() {
  const queryClient = useQueryClient();

  return useMutation({
    mutationFn: (flagData: MinistryFlagInsert) =>
      ministryFlagService.create(flagData),
    onSuccess: (data) => {
      queryClient.invalidateQueries({
        queryKey: ministryFlagKeys.lists(),
      });
      queryClient.invalidateQueries({
        queryKey: ministryFlagKeys.blocked(data.organization_id),
      });
      queryClient.invalidateQueries({
        queryKey: ministryFlagKeys.unresolvedForMinistry(data.ministry_id),
      });
    },
  });
}

/**
 * Resolve a ministry flag
 */
export function useResolveMinistryFlag() {
  const queryClient = useQueryClient();

  return useMutation({
    mutationFn: ({
      flagId,
      resolvedBy,
      resolvedByName,
      resolutionNotes,
    }: {
      flagId: string;
      resolvedBy: string;
      resolvedByName: string;
      resolutionNotes?: string;
    }) =>
      ministryFlagService.resolve(
        flagId,
        resolvedBy,
        resolvedByName,
        resolutionNotes
      ),
    onSuccess: (data) => {
      queryClient.invalidateQueries({
        queryKey: ministryFlagKeys.lists(),
      });
      queryClient.invalidateQueries({
        queryKey: ministryFlagKeys.blocked(data.organization_id),
      });
      queryClient.invalidateQueries({
        queryKey: ministryFlagKeys.unresolvedForMinistry(data.ministry_id),
      });
    },
  });
}

/**
 * Delete a ministry flag
 */
export function useDeleteMinistryFlag() {
  const queryClient = useQueryClient();

  return useMutation({
    mutationFn: (flagId: string) => ministryFlagService.delete(flagId),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ministryFlagKeys.all });
    },
  });
}
