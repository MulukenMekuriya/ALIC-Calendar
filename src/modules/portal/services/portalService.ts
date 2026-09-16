/**
 * Member portal data access.
 *
 * Thin by design: each call is one self-scoped SECURITY DEFINER function that
 * takes no person id, so there is nothing here to get wrong.
 */

import { supabase } from "@/integrations/supabase/client";
import type {
  PortalSummary,
  HouseholdMemberRow,
  MyChild,
  MyChildCheckIn,
  MyServingRow,
  MyGroupRow,
  MyHouseholdDetail,
  MinistryOption,
  GroupOption,
  PortalPatch,
  UpcomingEvent,
} from "../types";
import type { Statement } from "@/modules/giving/types";

const church = () => supabase.schema("church");

export const portalService = {
  async summary(organizationId: string): Promise<PortalSummary> {
    const { data, error } = await church().rpc("my_portal_summary", {
      _organization_id: organizationId,
    });
    if (error) throw error;
    return (data as unknown as PortalSummary) ?? { linked: false };
  },

  async household(): Promise<HouseholdMemberRow[]> {
    const { data, error } = await church().rpc("my_household_members");
    if (error) throw error;
    return (data ?? []) as unknown as HouseholdMemberRow[];
  },

  async children(): Promise<MyChild[]> {
    const { data, error } = await church().rpc("my_children");
    if (error) throw error;
    return (data ?? []) as unknown as MyChild[];
  },

  async childrenCheckIns(limit = 30): Promise<MyChildCheckIn[]> {
    const { data, error } = await church().rpc("my_children_check_ins", {
      _limit: limit,
    });
    if (error) throw error;
    return (data ?? []) as unknown as MyChildCheckIn[];
  },

  async serving(): Promise<MyServingRow[]> {
    const { data, error } = await church().rpc("my_serving");
    if (error) throw error;
    return (data ?? []) as unknown as MyServingRow[];
  },

  async groups(): Promise<MyGroupRow[]> {
    const { data, error } = await church().rpc("my_groups");
    if (error) throw error;
    return (data ?? []) as unknown as MyGroupRow[];
  },

  /*
   * ------------------------------------------------------------------ writes
   *
   * Everything below is a member correcting their own record, and every one of
   * them is a SECURITY DEFINER function that works out who the caller is for
   * itself. None takes a person id, so there is no id here to get wrong and no
   * id a hand-built request could substitute. What a member may change, and
   * what is reserved to the office, is argued out in the header of
   * supabase/migrations/20260322080000.
   */

  async householdDetail(): Promise<MyHouseholdDetail[]> {
    const { data, error } = await church().rpc("my_household_detail");
    if (error) throw error;
    return (data ?? []) as unknown as MyHouseholdDetail[];
  },

  async updateHousehold(householdId: string, patch: PortalPatch): Promise<void> {
    const { error } = await church().rpc("update_my_household", {
      _household_id: householdId,
      _patch: patch,
    });
    if (error) throw error;
  },

  /** Returns the new child's person id. */
  async addChild(householdId: string, child: PortalPatch): Promise<string> {
    const { data, error } = await church().rpc("add_child_to_household", {
      _household_id: householdId,
      _child: child,
    });
    if (error) throw error;
    return data as unknown as string;
  },

  async updateChild(childId: string, patch: PortalPatch): Promise<void> {
    const { error } = await church().rpc("update_my_child", {
      _child_id: childId,
      _patch: patch,
    });
    if (error) throw error;
  },

  async ministryOptions(organizationId: string): Promise<MinistryOption[]> {
    const { data, error } = await church().rpc("my_ministry_options", {
      _organization_id: organizationId,
    });
    if (error) throw error;
    return (data ?? []) as unknown as MinistryOption[];
  },

  async joinMinistry(ministryId: string): Promise<void> {
    const { error } = await church().rpc("join_ministry", { _ministry_id: ministryId });
    if (error) throw error;
  },

  async leaveMinistry(assignmentId: string): Promise<void> {
    const { error } = await church().rpc("leave_ministry", {
      _assignment_id: assignmentId,
    });
    if (error) throw error;
  },

  async groupOptions(organizationId: string): Promise<GroupOption[]> {
    const { data, error } = await church().rpc("my_group_options", {
      _organization_id: organizationId,
    });
    if (error) throw error;
    return (data ?? []) as unknown as GroupOption[];
  },

  async joinGroup(groupId: string): Promise<void> {
    const { error } = await church().rpc("join_group", { _group_id: groupId });
    if (error) throw error;
  },

  async leaveGroup(membershipId: string): Promise<void> {
    const { error } = await church().rpc("leave_group", { _membership_id: membershipId });
    if (error) throw error;
  },

  async statement(organizationId: string, year: number): Promise<Statement> {
    const { data, error } = await church().rpc("my_statement", {
      _organization_id: organizationId,
      _year: year,
    });
    if (error) throw error;
    return data as unknown as Statement;
  },

  /*
   * The one call here that is not an RPC.
   *
   * public.events carries "Members read only published events" (RESTRICTIVE,
   * 20260321001600) and public.rooms carries an org-scoped read for
   * authenticated users, so the filter below is a convenience, not the
   * security boundary — a member who hand-crafted this request without the
   * status filter would still get published rows and nothing else. Said
   * plainly because a `.eq("status", "published")` in client code usually is
   * the only thing standing between a reader and a draft, and here it is not.
   *
   * `ends_at` rather than `starts_at` is the cutoff: an event that began an
   * hour ago and runs till four is still on, and dropping it at its start time
   * would take the service off the page part-way through the service.
   */
  async upcomingEvents(organizationId: string, limit = 4): Promise<UpcomingEvent[]> {
    const { data, error } = await supabase
      .from("events")
      .select("id, title, description, starts_at, ends_at, rooms(name)")
      .eq("organization_id", organizationId)
      .eq("status", "published")
      .gte("ends_at", new Date().toISOString())
      .order("starts_at", { ascending: true })
      .limit(limit);
    if (error) throw error;
    return (data ?? []).map((row) => {
      const { rooms, ...event } = row as typeof row & {
        rooms: { name: string } | { name: string }[] | null;
      };
      return {
        ...event,
        // PostgREST returns a to-one embed as an object, but types it as an
        // array often enough that both shapes are worth surviving.
        room_name: Array.isArray(rooms) ? (rooms[0]?.name ?? null) : (rooms?.name ?? null),
      } as UpcomingEvent;
    });
  },
};
