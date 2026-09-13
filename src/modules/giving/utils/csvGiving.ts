/**
 * Column mapping for the giving import.
 *
 * Mirrors src/modules/members/utils/csvMapping.ts in shape and intent: pure
 * functions that decide what a spreadsheet column MEANS, leaving the file
 * reading to the page and the writing to the RPC.
 *
 * The aliases below are the header spellings that Stripe, PayPal, Zelle and
 * Venmo actually export, plus the ones a hand-kept offering spreadsheet tends
 * to use. Anything unrecognised is left on "ignore" for a human to set — a
 * wrong guess about which column is the amount is not a guess worth making.
 */

import { parseMoneyToCents, parseDateToIso } from "./money";

export const GIVING_TARGETS = [
  "received_on",
  "amount",
  "fee",
  "donor_name",
  "donor_email",
  "donor_phone",
  "external_reference",
  "fund_code",
  "method",
  "check_number",
  "note",
] as const;

export type GivingTarget = (typeof GIVING_TARGETS)[number];
export const IGNORE = "__ignore__";
export type GivingMappingValue = GivingTarget | typeof IGNORE;
export type GivingColumnMapping = Record<string, GivingMappingValue>;

export const GIVING_TARGET_LABELS: Record<GivingTarget, string> = {
  received_on: "Date received",
  amount: "Amount",
  fee: "Processor fee",
  donor_name: "Donor name",
  donor_email: "Donor email",
  donor_phone: "Donor phone",
  external_reference: "Transaction reference",
  fund_code: "Fund",
  method: "Payment method",
  check_number: "Cheque number",
  note: "Note / memo",
};

/**
 * Only these three are needed to import a file. Everything else improves the
 * match rate or the receipt; without a date and an amount there is no gift,
 * and without a reference the import cannot be re-run safely.
 */
export const REQUIRED_TARGETS: GivingTarget[] = ["received_on", "amount"];

const HEADER_ALIASES: Record<string, GivingTarget> = {
  // Dates
  date: "received_on",
  datetime: "received_on",
  datetimeutc: "received_on",
  createdutc: "received_on",
  created: "received_on",
  createddateutc: "received_on",
  transactiondate: "received_on",
  paymentdate: "received_on",
  settlementdate: "received_on",
  receiveddate: "received_on",
  datereceived: "received_on",
  gifted: "received_on",
  giftdate: "received_on",

  // Amounts. "converted_amount" is Stripe's; "gross" is PayPal's.
  amount: "amount",
  grossamount: "amount",
  gross: "amount",
  convertedamount: "amount",
  amountusd: "amount",
  total: "amount",
  totalamount: "amount",
  paymentamount: "amount",
  giftamount: "amount",
  value: "amount",

  // Fees
  fee: "fee",
  fees: "fee",
  feeamount: "fee",
  convertedamountrefunded: "fee",
  processingfee: "fee",
  stripefee: "fee",

  // Names
  name: "donor_name",
  donorname: "donor_name",
  customername: "donor_name",
  customer: "donor_name",
  fromname: "donor_name",
  sendername: "donor_name",
  sender: "donor_name",
  payername: "donor_name",
  payer: "donor_name",
  billingname: "donor_name",
  fullname: "donor_name",
  cardholdername: "donor_name",

  // Email
  email: "donor_email",
  donoremail: "donor_email",
  customeremail: "donor_email",
  payeremail: "donor_email",
  fromemail: "donor_email",
  billingemail: "donor_email",
  emailaddress: "donor_email",

  // Phone
  phone: "donor_phone",
  phonenumber: "donor_phone",
  donorphone: "donor_phone",
  customerphone: "donor_phone",
  mobile: "donor_phone",

  // References
  id: "external_reference",
  transactionid: "external_reference",
  paymentintentid: "external_reference",
  chargeid: "external_reference",
  balancetransactionid: "external_reference",
  reference: "external_reference",
  referenceid: "external_reference",
  confirmationnumber: "external_reference",
  confirmation: "external_reference",
  receiptnumber: "external_reference",

  // The rest
  fund: "fund_code",
  funds: "fund_code",
  designation: "fund_code",
  category: "fund_code",
  purpose: "fund_code",
  method: "method",
  paymentmethod: "method",
  type: "method",
  paymenttype: "method",
  checknumber: "check_number",
  chequenumber: "check_number",
  check: "check_number",
  note: "note",
  notes: "note",
  memo: "note",
  description: "note",
  message: "note",
};

