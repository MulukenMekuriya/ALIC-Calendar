/**
 * Ministry Flag service - handles ministry flags for advance payment tracking
 * Uses the 'budget' schema
 */

import { supabase } from "@/integrations/supabase/client";
import type {
  MinistryFlag,
  MinistryFlagInsert,
  MinistryFlagWithRelations,
} from "../types";

const budgetSchema = () => supabase.schema("budget");

export const ministryFlagService = {
  /**
   * List all flags for an organization (optionally filter by resolved status or ministry)
   */
  async list(
    organizationId: string,
    options?: { unresolvedOnly?: boolean; ministryId?: string }
  ): Promise<MinistryFlagWithRelations[]> {
    let query = budgetSchema()
      .from("ministry_flags")
      .select(
        `
        *,
        ministries!ministry_id(id, name, description),
        expense_requests!expense_request_id(id, title, amount, status)
      `
      )
      .eq("organization_id", organizationId)
      .order("created_at", { ascending: false });

    if (options?.unresolvedOnly) {
      query = query.is("resolved_at", null);
    }
    if (options?.ministryId) {
      query = query.eq("ministry_id", options.ministryId);
    }

    const { data, error } = await query;
    if (error) throw error;

    return ((data as unknown[]) || []).map((flag: any) => ({
      ...flag,
      ministry: flag.ministries,
      expense_request: flag.expense_requests || null,
    })) as MinistryFlagWithRelations[];
  },

  /**
   * Get unresolved flags for a specific ministry
   */
  async getUnresolvedForMinistry(
    ministryId: string
  ): Promise<MinistryFlag[]> {
    const { data, error } = await budgetSchema()
      .from("ministry_flags")
      .select("*")
      .eq("ministry_id", ministryId)
      .is("resolved_at", null)
      .order("created_at", { ascending: false });

    if (error) throw error;
    return (data || []) as unknown as MinistryFlag[];
  },

  /**
   * Get blocked ministry IDs for an organization (batch check)
   */
  async getBlockedMinistryIds(organizationId: string): Promise<string[]> {
    const { data, error } = await budgetSchema()
      .from("ministry_flags")
      .select("ministry_id")
      .eq("organization_id", organizationId)
      .is("resolved_at", null);

    if (error) throw error;
    return [
      ...new Set(
        ((data as unknown[]) || []).map((f: any) => f.ministry_id as string)
      ),
    ];
  },

  /**
   * Create a new flag
   */
  async create(flagData: MinistryFlagInsert): Promise<MinistryFlag> {
    const { data, error } = await budgetSchema()
      .from("ministry_flags")
      .insert(flagData as any)
      .select()
      .single();

    if (error) throw error;
    return data as unknown as MinistryFlag;
  },

  /**
   * Resolve a flag
   */
  async resolve(
    flagId: string,
    resolvedBy: string,
    resolvedByName: string,
    resolutionNotes?: string
  ): Promise<MinistryFlag> {
    const { data, error } = await budgetSchema()
      .from("ministry_flags")
      .update({
        resolved_at: new Date().toISOString(),
        resolved_by: resolvedBy,
        resolved_by_name: resolvedByName,
        resolution_notes: resolutionNotes || null,
      } as any)
      .eq("id", flagId)
      .select()
      .single();

    if (error) throw error;
    return data as unknown as MinistryFlag;
  },

  /**
   * Delete a flag (admin only)
   */
  async delete(flagId: string): Promise<void> {
    const { error } = await budgetSchema()
      .from("ministry_flags")
      .delete()
      .eq("id", flagId);

    if (error) throw error;
  },
};
