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
  exceptions: (orgId: string, from: string, to: string) =>
    [...kidsLeaderKeys.all, "exceptions", orgId, from, to] as const,
  volunteers: (orgId: string) => [...kidsLeaderKeys.all, "volunteers", orgId] as const,
  staffing: (sessionId: string) => [...kidsLeaderKeys.all, "staffing", sessionId] as const,
  classrooms: (orgId: string) => [...kidsLeaderKeys.all, "classrooms", orgId] as const,
  stillHere: (orgId: string) => [...kidsLeaderKeys.all, "still-here", orgId] as const,
  teachers: (orgId: string) => [...kidsLeaderKeys.all, "teachers", orgId] as const,
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
