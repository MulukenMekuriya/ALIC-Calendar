/**
 * The Budget page for a login that is only the Board.
 *
 * Two consolidated views and nothing else, so nothing here confuses it:
 *
 *   1. Consolidated Monthly Budget Summary: the requests the local leaders
 *      have sent for review, across both branches. The Board adds a
 *      Recommended amount and Comment, and sends the batch back or gives
 *      final approval. It never edits a figure.
 *   2. Ministry Summary: approved budget against what has been paid, by
 *      ministry, grouped by branch. Totals only.
 *
 * No expenses, metrics, flags or exports, and no queries for them.
 */

import { useMemo, useState } from "react";
import { DollarSign } from "lucide-react";
import DashboardLayout from "@/shared/components/layout/DashboardLayout";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/shared/components/ui/select";
import { useOrganization } from "@/shared/contexts/OrganizationContext";
import { useRequestSeason } from "../hooks";
import { useMinistryTotals } from "../hooks/useBoardReview";
import { BudgetReviewSection } from "../components/review/BudgetReviewSection";
import { MinistryBudgetSummary } from "../components/MinistryBudgetSummary";
import { ministryRowsFromTotals } from "../utils/ministryBudget";

const BoardBudgetPage = () => {
  const { userOrganizations } = useOrganization();
  const currentYear = new Date().getFullYear();

  const boardOrgIds = useMemo(
    () => userOrganizations.filter((m) => m.role === "board").map((m) => m.organization_id),
    [userOrganizations],
  );

  const { data: season } = useRequestSeason(boardOrgIds[0]);
  const [reviewYear, setReviewYear] = useState<number | null>(null);
  const [spendYear, setSpendYear] = useState<number>(currentYear);
  const year = reviewYear ?? season?.fiscal_year ?? currentYear;

  const { data: totals = [] } = useMinistryTotals(spendYear);
  const byBranch = useMemo(() => {
    const map = new Map<string, { name: string; rows: typeof totals }>();
    for (const t of totals) {
      const g = map.get(t.organization_id) ?? { name: t.organization_name, rows: [] };
      g.rows.push(t);
      map.set(t.organization_id, g);
    }
    return [...map.entries()].sort((a, b) => a[1].name.localeCompare(b[1].name));
  }, [totals]);

  const years = [currentYear + 1, currentYear, currentYear - 1, currentYear - 2];
  const YearSelect = ({ value, onChange, label }: { value: number; onChange: (y: number) => void; label: string }) => (
    <Select value={String(value)} onValueChange={(v) => onChange(Number(v))}>
      <SelectTrigger className="w-32" aria-label={label}>
        <SelectValue />
      </SelectTrigger>
      <SelectContent>
        {years.map((y) => (
          <SelectItem key={y} value={String(y)}>
            {y}
          </SelectItem>
        ))}
      </SelectContent>
    </Select>
  );

  return (
    <DashboardLayout>
      <div className="space-y-8">
        <div className="space-y-2">
          <h1 className="text-2xl sm:text-3xl font-bold tracking-tight flex items-center gap-2 sm:gap-3">
            <div className="p-1.5 sm:p-2 rounded-lg bg-primary/10">
              <DollarSign className="h-5 w-5 sm:h-6 sm:w-6 text-primary" />
            </div>
            Budget
          </h1>
          <p className="text-sm sm:text-base text-muted-foreground">Board review of the church's budget requests</p>
        </div>

        <section className="space-y-3" aria-labelledby="board-review-year">
          <div className="flex items-center gap-3">
            <span id="board-review-year" className="text-sm text-muted-foreground">Budget year</span>
            <YearSelect value={year} onChange={setReviewYear} label="Budget year under review" />
          </div>
          <BudgetReviewSection year={year} organizationIds={boardOrgIds} />
        </section>

        <section className="space-y-3">
          <div className="flex items-center gap-3">
            <span className="text-sm text-muted-foreground">Spending year</span>
            <YearSelect value={spendYear} onChange={setSpendYear} label="Year for the Ministry Summary" />
          </div>
          {byBranch.length === 0 ? (
            <p className="text-sm text-muted-foreground">No approved budgets or payments for {spendYear} yet.</p>
          ) : (
            byBranch.map(([orgId, g]) => (
              <MinistryBudgetSummary
                key={orgId}
                rows={ministryRowsFromTotals(g.rows)}
                branchLabel={byBranch.length > 1 ? g.name : undefined}
              />
            ))
          )}
        </section>
      </div>
    </DashboardLayout>
  );
};

export default BoardBudgetPage;
