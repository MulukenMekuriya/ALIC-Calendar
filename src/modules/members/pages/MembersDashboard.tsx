/**
 * Members Dashboard — the church directory.
 *
 * For a reader of the whole directory: the headline numbers, then tabs for
 * the directory itself, what needs fixing in it, likely duplicates, birthdays
 * and (for admins) who may use the modules. Everyone else sees their own
 * record. Layout follows BudgetDashboard: DashboardLayout, icon-chip header,
 * KPI grid, tabs.
 *
 * The directory is read whole (church.directory_people) and filtered in the
 * browser, so the Data health counts, the table and the export always agree.
 */

import { useMemo, useState } from "react";
import { useNavigate } from "react-router-dom";
import DashboardLayout from "@/shared/components/layout/DashboardLayout";
import {
  Card,
  CardContent,
  CardDescription,
  CardHeader,
  CardTitle,
} from "@/shared/components/ui/card";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/shared/components/ui/tabs";
import { Button } from "@/shared/components/ui/button";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/shared/components/ui/select";
import { Badge } from "@/shared/components/ui/badge";
import {
  UsersRound,
  Plus,
  Home,
  HandHeart,
  Cake,
  Loader2,
  FileSpreadsheet,
  BadgeCheck,
  DoorOpen,
} from "lucide-react";
import { useAuth } from "@/shared/contexts/AuthContext";
import { useOrganization } from "@/shared/contexts/OrganizationContext";
import { useCapabilities } from "@/shared/hooks/useCapabilities";
import { MyInformation } from "../components/MyInformation";
import { useMemberStats, useBirthdays } from "../hooks/useMembers";
import { useServingTotals } from "../hooks/useServing";
import { useMembershipStatuses } from "../hooks/useReference";
import { useDirectoryPeople, useDuplicateDismissals } from "../hooks/useDirectory";
import { DirectoryTable } from "../components/DirectoryTable";
import { DataHealthPanel } from "../components/DataHealthPanel";
import { DuplicatesReview } from "../components/DuplicatesReview";
import { ProfileBackfillCard } from "../components/ProfileBackfillCard";
import { ModuleGrantsPanel } from "../components/ModuleGrantsPanel";
import { MONTH_NAMES } from "../types";
import { displayName } from "../utils/normalize";
import { formatBirthday } from "../utils/age";
import {
  ATTENTION,
  NO_FILTERS,
  duplicateGroups,
  duplicateIds,
  health as directoryHealth,
  type Attention,
  type DirectoryFilters,
} from "../utils/directory";

