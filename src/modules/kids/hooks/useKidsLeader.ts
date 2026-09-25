/**
 * Kids Ministry leader hooks.
 *
 * Mutations invalidate; they never toast. Toasts belong to the component that
 * knows what the user was trying to do.
 */

import { useEffect } from "react";
import { useQuery, useMutation, useQueryClient } from "@tanstack/react-query";
import { supabase } from "@/integrations/supabase/client";
import { kidsLeaderService } from "../services/kidsLeaderService";

export const kidsLeaderKeys = {
  all: ["church", "kids", "leader"] as const,
  board: (orgId: string) => [...kidsLeaderKeys.all, "board", orgId] as const,
  roster: (sessionId: string, roomId: string | null) =>
    [...kidsLeaderKeys.all, "roster", sessionId, roomId ?? "all"] as const,
  attendance: (orgId: string, from: string, to: string) =>
    [...kidsLeaderKeys.all, "attendance", orgId, from, to] as const,
  accessSummary: (orgId: string, from: string, to: string) =>
    [...kidsLeaderKeys.all, "access-summary", orgId, from, to] as const,
  accessDetail: (orgId: string, from: string, to: string, actor: string) =>
    [...kidsLeaderKeys.all, "access-detail", orgId, from, to, actor] as const,
  exceptions: (orgId: string, from: string, to: string) =>
    [...kidsLeaderKeys.all, "exceptions", orgId, from, to] as const,
  volunteers: (orgId: string) => [...kidsLeaderKeys.all, "volunteers", orgId] as const,
  staffing: (sessionId: string) => [...kidsLeaderKeys.all, "staffing", sessionId] as const,
  classrooms: (orgId: string) => [...kidsLeaderKeys.all, "classrooms", orgId] as const,
  stillHere: (orgId: string) => [...kidsLeaderKeys.all, "still-here", orgId] as const,
  teachers: (orgId: string) => [...kidsLeaderKeys.all, "teachers", orgId] as const,
  incidents: (orgId: string, settled: boolean) =>
    [...kidsLeaderKeys.all, "incidents", orgId, settled] as const,
  incident: (id: string) => [...kidsLeaderKeys.all, "incident", id] as const,
  latePickups: (orgId: string, from: string, to: string) =>
    [...kidsLeaderKeys.all, "late-pickups", orgId, from, to] as const,
};

export function useLiveBoard(organizationId: string | undefined) {
  return useQuery({
    queryKey: kidsLeaderKeys.board(organizationId || ""),
    queryFn: () => kidsLeaderService.liveBoard(organizationId!),
    enabled: !!organizationId,
    // Realtime drives the updates; this is the backstop for a dropped socket.
    // A leader watching a room fill up needs the number to be right.
    refetchInterval: 30_000,
    staleTime: 5_000,
  });
}

/**
 * Refetch the board and any open roster whenever a check-in changes.
 *
 * Realtime is a signal to refetch, not a source of truth: the payload is a raw
 * table row, while the board is an aggregate with capacity and ratio joined in.
 * Patching the cache from the payload would drift from what the RPC returns.
 */
export function useKidsRealtime(organizationId: string | undefined) {
  const queryClient = useQueryClient();

  useEffect(() => {
    if (!organizationId) return;

    const channel = supabase
      .channel(`kids-live-${organizationId}`)
      .on(
        "postgres_changes",
        { event: "*", schema: "church", table: "kids_check_ins" },
        () => {
          queryClient.invalidateQueries({
            queryKey: kidsLeaderKeys.board(organizationId),
          });
          queryClient.invalidateQueries({
            queryKey: [...kidsLeaderKeys.all, "roster"],
          });
        }
      )
      .subscribe();

    return () => {
      supabase.removeChannel(channel);
    };
  }, [organizationId, queryClient]);
}

