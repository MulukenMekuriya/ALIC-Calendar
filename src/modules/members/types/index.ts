/**
 * Members Module Types
 *
 * Follows the budget module's convention: database aliases first, then
 * *WithRelations shapes, then config maps and filter/form interfaces.
 */

import type { Tables, TablesInsert, TablesUpdate } from "@/integrations/supabase/types";

type ChurchSchema = { schema: "church" };

// --- Database row types -----------------------------------------------------

export type Member = Tables<ChurchSchema, "people">;
export type MemberInsert = TablesInsert<ChurchSchema, "people">;
export type MemberUpdate = TablesUpdate<ChurchSchema, "people">;

export type Household = Tables<ChurchSchema, "households">;
export type HouseholdInsert = TablesInsert<ChurchSchema, "households">;
export type HouseholdUpdate = TablesUpdate<ChurchSchema, "households">;

export type HouseholdMember = Tables<ChurchSchema, "household_members">;
export type HouseholdMemberInsert = TablesInsert<ChurchSchema, "household_members">;

export type PersonRelationship = Tables<ChurchSchema, "person_relationships">;
export type PersonRelationshipInsert = TablesInsert<ChurchSchema, "person_relationships">;

export type PersonSensitive = Tables<ChurchSchema, "person_sensitive">;
export type PersonSensitiveInsert = TablesInsert<ChurchSchema, "person_sensitive">;

export type EmergencyContact = Tables<ChurchSchema, "person_emergency_contacts">;
export type EmergencyContactInsert = TablesInsert<ChurchSchema, "person_emergency_contacts">;

export type MinistryAssignment = Tables<ChurchSchema, "ministry_assignments">;
export type MinistryAssignmentInsert = TablesInsert<ChurchSchema, "ministry_assignments">;
export type MinistryAssignmentUpdate = TablesUpdate<ChurchSchema, "ministry_assignments">;

export type ServiceInterest = Tables<ChurchSchema, "person_service_interests">;
export type ServiceInterestInsert = TablesInsert<ChurchSchema, "person_service_interests">;

export type MembershipStatus = Tables<ChurchSchema, "membership_statuses">;
export type MinistryRole = Tables<ChurchSchema, "ministry_roles">;
export type RelationshipType = Tables<ChurchSchema, "relationship_types">;
export type SchoolGrade = Tables<ChurchSchema, "school_grades">;
export type KidsAgeBand = Tables<ChurchSchema, "kids_age_bands">;
export type GroupType = Tables<ChurchSchema, "group_types">;

export type Group = Tables<ChurchSchema, "groups">;
export type GroupInsert = TablesInsert<ChurchSchema, "groups">;
export type GroupMembership = Tables<ChurchSchema, "group_memberships">;
export type GroupMembershipInsert = TablesInsert<ChurchSchema, "group_memberships">;

export type TrainingCourse = Tables<ChurchSchema, "training_courses">;
export type TrainingSession = Tables<ChurchSchema, "training_sessions">;
export type TrainingAttendance = Tables<ChurchSchema, "training_attendance">;

// --- Extended shapes --------------------------------------------------------

export interface MemberWithRelations extends Member {
  membership_status?: Pick<MembershipStatus, "id" | "code" | "display_name"> | null;
  household?: Pick<Household, "id" | "name" | "city" | "state"> | null;
  household_role?: string | null;
  relationships?: RelationshipWithPerson[];
  ministry_assignments?: MinistryAssignmentWithMinistry[];
  service_interests?: ServiceInterest[];
  group_memberships?: GroupMembershipWithGroup[];
}

export interface RelationshipWithPerson extends PersonRelationship {
  related_person: Pick<Member, "id" | "first_name" | "last_name" | "is_child">;
  relationship_type: Pick<RelationshipType, "code" | "display_name">;
}

export interface MinistryAssignmentWithMinistry extends MinistryAssignment {
  ministry: { id: string; name: string };
  role: Pick<MinistryRole, "code" | "display_name" | "is_leadership_role">;
  member?: Pick<Member, "id" | "first_name" | "last_name"> | null;
}

