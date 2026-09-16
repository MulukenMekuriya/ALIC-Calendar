/**
 * The portal's front page.
 *
 * WHAT WAS WRONG WITH IT
 * ----------------------
 * It was a receipt. Six numbers about what had already happened — what you
 * gave, how many people are in your household, how many ministries you serve
 * in — and a button to give again. Nothing on it answered the two questions a
 * member actually opens a church app to ask:
 *
 *     What is happening next?
 *     Is anything waiting on me?
 *
 * And two of the six numbers led nowhere at all. "Serving 2" and "Groups 1"
 * were counted in church.my_portal_summary and then had no screen behind them,
 * so the page told a member a number about their own life and declined to say
 * what it was made of.
 *
 * WHAT IT IS NOW, TOP TO BOTTOM
 * -----------------------------
 *   1. The next thing on, if there is one. Live events say "Happening now".
 *   2. Anything waiting on the member — see utils/nextSteps for the two rules
 *      that decide what earns a place there and why invitations are capped.
 *   3. The four numbers, each one now a door into the tab or the card that
 *      explains it.
 *   4. What is on, beside what the church has recently recorded about this
 *      member — the one question a giving record has to be able to answer on
 *      demand, which is "did it go in".
 *   5. Birthdays in the household this month, when there are any.
 *
 * Giving is not a section. The front page carries this year's total on a tile
 * that opens My giving, and My giving holds the year-by-year chart, the
 * statements and every individual gift — one place, rather than a summary on
 * the overview that has to be kept in step with the tab behind it.
 *
 * Every section renders only when it has something to say. A new member with
 * no giving, no group and no children sees the events, the invitation and the
 * welcome — not six empty frames explaining what would have been there.
 */

import {
  Card,
  CardContent,
  CardDescription,
  CardHeader,
  CardTitle,
} from "@/shared/components/ui/card";
import { Button } from "@/shared/components/ui/button";
import { Separator } from "@/shared/components/ui/separator";
import {
  CalendarDays,
  HandCoins,
  HandHeart,
  Home,
  Users,
  MapPin,
  Cake,
  ArrowRight,
  AlertTriangle,
  CircleCheck,
  Sparkles,
  ChevronRight,
} from "lucide-react";
import { formatMoney, formatMoneyShort } from "@/modules/giving/utils/money";
import type { MyGivingYear } from "@/modules/giving/types";
import type { MyCard } from "@/modules/workflows/types";
import { useMyGiving } from "@/modules/giving/hooks";
import {
  useMyServing,
  useMyGroups,
  useMyUpcomingEvents,
  useMyChildrenCheckIns,
} from "../hooks";
import { buildNextSteps, type NextStep } from "../utils/nextSteps";
import {
  describeWhen,
  describeMeeting,
  birthdaysThisMonth,
  monthName,
} from "../utils/whenIsIt";
import { lastCompletedYear } from "../utils/givingBars";
import { WhatsOnCard } from "./WhatsOnCard";
import { RecentActivityCard } from "./RecentActivityCard";
import type { PortalSummary, HouseholdMemberRow, MyChild } from "../types";

interface OverviewTabProps {
  organizationId: string | undefined;
  summary: PortalSummary | undefined;
  household: HouseholdMemberRow[] | undefined;
  /*
   * `myChildren`, not `children`: a React component prop called `children` is
   * the slot JSX puts nested elements in, so passing the member's children
   * through it would be a name collision between two completely different
   * meanings of the word, and one that reads as correct at every call site.
   */
  myChildren: MyChild[] | undefined;
  givingYears: MyGivingYear[] | undefined;
  myCards: MyCard[] | undefined;
  onOpenTab: (tab: string) => void;
  /**
   * Injected rather than read from the clock inside, so that every "is it on
   * now", "is the statement ready" and "whose birthday is it" decision on this
   * page is made against ONE instant. Read separately they can disagree by a
   * millisecond across midnight, and the page would say "Tomorrow" in one
   * place and "Today" in another.
   */
  now: Date;
}

/* ------------------------------------------------------------------------ *
 * A number you can open                                                    *
 * ------------------------------------------------------------------------ */
//
// A real <button>, not a Card with an onClick: this has to be reachable by
// keyboard and announced as something that does something, and a div with a
// click handler is neither.
function StatTile({
  label,
  value,
  hint,
  icon: Icon,
  onClick,
}: {
  label: string;
  value: string;
  hint: string;
  icon: typeof Home;
  onClick: () => void;
}) {
  return (
    <button
      type="button"
      onClick={onClick}
      className="group text-left rounded-lg border bg-card p-4 transition-colors hover:bg-accent/40 hover:border-primary/40 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring"
    >
      <div className="flex items-center justify-between">
        <p className="text-xs uppercase tracking-wide text-muted-foreground">{label}</p>
        <Icon className="h-3.5 w-3.5 text-muted-foreground/60" />
      </div>
      <p className="mt-1 text-2xl font-bold tabular-nums">{value}</p>
      <p className="text-xs text-muted-foreground truncate flex items-center gap-0.5">
        {hint}
        <ChevronRight className="h-3 w-3 opacity-0 transition-opacity group-hover:opacity-70" />
      </p>
    </button>
  );
}

