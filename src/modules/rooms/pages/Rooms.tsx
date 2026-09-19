import { useState } from "react";
import { useQuery, useMutation, useQueryClient } from "@tanstack/react-query";
import { supabase } from "@/integrations/supabase/client";
import DashboardLayout from "@/shared/components/layout/DashboardLayout";
import { Button } from "@/shared/components/ui/button";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/shared/components/ui/card";
import { Dialog, DialogContent, DialogDescription, DialogFooter, DialogHeader, DialogTitle } from "@/shared/components/ui/dialog";
import { Input } from "@/shared/components/ui/input";
import { Label } from "@/shared/components/ui/label";
import { Textarea } from "@/shared/components/ui/textarea";
import { Switch } from "@/shared/components/ui/switch";
import { Badge } from "@/shared/components/ui/badge";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/shared/components/ui/select";
import { useToast } from "@/shared/hooks/use-toast";
import { Plus, Edit, Trash2, DoorOpen, Baby } from "lucide-react";
import { AlertDialog, AlertDialogAction, AlertDialogCancel, AlertDialogContent, AlertDialogDescription, AlertDialogFooter, AlertDialogHeader, AlertDialogTitle } from "@/shared/components/ui/alert-dialog";
import { useOrganization } from "@/shared/contexts/OrganizationContext";

interface Room {
  id: string;
  name: string;
  description: string | null;
  color: string;
  is_active: boolean;
  organization_id: string;
  created_at: string;
  updated_at: string;
}

/** Sentinel: a Select cannot hold an empty-string value. */
const NO_GRADE = "__none__";

/**
 * Turn a database refusal into something an administrator can act on.
 *
 * Deleting a room that has ever been opened for children's check-in is
 * refused by an ON DELETE RESTRICT on church.kids_session_rooms — the register
 * of where children physically were is not allowed to lose the room's name.
 * Raw, that surfaced as a constraint name under a dialog promising the delete
 * would work.
 */
const explainRoomError = (error: any): string => {
  const raw = String(error?.message ?? error ?? "");
  if (raw.includes("kids_session_rooms") || raw.includes("kids_check_ins")) {
    return "This room has been used for kids check-in, so it cannot be deleted without losing the record of which children were in it. Switch it off below, or mark it inactive instead.";
  }
  if (raw.includes("room_still_has_children")) {
    return "Children are still checked into this room. Check them out or move them first.";
  }
  if (raw.includes("violates foreign key")) {
    return "This room is still referenced elsewhere — most likely by an event. Mark it inactive instead of deleting it.";
  }
  if (raw.includes("room_name_already_used")) {
    return "Another room already has that name.";
  }
  if (raw.includes("not_permitted")) {
    return "You do not have permission to change children's ministry settings.";
  }
  return raw;
};