export default function MembersDashboard() {
  const navigate = useNavigate();
  const { user, isAdmin } = useAuth();
  const { currentOrganization } = useOrganization();
  const { can } = useCapabilities();
  const orgId = currentOrganization?.id;

  // Same split as BudgetDashboard: one route, two very different views.
  // An admin (or someone explicitly granted members.read) gets the whole
  // directory; everyone else gets only their own record. RLS enforces the
  // same boundary server-side, so this is presentation, not protection.
  const hasFullAccess = isAdmin || can("members.read");

  const [tab, setTab] = useState("directory");
  const [filters, setFilters] = useState<DirectoryFilters>(NO_FILTERS);
  const [birthdayMonth, setBirthdayMonth] = useState(new Date().getMonth() + 1);

  const directory = useDirectoryPeople(hasFullAccess ? orgId : undefined);
  const dismissals = useDuplicateDismissals(hasFullAccess ? orgId : undefined);
  const statusesQuery = useMembershipStatuses(orgId);
  const statsQuery = useMemberStats(orgId);
  const servingQuery = useServingTotals(orgId);
  const birthdaysQuery = useBirthdays(orgId, birthdayMonth);

  const people = useMemo(() => directory.data ?? [], [directory.data]);
  const groups = useMemo(() => duplicateGroups(people, dismissals.data ?? []), [people, dismissals.data]);
  const dupes = useMemo(() => duplicateIds(groups), [groups]);
  const health = useMemo(() => directoryHealth(people, groups), [people, groups]);
  const headline = useMemo(() => {
    const adults = people.filter((p) => p.is_active && !p.is_child);
    return {
      members: adults.filter((p) => p.membership_code === "member").length,
      visitors: adults.filter((p) => p.membership_code === "visitor").length,
      adults: adults.length,
    };
  }, [people]);
  const needsWork = ATTENTION.filter((a) => health.counts[a.key] > 0).length;

  const stats = statsQuery.data;
  const serving = servingQuery.data;
  const canWrite = can("members.write");
  const loadingPeople = directory.isLoading;

  // From Data health: the directory filtered to exactly those people, or the
  // duplicates side by side.
  function review(attention: Attention) {
    if (attention === "duplicate") {
      setTab("duplicates");
      return;
    }
    const who = ATTENTION.find((a) => a.key === attention)?.who;
    setFilters({
      ...NO_FILTERS,
      attention,
      type: who === "adults" ? "adults" : who === "children" ? "children" : "all",
    });
    setTab("directory");
  }

  return (
    <DashboardLayout>
      <div className="space-y-4 sm:space-y-6">
        <div className="flex flex-col gap-3 sm:flex-row sm:items-start sm:justify-between">
          <div className="flex items-start gap-3">
            <div className="p-2 rounded-xl bg-primary/10">
              <UsersRound className="h-6 w-6 text-primary" />
            </div>
            <div>
              <h1 className="text-2xl sm:text-3xl font-bold">
                {hasFullAccess ? "Church Members" : "My Information"}
              </h1>
              <p className="text-sm text-muted-foreground mt-1">
                {hasFullAccess
                  ? (currentOrganization?.name ?? "Directory")
                  : "Your record in the church directory"}
              </p>
            </div>
          </div>
          {hasFullAccess && canWrite && (
            <div className="flex gap-2">
              <Button variant="outline" onClick={() => navigate("/members/import")}>
                <FileSpreadsheet className="h-4 w-4 mr-1" />
                Import
              </Button>
              <Button onClick={() => navigate("/members/new")}>
                <Plus className="h-4 w-4 mr-1" />
                Add member
              </Button>
            </div>
          )}
        </div>

        {!hasFullAccess ? (
          <MyInformation userId={user?.id} />
        ) : (
        <>
        {/* Who may use the modules: without a grant only organization admins
            can reach the directory or the check-in station at all, so it sits
            first, beside the backfill — the other half of "the module has no
            users yet". */}
        <ModuleGrantsPanel organizationId={orgId} canGrant={isAdmin} />

        {canWrite && (
          <ProfileBackfillCard
            organizationId={orgId}
            memberCount={stats?.active ?? 0}
            onDone={() => {
              void statsQuery.refetch();
              void directory.refetch();
            }}
          />
        )}

        <div className="grid grid-cols-2 gap-3 lg:grid-cols-5">
          <StatCard
            icon={<UsersRound className="h-4 w-4" />}
            label="People"
            value={health.adults + health.children}
            loading={loadingPeople}
            hint={`${health.adults.toLocaleString("en-US")} adults · ${health.children.toLocaleString("en-US")} children`}
          />
          <StatCard
            icon={<BadgeCheck className="h-4 w-4" />}
            label="Members"
            value={headline.members}
            loading={loadingPeople}
            hint={headline.adults ? `${Math.round((headline.members / headline.adults) * 100)}% of adults` : undefined}
          />
          <StatCard
            icon={<DoorOpen className="h-4 w-4" />}
            label="Visitors"
            value={headline.visitors}
            loading={loadingPeople}
            hint={
              health.counts.no_status > 0
                ? `${health.counts.no_status.toLocaleString("en-US")} adults have no status`
                : undefined
            }
          />
          <StatCard
            icon={<Home className="h-4 w-4" />}
            label="Families"
            value={stats?.households}
            loading={statsQuery.isLoading}
            hint={hasFullAccess ? "See them all in Families" : undefined}
            onClick={() => navigate("/members/households")}
          />
          <StatCard
            icon={<HandHeart className="h-4 w-4" />}
            label="Serving"
            value={serving?.unique_serving_members}
            loading={servingQuery.isLoading}
            /* Distinct people, not assignment rows — a person serving in two
               ministries counts once here (spec 9.3). */
            hint={
              serving
                ? `${serving.assignment_count} assignments · ${serving.members_in_multiple_ministries} in 2+`
                : undefined
            }
          />
        </div>

        <Tabs value={tab} onValueChange={setTab}>
          <TabsList className="h-auto w-full flex-wrap justify-start sm:w-auto">
            <TabsTrigger value="directory">Directory</TabsTrigger>
            <TabsTrigger value="health">
              Data health
              {needsWork > 0 && (
                <Badge variant="secondary" className="ml-1.5 px-1.5">
                  {needsWork}
                </Badge>
              )}
            </TabsTrigger>
            <TabsTrigger value="duplicates">
              Duplicates
              {groups.length > 0 && (
                <Badge variant="secondary" className="ml-1.5 px-1.5">
                  {groups.length}
                </Badge>
              )}
            </TabsTrigger>
            <TabsTrigger value="birthdays">Birthdays</TabsTrigger>
          </TabsList>

          <TabsContent value="directory" className="mt-4">
            {directory.isError ? (
              <ErrorCard error={directory.error} />
            ) : (
              <DirectoryTable
                organizationId={orgId}
                people={people}
                statuses={statusesQuery.data ?? []}
                duplicates={dupes}
                filters={filters}
                onFiltersChange={setFilters}
                canWrite={canWrite}
                isLoading={loadingPeople}
              />
            )}
          </TabsContent>

          <TabsContent value="health" className="mt-4">
            {loadingPeople ? (
              <div className="flex justify-center py-16">
                <Loader2 className="h-6 w-6 animate-spin text-muted-foreground" />
              </div>
            ) : (
              <DataHealthPanel health={health} onReview={review} />
            )}
          </TabsContent>

          <TabsContent value="duplicates" className="mt-4">
            <DuplicatesReview organizationId={orgId} groups={groups} canWrite={canWrite} />
          </TabsContent>

          <TabsContent value="birthdays" className="mt-4 space-y-4">
            <Card>
              <CardHeader className="pb-3">
                <div className="flex items-center justify-between gap-3">
                  <div>
                    <CardTitle className="text-base flex items-center gap-2">
                      <Cake className="h-4 w-4" />
                      Birthdays in {MONTH_NAMES[birthdayMonth - 1]}
                    </CardTitle>
                    <CardDescription className="text-xs mt-1">
                      Grouped by month. ALIC records the year and month of birth but not
                      the day, so a day-level list is not possible.
                    </CardDescription>
                  </div>
                  <Select
                    value={String(birthdayMonth)}
                    onValueChange={(v) => setBirthdayMonth(Number(v))}
                  >
                    <SelectTrigger className="w-[140px]">
                      <SelectValue />
                    </SelectTrigger>
                    <SelectContent>
                      {MONTH_NAMES.map((m, i) => (
                        <SelectItem key={m} value={String(i + 1)}>
                          {m}
                        </SelectItem>
                      ))}
                    </SelectContent>
                  </Select>
                </div>
              </CardHeader>
              <CardContent>
                {birthdaysQuery.isLoading ? (
                  <Loader2 className="h-5 w-5 animate-spin text-muted-foreground" />
                ) : (birthdaysQuery.data?.length ?? 0) === 0 ? (
                  <p className="text-sm text-muted-foreground py-6 text-center">
                    Nobody on file with a birthday in {MONTH_NAMES[birthdayMonth - 1]}.
                  </p>
                ) : (
                  <ul className="divide-y">
                    {birthdaysQuery.data!.map((m) => (
                      <li key={m.id} className="flex items-center justify-between py-2">
                        <span className="text-sm font-medium">{displayName(m)}</span>
                        <Badge variant="secondary">{formatBirthday(m)}</Badge>
                      </li>
                    ))}
                  </ul>
                )}
              </CardContent>
            </Card>
          </TabsContent>
        </Tabs>
        </>
        )}
      </div>

    </DashboardLayout>
  );
}