/* ------------------------------------------------------------------------ *
 * Waiting on you                                                           *
 * ------------------------------------------------------------------------ */
//
// Tone drives colour and nothing else drives colour. An overdue follow-up is
// the only thing on this page allowed to be red, because it is the only thing
// on it where another person is waiting.
const TONE_STYLE: Record<NextStep["tone"], { border: string; icon: typeof AlertTriangle; tint: string }> = {
  attention: { border: "border-l-destructive", icon: AlertTriangle, tint: "text-destructive" },
  todo: { border: "border-l-primary", icon: CircleCheck, tint: "text-primary" },
  offer: { border: "border-l-muted-foreground/40", icon: Sparkles, tint: "text-muted-foreground" },
};

function NextStepRow({ step, onOpenTab }: { step: NextStep; onOpenTab: (tab: string) => void }) {
  const tone = TONE_STYLE[step.tone];
  const Icon = tone.icon;
  return (
    <div className={`flex flex-col gap-2 border-l-2 ${tone.border} pl-3 sm:flex-row sm:items-center sm:justify-between`}>
      <div className="flex items-start gap-2 min-w-0">
        <Icon className={`h-4 w-4 mt-0.5 shrink-0 ${tone.tint}`} />
        <div className="min-w-0">
          <p className="text-sm font-medium">{step.title}</p>
          <p className="text-xs text-muted-foreground">{step.detail}</p>
        </div>
      </div>
      {step.tab && (
        <Button
          variant={step.tone === "attention" ? "default" : "ghost"}
          size="sm"
          className="shrink-0 self-start sm:self-auto"
          onClick={() => onOpenTab(step.tab!)}
        >
          {step.actionLabel}
          <ArrowRight className="h-3.5 w-3.5 ml-1.5" />
        </Button>
      )}
    </div>
  );
}