/** Lowercase, strip everything that is not a letter or digit. */
export function normalizeHeader(header: string): string {
  return header.toLowerCase().replace(/[^a-z0-9]/g, "");
}

export function autoMapGivingColumns(headers: string[]): GivingColumnMapping {
  const mapping: GivingColumnMapping = {};
  const taken = new Set<GivingTarget>();

  for (const header of headers) {
    const target = HEADER_ALIASES[normalizeHeader(header)];
    // First column wins a target. A Stripe export has both "id" and
    // "balance_transaction_id"; mapping both to the reference would make the
    // second one silently overwrite the first.
    if (target && !taken.has(target)) {
      mapping[header] = target;
      taken.add(target);
    } else {
      mapping[header] = IGNORE;
    }
  }
  return mapping;
}

export function missingRequired(mapping: GivingColumnMapping): GivingTarget[] {
  const mapped = new Set(Object.values(mapping));
  return REQUIRED_TARGETS.filter((t) => !mapped.has(t));
}

/** One row, in the shape church.giving_import_dry_run expects. */
export interface GivingImportRow {
  row_number: number;
  received_on: string | null;
  amount_cents: number | null;
  fee_cents: number;
  donor_name: string | null;
  donor_email: string | null;
  donor_phone: string | null;
  external_reference: string | null;
  fund_code: string;
  method: string;
  check_number: string | null;
  note: string | null;
  /** Filled in by the operator after the dry run, never by the file. */
  person_id?: string | null;
}

export interface GivingRowDefaults {
  fundCode: string;
  method: string;
}

const METHOD_ALIASES: Record<string, string> = {
  card: "card",
  creditcard: "card",
  debitcard: "card",
  visa: "card",
  mastercard: "card",
  amex: "card",
  charge: "card",
  ach: "ach",
  banktransfer: "ach",
  bank: "ach",
  directdebit: "ach",
  cash: "cash",
  check: "check",
  cheque: "check",
  zelle: "zelle",
  paypal: "paypal",
  venmo: "venmo",
  inkind: "in_kind",
};

/**
 * A row is returned even when it is unusable — with nulls where the value
 * could not be read — because the dry-run table has to be able to show the
 * operator WHICH line is wrong. Dropping bad rows here would leave them
 * silently absent from a file they can see has forty lines in it.
 */
export function applyGivingMapping(
  raw: Record<string, string>,
  mapping: GivingColumnMapping,
  rowNumber: number,
  defaults: GivingRowDefaults
): GivingImportRow {
  const get = (target: GivingTarget): string | null => {
    for (const [header, mapped] of Object.entries(mapping)) {
      if (mapped === target) {
        const value = raw[header];
        return value === undefined || value === null || value.trim() === ""
          ? null
          : value.trim();
      }
    }
    return null;
  };

  const rawMethod = get("method");
  const method = rawMethod
    ? (METHOD_ALIASES[normalizeHeader(rawMethod)] ?? defaults.method)
    : defaults.method;

  const rawFund = get("fund_code");
  const fee = parseMoneyToCents(get("fee"));

  return {
    row_number: rowNumber,
    received_on: parseDateToIso(get("received_on")),
    amount_cents: parseMoneyToCents(get("amount")),
    // A negative fee is a refund line's artefact; it is not money the church
    // paid, so it does not belong in fee_cents.
    fee_cents: fee !== null && fee > 0 ? fee : 0,
    donor_name: get("donor_name"),
    donor_email: get("donor_email")?.toLowerCase() ?? null,
    donor_phone: get("donor_phone"),
    external_reference: get("external_reference"),
    fund_code: rawFund ? normalizeFundCode(rawFund) : defaults.fundCode,
    method,
    check_number: get("check_number"),
    note: get("note"),
  };
}

/** "Building Fund" and "building-fund" both mean the `building` fund. */
export function normalizeFundCode(value: string): string {
  return value
    .toLowerCase()
    .replace(/\bfund\b/g, "")
    .trim()
    .replace(/[^a-z0-9]+/g, "_")
    .replace(/^_+|_+$/g, "");
}

/**
 * Reasons a row cannot be imported, decided on the client so the operator
 * sees them before a round trip. The RPC re-checks all of it — this is a
 * courtesy, not a control.
 */
export function localRowError(row: GivingImportRow): string | null {
  if (row.received_on === null) return "Unreadable or missing date";
  if (row.amount_cents === null) return "Unreadable or missing amount";
  if (row.amount_cents <= 0) return "Amount must be greater than zero";
  return null;
}
