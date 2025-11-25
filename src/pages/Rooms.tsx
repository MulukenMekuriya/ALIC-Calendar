import { useState } from "react";
import { useQuery, useMutation, useQueryClient } from "@tanstack/react-query";
import { supabase } from "@/integrations/supabase/client";
import DashboardLayout from "@/components/layout/DashboardLayout";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { Dialog, DialogContent, DialogDescription, DialogFooter, DialogHeader, DialogTitle } from "@/components/ui/dialog";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Textarea } from "@/components/ui/textarea";
import { Switch } from "@/components/ui/switch";
import { useToast } from "@/hooks/use-toast";
import { Plus, Edit, Trash2, DoorOpen } from "lucide-react";
import { AlertDialog, AlertDialogAction, AlertDialogCancel, AlertDialogContent, AlertDialogDescription, AlertDialogFooter, AlertDialogHeader, AlertDialogTitle } from "@/components/ui/alert-dialog";
import { useOrganization } from "@/contexts/OrganizationContext";

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

  const createRoomMutation = useMutation({
    mutationFn: async (newRoom: typeof formData) => {
      if (!currentOrganization?.id) throw new Error("No organization selected");

      const { data, error } = await supabase
        .from("rooms")
        .insert([{ ...newRoom, organization_id: currentOrganization.id }])
        .select()
        .single();

      if (error) throw error;
      return data;
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["rooms-admin"] });
      queryClient.invalidateQueries({ queryKey: ["rooms"] });
      toast({ title: "Room created successfully" });
      resetForm();
    },
    onError: (error: any) => {
      toast({
        title: "Error creating room",
        description: error.message,
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
      return data;
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["rooms-admin"] });
      queryClient.invalidateQueries({ queryKey: ["rooms"] });
      toast({ title: "Room updated successfully" });
      resetForm();
    },
    onError: (error: any) => {
      toast({
        title: "Error updating room",
        description: error.message,
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
      queryClient.invalidateQueries({ queryKey: ["rooms-admin"] });
      queryClient.invalidateQueries({ queryKey: ["rooms"] });
      toast({ title: "Room deleted successfully" });
      setDeleteRoomId(null);
    },
    onError: (error: any) => {
      toast({
        title: "Error deleting room",
        description: error.message,
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
    setEditingRoom(null);
    setIsDialogOpen(false);
  };

  const handleEdit = (room: Room) => {
    setEditingRoom(room);
    setFormData({
      name: room.name,
      description: room.description || "",
      color: room.color,
      is_active: room.is_active,
    });
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
      <div className="space-y-6">
        <div className="flex justify-between items-center">
          <div>
            <h1 className="text-3xl font-bold">Room Management</h1>
            <p className="text-muted-foreground mt-1">
              Create and manage event rooms
            </p>
          </div>
          <Button onClick={() => setIsDialogOpen(true)} size="lg" className="gap-2">
            <Plus className="h-5 w-5" />
            Add Room
          </Button>
        </div>

        {isLoading ? (
          <div className="flex items-center justify-center py-12">
            <div className="animate-spin rounded-full h-12 w-12 border-b-2 border-primary"></div>
          </div>
        ) : (
          <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-6">
            {rooms?.map((room) => (
              <Card key={room.id} className="relative">
                <CardHeader>
                  <div className="flex items-start justify-between">
                    <div className="flex items-center gap-2">
                      <div
                        className="w-4 h-4 rounded-full"
                        style={{ backgroundColor: room.color }}
                      />
                      <CardTitle>{room.name}</CardTitle>
                    </div>
                    <div className="flex gap-1">
                      <Button
                        variant="ghost"
                        size="icon"
                        onClick={() => handleEdit(room)}
                      >
                        <Edit className="h-4 w-4" />
                      </Button>
                      <Button
                        variant="ghost"
                        size="icon"
                        onClick={() => setDeleteRoomId(room.id)}
                      >
                        <Trash2 className="h-4 w-4 text-destructive" />
                      </Button>
                    </div>
                  </div>
                  <CardDescription>
                    {room.description || "No description"}
                  </CardDescription>
                </CardHeader>
                <CardContent>
                  <div className="flex items-center justify-between">
                    <div className="flex items-center gap-2">
                      <DoorOpen className="h-4 w-4 text-muted-foreground" />
                      <span className="text-sm text-muted-foreground">
                        Status
                      </span>
                    </div>
                    <span
                      className={`text-sm font-medium ${
                        room.is_active ? "text-green-600" : "text-red-600"
                      }`}
                    >
                      {room.is_active ? "Active" : "Inactive"}
                    </span>
                  </div>
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
