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
