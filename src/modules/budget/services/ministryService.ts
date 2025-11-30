/**
 * Ministry service - handles ministry-related API operations
 * Uses the 'budget' schema
 */

import { supabase } from "@/integrations/supabase/client";
import type {
  Ministry,
  MinistryInsert,
  MinistryUpdate,
  MinistryWithLeader,
} from "../types";

// Helper to get the budget schema client
const budgetSchema = () => supabase.schema("budget");

export const ministryService = {
  /**
   * List all ministries for an organization
   */
  async list(organizationId: string): Promise<MinistryWithLeader[]> {
    const { data, error } = await budgetSchema()
      .from("ministries")
      .select("*")
      .eq("organization_id", organizationId)
      .eq("is_active", true)
      .order("name");

    if (error) throw error;
    if (!data || data.length === 0) return [];

    // Collect unique leader IDs and batch fetch profiles in a single query
    const leaderIds = [...new Set(data.map((m) => m.leader_id).filter((id): id is string => !!id))];

    const leadersMap: Record<string, { id: string; full_name: string; email: string }> = {};

    if (leaderIds.length > 0) {
      const { data: profiles } = await supabase
        .from("profiles")
        .select("id, full_name, email")
        .in("id", leaderIds);

      if (profiles) {
        for (const profile of profiles) {
          leadersMap[profile.id] = profile;
        }
      }
    }

    return data.map((ministry) => ({
      ...ministry,
      leader: ministry.leader_id ? leadersMap[ministry.leader_id] || null : null,
    })) as MinistryWithLeader[];
  },

  /**
   * Get a single ministry by ID
   */
  async get(ministryId: string): Promise<MinistryWithLeader | null> {
    const { data, error } = await budgetSchema()
      .from("ministries")
      .select("*")
      .eq("id", ministryId)
      .single();

    if (error) throw error;
    if (!data) return null;

    let leader = null;
    if (data.leader_id) {
      const { data: profile } = await supabase
        .from("profiles")
        .select("id, full_name, email")
        .eq("id", data.leader_id)
        .single();
      leader = profile;
    }

    return {
      ...data,
      leader,
    } as MinistryWithLeader;
  },

  /**
   * Create a new ministry
   */
  async create(ministryData: MinistryInsert): Promise<Ministry> {
    const { data, error } = await budgetSchema()
      .from("ministries")
      .insert(ministryData)
      .select()
      .single();

    if (error) throw error;
    return data;
  },

  /**
   * Update a ministry
   */
  async update(ministryId: string, ministryData: MinistryUpdate): Promise<Ministry> {
    const { data, error } = await budgetSchema()
      .from("ministries")
      .update({
        ...ministryData,
        updated_at: new Date().toISOString(),
      })
      .eq("id", ministryId)
      .select()
      .single();

    if (error) throw error;
    return data;
  },

  /**
   * Delete a ministry (soft delete by setting is_active to false)
   */
  async delete(ministryId: string): Promise<void> {
    const { error } = await budgetSchema()
      .from("ministries")
      .update({ is_active: false, updated_at: new Date().toISOString() })
      .eq("id", ministryId);

    if (error) throw error;
  },

  /**
   * Get ministries led by a specific user
   */
  async getByLeader(userId: string): Promise<MinistryWithLeader[]> {
    const { data, error } = await budgetSchema()
      .from("ministries")
      .select("*")
      .eq("leader_id", userId)
      .eq("is_active", true);

    if (error) throw error;

    return (data || []).map((ministry) => ({
      ...ministry,
      leader: null, // We already know the leader is the requesting user
    }));
  },

  /**
   * Assign a leader to a ministry
   */
  async assignLeader(ministryId: string, leaderId: string): Promise<Ministry> {
    const { data, error } = await budgetSchema()
      .from("ministries")
      .update({
        leader_id: leaderId,
        updated_at: new Date().toISOString(),
      })
      .eq("id", ministryId)
      .select()
      .single();

    if (error) throw error;
    return data;
  },

  /**
   * Remove leader from a ministry
   */
  async removeLeader(ministryId: string): Promise<Ministry> {
    const { data, error } = await budgetSchema()
      .from("ministries")
      .update({
        leader_id: null,
        updated_at: new Date().toISOString(),
      })
      .eq("id", ministryId)
      .select()
      .single();

    if (error) throw error;
    return data;
  },
};
