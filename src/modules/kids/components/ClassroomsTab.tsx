/**
 * Classroom setup — which rooms take children, and which school GRADE each
 * teaches.
 *
 * The Children's Ministry director organises classrooms by grade, not by age:
 * Joy A/B/C are Pre-K, Kindergarten and 1st; Blossom A/B are 2nd and 3rd;
 * Shine A/B are 4th and 5th; Redeemed A/B/C are 6th, 7th and 8th. Two children
 * born a month apart can be a school year apart, and the ministry teaches to
 * the grade, so grade is what check-in matches on.
 *
 * The age band is kept as a secondary field, used only to place a child whose
 * grade is not on file — common for a first-time visitor at the desk.
 *
 * Both the ministry leader (kids_admin) and an org admin can edit rooms here,
 * including creating and renaming them.
 */

import { useState } from "react";
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
import { Badge } from "@/shared/components/ui/badge";
import { Switch } from "@/shared/components/ui/switch";
import { Alert, AlertDescription } from "@/shared/components/ui/alert";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/shared/components/ui/select";
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from "@/shared/components/ui/dialog";
import {
  AlertDialog,
  AlertDialogAction,
  AlertDialogCancel,
  AlertDialogContent,
  AlertDialogDescription,
  AlertDialogFooter,
  AlertDialogHeader,
  AlertDialogTitle,
} from "@/shared/components/ui/alert-dialog";
import {
  Info,
  Loader2,
  Pencil,
  Plus,
  Trash2,
  UserPlus,
  X,
} from "lucide-react";
import { toast } from "sonner";
import { sortClassrooms, type ClassroomSort } from "../utils/classroomOrder";
import {
  useClassrooms,
  useUpsertClassroom,
  useRetireClassroom,
  useClassroomTeachers,
  useAssignTeacher,
  useRemoveTeacher,
  useEligibleVolunteers,
} from "../hooks/useKidsLeader";
import { errorMessage, isDbError } from "../services/rpcError";
import type {
  ClassroomRow,
  AgeBand,
  SchoolGrade,
  ClassroomTeacher,
} from "../services/kidsLeaderService";

const TEACHER_ROLES = [
  { value: "lead_teacher", label: "Lead teacher" },
  { value: "teacher", label: "Teacher" },
  { value: "assistant", label: "Assistant" },
  { value: "helper", label: "Helper" },
];

const NONE = "__none__";

interface ClassroomsTabProps {
  organizationId: string | undefined;
  canManage: boolean;
}

