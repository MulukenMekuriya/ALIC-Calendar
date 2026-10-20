/**
 * RequestSeasonBanner - where next year's budget requests stand: open until
 * 1 November with the days counting down, in already, closed, or about to
 * open. Says nothing in a branch without a season.
 */

import { CalendarClock, CheckCircle2, Clock, Lock, Plus } from "lucide-react";
import { Button } from "@/shared/components/ui/button";
import { cn } from "@/lib/utils";
import type { RequestSeason } from "../types";
import { canStartRequest, seasonNotice } from "../utils/requestSeason";

interface RequestSeasonBannerProps {
  season: RequestSeason | null | undefined;
  /** The person's ministry already has a request in for the year in season. */
  submitted: boolean;
  onStart: () => void;
  onView: () => void;
}

const TONE = {
  open: {
    box: "border-violet-200 bg-violet-50 dark:border-violet-900 dark:bg-violet-950/40",
    icon: "text-violet-600 dark:text-violet-300",
  },
  urgent: {
    box: "border-amber-300 bg-amber-50 dark:border-amber-800 dark:bg-amber-950/40",
    icon: "text-amber-600 dark:text-amber-300",
  },
  closed: {
    box: "border-slate-200 bg-slate-50 dark:border-slate-800 dark:bg-slate-900/60",
    icon: "text-slate-500 dark:text-slate-400",
  },
  upcoming: {
    box: "border-sky-200 bg-sky-50 dark:border-sky-900 dark:bg-sky-950/40",
    icon: "text-sky-600 dark:text-sky-300",
  },
} as const;

export function RequestSeasonBanner({
  season,
  submitted,
  onStart,
  onView,
}: RequestSeasonBannerProps) {
  const notice = seasonNotice(season, submitted);
  if (!season || !notice) return null;

  const Icon =
    notice.tone === "closed"
      ? Lock
      : submitted && season.state === "open"
        ? CheckCircle2
        : notice.tone === "upcoming"
          ? CalendarClock
          : Clock;

  const showStart = season.state === "open" && !submitted && canStartRequest(season);
  const showView = submitted && !!season.fiscal_year_id;

  return (
    <div
      role="status"
      className={cn(
        "flex flex-col gap-3 rounded-xl border p-4 sm:flex-row sm:items-center sm:justify-between",
        TONE[notice.tone].box,
      )}
    >
      <div className="flex items-start gap-3">
        <Icon className={cn("mt-0.5 h-5 w-5 shrink-0", TONE[notice.tone].icon)} />
        <div className="space-y-0.5">
          <p className="font-semibold leading-snug">{notice.title}</p>
          <p className="text-sm text-muted-foreground">{notice.body}</p>
        </div>
      </div>
      {(showStart || showView) && (
        <div className="flex shrink-0 gap-2">
          {showView && (
            <Button variant="outline" size="sm" onClick={onView}>
              View {season.fiscal_year} requests
            </Button>
          )}
          {showStart && (
            <Button size="sm" onClick={onStart}>
              <Plus className="mr-1.5 h-4 w-4" />
              Start {season.fiscal_year} request
            </Button>
          )}
        </div>
      )}
    </div>
  );
}
