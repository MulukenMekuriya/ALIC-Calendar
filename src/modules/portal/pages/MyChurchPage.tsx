/**
 * My Church — the member-facing side of the app.
 *
 * Until now a signed-in member could edit their phone number and see their
 * ministry assignments, and that was the whole of it. Everything else the
 * church knew about them was reachable only by telephoning the office.
 *
 * WHAT THIS DELIBERATELY DOES NOT SHOW
 * ------------------------------------
 *  - A household giving total. The portal shows what THIS PERSON gave; the
 *    household figure belongs on the statement the treasurer issues, which the
 *    household receives together. Putting a spouse's total behind one login
 *    turns a shared document into something one spouse can look up about the
 *    other.
 *  - Where a child is right now. The kids history is history: finished
 *    Sundays, and who collected them. Live room location is a question asked
 *    of a person standing at the check-in desk, not of any login that can be
 *    phished.
 *
 * THE OVERVIEW IS NO LONGER A RECEIPT
 * -----------------------------------
 * It used to be six numbers about the past and a button. It now leads with
 * what is happening next and what is waiting on the member, and every number
 * on it opens the thing it counts. The composition lives in
 * components/OverviewTab, which carries its own reasoning; this file keeps the
 * tabs, the routing and the data the tabs share.
 *
 * AND IT IS NO LONGER READ-ONLY
 * -----------------------------
 * Four things a member knows better than the office does are now theirs to
 * change: their household's address and telephone number, the children of
 * that household, the ministries they serve in, and the group they attend.
 * Each tab's component carries the argument for its own boundary, and the
 * boundaries themselves are drawn in the database — see the header of
 * supabase/migrations/20260322080000, which is the one place to read if the
 * question is "why can a member do THAT but not THIS".
 *
 * The short version: a member may correct facts about themselves and their own
 * household. They may not add an adult to a household (it decides who may
 * collect a child), remove anybody (removal is not discoverable), touch
 * medical or custody records (those are read at the desk with the child
 * standing there), or give themselves a leadership role (the leadership
 * reports are the church's account of who runs what, not a self-description).
 */

import { useMemo, useState } from "react";
import { useSearchParams } from "react-router-dom";
import DashboardLayout from "@/shared/components/layout/DashboardLayout";
import {
  Card,
  CardContent,
  CardDescription,
  CardHeader,
  CardTitle,
} from "@/shared/components/ui/card";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/shared/components/ui/tabs";
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from "@/shared/components/ui/table";
import { Badge } from "@/shared/components/ui/badge";
import { Button } from "@/shared/components/ui/button";
import {
  Loader2,
  UserRound,
  HandCoins,
  Info,
  Route,
  Phone,
} from "lucide-react";
import { useAuth } from "@/shared/contexts/AuthContext";
import { useOrganization } from "@/shared/contexts/OrganizationContext";
import { MyInformation } from "@/modules/members/components/MyInformation";
import { useMyGiving, useMyGivingYears } from "@/modules/giving/hooks";
import { formatMoney, METHOD_LABELS } from "@/modules/giving/utils/money";
import { greeting } from "../utils/whenIsIt";
import {
  OverviewTab,
  MyStatementButton,
  GiveButton,
  WhatsOnCard,
  MyGroupsCard,
  MyServingCard,
  MyRecordCard,
  HouseholdTab,
  ChildrenTab,
  GivingByYearCard,
} from "../components";
import { useMyWorkflowCards } from "@/modules/workflows/hooks";
import {
  usePortalSummary,
  useMyHouseholdMembers,
  useMyChildren,
  useMyChildrenCheckIns,
  useMyUpcomingEvents,
} from "../hooks";

/**
 * Tab triggers tall enough to hit with a thumb, back to their normal height on
 * a pointer. py-3 over a 20px line box is the 44px a finger needs; the
 * primitive's py-1.5 gives 30, which is a coin toss between two tabs.
 */
const TAB = "py-3 sm:py-1.5";

