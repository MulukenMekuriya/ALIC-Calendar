import { describe, it, expect } from "vitest";
import { buildStatementDocument, type StatementChurchInfo } from "./statementTemplate";
import type { Statement } from "../types";

const CHURCH: StatementChurchInfo = {
  name: "Addis Lidet International Church",
  addressLines: ["11961 Tech Rd", "Silver Spring, MD 20906"],
  ein: "12-3456789",
  email: "info@addislidet.info",
};

const base: Statement = {
  year: 2026,
  organization_id: "org",
  household_id: "hh",
  person_id: null,
  recipient_name: "The Kebede Household",
  address: {
    line1: "11961 Tech Rd",
    line2: null,
    city: "Silver Spring",
    state: "MD",
    postal_code: "20906",
  },
  total_cents: 30000,
  deductible_cents: 30000,
  gift_count: 3,
  by_fund: [
    { fund_name: "General Fund", total_cents: 20000, gift_count: 2 },
    { fund_name: "Building Fund", total_cents: 10000, gift_count: 1 },
  ],
  lines: [
    { received_on: "2026-01-04", amount_cents: 15000, method: "cash", check_number: null, fund_name: "General Fund", given_by: "Abebe Kebede", is_tax_deductible: true },
    { received_on: "2026-01-04", amount_cents: 10000, method: "check", check_number: "1042", fund_name: "Building Fund", given_by: "Hana Kebede", is_tax_deductible: true },
    { received_on: "2026-01-11", amount_cents: 5000, method: "card", check_number: null, fund_name: "General Fund", given_by: "Abebe Kebede", is_tax_deductible: true },
  ],
};

describe("buildStatementDocument", () => {
  it("carries the acknowledgement a US donor needs to claim the gift", () => {
    const html = buildStatementDocument([base], CHURCH);
    expect(html).toContain("No goods or services were provided");
    expect(html).toContain("intangible religious benefits");
  });

  it("states the deductible total, the church and the year", () => {
    const html = buildStatementDocument([base], CHURCH);
    expect(html).toContain("$300.00");
    expect(html).toContain("2026");
    expect(html).toContain("Addis Lidet International Church");
    expect(html).toContain("EIN 12-3456789");
    expect(html).toContain("The Kebede Household");
  });

  it("lists every gift, with the cheque number where there is one", () => {
    const html = buildStatementDocument([base], CHURCH);
    expect(html).toContain("4 Jan 2026");
    expect(html).toContain("11 Jan 2026");
    expect(html).toContain("cheque #1042");
    expect(html).toContain("$150.00");
  });

  it("separates a non-deductible gift from the deductible total", () => {
    const mixed: Statement = {
      ...base,
      total_cents: 35000,
      deductible_cents: 30000,
      gift_count: 4,
      lines: [
        ...base.lines,
        { received_on: "2026-03-01", amount_cents: 5000, method: "card", check_number: null, fund_name: "Missions", given_by: "Abebe Kebede", is_tax_deductible: false },
      ],
    };
    const html = buildStatementDocument([mixed], CHURCH);
    // The deductible total must not silently include the banquet ticket.
    expect(html).toContain("$300.00");
    expect(html).toContain("not tax deductible");
    expect(html).toContain("(not deductible)");
    expect(html).toContain("$50.00");
  });

  it("puts each household on its own page", () => {
    const second: Statement = { ...base, recipient_name: "The Alemu Household" };
    const html = buildStatementDocument([base, second], CHURCH);
    expect((html.match(/class="statement"/g) ?? []).length).toBe(2);
    expect(html).toContain("page-break-after: always");
  });

  it("escapes a name that contains markup", () => {
    const nasty: Statement = { ...base, recipient_name: '<script>alert("x")</script>' };
    const html = buildStatementDocument([nasty], CHURCH);
    expect(html).not.toContain("<script>");
    expect(html).toContain("&lt;script&gt;");
  });

  it("renders a household with no gifts without falling over", () => {
    const empty: Statement = {
      ...base,
      total_cents: 0,
      deductible_cents: 0,
      gift_count: 0,
      by_fund: [],
      lines: [],
    };
    const html = buildStatementDocument([empty], CHURCH);
    expect(html).toContain("No gifts recorded.");
    expect(html).toContain("$0.00");
  });

  it("survives a household with no address on record", () => {
    const noAddress: Statement = { ...base, address: null };
    const html = buildStatementDocument([noAddress], CHURCH);
    expect(html).toContain("The Kebede Household");
    expect(html).not.toContain("undefined");
  });
});
