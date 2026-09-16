/**
 * Group membership hooks — the writes the Groups tab needed.
 *
 * Reads of a member's own groups already arrive with the profile
 * (memberService.getWithRelations embeds group_memberships), so there is no
 * per-member list query here; invalidating the profile is what refreshes the
 * tab.
 */

import { useQuery, useMutation, useQueryClient } from "@tanstack/react-query";
import { groupService } from "../services/groupService";
import { memberKeys } from "./useMembers";
import type { GroupMembershipInsert } from "../types";

const FIVE_MINUTES = 5 * 60 * 1000;

export const groupKeys = {
  all: ["church", "groups"] as const,
  list: (organizationId: string) => [...groupKeys.all, "list", organizationId] as const,
};

/** Every active group in the branch, for the picker. */
export function useGroups(organizationId: string | undefined) {
  return useQuery({
    queryKey: groupKeys.list(organizationId || ""),
    queryFn: () => groupService.list(organizationId!),
    enabled: !!organizationId,
    staleTime: FIVE_MINUTES,
  });
}

export function useAddGroupMembership() {
  const queryClient = useQueryClient();
  return useMutation({
    mutationFn: (membership: GroupMembershipInsert) =>
      groupService.addMember(membership),
    onSuccess: (data) => {
      queryClient.invalidateQueries({ queryKey: groupKeys.all });
      queryClient.invalidateQueries({ queryKey: memberKeys.profile(data.person_id) });
      queryClient.invalidateQueries({ queryKey: ["church", "my-information"] });
    },
  });
}

/** Ends the membership; the row and the history stay. */
export function useEndGroupMembership() {
  const queryClient = useQueryClient();
  return useMutation({
    mutationFn: ({ membershipId }: { membershipId: string; memberId?: string }) =>
      groupService.endMember(membershipId),
    onSuccess: (_r, vars) => {
      queryClient.invalidateQueries({ queryKey: groupKeys.all });
      if (vars.memberId) {
        queryClient.invalidateQueries({ queryKey: memberKeys.profile(vars.memberId) });
      }
      queryClient.invalidateQueries({ queryKey: ["church", "my-information"] });
    },
  });
}
