/**
 * Family relationship hooks.
 *
 * The read splits on who is asking, because the two callers reach the data by
 * different routes — see the note at the top of familyService. The split lives
 * here rather than in the component so the Family tab can ask one question
 * ("what does this person's family look like, for me?") and get an answer.
 */

import { useQuery, useMutation, useQueryClient } from "@tanstack/react-query";
import { familyService, type FamilyTie } from "../services/familyService";
import { memberKeys } from "./useMembers";

export const familyKeys = {
  all: ["church", "family"] as const,
  forPerson: (personId: string) => [...familyKeys.all, "person", personId] as const,
  mine: () => [...familyKeys.all, "mine"] as const,
  candidates: (personId: string, search: string) =>
    [...familyKeys.all, "candidates", personId, search] as const,
};

/**
 * @param personId whose family to show
 * @param asAdmin  the caller holds members_admin, so may read the table
 *
 * When both are false-ish the query stays disabled rather than guessing: a
 * member who is not looking at their own record has nothing to show here, and
 * firing my_family() would return THEIR family under someone else's name.
 */
export function useFamily(
  personId: string | undefined,
  { asAdmin, isSelf }: { asAdmin: boolean; isSelf: boolean }
) {
  return useQuery<FamilyTie[]>({
    queryKey: asAdmin
      ? familyKeys.forPerson(personId || "")
      : familyKeys.mine(),
    queryFn: () =>
      asAdmin ? familyService.forPerson(personId!) : familyService.myFamily(),
    enabled: !!personId && (asAdmin || isSelf),
  });
}

/** Who this person can be linked to. Scoped by the database, not the screen. */
export function useFamilyCandidates(
  personId: string | undefined,
  search: string,
  enabled: boolean
) {
  return useQuery({
    queryKey: familyKeys.candidates(personId || "", search),
    queryFn: () => familyService.linkCandidates(personId!, search),
    enabled: !!personId && enabled,
  });
}

/**
 * Invalidate everything a relationship edit can be seen through.
 *
 * A tie is stored once and mirrored, so changing it changes the OTHER
 * person's profile too — and that person's page may well be in the cache from
 * a moment ago, since the Family tab navigates between them.
 */
function useFamilyInvalidation() {
  const queryClient = useQueryClient();
  return (personId?: string, relatedPersonId?: string) => {
    queryClient.invalidateQueries({ queryKey: familyKeys.all });
    for (const id of [personId, relatedPersonId]) {
      if (id) queryClient.invalidateQueries({ queryKey: memberKeys.profile(id) });
    }
    queryClient.invalidateQueries({ queryKey: ["church", "my-information"] });
    queryClient.invalidateQueries({ queryKey: ["church", "portal"] });
  };
}

export function useSetRelationship() {
  const invalidate = useFamilyInvalidation();
  return useMutation({
    mutationFn: (v: {
      personId: string;
      relatedPersonId: string;
      relationshipTypeId: string;
    }) =>
      familyService.setRelationship(
        v.personId,
        v.relatedPersonId,
        v.relationshipTypeId
      ),
    onSuccess: (_r, v) => invalidate(v.personId, v.relatedPersonId),
  });
}

export function useRemoveRelationship() {
  const invalidate = useFamilyInvalidation();
  return useMutation({
    mutationFn: (v: {
      relationshipId: string;
      personId?: string;
      relatedPersonId?: string;
    }) => familyService.removeRelationship(v.relationshipId),
    onSuccess: (_r, v) => invalidate(v.personId, v.relatedPersonId),
  });
}
