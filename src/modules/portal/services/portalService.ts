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
} from "../types";

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
};
