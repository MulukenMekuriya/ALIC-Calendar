/**
 * Giving, year by year.
 *
 * Moved off the overview and onto the My giving tab, where the year buttons,
 * the statements and every individual gift already are. The overview keeps
 * only the one number a front page should carry — this year's total, on a tile
 * that opens this tab.
 *
 * No percentage change is shown anywhere, and that is deliberate: the current
 * year is partial and last year is complete, so "down 34%" in September means
 * nothing except that September is not December. The reasoning, and the
 * scaling rules, are in utils/givingBars.
 */

import { Card, CardContent, CardHeader, CardTitle } from "@/shared/components/ui/card";
import { TrendingUp } from "lucide-react";
import { formatMoneyShort } from "@/modules/giving/utils/money";
import type { MyGivingYear } from "@/modules/giving/types";
import { buildGivingBars } from "../utils/givingBars";

interface GivingByYearCardProps {
  years: MyGivingYear[] | undefined;
  now: Date;
}

export function GivingByYearCard({ years, now }: GivingByYearCardProps) {
  const currentYear = now.getFullYear();
  const bars = buildGivingBars(years ?? [], currentYear);

  // One bar is not a comparison, and a chart of it is a rectangle. The year
  // buttons above already say the number.
  if (bars.length < 2) return null;

  return (
    <Card>
      <CardHeader className="pb-3">
        <CardTitle className="text-base flex items-center gap-2">
          <TrendingUp className="h-4 w-4" />
          Year by year
        </CardTitle>
      </CardHeader>
      <CardContent className="space-y-2">
        {bars.map((bar) => (
          <div key={bar.year} className="flex items-center gap-3">
            <span className="w-10 shrink-0 text-xs tabular-nums text-muted-foreground">
              {bar.year}
            </span>
            <div className="h-2 flex-1 rounded-full bg-muted overflow-hidden">
              <div
                /* The running year is striped rather than solid, so the
                   shortest bar is visibly shorter because the year is not
                   over, not because the member gave less. */
                className={
                  bar.inProgress
                    ? "h-full rounded-full bg-primary/50 bg-[repeating-linear-gradient(45deg,transparent,transparent_3px,rgba(255,255,255,0.45)_3px,rgba(255,255,255,0.45)_6px)]"
                    : "h-full rounded-full bg-primary"
                }
                style={{ width: `${bar.widthPercent}%` }}
              />
            </div>
            <span className="w-20 shrink-0 text-right text-xs tabular-nums font-medium">
              {formatMoneyShort(bar.totalCents)}
            </span>
          </div>
        ))}
        <p className="text-xs text-muted-foreground pt-1">
          {currentYear} is still running, so its bar is striped and is not a
          like-for-like comparison with a finished year.
        </p>
      </CardContent>
    </Card>
  );
}
