/**
 * Export Utilities for Budget Module
 * Provides CSV, Excel-compatible, and print-friendly export functionality
 */

import type { ExpenseRequestWithRelations, MinistryBudgetSummary } from "../types";
import { EXPENSE_STATUS_CONFIG, REIMBURSEMENT_TYPE_LABELS } from "../types";

// CSV Export Helper
const escapeCSVValue = (value: string | number | null | undefined): string => {
  if (value === null || value === undefined) return "";
  const stringValue = String(value);
  // Escape quotes and wrap in quotes if contains comma, quote, or newline
  if (stringValue.includes(",") || stringValue.includes('"') || stringValue.includes("\n")) {
    return `"${stringValue.replace(/"/g, '""')}"`;
  }
  return stringValue;
};

const formatCurrency = (amount: number): string => {
  return new Intl.NumberFormat("en-US", {
    style: "currency",
    currency: "USD",
  }).format(amount);
};

const formatDate = (dateString: string | null): string => {
  if (!dateString) return "";
  return new Date(dateString).toLocaleDateString("en-US", {
    year: "numeric",
    month: "short",
    day: "numeric",
  });
};

// =====================================================
// Expense Reports Export
// =====================================================

export interface ExportOptions {
  includeAttachments?: boolean;
  dateRange?: { from: string; to: string };
}

export const exportExpensesToCSV = (
  expenses: ExpenseRequestWithRelations[],
  filename: string = "expense-report"
): void => {
  const headers = [
    "ID",
    "Title",
    "Description",
    "Amount",
    "Status",
    "Ministry",
    "Requester",
    "Payment Method",
    "Created Date",
    "Submitted Date",
    "Leader Reviewed",
    "Treasury Reviewed",
    "Completed Date",
    "Payment Reference",
  ];

  const rows = expenses.map((expense) => [
    expense.id,
    expense.title,
    expense.description || "",
    expense.amount,
    EXPENSE_STATUS_CONFIG[expense.status]?.label || expense.status,
    expense.ministry?.name || "",
    expense.requester_name,
    REIMBURSEMENT_TYPE_LABELS[expense.reimbursement_type] || expense.reimbursement_type,
    formatDate(expense.created_at),
    formatDate(expense.submitted_at),
    formatDate(expense.leader_reviewed_at),
    formatDate(expense.treasury_reviewed_at),
    formatDate(expense.finance_processed_at),
    expense.payment_reference || "",
  ]);

  const csvContent = [
    headers.map(escapeCSVValue).join(","),
    ...rows.map((row) => row.map(escapeCSVValue).join(",")),
  ].join("\n");

  downloadFile(csvContent, `${filename}-${getDateStamp()}.csv`, "text/csv");
};

export const exportExpensesToExcel = (
  expenses: ExpenseRequestWithRelations[],
  filename: string = "expense-report"
): void => {
  // Create Excel-compatible XML format
  const headers = [
    "ID",
    "Title",
    "Description",
    "Amount",
    "Status",
    "Ministry",
    "Requester",
    "Payment Method",
    "Created Date",
    "Submitted Date",
    "Leader Reviewed",
    "Treasury Reviewed",
    "Completed Date",
    "Payment Reference",
  ];

  const rows = expenses.map((expense) => [
    expense.id,
    expense.title,
    expense.description || "",
    expense.amount,
    EXPENSE_STATUS_CONFIG[expense.status]?.label || expense.status,
    expense.ministry?.name || "",
    expense.requester_name,
    REIMBURSEMENT_TYPE_LABELS[expense.reimbursement_type] || expense.reimbursement_type,
    formatDate(expense.created_at),
    formatDate(expense.submitted_at),
    formatDate(expense.leader_reviewed_at),
    formatDate(expense.treasury_reviewed_at),
    formatDate(expense.finance_processed_at),
    expense.payment_reference || "",
  ]);

  const xmlContent = generateExcelXML(headers, rows, "Expense Report");
  downloadFile(xmlContent, `${filename}-${getDateStamp()}.xls`, "application/vnd.ms-excel");
};

// =====================================================
// Budget Summary Export
// =====================================================

export const exportBudgetSummaryToCSV = (
  summaries: MinistryBudgetSummary[],
  fiscalYearName: string,
  filename: string = "budget-summary"
): void => {
  const headers = [
    "Ministry",
    "Fiscal Year",
    "Allocated Budget",
    "Pending",
    "Approved",
    "Spent",
    "Remaining",
    "Usage %",
  ];

  const rows = summaries.map((summary) => {
    const usagePercent = summary.allocated_amount > 0
      ? ((summary.total_spent / summary.allocated_amount) * 100).toFixed(1)
      : "0.0";
    return [
      summary.ministry_name,
      summary.fiscal_year_name,
      formatCurrency(summary.allocated_amount),
      formatCurrency(summary.total_pending),
      formatCurrency(summary.total_approved),
      formatCurrency(summary.total_spent),
      formatCurrency(summary.remaining),
      `${usagePercent}%`,
    ];
  });

  // Add totals row
  const totals = summaries.reduce(
    (acc, s) => ({
      allocated: acc.allocated + s.allocated_amount,
      pending: acc.pending + s.total_pending,
      approved: acc.approved + s.total_approved,
      spent: acc.spent + s.total_spent,
      remaining: acc.remaining + s.remaining,
    }),
    { allocated: 0, pending: 0, approved: 0, spent: 0, remaining: 0 }
  );

  const totalUsage = totals.allocated > 0
    ? ((totals.spent / totals.allocated) * 100).toFixed(1)
    : "0.0";

  rows.push([
    "TOTAL",
    fiscalYearName,
    formatCurrency(totals.allocated),
    formatCurrency(totals.pending),
    formatCurrency(totals.approved),
    formatCurrency(totals.spent),
    formatCurrency(totals.remaining),
    `${totalUsage}%`,
  ]);

  const csvContent = [
    headers.map(escapeCSVValue).join(","),
    ...rows.map((row) => row.map(escapeCSVValue).join(",")),
  ].join("\n");

  downloadFile(csvContent, `${filename}-${getDateStamp()}.csv`, "text/csv");
};

