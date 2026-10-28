/**
 * MinistryBudgetSummary - each ministry's approved budget, what it has paid
 * out, and what is left, for the year selected.
 */

import {
  Card,
  CardContent,
  CardDescription,
  CardHeader,
  CardTitle,
} from "@/shared/components/ui/card";
import { cn } from "@/lib/utils";
import type { ExpenseRequestWithRelations, MinistryBudgetSummary as MinistryBudget } from "../types";
import {
  type MinistryBudgetRow,
  formatBudgetAmount,
  ministryBudgetRows,
  ministryBudgetTotals,
} from "../utils/ministryBudget";

interface MinistryBudgetSummaryProps {
  budgets?: MinistryBudget[];
  expenses?: ExpenseRequestWithRelations[];
  /** Ready-made rows, for a viewer who is given totals rather than expenses. */
  rows?: MinistryBudgetRow[];
  /** Names the branch in the title when several are shown together. */
  branchLabel?: string;
}

const cell = "py-2 sm:py-3 px-3 sm:px-4 text-xs sm:text-sm";
const amount = `${cell} text-right tabular-nums whitespace-nowrap`;

export function MinistryBudgetSummary({
  budgets = [],
  expenses = [],
  rows: given,
  branchLabel,
}: MinistryBudgetSummaryProps) {
  const rows = given ?? ministryBudgetRows(budgets, expenses);
  if (rows.length === 0) return null;
  const totals = ministryBudgetTotals(rows);

  return (
    <Card>
      <CardHeader className="p-3 sm:p-6">
        <CardTitle className="text-base sm:text-lg">
          Ministry Summary{branchLabel ? ` · ${branchLabel}` : ""}
        </CardTitle>
        <CardDescription className="text-xs sm:text-sm">
          Approved budget against what has been paid, by ministry
        </CardDescription>
      </CardHeader>
      <CardContent className="p-3 sm:p-6 pt-0">
        <div className="overflow-x-auto -mx-3 sm:mx-0">
          <table className="w-full min-w-[520px]">
            <thead>
              <tr className="border-b">
                <th className={cn(cell, "text-left font-medium")}>Ministry</th>
                <th className={cn(amount, "font-medium")}>Approved Budget</th>
                <th className={cn(amount, "font-medium")}>Expenditure to Date</th>
                <th className={cn(amount, "font-medium")}>Remaining Budget</th>
              </tr>
            </thead>
            <tbody>
              {rows.map((row) => (
                <tr key={row.ministryId} className="border-b hover:bg-muted/50">
                  <td className={cn(cell, "font-medium")}>{row.ministry}</td>
                  <td className={cn(amount, row.approved === 0 && "text-muted-foreground")}>
                    {formatBudgetAmount(row.approved)}
                  </td>
                  <td className={amount}>{formatBudgetAmount(row.spent)}</td>
                  <td
                    className={cn(
                      amount,
                      "font-medium",
                      row.remaining < 0 ? "text-red-600" : "text-emerald-700"
                    )}
                  >
                    {formatBudgetAmount(row.remaining)}
                  </td>
                </tr>
              ))}
            </tbody>
            <tfoot>
              <tr className="border-t-2 font-bold">
                <td className={cell}>Total</td>
                <td className={amount}>{formatBudgetAmount(totals.approved)}</td>
                <td className={amount}>{formatBudgetAmount(totals.spent)}</td>
                <td className={cn(amount, totals.remaining < 0 && "text-red-600")}>
                  {formatBudgetAmount(totals.remaining)}
                </td>
              </tr>
            </tfoot>
          </table>
        </div>
      </CardContent>
    </Card>
  );
}
