/**
 * React Query hooks for the member portal.
 *
 * No organization in the key for the self-scoped calls that do not take one:
 * they are keyed on the signed-in user by construction, and the query client
 * is cleared on sign-out.
 */

import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { portalService } from "../services";
import type { PortalPatch } from "../types";

export const portalKeys = {
  all: ["church", "portal"] as const,
  summary: (orgId: string) => [...portalKeys.all, "summary", orgId] as const,
  household: () => [...portalKeys.all, "household"] as const,
  children: () => [...portalKeys.all, "children"] as const,
  checkIns: (limit: number) => [...portalKeys.all, "check-ins", limit] as const,
  serving: () => [...portalKeys.all, "serving"] as const,
  groups: () => [...portalKeys.all, "groups"] as const,
  householdDetail: () => [...portalKeys.all, "household-detail"] as const,
  ministryOptions: (orgId: string) =>
    [...portalKeys.all, "ministry-options", orgId] as const,
  groupOptions: (orgId: string) => [...portalKeys.all, "group-options", orgId] as const,
  events: (orgId: string, limit: number) =>
    [...portalKeys.all, "events", orgId, limit] as const,
};

export function usePortalSummary(orgId: string | undefined) {
  return useQuery({
    queryKey: portalKeys.summary(orgId ?? ""),
    queryFn: () => portalService.summary(orgId!),
    enabled: !!orgId,
  });
}

export function useMyHouseholdMembers(enabled = true) {
  return useQuery({
    queryKey: portalKeys.household(),
    queryFn: () => portalService.household(),
    enabled,
  });
}

export function useMyChildren(enabled = true) {
  return useQuery({
    queryKey: portalKeys.children(),
    queryFn: () => portalService.children(),
    enabled,
  });
}

export function useMyChildrenCheckIns(limit = 30, enabled = true) {
  return useQuery({
    queryKey: portalKeys.checkIns(limit),
    queryFn: () => portalService.childrenCheckIns(limit),
    enabled,
  });
}

export function useMyServing(enabled = true) {
  return useQuery({
    queryKey: portalKeys.serving(),
    queryFn: () => portalService.serving(),
    enabled,
  });
}

export function useMyGroups(enabled = true) {
  return useQuery({
    queryKey: portalKeys.groups(),
    queryFn: () => portalService.groups(),
    enabled,
  });
}

/*
 * Events, unlike everything else here, are not gated on `linked`.
 *
 * A login that has no member record yet still belongs to a branch, and "what
 * is on at church next Sunday" is the one question the portal can answer for
 * them — it is published to anonymous visitors already. Showing an unlinked
 * member an empty page and a "we have not linked you yet" apology, while the
 * public site tells strangers about the same service, is the portal being
 * needlessly worse than the front door.
 *
 * The 60-second staleTime is for the "what is on now" line: it reads from the
 * clock, and a member leaving the tab open all morning should not watch this
 * morning's service sit at the top of the list into the afternoon.
 */
export function useMyUpcomingEvents(orgId: string | undefined, limit = 4) {
  return useQuery({
    queryKey: portalKeys.events(orgId ?? "", limit),
    queryFn: () => portalService.upcomingEvents(orgId!, limit),
    enabled: !!orgId,
    staleTime: 60_000,
    refetchInterval: 5 * 60_000,
  });
}

export function useMyHouseholdDetail(enabled = true) {
  return useQuery({
    queryKey: portalKeys.householdDetail(),
    queryFn: () => portalService.householdDetail(),
    enabled,
  });
}

/*
 * The two pickers.
 *
 * Not fetched until the member opens the thing that needs them — a ministry
 * list and a list of every home cell in the branch are of no use to somebody
 * reading their giving, and the portal's first paint already costs six
 * requests.
 */
export function useMyMinistryOptions(orgId: string | undefined, enabled = true) {
  return useQuery({
    queryKey: portalKeys.ministryOptions(orgId ?? ""),
    queryFn: () => portalService.ministryOptions(orgId!),
    enabled: !!orgId && enabled,
    staleTime: 5 * 60_000,
  });
}

export function useMyGroupOptions(orgId: string | undefined, enabled = true) {
  return useQuery({
    queryKey: portalKeys.groupOptions(orgId ?? ""),
    queryFn: () => portalService.groupOptions(orgId!),
    enabled: !!orgId && enabled,
    staleTime: 5 * 60_000,
  });
}

/*
 * WRITES
 * ------
 * Every one of them invalidates the whole portal tree rather than the query it
 * obviously touches, because on this page they are not separable: joining a
 * ministry changes my_serving AND the serving count on the summary AND the
 * "already serving" flag on the picker; adding a child changes my_children,
 * the household roster, the summary's children count and the next-steps list
 * that reads all three. Six small refetches of a page the member is looking at
 * is the cheap side of that trade.
 */
function useMyMutation<TArgs>(fn: (args: TArgs) => Promise<unknown>) {
  const queryClient = useQueryClient();
  return useMutation({
    mutationFn: fn,
    onSuccess: () => queryClient.invalidateQueries({ queryKey: portalKeys.all }),
  });
}

export function useUpdateMyHousehold() {
  return useMyMutation(({ householdId, patch }: { householdId: string; patch: PortalPatch }) =>
    portalService.updateHousehold(householdId, patch)
  );
}

export function useAddMyChild() {
  return useMyMutation(({ householdId, child }: { householdId: string; child: PortalPatch }) =>
    portalService.addChild(householdId, child)
  );
}

export function useUpdateMyChild() {
  return useMyMutation(({ childId, patch }: { childId: string; patch: PortalPatch }) =>
    portalService.updateChild(childId, patch)
  );
}

export function useJoinMinistry() {
  return useMyMutation((ministryId: string) => portalService.joinMinistry(ministryId));
}

export function useLeaveMinistry() {
  return useMyMutation((assignmentId: string) => portalService.leaveMinistry(assignmentId));
}

export function useJoinGroup() {
  return useMyMutation((groupId: string) => portalService.joinGroup(groupId));
}

export function useLeaveGroup() {
  return useMyMutation((membershipId: string) => portalService.leaveGroup(membershipId));
}
