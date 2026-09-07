/**
 * Where the year stands.
 *
 * The four numbers at the top are stat tiles, not a chart, because a single
 * headline figure has no shape to show. The only chart is the monthly one,
 * which is a single series and so needs no legend — the heading names it.
 * Fund totals are a table: there are four funds, the exact dollars matter, and
 * a pie of four slices tells a treasurer less than four rows do.
 */

import {
  Card,
  CardContent,
  CardDescription,
  CardHeader,
  CardTitle,
} from "@/shared/components/ui/card";
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from "@/shared/components/ui/table";
import {
  Tooltip,
  TooltipContent,
  TooltipTrigger,
} from "@/shared/components/ui/tooltip";
import { Button } from "@/shared/components/ui/button";
import { Loader2, HelpCircle } from "lucide-react";
import { useGivingOverview, useFundTotals } from "../hooks";
import { formatMoney, formatMoneyShort } from "../utils/money";

const MONTH_LABELS = ["J", "F", "M", "A", "M", "J", "J", "A", "S", "O", "N", "D"];
const MONTH_NAMES = [
  "January", "February", "March", "April", "May", "June",
  "July", "August", "September", "October", "November", "December",
];

interface GivingOverviewTabProps {
  organizationId: string;
  year: number;
  onShowUnmatched: () => void;
}

function StatTile({
  label,
  value,
  detail,
  tone = "default",
}: {
  label: string;
  value: string;
  detail?: string;
  tone?: "default" | "attention";
}) {
  return (
    <Card>
      <CardContent className="pt-5">
        <p className="text-xs uppercase tracking-wide text-muted-foreground">{label}</p>
        <p
          className={
            "mt-1 text-2xl font-bold tabular-nums " +
            (tone === "attention" ? "text-amber-700" : "")
          }
        >
          {value}
        </p>
        {detail && <p className="mt-0.5 text-xs text-muted-foreground">{detail}</p>}
      </CardContent>
    </Card>
  );
}

