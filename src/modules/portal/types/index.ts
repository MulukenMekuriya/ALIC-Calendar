/**
 * Member portal types.
 *
 * Every shape here is something the SIGNED-IN PERSON is being told about
 * themselves. None of the underlying functions take a person id — see the
 * header of supabase/migrations/20260322000600.
 */

/** church.my_portal_summary */
export interface PortalSummary {
  linked: boolean;
  person_id?: string;
  display_name?: string;
  email?: string | null;
  phone?: string | null;
  membership_status?: string | null;
  member_since?: string | null;
  household_name?: string | null;
  household_size?: number;
  children_count?: number;
  serving_count?: number;
  group_count?: number;
  giving_this_year_cents?: number;
  last_gift_on?: string | null;
  open_follow_up_cards?: number;
}

/** church.my_household_members */
export interface HouseholdMemberRow {
  person_id: string;
  display_name: string;
  household_role: string | null;
  is_primary_contact: boolean;
  is_child: boolean;
  email: string | null;
  phone: string | null;
  is_me: boolean;
  /** Month only — church.people has never carried a birth day. */
  birth_month: number | null;
  birth_year: number | null;
}

/**
 * church.my_children
 *
 * Carries the name in parts as well as joined up, and the grade as an id as
 * well as a name: a table reads the joined-up version, and a form cannot use
 * it — "Selam One" does not split back into two names reliably, and a grade
 * name cannot be posted to a column holding an id.
 */
export interface MyChild {
  person_id: string;
  organization_id: string;
  display_name: string;
  first_name: string;
  last_name: string;
  preferred_name: string | null;
  birth_year: number | null;
  birth_month: number | null;
  grade_name: string | null;
  school_grade_id: string | null;
  household_id: string;
  household_name: string | null;
}

/** church.my_children_check_ins */
export interface MyChildCheckIn {
  check_in_id: string;
  child_person_id: string;
  child_name: string;
  session_date: string;
  service_label: string;
  room_name: string | null;
  checked_in_at: string;
  checked_out_at: string | null;
  picked_up_by_name: string | null;
  status: string;
}

/** church.my_serving */
export interface MyServingRow {
  assignment_id: string;
  organization_id: string;
  ministry_name: string;
  role_name: string;
  is_leadership_role: boolean;
  is_primary_role: boolean;
  start_date: string;
}

/** church.my_groups */
export interface MyGroupRow {
  membership_id: string;
  organization_id: string;
  group_name: string;
  group_type: string;
  role_name: string;
  is_leadership_role: boolean;
  meeting_day: string | null;
  /** "19:00:00" — a TIME column, so no date and no zone. */
  meeting_time: string | null;
  meeting_place: string | null;
}

/**
 * A published event the member may see.
 *
 * Read straight from public.events rather than through an RPC: the RESTRICTIVE
 * policy added in 20260321001600 already limits a member to published rows,
 * and re-stating that rule inside a SECURITY DEFINER would be a second copy of
 * it to keep in step.
 */
export interface UpcomingEvent {
  id: string;
  title: string;
  description: string | null;
  starts_at: string;
  ends_at: string;
  room_name: string | null;
}

/**
 * church.my_household_detail — the household itself, not who is in it.
 *
 * `i_can_edit` is false for a child with a login, and for anybody whose
 * membership of the household has ended. The form honours it; the database
 * decides it again in church.update_my_household.
 */
export interface MyHouseholdDetail {
  household_id: string;
  organization_id: string;
  name: string;
  address_line1: string | null;
  address_line2: string | null;
  city: string | null;
  state: string | null;
  postal_code: string | null;
  primary_phone: string | null;
  i_can_edit: boolean;
}

/** church.my_ministry_options — somewhere a member may say they serve. */
export interface MinistryOption {
  ministry_id: string;
  name: string;
  already_serving: boolean;
}

/**
 * church.my_group_options — every active group in the branch.
 *
 * No `meeting_place`: the free-text location of a home cell is usually a
 * family's address, and it is withheld until you are in the group. See the
 * header of 20260322080000.
 */
export interface GroupOption {
  group_id: string;
  name: string;
  group_type: string;
  description: string | null;
  meeting_day: string | null;
  meeting_time: string | null;
  room_name: string | null;
  member_count: number;
  already_member: boolean;
}

/**
 * What the household and child forms send.
 *
 * A patch, not a record: the RPCs treat an absent key as "leave alone" and an
 * explicit null as "clear", so sending the whole form would overwrite fields
 * the form does not render.
 */
export type PortalPatch = Record<string, string | number | null>;
