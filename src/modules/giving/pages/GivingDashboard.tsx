/**
 * Giving — the donor ledger.
 *
 * Layout follows BudgetDashboard and MembersDashboard: DashboardLayout
 * wrapper, icon-chip header, toolbar, tabs.
 *
 * The route is gated on giving.read, NOT on a staff app_role tier. A counter
 * who is otherwise a plain member holds giving_admin additively, exactly as a
 * check-in volunteer holds kids_volunteer, and gating on the tier would lock
 * out the people this screen is for.
 */

import { useState } from "react";
import { useNavigate } from "react-router-dom";
import DashboardLayout from "@/shared/components/layout/DashboardLayout";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/shared/components/ui/tabs";
import { Card, CardContent } from "@/shared/components/ui/card";
import { Button } from "@/shared/components/ui/button";
import { Input } from "@/shared/components/ui/input";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/shared/components/ui/select";
import { HandCoins, Plus, Search, FileSpreadsheet, Users } from "lucide-react";
import { useOrganization } from "@/shared/contexts/OrganizationContext";
import { useCapabilities } from "@/shared/hooks/useCapabilities";
import {
  GivingOverviewTab,
  DonationsTable,
  BatchesTab,
  StatementsTab,
  FundsTab,
  RecordGiftDialog,
} from "../components";
import { useGivingFunds } from "../hooks";
import type { DonationFilters } from "../types";

const ALL = "__all__";

/** Two years back is enough for a statement re-run without a date picker. */
function recentYears(): number[] {
  const now = new Date().getFullYear();
  return [now, now - 1, now - 2];
}

export default function GivingDashboard() {
  const navigate = useNavigate();
  const { currentOrganization } = useOrganization();
  const { can } = useCapabilities();
  const orgId = currentOrganization?.id;
  const canWrite = can("giving.write");

  const [tab, setTab] = useState("overview");
  const [year, setYear] = useState(() => new Date().getFullYear());
  const [search, setSearch] = useState("");
  const [fundId, setFundId] = useState<string>(ALL);
  const [onlyUnmatched, setOnlyUnmatched] = useState(false);
  const [batchId, setBatchId] = useState<string | null>(null);
  const [recording, setRecording] = useState(false);

  const { data: funds } = useGivingFunds(orgId);

  if (!orgId) {
    return (
      <DashboardLayout>
        <p className="text-muted-foreground">No organization in context.</p>
      </DashboardLayout>
    );
  }

  const filters: DonationFilters = {
    year,
    search,
    fund_id: fundId === ALL ? null : fundId,
    batch_id: batchId,
    only_unmatched: onlyUnmatched,
  };

  const showUnmatched = () => {
    setOnlyUnmatched(true);
    setBatchId(null);
    setTab("gifts");
  };

  const showBatch = (id: string) => {
    setBatchId(id);
    setOnlyUnmatched(false);
    setTab("gifts");
  };

  return (
    <DashboardLayout>
      <div className="space-y-4 sm:space-y-6">
        <div className="flex flex-col gap-3 sm:flex-row sm:items-start sm:justify-between">
          <div className="flex items-start gap-3">
            <div className="p-2 rounded-xl bg-primary/10">
              <HandCoins className="h-6 w-6 text-primary" />
            </div>
            <div>
              <h1 className="text-2xl sm:text-3xl font-bold">Giving</h1>
              <p className="text-sm text-muted-foreground mt-1">
                {currentOrganization?.name ?? "Donor ledger"}
              </p>
            </div>
          </div>

          <div className="flex flex-wrap gap-2">
            <Select value={String(year)} onValueChange={(v) => setYear(Number(v))}>
              <SelectTrigger className="w-28">
                <SelectValue />
              </SelectTrigger>
              <SelectContent>
                {recentYears().map((y) => (
                  <SelectItem key={y} value={String(y)}>{y}</SelectItem>
                ))}
              </SelectContent>
            </Select>
            {canWrite && (
              <>
                <Button variant="outline" onClick={() => navigate("/giving/import")}>
                  <FileSpreadsheet className="h-4 w-4 mr-1" />
                  Import
                </Button>
                <Button onClick={() => setRecording(true)}>
                  <Plus className="h-4 w-4 mr-1" />
                  Record a gift
                </Button>
              </>
            )}
          </div>
        </div>

        <Tabs value={tab} onValueChange={setTab}>
          <TabsList className="flex-wrap h-auto">
            <TabsTrigger value="overview">Overview</TabsTrigger>
            <TabsTrigger value="gifts">Gifts</TabsTrigger>
            <TabsTrigger value="batches">Batches</TabsTrigger>
            <TabsTrigger value="statements">Statements</TabsTrigger>
            <TabsTrigger value="funds">Funds</TabsTrigger>
          </TabsList>

          <TabsContent value="overview" className="mt-4">
            <GivingOverviewTab
              organizationId={orgId}
              year={year}
              onShowUnmatched={showUnmatched}
            />
          </TabsContent>

          <TabsContent value="gifts" className="mt-4 space-y-3">
            <div className="flex flex-wrap items-center gap-2">
              <div className="relative flex-1 min-w-[16rem]">
                <Search className="absolute left-2.5 top-2.5 h-4 w-4 text-muted-foreground" />
                <Input
                  className="pl-8"
                  placeholder="Search donor, household, cheque number or reference…"
                  value={search}
                  onChange={(e) => setSearch(e.target.value)}
                />
              </div>
              <Select value={fundId} onValueChange={setFundId}>
                <SelectTrigger className="w-48">
                  <SelectValue placeholder="All funds" />
                </SelectTrigger>
                <SelectContent>
                  <SelectItem value={ALL}>All funds</SelectItem>
                  {(funds ?? []).map((fund) => (
                    <SelectItem key={fund.id} value={fund.id}>{fund.name}</SelectItem>
                  ))}
                </SelectContent>
              </Select>
              <Button
                variant={onlyUnmatched ? "default" : "outline"}
                onClick={() => setOnlyUnmatched((v) => !v)}
              >
                <Users className="h-4 w-4 mr-1" />
                Unmatched only
              </Button>
              {batchId && (
                <Button variant="ghost" onClick={() => setBatchId(null)}>
                  Clear batch filter
                </Button>
              )}
            </div>

            <Card>
              <CardContent className="p-0 sm:p-2">
                <DonationsTable
                  organizationId={orgId}
                  filters={filters}
                  canWrite={canWrite}
                />
              </CardContent>
            </Card>
          </TabsContent>

          <TabsContent value="batches" className="mt-4">
            <BatchesTab
              organizationId={orgId}
              canWrite={canWrite}
              onViewBatch={showBatch}
            />
          </TabsContent>

          <TabsContent value="statements" className="mt-4">
            <StatementsTab organizationId={orgId} year={year} />
          </TabsContent>

          <TabsContent value="funds" className="mt-4">
            <FundsTab organizationId={orgId} canWrite={canWrite} />
          </TabsContent>
        </Tabs>
      </div>

      <RecordGiftDialog
        open={recording}
        onOpenChange={setRecording}
        organizationId={orgId}
      />
    </DashboardLayout>
  );
}
