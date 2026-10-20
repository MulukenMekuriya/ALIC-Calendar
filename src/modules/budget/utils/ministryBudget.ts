/**
 * The Ministry Summary: each ministry's approved budget for the year, what it
 * has spent, and what is left.
 *
 * Asked for on 20 October 2026 in place of the count and average of each
 * ministry's expense requests. Approved budget is budget.budget_allocations,
 * which approving a budget request adds to. Expenditure to date is what has
 * been paid: the user chose paid only, so an expense approved but not yet
 * paid does not reduce what is left until it is.
 */

import type { MinistryBudgetSummary } from "../types";

/** "Expenditure to Date" counts an expense once it is paid. */
export const PAID_STATUSES = ["completed"];

export interface MinistryBudgetRow {
  ministryId: string;
  ministry: string;
  approved: number;
  spent: number;
  /** Negative when a ministry has paid out more than it was approved. */
  remaining: number;
}

interface ExpenseLike {
  ministry_id: string;
  amount: number | string;
  status: string;
  ministry?: { name: string } | null;
}

/**
 * One row per ministry with an approved budget or a paid expense: a ministry
 * spending with no budget is the row most worth seeing. Largest budget first.
 */
export function ministryBudgetRows(
  budgets: Pick<MinistryBudgetSummary, "ministry_id" | "ministry_name" | "allocated_amount">[],
  expenses: ExpenseLike[],
): MinistryBudgetRow[] {
  const rows = new Map<string, MinistryBudgetRow>();
  const row = (id: string, name: string) => {
    let r = rows.get(id);
    if (!r) {
      r = { ministryId: id, ministry: name, approved: 0, spent: 0, remaining: 0 };
      rows.set(id, r);
    }
    return r;
  };

  for (const b of budgets) {
    row(b.ministry_id, b.ministry_name).approved += Number(b.allocated_amount);
  }
  for (const e of expenses) {
    if (!PAID_STATUSES.includes(e.status)) continue;
    row(e.ministry_id, e.ministry?.name || "Unknown ministry").spent += Number(e.amount);
  }

  return [...rows.values()]
    .map((r) => ({ ...r, remaining: r.approved - r.spent }))
    .filter((r) => r.approved !== 0 || r.spent !== 0)
    .sort(
      (a, b) =>
        b.approved - a.approved || b.spent - a.spent || a.ministry.localeCompare(b.ministry),
    );
}

export function ministryBudgetTotals(rows: MinistryBudgetRow[]) {
  return rows.reduce(
    (t, r) => ({
      approved: t.approved + r.approved,
      spent: t.spent + r.spent,
      remaining: t.remaining + r.remaining,
    }),
    { approved: 0, spent: 0, remaining: 0 },
  );
}

/** "$1,234.50", and "−$1,234.50" for an overspend. */
export function formatBudgetAmount(amount: number): string {
  const formatted = new Intl.NumberFormat("en-US", { style: "currency", currency: "USD" }).format(
    Math.abs(amount),
  );
  return amount < 0 ? `−${formatted}` : formatted;
}
