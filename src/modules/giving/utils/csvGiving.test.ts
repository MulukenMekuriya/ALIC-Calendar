import { describe, it, expect } from "vitest";
import {
  autoMapGivingColumns,
  applyGivingMapping,
  missingRequired,
  normalizeFundCode,
  localRowError,
  IGNORE,
  type GivingColumnMapping,
} from "./csvGiving";

const DEFAULTS = { fundCode: "general", method: "other" };

describe("autoMapGivingColumns", () => {
  it("maps a Stripe payments export", () => {
    const mapping = autoMapGivingColumns([
      "id", "Created (UTC)", "Amount", "Fee", "Customer Email", "Customer Name", "Description",
    ]);
    expect(mapping["id"]).toBe("external_reference");
    expect(mapping["Created (UTC)"]).toBe("received_on");
    expect(mapping["Amount"]).toBe("amount");
    expect(mapping["Fee"]).toBe("fee");
    expect(mapping["Customer Email"]).toBe("donor_email");
    expect(mapping["Customer Name"]).toBe("donor_name");
    expect(mapping["Description"]).toBe("note");
  });

  it("maps a PayPal export", () => {
    const mapping = autoMapGivingColumns([
      "Date", "Name", "Gross", "Fee", "Transaction ID", "From Email Address",
    ]);
    expect(mapping["Date"]).toBe("received_on");
    expect(mapping["Name"]).toBe("donor_name");
    expect(mapping["Gross"]).toBe("amount");
    expect(mapping["Transaction ID"]).toBe("external_reference");
  });

  it("gives a target to the first column that claims it, not the last", () => {
    // A real Stripe export carries both; mapping both would mean the second
    // silently overwriting the first.
    const mapping = autoMapGivingColumns(["id", "balance_transaction_id"]);
    expect(mapping["id"]).toBe("external_reference");
    expect(mapping["balance_transaction_id"]).toBe(IGNORE);
  });

  it("leaves unknown columns alone rather than guessing", () => {
    const mapping = autoMapGivingColumns(["Whatsit", "Currency"]);
    expect(mapping["Whatsit"]).toBe(IGNORE);
    expect(mapping["Currency"]).toBe(IGNORE);
  });
});

describe("missingRequired", () => {
  it("names what still has to be mapped", () => {
    expect(missingRequired({ a: "donor_name" } as GivingColumnMapping)).toEqual([
      "received_on",
      "amount",
    ]);
    expect(
      missingRequired({ a: "received_on", b: "amount" } as GivingColumnMapping)
    ).toEqual([]);
  });
});

describe("applyGivingMapping", () => {
  const mapping: GivingColumnMapping = {
    "Created (UTC)": "received_on",
    Amount: "amount",
    Fee: "fee",
    "Customer Name": "donor_name",
    "Customer Email": "donor_email",
    id: "external_reference",
    Fund: "fund_code",
    Type: "method",
  };

  it("turns a raw row into the shape the RPC wants", () => {
    const row = applyGivingMapping(
      {
        "Created (UTC)": "2026-01-04 15:04:00",
        Amount: "$150.00",
        Fee: "$4.65",
        "Customer Name": "Abebe Kebede",
        "Customer Email": "Abebe@Example.COM",
        id: "pi_3Q1234",
        Fund: "Building Fund",
        Type: "Credit Card",
      },
      mapping,
      1,
      DEFAULTS
    );
    expect(row).toMatchObject({
      row_number: 1,
      received_on: "2026-01-04",
      amount_cents: 15000,
      fee_cents: 465,
      donor_name: "Abebe Kebede",
      donor_email: "abebe@example.com",
      external_reference: "pi_3Q1234",
      fund_code: "building",
      method: "card",
    });
  });

  it("falls back to the operator's defaults for fund and method", () => {
    const row = applyGivingMapping(
      { "Created (UTC)": "2026-01-04", Amount: "25" },
      mapping,
      2,
      { fundCode: "missions", method: "zelle" }
    );
    expect(row.fund_code).toBe("missions");
    expect(row.method).toBe("zelle");
  });

  it("keeps a bad row instead of dropping it, so the operator can see it", () => {
    const row = applyGivingMapping(
      { "Created (UTC)": "not a date", Amount: "n/a" },
      mapping,
      3,
      DEFAULTS
    );
    expect(row.row_number).toBe(3);
    expect(row.received_on).toBeNull();
    expect(row.amount_cents).toBeNull();
    expect(localRowError(row)).toBe("Unreadable or missing date");
  });

  it("does not record a refund line's negative fee as a fee the church paid", () => {
    const row = applyGivingMapping(
      { "Created (UTC)": "2026-01-04", Amount: "25", Fee: "(0.30)" },
      mapping,
      4,
      DEFAULTS
    );
    expect(row.fee_cents).toBe(0);
  });

  it("flags a negative amount rather than importing it as a gift", () => {
    const row = applyGivingMapping(
      { "Created (UTC)": "2026-01-04", Amount: "(45.00)" },
      mapping,
      5,
      DEFAULTS
    );
    expect(row.amount_cents).toBe(-4500);
    expect(localRowError(row)).toBe("Amount must be greater than zero");
  });
});

describe("normalizeFundCode", () => {
  it("reduces the ways people write a fund name to one code", () => {
    expect(normalizeFundCode("Building Fund")).toBe("building");
    expect(normalizeFundCode("building")).toBe("building");
    expect(normalizeFundCode("BUILDING-FUND")).toBe("building");
    expect(normalizeFundCode("General Fund")).toBe("general");
    expect(normalizeFundCode("Missions")).toBe("missions");
  });
});
