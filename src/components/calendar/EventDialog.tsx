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
import { Alert, AlertDescription } from "@/components/ui/alert";
import { AlertCircle, Info } from "lucide-react";
import { z } from "zod";

interface EventDialogProps {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  eventId: string | null;
  initialDate?: Date | null;
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

const EventDialog = ({ open, onOpenChange, eventId, initialDate, onSuccess }: EventDialogProps) => {
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

  const [validationError, setValidationError] = useState<string>("");
  const [roomConflict, setRoomConflict] = useState<{hasConflict: boolean, conflictingEvent?: any}>({hasConflict: false});

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

  // Helper function to format date for datetime-local input (preserves local timezone)
  const formatDateTimeLocal = (date: Date): string => {
    const year = date.getFullYear();
    const month = String(date.getMonth() + 1).padStart(2, '0');
    const day = String(date.getDate()).padStart(2, '0');
    const hours = String(date.getHours()).padStart(2, '0');
    const minutes = String(date.getMinutes()).padStart(2, '0');
    return `${year}-${month}-${day}T${hours}:${minutes}`;
  };

  useEffect(() => {
    if (event) {
      // Parse ISO string to local time for editing
      const startsAt = new Date(event.starts_at);
      const endsAt = new Date(event.ends_at);

      setFormData({
        title: event.title,
        description: event.description || "",
        room_id: event.room_id,
        starts_at: formatDateTimeLocal(startsAt),
        ends_at: formatDateTimeLocal(endsAt),
      });
    } else {
      // Set default start time based on initialDate or now
      const baseDate = initialDate || new Date();
      // Set time to 9 AM if using initialDate, otherwise use current time
      const startDate = initialDate
        ? new Date(baseDate.getFullYear(), baseDate.getMonth(), baseDate.getDate(), 9, 0)
        : baseDate;
      const oneHourLater = new Date(startDate.getTime() + 60 * 60 * 1000);

      setFormData({
        title: "",
        description: "",
        room_id: "",
        starts_at: formatDateTimeLocal(startDate),
        ends_at: formatDateTimeLocal(oneHourLater),
      });
    }
    setValidationError("");
  }, [event, initialDate]);

  // Check for room conflicts
  const checkRoomConflict = async () => {
    if (!formData.room_id || !formData.starts_at || !formData.ends_at) {
      setRoomConflict({hasConflict: false});
      return;
    }

    try {
      // First, check if the selected room allows overlapping bookings
      const selectedRoom = rooms?.find(r => r.id === formData.room_id);
      if (selectedRoom?.allow_overlap) {
        // Allow multiple bookings for rooms that permit overlaps
        setRoomConflict({hasConflict: false});
        return;
      }

      // Check for conflicting events in the same room (all statuses)
      // This matches the database exclusion constraint which applies to all statuses
      // Convert datetime-local to ISO format for proper comparison
      const startISO = dateTimeLocalToISO(formData.starts_at);
      const endISO = dateTimeLocalToISO(formData.ends_at);

      const { data: conflictingEvents, error } = await supabase
        .from("events")
        .select("id, title, starts_at, ends_at, status")
        .eq("room_id", formData.room_id)
        .or(`and(starts_at.lt.${endISO},ends_at.gt.${startISO})`);

      if (error) throw error;

      // Filter out the current event if editing
      const conflicts = conflictingEvents?.filter(e => e.id !== eventId) || [];

      if (conflicts.length > 0) {
        setRoomConflict({hasConflict: true, conflictingEvent: conflicts[0]});
      } else {
        setRoomConflict({hasConflict: false});
      }
    } catch (error) {
      console.error("Error checking room conflicts:", error);
    }
  };

  // Validate dates when they change
  useEffect(() => {
    if (formData.starts_at && formData.ends_at) {
      const start = new Date(formData.starts_at);
      const end = new Date(formData.ends_at);

      if (end <= start) {
        setValidationError("End time must be after start time");
      } else {
        setValidationError("");
      }
    }
  }, [formData.starts_at, formData.ends_at]);

  // Check for room conflicts when relevant fields change
  useEffect(() => {
    checkRoomConflict();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [formData.room_id, formData.starts_at, formData.ends_at, eventId, rooms]);

  const handleStartTimeChange = (value: string) => {
    setFormData({ ...formData, starts_at: value });

    // Auto-adjust end time if it's before or equal to new start time
    if (value && formData.ends_at) {
      const start = new Date(value);
      const end = new Date(formData.ends_at);

      if (end <= start) {
        // Set end time to 1 hour after new start time
        const newEnd = new Date(start.getTime() + 60 * 60 * 1000);
        setFormData({
          ...formData,
          starts_at: value,
          ends_at: formatDateTimeLocal(newEnd)
        });
      }
    }
  };

  // Helper function to convert datetime-local string to ISO string
  const dateTimeLocalToISO = (dateTimeLocal: string): string => {
    // datetime-local gives us "2025-10-31T08:06" (no timezone info)
    // Parse it as local time and convert to ISO (UTC)
    // This preserves the user's intended time when displayed back in their timezone
    const date = new Date(dateTimeLocal);
    return date.toISOString();
  };

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    setLoading(true);

    try {
      const validated = eventSchema.parse(formData);

      const eventData = {
        title: validated.title,
        description: validated.description,
        room_id: validated.room_id,
        starts_at: dateTimeLocalToISO(validated.starts_at),
        ends_at: dateTimeLocalToISO(validated.ends_at),
      };

      if (eventId) {
        // For updates, if user is not admin and event is draft/pending, auto-submit for review
        const shouldAutoSubmit = !isAdmin && event && (event.status === 'draft' || event.status === 'pending_review');

        const updatePayload = shouldAutoSubmit
          ? { ...eventData, status: 'pending_review' as const }
          : eventData;

        const { error } = await supabase
          .from("events")
          .update(updatePayload)
          .eq("id", eventId);

        if (error) throw error;

        toast({
          title: shouldAutoSubmit ? "Event updated and submitted for review" : "Event updated successfully",
          description: shouldAutoSubmit ? "Your changes have been sent to admins for approval" : undefined
        });
      } else {
        // For new events, all users create events with pending_review status
        const { error } = await supabase.from("events").insert([{
          ...eventData,
          created_by: user!.id,
          status: 'pending_review' as const,
        }]);

        if (error) throw error;

        toast({
          title: "Event created and submitted for review",
          description: "Your event has been sent to admins for approval"
        });
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

  const handleDelete = async () => {
    if (!eventId) return;

    // Confirm deletion
    if (!window.confirm("Are you sure you want to delete this event? This action cannot be undone.")) {
      return;
    }

    setLoading(true);
    try {
      const { error } = await supabase
        .from("events")
        .delete()
        .eq("id", eventId);

      if (error) throw error;

      toast({ title: "Event deleted successfully" });
      onOpenChange(false);
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
          {validationError && (
            <Alert variant="destructive">
              <AlertCircle className="h-4 w-4" />
              <AlertDescription>
                {validationError}
              </AlertDescription>
            </Alert>
          )}

          {roomConflict.hasConflict && (
            <Alert variant="destructive">
              <AlertCircle className="h-4 w-4" />
              <AlertDescription>
                This room is already booked for "{roomConflict.conflictingEvent?.title}" during this time. Please choose a different time or room.
              </AlertDescription>
            </Alert>
          )}

          {!isAdmin && !eventId && (
            <Alert>
              <Info className="h-4 w-4" />
              <AlertDescription>
                Your event will be automatically submitted for admin review after creation.
              </AlertDescription>
            </Alert>
          )}

          {!isAdmin && event && (event.status === 'draft' || event.status === 'pending_review') && (
            <Alert>
              <Info className="h-4 w-4" />
              <AlertDescription>
                Any changes will be automatically submitted for admin review.
              </AlertDescription>
            </Alert>
          )}


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
                onChange={(e) => handleStartTimeChange(e.target.value)}
                disabled={!canEdit || loading}
                required
              />
            </div>

            <div className="space-y-2">
              <Label htmlFor="ends_at" className={validationError ? "text-destructive" : ""}>
                End Time *
              </Label>
              <Input
                id="ends_at"
                type="datetime-local"
                value={formData.ends_at}
                onChange={(e) => setFormData({ ...formData, ends_at: e.target.value })}
                disabled={!canEdit || loading}
                className={validationError ? "border-destructive" : ""}
                required
              />
              {validationError && (
                <p className="text-sm text-destructive">{validationError}</p>
              )}
            </div>
          </div>

          {canEdit && (
            <div className="flex gap-2">
              <Button type="submit" disabled={loading || !!validationError || roomConflict.hasConflict}>
                {eventId
                  ? (!isAdmin && event && (event.status === 'draft' || event.status === 'pending_review')
                      ? "Update & Submit for Review"
                      : "Update")
                  : (!isAdmin ? "Create & Submit for Review" : "Create")
                }
              </Button>
              {eventId && event && event.created_by === user?.id && (
                <Button
                  type="button"
                  variant="destructive"
                  onClick={handleDelete}
                  disabled={loading}
                >
                  Delete
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