export function GivingOverviewTab({
  organizationId,
  year,
  onShowUnmatched,
}: GivingOverviewTabProps) {
  const { data: overview, isLoading } = useGivingOverview(organizationId, year);
  const { data: funds } = useFundTotals(organizationId, year);

  if (isLoading || !overview) {
    return (
      <div className="flex items-center justify-center py-16 text-muted-foreground">
        <Loader2 className="h-5 w-5 animate-spin mr-2" />
        Loading {year}…
      </div>
    );
  }

  const months = overview.by_month ?? [];
  const peak = months.reduce((max, m) => Math.max(max, m.total_cents), 0);
  const peakMonth = months.find((m) => m.total_cents === peak && peak > 0);

  return (
    <div className="space-y-4">
      <div className="grid gap-3 grid-cols-2 lg:grid-cols-4">
        <StatTile
          label={`Given in ${year}`}
          value={formatMoney(overview.total_cents)}
          detail={`${overview.gift_count} gift${overview.gift_count === 1 ? "" : "s"}`}
        />
        <StatTile
          label="Donors"
          value={String(overview.donor_count)}
          detail="people or households credited"
        />
        <StatTile
          label="Unidentified"
          value={formatMoney(overview.unmatched_cents)}
          detail={`${overview.unmatched_count} gift${overview.unmatched_count === 1 ? "" : "s"} with no donor`}
          tone={overview.unmatched_count > 0 ? "attention" : "default"}
        />
        <StatTile
          label="Open batches"
          value={String(overview.open_batches)}
          detail={overview.open_batches > 0 ? "not yet posted" : "everything is posted"}
        />
      </div>

      {overview.unmatched_count > 0 && (
        <Card className="border-amber-200 bg-amber-50/50">
          <CardContent className="flex flex-wrap items-center justify-between gap-3 py-4">
            <p className="text-sm">
              <strong>{overview.unmatched_count} gift
              {overview.unmatched_count === 1 ? "" : "s"}</strong> worth{" "}
              {formatMoney(overview.unmatched_cents)} have no donor attached.
              They count toward the fund totals but cannot appear on anyone's
              year-end statement.
            </p>
            <Button variant="outline" size="sm" onClick={onShowUnmatched}>
              Identify them
            </Button>
          </CardContent>
        </Card>
      )}

      <Card>
        <CardHeader className="pb-2">
          <CardTitle className="text-base">Giving by month, {year}</CardTitle>
          <CardDescription>
            Every gift recorded, refunds excluded.
          </CardDescription>
        </CardHeader>
        <CardContent>
          {peak === 0 ? (
            <p className="py-8 text-center text-sm text-muted-foreground">
              Nothing recorded for {year} yet.
            </p>
          ) : (
            <>
              {/* Thin bars, 2px apart, rounded only at the data end and
                  anchored to the baseline. One series, so no legend: the card
                  title is the label. */}
              <div className="flex h-44 items-end gap-[2px]" role="presentation">
                {months.map((month) => {
                  const heightPct = peak > 0 ? (month.total_cents / peak) * 100 : 0;
                  return (
                    <Tooltip key={month.month}>
                      <TooltipTrigger asChild>
                        <div className="group flex h-full flex-1 flex-col justify-end">
                          <div
                            className="w-full rounded-t bg-[hsl(var(--primary))] transition-opacity group-hover:opacity-80"
                            style={{
                              height: `${Math.max(heightPct, month.total_cents > 0 ? 2 : 0)}%`,
                            }}
                          />
                        </div>
                      </TooltipTrigger>
                      <TooltipContent>
                        {MONTH_NAMES[month.month - 1]} · {formatMoney(month.total_cents)}
                      </TooltipContent>
                    </Tooltip>
                  );
                })}
              </div>
              <div className="mt-1 flex gap-[2px]">
                {months.map((month) => (
                  <div
                    key={month.month}
                    className="flex-1 text-center text-[10px] text-muted-foreground"
                  >
                    {MONTH_LABELS[month.month - 1]}
                  </div>
                ))}
              </div>
              {peakMonth && (
                <p className="mt-2 text-xs text-muted-foreground">
                  Biggest month: {MONTH_NAMES[peakMonth.month - 1]},{" "}
                  {formatMoneyShort(peakMonth.total_cents)}.
                </p>
              )}

              {/* The same numbers, for a screen reader and for anyone who
                  cannot use a hover tooltip. */}
              <table className="sr-only">
                <caption>Giving by month, {year}</caption>
                <thead>
                  <tr><th>Month</th><th>Total</th></tr>
                </thead>
                <tbody>
                  {months.map((m) => (
                    <tr key={m.month}>
                      <td>{MONTH_NAMES[m.month - 1]}</td>
                      <td>{formatMoney(m.total_cents)}</td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </>
          )}
        </CardContent>
      </Card>

      <Card>
        <CardHeader className="pb-2">
          <CardTitle className="text-base flex items-center gap-1.5">
            By fund
            <Tooltip>
              <TooltipTrigger asChild>
                <HelpCircle className="h-3.5 w-3.5 text-muted-foreground" />
              </TooltipTrigger>
              <TooltipContent>
                Donors counts people, so a household that gives from two names
                appears twice.
              </TooltipContent>
            </Tooltip>
          </CardTitle>
        </CardHeader>
        <CardContent className="p-0">
          <Table>
            <TableHeader>
              <TableRow>
                <TableHead>Fund</TableHead>
                <TableHead className="text-right">Gifts</TableHead>
                <TableHead className="text-right">Donors</TableHead>
                <TableHead className="text-right">Total</TableHead>
              </TableRow>
            </TableHeader>
            <TableBody>
              {(funds ?? []).map((fund) => (
                <TableRow key={fund.fund_id}>
                  <TableCell className="font-medium">{fund.fund_name}</TableCell>
                  <TableCell className="text-right tabular-nums">{fund.gift_count}</TableCell>
                  <TableCell className="text-right tabular-nums">{fund.donor_count}</TableCell>
                  <TableCell className="text-right font-medium tabular-nums whitespace-nowrap">
                    {formatMoney(fund.total_cents)}
                  </TableCell>
                </TableRow>
              ))}
            </TableBody>
          </Table>
        </CardContent>
      </Card>
    </div>
  );
}
