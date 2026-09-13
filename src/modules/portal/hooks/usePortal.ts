/**
 * React Query hooks for the member portal.
 *
 * No organization in the key for the self-scoped calls that do not take one:
 * they are keyed on the signed-in user by construction, and the query client
 * is cleared on sign-out.
 */

import { useQuery } from "@tanstack/react-query";
import { portalService } from "../services";

export const portalKeys = {
  all: ["church", "portal"] as const,
  summary: (orgId: string) => [...portalKeys.all, "summary", orgId] as const,
  household: () => [...portalKeys.all, "household"] as const,
  children: () => [...portalKeys.all, "children"] as const,
  checkIns: (limit: number) => [...portalKeys.all, "check-ins", limit] as const,
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