function StatCard({
  icon,
  label,
  value,
  loading,
  hint,
  onClick,
}: {
  icon: React.ReactNode;
  label: string;
  value: number | undefined;
  loading: boolean;
  hint?: string;
  onClick?: () => void;
}) {
  return (
    <Card
      className={onClick ? "cursor-pointer transition-colors hover:bg-muted/40" : undefined}
      onClick={onClick}
    >
      <CardContent className="p-4">
        <div className="flex items-center gap-2 text-muted-foreground text-xs">
          {icon}
          {label}
        </div>
        <div className="mt-1 text-2xl font-semibold tabular-nums">
          {loading ? <Loader2 className="h-5 w-5 animate-spin" /> : (value?.toLocaleString("en-US") ?? "—")}
        </div>
        {hint && <p className="mt-1 text-[11px] text-muted-foreground">{hint}</p>}
      </CardContent>
    </Card>
  );
}

function ErrorCard({ error }: { error: unknown }) {
  const message = error instanceof Error ? error.message : "Unknown error";
  return (
    <Card className="border-red-200 bg-red-50/40">
      <CardContent className="p-4">
        <p className="text-sm font-medium text-red-700">Could not load members</p>
        <p className="text-xs text-red-600/80 mt-1">{message}</p>
      </CardContent>
    </Card>
  );
}
