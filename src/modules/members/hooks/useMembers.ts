/**
 * Member directory hooks.
 *
 * Convention matches src/modules/budget/hooks/useFiscalYears.ts:
 *  - a `<entity>Keys` factory so cache keys are never hand-written
 *  - queries take `organizationId: string | undefined` with `enabled: !!id`
 *  - mutations ONLY invalidate; toasts belong in the calling component
 */

import { useQuery, useMutation, useQueryClient } from "@tanstack/react-query";
import { memberService } from "../services";
import type {
  MemberInsert,
  MemberUpdate,
  MemberFilters,
} from "../types";
import { MEMBER_PAGE_SIZE } from "../types";

export const memberKeys = {
  all: ["church", "members"] as const,
  lists: () => [...memberKeys.all, "list"] as const,
  list: (orgId: string, filters: MemberFilters, page: number) =>
    [...memberKeys.lists(), orgId, filters, page] as const,
  details: () => [...memberKeys.all, "detail"] as const,
  detail: (id: string) => [...memberKeys.details(), id] as const,
  profile: (id: string) => [...memberKeys.details(), id, "profile"] as const,
  stats: (orgId: string) => [...memberKeys.all, "stats", orgId] as const,
  birthdays: (orgId: string, month: number) =>
    [...memberKeys.all, "birthdays", orgId, month] as const,
  byHousehold: (householdId: string) =>
    [...memberKeys.all, "by-household", householdId] as const,
};

/** Paginated directory listing. */
export function useMembers(
  organizationId: string | undefined,
  filters: MemberFilters = {},
  page = 0,
  pageSize = MEMBER_PAGE_SIZE
) {
  return useQuery({
    queryKey: memberKeys.list(organizationId || "", filters, page),
    queryFn: () => memberService.list(organizationId!, filters, page, pageSize),
    enabled: !!organizationId,
    // Keeps the previous page visible while the next one loads, so paging
    // through the directory doesn't flash an empty table.
    placeholderData: (prev) => prev,
  });
}

export function useMember(memberId: string | undefined) {
  return useQuery({
    queryKey: memberKeys.detail(memberId || ""),
    queryFn: () => memberService.get(memberId!),
    enabled: !!memberId,
  });
}

/** Full profile: family, ministries, groups, interests (MEM-006). */
export function useMemberProfile(memberId: string | undefined) {
  return useQuery({
    queryKey: memberKeys.profile(memberId || ""),
    queryFn: () => memberService.getWithRelations(memberId!),
    enabled: !!memberId,
  });
}

export function useMemberStats(organizationId: string | undefined) {
  return useQuery({
    queryKey: memberKeys.stats(organizationId || ""),
    queryFn: () => memberService.getStats(organizationId!),
    enabled: !!organizationId,
  });
}

/**
 * Birthday list for a month. There is no week-level equivalent and there
 * cannot be one — no day-of-month is stored.
 */
export function useBirthdays(organizationId: string | undefined, month: number) {
  return useQuery({
    queryKey: memberKeys.birthdays(organizationId || "", month),
    queryFn: () => memberService.listBirthdaysInMonth(organizationId!, month),
    enabled: !!organizationId && month >= 1 && month <= 12,
  });
}

export function useHouseholdMembers(householdId: string | undefined) {
  return useQuery({
    queryKey: memberKeys.byHousehold(householdId || ""),
    queryFn: () => memberService.listByHousehold(householdId!),
    enabled: !!householdId,
  });
}

export function useCreateMember() {
  const queryClient = useQueryClient();
  return useMutation({
    mutationFn: (member: MemberInsert) => memberService.create(member),
    onSuccess: (data) => {
      queryClient.invalidateQueries({ queryKey: memberKeys.lists() });
      queryClient.invalidateQueries({ queryKey: memberKeys.stats(data.organization_id) });
    },
  });
}

export function useUpdateMember() {
  const queryClient = useQueryClient();
  return useMutation({
    mutationFn: ({ memberId, data }: { memberId: string; data: MemberUpdate }) =>
      memberService.update(memberId, data),
    onSuccess: (data) => {
      queryClient.invalidateQueries({ queryKey: memberKeys.lists() });
      queryClient.invalidateQueries({ queryKey: memberKeys.detail(data.id) });
      queryClient.invalidateQueries({ queryKey: memberKeys.profile(data.id) });
    },
  });
}

/** Deactivate, never delete — historical participation must survive. */
export function useDeactivateMember() {
  const queryClient = useQueryClient();
  return useMutation({
    mutationFn: ({ memberId, reason }: { memberId: string; reason: string }) =>
      memberService.deactivate(memberId, reason),
    onSuccess: (data) => {
      queryClient.invalidateQueries({ queryKey: memberKeys.lists() });
      queryClient.invalidateQueries({ queryKey: memberKeys.detail(data.id) });
      queryClient.invalidateQueries({ queryKey: memberKeys.stats(data.organization_id) });
    },
  });
}

export function useReactivateMember() {
  const queryClient = useQueryClient();
  return useMutation({
    mutationFn: (memberId: string) => memberService.reactivate(memberId),
    onSuccess: (data) => {
      queryClient.invalidateQueries({ queryKey: memberKeys.lists() });
      queryClient.invalidateQueries({ queryKey: memberKeys.detail(data.id) });
      queryClient.invalidateQueries({ queryKey: memberKeys.stats(data.organization_id) });
    },
  });
}

/**
 * Amend one member record.
 *
 * Goes through church.update_person_details rather than a table update, so the
 * same field rules and the same history rows apply whether an administrator is
 * editing somebody else or a member is correcting their own name. The RPC
 * decides what the caller may touch; this hook does not need to know.
 *
 * Only the keys present in `patch` are written — an absent key leaves the
 * existing value alone, an explicit null clears it.
 */
export function useUpdatePersonDetails() {
  const queryClient = useQueryClient();
  return useMutation({
    mutationFn: ({
      personId,
      patch,
    }: {
      personId: string;
      patch: Record<string, unknown>;
    }) => memberService.updateDetails(personId, patch),
    onSuccess: (data) => {
      queryClient.invalidateQueries({ queryKey: memberKeys.lists() });
      queryClient.invalidateQueries({ queryKey: memberKeys.detail(data.id) });
      queryClient.invalidateQueries({ queryKey: memberKeys.profile(data.id) });
      queryClient.invalidateQueries({ queryKey: memberKeys.stats(data.organization_id) });
      // A member editing their own record is looking at My Church, not at the
      // directory, so that cache has to go too.
      queryClient.invalidateQueries({ queryKey: ["church", "my-information"] });
    },
  });
}
