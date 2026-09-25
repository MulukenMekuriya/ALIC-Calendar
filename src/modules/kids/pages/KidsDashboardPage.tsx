/**
 * Kids Ministry — the leader's Sunday morning screen.
 *
 * Four things the ministry leader asked for, as four tabs: see everything
 * happening live, edit the classrooms and their age groups, assign volunteers,
 * and look back over past Sundays.
 *
 * The live tab is the one that matters during a service, so it is first and it
 * is the only one that subscribes to Realtime.
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
import { Badge } from "@/shared/components/ui/badge";
import { Alert, AlertDescription } from "@/shared/components/ui/alert";
import {
  Baby,
  AlertTriangle,
  Loader2,
  Users,
  ScanLine,
  RefreshCw,
  DoorOpen,
} from "lucide-react";
import { toast } from "sonner";
import { useOrganization } from "@/shared/contexts/OrganizationContext";
import { useCapabilities } from "@/shared/hooks/useCapabilities";
import { LiveBoardCard } from "../components/LiveBoardCard";
import { RoomRosterSheet } from "../components/RoomRosterSheet";
import { StillHerePanel } from "../components/StillHerePanel";
import { ClassroomsTab } from "../components/ClassroomsTab";
import { VolunteersTab } from "../components/VolunteersTab";
import { KidsReportsTab } from "../components/KidsReportsTab";
import { useLiveBoard, useKidsRealtime } from "../hooks/useKidsLeader";
import { kidsSessionService } from "../services/kidsSessionService";
import type { LiveBoardRoom } from "../services/kidsLeaderService";

export default function KidsDashboardPage() {
  const navigate = useNavigate();
  const { currentOrganization } = useOrganization();
  const { can } = useCapabilities();
  const orgId = currentOrganization?.id;

  const [selectedRoom, setSelectedRoom] = useState<LiveBoardRoom | null>(null);
  const [opening, setOpening] = useState(false);

  const { data: board, isLoading, refetch, isFetching } = useLiveBoard(orgId);
  useKidsRealtime(orgId);

  const canManage = can("kids.write");

  // Rooms come back grouped by session, and more than one service can be open
  // at once. Grouping here keeps two services from being read as one big room
  // list with duplicate room names.
  const sessions = useMemo(() => {
    const bySession = new Map<
      string,
      { label: string; date: string; rooms: LiveBoardRoom[] }
    >();
    for (const room of board ?? []) {
      const existing = bySession.get(room.kids_session_id);
      if (existing) {
        existing.rooms.push(room);
      } else {
        bySession.set(room.kids_session_id, {
          label: room.session_label ?? "Service",
          date: room.session_date,
          rooms: [room],
        });
      }
    }
    return [...bySession.entries()].map(([id, value]) => ({ id, ...value }));
  }, [board]);

  const totals = useMemo(() => {
    const rooms = board ?? [];
    return {
      children: rooms.reduce((sum, r) => sum + r.checked_in_count, 0),
      collected: rooms.reduce((sum, r) => sum + r.checked_out_count, 0),
      volunteers: rooms.reduce((sum, r) => sum + r.volunteer_count, 0),
      breaches: rooms.filter((r) => r.over_capacity || r.over_ratio).length,
      restrictions: rooms.reduce((sum, r) => sum + r.restriction_count, 0),
    };
  }, [board]);

  async function openSession() {
    if (!orgId) return;
    setOpening(true);
    try {
      const result = await kidsSessionService.openToday(orgId);
      // Reconciling is the reason to press this on an already-open session, so
      // say what moved rather than only "it was already open".
      const changes = [
        result.rooms_attached > 0 &&
          `${result.rooms_attached} classroom${
            result.rooms_attached === 1 ? "" : "s"
          } added`,
        result.rooms_closed > 0 &&
          `${result.rooms_closed} room${
            result.rooms_closed === 1 ? "" : "s"
          } closed`,
      ].filter(Boolean) as string[];

      toast.success(
        result.was_created
          ? `${result.service_label} is open`
          : `${result.service_label} was already open`,
        {
          description: changes.length
            ? `Classrooms brought up to date: ${changes.join(", ")}.`
            : undefined,
        }
      );
      await refetch();
    } catch (error) {
      const message = error instanceof Error ? error.message : String(error);
      toast.error("Could not open a session", {
        description:
          message.includes("no_classrooms_configured")
            ? "No classrooms are configured yet. Set them up on the Classrooms tab first."
            : message,
      });
    } finally {
      setOpening(false);
    }
  }

  return (
    <DashboardLayout>
      <div className="space-y-6">
        <div className="flex flex-wrap items-start justify-between gap-3">
          <div className="flex items-center gap-3">
            <div className="rounded-lg bg-primary/10 p-2">
              <Baby className="h-6 w-6 text-primary" />
            </div>
            <div>
              <h1 className="text-2xl font-bold">Kids Ministry</h1>
              <p className="text-sm text-muted-foreground">
                {currentOrganization?.name ?? "Children's check-in and classrooms"}
              </p>
            </div>
          </div>
          <div className="flex flex-wrap gap-2">
            <Button
              variant="outline"
              size="sm"
              onClick={() => refetch()}
              disabled={isFetching}
            >
              <RefreshCw
                className={isFetching ? "h-4 w-4 animate-spin" : "h-4 w-4"}
              />
              Refresh
            </Button>
            {can("kids.checkin") && (
              <Button variant="outline" size="sm" onClick={() => navigate("/checkin")}>
                <ScanLine className="h-4 w-4" />
                Check-in station
              </Button>
            )}
            {canManage && (
              <Button size="sm" onClick={openSession} disabled={opening}>
                {opening ? (
                  <Loader2 className="h-4 w-4 animate-spin" />
                ) : (
                  <DoorOpen className="h-4 w-4" />
                )}
                Open today's session
              </Button>
            )}
          </div>
        </div>

        <Tabs defaultValue="live">
          <TabsList>
            <TabsTrigger value="live">Live</TabsTrigger>
            <TabsTrigger value="classrooms">Classrooms</TabsTrigger>
            <TabsTrigger value="volunteers">Volunteers</TabsTrigger>
            <TabsTrigger value="reports">Reports</TabsTrigger>
          </TabsList>

          <TabsContent value="live" className="space-y-4 pt-4">
            <div className="grid gap-3 grid-cols-2 lg:grid-cols-4">
              <StatCard label="In our care" value={totals.children} icon={Baby} />
              <StatCard label="Collected" value={totals.collected} />
              <StatCard label="Volunteers" value={totals.volunteers} icon={Users} />
              <StatCard
                label="Need attention"
                value={totals.breaches}
                icon={AlertTriangle}
                warn={totals.breaches > 0}
              />
            </div>

            {/* The end-of-service question, above the room tiles because at
                12:40 it is the only one that matters — and because a child in
                a session that has already closed appears on no tile at all. */}
            <StillHerePanel organizationId={orgId} />

            {totals.restrictions > 0 && (
              <Alert variant="destructive">
                <AlertTriangle className="h-4 w-4" />
                <AlertDescription>
                  {totals.restrictions} child
                  {totals.restrictions === 1 ? " has" : "ren have"} a pickup
                  restriction in place today. They are only released to an
                  authorized person.
                </AlertDescription>
              </Alert>
            )}

            {isLoading ? (
              <div className="flex items-center justify-center py-16 text-muted-foreground">
                <Loader2 className="h-6 w-6 animate-spin" />
              </div>
            ) : sessions.length === 0 ? (
              <Card>
                <CardContent className="py-12 text-center space-y-3">
                  <DoorOpen className="h-10 w-10 mx-auto text-muted-foreground" />
                  <div>
                    <p className="font-medium">No session is open</p>
                    <p className="text-sm text-muted-foreground">
                      Sunday opens itself 45 minutes before the service. Open one
                      here for anything else — a second service, or a midweek
                      programme.
                    </p>
                  </div>
                  {canManage && (
                    <Button onClick={openSession} disabled={opening}>
                      Open a session now
                    </Button>
                  )}
                </CardContent>
              </Card>
            ) : (
              sessions.map((session) => (
                <div key={session.id} className="space-y-3">
                  <div className="flex items-center gap-2">
                    <h2 className="font-semibold">{session.label}</h2>
                    <Badge variant="outline">{session.date}</Badge>
                  </div>
                  <div className="grid gap-3 sm:grid-cols-2 lg:grid-cols-3 xl:grid-cols-4">
                    {session.rooms.map((room) => (
                      <LiveBoardCard
                        key={`${room.kids_session_id}-${room.room_id}`}
                        room={room}
                        onOpenRoster={setSelectedRoom}
                      />
                    ))}
                  </div>
                </div>
              ))
            )}
          </TabsContent>

          <TabsContent value="classrooms" className="pt-4">
            <ClassroomsTab organizationId={orgId} canManage={canManage} />
          </TabsContent>

          <TabsContent value="volunteers" className="pt-4">
            <VolunteersTab
              organizationId={orgId}
              canManage={canManage}
              sessions={sessions}
            />
          </TabsContent>

          <TabsContent value="reports" className="pt-4">
            <KidsReportsTab organizationId={orgId} canReview={canManage} />
          </TabsContent>
        </Tabs>
      </div>

      <RoomRosterSheet
        room={selectedRoom}
        onOpenChange={(open) => !open && setSelectedRoom(null)}
      />
    </DashboardLayout>
  );
}

function StatCard({
  label,
  value,
  icon: Icon,
  warn,
}: {
  label: string;
  value: number;
  icon?: React.ComponentType<{ className?: string }>;
  warn?: boolean;
}) {
  return (
    <Card className={warn ? "border-amber-400" : undefined}>
      <CardContent className="p-4">
        <div className="flex items-center justify-between">
          <p className="text-xs text-muted-foreground">{label}</p>
          {Icon && (
            <Icon
              className={
                warn ? "h-4 w-4 text-amber-600" : "h-4 w-4 text-muted-foreground"
              }
            />
          )}
        </div>
        <p className="text-2xl font-bold tabular-nums mt-1">{value}</p>
      </CardContent>
    </Card>
  );
}