// =====================================================
// Print-Friendly Report Generation
// =====================================================

export const generatePrintableExpenseReport = (
  expenses: ExpenseRequestWithRelations[],
  title: string = "Expense Report"
): void => {
  const totalAmount = expenses.reduce((sum, e) => sum + e.amount, 0);

  const html = `
    <!DOCTYPE html>
    <html>
    <head>
      <title>${title}</title>
      <style>
        body { font-family: Arial, sans-serif; margin: 20px; }
        h1 { color: #333; border-bottom: 2px solid #333; padding-bottom: 10px; }
        .summary { margin: 20px 0; padding: 15px; background: #f5f5f5; border-radius: 8px; }
        table { width: 100%; border-collapse: collapse; margin-top: 20px; }
        th, td { border: 1px solid #ddd; padding: 8px; text-align: left; font-size: 12px; }
        th { background: #4a5568; color: white; }
        tr:nth-child(even) { background: #f9f9f9; }
        .amount { text-align: right; font-family: monospace; }
        .status { padding: 2px 8px; border-radius: 4px; font-size: 11px; }
        .footer { margin-top: 20px; font-size: 11px; color: #666; }
        @media print {
          body { margin: 0; }
          .no-print { display: none; }
        }
      </style>
    </head>
    <body>
      <h1>${title}</h1>
      <div class="summary">
        <strong>Total Expenses:</strong> ${expenses.length} |
        <strong>Total Amount:</strong> ${formatCurrency(totalAmount)} |
        <strong>Generated:</strong> ${new Date().toLocaleString()}
      </div>
      <table>
        <thead>
          <tr>
            <th>Title</th>
            <th>Ministry</th>
            <th>Requester</th>
            <th>Amount</th>
            <th>Status</th>
            <th>Date</th>
          </tr>
        </thead>
        <tbody>
          ${expenses.map((e) => `
            <tr>
              <td>${escapeHTML(e.title)}</td>
              <td>${escapeHTML(e.ministry?.name || "")}</td>
              <td>${escapeHTML(e.requester_name)}</td>
              <td class="amount">${formatCurrency(e.amount)}</td>
              <td><span class="status">${EXPENSE_STATUS_CONFIG[e.status]?.label || e.status}</span></td>
              <td>${formatDate(e.created_at)}</td>
            </tr>
          `).join("")}
        </tbody>
      </table>
      <div class="footer">
        Generated by Approval Agenda Budget Module
      </div>
      <script>window.print();</script>
    </body>
    </html>
  `;

  const printWindow = window.open("", "_blank");
  if (printWindow) {
    printWindow.document.write(html);
    printWindow.document.close();
  }
};

// =====================================================
// Helper Functions
// =====================================================

const getDateStamp = (): string => {
  const now = new Date();
  return `${now.getFullYear()}${String(now.getMonth() + 1).padStart(2, "0")}${String(now.getDate()).padStart(2, "0")}`;
};

const downloadFile = (content: string, filename: string, mimeType: string): void => {
  const blob = new Blob([content], { type: `${mimeType};charset=utf-8;` });
  const url = URL.createObjectURL(blob);
  const link = document.createElement("a");
  link.setAttribute("href", url);
  link.setAttribute("download", filename);
  link.style.visibility = "hidden";
  document.body.appendChild(link);
  link.click();
  document.body.removeChild(link);
  URL.revokeObjectURL(url);
};

const escapeHTML = (str: string): string => {
  const div = document.createElement("div");
  div.textContent = str;
  return div.innerHTML;
};

const generateExcelXML = (
  headers: string[],
  rows: (string | number)[][][],
  sheetName: string
): string => {
  const headerCells = headers
    .map((h) => `<Cell><Data ss:Type="String">${escapeHTML(String(h))}</Data></Cell>`)
    .join("");

  const dataRows = rows
    .map((row) => {
      const cells = (row as (string | number)[])
        .map((cell) => {
          const type = typeof cell === "number" ? "Number" : "String";
          return `<Cell><Data ss:Type="${type}">${escapeHTML(String(cell))}</Data></Cell>`;
        })
        .join("");
      return `<Row>${cells}</Row>`;
    })
    .join("");

  return `<?xml version="1.0"?>
<?mso-application progid="Excel.Sheet"?>
<Workbook xmlns="urn:schemas-microsoft-com:office:spreadsheet"
  xmlns:ss="urn:schemas-microsoft-com:office:spreadsheet">
  <Worksheet ss:Name="${sheetName}">
    <Table>
      <Row ss:StyleID="Header">${headerCells}</Row>
      ${dataRows}
    </Table>
  </Worksheet>
</Workbook>`;
};
