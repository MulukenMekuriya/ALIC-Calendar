/**
 * Giving module types.
 *
 * Table rows come from the generated Supabase types so they cannot drift from
 * the schema. The RPC return shapes are declared by hand because several of
 * them are jsonb, which generates as `Json` and is useless to a component.
 */

import type { Tables, TablesInsert } from "@/integrations/supabase/types";

type ChurchSchema = { schema: "church" };

export type GivingFund = Tables<ChurchSchema, "giving_funds">;
export type GivingFundInsert = TablesInsert<ChurchSchema, "giving_funds">;
export type GivingBatch = Tables<ChurchSchema, "giving_batches">;
export type GivingBatchInsert = TablesInsert<ChurchSchema, "giving_batches">;
export type Donation = Tables<ChurchSchema, "donations">;
export type DonationInsert = TablesInsert<ChurchSchema, "donations">;

/** church.giving_donations — a ledger line with the names filled in. */
export interface DonationRow {
  id: string;
  received_on: string;
  amount_cents: number;
  fee_cents: number;
  method: string;
  source: string;
  fund_id: string;
  fund_name: string;
  person_id: string | null;
  donor_name: string | null;
  household_id: string | null;
  household_name: string | null;
  donor_name_raw: string | null;
  external_reference: string | null;
  check_number: string | null;
  note: string | null;
  is_tax_deductible: boolean;
  refunded_at: string | null;
  batch_id: string | null;
  batch_name: string | null;
  batch_status: string | null;
  total_count: number;
}

/** church.giving_batches_list */
export interface BatchRow {
  id: string;
  name: string;
  source: string;
  received_on: string;
  status: "open" | "posted";
  expected_total_cents: number | null;
  entered_total_cents: number;
  gift_count: number;
  unmatched_count: number;
  /** null when nobody recorded a counted total — not the same as "no variance". */
  variance_cents: number | null;
  notes: string | null;
  posted_at: string | null;
  posted_by_name: string | null;
  created_by_name: string | null;
  created_at: string;
}

/** church.giving_overview */
export interface GivingOverview {
  year: number;
  total_cents: number;
  gift_count: number;
  donor_count: number;
  unmatched_count: number;
  unmatched_cents: number;
  refunded_cents: number;
  open_batches: number;
  by_month: { month: number; total_cents: number }[];
}

/** church.giving_fund_totals */
export interface FundTotal {
  fund_id: string;
  fund_code: string;
  fund_name: string;
  total_cents: number;
  gift_count: number;
  donor_count: number;
}

/** church.giving_person_search */
export interface DonorCandidate {
  person_id: string;
  display_name: string;
  email: string | null;
  household_id: string | null;
  household_name: string | null;
}

/** church.giving_match_donor */
export interface DonorMatch extends DonorCandidate {
  phone: string | null;
  confidence: "email" | "phone" | "name" | "ambiguous" | null;
}

/** church.giving_import_dry_run */
export interface ImportPreviewRow {
  row_number: number;
  received_on: string | null;
  amount_cents: number | null;
  donor_name: string | null;
  external_reference: string | null;
  fund_code: string | null;
  matched_person_id: string | null;
  matched_name: string | null;
  match_confidence: string | null;
  is_duplicate: boolean;
  error: string | null;
}

/** church.giving_import_commit */
export interface ImportResult {
  inserted: number;
  skipped_duplicates: number;
  matched: number;
  unmatched: number;
  total_cents: number;
}

/** church.giving_statement_recipients */
export interface StatementRecipient {
  household_id: string | null;
  person_id: string | null;
  recipient_name: string;
  address_line1: string | null;
  address_line2: string | null;
  city: string | null;
  state: string | null;
  postal_code: string | null;
  email: string | null;
  total_cents: number;
  deductible_cents: number;
  gift_count: number;
}

/** church.giving_statement */
export interface Statement {
  year: number;
  organization_id: string;
  household_id: string | null;
  person_id: string | null;
  recipient_name: string | null;
  address: {
    line1: string | null;
    line2: string | null;
    city: string | null;
    state: string | null;
    postal_code: string | null;
  } | null;
  total_cents: number;
  deductible_cents: number;
  gift_count: number;
  by_fund: { fund_name: string; total_cents: number; gift_count: number }[];
  lines: {
    received_on: string;
    amount_cents: number;
    method: string;
    check_number: string | null;
    fund_name: string;
    given_by: string | null;
    is_tax_deductible: boolean;
  }[];
}

/** church.my_giving — the portal's own-giving view. */
export interface MyGift {
  id: string;
  received_on: string;
  amount_cents: number;
  method: string;
  fund_name: string;
  is_tax_deductible: boolean;
  note: string | null;
}

export interface MyGivingYear {
  tax_year: number;
  total_cents: number;
  gift_count: number;
}

export interface DonationFilters {
  year?: number | null;
  search?: string;
  fund_id?: string | null;
  batch_id?: string | null;
  only_unmatched?: boolean;
}

export const DONATION_PAGE_SIZE = 50;

/** church.donations.method, in the order the entry form offers them. */
export const PAYMENT_METHODS = [
  "cash",
  "check",
  "zelle",
  "card",
  "ach",
  "paypal",
  "venmo",
  "in_kind",
  "other",
] as const;

/** church.giving_batches.source. */
export const BATCH_SOURCES = [
  "cash",
  "check",
  "zelle",
  "stripe",
  "paypal",
  "venmo",
  "ach",
  "other",
] as const;