export function useRoomRoster(
  sessionId: string | undefined,
  roomId: string | null | undefined
) {
  return useQuery({
    queryKey: kidsLeaderKeys.roster(sessionId || "", roomId ?? null),
    queryFn: () => kidsLeaderService.roster(sessionId!, roomId ?? null),
    enabled: !!sessionId,
    staleTime: 5_000,
  });
}

export function useKidsAttendance(
  organizationId: string | undefined,
  from: string,
  to: string
) {
  return useQuery({
    queryKey: kidsLeaderKeys.attendance(organizationId || "", from, to),
    queryFn: () => kidsLeaderService.attendance(organizationId!, from, to),
    enabled: !!organizationId && !!from && !!to,
  });
}

export function useKidsExceptions(
  organizationId: string | undefined,
  from: string,
  to: string
) {
  return useQuery({
    queryKey: kidsLeaderKeys.exceptions(organizationId || "", from, to),
    queryFn: () => kidsLeaderService.exceptions(organizationId!, from, to),
    enabled: !!organizationId && !!from && !!to,
  });
}

export function useLatePickups(
  organizationId: string | undefined,
  from: string,
  to: string
) {
  return useQuery({
    queryKey: kidsLeaderKeys.latePickups(organizationId || "", from, to),
    queryFn: () => kidsLeaderService.latePickups(organizationId!, from, to),
    enabled: !!organizationId && !!from && !!to,
  });
}

export function useNotifyLatePickup(organizationId: string | undefined) {
  const queryClient = useQueryClient();
  return useMutation({
    mutationFn: (v: { id: string; message?: string | null }) =>
      kidsLeaderService.notifyLatePickup(v.id, v.message),
    onSuccess: () => {
      queryClient.invalidateQueries({
        queryKey: [...kidsLeaderKeys.all, "late-pickups", organizationId || ""],
      });
    },
  });
}

export function useDismissLatePickup(organizationId: string | undefined) {
  const queryClient = useQueryClient();
  return useMutation({
    mutationFn: (v: { id: string; reason: string }) =>
      kidsLeaderService.dismissLatePickup(v.id, v.reason),
    onSuccess: () => {
      queryClient.invalidateQueries({
        queryKey: [...kidsLeaderKeys.all, "late-pickups", organizationId || ""],
      });
    },
  });
}

export function useRaiseCheckInHold(organizationId: string | undefined) {
  const queryClient = useQueryClient();
  return useMutation({
    mutationFn: (v: {
      childPersonId: string;
      reason: string;
      sourceLatePickupId?: string | null;
    }) =>
      kidsLeaderService.raiseCheckInHold(
        v.childPersonId,
        v.reason,
        v.sourceLatePickupId
      ),
    onSuccess: () => {
      queryClient.invalidateQueries({
        queryKey: [...kidsLeaderKeys.all, "late-pickups", organizationId || ""],
      });
    },
  });
}

export function useIncidentQueue(
  organizationId: string | undefined,
  includeSettled = false
) {
  return useQuery({
    queryKey: kidsLeaderKeys.incidents(organizationId || "", includeSettled),
    queryFn: () => kidsLeaderService.incidentQueue(organizationId!, includeSettled),
    enabled: !!organizationId,
  });
}

/**
 * Deliberately NOT prefetched and NOT kept fresh in the background: every
 * fetch writes a sensitive_viewed audit row naming the child, so refetching
 * on window focus would fill the access log with reads nobody performed.
 */
export function useIncidentDetail(id: string | null) {
  return useQuery({
    queryKey: kidsLeaderKeys.incident(id || ""),
    queryFn: () => kidsLeaderService.incidentDetail(id!),
    enabled: !!id,
    staleTime: Infinity,
    refetchOnWindowFocus: false,
    refetchOnMount: false,
  });
}