export function ClassroomsTab({ organizationId, canManage }: ClassroomsTabProps) {
  const { data, isLoading } = useClassrooms(organizationId);
  const upsert = useUpsertClassroom(organizationId);
  const retire = useRetireClassroom(organizationId);

  const { data: teachers } = useClassroomTeachers(organizationId);
  const [editing, setEditing] = useState<ClassroomRow | null>(null);
  const [creating, setCreating] = useState(false);
  const [retiring, setRetiring] = useState<ClassroomRow | null>(null);
  const [staffing, setStaffing] = useState<ClassroomRow | null>(null);
  // Defaults to the ministry's own order, which is what the live board shows.
  const [sort, setSort] = useState<ClassroomSort>("order");

  if (isLoading) {
    return (
      <div className="flex justify-center py-16 text-muted-foreground">
        <Loader2 className="h-6 w-6 animate-spin" />
      </div>
    );
  }

  const rooms = data?.rooms ?? [];
  const grades = data?.grades ?? [];
  const ageBands = data?.ageBands ?? [];
  const classrooms = sortClassrooms(
    rooms.filter((r) => r.config?.is_checkin_location),
    grades,
    sort
  );
  // "Other rooms" are not classrooms and have no order or grade of their own,
  // so they stay alphabetical whatever the classrooms are sorted by.
  const others = sortClassrooms(
    rooms.filter((r) => !r.config?.is_checkin_location),
    grades,
    "name"
  );
  const ungraded = classrooms.filter((r) => !r.config?.school_grade_id);

  async function save(values: ClassroomFormValues) {
    if (!organizationId) return;
    try {
      await upsert.mutateAsync({ organizationId, ...values });
      toast.success(
        values.roomId ? "Classroom updated" : "Classroom added",
        {
          description: values.isCheckinLocation
            ? "It is available at the check-in station now."
            : "It is not offered at check-in.",
        }
      );
      setEditing(null);
      setCreating(false);
    } catch (err) {
      toast.error("Could not save", {
        description: isDbError(err, "room_name_already_used")
          ? "Another room already has that name."
          : isDbError(err, "label_room_name_too_long")
            ? "The printed label name must be 20 characters or fewer."
            : isDbError(err, "not_a_kids_classroom")
              ? "This room belongs to the main calendar. An organization admin has to rename it."
              : isDbError(err, "room_still_has_children")
                ? "Children are still checked into this room. Check them out or move them before taking it off check-in."
                : errorMessage(err),
      });
    }
  }

  return (
    <div className="space-y-4">
      <Alert>
        <Info className="h-4 w-4" />
        <AlertDescription>
          Check-in puts a child in the room that teaches their school grade. If
          a child has no grade on file, their age is used instead and the
          check-in is flagged so you can move them.
        </AlertDescription>
      </Alert>

      {ungraded.length > 0 && (
        <Alert>
          <Info className="h-4 w-4" />
          <AlertDescription>
            {ungraded.length} classroom{ungraded.length === 1 ? " has" : "s have"} no
            grade set, so check-in cannot send anyone there automatically:{" "}
            {ungraded.map((r) => r.room_name).join(", ")}.
          </AlertDescription>
        </Alert>
      )}

      <Card>
        <CardHeader className="flex-row items-start justify-between space-y-0">
          <div>
            <CardTitle>Children's classrooms</CardTitle>
            <CardDescription>
              {classrooms.length} room{classrooms.length === 1 ? "" : "s"} accept
              children at check-in.
            </CardDescription>
          </div>
          <div className="flex flex-wrap items-center gap-2">
            <Label htmlFor="classroom-sort" className="text-xs shrink-0">
              Sort by
            </Label>
            <Select
              value={sort}
              onValueChange={(v) => setSort(v as ClassroomSort)}
            >
              <SelectTrigger id="classroom-sort" className="h-9 w-[7.5rem]">
                <SelectValue />
              </SelectTrigger>
              <SelectContent>
                <SelectItem value="order">Order</SelectItem>
                <SelectItem value="name">Name</SelectItem>
                <SelectItem value="grade">Grade</SelectItem>
              </SelectContent>
            </Select>
            {canManage && (
              <Button size="sm" onClick={() => setCreating(true)}>
                <Plus className="h-4 w-4" />
                Add classroom
              </Button>
            )}
          </div>
        </CardHeader>
        <CardContent className="space-y-2">
          {classrooms.length === 0 && (
            <p className="text-sm text-muted-foreground">
              No classrooms yet. Add one to start.
            </p>
          )}
          {classrooms.map((room) => (
            <RoomRow
              key={room.room_id}
              room={room}
              grades={grades}
              teachers={(teachers ?? []).filter((t) => t.room_id === room.room_id)}
              canManage={canManage}
              onEdit={() => setEditing(room)}
              onRetire={() => setRetiring(room)}
              onStaff={() => setStaffing(room)}
            />
          ))}
        </CardContent>
      </Card>

      {others.length > 0 && (
        <Card>
          <CardHeader>
            <CardTitle className="text-base">Other rooms</CardTitle>
            <CardDescription>
              Not offered at check-in. These belong to the main calendar — a room
              that is not a children's space should stay here.
            </CardDescription>
          </CardHeader>
          <CardContent className="space-y-2">
            {others.map((room) => (
              <RoomRow
                key={room.room_id}
                room={room}
                grades={grades}
                teachers={[]}
                canManage={canManage}
                onEdit={() => setEditing(room)}
              />
            ))}
          </CardContent>
        </Card>
      )}

      <Dialog
        open={creating || editing !== null}
        onOpenChange={(open) => {
          if (!open) {
            setCreating(false);
            setEditing(null);
          }
        }}
      >
        <DialogContent>
          <ClassroomForm
            key={editing?.room_id ?? "new"}
            room={editing}
            grades={grades}
            ageBands={ageBands}
            saving={upsert.isPending}
            onSave={save}
          />
        </DialogContent>
      </Dialog>

      <TeachersDialog
        room={staffing}
        organizationId={organizationId}
        teachers={(teachers ?? []).filter((t) => t.room_id === staffing?.room_id)}
        onClose={() => setStaffing(null)}
      />

      <AlertDialog
        open={retiring !== null}
        onOpenChange={(open) => !open && setRetiring(null)}
      >
        <AlertDialogContent>
          <AlertDialogHeader>
            <AlertDialogTitle>
              Stop using {retiring?.room_name} for children?
            </AlertDialogTitle>
            <AlertDialogDescription>
              It will no longer be offered at check-in. The room itself stays and
              can still be booked on the calendar. You can turn it back on at any
              time.
            </AlertDialogDescription>
          </AlertDialogHeader>
          <AlertDialogFooter>
            <AlertDialogCancel>Cancel</AlertDialogCancel>
            <AlertDialogAction
              onClick={async () => {
                if (!retiring) return;
                try {
                  await retire.mutateAsync(retiring.room_id);
                  toast.success(`${retiring.room_name} removed from check-in`);
                  setRetiring(null);
                } catch (err) {
                  toast.error("Could not remove it", {
                    description: isDbError(err, "room_still_has_children")
                      ? "Children are still checked into this room. Check them out first."
                      : errorMessage(err),
                  });
                }
              }}
            >
              Remove from check-in
            </AlertDialogAction>
          </AlertDialogFooter>
        </AlertDialogContent>
      </AlertDialog>
    </div>
  );
}

