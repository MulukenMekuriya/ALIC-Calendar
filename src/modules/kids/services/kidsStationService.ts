/**
 * Station and shift operations.
 *
 * Everything goes through SECURITY DEFINER RPCs. The station account has no
 * write privilege on any kids table, so these functions are the only path —
 * which is what stops a shared tablet attributing an action to a volunteer
 * who did not perform it.
 */

import { supabase } from "@/integrations/supabase/client";
import { throwRpc } from "./rpcError";
import type {
  CheckInStation,
  VolunteerOption,
  HouseholdSearchRow,
  CheckInResultRow,
  PickupMatchRow,
  StationRoom,
  StationRosterRow,
  SafetyCard,
  VisitorFamilyRow,
  ClassroomGradeRow,
  HouseholdAdultRow,
  ReprintCandidateRow,
  ReprintedLabelRow,
} from "../types";
import type { PickupCandidate } from "../utils/checkInMachine";

const church = () => supabase.schema("church");

/** A classroom remembered for a child. */
export interface RoomPreference {
  child_person_id: string;
  room_id: string;
  room_name: string;
  /** School years since it was chosen. >0 means it has climbed and wants confirming. */
  carried_years: number;
  set_by_name: string;
  set_at: string;
}

export const kidsStationService = {
  async listStations(organizationId: string): Promise<CheckInStation[]> {
    const { data, error } = await church()
      .from("check_in_stations")
      .select("*")
      .eq("organization_id", organizationId)
      .eq("is_active", true)
      .order("name");
    throwRpc(error);
    return data ?? [];
  },

  async listVolunteers(stationId: string): Promise<VolunteerOption[]> {
    const { data, error } = await church().rpc("station_list_volunteers", {
      _station_id: stationId,
    });
    throwRpc(error);
    return (data ?? []) as unknown as VolunteerOption[];
  },

  /**
   * Open a shift.
   *
   * Returns null when denied. The RPC returns ZERO ROWS rather than raising,
   * so that the failed-attempt counter it increments actually commits — a
   * RAISE would roll the counter back and the lockout would never engage.
   * Every failure mode looks identical from here on purpose.
   */
  async openShift(
    stationId: string,
    volunteerId: string,
    pin: string
  ): Promise<{ token: string; volunteerName: string; canOverride: boolean } | null> {
    const { data, error } = await church().rpc("station_open_shift", {
      _station_id: stationId,
      _volunteer_id: volunteerId,
      _pin: pin,
    });
    throwRpc(error);
    const rows = (data ?? []) as unknown as {
      shift_token: string;
      volunteer_name: string;
      can_override: boolean;
    }[];
    if (rows.length === 0) return null;
    return {
      token: rows[0].shift_token,
      volunteerName: rows[0].volunteer_name,
      canOverride: rows[0].can_override,
    };
  },

  async closeShift(token: string): Promise<void> {
    const { error } = await church().rpc("station_close_shift", {
      _shift_token: token,
    });
    throwRpc(error);
  },

  async searchHouseholds(
    query: string,
    sessionId: string,
    token?: string | null
  ): Promise<HouseholdSearchRow[]> {
    const { data, error } = await church().rpc("station_search_households", {
      _query: query,
      _kids_session_id: sessionId,
      _shift_token: token ?? null,
    });
    throwRpc(error);
    return (data ?? []) as unknown as HouseholdSearchRow[];
  },

  /**
   * Commit a family's check-in.
   *
   * `overrideCapacity` exists because a full room must not turn a child away.
   * The RPC raises `room_at_capacity` by default; the station catches it, warns
   * the volunteer, and re-sends with the override plus a recorded reason —
   * a warning with an audit trail rather than a refusal.
   */
  async checkIn(params: {
    sessionId: string;
    childIds: string[];
    roomIds?: (string | null)[];
    token?: string | null;
    clientBatchKey: string;
    droppedOffByPersonId?: string | null;
    overrideCapacity?: boolean;
    assignmentReason?: string | null;
  }): Promise<CheckInResultRow[]> {
    const { data, error } = await church().rpc("check_in_children", {
      _kids_session_id: params.sessionId,
      _child_person_ids: params.childIds,
      _room_ids: params.roomIds ?? null,
      _shift_token: params.token ?? null,
      _client_batch_key: params.clientBatchKey,
      _dropped_off_by_person_id: params.droppedOffByPersonId ?? null,
      _override_capacity: params.overrideCapacity ?? false,
      _assignment_reason: params.assignmentReason ?? null,
    });
    throwRpc(error);
    return (data ?? []) as unknown as CheckInResultRow[];
  },

  /**
   * Who the database says may collect this child.
   *
   * Anyone on the restricted list is omitted, so an unlisted name falls
   * through to "Someone else", which needs an admin — the escalation is the
   * point. `child_has_restriction` is returned so the desk knows to check
   * identity carefully even when the person IS listed.
   */
  async pickupCandidates(
    checkInId: string,
    token?: string | null
  ): Promise<PickupCandidate[]> {
    const { data, error } = await church().rpc("station_pickup_candidates", {
      _check_in_id: checkInId,
      _shift_token: token ?? null,
    });
    throwRpc(error);
    return (data ?? []) as unknown as PickupCandidate[];
  },

  /**
   * KID-018/KID-025: the minimum a volunteer needs in an emergency.
   * Every call writes an audit row server-side, which is what makes giving
   * admins access to children's medical data traceable after the fact.
   */
  async safetyCard(
    checkInId: string,
    token?: string | null
  ): Promise<SafetyCard | null> {
    const { data, error } = await church().rpc("station_child_safety_card", {
      _check_in_id: checkInId,
      _shift_token: token ?? null,
    });
    throwRpc(error);
    const rows = (data ?? []) as unknown as SafetyCard[];
    return rows[0] ?? null;
  },

  /**
   * Put myself on this shift, in this room.
   *
   * Separate from the leader's assign_session_staff, which requires
   * kids_admin: that is right for rostering somebody else and wrong for
   * saying "I am in this room now". Until this existed, every staffed room
   * showed "no volunteer assigned" and the ratio warnings were wrong all
   * morning, which teaches people to ignore them.
   */
  async startMyShift(sessionId: string, roomId: string | null, role?: string) {
    const { data, error } = await church().rpc("start_my_shift", {
      _kids_session_id: sessionId,
      _room_id: roomId,
      _role: role ?? "classroom_volunteer",
    });
    throwRpc(error);
    return data;
  },

  async endMyShift(sessionId: string): Promise<number> {
    const { data, error } = await church().rpc("end_my_shift", {
      _kids_session_id: sessionId,
    });
    throwRpc(error);
    return (data as unknown as number) ?? 0;
  },

  async myCurrentShift(
    sessionId: string
  ): Promise<{ staffing_id: string; room_id: string | null; room_name: string | null; role: string } | null> {
    const { data, error } = await church().rpc("my_current_shift", {
      _kids_session_id: sessionId,
    });
    throwRpc(error);
    const rows = (data ?? []) as unknown as {
      staffing_id: string;
      room_id: string | null;
      room_name: string | null;
      role: string;
    }[];
    return rows[0] ?? null;
  },

  /**
   * Move a child to another room, keeping their pickup code.
   *
   * Without this a misplaced child had to be checked out and back in, which
   * ROTATES the code — leaving the parent holding a label that no longer works.
   */
  async transferChild(checkInId: string, toRoomId: string, reason?: string) {
    const { error } = await church().rpc("transfer_child", {
      _check_in_id: checkInId,
      _to_room_id: toRoomId,
      _reason: reason || null,
    });
    throwRpc(error);
  },

  /**
   * The classrooms a child can be put in, with their school grade.
   *
   * Not session-scoped: registering a family happens before anyone has opened
   * a session, and the class list belongs to the branch, not to today.
   */
  async classroomGrades(token?: string | null): Promise<ClassroomGradeRow[]> {
    const { data, error } = await church().rpc("station_classroom_grades", {
      _shift_token: token ?? null,
    });
    throwRpc(error);
    return (data ?? []) as unknown as ClassroomGradeRow[];
  },

  /**
   * Register a visiting family at the desk and hand back their children.
   *
   * The express lane. Everything needed to put a child safely in a room and
   * nothing else — the full member record is a pastoral job for later, not
   * something to type with a queue behind you.
   *
   * Throws `family_already_exists:<household name>` rather than writing, so a
   * returning visitor becomes a search instead of a duplicate. A duplicate
   * would split their pickup whitelist, which is how a parent gets refused at
   * the classroom door for a child they just dropped off.
   */
  async registerVisitorFamily(
    guardian: { first_name: string; last_name: string; phone: string; email?: string | null },
    children: {
      first_name: string;
      last_name?: string | null;
      birth_year: string;
      birth_month?: string | null;
      school_grade_id?: string | null;
      allergies?: string | null;
      allergy_severity?: string | null;
    }[],
    token?: string | null
  ): Promise<VisitorFamilyRow[]> {
    const { data, error } = await church().rpc("station_register_visitor_family", {
      _guardian: guardian,
      _children: children,
      _shift_token: token ?? null,
    });
    throwRpc(error);
    return (data ?? []) as unknown as VisitorFamilyRow[];
  },

  /**
   * The adults on a household, for "who is dropping this child off?".
   *
   * dropped_off_by_person_id has existed since the first kids migration and was
   * populated on zero check-ins, because the desk never asked. It is the most
   * natural question at pickup — "is this the person who brought them?" — and
   * the answer is already standing at the desk.
   */
  async householdAdults(
    householdId: string,
    token?: string | null
  ): Promise<HouseholdAdultRow[]> {
    const { data, error } = await church().rpc("station_household_adults", {
      _household_id: householdId,
      _shift_token: token ?? null,
    });
    throwRpc(error);
    return (data ?? []) as unknown as HouseholdAdultRow[];
  },

  /**
   * Find a family whose slip needs reprinting.
   *
   * By name or phone, never by code — the code is the thing they have lost.
   * Only batches with a child still in a room come back.
   */
  async findBatchForReprint(
    query: string,
    sessionId?: string | null,
    token?: string | null
  ): Promise<ReprintCandidateRow[]> {
    const { data, error } = await church().rpc("station_find_batch_for_reprint", {
      _query: query,
      _kids_session_id: sessionId ?? null,
      _shift_token: token ?? null,
    });
    throwRpc(error);
    return (data ?? []) as unknown as ReprintCandidateRow[];
  },

  /**
   * Reissue a family's slip with a NEW code.
   *
   * Rotation is the point. The previous slip stops resolving the instant this
   * returns, so paper left in a car — or handed to the wrong person — is dead
   * rather than live for the rest of the morning.
   */
  async reprintLabel(
    batchId: string,
    reason?: string | null,
    token?: string | null
  ): Promise<ReprintedLabelRow[]> {
    const { data, error } = await church().rpc("reprint_pickup_label", {
      _batch_id: batchId,
      _reason: reason ?? null,
      _shift_token: token ?? null,
    });
    throwRpc(error);
    return (data ?? []) as unknown as ReprintedLabelRow[];
  },

  /** Zero rows means denied — wrong, expired, locked or already used. */
  async resolvePickup(
    sessionId: string,
    presented: string,
    token?: string | null
  ): Promise<PickupMatchRow[]> {
    const { data, error } = await church().rpc("resolve_pickup", {
      _kids_session_id: sessionId,
      _presented: presented,
      _shift_token: token ?? null,
    });
    throwRpc(error);
    return (data ?? []) as unknown as PickupMatchRow[];
  },

  /**
   * Release children to whoever is collecting them.
   *
   * `pickedUpByPersonId` is not optional in spirit: the restricted-pickup
   * check only runs against an identified person, and the database now refuses
   * to release a child who has a restriction on file when nobody is named.
   * Passing only a code releases ordinary children and denies restricted ones.
   *
   * Zero rows returned means DENIED — wrong code, expired, locked, already
   * out, or a restricted collector. The reason is deliberately not
   * distinguished, so the desk cannot be used as an oracle.
   */
  async checkOut(params: {
    checkInIds: string[];
    presented?: string | null;
    token?: string | null;
    pickedUpByPersonId?: string | null;
    pickedUpByName?: string | null;
    overrideReason?: string | null;
    overrideVerification?: string | null;
  }): Promise<{ check_in_id: string; child_name: string }[]> {
    const { data, error } = await church().rpc("check_out_children", {
      _check_in_ids: params.checkInIds,
      _presented: params.presented ?? null,
      _shift_token: params.token ?? null,
      _picked_up_by_person_id: params.pickedUpByPersonId ?? null,
      _picked_up_by_name: params.pickedUpByName ?? null,
      _override_reason: params.overrideReason ?? null,
      _override_verification: params.overrideVerification ?? null,
    });
    throwRpc(error);
    return (data ?? []) as unknown as { check_in_id: string; child_name: string }[];
  },

  /** Open classrooms with live occupancy. Nothing here identifies a person. */
  async sessionRooms(
    sessionId: string,
    token?: string | null
  ): Promise<StationRoom[]> {
    const { data, error } = await church().rpc("station_session_rooms", {
      _kids_session_id: sessionId,
      _shift_token: token ?? null,
    });
    throwRpc(error);
    return (data ?? []) as unknown as StationRoom[];
  },

  /**
   * Who is in the room in front of the volunteer.
   *
   * Names are first name + last initial, as everywhere else on the station.
   * The leader's kids_room_roster returns full names and the guardian's phone;
   * this one deliberately does not.
   */
  async roomRoster(
    sessionId: string,
    roomId: string | null,
    token?: string | null
  ): Promise<StationRosterRow[]> {
    const { data, error } = await church().rpc("station_room_roster", {
      _kids_session_id: sessionId,
      _room_id: roomId,
      _shift_token: token ?? null,
    });
    throwRpc(error);
    return (data ?? []) as unknown as StationRosterRow[];
  },

  /**
   * Message the parents of one checked-in child ("Please come to Room 4").
   *
   * Returns one row per recipient actually queued. An EMPTY array is a
   * meaningful result, not a success: it means nobody in the household has a
   * contactable address or everyone has opted out, so the volunteer must go
   * find the parent in person. The caller has to say so.
   */
  async sendParentMessage(params: {
    checkInId: string;
    message: string;
    token?: string | null;
  }): Promise<
    { recipient_name: string; channel: string; destination: string; status: string }[]
  > {
    const { data, error } = await church().rpc("send_parent_message", {
      _check_in_id: params.checkInId,
      _message: params.message,
      _shift_token: params.token ?? null,
    });
    throwRpc(error);
    return (data ?? []) as unknown as {
      recipient_name: string;
      channel: string;
      destination: string;
      status: string;
    }[];
  },

  /**
   * Remember the classroom a volunteer chose for a child.
   *
   * `null` clears it — "Room by grade" in the dropdown is a real answer,
   * meaning "stop remembering and follow the grade again", and a volunteer
   * has to be able to undo a choice as easily as they made it.
   *
   * The server stamps the school year and the room's grade, so next
   * September the child climbs one rung of the ladder by itself.
   */
  async setRoomPreference(
    childPersonId: string,
    roomId: string | null,
    token?: string | null,
  ): Promise<void> {
    const { error } = await church().rpc("kids_set_child_room_preference", {
      _child_person_id: childPersonId,
      _room_id: roomId,
      _shift_token: token ?? null,
    });
    throwRpc(error);
  },

  /** The remembered rooms for a family, so the dropdown opens on them. */
  async roomPreferences(
    childPersonIds: string[],
    kidsSessionId: string | null,
    token?: string | null,
  ): Promise<RoomPreference[]> {
    if (childPersonIds.length === 0) return [];
    const { data, error } = await church().rpc("kids_child_room_preferences", {
      _child_person_ids: childPersonIds,
      _kids_session_id: kidsSessionId,
      _shift_token: token ?? null,
    });
    throwRpc(error);
    return (data ?? []) as unknown as RoomPreference[];
  },
};