function useIncidentMutation<TArgs>(
  organizationId: string | undefined,
  fn: (v: TArgs) => Promise<unknown>
) {
  const queryClient = useQueryClient();
  return useMutation({
    mutationFn: fn,
    onSuccess: () => {
      queryClient.invalidateQueries({
        queryKey: [...kidsLeaderKeys.all, "incidents", organizationId || ""],
      });
      queryClient.invalidateQueries({
        queryKey: [...kidsLeaderKeys.all, "incident"],
      });
    },
  });
}

export function useReviewIncident(orgId: string | undefined) {
  return useIncidentMutation(orgId, (v: { id: string }) =>
    kidsLeaderService.reviewIncident(v.id)
  );
}

export function useSignOffIncident(orgId: string | undefined) {
  return useIncidentMutation(orgId, (v: { id: string; adminSummary?: string | null }) =>
    kidsLeaderService.signOffIncident(v.id, v.adminSummary)
  );
}

export function useDeclineIncident(orgId: string | undefined) {
  return useIncidentMutation(orgId, (v: { id: string; reason: string }) =>
    kidsLeaderService.declineIncident(v.id, v.reason)
  );
}

export function useSetIncidentSeverity(orgId: string | undefined) {
  return useIncidentMutation(orgId, (v: { id: string; severity: string; why?: string }) =>
    kidsLeaderService.setIncidentSeverity(v.id, v.severity, v.why)
  );
}

export function useRecordExternalReport(orgId: string | undefined) {
  return useIncidentMutation(
    orgId,
    (v: { id: string; made: boolean; reference?: string | null; note?: string | null }) =>
      kidsLeaderService.recordExternalReport(v.id, v.made, v.reference, v.note)
  );
}

export function useAddIncidentNote(orgId: string | undefined) {
  return useIncidentMutation(orgId, (v: { id: string; body: string }) =>
    kidsLeaderService.addIncidentNote(v.id, v.body)
  );
}

export function useSendIncidentToParent(orgId: string | undefined) {
  return useIncidentMutation(
    orgId,
    (v: { id: string; source: "admin" | "teacher" | "both" }) =>
      kidsLeaderService.sendIncidentToParent(v.id, v.source)
  );
}

export function useMyIncidents() {
  return useQuery({
    queryKey: [...kidsLeaderKeys.all, "my-incidents"] as const,
    queryFn: () => kidsLeaderService.myIncidents(),
  });
}

export function useRaiseIncident(orgId: string | undefined) {
  const queryClient = useQueryClient();
  return useMutation({
    mutationFn: (v: {
      childPersonId: string;
      severity: string;
      narrative: string;
      checkInId?: string | null;
    }) => kidsLeaderService.raiseIncident(v),
    onSuccess: () => {
      queryClient.invalidateQueries({
        queryKey: [...kidsLeaderKeys.all, "my-incidents"],
      });
      queryClient.invalidateQueries({
        queryKey: [...kidsLeaderKeys.all, "incidents", orgId || ""],
      });
    },
  });
}

export function useEligibleVolunteers(organizationId: string | undefined) {
  return useQuery({
    queryKey: kidsLeaderKeys.volunteers(organizationId || ""),
    queryFn: () => kidsLeaderService.eligibleVolunteers(organizationId!),
    enabled: !!organizationId,
  });
}

export function useSessionStaffing(sessionId: string | undefined) {
  return useQuery({
    queryKey: kidsLeaderKeys.staffing(sessionId || ""),
    queryFn: () => kidsLeaderService.sessionStaffing(sessionId!),
    enabled: !!sessionId,
  });
}

export function useClassrooms(organizationId: string | undefined) {
  return useQuery({
    queryKey: kidsLeaderKeys.classrooms(organizationId || ""),
    queryFn: () => kidsLeaderService.listClassrooms(organizationId!),
    enabled: !!organizationId,
  });
}

