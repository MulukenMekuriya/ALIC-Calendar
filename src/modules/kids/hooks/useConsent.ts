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

import { useQuery, useMutation, useQueryClient } from "@tanstack/react-query";
import { consentService } from "../services/consentService";

export const consentKeys = {
  all: ["church", "kids", "consent"] as const,
  document: (orgId: string, surface: string) =>
    [...consentKeys.all, "document", orgId, surface] as const,
  coverage: (orgId: string) => [...consentKeys.all, "coverage", orgId] as const,
  policy: (orgId: string) => [...consentKeys.all, "policy", orgId] as const,
  childState: (childId: string, householdId: string | null) =>
    [...consentKeys.all, "child", childId, householdId ?? "desk"] as const,
  medical: (childId: string) => [...consentKeys.all, "medical", childId] as const,
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

export function useChildMedical(childPersonId: string | undefined) {
  return useQuery({
    queryKey: consentKeys.medical(childPersonId ?? "none"),
    queryFn: () => consentService.childMedical(childPersonId!),
    enabled: !!childPersonId,
  });
}

/**
 * Saving a medical change.
 *
 * Invalidates the child's consent state as well as their medical record,
 * because one save can move both: the record changes, and the signed form
 * goes out of date with a deadline attached. Leaving the consent state cached
 * would show a parent "signed and on file" on the same screen that just told
 * them to fill it in again.
 */
export function useUpdateChildMedical() {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: consentService.updateChildMedical,
    onSuccess: (_result, vars) => {
      qc.invalidateQueries({ queryKey: consentKeys.medical(vars.childPersonId) });
      qc.invalidateQueries({ queryKey: [...consentKeys.all, "child", vars.childPersonId] });
      qc.invalidateQueries({ queryKey: consentKeys.all });
    },
  });
}

export function useConsentPolicy(organizationId: string | undefined) {
  return useQuery({
    queryKey: consentKeys.policy(organizationId ?? "none"),
    queryFn: () => consentService.policy(organizationId!),
    enabled: !!organizationId,
    staleTime: 60 * 1000,
  });
}

/**
 * Changing the rule.
 *
 * Invalidates coverage as well as the policy: the card's "families still to
 * sign, and Sundays left" arithmetic is read off both, and showing a new date
 * against an old countdown is how somebody talks themselves into keeping a
 * date they should move.
 */
export function useSetConsentMode() {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: consentService.setMode,
    onSuccess: (_r, vars) => {
      qc.invalidateQueries({ queryKey: consentKeys.policy(vars.organizationId) });
      qc.invalidateQueries({ queryKey: consentKeys.coverage(vars.organizationId) });
    },
  });
}
