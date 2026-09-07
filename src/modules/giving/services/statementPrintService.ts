/**
 * Printing statements.
 *
 * Impure counterpart to utils/statementTemplate. Uses the same hidden-iframe
 * approach as the kids label printer: no popup to be blocked, no stolen focus,
 * no visible tab flashing in front of the treasurer part-way through a batch
 * of forty.
 */

import { buildStatementDocument, type StatementChurchInfo } from "../utils/statementTemplate";
import type { Statement } from "../types";

export interface PrintResult {
  submitted: boolean;
  error?: string;
}

export function printStatements(
  statements: Statement[],
  church: StatementChurchInfo
): Promise<PrintResult> {
  return new Promise((resolve) => {
    if (statements.length === 0) {
      resolve({ submitted: false, error: "Nothing to print." });
      return;
    }

    try {
      const html = buildStatementDocument(statements, church);
      const frame = document.createElement("iframe");
      frame.setAttribute("aria-hidden", "true");
      frame.style.position = "fixed";
      frame.style.right = "0";
      frame.style.bottom = "0";
      frame.style.width = "0";
      frame.style.height = "0";
      frame.style.border = "0";
      document.body.appendChild(frame);

      const cleanup = () => {
        // Late enough that the print dialog has taken its copy of the document.
        window.setTimeout(() => frame.remove(), 2000);
      };

      frame.onload = () => {
        try {
          frame.contentWindow?.focus();
          frame.contentWindow?.print();
          resolve({ submitted: true });
        } catch (error) {
          resolve({
            submitted: false,
            error: error instanceof Error ? error.message : "Print failed",
          });
        } finally {
          cleanup();
        }
      };

      const doc = frame.contentDocument;
      if (!doc) {
        frame.remove();
        resolve({ submitted: false, error: "Could not open a print frame." });
        return;
      }
      doc.open();
      doc.write(html);
      doc.close();
    } catch (error) {
      resolve({
        submitted: false,
        error: error instanceof Error ? error.message : "Print failed",
      });
    }
  });
}

/**
 * The recipient list as a CSV, for a mail merge or an envelope run.
 *
 * Deliberately not the gift detail: this is the list of who gets an envelope,
 * and a spreadsheet of every household's giving is a much more dangerous file
 * to have sitting in somebody's Downloads folder.
 */
export function recipientsToCsv(
  rows: {
    recipient_name: string;
    address_line1: string | null;
    address_line2: string | null;
    city: string | null;
    state: string | null;
    postal_code: string | null;
    email: string | null;
    total_cents: number;
    gift_count: number;
  }[]
): string {
  const escape = (value: string | null | undefined) => {
    const text = value ?? "";
    return /[",\n]/.test(text) ? `"${text.replace(/"/g, '""')}"` : text;
  };

  const header = [
    "Recipient", "Address 1", "Address 2", "City", "State", "Postal code",
    "Email", "Total", "Gifts",
  ].join(",");

  const body = rows.map((row) =>
    [
      escape(row.recipient_name),
      escape(row.address_line1),
      escape(row.address_line2),
      escape(row.city),
      escape(row.state),
      escape(row.postal_code),
      escape(row.email),
      (row.total_cents / 100).toFixed(2),
      String(row.gift_count),
    ].join(",")
  );

  return [header, ...body].join("\n");
}

export function downloadCsv(filename: string, csv: string): void {
  const blob = new Blob([csv], { type: "text/csv;charset=utf-8;" });
  const url = URL.createObjectURL(blob);
  const link = document.createElement("a");
  link.href = url;
  link.download = filename;
  document.body.appendChild(link);
  link.click();
  link.remove();
  URL.revokeObjectURL(url);
}