export function useAssignStaff(organizationId: string | undefined) {
  const queryClient = useQueryClient();
  return useMutation({
    mutationFn: (params: Parameters<typeof kidsLeaderService.assignStaff>[0]) =>
      kidsLeaderService.assignStaff(params),
    onSuccess: (_data, params) => {
      queryClient.invalidateQueries({
        queryKey: kidsLeaderKeys.staffing(params.sessionId),
      });
      // Staffing changes the ratio, so the board changes too.
      if (organizationId) {
        queryClient.invalidateQueries({
          queryKey: kidsLeaderKeys.board(organizationId),
        });
      }
    },
  });
}

export function useEndStaff(
  organizationId: string | undefined,
  sessionId: string | undefined
) {
  const queryClient = useQueryClient();
  return useMutation({
    mutationFn: (staffingId: string) => kidsLeaderService.endStaff(staffingId),
    onSuccess: () => {
      if (sessionId) {
        queryClient.invalidateQueries({
          queryKey: kidsLeaderKeys.staffing(sessionId),
        });
      }
      if (organizationId) {
        queryClient.invalidateQueries({
          queryKey: kidsLeaderKeys.board(organizationId),
        });
      }
    },
  });
}

export function useSetRoomConfig(organizationId: string | undefined) {
  const queryClient = useQueryClient();
  return useMutation({
    mutationFn: (params: Parameters<typeof kidsLeaderService.setRoomConfig>[0]) =>
      kidsLeaderService.setRoomConfig(params),
    onSuccess: () => {
      if (!organizationId) return;
      queryClient.invalidateQueries({
        queryKey: kidsLeaderKeys.classrooms(organizationId),
      });
      queryClient.invalidateQueries({ queryKey: kidsLeaderKeys.board(organizationId) });
    },
  });
}

export function useStillHere(organizationId: string | undefined) {
  return useQuery({
    queryKey: kidsLeaderKeys.stillHere(organizationId || ""),
    queryFn: () => kidsLeaderService.stillHere(organizationId!),
    enabled: !!organizationId,
    // The end of a service is exactly when this must not be stale.
    refetchInterval: 30_000,
    staleTime: 5_000,
  });
}

/**
 * Close off the whole board. kids_admin only — the database enforces that, and
 * StillHerePanel hides the button on `kids.override`, which is the capability
 * only a kids_admin holds.
 */
export function useExpireOpenCheckIns(organizationId: string | undefined) {
  const queryClient = useQueryClient();
  return useMutation({
    mutationFn: (p: { note?: string }) =>
      kidsLeaderService.expireOpenCheckIns(organizationId!, p.note),
    onSuccess: () => {
      if (!organizationId) return;
      queryClient.invalidateQueries({ queryKey: kidsLeaderKeys.board(organizationId) });
      queryClient.invalidateQueries({ queryKey: [...kidsLeaderKeys.all, "roster"] });
      queryClient.invalidateQueries({ queryKey: kidsLeaderKeys.stillHere(organizationId) });
    },
  });
}

export function useTransferChild(organizationId: string | undefined) {
  const queryClient = useQueryClient();
  return useMutation({
    mutationFn: (p: { checkInId: string; toRoomId: string; reason?: string }) =>
      kidsLeaderService.transferChild(p.checkInId, p.toRoomId, p.reason),
    onSuccess: () => {
      if (!organizationId) return;
      queryClient.invalidateQueries({ queryKey: kidsLeaderKeys.board(organizationId) });
      queryClient.invalidateQueries({ queryKey: [...kidsLeaderKeys.all, "roster"] });
      queryClient.invalidateQueries({ queryKey: kidsLeaderKeys.stillHere(organizationId) });
    },
  });
}

export function useClassroomTeachers(organizationId: string | undefined) {
  return useQuery({
    queryKey: kidsLeaderKeys.teachers(organizationId || ""),
    queryFn: () => kidsLeaderService.classroomTeachers(organizationId!),
    enabled: !!organizationId,
  });
}

