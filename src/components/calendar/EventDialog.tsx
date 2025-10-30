import { useEffect, useState } from "react";
import { useQuery } from "@tanstack/react-query";
import { supabase } from "@/integrations/supabase/client";
import { useAuth } from "@/contexts/AuthContext";
import { Dialog, DialogContent, DialogHeader, DialogTitle } from "@/components/ui/dialog";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Textarea } from "@/components/ui/textarea";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { useToast } from "@/hooks/use-toast";
import { z } from "zod";

interface EventDialogProps {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  eventId: string | null;
  onSuccess: () => void;
}

const eventSchema = z.object({
  title: z.string().min(1, "Title is required").max(200, "Title too long"),
  description: z.string().max(1000, "Description too long").optional(),
  room_id: z.string().uuid("Invalid room"),
  starts_at: z.string().min(1, "Start time is required"),
  ends_at: z.string().min(1, "End time is required"),
}).refine((data) => new Date(data.ends_at) > new Date(data.starts_at), {
  message: "End time must be after start time",
  path: ["ends_at"],
});

const EventDialog = ({ open, onOpenChange, eventId, onSuccess }: EventDialogProps) => {
  const { user, isAdmin } = useAuth();
  const { toast } = useToast();
  const [loading, setLoading] = useState(false);

  const [formData, setFormData] = useState({
    title: "",
    description: "",
    room_id: "",
    starts_at: "",
    ends_at: "",
  });

  const { data: event } = useQuery({
    queryKey: ["event", eventId],
    queryFn: async () => {
      if (!eventId) return null;
      const { data, error } = await supabase
        .from("events")
        .select("*")
        .eq("id", eventId)
        .single();

      if (error) throw error;
      return data;
    },
    enabled: !!eventId,
  });

  const { data: rooms } = useQuery({
    queryKey: ["rooms"],
    queryFn: async () => {
      const { data, error } = await supabase
        .from("rooms")
        .select("*")
        .eq("is_active", true)
        .order("name");

      if (error) throw error;
      return data;
    },
  });

  useEffect(() => {
    if (event) {
      setFormData({
        title: event.title,
        description: event.description || "",
        room_id: event.room_id,
        starts_at: event.starts_at.slice(0, 16),
        ends_at: event.ends_at.slice(0, 16),
      });
    } else {
      setFormData({
        title: "",
        description: "",
        room_id: "",
        starts_at: "",
        ends_at: "",
      });
    }
  }, [event]);

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    setLoading(true);

    try {
      const validated = eventSchema.parse(formData);

      const eventData = {
        title: validated.title,
        description: validated.description,
        room_id: validated.room_id,
        starts_at: new Date(validated.starts_at).toISOString(),
        ends_at: new Date(validated.ends_at).toISOString(),
      };

      if (eventId) {
        const { error } = await supabase
          .from("events")
          .update(eventData)
          .eq("id", eventId);

        if (error) throw error;

        toast({ title: "Event updated successfully" });
      } else {
        const { error } = await supabase.from("events").insert([{
          ...eventData,
          created_by: user!.id,
        }]);

        if (error) throw error;

        toast({ title: "Event created successfully" });
      }

      onSuccess();
    } catch (error) {
      if (error instanceof z.ZodError) {
        toast({
          title: "Validation error",
          description: error.errors[0].message,
          variant: "destructive",
        });
      } else {
        toast({
          title: "Error",
          description: error instanceof Error ? error.message : "An error occurred",
          variant: "destructive",
        });
      }
    } finally {
      setLoading(false);
    }
  };

  const handleStatusChange = async (newStatus: string) => {
    if (!eventId) return;

    setLoading(true);
    try {
      const updateData: any = { status: newStatus };
      
      if (newStatus === "approved" || newStatus === "rejected") {
        updateData.reviewer_id = user!.id;
      }

      const { error } = await supabase
        .from("events")
        .update(updateData)
        .eq("id", eventId);

      if (error) throw error;

      toast({ title: `Event ${newStatus}` });
      onSuccess();
    } catch (error) {
      toast({
        title: "Error",
        description: error instanceof Error ? error.message : "An error occurred",
        variant: "destructive",
      });
    } finally {
      setLoading(false);
    }
  };

  const canEdit = !event || event.created_by === user?.id || isAdmin;

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="max-w-2xl">
        <DialogHeader>
          <DialogTitle>{eventId ? "Edit Event" : "Create Event"}</DialogTitle>
        </DialogHeader>

        <form onSubmit={handleSubmit} className="space-y-4">
          <div className="space-y-2">
            <Label htmlFor="title">Title *</Label>
            <Input
              id="title"
              value={formData.title}
              onChange={(e) => setFormData({ ...formData, title: e.target.value })}
              disabled={!canEdit || loading}
              maxLength={200}
              required
            />
          </div>

          <div className="space-y-2">
            <Label htmlFor="description">Description</Label>
            <Textarea
              id="description"
              value={formData.description}
              onChange={(e) => setFormData({ ...formData, description: e.target.value })}
              disabled={!canEdit || loading}
              maxLength={1000}
            />
          </div>

          <div className="space-y-2">
            <Label htmlFor="room">Room *</Label>
            <Select
              value={formData.room_id}
              onValueChange={(value) => setFormData({ ...formData, room_id: value })}
              disabled={!canEdit || loading}
            >
              <SelectTrigger>
                <SelectValue placeholder="Select a room" />
              </SelectTrigger>
              <SelectContent>
                {rooms?.map((room) => (
                  <SelectItem key={room.id} value={room.id}>
                    {room.name}
                  </SelectItem>
                ))}
              </SelectContent>
            </Select>
          </div>

          <div className="grid grid-cols-2 gap-4">
            <div className="space-y-2">
              <Label htmlFor="starts_at">Start Time *</Label>
              <Input
                id="starts_at"
                type="datetime-local"
                value={formData.starts_at}
                onChange={(e) => setFormData({ ...formData, starts_at: e.target.value })}
                disabled={!canEdit || loading}
                required
              />
            </div>

            <div className="space-y-2">
              <Label htmlFor="ends_at">End Time *</Label>
              <Input
                id="ends_at"
                type="datetime-local"
                value={formData.ends_at}
                onChange={(e) => setFormData({ ...formData, ends_at: e.target.value })}
                disabled={!canEdit || loading}
                required
              />
            </div>
          </div>

          {canEdit && (
            <div className="flex gap-2">
              <Button type="submit" disabled={loading}>
                {eventId ? "Update" : "Create"}
              </Button>
              {event && event.status === "draft" && (
                <Button
                  type="button"
                  variant="secondary"
                  onClick={() => handleStatusChange("pending_review")}
                  disabled={loading}
                >
                  Submit for Review
                </Button>
              )}
            </div>
          )}

          {isAdmin && event && event.status === "pending_review" && (
            <div className="flex gap-2 pt-4 border-t">
              <Button
                type="button"
                variant="default"
                onClick={() => handleStatusChange("approved")}
                disabled={loading}
              >
                Approve
              </Button>
              <Button
                type="button"
                variant="destructive"
                onClick={() => handleStatusChange("rejected")}
                disabled={loading}
              >
                Reject
              </Button>
            </div>
          )}

          {isAdmin && event && event.status === "approved" && (
            <div className="flex gap-2 pt-4 border-t">
              <Button
                type="button"
                onClick={() => handleStatusChange("published")}
                disabled={loading}
              >
                Publish Event
              </Button>
            </div>
          )}
        </form>
      </DialogContent>
    </Dialog>
  );
};

export default EventDialog;
