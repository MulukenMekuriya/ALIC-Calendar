/**
 * Who is serving in Kids Ministry today, and in which room.
 *
 * church.kids_eligible_volunteers returns every adult member of the branch,
 * and that is deliberate: someone helping for the first time has no volunteer
 * record yet, and an inner join would hide exactly the person the leader is
 * trying to add. But 295 names is not a list a leader can work with on a
 * Sunday morning when they are looking for one of about thirty regulars.
 *
 * So the picker opens on the KIDS TEAM — anyone with a volunteer record, plus
 * anyone currently assigned to a classroom — and puts the rest of the church
 * behind a button that says how many it is hiding. Nobody is removed from
 * reach; they are one click away, and the count makes it obvious the list is
 * filtered rather than short.
 *
 * The two sets genuinely differ. In production church.kids_volunteers is empty
 * while four people hold current classroom assignments, so a list built on
 * volunteer records alone would open on nobody at all.
 *
 * ALIC does not run background checks — everyone serving is a member of the
 * church — so nothing here reports a clearance. The one safeguarding fact that
 * survives is `may_not_serve_with_children`, a decision the church has made
 * about an individual. assign_session_staff refuses them server-side on every
 * path; this screen greys them out so the leader never gets that far, but the
 * refusal is the real control.
 */

import { useMemo, useState } from "react";
import {
  Card,
  CardContent,
  CardDescription,
  CardHeader,
  CardTitle,
} from "@/shared/components/ui/card";
import { Button } from "@/shared/components/ui/button";
import { Input } from "@/shared/components/ui/input";
import { Label } from "@/shared/components/ui/label";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/shared/components/ui/select";
import {
  ChevronDown,
  ChevronUp,
  Loader2,
  Search,
  UserMinus,
  UserPlus,
} from "lucide-react";
import { toast } from "sonner";
import {
  useClassroomTeachers,
  useEligibleVolunteers,
  useSessionStaffing,
  useAssignStaff,
  useEndStaff,
  useLiveBoard,
} from "../hooks/useKidsLeader";

const NO_ROOM = "__floating__";

const ROLES = [
  { value: "classroom_volunteer", label: "Classroom volunteer" },
  { value: "room_lead", label: "Room lead" },
  { value: "floater", label: "Floater" },
  { value: "check_in_desk", label: "Check-in desk" },
];

interface VolunteersTabProps {
  organizationId: string | undefined;
  canManage: boolean;
  sessions: { id: string; label: string; date: string }[];
}