export function useAssignTeacher(organizationId: string | undefined) {
  const queryClient = useQueryClient();
  return useMutation({
    mutationFn: (params: Omit<Parameters<typeof kidsLeaderService.assignTeacher>[0], "organizationId">) =>
      kidsLeaderService.assignTeacher({ organizationId: organizationId!, ...params }),
    onSuccess: () => {
      if (organizationId) {
        queryClient.invalidateQueries({
          queryKey: kidsLeaderKeys.teachers(organizationId),
        });
      }
    },
  });
}

export function useRemoveTeacher(organizationId: string | undefined) {
  const queryClient = useQueryClient();
  return useMutation({
    mutationFn: (assignmentId: string) =>
      kidsLeaderService.removeTeacher(assignmentId),
    onSuccess: () => {
      if (organizationId) {
        queryClient.invalidateQueries({
          queryKey: kidsLeaderKeys.teachers(organizationId),
        });
      }
    },
  });
}

export function useUpsertClassroom(organizationId: string | undefined) {
  const queryClient = useQueryClient();
  return useMutation({
    mutationFn: (params: Parameters<typeof kidsLeaderService.upsertClassroom>[0]) =>
      kidsLeaderService.upsertClassroom(params),
    onSuccess: () => {
      if (!organizationId) return;
      queryClient.invalidateQueries({
        queryKey: kidsLeaderKeys.classrooms(organizationId),
      });
      queryClient.invalidateQueries({ queryKey: kidsLeaderKeys.board(organizationId) });
    },
  });
}

export function useRetireClassroom(organizationId: string | undefined) {
  const queryClient = useQueryClient();
  return useMutation({
    mutationFn: (roomId: string) =>
      kidsLeaderService.retireClassroom(organizationId!, roomId),
    onSuccess: () => {
      if (!organizationId) return;
      queryClient.invalidateQueries({
        queryKey: kidsLeaderKeys.classrooms(organizationId),
      });
      queryClient.invalidateQueries({ queryKey: kidsLeaderKeys.board(organizationId) });
    },
  });
}

export function useToggleSessionRoom(organizationId: string | undefined) {
  const queryClient = useQueryClient();
  return useMutation({
    mutationFn: (params: {
      sessionId: string;
      roomId: string;
      open: boolean;
      capacityOverride?: number | null;
    }) =>
      params.open
        ? kidsLeaderService.openRoom(
            params.sessionId,
            params.roomId,
            params.capacityOverride
          )
        : kidsLeaderService.closeRoom(params.sessionId, params.roomId),
    onSuccess: () => {
      if (organizationId) {
        queryClient.invalidateQueries({
          queryKey: kidsLeaderKeys.board(organizationId),
        });
      }
    },
  });
}

/**
 * The access log.
 *
 * `enabled` is driven by the caller so the panel only asks when it is
 * actually open — every call writes an access_log_read audit row, and a query
 * that fires on mount would fill the trail with reads nobody made.
 */
export function useAccessSummary(
  orgId: string | undefined,
  from: string,
  to: string,
  enabled: boolean,
) {
  return useQuery({
    queryKey: kidsLeaderKeys.accessSummary(orgId ?? "none", from, to),
    queryFn: () => kidsLeaderService.accessSummary(orgId!, from, to),
    enabled: !!orgId && enabled,
    staleTime: 5 * 60 * 1000,
    refetchOnWindowFocus: false,
  });
}

export function useAccessDetail(
  orgId: string | undefined,
  from: string,
  to: string,
  actorAuthUserId: string | null,
) {
  return useQuery({
    queryKey: kidsLeaderKeys.accessDetail(orgId ?? "none", from, to, actorAuthUserId ?? "all"),
    queryFn: () =>
      kidsLeaderService.accessDetail({
        organizationId: orgId!,
        from,
        to,
        actorAuthUserId,
      }),
    enabled: !!orgId && !!actorAuthUserId,
    staleTime: 5 * 60 * 1000,
    refetchOnWindowFocus: false,
  });
}
