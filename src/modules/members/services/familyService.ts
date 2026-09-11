/**
 * Family relationships: reading them, and the two ways they get edited.
 *
 * Everything here goes through an RPC rather than the table, and the reason is
 * not uniformity — it is that the two callers cannot use the same route.
 *
 * An ADMIN can read church.person_relationships directly; the policies from
 * 20260320000400 allow it, which is why the profile page's existing embed
 * works for them.
 *
 * A MEMBER cannot. The self-service policies added in 20260320001100 cover
 * people, households, ministry_assignments and several others — but not
 * person_relationships. A member reading their own profile through PostgREST
 * therefore gets an empty relationships array, silently, and the Family tab
 * renders "No family relationships recorded." for someone looking at a record
 * that has four. church.my_family() is the definer function that answers the
 * same question for them, and it carries an `editable` flag computed from the
 * same rule the write path enforces, so the screen can grey out exactly what
 * the write would refuse.
 */

import { supabase } from "@/integrations/supabase/client";

const church = () => supabase.schema("church");

/** One row of the Family tab, from whichever side the caller is allowed to read. */
export interface FamilyTie {
  /** The person_relationships row. Null only for a tie the caller may not act on. */
  relationshipId: string | null;
  relatedPersonId: string;
  firstName: string;
  lastName: string;
  isChild: boolean;
  relationshipCode: string | null;
  relationshipName: string;
  /** Whether THIS caller may change this row. Admins: always. Members: own kids. */
  editable: boolean;
}

export interface FamilyCandidate {
  id: string;
  firstName: string;
  lastName: string;
  isChild: boolean;
  householdName: string | null;
  alreadyRelated: boolean;
}

export const familyService = {
  /**
   * The caller's own family, for a member looking at their own record.
   *
   * Takes no arguments on purpose: church.my_family() is written in terms of
   * my_person_ids(), so there is no id to tamper with.
   */
  async myFamily(): Promise<FamilyTie[]> {
    const { data, error } = await church().rpc("my_family");
    if (error) throw error;
    return (data ?? []).map((r) => ({
      relationshipId: r.relationship_id,
      relatedPersonId: r.related_person_id,
      firstName: r.first_name,
      lastName: r.last_name,
      isChild: r.is_child,
      relationshipCode: r.relationship_code,
      relationshipName: r.relationship_name,
      editable: r.editable,
    }));
  },

  /**
   * Anyone's family, for the office.
   *
   * Reads the table, because an admin may and because this has to work for a
   * record that is not the caller's own. Every row comes back editable: the
   * RPC will accept any of them from a members_admin.
   */
  async forPerson(personId: string): Promise<FamilyTie[]> {
    const { data, error } = await church()
      .from("person_relationships")
      .select(
        `id,
         related_person_id,
         related_person:people!fk_person_relationships_related(
           id, first_name, last_name, is_child
         ),
         relationship_type:relationship_types(code, display_name)`
      )
      .eq("person_id", personId)
      .is("end_date", null);

    if (error) throw error;

    type Row = {
      id: string;
      related_person_id: string;
      related_person: {
        first_name: string;
        last_name: string;
        is_child: boolean;
      } | null;
      relationship_type: { code: string; display_name: string } | null;
    };

    return ((data ?? []) as unknown as Row[]).map((r) => ({
      relationshipId: r.id,
      relatedPersonId: r.related_person_id,
      firstName: r.related_person?.first_name ?? "",
      lastName: r.related_person?.last_name ?? "",
      isChild: r.related_person?.is_child ?? false,
      relationshipCode: r.relationship_type?.code ?? null,
      relationshipName: r.relationship_type?.display_name ?? "Related",
      editable: true,
    }));
  },

  /**
   * Who this person may be linked to.
   *
   * Scoped by the database, not by the screen: an admin gets the branch, a
   * member gets the children of their own households. The screen can therefore
   * render whatever comes back without a second permission rule of its own —
   * the two would eventually disagree.
   */
  async linkCandidates(
    personId: string,
    search?: string
  ): Promise<FamilyCandidate[]> {
    const { data, error } = await church().rpc("family_link_candidates", {
      _person_id: personId,
      _search: search || undefined,
    });
    if (error) throw error;
    return (data ?? []).map((r) => ({
      id: r.id,
      firstName: r.first_name,
      lastName: r.last_name,
      isChild: r.is_child,
      householdName: r.household_name,
      alreadyRelated: r.already_related,
    }));
  },

  /** Record a tie, or correct the type on one that is already there. */
  async setRelationship(
    personId: string,
    relatedPersonId: string,
    relationshipTypeId: string
  ): Promise<string> {
    const { data, error } = await church().rpc("set_person_relationship", {
      _person_id: personId,
      _related_person_id: relatedPersonId,
      _relationship_type_id: relationshipTypeId,
    });
    if (error) throw error;
    return data as string;
  },

  /**
   * Remove a tie. members_admin only — the RPC refuses anyone else, so this
   * never needs a client-side check to be correct, only to stay quiet.
   */
  async removeRelationship(relationshipId: string): Promise<void> {
    const { error } = await church().rpc("delete_person_relationship", {
      _relationship_id: relationshipId,
    });
    if (error) throw error;
  },
};

/**
 * Turn a Postgres error into the sentence the person in front of the screen
 * needs. The RPCs raise named conditions precisely so this mapping can exist
 * somewhere other than inside a toast that says "unexpected error".
 */
export function familyErrorMessage(err: unknown): string {
  const raw =
    typeof err === "object" && err !== null && "message" in err
      ? String((err as { message: unknown }).message)
      : String(err);

  if (raw.includes("child_not_in_your_household"))
    return "That child is not in your household. Ask the office to add them first.";
  if (raw.includes("members_may_only_edit_their_children"))
    return "You can only change how you are related to your own children. Ask the office for anything else.";
  if (raw.includes("members_may_only_set_parent_or_guardian"))
    return "You can record yourself as a parent or a guardian. Ask the office for any other relationship.";
  if (raw.includes("cannot_relate_a_person_to_themselves"))
    return "A person cannot be related to themselves.";
  if (raw.includes("relationship_type_not_found"))
    return "That relationship type is not available in this branch.";
  if (raw.includes("not_permitted"))
    return "You do not have permission to change this.";
  return raw;
}