export default function MyChurchPage() {
  const { user } = useAuth();
  const { currentOrganization } = useOrganization();
  const orgId = currentOrganization?.id;
  /*
   * The tab lives in the URL so a section survives a reload and can be linked
   * to directly. No sidebar item points here any more — "My Children" was a
   * second entry for a tab this page already had, and was removed — but the
   * tab strip is still the only way in, so the URL has to carry it. Derived
   * rather than held in state: `children` and `myCards` arrive asynchronously,
   * and a useState seeded before they load would keep whichever tab was legal
   * at mount and ignore the one actually asked for.
   */
  const [searchParams, setSearchParams] = useSearchParams();
  const setTab = (next: string) =>
    setSearchParams(
      (prev) => {
        const p = new URLSearchParams(prev);
        if (next === "overview") p.delete("tab");
        else p.set("tab", next);
        return p;
      },
      // A tab is not a place you want to press Back through six times.
      { replace: true }
    );

  const { data: summary, isLoading } = usePortalSummary(orgId);
  const linked = summary?.linked === true;

  const { data: household } = useMyHouseholdMembers(linked);
  const { data: children } = useMyChildren(linked);
  const { data: checkIns } = useMyChildrenCheckIns(30, linked);
  const { data: givingYears } = useMyGivingYears();
  const [givingYear, setGivingYear] = useState<number | null>(null);
  const { data: gifts } = useMyGiving(givingYear);
  const { data: myCards } = useMyWorkflowCards(orgId);
  /*
   * Fetched here rather than inside OverviewTab, because the unlinked panel
   * shows the same list and OverviewTab never renders for an unlinked login.
   * React Query dedupes the two readers on the shared key, so this is one
   * request either way.
   */
  const { data: unlinkedEvents } = useMyUpcomingEvents(orgId, 4);

  /*
   * ONE instant for the whole render.
   *
   * The overview asks the clock four separate questions — is this event on
   * now, is last year's statement ready, whose birthday is this month, is it
   * morning — and if each one called `new Date()` they could land either side
   * of midnight and contradict each other. Memoised on mount rather than
   * ticking: this is a page somebody reads for thirty seconds, and a heading
   * that changes itself while being read is a distraction, not a feature.
   */
  const now = useMemo(() => new Date(), []);

  // Years a statement can honestly be issued for: everything before the one
  // being lived. Newest first, because that is the one anybody asks for.
  const closedGivingYears = (givingYears ?? [])
    .filter((year) => year.tax_year < now.getFullYear())
    .sort((a, b) => b.tax_year - a.tax_year);

  const hasCards = (myCards?.length ?? 0) > 0;

  // Only tabs that are actually rendered; anything else falls back rather than
  // showing a tab strip with nothing selected.
  const TABS = ["overview", "household", "giving", "children", "details"];
  const requested = searchParams.get("tab") ?? "overview";
  const tab = TABS.includes(requested) || (requested === "followups" && hasCards)
    ? requested
    : "overview";

  if (isLoading) {
    return (
      <DashboardLayout>
        <div className="flex items-center justify-center py-20 text-muted-foreground">
          <Loader2 className="h-5 w-5 animate-spin mr-2" />
          Loading your details…
        </div>
      </DashboardLayout>
    );
  }

  return (
    <DashboardLayout>
      <div className="space-y-4 sm:space-y-6">
        <div className="flex flex-col gap-3 sm:flex-row sm:items-start sm:justify-between">
          <div className="flex items-start gap-3">
            <div className="p-2 rounded-xl bg-primary/10">
              <UserRound className="h-6 w-6 text-primary" />
            </div>
            {/*
              The greeting is keyed to the reader's own clock, and the standing
              of the person reading it sits directly under their name.

              "You are recorded as Member since 2019" used to be a sentence
              stranded at the bottom of the overview, below a giving card,
              under everything else — which is a strange place to put the one
              line on the page that says what this person is to the church.
            */}
            <div>
              <h1 className="text-2xl sm:text-3xl font-bold">
                {summary?.display_name
                  ? `${greeting(now)}, ${summary.display_name.split(" ")[0]}`
                  : "My Church"}
              </h1>
              <div className="mt-1 flex flex-wrap items-center gap-x-2 gap-y-1 text-sm text-muted-foreground">
                <span>{currentOrganization?.name ?? ""}</span>
                {summary?.membership_status && (
                  <>
                    <span aria-hidden>·</span>
                    <Badge variant="secondary">{summary.membership_status}</Badge>
                  </>
                )}
                {summary?.member_since && (
                  <>
                    <span aria-hidden>·</span>
                    <span>since {summary.member_since}</span>
                  </>
                )}
              </div>
            </div>
          </div>
          <GiveButton />
        </div>

        {!linked ? (
          /*
           * An account waiting to be linked is not a dead end.
           *
           * It cannot be shown a household, a gift or a child, because there
           * is no member record to read any of those from. It CAN be shown
           * what is on at church — that calendar is published to anonymous
           * visitors already — and it can still be used to give and to correct
           * a phone number. What was here before was the apology alone.
           */
          <div className="space-y-4">
            <Card>
              <CardHeader>
                <CardTitle className="text-base flex items-center gap-2">
                  <Info className="h-4 w-4" />
                  Your login is not linked to a member record yet
                </CardTitle>
                <CardDescription>
                  Until an administrator links them, we cannot show your
                  household, your giving or your children's check-ins here. You
                  can still update your own contact details below, and giving
                  online works either way.
                </CardDescription>
              </CardHeader>
              <CardContent>
                <MyInformation userId={user?.id} />
              </CardContent>
            </Card>
            <WhatsOnCard events={unlinkedEvents} now={now} />
          </div>
        ) : (
          <Tabs value={tab} onValueChange={setTab}>
            {/*
              Two full-width tabs per row on a phone, the ordinary strip from
              sm up. It used to be one wrapping inline strip at every width,
              which on a 375px screen packed six labels into three rows of
              pills about thirty pixels tall — legible, but a thumb hits the
              wrong one, and "My giving" sitting hard against "My children"
              gives nothing away about where one stops.
            */}
            <TabsList className="grid w-full grid-cols-2 gap-1 h-auto p-1 sm:inline-flex sm:h-10 sm:w-auto sm:gap-0">
              <TabsTrigger value="overview" className={TAB}>Overview</TabsTrigger>
              <TabsTrigger value="household" className={TAB}>My household</TabsTrigger>
              <TabsTrigger value="giving" className={TAB}>My giving</TabsTrigger>
              <TabsTrigger value="children" className={TAB}>My children</TabsTrigger>
              {hasCards && (
                <TabsTrigger value="followups" className={TAB}>My follow-ups</TabsTrigger>
              )}
              <TabsTrigger value="details" className={TAB}>My details</TabsTrigger>
            </TabsList>

            {/* ------------------------------------------------------------ */}
            <TabsContent value="overview" className="mt-4">
              <OverviewTab
                organizationId={orgId}
                summary={summary}
                household={household}
                myChildren={children}
                givingYears={givingYears}
                myCards={myCards}
                onOpenTab={setTab}
                now={now}
              />
            </TabsContent>

            {/* ------------------------------------------------------------ */}
            {/* The roster comes down with the page, because the overview reads
                it too; the address and the edit buttons are HouseholdTab's own
                business and are fetched when the tab is opened. */}
            <TabsContent value="household" className="mt-4">
              <HouseholdTab
                household={household}
                organizationId={orgId}
                enabled={linked}
              />
            </TabsContent>

            {/* ------------------------------------------------------------ */}
            <TabsContent value="giving" className="mt-4 space-y-4">
              <Card>
                <CardHeader className="pb-3">
                  <div className="flex flex-wrap items-start justify-between gap-3">
                    <div>
                      <CardTitle className="text-base flex items-center gap-2">
                        <HandCoins className="h-4 w-4" />
                        My giving
                      </CardTitle>
                      <CardDescription>
                        Gifts recorded against your own name. Your household's
                        year-end statement comes from the church office and may
                        include more than this.
                      </CardDescription>
                    </div>
                    <GiveButton />
                  </div>
                </CardHeader>
                <CardContent>
                  {(givingYears?.length ?? 0) === 0 ? (
                    <p className="text-sm text-muted-foreground">
                      Nothing recorded yet. Gifts show up here once the finance
                      team has entered or imported them, which is usually within
                      a week.
                    </p>
                  ) : (
                    <div className="space-y-4">
                      <div className="flex flex-wrap gap-2">
                        <Button
                          variant={givingYear === null ? "default" : "outline"}
                          size="sm"
                          onClick={() => setGivingYear(null)}
                        >
                          All years
                        </Button>
                        {givingYears!.map((year) => (
                          <Button
                            key={year.tax_year}
                            variant={givingYear === year.tax_year ? "default" : "outline"}
                            size="sm"
                            onClick={() => setGivingYear(year.tax_year)}
                          >
                            {year.tax_year} · {formatMoney(year.total_cents)}
                          </Button>
                        ))}
                      </div>

                      {/*
                        Statements for finished years only.

                        A contribution statement is a document about a closed
                        year — it is what somebody attaches to a tax return.
                        Offering one for the year still running would produce a
                        piece of paper headed "2026 Contribution Statement"
                        that stops in September and is wrong the moment the
                        next gift is recorded. The running year's total is on
                        the button above, where a running total belongs.
                      */}
                      {closedGivingYears.length > 0 && (
                        <div className="flex flex-wrap items-center gap-2 border-t pt-4">
                          <span className="text-sm text-muted-foreground mr-1">
                            Statements:
                          </span>
                          {closedGivingYears.map((year) => (
                            <MyStatementButton
                              key={year.tax_year}
                              organizationId={orgId}
                              year={year.tax_year}
                            />
                          ))}
                        </div>
                      )}
                    </div>
                  )}
                </CardContent>
              </Card>

              <GivingByYearCard years={givingYears} now={now} />

              {(gifts?.length ?? 0) > 0 && (
                <Card>
                  <CardContent className="p-0">
                    <Table>
                      <TableHeader>
                        <TableRow>
                          <TableHead>Date</TableHead>
                          <TableHead>Fund</TableHead>
                          <TableHead>Method</TableHead>
                          <TableHead className="text-right">Amount</TableHead>
                        </TableRow>
                      </TableHeader>
                      <TableBody>
                        {gifts!.map((gift) => (
                          <TableRow key={gift.id}>
                            <TableCell className="whitespace-nowrap">{gift.received_on}</TableCell>
                            <TableCell>
                              {gift.fund_name}
                              {!gift.is_tax_deductible && (
                                <Badge variant="secondary" className="ml-1.5">
                                  not deductible
                                </Badge>
                              )}
                            </TableCell>
                            <TableCell>{METHOD_LABELS[gift.method] ?? gift.method}</TableCell>
                            <TableCell className="text-right font-medium tabular-nums whitespace-nowrap">
                              {formatMoney(gift.amount_cents)}
                            </TableCell>
                          </TableRow>
                        ))}
                      </TableBody>
                    </Table>
                  </CardContent>
                </Card>
              )}
            </TabsContent>

            {/* ------------------------------------------------------------ */}
            {/* Always rendered, never gated on hasChildren: `children` arrives
                asynchronously, so gating would pop the tab into the strip a
                beat after the page settled, and a household that gains a child
                should not have to hunt for where its history went. The empty
                state inside says plainly when there is nothing to show — and
                now offers to add the first one. */}
            <TabsContent value="children" className="mt-4">
              <ChildrenTab
                children={children}
                checkIns={checkIns}
                organizationId={orgId}
                enabled={linked}
              />
            </TabsContent>

            {/* ------------------------------------------------------------ */}
            {hasCards && (
              <TabsContent value="followups" className="mt-4">
                <Card>
                  <CardHeader className="pb-3">
                    <CardTitle className="text-base flex items-center gap-2">
                      <Route className="h-4 w-4" />
                      People you are following up
                    </CardTitle>
                    <CardDescription>
                      Open the Follow-up screen to add a note or move a card on.
                    </CardDescription>
                  </CardHeader>
                  <CardContent className="p-0">
                    <Table>
                      <TableHeader>
                        <TableRow>
                          <TableHead>Person</TableHead>
                          <TableHead>Step</TableHead>
                          <TableHead>Due</TableHead>
                          <TableHead>Phone</TableHead>
                        </TableRow>
                      </TableHeader>
                      <TableBody>
                        {myCards!.map((card) => (
                          <TableRow key={card.card_id}>
                            <TableCell className="font-medium">{card.person_name}</TableCell>
                            <TableCell>{card.step_name ?? "—"}</TableCell>
                            <TableCell>
                              {card.is_overdue ? (
                                <span className="font-medium text-destructive">
                                  {card.due_on}
                                </span>
                              ) : (
                                (card.due_on ?? "—")
                              )}
                            </TableCell>
                            <TableCell>
                              {card.person_phone ? (
                                <a
                                  href={`tel:${card.person_phone}`}
                                  className="inline-flex items-center gap-1 hover:underline"
                                >
                                  <Phone className="h-3.5 w-3.5" />
                                  {card.person_phone}
                                </a>
                              ) : (
                                "—"
                              )}
                            </TableCell>
                          </TableRow>
                        ))}
                      </TableBody>
                    </Table>
                  </CardContent>
                </Card>
              </TabsContent>
            )}

            {/* ------------------------------------------------------------ */}
            {/*
              Everything the church has on record ABOUT THIS PERSON, and every
              part of it they may correct themselves: their own contact
              details, where they serve, and which group they are in.

              Drawn from the portal's own components rather than from
              members/MyInformation, which used to be rendered here whole. Two
              of its three cards were wrong in this context — its household
              card duplicated the tab next door, and its serving card resolved
              ministry names through budget.ministries, which a member cannot
              read, so it showed "Unknown ministry". MyRecordCard says why at
              greater length.
            */}
            <TabsContent value="details" className="mt-4 space-y-4">
              <MyRecordCard userId={user?.id} />
              <MyServingCard organizationId={orgId} enabled={linked} />
              <MyGroupsCard organizationId={orgId} enabled={linked} />
            </TabsContent>
          </Tabs>
        )}
      </div>
    </DashboardLayout>
  );
}
