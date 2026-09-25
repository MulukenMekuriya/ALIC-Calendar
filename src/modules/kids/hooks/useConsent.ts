/**
 * Consent form hooks.
 *
 * The document is versioned and hashed server-side and changes only when a
 * kids admin publishes a new version, so it is cached hard. The version in
 * the query key is not available before the fetch, so the key is the branch
 * and the surface; a publish is rare enough that a stale tab until the next
 * mount is the right trade against refetching a legal document on every
 * window focus.
 */

import { useQuery } from "@tanstack/react-query";
import { consentService } from "../services/consentService";

export const consentKeys = {
  all: ["church", "kids", "consent"] as const,
  document: (orgId: string, surface: string) =>
    [...consentKeys.all, "document", orgId, surface] as const,
  coverage: (orgId: string) => [...consentKeys.all, "coverage", orgId] as const,
  childState: (childId: string, householdId: string | null) =>
    [...consentKeys.all, "child", childId, householdId ?? "desk"] as const,
};

export function useConsentDocument(
  organizationId: string | undefined,
  surface: "kiosk" | "portal" = "portal",
) {
  return useQuery({
    queryKey: consentKeys.document(organizationId ?? "none", surface),
    queryFn: () => consentService.currentDocument(organizationId!, surface),
    enabled: !!organizationId,
    staleTime: 30 * 60 * 1000,
    gcTime: 60 * 60 * 1000,
    refetchOnWindowFocus: false,
  });
}

/**
 * The collection card. Refetched on focus, unlike the document: this is the
 * number an admin watches through October to decide whether the 1 November
 * date holds, and a stale one would be read as progress that has not happened.
 */
export function useConsentCoverage(organizationId: string | undefined) {
  return useQuery({
    queryKey: consentKeys.coverage(organizationId ?? "none"),
    queryFn: () => consentService.coverage(organizationId!),
    enabled: !!organizationId,
    staleTime: 60 * 1000,
  });
}

/**
 * One child's consent position.
 *
 * `forHouseholdId` belongs to the portal. A check-in screen passes nothing,
 * so it is told 'covered' rather than 'covered_elsewhere' and cannot show a
 * volunteer that a child's consent lives with a different household.
 */
export function useChildConsentState(
  childPersonId: string | undefined,
  forHouseholdId?: string | null,
) {
  return useQuery({
    queryKey: consentKeys.childState(childPersonId ?? "none", forHouseholdId ?? null),
    queryFn: () => consentService.childState(childPersonId!, forHouseholdId),
    enabled: !!childPersonId,
    staleTime: 60 * 1000,
  });
}