export function OverviewTab({
  organizationId,
  summary,
  household,
  myChildren,
  givingYears,
  myCards,
  onOpenTab,
  now,
}: OverviewTabProps) {
  const linked = summary?.linked === true;
  const { data: serving } = useMyServing(linked);
  const { data: groups } = useMyGroups(linked);
  const { data: events } = useMyUpcomingEvents(organizationId, 4);
  /*
   * Read here rather than taken as props, and deliberately keyed to ALL years
   * and the same 30-row window the children tab uses. React Query dedupes them
   * against the page's own copies, so this costs nothing — and it means the
   * activity feed cannot be bent by the year buttons on the giving tab, which
   * own a different query key the moment a member picks a year.
   */
  const { data: gifts } = useMyGiving(null);
  const { data: checkIns } = useMyChildrenCheckIns(30, linked);

  const steps = buildNextSteps({
    linked,
    phone: summary?.phone,
    email: summary?.email,
    householdSize: summary?.household_size,
    servingCount: summary?.serving_count,
    groupCount: summary?.group_count,
    children: myChildren ?? [],
    givingYears: givingYears ?? [],
    cards: myCards ?? [],
    today: now,
  });

  // Only the baseline, for the "Given this year" tile: $0.00 with nothing to
  // read it against is a number a member cannot interpret. The chart itself is
  // on My giving.
  const lastYear = lastCompletedYear(givingYears ?? [], now.getFullYear());
  const birthdays = birthdaysThisMonth(household ?? [], now);

  const next = events?.[0];
  const nextWhen = next ? describeWhen(next.starts_at, next.ends_at, now) : null;

  // Named on the tiles so "Serving 2" stops being a number and starts being a
  // place. The count still comes from the summary — these lists are the same
  // rows, but the summary is one round trip and arrives first.
  //
  // Only the first of each is used here. The full lists live on My details,
  // which is where both tiles lead: MyServingCard renders the ministry
  // assignments and MyGroupsCard renders the groups, and both are editable
  // there — so a tile that reads "Serving 0" is now a door and not a verdict.
  const primaryMinistry =
    serving?.find((s) => s.is_primary_role)?.ministry_name ?? serving?.[0]?.ministry_name;
  const firstGroupMeeting = groups?.[0]
    ? describeMeeting(groups[0].meeting_day, groups[0].meeting_time, null)
    : "";

  return (
    <div className="space-y-4">
      {/* ---------------------------------------------------------------- *
       * 1. The next thing on                                             *
       * ---------------------------------------------------------------- */}
      {next && nextWhen && (
        <Card className="border-primary/30 bg-primary/[0.03]">
          <CardContent className="pt-5 pb-5">
            <div className="flex flex-col gap-3 sm:flex-row sm:items-center sm:justify-between">
              <div className="min-w-0">
                <div className="flex items-center gap-2 text-xs font-medium uppercase tracking-wide text-primary">
                  {nextWhen.isNow ? (
                    <>
                      {/* Two spans, one animating: a single pulsing dot is easy
                          to mistake for a rendering artefact, a ring spreading
                          out of a solid centre reads as live. */}
                      <span className="relative flex h-2 w-2">
                        <span className="absolute inline-flex h-full w-full animate-ping rounded-full bg-primary opacity-75" />
                        <span className="relative inline-flex h-2 w-2 rounded-full bg-primary" />
                      </span>
                      Happening now
                    </>
                  ) : (
                    <>
                      <CalendarDays className="h-3.5 w-3.5" />
                      {nextWhen.label}
                    </>
                  )}
                </div>
                <p className="mt-1 text-lg font-semibold truncate">{next.title}</p>
                {next.room_name && (
                  <p className="text-sm text-muted-foreground flex items-center gap-1">
                    <MapPin className="h-3.5 w-3.5" />
                    {next.room_name}
                  </p>
                )}
              </div>
            </div>
          </CardContent>
        </Card>
      )}

      {/* ---------------------------------------------------------------- *
       * 2. Waiting on you                                                *
       * ---------------------------------------------------------------- */}
      {steps.length > 0 && (
        <Card>
          <CardHeader className="pb-3">
            <CardTitle className="text-base">Waiting on you</CardTitle>
            <CardDescription>
              Short on purpose. When there is nothing here, this card does not
              appear at all.
            </CardDescription>
          </CardHeader>
          <CardContent className="space-y-3">
            {steps.map((step, index) => (
              <div key={step.id} className="space-y-3">
                {index > 0 && <Separator />}
                <NextStepRow step={step} onOpenTab={onOpenTab} />
              </div>
            ))}
          </CardContent>
        </Card>
      )}

      {/* ---------------------------------------------------------------- *
       * 3. Four numbers, each one a door                                 *
       * ---------------------------------------------------------------- */}
      <div className="grid gap-3 grid-cols-2 lg:grid-cols-4">
        <StatTile
          label="Given this year"
          value={formatMoney(summary?.giving_this_year_cents ?? 0)}
          hint={
            lastYear
              ? `${lastYear.tax_year}: ${formatMoneyShort(lastYear.total_cents)}`
              : summary?.last_gift_on
                ? `last gift ${summary.last_gift_on}`
                : "no gifts recorded"
          }
          icon={HandCoins}
          onClick={() => onOpenTab("giving")}
        />
        <StatTile
          label="Household"
          value={String(summary?.household_size ?? 0)}
          hint={summary?.household_name ?? "no household on record"}
          icon={Home}
          onClick={() => onOpenTab("household")}
        />
        <StatTile
          label="Serving"
          value={String(summary?.serving_count ?? 0)}
          hint={primaryMinistry ?? "not serving yet"}
          icon={HandHeart}
          onClick={() => onOpenTab("details")}
        />
        <StatTile
          label="Groups"
          value={String(summary?.group_count ?? 0)}
          hint={firstGroupMeeting || "home cells and studies"}
          icon={Users}
          onClick={() => onOpenTab("details")}
        />
      </div>

      {/* ---------------------------------------------------------------- *
       * 4. What is coming, beside what has been recorded                 *
       * ---------------------------------------------------------------- */}
      <div className="grid gap-4 lg:grid-cols-2">
        <WhatsOnCard events={events} now={now} skipFirst />

        <RecentActivityCard
          gifts={gifts ?? []}
          checkIns={checkIns ?? []}
          serving={serving ?? []}
          now={now}
          onOpenTab={onOpenTab}
        />
      </div>

      {/* ---------------------------------------------------------------- *
       * 5. Birthdays                                                     *
       * ---------------------------------------------------------------- */}
      {/*
        A month and no day, because church.people has never carried a birth
        day. That is a smaller promise than most church software makes and it
        is one this database can keep: enough to mention it to somebody on
        Sunday, not enough to put a date on a card and get it wrong.
      */}
      {birthdays.length > 0 && (
        <Card>
          <CardContent className="pt-5 flex items-start gap-3">
            <Cake className="h-4 w-4 mt-0.5 text-muted-foreground shrink-0" />
            <p className="text-sm">
              <span className="text-muted-foreground">Birthdays in {monthName(now)}: </span>
              {birthdays.map((person, index) => (
                <span key={person.person_id}>
                  {index > 0 && ", "}
                  <span className="font-medium">{person.display_name}</span>
                  {person.is_me && <span className="text-muted-foreground"> (you)</span>}
                </span>
              ))}
            </p>
          </CardContent>
        </Card>
      )}
    </div>
  );
}