const Rooms = () => {
  const { toast } = useToast();
  const queryClient = useQueryClient();
  const { currentOrganization } = useOrganization();
  const [isDialogOpen, setIsDialogOpen] = useState(false);
  const [editingRoom, setEditingRoom] = useState<Room | null>(null);
  const [deleteRoomId, setDeleteRoomId] = useState<string | null>(null);
  const [formData, setFormData] = useState({
    name: "",
    description: "",
    color: "#6366f1",
    is_active: true,
  });
  /**
   * Children's-ministry settings, kept beside the form rather than inside it:
   * they live on church.room_kids_config, not on public.rooms, and are saved
   * by a different call.
   *
   * Without them, a room created here existed only on the main calendar. It
   * never appeared at the check-in station and there was nothing on this page
   * to say why — the only way to make a room take children was to find it
   * under "Other rooms" on the Kids Ministry page.
   */
  const [isClassroom, setIsClassroom] = useState(false);
  const [gradeId, setGradeId] = useState<string>(NO_GRADE);

  const { data: rooms, isLoading } = useQuery({
    queryKey: ["rooms-admin", currentOrganization?.id],
    queryFn: async () => {
      if (!currentOrganization?.id) return [];

      const { data, error } = await supabase
        .from("rooms")
        .select("*")
        .eq("organization_id", currentOrganization.id)
        .order("name");

      if (error) throw error;
      return data as Room[];
    },
    enabled: !!currentOrganization?.id,
  });

  /**
   * Which rooms take children, and the grade each teaches.
   *
   * church.room_kids_config is a separate table because public.rooms is
   * readable by anon for the public calendar, so this cannot be a join.
   * An org admin holds every module permission, so RLS lets this page read and
   * write it; for anyone else the query simply returns nothing and the kids
   * controls stay hidden.
   */
  const { data: kidsConfigs } = useQuery({
    queryKey: ["rooms-admin-kids-config", currentOrganization?.id],
    queryFn: async () => {
      if (!currentOrganization?.id) return [];
      const { data, error } = await supabase
        .schema("church")
        .from("room_kids_config")
        .select("*")
        .eq("organization_id", currentOrganization.id);
      if (error) throw error;
      return data ?? [];
    },
    enabled: !!currentOrganization?.id,
  });

  const { data: grades } = useQuery({
    queryKey: ["rooms-admin-grades", currentOrganization?.id],
    queryFn: async () => {
      if (!currentOrganization?.id) return [];
      const { data, error } = await supabase
        .schema("church")
        .from("school_grades")
        .select("id, display_name, sort_order")
        .eq("organization_id", currentOrganization.id)
        .eq("is_active", true)
        .order("sort_order");
      if (error) throw error;
      return data ?? [];
    },
    enabled: !!currentOrganization?.id,
  });

  const invalidateRooms = () => {
    queryClient.invalidateQueries({ queryKey: ["rooms-admin"] });
    queryClient.invalidateQueries({ queryKey: ["rooms"] });
    queryClient.invalidateQueries({ queryKey: ["rooms-admin-kids-config"] });
  };

  const configByRoom = new Map(
    (kidsConfigs ?? []).map((c) => [c.room_id, c])
  );
  /**
   * Hidden entirely where the branch runs no children's ministry — and while
   * the answer is still loading, so the controls never show a state that is
   * merely "not fetched yet".
   */
  const kidsAvailable =
    kidsConfigs !== undefined &&
    grades !== undefined &&
    (grades.length > 0 || kidsConfigs.length > 0);

  /**
   * Save the children's-ministry side of a room.
   *
   * Goes through the RPC rather than writing room_kids_config directly,
   * because the RPC is what reconciles every open session — which is what puts
   * the room on the check-in tablet without waiting for the next service.
   *
   * Existing capacity, ratio, label and order are read back and passed through.
   * The RPC replaces every column it is given, so omitting them would wipe
   * settings made on the Kids Ministry page the moment somebody edited a
   * room's colour here.
   */
  const saveKidsConfig = async (roomId: string) => {
    // Nothing known yet about which rooms take children. The controls are
    // hidden in that state, so the switch below is showing "off" only because
    // it has no data — saving on it would quietly take a classroom off
    // check-in for somebody who opened the dialog to change a colour.
    if (kidsConfigs === undefined) return;

    const existing = configByRoom.get(roomId);
    const wasClassroom = existing?.is_checkin_location ?? false;
    if (!isClassroom && !wasClassroom) return;

    const { error } = await supabase
      .schema("church")
      .rpc("upsert_kids_classroom", {
        _organization_id: currentOrganization!.id,
        _room_id: roomId,
        _school_grade_id: gradeId === NO_GRADE ? null : gradeId,
        _kids_age_band_id: existing?.kids_age_band_id ?? null,
        _capacity: existing?.capacity ?? null,
        _ratio: existing?.ratio_children_per_volunteer ?? null,
        _label_room_name: existing?.label_room_name ?? null,
        _sort_order: existing?.sort_order ?? 0,
        _is_checkin_location: isClassroom,
      });
    if (error) throw error;
  };

  const createRoomMutation = useMutation({
    mutationFn: async (newRoom: typeof formData) => {
      if (!currentOrganization?.id) throw new Error("No organization selected");

      const { data, error } = await supabase
        .from("rooms")
        .insert([{ ...newRoom, organization_id: currentOrganization.id }])
        .select()
        .single();

      if (error) throw error;
      // The room exists, so this configures it rather than creating a second
      // one. Passing a name here would be refused as a duplicate.
      await saveKidsConfig(data.id);
      return data;
    },
    onSuccess: () => {
      invalidateRooms();
      toast({
        title: "Room created successfully",
        description: isClassroom
          ? "It is available at the check-in station now."
          : undefined,
      });
      resetForm();
    },
    onError: (error: any) => {
      toast({
        title: "Error creating room",
        description: explainRoomError(error),
        variant: "destructive",
      });
    },
  });

  const updateRoomMutation = useMutation({
    mutationFn: async ({ id, updates }: { id: string; updates: Partial<Room> }) => {
      const { data, error } = await supabase
        .from("rooms")
        .update(updates)
        .eq("id", id)
        .select()
        .single();

      if (error) throw error;
      await saveKidsConfig(id);
      return data;
    },
    onSuccess: () => {
      invalidateRooms();
      toast({
        title: "Room updated successfully",
        description: isClassroom
          ? "It is available at the check-in station now."
          : undefined,
      });
      resetForm();
    },
    onError: (error: any) => {
      toast({
        title: "Error updating room",
        description: explainRoomError(error),
        variant: "destructive",
      });
    },
  });

  const deleteRoomMutation = useMutation({
    mutationFn: async (id: string) => {
      const { error } = await supabase
        .from("rooms")
        .delete()
        .eq("id", id);

      if (error) throw error;
    },
    onSuccess: () => {
      invalidateRooms();
      toast({ title: "Room deleted successfully" });
      setDeleteRoomId(null);
    },
    onError: (error: any) => {
      toast({
        title: "Error deleting room",
        description: explainRoomError(error),
        variant: "destructive",
      });
      setDeleteRoomId(null);
    },
  });

  const resetForm = () => {
    setFormData({
      name: "",
      description: "",
      color: "#6366f1",
      is_active: true,
    });
    setIsClassroom(false);
    setGradeId(NO_GRADE);
    setEditingRoom(null);
    setIsDialogOpen(false);
  };

  const handleEdit = (room: Room) => {
    const cfg = configByRoom.get(room.id);
    setEditingRoom(room);
    setFormData({
      name: room.name,
      description: room.description || "",
      color: room.color,
      is_active: room.is_active,
    });
    // Whatever the room already is. A room that is not a children's space must
    // not become one because somebody opened it to change its colour.
    setIsClassroom(cfg?.is_checkin_location ?? false);
    setGradeId(cfg?.school_grade_id ?? NO_GRADE);
    setIsDialogOpen(true);
  };

  const handleSubmit = (e: React.FormEvent) => {
    e.preventDefault();

    if (editingRoom) {
      updateRoomMutation.mutate({
        id: editingRoom.id,
        updates: formData,
      });
    } else {
      createRoomMutation.mutate(formData);
    }
  };

  const predefinedColors = [
    { name: "Blue", value: "#6366f1" },
    { name: "Purple", value: "#8b5cf6" },
    { name: "Pink", value: "#ec4899" },
    { name: "Red", value: "#ef4444" },
    { name: "Orange", value: "#f97316" },
    { name: "Yellow", value: "#f59e0b" },
    { name: "Green", value: "#10b981" },
    { name: "Teal", value: "#14b8a6" },
    { name: "Cyan", value: "#06b6d4" },
    { name: "Indigo", value: "#4f46e5" },
  ];

  return (
    <DashboardLayout>
      <div className="space-y-4 sm:space-y-6">
        <div className="flex flex-col sm:flex-row sm:justify-between sm:items-center gap-3">
          <div>
            <h1 className="text-2xl sm:text-3xl font-bold">Room Management</h1>
            <p className="text-sm sm:text-base text-muted-foreground mt-1">
              Create and manage event rooms
            </p>
          </div>
          <Button onClick={() => setIsDialogOpen(true)} size="sm" className="gap-2 w-full sm:w-auto">
            <Plus className="h-4 w-4 sm:h-5 sm:w-5" />
            Add Room
          </Button>
        </div>

        {isLoading ? (
          <div className="flex items-center justify-center py-8 sm:py-12">
            <div className="animate-spin rounded-full h-8 w-8 sm:h-12 sm:w-12 border-b-2 border-primary"></div>
          </div>
        ) : (
          <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-3 sm:gap-6">
            {rooms?.map((room) => (
              <Card key={room.id} className="relative">
                <CardHeader className="p-4 sm:p-6">
                  <div className="flex items-start justify-between gap-2">
                    <div className="flex items-center gap-2 min-w-0">
                      <div
                        className="w-3 h-3 sm:w-4 sm:h-4 rounded-full flex-shrink-0"
                        style={{ backgroundColor: room.color }}
                      />
                      <CardTitle className="text-base sm:text-lg truncate">{room.name}</CardTitle>
                    </div>
                    <div className="flex gap-1 flex-shrink-0">
                      <Button
                        variant="ghost"
                        size="icon"
                        className="h-8 w-8"
                        onClick={() => handleEdit(room)}
                      >
                        <Edit className="h-4 w-4" />
                      </Button>
                      <Button
                        variant="ghost"
                        size="icon"
                        className="h-8 w-8"
                        onClick={() => setDeleteRoomId(room.id)}
                      >
                        <Trash2 className="h-4 w-4 text-destructive" />
                      </Button>
                    </div>
                  </div>
                  <CardDescription className="text-xs sm:text-sm line-clamp-2">
                    {room.description || "No description"}
                  </CardDescription>
                </CardHeader>
                <CardContent className="p-4 sm:p-6 pt-0 sm:pt-0">
                  <div className="flex items-center justify-between">
                    <div className="flex items-center gap-2">
                      <DoorOpen className="h-4 w-4 text-muted-foreground" />
                      <span className="text-xs sm:text-sm text-muted-foreground">
                        Status
                      </span>
                    </div>
                    <span
                      className={`text-xs sm:text-sm font-medium ${
                        room.is_active ? "text-green-600" : "text-red-600"
                      }`}
                    >
                      {room.is_active ? "Active" : "Inactive"}
                    </span>
                  </div>
                  {/* Whether the room reaches the check-in station, said on
                      the page where rooms are created. Its absence is why a
                      new room could look finished here and be missing at the
                      desk. */}
                  {configByRoom.get(room.id)?.is_checkin_location && (
                    <div className="mt-3 flex flex-wrap items-center gap-1.5">
                      <Badge variant="secondary" className="gap-1">
                        <Baby className="h-3 w-3" />
                        Kids check-in
                      </Badge>
                      <Badge variant="outline">
                        {(grades ?? []).find(
                          (g) =>
                            g.id === configByRoom.get(room.id)?.school_grade_id
                        )?.display_name ?? "No grade set"}
                      </Badge>
                    </div>
                  )}
                </CardContent>
              </Card>
            ))}
          </div>
        )}

        {/* Create/Edit Dialog */}
        <Dialog open={isDialogOpen} onOpenChange={(open) => {
          if (!open) resetForm();
          setIsDialogOpen(open);
        }}>
          <DialogContent className="sm:max-w-[500px]">
            <DialogHeader>
              <DialogTitle>
                {editingRoom ? "Edit Room" : "Create New Room"}
              </DialogTitle>
              <DialogDescription>
                {editingRoom
                  ? "Update the room details below"
                  : "Add a new room for events"}
              </DialogDescription>
            </DialogHeader>
            <form onSubmit={handleSubmit}>
              <div className="space-y-4 py-4">
                <div className="space-y-2">
                  <Label htmlFor="name">Room Name *</Label>
                  <Input
                    id="name"
                    value={formData.name}
                    onChange={(e) =>
                      setFormData({ ...formData, name: e.target.value })
                    }
                    placeholder="e.g., Main Hall"
                    required
                  />
                </div>

                <div className="space-y-2">
                  <Label htmlFor="description">Description</Label>
                  <Textarea
                    id="description"
                    value={formData.description}
                    onChange={(e) =>
                      setFormData({ ...formData, description: e.target.value })
                    }
                    placeholder="Brief description of the room"
                    rows={3}
                  />
                </div>

                <div className="space-y-2">
                  <Label>Color</Label>
                  <div className="grid grid-cols-5 gap-2">
                    {predefinedColors.map((color) => (
                      <button
                        key={color.value}
                        type="button"
                        onClick={() =>
                          setFormData({ ...formData, color: color.value })
                        }
                        className={`w-full aspect-square rounded-lg border-2 transition-all ${
                          formData.color === color.value
                            ? "border-primary ring-2 ring-primary ring-offset-2"
                            : "border-transparent hover:border-gray-300"
                        }`}
                        style={{ backgroundColor: color.value }}
                        title={color.name}
                      />
                    ))}
                  </div>
                  <div className="flex items-center gap-2 mt-2">
                    <Label htmlFor="custom-color" className="text-sm">
                      Custom:
                    </Label>
                    <Input
                      id="custom-color"
                      type="color"
                      value={formData.color}
                      onChange={(e) =>
                        setFormData({ ...formData, color: e.target.value })
                      }
                      className="w-20 h-10"
                    />
                  </div>
                </div>

                <div className="flex items-center justify-between">
                  <Label htmlFor="is_active">Active</Label>
                  <Switch
                    id="is_active"
                    checked={formData.is_active}
                    onCheckedChange={(checked) =>
                      setFormData({ ...formData, is_active: checked })
                    }
                  />
                </div>

                {kidsAvailable && (
                  <div className="space-y-3 rounded-lg border p-3">
                    <div className="flex items-start justify-between gap-4">
                      <div className="space-y-1">
                        <Label
                          htmlFor="is_classroom"
                          className="flex items-center gap-2"
                        >
                          <Baby className="h-4 w-4" />
                          Used for kids check-in
                        </Label>
                        <p className="text-xs text-muted-foreground">
                          {isClassroom
                            ? "Volunteers can send a child here at the check-in station."
                            : "Calendar and bookings only. Never offered for a child."}
                        </p>
                      </div>
                      <Switch
                        id="is_classroom"
                        checked={isClassroom}
                        onCheckedChange={setIsClassroom}
                      />
                    </div>

                    {isClassroom && (
                      <div className="space-y-2">
                        <Label htmlFor="school_grade">School grade</Label>
                        <Select value={gradeId} onValueChange={setGradeId}>
                          <SelectTrigger id="school_grade">
                            <SelectValue placeholder="Choose a grade" />
                          </SelectTrigger>
                          <SelectContent>
                            <SelectItem value={NO_GRADE}>No grade</SelectItem>
                            {(grades ?? []).map((grade) => (
                              <SelectItem key={grade.id} value={grade.id}>
                                {grade.display_name}
                              </SelectItem>
                            ))}
                          </SelectContent>
                        </Select>
                        <p className="text-xs text-muted-foreground">
                          {gradeId === NO_GRADE
                            ? "Without a grade, check-in cannot send anyone here on its own — a volunteer has to pick the room by hand."
                            : "Check-in sends children in this grade here. Capacity and teachers are set on the Kids Ministry page."}
                        </p>
                      </div>
                    )}
                  </div>
                )}
              </div>

              <DialogFooter>
                <Button
                  type="button"
                  variant="outline"
                  onClick={resetForm}
                >
                  Cancel
                </Button>
                <Button
                  type="submit"
                  disabled={
                    createRoomMutation.isPending || updateRoomMutation.isPending
                  }
                >
                  {editingRoom ? "Update" : "Create"} Room
                </Button>
              </DialogFooter>
            </form>
          </DialogContent>
        </Dialog>

        {/* Delete Confirmation */}
        <AlertDialog
          open={!!deleteRoomId}
          onOpenChange={() => setDeleteRoomId(null)}
        >
          <AlertDialogContent>
            <AlertDialogHeader>
              <AlertDialogTitle>Are you sure?</AlertDialogTitle>
              <AlertDialogDescription>
                This will permanently delete this room and all associated events.
                This action cannot be undone.
              </AlertDialogDescription>
            </AlertDialogHeader>
            <AlertDialogFooter>
              <AlertDialogCancel>Cancel</AlertDialogCancel>
              <AlertDialogAction
                onClick={() => deleteRoomId && deleteRoomMutation.mutate(deleteRoomId)}
                className="bg-destructive text-destructive-foreground hover:bg-destructive/90"
              >
                Delete
              </AlertDialogAction>
            </AlertDialogFooter>
          </AlertDialogContent>
        </AlertDialog>
      </div>
    </DashboardLayout>
  );
};

export default Rooms;