export function VolunteersTab({
  organizationId,
  canManage,
  sessions,
}: VolunteersTabProps) {
  const [sessionId, setSessionId] = useState<string>("");
  const activeSession = sessionId || sessions[0]?.id || "";

  const { data: people, isLoading } = useEligibleVolunteers(organizationId);
  const { data: staffing } = useSessionStaffing(activeSession || undefined);
  const { data: board } = useLiveBoard(organizationId);
  const { data: teachers } = useClassroomTeachers(organizationId);
  const assign = useAssignStaff(organizationId);
  const endStaff = useEndStaff(organizationId, activeSession || undefined);

  const [search, setSearch] = useState("");
  const [roomId, setRoomId] = useState(NO_ROOM);
  const [role, setRole] = useState("classroom_volunteer");
  const [showEveryone, setShowEveryone] = useState(false);

  // Rooms of the selected session only, de-duplicated: the board carries one
  // row per session-room pair.
  const rooms = useMemo(() => {
    const seen = new Map<string, string>();
    for (const room of board ?? []) {
      if (room.kids_session_id !== activeSession) continue;
      seen.set(room.room_id, room.label_room_name || room.room_name);
    }
    return [...seen.entries()].map(([id, name]) => ({ id, name }));
  }, [board, activeSession]);

  const assignedIds = new Set((staffing ?? []).map((s) => s.person_id));
  const roomNameById = new Map(rooms.map((r) => [r.id, r.name]));

  // The kids team. on_kids_team is a kids module grant or a kids_volunteers
  // row, both resolved server-side; classroom assignments are unioned in here
  // because this component already has them. In production that is about 44
  // people out of 660 adults.
  // on_kids_team arrives with a migration, and the client cannot compute it -
  // a module grant is keyed by auth user, which the browser cannot read. So if
  // the server is not sending the field yet, the honest thing is to show
  // EVERYONE rather than to filter on a value that is undefined for every row.
  //
  // Getting this wrong is not hypothetical: filtering on undefined left the
  // picker showing the three assigned classroom teachers out of 660 adults,
  // which reads as a broken directory rather than as a filter.
  const serverKnowsTeam = useMemo(
    () => (people ?? []).some((p) => p.on_kids_team !== undefined),
    [people]
  );

  const teamIds = useMemo(() => {
    const ids = new Set<string>();
    for (const p of people ?? []) if (p.on_kids_team) ids.add(p.person_id);
    for (const t of teachers ?? []) ids.add(t.person_id);
    return ids;
  }, [people, teachers]);

  const candidates = (people ?? []).filter((person) => {
    if (assignedIds.has(person.person_id)) return false;
    if (!search.trim()) return true;
    return person.display_name.toLowerCase().includes(search.trim().toLowerCase());
  });

  const onTeam = candidates.filter((p) => teamIds.has(p.person_id));
  const offTeam = candidates.filter((p) => !teamIds.has(p.person_id));
  const filtering = serverKnowsTeam && !showEveryone;
  const filtered = filtering ? onTeam : candidates;

  if (sessions.length === 0) {
    return (
      <Card>
        <CardContent className="py-12 text-center text-sm text-muted-foreground">
          Open a session before assigning volunteers.
        </CardContent>
      </Card>
    );
  }

  return (
    <div className="space-y-4">
      {sessions.length > 1 && (
        <div className="space-y-2 max-w-xs">
          <Label>Service</Label>
          <Select value={activeSession} onValueChange={setSessionId}>
            <SelectTrigger>
              <SelectValue />
            </SelectTrigger>
            <SelectContent>
              {sessions.map((session) => (
                <SelectItem key={session.id} value={session.id}>
                  {session.label} · {session.date}
                </SelectItem>
              ))}
            </SelectContent>
          </Select>
        </div>
      )}

      <div className="grid gap-4 lg:grid-cols-2">
        <Card>
          <CardHeader>
            <CardTitle className="text-base">Serving now</CardTitle>
            <CardDescription>
              {(staffing ?? []).length} assigned to this service.
            </CardDescription>
          </CardHeader>
          <CardContent className="space-y-2">
            {(staffing ?? []).length === 0 && (
              <p className="text-sm text-muted-foreground">
                Nobody is assigned yet. Rooms with children and no volunteer show
                an amber warning on the Live tab.
              </p>
            )}
            {(staffing ?? []).map((row) => {
              const person = (people ?? []).find(
                (p) => p.person_id === row.person_id
              );
              return (
                <div
                  key={row.id}
                  className="flex items-center gap-3 rounded-md border p-2.5"
                >
                  <div className="min-w-0 flex-1">
                    <p className="text-sm font-medium truncate">
                      {person?.display_name ?? "Volunteer"}
                    </p>
                    <p className="text-xs text-muted-foreground truncate">
                      {row.room_id
                        ? roomNameById.get(row.room_id) ?? "Room"
                        : "Not in a room"}
                      {" · "}
                      {ROLES.find((r) => r.value === row.role)?.label ?? row.role}
                    </p>
                  </div>
                  {canManage && (
                    <Button
                      variant="ghost"
                      size="icon"
                      className="h-8 w-8 shrink-0"
                      title="End this shift"
                      onClick={async () => {
                        try {
                          await endStaff.mutateAsync(row.id);
                          toast.success("Shift ended");
                        } catch (error) {
                          toast.error(
                            error instanceof Error ? error.message : String(error)
                          );
                        }
                      }}
                    >
                      <UserMinus className="h-4 w-4" />
                    </Button>
                  )}
                </div>
              );
            })}
          </CardContent>
        </Card>

        {canManage && (
          <Card>
            <CardHeader>
              <CardTitle className="text-base">Assign someone</CardTitle>
              <CardDescription>
                Pick a room and role, then add people to it.
                {filtering && " Showing the kids team."}
              </CardDescription>
            </CardHeader>
            <CardContent className="space-y-3">
              <div className="grid grid-cols-2 gap-3">
                <div className="space-y-2">
                  <Label>Room</Label>
                  <Select value={roomId} onValueChange={setRoomId}>
                    <SelectTrigger>
                      <SelectValue />
                    </SelectTrigger>
                    <SelectContent>
                      <SelectItem value={NO_ROOM}>Not in a room</SelectItem>
                      {rooms.map((room) => (
                        <SelectItem key={room.id} value={room.id}>
                          {room.name}
                        </SelectItem>
                      ))}
                    </SelectContent>
                  </Select>
                </div>
                <div className="space-y-2">
                  <Label>Role</Label>
                  <Select value={role} onValueChange={setRole}>
                    <SelectTrigger>
                      <SelectValue />
                    </SelectTrigger>
                    <SelectContent>
                      {ROLES.map((option) => (
                        <SelectItem key={option.value} value={option.value}>
                          {option.label}
                        </SelectItem>
                      ))}
                    </SelectContent>
                  </Select>
                </div>
              </div>

              <div className="relative">
                <Search className="absolute left-2.5 top-2.5 h-4 w-4 text-muted-foreground" />
                <Input
                  className="pl-8"
                  placeholder="Search people"
                  value={search}
                  onChange={(e) => setSearch(e.target.value)}
                />
              </div>

              <div className="max-h-80 space-y-1.5 overflow-y-auto">
                {isLoading && (
                  <div className="flex justify-center py-6">
                    <Loader2 className="h-5 w-5 animate-spin text-muted-foreground" />
                  </div>
                )}
                {filtered.map((person) => {
                  const restricted = person.may_not_serve_with_children;
                  return (
                    <div
                      key={person.person_id}
                      className="flex items-center gap-2 rounded-md border p-2"
                    >
                      <div className="min-w-0 flex-1">
                        <p className="text-sm truncate">{person.display_name}</p>
                        {restricted ? (
                          <p className="text-xs text-muted-foreground truncate">
                            Not to be placed with children
                          </p>
                        ) : (
                          person.phone && (
                            <p className="text-xs text-muted-foreground truncate">
                              {person.phone}
                            </p>
                          )
                        )}
                      </div>
                      <Button
                        variant="outline"
                        size="sm"
                        disabled={restricted || assign.isPending}
                        onClick={async () => {
                          try {
                            await assign.mutateAsync({
                              sessionId: activeSession,
                              personId: person.person_id,
                              roomId: roomId === NO_ROOM ? null : roomId,
                              role,
                            });
                            toast.success(`${person.display_name} assigned`);
                          } catch (error) {
                            const message =
                              error instanceof Error ? error.message : String(error);
                            toast.error("Could not assign", {
                              description: message.includes("volunteer_is_restricted")
                                ? "This person is restricted from serving with children."
                                : message,
                            });
                          }
                        }}
                      >
                        <UserPlus className="h-4 w-4" />
                      </Button>
                    </div>
                  );
                })}
                {!isLoading && filtered.length === 0 && (
                  <p className="py-6 text-center text-sm text-muted-foreground">
                    {search
                      ? !filtering || offTeam.length === 0
                        ? "Nobody matches that."
                        : "Nobody on the kids team matches that."
                      : !filtering
                        ? "Everyone is already assigned."
                        : "Everyone on the kids team is already assigned."}
                  </p>
                )}
              </div>

              {/* Never hide the rest of the church without saying how many. A
                  short list and a filtered list look identical otherwise. */}
              {!isLoading && filtering && offTeam.length > 0 && (
                <Button
                  variant="ghost"
                  size="sm"
                  className="w-full"
                  onClick={() => setShowEveryone(true)}
                >
                  <ChevronDown className="h-4 w-4" />
                  More options — {offTeam.length} other church member
                  {offTeam.length === 1 ? "" : "s"}
                </Button>
              )}
              {!isLoading && serverKnowsTeam && showEveryone && (
                <Button
                  variant="ghost"
                  size="sm"
                  className="w-full"
                  onClick={() => setShowEveryone(false)}
                >
                  <ChevronUp className="h-4 w-4" />
                  Show the kids team only
                </Button>
              )}
            </CardContent>
          </Card>
        )}
      </div>
    </div>
  );
}
