/**
 * Your record with the church, in the order it happened.
 *
 * The question this answers is not "how much have I given" — the tile above it
 * says that — but "did it go in". Did the cash in Sunday's envelope reach the
 * ledger. Did somebody write down that my daughter was collected, and by whom.
 * Those are the two things a member has historically had to telephone the
 * office to be sure of, and both were already in this database, filed on three
 * different tabs and never in one order.
 *
 * Every row is merged client-side from queries the portal has already run —
 * see utils/activityFeed, which also carries the rule that keeps unfinished
 * check-ins out of it. No new round trip, and nothing visible here that is not
 * already visible one tab away.
 *
 * The card is deliberately read-only and says so. A member who finds something
 * wrong in it is looking at the finance team's ledger or the check-in desk's
 * record, neither of which is corrected from a login, so the card points at
 * the people who can rather than offering a button that cannot.
 */

import {
  Card,
  CardContent,
  CardDescription,
  CardHeader,
  CardTitle,
} from "@/shared/components/ui/card";
import { Button } from "@/shared/components/ui/button";
import { History, HandCoins, Baby, HandHeart, ArrowRight } from "lucide-react";
import { relativeDay } from "../utils/whenIsIt";
import { buildActivityFeed, type ActivityKind, type ActivityInputs } from "../utils/activityFeed";

/** One icon per kind, so the eye can sort the list before the words are read. */
const KIND_ICON: Record<ActivityKind, typeof HandCoins> = {
  gift: HandCoins,
  child: Baby,
  serving: HandHeart,
};

interface RecentActivityCardProps extends ActivityInputs {
  now: Date;
  onOpenTab: (tab: string) => void;
}

export function RecentActivityCard({
  gifts,
  checkIns,
  serving,
  now,
  onOpenTab,
}: RecentActivityCardProps) {
  const feed = buildActivityFeed({ gifts, checkIns, serving });

  return (
    <Card>
      <CardHeader className="pb-3">
        <CardTitle className="text-base flex items-center gap-2">
          <History className="h-4 w-4" />
          Recent activity
        </CardTitle>
        <CardDescription>
          What the church has recorded about you, newest first — gifts entered,
          children collected, service begun.
        </CardDescription>
      </CardHeader>
      <CardContent className="space-y-3">
        {feed.length === 0 ? (
          <p className="text-sm text-muted-foreground">
            Nothing recorded yet. Gifts appear here once the finance team has
            entered them, which is usually within a week of the Sunday, and
            children's check-ins appear once the Sunday has finished.
          </p>
        ) : (
          <>
            {feed.map((item) => {
              const Icon = KIND_ICON[item.kind];
              return (
                <div key={item.id} className="flex items-start gap-2.5">
                  <div className="mt-0.5 rounded-md bg-muted p-1.5 shrink-0">
                    <Icon className="h-3.5 w-3.5 text-muted-foreground" />
                  </div>
                  <div className="min-w-0 flex-1">
                    <p className="text-sm font-medium truncate">{item.title}</p>
                    <p className="text-xs text-muted-foreground truncate">{item.detail}</p>
                  </div>
                  <p className="text-xs text-muted-foreground whitespace-nowrap pt-0.5">
                    {relativeDay(item.on, now)}
                  </p>
                </div>
              );
            })}

            {/*
              Said once, at the bottom, rather than as a caveat on every row.
              A member who reads this card and finds a gift missing needs to
              know it is not a rendering problem and who can look into it.
            */}
            <p className="text-xs text-muted-foreground border-t pt-3">
              A read-only record. If a gift is missing, the church office can
              check how it was entered; anything about a child is the check-in
              desk's record.
            </p>
            <Button variant="ghost" size="sm" className="-ml-2" onClick={() => onOpenTab("giving")}>
              Every gift
              <ArrowRight className="h-3.5 w-3.5 ml-1.5" />
            </Button>
          </>
        )}
      </CardContent>
    </Card>
  );
}
