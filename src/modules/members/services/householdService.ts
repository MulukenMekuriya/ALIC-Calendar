/**
 * Household and family-relationship data access.
 */

import { supabase } from "@/integrations/supabase/client";
import type {
  Household,
  HouseholdInsert,
  HouseholdUpdate,
  HouseholdWithMembers,
  Member,
  PersonRelationshipInsert,
  RelationshipWithPerson,
  HouseholdSummary,
  ChildWithoutAnAdult,
} from "../types";

const church = () => supabase.schema("church");
const NO_ROWS = "PGRST116";

export const householdService = {
  /** Families with enough detail to be useful in a list. */
  async summaries(organizationId: string): Promise<HouseholdSummary[]> {
    const { data, error } = await church().rpc("household_summaries", {
      _organization_id: organizationId,
    });
    if (error) throw error;
    return (data ?? []) as unknown as HouseholdSummary[];
  },

  /**
   * Children the check-in desk cannot reach through any adult.
   *
   * The office's repair list. A child gets on it by being added to a family
   * record that has no adult on it — which is what a duplicate family from the
   * import looks like — and comes off it the moment a parent is added to that
   * family, or the child is moved to the family the parent is actually in.
   */
  async childrenWithoutAnAdult(
    organizationId: string
  ): Promise<ChildWithoutAnAdult[]> {
    const { data, error } = await church().rpc("children_without_an_adult", {
      _organization_id: organizationId,
    });
    if (error) throw error;
    return (data ?? []) as unknown as ChildWithoutAnAdult[];
  },

  /**
   * Add a NEW child to an existing family.
   *
   * Not the same as addMember(), which attaches an existing person. This
   * creates the child AND the parent relationships AND the pickup
   * authorisations — without which the check-in desk would offer nobody to
   * collect them.
   */
  async addChild(householdId: string, child: Record<string, unknown>): Promise<string> {
    const { data, error } = await church().rpc("add_child_to_household", {
      _household_id: householdId,
      _child: child as never,
    });
    if (error) throw error;
    return data as unknown as string;
  },

  /**
   * Add a NEW child to a PERSON rather than to a family record.
   *
   * The door the office needs when a parent walks up on a Sunday: most of the
   * imported congregation has no family record, and the Families page can only
   * reach the ones that do. The database makes the family first where there is
   * none, so the child still gets the parent relationship and the pickup
   * authorisation that the check-in desk and the checkout gate read.
   */
  async addChildToPerson(
    personId: string,
    child: Record<string, unknown>
  ): Promise<{ childPersonId: string; householdId: string; householdCreated: boolean }> {
    const { data, error } = await church().rpc("add_child_to_person", {
      _parent_person_id: personId,
      _child: child as never,
    });
    if (error) throw error;
    const rows = (data ?? []) as unknown as {
      child_person_id: string;
      household_id: string;
      household_created: boolean;
    }[];
    if (rows.length === 0) throw new Error("The child was not created");
    return {
      childPersonId: rows[0].child_person_id,
      householdId: rows[0].household_id,
      householdCreated: rows[0].household_created,
    };
  },

  async list(organizationId: string): Promise<Household[]> {
    const { data, error } = await church()
      .from("households")
      .select("*")
      .eq("organization_id", organizationId)
      .eq("is_active", true)
      .order("name");
    if (error) throw error;
    return data || [];
  },

  async get(householdId: string): Promise<Household | null> {
    const { data, error } = await church()
      .from("households")
      .select("*")
      .eq("id", householdId)
      .single();
    if (error && error.code !== NO_ROWS) throw error;
    return data;
  },

  async getWithMembers(householdId: string): Promise<HouseholdWithMembers | null> {
    const { data, error } = await church()
      .from("households")
      .select("*, household_members(household_role, is_primary_contact, person:people(*))")
      .eq("id", householdId)
      .is("household_members.end_date", null)
      .single();
    if (error && error.code !== NO_ROWS) throw error;
    if (!data) return null;

    const raw = data as unknown as Household & {
      household_members: {
        household_role: string;
        is_primary_contact: boolean;
        person: Member;
      }[];
    };

    return {
      ...raw,
      members: (raw.household_members || [])
        .filter((hm) => hm.person)
        .map((hm) => ({
          ...hm.person,
          household_role: hm.household_role,
          is_primary_contact: hm.is_primary_contact,
        })),
    };
  },

  async create(household: HouseholdInsert): Promise<Household> {
    const { data, error } = await church()
      .from("households")
      .insert(household)
      .select()
      .single();
    if (error) throw error;
    return data;
  },

  async update(householdId: string, patch: HouseholdUpdate): Promise<Household> {
    const { data, error } = await church()
      .from("households")
      .update({ ...patch, updated_at: new Date().toISOString() })
      .eq("id", householdId)
      .select()
      .single();
    if (error) throw error;
    return data;
  },

  /**
   * Add a person to a household.
   *
   * The database enforces at most one PRIMARY household per person and no
   * overlapping membership spans, so a bad call fails loudly rather than
   * producing a person who lives in two places at once.
   */
  async addMember(params: {
    organizationId: string;
    householdId: string;
    personId: string;
    householdRole: string;
    isPrimaryHousehold?: boolean;
  }): Promise<void> {
    const { error } = await church().from("household_members").insert({
      organization_id: params.organizationId,
      household_id: params.householdId,
      person_id: params.personId,
      household_role: params.householdRole,
      is_primary_household: params.isPrimaryHousehold ?? true,
    });
    if (error) throw error;
  },

  /**
   * Remove a person from a household by ENDING the membership, so the history
   * of who lived where survives (BR-11).
   */
  async endMembership(householdMemberId: string): Promise<void> {
    const { error } = await church()
      .from("household_members")
      .update({
        end_date: new Date().toISOString().slice(0, 10),
        updated_at: new Date().toISOString(),
      })
      .eq("id", householdMemberId);
    if (error) throw error;
  },

  async setPrimaryContact(householdId: string, personId: string): Promise<void> {
    const clear = await church()
      .from("household_members")
      .update({ is_primary_contact: false, updated_at: new Date().toISOString() })
      .eq("household_id", householdId)
      .is("end_date", null);
    if (clear.error) throw clear.error;

    const { error } = await church()
      .from("household_members")
      .update({ is_primary_contact: true, updated_at: new Date().toISOString() })
      .eq("household_id", householdId)
      .eq("person_id", personId)
      .is("end_date", null);
    if (error) throw error;
  },
};

export const relationshipService = {
  async listForMember(memberId: string): Promise<RelationshipWithPerson[]> {
    const { data, error } = await church()
      .from("person_relationships")
      .select(
        `*,
         // PostgREST needs the CONSTRAINT name, and person_relationships has
         // two foreign keys into people, so the hint is not optional. The
         // invented "person_relationships_related_person_id_fkey" does not
         // exist and returned a 400.
         related_person:people!fk_person_relationships_related(
           id, first_name, last_name, is_child
         ),
         relationship_type:relationship_types(code, display_name)`
      )
      .eq("person_id", memberId)
      .is("end_date", null);
    if (error) throw error;
    return (data || []) as unknown as RelationshipWithPerson[];
  },

  /**
   * Create one edge. The database mirrors the inverse automatically
   * (parent -> child implies child -> parent), so callers must NOT write both
   * directions or they will collide on the uniqueness constraint.
   */
  async create(relationship: PersonRelationshipInsert): Promise<void> {
    const { error } = await church().from("person_relationships").insert(relationship);
    if (error) throw error;
  },

  async delete(relationshipId: string): Promise<void> {
    const { error } = await church()
      .from("person_relationships")
      .delete()
      .eq("id", relationshipId);
    if (error) throw error;
  },
};
