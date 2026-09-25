/**
 * The Kids Ministry leader's view of a Sunday.
 *
 * Every call here goes through a SECURITY DEFINER RPC that checks for
 * kids_admin or leadership_viewer server-side. That is deliberate and is the
 * whole reason these are separate functions from the station's:
 *
 *   - The station (kidsStationService) sees last INITIAL only and a masked
 *     phone, so a photo of the lobby tablet leaks very little.
 *   - The leader sees full names and the guardian's phone, because the leader
 *     is the person who has to make the call.
 *
 * Keeping them apart means widening the leader's view can never widen the
 * tablet's. A kids_volunteer signed in at a desk gets `not_a_kids_leader`
 * from every function in this file.
 */

import { supabase } from "@/integrations/supabase/client";
import { throwRpc } from "./rpcError";

const church = () => supabase.schema("church");

/** One classroom on the live board. */
export interface LiveBoardRoom {
  kids_session_id: string;
  session_label: string;
  session_date: string;
  room_id: string;
  room_name: string;
  label_room_name: string | null;
  /** The school grade this room teaches — the ministry's actual organisation. */
  grade_name: string | null;
  age_band_code: string | null;
  age_band_name: string | null;
  capacity: number | null;
  ratio_children_per_volunteer: number | null;
  checked_in_count: number;
  checked_out_count: number;
  volunteer_count: number;
  allergy_count: number;
  restriction_count: number;
  /** Children placed somewhere their grade is not taught. */
  misplaced_count: number;
  over_capacity: boolean;
  over_ratio: boolean;
}

/** One child on a room roster, named. */
export interface RosterRow {
  check_in_id: string;
  child_person_id: string;
  child_name: string;
  tag_number: number;
  room_id: string | null;
  room_name: string | null;
  status: string;
  checked_in_at: string;
  checked_out_at: string | null;
  checked_in_by_name: string | null;
  checked_out_by_name: string | null;
  dropped_off_by_name: string | null;
  picked_up_by_name: string | null;
  guardian_phone: string | null;
  has_allergy: boolean;
  has_restriction: boolean;
  checkout_method: string | null;
  minutes_in_room: number;
  /**
   * Set when check-in could not place the child by grade — no grade on file,
   * or no classroom teaches it. ALIC runs no nursery, so a child below Pre-K
   * lands here. Never null-checked away: an unexplained placement is exactly
   * what a leader needs to see.
   */
  assignment_reason: string | null;
  grade_name: string | null;
}

export interface AttendanceRow {
  session_date: string;
  service_label: string | null;
  room_name: string;
  age_band_name: string | null;
  children: number;
  first_time_visitors: number;
  volunteers: number;
  overrides: number;
  not_checked_out: number;
  avg_minutes: number | null;
}

/** One row from church.kids_exceptions_report. */
export type ExceptionCategory =
  | "not_collected"
  | "refused"
  | "override"
  | "error"
  | "transfer"
  | "placement";

export interface ExceptionRow {
  occurred_at: string;
  session_date: string | null;
  /** Seriousness bucket; rows come back most serious first. */
  category: ExceptionCategory;
  action: string;
  outcome: string;
  child_name: string;
  room_name: string | null;
  actor_name: string | null;
  reason: string | null;
  /** How many rows MATCHED, which may exceed the 500 returned. */
  total_count: number;
}

export interface EligibleVolunteer {
  person_id: string;
  volunteer_id: string | null;
  display_name: string;
  phone: string | null;
  is_active: boolean;
  can_override: boolean;
  /**
   * A safeguarding decision the church has made about this person, not a
   * background-check result — ALIC does not run background checks. False for
   * everyone unless a leader has set it.
   */
  may_not_serve_with_children: boolean;
  /**
   * Already in the Children's Ministry: a kids module grant, or a
   * church.kids_volunteers row. Computed server-side because the grant lives
   * in church.module_grants keyed by auth user, which the client cannot read.
   * Classroom assignments are unioned in by the caller, which already has them.
   */
  on_kids_team: boolean;
}

export interface StaffingRow {
  id: string;
  kids_session_id: string;
  room_id: string | null;
  person_id: string;
  role: string;
  started_at: string;
  ended_at: string | null;
}

