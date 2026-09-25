/**
 * Kids Ministry module types
 */

import type { Tables } from "@/integrations/supabase/types";

type ChurchSchema = { schema: "church" };

export type CheckInStation = Tables<ChurchSchema, "check_in_stations">;
export type KidsVolunteer = Tables<ChurchSchema, "kids_volunteers">;
export type KidsEvent = Tables<ChurchSchema, "kids_events">;
export type KidsSession = Tables<ChurchSchema, "kids_sessions">;
export type KidsSessionRoom = Tables<ChurchSchema, "kids_session_rooms">;
export type KidsCheckIn = Tables<ChurchSchema, "kids_check_ins">;
export type RoomKidsConfig = Tables<ChurchSchema, "room_kids_config">;

/** One row from church.station_list_volunteers. */
export interface VolunteerOption {
  volunteer_id: string;
  display_name: string;
}

/** One row from church.station_search_households. */
export interface HouseholdSearchRow {
  household_id: string;
  household_name: string;
  masked_phone: string | null;
  child_person_id: string;
  child_display_name: string;
  age_band_code: string | null;
  grade_name: string | null;
  already_checked_in: boolean;
  needs_staff: boolean;
}

/** One row from church.check_in_children. */
export interface CheckInResultRow {
  batch_id: string;
  pickup_code: string;
  pickup_token: string;
  check_in_id: string;
  child_person_id: string;
  child_name: string;
  room_id: string;
  room_name: string | null;
  tag_number: number;
  allergy_label: string | null;
  has_restriction: boolean;
}

/** One row from church.resolve_pickup. */
export interface PickupMatchRow {
  batch_id: string;
  check_in_id: string;
  child_person_id: string;
  child_name: string;
  room_name: string | null;
  tag_number: number;
  status: string;
  has_restriction: boolean;
}

/**
 * One row from church.station_child_safety_card (KID-018).
 *
 * Reading this writes an audit row server-side on every call, which is what
 * keeps "org admins can see children's medical data" traceable.
 */
export interface SafetyCard {
  child_name: string;
  allergy_severity: string | null;
  allergies: string | null;
  medications: string | null;
  special_needs: string | null;
  /** The first person to call — a parent, unless none has a phone on file. */
  emergency_name: string | null;
  emergency_phone: string | null;
  /**
   * Everyone worth calling, parents first.
   *
   * The people you ring about a child are their parents; a recorded
   * "emergency contact" is who to try when the parents cannot be reached. The
   * card used to show only the latter, so for most children a volunteer
   * holding a reacting child saw a blank while the mother's number sat in the
   * directory.
   */
  contacts: { name: string; phone: string | null; relationship: string }[];
}

/** One row from church.station_session_rooms. Occupancy only, no people. */
export interface StationRoom {
  room_id: string;
  room_name: string;
  grade_name: string | null;
  age_band_name: string | null;
  capacity: number | null;
  checked_in_count: number;
  /** First names of the room's standing teachers, lead first. */
  teachers: string | null;
}

/**
 * One row from church.station_room_roster.
 *
 * Names are first name + last initial, matching the rest of the station.
 * The leader's RosterRow carries full names and a guardian phone; this does
 * not, so a photograph of the tablet still leaks very little.
 */
export interface StationRosterRow {
  check_in_id: string;
  child_display_name: string;
  tag_number: number;
  room_id: string | null;
  room_name: string | null;
  checked_in_at: string;
  minutes_in_room: number;
  has_allergy: boolean;
  has_restriction: boolean;
}

/** Persisted on the device so a station survives a reload. */
export interface StationIdentity {
  stationId: string;
  stationName: string;
}

export const STATION_STORAGE_KEY = "alic-kids-station";
/** Shift tokens are session-scoped: closing the tab ends the shift. */
export const SHIFT_STORAGE_KEY = "alic-kids-shift";

/** One row from church.station_register_visitor_family — one per child. */
export interface VisitorFamilyRow {
  household_id: string;
  household_name: string;
  guardian_person_id: string;
  child_person_id: string;
  child_display_name: string;
}

/** One row from church.station_classroom_grades — a classroom and its grade. */
export interface ClassroomGradeRow {
  room_id: string;
  room_name: string;
  school_grade_id: string | null;
  grade_name: string | null;
  sort_order: number;
}

/** One adult on a household — "who is dropping off?" at the desk. */
export interface HouseholdAdultRow {
  person_id: string;
  display_name: string;
  relationship: string;
  masked_phone: string | null;
  is_primary_contact: boolean;
}

/** A live batch a family can have their slip reprinted from. */
export interface ReprintCandidateRow {
  batch_id: string;
  household_name: string;
  masked_phone: string | null;
  children: string | null;
  checked_in_at: string;
}

/** One child on a reprinted label, with the ROTATED code. */
export interface ReprintedLabelRow {
  batch_id: string;
  pickup_code: string;
  pickup_token: string;
  household_name: string;
  check_in_id: string;
  child_name: string;
  room_name: string | null;
  tag_number: number;
  allergy_label: string | null;
  guardian_phone: string | null;
}