function RoomRow({
  room,
  grades,
  teachers,
  canManage,
  onEdit,
  onRetire,
  onStaff,
}: {
  room: ClassroomRow;
  grades: SchoolGrade[];
  teachers: ClassroomTeacher[];
  canManage: boolean;
  onEdit: () => void;
  onRetire?: () => void;
  onStaff?: () => void;
}) {
  const grade = grades.find((g) => g.id === room.config?.school_grade_id);
  // Lead first: at the classroom door, the parent is looking for whoever is
  // responsible for the room.
  const ordered = [...teachers].sort(
    (a, b) => Number(b.is_lead) - Number(a.is_lead)
  );

  return (
    <div className="rounded-md border p-3 space-y-2">
      <div className="flex items-center gap-3">
        <div className="min-w-0 flex-1">
          <p className="font-medium truncate">{room.room_name}</p>
          <p className="text-xs text-muted-foreground truncate">
            {grade ? grade.display_name : "No grade set"}
            {room.config?.capacity ? ` · up to ${room.config.capacity}` : ""}
            {room.config?.ratio_children_per_volunteer
              ? ` · 1 volunteer per ${room.config.ratio_children_per_volunteer}`
              : ""}
          </p>
        </div>
        {room.config?.label_room_name &&
          room.config.label_room_name !== room.room_name && (
            <Badge variant="outline" className="shrink-0 font-mono text-xs">
              {room.config.label_room_name}
            </Badge>
          )}
        {canManage && (
          <>
            {onStaff && (
              <Button
                variant="ghost"
                size="icon"
                className="h-8 w-8"
                title="Teachers"
                onClick={onStaff}
              >
                <UserPlus className="h-4 w-4" />
              </Button>
            )}
            <Button variant="ghost" size="icon" className="h-8 w-8" onClick={onEdit}>
              <Pencil className="h-4 w-4" />
            </Button>
            {onRetire && (
              <Button
                variant="ghost"
                size="icon"
                className="h-8 w-8 text-muted-foreground"
                title="Remove from check-in"
                onClick={onRetire}
              >
                <Trash2 className="h-4 w-4" />
              </Button>
            )}
          </>
        )}
      </div>

      {onStaff && (
        <div className="flex flex-wrap items-center gap-1.5">
          {ordered.length === 0 ? (
            <span className="text-xs text-muted-foreground">
              No teacher assigned — pick-up happens at this door, so someone
              should be named here.
            </span>
          ) : (
            ordered.map((t) => (
              <Badge
                key={t.id}
                variant={t.is_lead ? "default" : "secondary"}
                className="gap-1 font-normal"
              >
                {t.display_name}
                {t.is_lead && " · lead"}
              </Badge>
            ))
          )}
        </div>
      )}

    </div>
  );
}