/** One standing teaching assignment for a classroom. */
export interface ClassroomTeacher {
  id: string;
  room_id: string;
  room_name: string;
  person_id: string;
  display_name: string;
  phone: string | null;
  role: string;
  is_lead: boolean;
}

/** One child who has not been collected. */
export interface StillHereRow {
  check_in_id: string;
  child_person_id: string;
  child_name: string;
  tag_number: number;
  room_name: string | null;
  session_label: string | null;
  session_date: string;
  session_status: string;
  checked_in_at: string;
  minutes_in_room: number;
  guardian_name: string | null;
  guardian_phone: string | null;
  has_allergy: boolean;
  has_restriction: boolean;
}

export const kidsLeaderService = {
  /**
   * Every child still in a room, across ALL sessions — not just today's open
   * one. The children who matter most are those left in a session that has
   * already ended, which a session-scoped query cannot find.
   */
  async stillHere(organizationId: string): Promise<StillHereRow[]> {
    const { data, error } = await church().rpc("kids_still_here", {
      _organization_id: organizationId,
    });
    throwRpc(error);
    return (data ?? []) as unknown as StillHereRow[];
  },

  /**
   * Close off every child still checked in, for the whole branch.
   *
   * For the Sunday the desk forgets. The children are marked EXPIRED, which in
   * this system means "nobody checked them out" and never "they were
   * collected" — so this tidies the board without putting a false pickup on a
   * child's record. The database refuses this for anyone who is not a
   * kids_admin, and emails the other leaders what was cleared.
   */
  async expireOpenCheckIns(
    organizationId: string,
    note?: string
  ): Promise<{ expired_count: number; child_names: string[] }> {
    const { data, error } = await church().rpc("kids_expire_open_check_ins", {
      _organization_id: organizationId,
      _kids_session_id: null,
      _note: note || null,
    });
    throwRpc(error);
    const row = (Array.isArray(data) ? data[0] : data) as
      | { expired_count: number; child_names: string[] | null }
      | undefined;
    return {
      expired_count: row?.expired_count ?? 0,
      child_names: row?.child_names ?? [],
    };
  },

  /** Move a child to another room mid-service, keeping their pickup code. */
  async transferChild(checkInId: string, toRoomId: string, reason?: string) {
    const { error } = await church().rpc("transfer_child", {
      _check_in_id: checkInId,
      _to_room_id: toRoomId,
      _reason: reason || null,
    });
    throwRpc(error);
  },

  /**
   * Who normally teaches each classroom.
   *
   * Standing week to week, unlike sessionStaffing() which is who is serving on
   * one particular Sunday. Checkout happens at the classroom door, so the room
   * has to know whose room it is.
   */
  async classroomTeachers(organizationId: string): Promise<ClassroomTeacher[]> {
    const { data, error } = await church().rpc("kids_classroom_teacher_list", {
      _organization_id: organizationId,
    });
    throwRpc(error);
    return (data ?? []) as unknown as ClassroomTeacher[];
  },

  async assignTeacher(params: {
    organizationId: string;
    roomId: string;
    personId: string;
    role?: string;
    isLead?: boolean;
  }) {
    const { data, error } = await church().rpc("assign_classroom_teacher", {
      _organization_id: params.organizationId,
      _room_id: params.roomId,
      _person_id: params.personId,
      _role: params.role ?? "teacher",
      _is_lead: params.isLead ?? false,
    });
    throwRpc(error);
    return data;
  },

  /** Ends the assignment rather than deleting it — last term's roster is a record. */
  async removeTeacher(assignmentId: string): Promise<void> {
    const { error } = await church().rpc("remove_classroom_teacher", {
      _id: assignmentId,
    });
    throwRpc(error);
  },

  /** Every open classroom, right now. Refetch this on a Realtime event. */
  async liveBoard(organizationId: string): Promise<LiveBoardRoom[]> {
    const { data, error } = await church().rpc("kids_live_board", {
      _organization_id: organizationId,
    });
    throwRpc(error);
    return (data ?? []) as unknown as LiveBoardRoom[];
  },

  /** Children in one room, or the whole session when roomId is null. */
  async roster(sessionId: string, roomId?: string | null): Promise<RosterRow[]> {
    const { data, error } = await church().rpc("kids_room_roster", {
      _kids_session_id: sessionId,
      _room_id: roomId ?? null,
    });
    throwRpc(error);
    return (data ?? []) as unknown as RosterRow[];
  },

  async attendance(
    organizationId: string,
    from: string,
    to: string
  ): Promise<AttendanceRow[]> {
    const { data, error } = await church().rpc("kids_attendance_report", {
      _organization_id: organizationId,
      _from: from,
      _to: to,
    });
    throwRpc(error);
    return (data ?? []) as unknown as AttendanceRow[];
  },

  async exceptions(
    organizationId: string,
    from: string,
    to: string
  ): Promise<ExceptionRow[]> {
    const { data, error } = await church().rpc("kids_exceptions_report", {
      _organization_id: organizationId,
      _from: from,
      _to: to,
    });
    throwRpc(error);
    return (data ?? []) as unknown as ExceptionRow[];
  },

  async eligibleVolunteers(organizationId: string): Promise<EligibleVolunteer[]> {
    const { data, error } = await church().rpc("kids_eligible_volunteers", {
      _organization_id: organizationId,
    });
    throwRpc(error);
    return (data ?? []) as unknown as EligibleVolunteer[];
  },

  /** Who is currently staffing a session, by room. */
  async sessionStaffing(sessionId: string): Promise<StaffingRow[]> {
    const { data, error } = await church()
      .from("kids_session_staffing")
      .select("*")
      .eq("kids_session_id", sessionId)
      .is("ended_at", null);
    throwRpc(error);
    return (data ?? []) as unknown as StaffingRow[];
  },

  async assignStaff(params: {
    sessionId: string;
    personId: string;
    roomId?: string | null;
    role?: string;
  }): Promise<StaffingRow> {
    const { data, error } = await church().rpc("assign_session_staff", {
      _kids_session_id: params.sessionId,
      _person_id: params.personId,
      _room_id: params.roomId ?? null,
      _role: params.role ?? "classroom_volunteer",
    });
    throwRpc(error);
    return data as unknown as StaffingRow;
  },

  async endStaff(staffingId: string): Promise<void> {
    const { error } = await church().rpc("end_session_staff", {
      _staffing_id: staffingId,
    });
    throwRpc(error);
  },

  /**
   * Replace migration 20260320001500's PROVISIONAL room/age guesses with the
   * ministry's real mapping, without another migration.
   */
  async setRoomConfig(params: {
    roomId: string;
    isCheckinLocation: boolean;
    ageBandId?: string | null;
    capacity?: number | null;
    ratio?: number | null;
    labelRoomName?: string | null;
    sortOrder?: number;
  }) {
    const { data, error } = await church().rpc("set_room_kids_config", {
      _room_id: params.roomId,
      _is_checkin_location: params.isCheckinLocation,
      _kids_age_band_id: params.ageBandId ?? null,
      _capacity: params.capacity ?? null,
      _ratio: params.ratio ?? null,
      _label_room_name: params.labelRoomName ?? null,
      _sort_order: params.sortOrder ?? 0,
    });
    throwRpc(error);
    return data;
  },

  /** Open a classroom mid-service (overflow), even if it opened after the session did. */
  async openRoom(
    sessionId: string,
    roomId: string,
    capacityOverride?: number | null
  ): Promise<void> {
    const { error } = await church().rpc("kids_open_room_in_session", {
      _kids_session_id: sessionId,
      _room_id: roomId,
      _capacity_override: capacityOverride ?? null,
    });
    throwRpc(error);
  },

  /** Refused server-side while children are still checked into the room. */
  async closeRoom(sessionId: string, roomId: string): Promise<void> {
    const { error } = await church().rpc("kids_close_room_in_session", {
      _kids_session_id: sessionId,
      _room_id: roomId,
    });
    throwRpc(error);
  },

  /**
   * Create or edit a classroom, including its NAME.
   *
   * public.rooms is shared with the events module and its RLS grants writes
   * only to app_role = 'admin', so the Children's Ministry leader — a
   * kids_admin, which is a different thing — could configure a classroom but
   * never rename or create one. This RPC lets them, bounded to children's
   * spaces: they cannot rename the Main Auditorium.
   *
   * Pass roomId to edit, omit it to create.
   *
   * `isCheckinLocation` has to be passed explicitly on an edit. The RPC used to
   * force it true, so opening a main-calendar room from the "Other rooms" list
   * to correct its capacity turned it into a children's classroom on the way
   * out. Saving a classroom also reconciles every open session, so the room is
   * on the check-in tablet as soon as this returns.
   */
  async upsertClassroom(params: {
    organizationId: string;
    roomId?: string | null;
    name?: string | null;
    schoolGradeId?: string | null;
    ageBandId?: string | null;
    capacity?: number | null;
    ratio?: number | null;
    labelRoomName?: string | null;
    sortOrder?: number;
    isCheckinLocation?: boolean;
  }) {
    const { data, error } = await church().rpc("upsert_kids_classroom", {
      _organization_id: params.organizationId,
      _room_id: params.roomId ?? null,
      _name: params.name ?? null,
      _school_grade_id: params.schoolGradeId ?? null,
      _kids_age_band_id: params.ageBandId ?? null,
      _capacity: params.capacity ?? null,
      _ratio: params.ratio ?? null,
      _label_room_name: params.labelRoomName ?? null,
      _sort_order: params.sortOrder ?? 0,
      _is_checkin_location: params.isCheckinLocation ?? true,
    });
    throwRpc(error);
    return data;
  },

  /**
   * Take a room out of children's use. The room survives for the events
   * module. Refused server-side while children are still in it.
   */
  async retireClassroom(organizationId: string, roomId: string): Promise<void> {
    const { error } = await church().rpc("retire_kids_classroom", {
      _organization_id: organizationId,
      _room_id: roomId,
    });
    throwRpc(error);
  },

  /** Classrooms configured for this branch, with their grade. */
  async listClassrooms(organizationId: string) {
    // church.room_kids_config and public.rooms are in different schemas, so
    // PostgREST cannot embed them in one query.
    const [cfgRes, roomsRes, bandsRes, gradesRes] = await Promise.all([
      church()
        .from("room_kids_config")
        .select("*")
        .eq("organization_id", organizationId)
        .order("sort_order"),
      supabase
        // public.rooms has no capacity column — capacity for a classroom is
        // kids configuration, held on church.room_kids_config. Selecting it
        // here returned a PostgREST 400 and broke the whole tab.
        .from("rooms")
        .select("id, name, is_active")
        .eq("organization_id", organizationId)
        .eq("is_active", true)
        .order("name"),
      church()
        .from("kids_age_bands")
        .select("*")
        .eq("organization_id", organizationId)
        .eq("is_active", true)
        .order("min_age_months"),
      church()
        .from("school_grades")
        .select("*")
        .eq("organization_id", organizationId)
        .eq("is_active", true)
        .order("sort_order"),
    ]);
    throwRpc(cfgRes.error);
    throwRpc(roomsRes.error);
    throwRpc(bandsRes.error);
    throwRpc(gradesRes.error);

    const cfgByRoom = new Map((cfgRes.data ?? []).map((c) => [c.room_id, c]));

    // Every active room is listed, not only the configured ones: a room with
    // no config is exactly what the leader needs to find in order to add it.
    //
    // Ordered by the config's sort_order, NOT by room name. `public.rooms` is
    // fetched name-ordered because that is the only order PostgREST can give
    // it, but sort_order is the order the ministry actually set, and it is
    // what church.kids_live_board orders by (`rk.sort_order NULLS LAST,
    // r.name`). Mapping straight off the name-ordered query meant the Order
    // field on this very screen was the one thing that ignored it, and the
    // board and the setup screen disagreed about the order of the rooms.
    const rooms = (roomsRes.data ?? []).map((room) => ({
      room_id: room.id,
      room_name: room.name,
      config: cfgByRoom.get(room.id) ?? null,
    }));
    rooms.sort((a, b) => {
      const ao = a.config?.sort_order ?? null;
      const bo = b.config?.sort_order ?? null;
      if (ao !== bo) {
        if (ao === null) return 1;
        if (bo === null) return -1;
        return ao - bo;
      }
      return a.room_name.localeCompare(b.room_name);
    });

    return {
      rooms,
      ageBands: bandsRes.data ?? [],
      grades: gradesRes.data ?? [],
    };
  },
};

export type ClassroomListing = Awaited<
  ReturnType<typeof kidsLeaderService.listClassrooms>
>;
export type ClassroomRow = ClassroomListing["rooms"][number];
export type AgeBand = ClassroomListing["ageBands"][number];
export type SchoolGrade = ClassroomListing["grades"][number];
