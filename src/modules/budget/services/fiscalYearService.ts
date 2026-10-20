/**
 * Fiscal Year service - handles fiscal year management
 * Uses the 'budget' schema
 */

import { supabase } from "@/integrations/supabase/client";
import type {
  FiscalYear,
  FiscalYearInsert,
  FiscalYearUpdate,
  RequestSeason,
} from "../types";

// Helper to get the budget schema client
const budgetSchema = () => supabase.schema("budget");

export const fiscalYearService = {
  /**
   * List all fiscal years for an organization
   */
  async list(organizationId: string): Promise<FiscalYear[]> {
    const { data, error } = await budgetSchema()
      .from("fiscal_years")
      .select("*")
      .eq("organization_id", organizationId)
      .order("year", { ascending: false });

    if (error) throw error;
    return data || [];
  },

  /**
   * Get the active fiscal year for an organization
   */
  async getActive(organizationId: string): Promise<FiscalYear | null> {
    const { data, error } = await budgetSchema()
      .from("fiscal_years")
      .select("*")
      .eq("organization_id", organizationId)
      .eq("is_active", true)
      .single();

    if (error && error.code !== "PGRST116") throw error;
    return data;
  },

  /**
   * Get a single fiscal year by ID
   */
  async get(fiscalYearId: string): Promise<FiscalYear | null> {
    const { data, error } = await budgetSchema()
      .from("fiscal_years")
      .select("*")
      .eq("id", fiscalYearId)
      .single();

    if (error) throw error;
    return data;
  },

  /**
   * Create a new fiscal year
   */
  async create(fiscalYearData: FiscalYearInsert): Promise<FiscalYear> {
    const { data, error } = await budgetSchema()
      .from("fiscal_years")
      .insert(fiscalYearData)
      .select()
      .single();

    if (error) throw error;
    return data;
  },

  /**
   * Update a fiscal year
   */
  async update(fiscalYearId: string, fiscalYearData: FiscalYearUpdate): Promise<FiscalYear> {
    const { data, error } = await budgetSchema()
      .from("fiscal_years")
      .update({
        ...fiscalYearData,
        updated_at: new Date().toISOString(),
      })
      .eq("id", fiscalYearId)
      .select()
      .single();

    if (error) throw error;
    return data;
  },

  /**
   * Set a fiscal year as active (and deactivate others)
   */
  async setActive(fiscalYearId: string, organizationId: string): Promise<FiscalYear> {
    // Deactivate all other fiscal years
    await budgetSchema()
      .from("fiscal_years")
      .update({ is_active: false, updated_at: new Date().toISOString() })
      .eq("organization_id", organizationId)
      .neq("id", fiscalYearId);

    // Activate the selected one
    const { data, error } = await budgetSchema()
      .from("fiscal_years")
      .update({
        is_active: true,
        updated_at: new Date().toISOString(),
      })
      .eq("id", fiscalYearId)
      .select()
      .single();

    if (error) throw error;
    return data;
  },

  /**
   * Delete a fiscal year
   */
  async delete(fiscalYearId: string): Promise<void> {
    const { error } = await budgetSchema()
      .from("fiscal_years")
      .delete()
      .eq("id", fiscalYearId);

    if (error) throw error;
  },

  /**
   * Get fiscal year by year number
   */
  async getByYear(organizationId: string, year: number): Promise<FiscalYear | null> {
    const { data, error } = await budgetSchema()
      .from("fiscal_years")
      .select("*")
      .eq("organization_id", organizationId)
      .eq("year", year)
      .single();

    if (error && error.code !== "PGRST116") throw error;
    return data;
  },

  /**
   * Where budget requests stand for this branch: which year is in season,
   * whether it is open, and whether the caller may work outside it.
   */
  async getRequestSeason(organizationId: string): Promise<RequestSeason | null> {
    const { data, error } = await budgetSchema().rpc("request_season", {
      _organization_id: organizationId,
    });

    if (error) throw error;
    return (data?.[0] as RequestSeason | undefined) ?? null;
  },
};