/** Assign and remove the teachers for one classroom. */
function TeachersDialog({
  room,
  organizationId,
  teachers,
  onClose,
}: {
  room: ClassroomRow | null;
  organizationId: string | undefined;
  teachers: ClassroomTeacher[];
  onClose: () => void;
}) {
  const { data: people, isLoading } = useEligibleVolunteers(organizationId);
  const assign = useAssignTeacher(organizationId);
  const remove = useRemoveTeacher(organizationId);
  const [role, setRole] = useState("teacher");
  const [search, setSearch] = useState("");

  const assigned = new Set(teachers.map((t) => t.person_id));
  const candidates = (people ?? []).filter((p) => {
    if (assigned.has(p.person_id)) return false;
    // A safeguarding decision the church has made about this person. Not a
    // background check - ALIC does not run them.
    if (p.may_not_serve_with_children) return false;
    if (!search.trim()) return true;
    return p.display_name.toLowerCase().includes(search.trim().toLowerCase());
  });

  return (
    <Dialog open={room !== null} onOpenChange={(open) => !open && onClose()}>
      <DialogContent>
        <DialogHeader>
          <DialogTitle>{room?.room_name} teachers</DialogTitle>
          <DialogDescription>
            Children are collected at this classroom door, so these are the
            people a parent will be handed their child by.
          </DialogDescription>
        </DialogHeader>

        <div className="space-y-4 max-h-[60vh] overflow-y-auto pr-1">
          <div className="space-y-2">
            <Label className="text-xs uppercase text-muted-foreground">
              Assigned
            </Label>
            {teachers.length === 0 && (
              <p className="text-sm text-muted-foreground">Nobody yet.</p>
            )}
            {teachers.map((t) => (
              <div
                key={t.id}
                className="flex items-center gap-2 rounded-md border p-2"
              >
                <div className="min-w-0 flex-1">
                  <p className="text-sm font-medium truncate">
                    {t.display_name}
                  </p>
                  <p className="text-xs text-muted-foreground truncate">
                    {TEACHER_ROLES.find((r) => r.value === t.role)?.label ?? t.role}
                    {t.is_lead && " · lead"}
                    {t.phone ? ` · ${t.phone}` : ""}
                  </p>
                </div>
                <Button
                  variant="ghost"
                  size="icon"
                  className="h-8 w-8"
                  title="Remove from this classroom"
                  onClick={async () => {
                    try {
                      await remove.mutateAsync(t.id);
                      toast.success(`${t.display_name} removed`);
                    } catch (err) {
                      toast.error(errorMessage(err));
                    }
                  }}
                >
                  <X className="h-4 w-4" />
                </Button>
              </div>
            ))}
          </div>

          <div className="space-y-2 border-t pt-4">
            <Label className="text-xs uppercase text-muted-foreground">Add</Label>
            <div className="flex gap-2">
              <Select value={role} onValueChange={setRole}>
                <SelectTrigger className="w-40">
                  <SelectValue />
                </SelectTrigger>
                <SelectContent>
                  {TEACHER_ROLES.map((r) => (
                    <SelectItem key={r.value} value={r.value}>
                      {r.label}
                    </SelectItem>
                  ))}
                </SelectContent>
              </Select>
              <Input
                placeholder="Search people"
                value={search}
                onChange={(e) => setSearch(e.target.value)}
              />
            </div>

            <div className="max-h-60 space-y-1.5 overflow-y-auto">
              {isLoading && (
                <div className="flex justify-center py-4">
                  <Loader2 className="h-5 w-5 animate-spin text-muted-foreground" />
                </div>
              )}
              {candidates.map((person) => (
                <div
                  key={person.person_id}
                  className="flex items-center gap-2 rounded-md border p-2"
                >
                  <div className="min-w-0 flex-1">
                    <p className="text-sm truncate">{person.display_name}</p>
                    {person.phone && (
                      <p className="text-xs text-muted-foreground truncate">
                        {person.phone}
                      </p>
                    )}
                  </div>
                  <Button
                    variant="outline"
                    size="sm"
                    disabled={assign.isPending || !room}
                    onClick={async () => {
                      if (!room) return;
                      try {
                        await assign.mutateAsync({
                          roomId: room.room_id,
                          personId: person.person_id,
                          role,
                          isLead: role === "lead_teacher",
                        });
                        toast.success(`${person.display_name} added`);
                        setSearch("");
                      } catch (err) {
                        toast.error("Could not add them", {
                          description: isDbError(err, "volunteer_is_restricted")
                            ? "This person is restricted from serving with children."
                            : errorMessage(err),
                        });
                      }
                    }}
                  >
                    <UserPlus className="h-4 w-4" />
                  </Button>
                </div>
              ))}
              {!isLoading && candidates.length === 0 && (
                <p className="py-4 text-center text-sm text-muted-foreground">
                  {search ? "Nobody matches that." : "Everyone is already assigned."}
                </p>
              )}
            </div>
          </div>
        </div>
      </DialogContent>
    </Dialog>
  );
}

