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
}

/** church.my_children */
export interface MyChild {
  person_id: string;
  organization_id: string;
  display_name: string;
  birth_year: number | null;
  birth_month: number | null;
  grade_name: string | null;
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
