/**
 * Controlled reference data.
 *
 * These are tables rather than enums because the spec requires ministries,
 * roles, group types, age brackets and statuses to be configuration rather
 * than hard-coded. They change rarely, so callers cache them aggressively.
 */

import { supabase } from "@/integrations/supabase/client";
import type {
  MembershipStatus,
  MinistryRole,
  RelationshipType,
  SchoolGrade,
  KidsAgeBand,
  GroupType,
} from "../types";

const church = () => supabase.schema("church");
const budget = () => supabase.schema("budget");

export interface MinistryOption {
  id: string;
  name: string;
}

export const referenceService = {
  async membershipStatuses(organizationId: string): Promise<MembershipStatus[]> {
    const { data, error } = await church()
      .from("membership_statuses")
      .select("*")
      .eq("organization_id", organizationId)
      .eq("is_active", true)
      .order("sort_order");
    if (error) throw error;
    return data || [];
  },

  async ministryRoles(organizationId: string): Promise<MinistryRole[]> {
    const { data, error } = await church()
      .from("ministry_roles")
      .select("*")
      .eq("organization_id", organizationId)
      .eq("is_active", true)
      .order("sort_order");
    if (error) throw error;
    return data || [];
  },

  async relationshipTypes(organizationId: string): Promise<RelationshipType[]> {
    const { data, error } = await church()
      .from("relationship_types")
      .select("*")
      .eq("organization_id", organizationId)
      .eq("is_active", true)
      .order("sort_order");
    if (error) throw error;
    return data || [];
  },

  async schoolGrades(organizationId: string): Promise<SchoolGrade[]> {
    const { data, error } = await church()
      .from("school_grades")
      .select("*")
      .eq("organization_id", organizationId)
      .eq("is_active", true)
      .order("sort_order");
    if (error) throw error;
    return data || [];
  },

  async kidsAgeBands(organizationId: string): Promise<KidsAgeBand[]> {
    const { data, error } = await church()
      .from("kids_age_bands")
      .select("*")
      .eq("organization_id", organizationId)
      .eq("is_active", true)
      .order("sort_order");
    if (error) throw error;
    return data || [];
  },

  async groupTypes(organizationId: string): Promise<GroupType[]> {
    const { data, error } = await church()
      .from("group_types")
      .select("*")
      .eq("organization_id", organizationId)
      .eq("is_active", true)
      .order("sort_order");
    if (error) throw error;
    return data || [];
  },

  /**
   * Ministries a member can be assigned to, or express an interest in.
   *
   * Still the budget module's list — the church maintains one set of
   * ministries — but filtered on is_serving_ministry (20260322030000). That
   * column exists because budget.ministries is also the cost-centre list:
   * "Emu - Admin Office" carries 26 expense requests and nobody volunteers
   * there, and "VA Test" is not a ministry at all. Both have to keep working
   * in the budget forms, which is why this is a second flag rather than
   * is_active.
   *
   * The budget module has its own useMinistries and is deliberately not
   * filtered — an expense still has to be bookable against a cost centre.
   *
   * NAMES ARE THE CHURCH'S, NOT THE COST CENTRE'S. `name` here is the name
   * the church itself uses, via churchMinistryNames below, so this list reads
   * exactly like the "Serving in" column of the Breeze export the ministries
   * came from: 29 names, every one of them "MD ...". The budget row keeps its
   * own name, because budget screens key off it (ministryJustifications.ts).
   */
  async ministries(organizationId: string): Promise<MinistryOption[]> {
    const [rows, churchNames] = await Promise.all([
      budget()
        .from("ministries")
        .select("id, name")
        .eq("organization_id", organizationId)
        .eq("is_active", true)
        .eq("is_serving_ministry", true)
        .then(({ data, error }) => {
          if (error) throw error;
          return data || [];
        }),
      referenceService.churchMinistryNames({ organizationId }),
    ]);
    return rows
      .map((m) => ({ id: m.id, name: churchNames.get(m.id) ?? m.name }))
      .sort((a, b) => a.name.localeCompare(b.name));
  },

  /**
   * What the church calls each ministry, by ministry id.
   *
   * church.ministry_aliases holds every spelling the church uses for a
   * ministry pointed at one row (20260320000500) — for MD that is the 29
   * names out of the export, mapped onto budget.ministries rows that were
   * named inconsistently long before ("Alic MD Prayer", "ALIC MD Worship").
   * The alias is the church's word for it, so that is what the members module
   * shows.
   *
   * ONE alias only. The table's other job is absorbing misspellings so next
   * year's import resolves them instead of creating ministries from typos; a
   * ministry carrying several spellings has no obvious display name among
   * them, so it keeps the name on its own row rather than showing whichever
   * one sorted first. Returns a Map, so a ministry can never appear twice.
   */
  async churchMinistryNames(scope: {
    organizationId?: string;
    ministryIds?: string[];
  }): Promise<Map<string, string>> {
    if (scope.ministryIds?.length === 0) return new Map();
    let query = church().from("ministry_aliases").select("alias, ministry_id");
    if (scope.organizationId) query = query.eq("organization_id", scope.organizationId);
    if (scope.ministryIds) query = query.in("ministry_id", scope.ministryIds);
    const { data, error } = await query;
    if (error) throw error;

    const byMinistry = new Map<string, string[]>();
    for (const row of data || []) {
      const list = byMinistry.get(row.ministry_id) ?? [];
      list.push(row.alias);
      byMinistry.set(row.ministry_id, list);
    }
    return new Map(
      [...byMinistry.entries()]
        .filter(([, aliases]) => aliases.length === 1)
        .map(([id, aliases]) => [id, aliases[0]])
    );
  },
};