interface ClassroomFormValues {
  roomId?: string | null;
  name: string;
  schoolGradeId: string | null;
  ageBandId: string | null;
  capacity: number | null;
  ratio: number | null;
  labelRoomName: string | null;
  sortOrder: number;
  isCheckinLocation: boolean;
}

function ClassroomForm({
  room,
  grades,
  ageBands,
  saving,
  onSave,
}: {
  room: ClassroomRow | null;
  grades: SchoolGrade[];
  ageBands: AgeBand[];
  saving: boolean;
  onSave: (values: ClassroomFormValues) => void;
}) {
  const cfg = room?.config;
  const [name, setName] = useState(room?.room_name ?? "");
  const [gradeId, setGradeId] = useState(cfg?.school_grade_id ?? NONE);
  const [bandId, setBandId] = useState(cfg?.kids_age_band_id ?? NONE);
  const [capacity, setCapacity] = useState(
    cfg?.capacity != null ? String(cfg.capacity) : ""
  );
  const [ratio, setRatio] = useState(
    cfg?.ratio_children_per_volunteer != null
      ? String(cfg.ratio_children_per_volunteer)
      : ""
  );
  const [label, setLabel] = useState(cfg?.label_room_name ?? "");
  const [sortOrder, setSortOrder] = useState(String(cfg?.sort_order ?? 0));
  // A new room is a classroom — that is what this dialog is for. An existing
  // one keeps whatever it already is, so opening a main-calendar room to fix
  // its capacity does not quietly hand it to children's ministry.
  const [isClassroom, setIsClassroom] = useState(
    room ? (cfg?.is_checkin_location ?? false) : true
  );

  return (
    <>
      <DialogHeader>
        <DialogTitle>{room ? room.room_name : "New classroom"}</DialogTitle>
        <DialogDescription>
          {room
            ? "How this room is used for children's ministry."
            : "Adds a room and makes it available at check-in."}
        </DialogDescription>
      </DialogHeader>

      <div className="space-y-4 py-2 max-h-[60vh] overflow-y-auto pr-1">
        <div className="space-y-2">
          <Label>Room name</Label>
          <Input
            value={name}
            onChange={(e) => setName(e.target.value)}
            placeholder="Joy C"
          />
        </div>

        <div className="flex items-start justify-between gap-4 rounded-md border p-3">
          <div className="space-y-1">
            <Label htmlFor="is-classroom">Offer this room at check-in</Label>
            <p className="text-xs text-muted-foreground">
              {isClassroom
                ? "It appears in the room list at the check-in station."
                : "It stays on the main calendar and is never offered for a child."}
            </p>
          </div>
          <Switch
            id="is-classroom"
            checked={isClassroom}
            onCheckedChange={setIsClassroom}
          />
        </div>

        <div className="space-y-2">
          <Label>School grade</Label>
          <Select value={gradeId} onValueChange={setGradeId}>
            <SelectTrigger>
              <SelectValue placeholder="Choose a grade" />
            </SelectTrigger>
            <SelectContent>
              <SelectItem value={NONE}>No grade</SelectItem>
              {grades.map((grade) => (
                <SelectItem key={grade.id} value={grade.id}>
                  {grade.display_name}
                </SelectItem>
              ))}
            </SelectContent>
          </Select>
          <p className="text-xs text-muted-foreground">
            Check-in sends children in this grade here. Two rooms may share a
            grade — children go to whichever is emptier.
          </p>
        </div>

        <div className="grid grid-cols-2 gap-3">
          <div className="space-y-2">
            <Label>Capacity</Label>
            <Input
              type="number"
              min={1}
              value={capacity}
              onChange={(e) => setCapacity(e.target.value)}
              placeholder="No limit"
            />
          </div>
          <div className="space-y-2">
            <Label>Children per volunteer</Label>
            <Input
              type="number"
              min={1}
              value={ratio}
              onChange={(e) => setRatio(e.target.value)}
              placeholder="No target"
            />
          </div>
        </div>
        <p className="text-xs text-muted-foreground -mt-2">
          Both are warnings only — check-in never turns a child away. Leave
          blank and the room simply never warns.
        </p>

        <div className="grid grid-cols-2 gap-3">
          <div className="space-y-2">
            <Label>Name on the printed label</Label>
            <Input
              value={label}
              maxLength={20}
              onChange={(e) => setLabel(e.target.value)}
              placeholder={name.slice(0, 20) || "Joy C"}
            />
            <p className="text-xs text-muted-foreground">{label.length}/20</p>
          </div>
          <div className="space-y-2">
            <Label>Order</Label>
            <Input
              type="number"
              value={sortOrder}
              onChange={(e) => setSortOrder(e.target.value)}
            />
          </div>
        </div>

        <div className="space-y-2 border-t pt-4">
          <Label className="text-muted-foreground">
            Age group — fallback only
          </Label>
          <Select value={bandId} onValueChange={setBandId}>
            <SelectTrigger>
              <SelectValue placeholder="None" />
            </SelectTrigger>
            <SelectContent>
              <SelectItem value={NONE}>None</SelectItem>
              {ageBands.map((band) => (
                <SelectItem key={band.id} value={band.id}>
                  {band.display_name}
                </SelectItem>
              ))}
            </SelectContent>
          </Select>
          <p className="text-xs text-muted-foreground">
            Only used for a child with no grade on file, such as a first-time
            visitor. Leave as None unless you want this room to take them.
          </p>
        </div>
      </div>

      <DialogFooter>
        <Button
          disabled={saving || !name.trim()}
          onClick={() =>
            onSave({
              roomId: room?.room_id ?? null,
              name: name.trim(),
              schoolGradeId: gradeId === NONE ? null : gradeId,
              ageBandId: bandId === NONE ? null : bandId,
              capacity: capacity.trim() ? Number(capacity) : null,
              ratio: ratio.trim() ? Number(ratio) : null,
              labelRoomName: label.trim() || null,
              sortOrder: Number(sortOrder) || 0,
              isCheckinLocation: isClassroom,
            })
          }
        >
          {saving && <Loader2 className="h-4 w-4 animate-spin" />}
          Save
        </Button>
      </DialogFooter>
    </>
  );
}
