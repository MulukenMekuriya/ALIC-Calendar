/**
 * The year-end contribution statement, as printable HTML.
 *
 * Pure — no React, no DOM, no Supabase — so the wording and the arithmetic can
 * be tested. The impure half (opening a print frame) lives in
 * services/statementPrintService.ts, mirroring how the kids labels are split
 * between labelTemplate and labelPrintService.
 *
 * ON THE WORDING
 * --------------
 * A US donor cannot claim a gift of $250 or more without a written
 * acknowledgement from the charity that states whether goods or services were
 * provided in return. That sentence is not decoration and it is not optional,
 * so it is printed on every statement rather than only on the large ones.
 *
 * Gifts marked not tax deductible are listed — the donor gave them and should
 * see them — but excluded from the deductible total, and the statement says so
 * rather than leaving the reader to reconcile two numbers that disagree.
 */

import type { Statement } from "../types";

export interface StatementChurchInfo {
  name: string;
  addressLines: string[];
  /** Employer Identification Number, if the church has published one. */
  ein?: string | null;
  email?: string | null;
  website?: string | null;
}

function escapeHtml(value: string): string {
  return value
    .replace(/&/g, "&amp;")
    .replace(/</g, "&lt;")
    .replace(/>/g, "&gt;")
    .replace(/"/g, "&quot;")
    .replace(/'/g, "&#39;");
}

function money(cents: number): string {
  return (cents / 100).toLocaleString("en-US", {
    style: "currency",
    currency: "USD",
    minimumFractionDigits: 2,
    maximumFractionDigits: 2,
  });
}

/** "4 Jan 2026" — unambiguous to both a US and an Ethiopian reader. */
function longDate(iso: string): string {
  const [y, m, d] = iso.split("-").map(Number);
  const months = ["Jan","Feb","Mar","Apr","May","Jun","Jul","Aug","Sep","Oct","Nov","Dec"];
  if (!y || !m || !d || m < 1 || m > 12) return iso;
  return `${d} ${months[m - 1]} ${y}`;
}

const STYLES = `
  @page { size: letter; margin: 18mm 16mm; }
  * { box-sizing: border-box; }
  body {
    margin: 0;
    font-family: Georgia, "Times New Roman", serif;
    color: #111;
    font-size: 11pt;
    line-height: 1.45;
  }
  .statement { page-break-after: always; }
  .statement:last-child { page-break-after: auto; }
  .head { display: flex; justify-content: space-between; gap: 16mm; border-bottom: 2px solid #111; padding-bottom: 6mm; }
  .church-name { font-size: 15pt; font-weight: bold; margin: 0 0 2mm; }
  .church-address { font-size: 9pt; color: #444; white-space: pre-line; margin: 0; }
  .doc-title { text-align: right; }
  .doc-title h2 { font-size: 12pt; margin: 0 0 1mm; text-transform: uppercase; letter-spacing: 0.5pt; }
  .doc-title .year { font-size: 22pt; font-weight: bold; line-height: 1; }
  .recipient { margin: 8mm 0 6mm; }
  .recipient .to { font-size: 8.5pt; text-transform: uppercase; letter-spacing: 0.6pt; color: #666; margin-bottom: 1.5mm; }
  .recipient .name { font-size: 13pt; font-weight: bold; }
  .recipient .address { font-size: 10pt; color: #333; white-space: pre-line; }
  table { width: 100%; border-collapse: collapse; margin: 4mm 0; }
  th { text-align: left; font-size: 8.5pt; text-transform: uppercase; letter-spacing: 0.5pt; color: #666; border-bottom: 1px solid #999; padding: 2mm 1mm; }
  td { padding: 1.8mm 1mm; border-bottom: 1px solid #e5e5e5; font-size: 10pt; }
  td.num, th.num { text-align: right; white-space: nowrap; }
  tfoot td { border-top: 2px solid #111; border-bottom: none; font-weight: bold; padding-top: 3mm; }
  .totals { margin-top: 6mm; border: 1px solid #111; padding: 4mm; }
  .totals .row { display: flex; justify-content: space-between; }
  .totals .grand { font-size: 13pt; font-weight: bold; }
  .totals .note { font-size: 9pt; color: #555; margin-top: 2mm; }
  .legal { margin-top: 6mm; font-size: 9pt; color: #333; border-top: 1px solid #ccc; padding-top: 4mm; }
  .section-title { font-size: 9pt; text-transform: uppercase; letter-spacing: 0.6pt; color: #666; margin: 6mm 0 1mm; }
  .nd { font-size: 8.5pt; color: #777; }
  .empty { font-style: italic; color: #666; }
`;

function renderOne(statement: Statement, church: StatementChurchInfo): string {
  const address = statement.address;
  const addressLines = address
    ? [address.line1, address.line2,
       [address.city, address.state].filter(Boolean).join(", "),
       address.postal_code]
        .filter((line): line is string => !!line && line.trim() !== "")
    : [];

  const nonDeductible = statement.total_cents - statement.deductible_cents;

  const fundRows = statement.by_fund.length
    ? statement.by_fund
        .map(
          (f) => `<tr>
            <td>${escapeHtml(f.fund_name)}</td>
            <td class="num">${f.gift_count}</td>
            <td class="num">${money(f.total_cents)}</td>
          </tr>`
        )
        .join("")
    : `<tr><td colspan="3" class="empty">No gifts recorded.</td></tr>`;

  const lineRows = statement.lines
    .map(
      (line) => `<tr>
        <td>${longDate(line.received_on)}</td>
        <td>${escapeHtml(line.fund_name)}</td>
        <td>${escapeHtml(line.given_by ?? "")}${
          line.check_number ? ` <span class="nd">cheque #${escapeHtml(line.check_number)}</span>` : ""
        }${line.is_tax_deductible ? "" : ` <span class="nd">(not deductible)</span>`}</td>
        <td class="num">${money(line.amount_cents)}</td>
      </tr>`
    )
    .join("");

  return `
  <div class="statement">
    <div class="head">
      <div>
        <h1 class="church-name">${escapeHtml(church.name)}</h1>
        <p class="church-address">${escapeHtml(church.addressLines.join("\n"))}</p>
        ${church.ein ? `<p class="church-address">EIN ${escapeHtml(church.ein)}</p>` : ""}
      </div>
      <div class="doc-title">
        <h2>Contribution Statement</h2>
        <div class="year">${statement.year}</div>
      </div>
    </div>

    <div class="recipient">
      <div class="to">Issued to</div>
      <div class="name">${escapeHtml(statement.recipient_name ?? "")}</div>
      ${addressLines.length ? `<div class="address">${escapeHtml(addressLines.join("\n"))}</div>` : ""}
    </div>

    <div class="section-title">Summary by fund</div>
    <table>
      <thead>
        <tr><th>Fund</th><th class="num">Gifts</th><th class="num">Amount</th></tr>
      </thead>
      <tbody>${fundRows}</tbody>
    </table>

    <div class="totals">
      <div class="row grand">
        <span>Total tax-deductible contributions for ${statement.year}</span>
        <span>${money(statement.deductible_cents)}</span>
      </div>
      ${
        nonDeductible > 0
          ? `<div class="row"><span>Other gifts recorded (not tax deductible)</span><span>${money(nonDeductible)}</span></div>
             <div class="note">Gifts marked not deductible are listed below for your records but are excluded from the total above, because something of value was received in return for them.</div>`
          : ""
      }
    </div>

    ${
      statement.lines.length
        ? `<div class="section-title">Every gift recorded in ${statement.year}</div>
           <table>
             <thead>
               <tr><th>Date</th><th>Fund</th><th>Given by</th><th class="num">Amount</th></tr>
             </thead>
             <tbody>${lineRows}</tbody>
             <tfoot>
               <tr><td colspan="3">Total recorded</td><td class="num">${money(statement.total_cents)}</td></tr>
             </tfoot>
           </table>`
        : ""
    }

    <div class="legal">
      <p><strong>No goods or services were provided in exchange for the tax-deductible
      contributions listed above, other than intangible religious benefits.</strong></p>
      <p>Please retain this statement for your records. If anything here does not
      match your own, contact the church office before filing${
        church.email ? ` at ${escapeHtml(church.email)}` : ""
      }.</p>
    </div>
  </div>`;
}

/**
 * One document, one statement per page. Printing forty households is one job,
 * not forty.
 */
export function buildStatementDocument(
  statements: Statement[],
  church: StatementChurchInfo
): string {
  const body = statements.map((s) => renderOne(s, church)).join("\n");
  const title =
    statements.length === 1
      ? `${statements[0].year} statement — ${statements[0].recipient_name ?? ""}`
      : `${statements[0]?.year ?? ""} contribution statements`;

  return `<!DOCTYPE html>
<html lang="en">
<head>
<meta charset="utf-8" />
<title>${escapeHtml(title)}</title>
<style>${STYLES}</style>
</head>
<body>
${body}
</body>
</html>`;
}
