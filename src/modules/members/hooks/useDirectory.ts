/**
 * The directory and family lists, and the two changes made from them.
 */

import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { directoryService } from "../services/directoryService";
import { memberKeys } from "./useMembers";

export const directoryKeys = {
  all: ["church", "directory"] as const,
  people: (orgId: string) => [...directoryKeys.all, "people", orgId] as const,
  families: (orgId: string) => [...directoryKeys.all, "families", orgId] as const,
  dismissals: (orgId: string) => [...directoryKeys.all, "dismissals", orgId] as const,
};

export function useDirectoryPeople(organizationId: string | undefined) {
  return useQuery({
    queryKey: directoryKeys.people(organizationId ?? "none"),
    queryFn: () => directoryService.people(organizationId!),
    enabled: !!organizationId,
    staleTime: 60_000,
  });
}

export function useDirectoryFamilies(organizationId: string | undefined) {
  return useQuery({
    queryKey: directoryKeys.families(organizationId ?? "none"),
    queryFn: () => directoryService.families(organizationId!),
    enabled: !!organizationId,
    staleTime: 60_000,
  });
}

export function useDuplicateDismissals(organizationId: string | undefined) {
  return useQuery({
    queryKey: directoryKeys.dismissals(organizationId ?? "none"),
    queryFn: () => directoryService.dismissals(organizationId!),
    enabled: !!organizationId,
    staleTime: 60_000,
  });
}

export function useSetMembershipStatus(organizationId: string | undefined) {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: ({ personIds, statusId }: { personIds: string[]; statusId: string }) =>
      directoryService.setMembershipStatus(organizationId!, personIds, statusId),
    onSuccess: () => {
      // Statuses feed the people list, the families' status and the counts.
      qc.invalidateQueries({ queryKey: directoryKeys.all });
      qc.invalidateQueries({ queryKey: memberKeys.all });
    },
  });
}

export function useDismissDuplicates(organizationId: string | undefined) {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: (personIds: string[]) => directoryService.dismissDuplicates(organizationId!, personIds),
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: directoryKeys.dismissals(organizationId ?? "none") });
    },
  });
}
