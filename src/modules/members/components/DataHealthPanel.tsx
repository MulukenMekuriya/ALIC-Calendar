/**
 * What in the directory needs fixing, and a way straight to it.
 *
 * Each line is how complete one thing is (a status on every adult, a grade on
 * every child, ...), how many are missing it, and why it matters, with a
 * button that opens the directory filtered to exactly those people.
 */

import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/shared/components/ui/card";
import { Button } from "@/shared/components/ui/button";
import { CheckCircle2, ChevronRight } from "lucide-react";
import { cn } from "@/lib/utils";
import { ATTENTION, type Attention, type Health } from "../utils/directory";

interface Props {
  health: Health;
  /** Open the directory filtered to these, or the duplicates review. */
  onReview: (attention: Attention) => void;
}

export function DataHealthPanel({ health, onReview }: Props) {
  const outOf = (who: string) =>
    who === "adults" ? health.adults : who === "children" ? health.children : health.adults + health.children;
  const open = ATTENTION.reduce((n, a) => n + (health.counts[a.key] > 0 ? 1 : 0), 0);

  return (
    <Card>
      <CardHeader>
        <CardTitle className="text-base">Directory health</CardTitle>
        <CardDescription>
          {open === 0
            ? "Nothing is missing. Every adult has a status, an email and a phone, and every child a grade."
            : `${open} ${open === 1 ? "thing needs" : "things need"} attention, among ${(health.adults + health.children).toLocaleString("en-US")} active people. Fixing the first two makes the most difference.`}
        </CardDescription>
      </CardHeader>
      <CardContent className="divide-y p-0">
        {ATTENTION.map((a) => {
          const missing = health.counts[a.key];
          const total = outOf(a.who);
          // Never "100%" while anyone is still missing it.
          const complete =
            total === 0 ? 100 : Math.min(missing > 0 ? 99 : 100, Math.round(((total - missing) / total) * 100));
          return (
            <div key={a.key} className="flex flex-col gap-3 px-6 py-4 sm:flex-row sm:items-center">
              <div className="min-w-0 flex-1">
                <div className="flex flex-wrap items-baseline gap-x-2">
                  <p className="font-medium">{a.label}</p>
                  <p className="text-sm text-muted-foreground">
                    {a.key === "duplicate"
                      ? `${health.duplicateGroups.toLocaleString("en-US")} names, ${missing.toLocaleString("en-US")} records`
                      : `${missing.toLocaleString("en-US")} of ${total.toLocaleString("en-US")} ${a.who}`}
                  </p>
                </div>
                <p className="mt-0.5 text-xs text-muted-foreground">{a.why}</p>
                {a.key !== "duplicate" && (
                  <div className="mt-2 flex items-center gap-2">
                    <div className="h-1.5 w-full max-w-xs overflow-hidden rounded-full bg-muted">
                      <div
                        className={cn(
                          "h-full rounded-full",
                          complete >= 90 ? "bg-emerald-500" : complete >= 60 ? "bg-amber-500" : "bg-rose-500",
                        )}
                        style={{ width: `${complete}%` }}
                      />
                    </div>
                    <span className="w-24 text-xs tabular-nums text-muted-foreground">{complete}% complete</span>
                  </div>
                )}
              </div>
              {missing === 0 ? (
                <span className="inline-flex items-center gap-1.5 text-sm text-emerald-700 dark:text-emerald-400">
                  <CheckCircle2 className="h-4 w-4" aria-hidden /> All done
                </span>
              ) : (
                <Button variant="outline" size="sm" className="self-start sm:self-auto" onClick={() => onReview(a.key)}>
                  Review {(a.key === "duplicate" ? health.duplicateGroups : missing).toLocaleString("en-US")}
                  <ChevronRight className="h-4 w-4" />
                </Button>
              )}
            </div>
          );
        })}
      </CardContent>
    </Card>
  );
}
