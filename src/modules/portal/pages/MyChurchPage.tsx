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
 */

import { useState } from "react";
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
  Home,
  HandCoins,
  Baby,
  HandHeart,
  ExternalLink,
  Info,
  Route,
  Phone,
} from "lucide-react";
import { useAuth } from "@/shared/contexts/AuthContext";
import { useOrganization } from "@/shared/contexts/OrganizationContext";
import { STRIPE_GIVING_URL } from "@/shared/constants/giving";
import { MyInformation } from "@/modules/members/components/MyInformation";
import { useMyGiving, useMyGivingYears } from "@/modules/giving/hooks";
import { formatMoney, METHOD_LABELS } from "@/modules/giving/utils/money";
import { useMyWorkflowCards } from "@/modules/workflows/hooks";
import {
  usePortalSummary,
  useMyHouseholdMembers,
  useMyChildren,
  useMyChildrenCheckIns,
} from "../hooks";

function GiveButton({ className }: { className?: string }) {
  return (
    <Button asChild className={className}>
      <a href={STRIPE_GIVING_URL} target="_blank" rel="noopener noreferrer">
        <HandCoins className="h-4 w-4 mr-1" />
        Give online
        <ExternalLink className="h-3.5 w-3.5 ml-1.5 opacity-70" />
      </a>
    </Button>
  );
}

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

  const hasChildren = (children?.length ?? 0) > 0;
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
            <div>
              <h1 className="text-2xl sm:text-3xl font-bold">
                {summary?.display_name ? `Welcome, ${summary.display_name.split(" ")[0]}` : "My Church"}
              </h1>
              <p className="text-sm text-muted-foreground mt-1">
                {currentOrganization?.name ?? ""}
              </p>
            </div>
          </div>
          <GiveButton />
        </div>

        {!linked ? (
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
        ) : (
          <Tabs value={tab} onValueChange={setTab}>
            <TabsList className="flex-wrap h-auto">
              <TabsTrigger value="overview">Overview</TabsTrigger>
              <TabsTrigger value="household">My household</TabsTrigger>
              <TabsTrigger value="giving">My giving</TabsTrigger>
              <TabsTrigger value="children">My children</TabsTrigger>
              {hasCards && <TabsTrigger value="followups">My follow-ups</TabsTrigger>}
              <TabsTrigger value="details">My details</TabsTrigger>
            </TabsList>

            {/* ------------------------------------------------------------ */}
            <TabsContent value="overview" className="mt-4 space-y-4">
              <div className="grid gap-3 grid-cols-2 lg:grid-cols-4">
                <Card><CardContent className="pt-5">
                  <p className="text-xs uppercase tracking-wide text-muted-foreground">
                    Given this year
                  </p>
                  <p className="mt-1 text-2xl font-bold tabular-nums">
                    {formatMoney(summary?.giving_this_year_cents ?? 0)}
                  </p>
                  <p className="text-xs text-muted-foreground">
                    {summary?.last_gift_on ? `last gift ${summary.last_gift_on}` : "no gifts recorded"}
                  </p>
                </CardContent></Card>
                <Card><CardContent className="pt-5">
                  <p className="text-xs uppercase tracking-wide text-muted-foreground">Household</p>
                  <p className="mt-1 text-2xl font-bold tabular-nums">
                    {summary?.household_size ?? 0}
                  </p>
                  <p className="text-xs text-muted-foreground truncate">
                    {summary?.household_name ?? "no household on record"}
                  </p>
                </CardContent></Card>
                <Card><CardContent className="pt-5">
                  <p className="text-xs uppercase tracking-wide text-muted-foreground">Serving</p>
                  <p className="mt-1 text-2xl font-bold tabular-nums">
                    {summary?.serving_count ?? 0}
                  </p>
                  <p className="text-xs text-muted-foreground">
                    ministr{(summary?.serving_count ?? 0) === 1 ? "y" : "ies"}
                  </p>
                </CardContent></Card>
                <Card><CardContent className="pt-5">
                  <p className="text-xs uppercase tracking-wide text-muted-foreground">Groups</p>
                  <p className="mt-1 text-2xl font-bold tabular-nums">
                    {summary?.group_count ?? 0}
                  </p>
                  <p className="text-xs text-muted-foreground">home cells and studies</p>
                </CardContent></Card>
              </div>

              <Card>
                <CardHeader className="pb-3">
                  <CardTitle className="text-base">Giving online</CardTitle>
                  <CardDescription>
                    Card and bank transfer go through Stripe. PayPal, Zelle,
                    Venmo, text, cheque and the offering box all still work —
                    every one of them ends up on your year-end statement.
                  </CardDescription>
                </CardHeader>
                <CardContent>
                  <GiveButton />
                </CardContent>
              </Card>

              {summary?.membership_status && (
                <p className="text-sm text-muted-foreground">
                  You are recorded as{" "}
                  <Badge variant="secondary">{summary.membership_status}</Badge>
                  {summary.member_since ? ` since ${summary.member_since}` : ""}.
                </p>
              )}
            </TabsContent>

            {/* ------------------------------------------------------------ */}
            <TabsContent value="household" className="mt-4">
              <Card>
                <CardHeader className="pb-3">
                  <CardTitle className="text-base flex items-center gap-2">
                    <Home className="h-4 w-4" />
                    {summary?.household_name ?? "My household"}
                  </CardTitle>
                  <CardDescription>
                    To change anything here, speak to the church office — a
                    household is shared, so it is not edited from one person's
                    login.
                  </CardDescription>
                </CardHeader>
                <CardContent className="p-0">
                  {(household?.length ?? 0) === 0 ? (
                    <p className="px-6 pb-6 text-sm text-muted-foreground">
                      You are not recorded in a household yet.
                    </p>
                  ) : (
                    <Table>
                      <TableHeader>
                        <TableRow>
                          <TableHead>Name</TableHead>
                          <TableHead>Role</TableHead>
                          <TableHead>Contact</TableHead>
                        </TableRow>
                      </TableHeader>
                      <TableBody>
                        {household!.map((person) => (
                          <TableRow key={person.person_id}>
                            <TableCell>
                              <span className="font-medium">{person.display_name}</span>
                              {person.is_me && <Badge className="ml-2">you</Badge>}
                              {person.is_child && (
                                <Badge variant="secondary" className="ml-2">child</Badge>
                              )}
                            </TableCell>
                            <TableCell className="capitalize">
                              {person.household_role ?? "—"}
                              {person.is_primary_contact && (
                                <span className="block text-xs text-muted-foreground">
                                  primary contact
                                </span>
                              )}
                            </TableCell>
                            <TableCell className="text-sm text-muted-foreground">
                              {person.phone ?? person.email ?? "—"}
                            </TableCell>
                          </TableRow>
                        ))}
                      </TableBody>
                    </Table>
                  )}
                </CardContent>
              </Card>
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
                  )}
                </CardContent>
              </Card>

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
                state inside says plainly when there is nothing to show. */}
            <TabsContent value="children" className="mt-4 space-y-4">
                <Card>
                  <CardHeader className="pb-3">
                    <CardTitle className="text-base flex items-center gap-2">
                      <Baby className="h-4 w-4" />
                      My children
                    </CardTitle>
                  </CardHeader>
                  <CardContent className="p-0">
                    {!hasChildren ? (
                      <p className="px-6 pb-6 text-sm text-muted-foreground">
                        No children are linked to your household yet. If that is
                        wrong, the check-in desk can put it right.
                      </p>
                    ) : (
                    <Table>
                      <TableHeader>
                        <TableRow>
                          <TableHead>Name</TableHead>
                          <TableHead>Grade</TableHead>
                          <TableHead>Born</TableHead>
                        </TableRow>
                      </TableHeader>
                      <TableBody>
                        {children!.map((child) => (
                          <TableRow key={child.person_id}>
                            <TableCell className="font-medium">{child.display_name}</TableCell>
                            <TableCell>{child.grade_name ?? "—"}</TableCell>
                            <TableCell className="text-muted-foreground">
                              {child.birth_year ?? "—"}
                            </TableCell>
                          </TableRow>
                        ))}
                      </TableBody>
                    </Table>
                    )}
                  </CardContent>
                </Card>

                <Card>
                  <CardHeader className="pb-3">
                    <CardTitle className="text-base">Recent Sundays</CardTitle>
                    <CardDescription>
                      Check-ins that have finished, and who collected them. For
                      where a child is right now, ask at the check-in desk.
                    </CardDescription>
                  </CardHeader>
                  <CardContent className="p-0">
                    {(checkIns?.length ?? 0) === 0 ? (
                      <p className="px-6 pb-6 text-sm text-muted-foreground">
                        No check-ins recorded yet.
                      </p>
                    ) : (
                      <div className="overflow-x-auto">
                        <Table>
                          <TableHeader>
                            <TableRow>
                              <TableHead>Date</TableHead>
                              <TableHead>Child</TableHead>
                              <TableHead>Room</TableHead>
                              <TableHead>Collected by</TableHead>
                            </TableRow>
                          </TableHeader>
                          <TableBody>
                            {checkIns!.map((row) => (
                              <TableRow key={row.check_in_id}>
                                <TableCell className="whitespace-nowrap">
                                  {row.session_date}
                                  <span className="block text-xs text-muted-foreground">
                                    {row.service_label}
                                  </span>
                                </TableCell>
                                <TableCell>{row.child_name}</TableCell>
                                <TableCell>{row.room_name ?? "—"}</TableCell>
                                <TableCell>
                                  {row.picked_up_by_name ?? (
                                    <Badge variant="outline">{row.status}</Badge>
                                  )}
                                </TableCell>
                              </TableRow>
                            ))}
                          </TableBody>
                        </Table>
                      </div>
                    )}
                  </CardContent>
                </Card>
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
            <TabsContent value="details" className="mt-4">
              <MyInformation userId={user?.id} />
            </TabsContent>
          </Tabs>
        )}
      </div>
    </DashboardLayout>
  );
}
