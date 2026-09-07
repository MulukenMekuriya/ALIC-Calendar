/**
 * Giving data access.
 *
 * Follows the members module's service convention: a plain object of async
 * methods, `throw error` on failure, PGRST116 tolerated on single-row lookups.
 *
 * Note how little of this is a direct table query. Every list goes through a
 * SECURITY DEFINER function, because a giving_admin holds no members grant and
 * so cannot read church.people — see the header of 20260322000300 for why that
 * is deliberate rather than an oversight.
 */

import { supabase } from "@/integrations/supabase/client";
import type {
  GivingFund,
  GivingBatch,
  DonationInsert,
  DonationRow,
  BatchRow,
  GivingOverview,
  FundTotal,
  DonorCandidate,
  ImportPreviewRow,
  ImportResult,
  StatementRecipient,
  Statement,
  MyGift,
  MyGivingYear,
  DonationFilters,
} from "../types";
import { DONATION_PAGE_SIZE } from "../types";
import type { GivingImportRow } from "../utils/csvGiving";

const church = () => supabase.schema("church");
const NO_ROWS = "PGRST116";

export interface DonationListResult {
  rows: DonationRow[];
  total: number;
}

export const givingService = {
  // -------------------------------------------------------------------------
  // Funds
  // -------------------------------------------------------------------------
  async listFunds(organizationId: string, includeInactive = false): Promise<GivingFund[]> {
    let query = church()
      .from("giving_funds")
      .select("*")
      .eq("organization_id", organizationId)
      .order("sort_order")
      .order("name");
    if (!includeInactive) query = query.eq("is_active", true);

    const { data, error } = await query;
    if (error) throw error;
    return data ?? [];
  },

  async createFund(fund: {
    organization_id: string;
    code: string;
    name: string;
    description?: string | null;
    is_tax_deductible?: boolean;
  }): Promise<GivingFund> {
    const { data, error } = await church()
      .from("giving_funds")
      .insert(fund)
      .select()
      .single();
    if (error) throw error;
    return data;
  },

  async setFundActive(fundId: string, isActive: boolean): Promise<void> {
    const { error } = await church()
      .from("giving_funds")
      .update({ is_active: isActive, updated_at: new Date().toISOString() })
      .eq("id", fundId);
    if (error) throw error;
  },

  // -------------------------------------------------------------------------
  // The ledger
  // -------------------------------------------------------------------------
  async listDonations(
    organizationId: string,
    filters: DonationFilters = {},
    page = 0,
    pageSize = DONATION_PAGE_SIZE
  ): Promise<DonationListResult> {
    const { data, error } = await church().rpc("giving_donations", {
      _organization_id: organizationId,
      _year: filters.year ?? null,
      _search: filters.search?.trim() || null,
      _fund_id: filters.fund_id ?? null,
      _batch_id: filters.batch_id ?? null,
      _only_unmatched: filters.only_unmatched ?? false,
      _limit: pageSize,
      _offset: page * pageSize,
    });
    if (error) throw error;

    const rows = (data ?? []) as unknown as DonationRow[];
    // total_count is repeated on every row by the window in the function; an
    // empty page legitimately means zero.
    return { rows, total: rows.length > 0 ? Number(rows[0].total_count) : 0 };
  },

  async recordDonation(donation: DonationInsert): Promise<void> {
    // household_id and created_by_name are filled by church.donation_defaults;
    // sending them from here would only give them a chance to disagree.
    const { error } = await church().from("donations").insert(donation);
    if (error) throw error;
  },

  /** Attach a donor to a gift that arrived without one. */
  async setDonor(donationId: string, personId: string | null): Promise<void> {
    const { error } = await church()
      .from("donations")
      .update({
        person_id: personId,
        // Cleared so the BEFORE trigger recomputes it from the new person.
        household_id: null,
        updated_at: new Date().toISOString(),
      })
      .eq("id", donationId);
    if (error) throw error;
  },

  async refundDonation(donationId: string, reason: string): Promise<void> {
    const { error } = await church()
      .from("donations")
      .update({
        refunded_at: new Date().toISOString(),
        refunded_reason: reason,
        updated_at: new Date().toISOString(),
      })
      .eq("id", donationId);
    if (error) throw error;
  },

  // -------------------------------------------------------------------------
  // Batches
  // -------------------------------------------------------------------------
  async listBatches(organizationId: string, limit = 50): Promise<BatchRow[]> {
    const { data, error } = await church().rpc("giving_batches_list", {
      _organization_id: organizationId,
      _limit: limit,
    });
    if (error) throw error;
    return (data ?? []) as unknown as BatchRow[];
  },

  async createBatch(batch: {
    organization_id: string;
    name: string;
    source: string;
    received_on: string;
    expected_total_cents: number | null;
    notes?: string | null;
  }): Promise<GivingBatch> {
    const { data, error } = await church()
      .from("giving_batches")
      .insert(batch)
      .select()
      .single();
    if (error) throw error;
    return data;
  },

  /** Refuses in the database when the entered total disagrees with the count. */
  async postBatch(batchId: string): Promise<{ total_cents: number; gift_count: number }> {
    const { data, error } = await church().rpc("post_giving_batch", {
      _batch_id: batchId,
    });
    if (error) throw error;
    return data as unknown as { total_cents: number; gift_count: number };
  },

  // -------------------------------------------------------------------------
  // Reporting
  // -------------------------------------------------------------------------
  async overview(organizationId: string, year: number): Promise<GivingOverview> {
    const { data, error } = await church().rpc("giving_overview", {
      _organization_id: organizationId,
      _year: year,
    });
    if (error) throw error;
    return data as unknown as GivingOverview;
  },

  async fundTotals(organizationId: string, year: number): Promise<FundTotal[]> {
    const { data, error } = await church().rpc("giving_fund_totals", {
      _organization_id: organizationId,
      _year: year,
    });
    if (error) throw error;
    return (data ?? []) as unknown as FundTotal[];
  },

  // -------------------------------------------------------------------------
  // Donors
  // -------------------------------------------------------------------------
  async searchDonors(organizationId: string, term: string): Promise<DonorCandidate[]> {
    // The function returns nothing below three characters; short-circuit so a
    // one-letter keystroke does not become a round trip.
    if (term.trim().length < 3) return [];
    const { data, error } = await church().rpc("giving_person_search", {
      _organization_id: organizationId,
      _term: term.trim(),
      _limit: 15,
    });
    if (error) throw error;
    return (data ?? []) as unknown as DonorCandidate[];
  },

  // -------------------------------------------------------------------------
  // Import
  // -------------------------------------------------------------------------
  async importDryRun(
    organizationId: string,
    rows: GivingImportRow[]
  ): Promise<ImportPreviewRow[]> {
    const { data, error } = await church().rpc("giving_import_dry_run", {
      _organization_id: organizationId,
      _rows: rows as never,
    });
    if (error) throw error;
    return (data ?? []) as unknown as ImportPreviewRow[];
  },

  async importCommit(
    organizationId: string,
    batchId: string | null,
    rows: GivingImportRow[]
  ): Promise<ImportResult> {
    const { data, error } = await church().rpc("giving_import_commit", {
      _organization_id: organizationId,
      _batch_id: batchId,
      _rows: rows as never,
    });
    if (error) throw error;
    return data as unknown as ImportResult;
  },

  // -------------------------------------------------------------------------
  // Statements
  // -------------------------------------------------------------------------
  async statementRecipients(
    organizationId: string,
    year: number,
    minCents = 1
  ): Promise<StatementRecipient[]> {
    const { data, error } = await church().rpc("giving_statement_recipients", {
      _organization_id: organizationId,
      _year: year,
      _min_cents: minCents,
    });
    if (error) throw error;
    return (data ?? []) as unknown as StatementRecipient[];
  },

  async statement(
    organizationId: string,
    year: number,
    householdId: string | null,
    personId: string | null
  ): Promise<Statement> {
    const { data, error } = await church().rpc("giving_statement", {
      _organization_id: organizationId,
      _year: year,
      _household_id: householdId,
      _person_id: personId,
    });
    if (error) throw error;
    return data as unknown as Statement;
  },

  // -------------------------------------------------------------------------
  // The member's own giving
  // -------------------------------------------------------------------------
  async myGiving(year: number | null): Promise<MyGift[]> {
    const { data, error } = await church().rpc("my_giving", { _year: year });
    if (error && error.code !== NO_ROWS) throw error;
    return (data ?? []) as unknown as MyGift[];
  },

  async myGivingYears(): Promise<MyGivingYear[]> {
    const { data, error } = await church().rpc("my_giving_years");
    if (error && error.code !== NO_ROWS) throw error;
    return (data ?? []) as unknown as MyGivingYear[];
  },
};