export interface GroupMembershipWithGroup extends GroupMembership {
  group: Pick<Group, "id" | "name" | "meeting_day">;
  role: Pick<MinistryRole, "code" | "display_name" | "is_leadership_role">;
}

export interface HouseholdWithMembers extends Household {
  members: (Member & { household_role: string; is_primary_contact: boolean })[];
}

// --- Derived, never stored --------------------------------------------------

/**
 * Age band keys used for display. These mirror the seeded
 * `church.kids_age_bands` codes but are only ever used for labels — the
 * authoritative band for a child comes from the database, which owns the
 * boundaries and enforces that they never overlap.
 */
export type AgeBandCode =
  | "nursery"
  | "preschool"
  | "elementary"
  | "preteen"
  | "youth"
  | "adult"
  | "unknown";

/** Adult age bracket for reporting. Derived from birth_year + birth_month. */
export type AdultAgeGroup =
  | "under_20"
  | "20_29"
  | "30_39"
  | "40_49"
  | "50_59"
  | "60_69"
  | "70_plus"
  | "unknown";

// --- Config maps ------------------------------------------------------------

export interface StatusConfig {
  label: string;
  color: string;
  bgColor: string;
  description?: string;
}

export const AGE_BAND_LABELS: Record<AgeBandCode, string> = {
  nursery: "Nursery",
  preschool: "Pre-K",
  elementary: "Elementary",
  preteen: "Preteen",
  youth: "Youth",
  adult: "Adult",
  unknown: "Unknown",
};

export const ADULT_AGE_GROUP_LABELS: Record<AdultAgeGroup, string> = {
  under_20: "Under 20",
  "20_29": "20-29",
  "30_39": "30-39",
  "40_49": "40-49",
  "50_59": "50-59",
  "60_69": "60-69",
  "70_plus": "70+",
  unknown: "Unknown",
};

export const SERVICE_INTEREST_STATUS_CONFIG: Record<string, StatusConfig> = {
  interested: { label: "Interested", color: "text-blue-700", bgColor: "bg-blue-50" },
  contacted: { label: "Contacted", color: "text-amber-700", bgColor: "bg-amber-50" },
  placed: { label: "Placed", color: "text-green-700", bgColor: "bg-green-50" },
  declined: { label: "Declined", color: "text-gray-600", bgColor: "bg-gray-50" },
  closed: { label: "Closed", color: "text-gray-600", bgColor: "bg-gray-50" },
};

export const MONTH_NAMES = [
  "January", "February", "March", "April", "May", "June",
  "July", "August", "September", "October", "November", "December",
] as const;

// --- Filters and form shapes ------------------------------------------------

export interface MemberFilters {
  search?: string;
  membership_status_id?: string;
  is_child?: boolean;
  household_id?: string;
  ministry_id?: string;
  birth_month?: number;
  has_email?: boolean;
  has_phone?: boolean;
  include_inactive?: boolean;
}

export interface MemberStats {
  total: number;
  active: number;
  children: number;
  adults: number;
  households: number;
  serving: number;
}

/** Page size for directory queries. PostgREST truncates at max_rows = 1000. */
export const MEMBER_PAGE_SIZE = 50;

/** One row from church.preview_profile_backfill. */
export interface ProfileBackfillRow {
  profile_id: string;
  full_name: string;
  email: string | null;
  /** "create member" | "link to existing member" | "already linked" */
  action: string;
  matched_person_id: string | null;
  matched_person_name: string | null;
}

/** One row from church.household_summaries. */
export interface HouseholdSummary {
  household_id: string;
  name: string;
  city: string | null;
  primary_contact_name: string | null;
  primary_phone: string | null;
  adult_count: number;
  child_count: number;
}

/**
 * A child with no adult attached to them by any route: no family record with a
 * grown-up on it, no recorded parent, nobody authorised to collect them.
 *
 * The check-in desk can only find such a child by typing the child's own name,
 * checkout has nobody to offer, and no pickup code can be texted anywhere.
 * church.children_without_an_adult() is the list; this is a row of it.
 */
export interface ChildWithoutAnAdult {
  person_id: string;
  child_name: string;
  household_id: string | null;
  household_name: string | null;
  has_household: boolean;
  has_grade: boolean;
  added_on: string;
  added_by: string | null;
}
