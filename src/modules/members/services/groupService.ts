/**
 * Home cells, Bible studies and who is in them.
 *
 * The tables have existed since 20260320000600 and the member profile has been
 * reading group_memberships all along, but nothing in the app could ever write
 * one — there was no service, no hook and no form. A group could only be
 * created in SQL. This is the missing half.
 *
 * Writes go through the "Membership admins can manage" policies on
 * church.groups and church.group_memberships, so an ordinary member cannot
 * add themselves to a group: which cell someone belongs to is the church's
 * record, not a self-service preference.
 */

import { supabase } from "@/integrations/supabase/client";
import type { Group, GroupMembership, GroupMembershipInsert } from "../types";

const church = () => supabase.schema("church");

export const groupService = {
  /** Every active group in the branch, for a picker. */
  async list(organizationId: string): Promise<Group[]> {
    const { data, error } = await church()
      .from("groups")
      .select("*")
      .eq("organization_id", organizationId)
      .eq("is_active", true)
      .order("name");

    if (error) throw error;
    return data ?? [];
  },

  async addMember(membership: GroupMembershipInsert): Promise<GroupMembership> {
    const { data, error } = await church()
      .from("group_memberships")
      .insert(membership)
      .select()
      .single();

    if (error) throw error;
    return data;
  },

  /**
   * Ends a membership rather than deleting it, the same way
   * servingService.end() does — "no_overlapping_group_membership" keeps the
   * history and a deleted row would take the fact that they ever attended
   * with it.
   */
  async endMember(membershipId: string, endedOn?: string): Promise<void> {
    const { error } = await church()
      .from("group_memberships")
      .update({ end_date: endedOn ?? new Date().toISOString().slice(0, 10) })
      .eq("id", membershipId);

    if (error) throw error;
  },
};
