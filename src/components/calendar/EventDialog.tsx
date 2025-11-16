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
import { Badge } from "@/components/ui/badge";
import { ScrollArea } from "@/components/ui/scroll-area";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
import { Clock, MapPin, User, Repeat } from "lucide-react";
import { format, parseISO } from "date-fns";
import { cn } from "@/lib/utils";
import { RecurrenceSelector, RecurrenceConfig, recurrenceConfigToRRule, rruleToRecurrenceConfig } from "@/components/calendar/RecurrenceSelector";

interface EventDialogProps {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  eventId: string | null;
  initialDate?: Date | null;
  onSuccess: () => void;
  allEvents?: any[];
  onEventSelect?: (eventId: string) => void;
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

const EventDialog = ({ open, onOpenChange, eventId, initialDate, onSuccess, allEvents = [], onEventSelect }: EventDialogProps) => {
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

  const [recurrence, setRecurrence] = useState<RecurrenceConfig>({
    frequency: 'none',
    interval: 1,
    endType: 'never',
  });

  const [validationError, setValidationError] = useState<string>("");
  const [roomConflict, setRoomConflict] = useState<{hasConflict: boolean, conflictingEvent?: any, creatorName?: string}>({hasConflict: false});

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

      // Load recurrence config if available
      if (event.recurrence_rule) {
        setRecurrence(rruleToRecurrenceConfig(event.recurrence_rule));
      } else {
        setRecurrence({
          frequency: 'none',
          interval: 1,
          endType: 'never',
        });
      }
    } else {
      // Set default start time based on initialDate or now
      const baseDate = initialDate || new Date();
      // If initialDate is provided, use its time if it has one (not midnight), otherwise default to 9 AM
      let startDate: Date;
      if (initialDate) {
        const hasTime = baseDate.getHours() !== 0 || baseDate.getMinutes() !== 0;
        startDate = hasTime
          ? baseDate
          : new Date(baseDate.getFullYear(), baseDate.getMonth(), baseDate.getDate(), 9, 0);
      } else {
        startDate = baseDate;
      }
      const oneHourLater = new Date(startDate.getTime() + 60 * 60 * 1000);

      setFormData({
        title: "",
        description: "",
        room_id: "",
        starts_at: formatDateTimeLocal(startDate),
        ends_at: formatDateTimeLocal(oneHourLater),
      });

      // Reset recurrence for new events
      setRecurrence({
        frequency: 'none',
        interval: 1,
        endType: 'never',
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

      // Check for conflicting events in the same room
      // Include pending_review, approved, and published events
      // Convert datetime-local to ISO format for proper comparison
      const startISO = dateTimeLocalToISO(formData.starts_at);
      const endISO = dateTimeLocalToISO(formData.ends_at);

      const { data: conflictingEvents, error } = await supabase
        .from("events")
        .select(`
          id,
          title,
          starts_at,
          ends_at,
          status,
          created_by
        `)
        .eq("room_id", formData.room_id)
        .in("status", ["pending_review", "approved", "published"])
        .or(`and(starts_at.lt.${endISO},ends_at.gt.${startISO})`);

      if (error) throw error;

      // Filter out the current event if editing
      const conflicts = conflictingEvents?.filter(e => e.id !== eventId) || [];

      if (conflicts.length > 0) {
        const conflict = conflicts[0];

        // Fetch creator profile separately
        const { data: profile } = await supabase
          .from("profiles")
          .select("full_name")
          .eq("id", conflict.created_by)
          .single();

        const creatorName = profile?.full_name || 'Another user';
        setRoomConflict({
          hasConflict: true,
          conflictingEvent: conflict,
          creatorName
        });
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

      // Validate recurrence
      if (recurrence.frequency === 'weekly' && (!recurrence.daysOfWeek || recurrence.daysOfWeek.length === 0)) {
        toast({
          title: "Validation error",
          description: "Please select at least one day for weekly recurrence",
          variant: "destructive",
        });
        setLoading(false);
        return;
      }

      const startsAt = dateTimeLocalToISO(validated.starts_at);
      const endsAt = dateTimeLocalToISO(validated.ends_at);

      const eventData = {
        title: validated.title,
        description: validated.description,
        room_id: validated.room_id,
        starts_at: startsAt,
        ends_at: endsAt,
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
        // For new events, check if recurring
        if (recurrence.frequency !== 'none') {
          // Generate RRULE
          const rrule = recurrenceConfigToRRule(recurrence, new Date(startsAt));

          // Calculate recurrence end date
          let recurrenceEndDate: string | null = null;
          if (recurrence.endType === 'on' && recurrence.endDate) {
            recurrenceEndDate = new Date(recurrence.endDate).toISOString();
          }

          // Create parent event with recurrence rule
          const parentEvent = {
            ...eventData,
            created_by: user!.id,
            status: 'pending_review' as const,
            is_recurring: true,
            recurrence_rule: rrule,
            recurrence_end_date: recurrenceEndDate,
          };

          const { data: parent, error: parentError } = await supabase
            .from("events")
            .insert([parentEvent])
            .select()
            .single();

          if (parentError) throw parentError;

          // Generate recurring instances
          const instances = generateRecurringInstances(
            new Date(startsAt),
            new Date(endsAt),
            recurrence,
            parent.id,
            100 // Limit to 100 instances
          );

          // Insert all instances
          const instancesData = instances.map(inst => ({
            title: validated.title,
            description: validated.description,
            room_id: validated.room_id,
            starts_at: inst.starts_at.toISOString(),
            ends_at: inst.ends_at.toISOString(),
            created_by: user!.id,
            status: 'pending_review' as const,
            is_recurring: true,
            parent_event_id: parent.id,
          }));

          if (instancesData.length > 0) {
            const { error: instancesError } = await supabase
              .from("events")
              .insert(instancesData);

            if (instancesError) throw instancesError;
          }

          toast({
            title: "Recurring event created",
            description: `Created ${instancesData.length + 1} event${instancesData.length > 0 ? 's' : ''} and submitted for review`
          });
        } else {
          // Non-recurring event
          const { error } = await supabase.from("events").insert([{
            ...eventData,
            created_by: user!.id,
            status: 'pending_review' as const,
            is_recurring: false,
          }]);

          if (error) throw error;

          toast({
            title: "Event created and submitted for review",
            description: "Your event has been sent to admins for approval"
          });
        }
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

  // Helper function to generate recurring event instances
  const generateRecurringInstances = (
    startDate: Date,
    endDate: Date,
    config: RecurrenceConfig,
    parentId: string,
    maxInstances: number
  ): Array<{ starts_at: Date; ends_at: Date }> => {
    const instances: Array<{ starts_at: Date; ends_at: Date }> = [];
    const duration = endDate.getTime() - startDate.getTime();

    let currentDate = new Date(startDate);
    let count = 0;

    // Determine end condition
    const maxDate = config.endType === 'on' && config.endDate
      ? new Date(config.endDate)
      : new Date(startDate.getTime() + 365 * 24 * 60 * 60 * 1000); // 1 year max if no end date

    const maxCount = config.endType === 'after' && config.occurrences
      ? config.occurrences - 1 // -1 because parent event is the first occurrence
      : maxInstances;

    while (count < maxCount && currentDate <= maxDate) {
      // Calculate next occurrence based on frequency
      let nextDate: Date | null = null;

      switch (config.frequency) {
        case 'daily':
          currentDate.setDate(currentDate.getDate() + config.interval);
          nextDate = new Date(currentDate);
          break;

        case 'weekly':
          // For weekly, we need to find the next matching day of week
          let daysAdded = 0;
          const maxDaysToCheck = 7 * config.interval;

          while (daysAdded < maxDaysToCheck) {
            currentDate.setDate(currentDate.getDate() + 1);
            daysAdded++;

            const dayOfWeek = currentDate.getDay();
            const weeksSinceStart = Math.floor(
              (currentDate.getTime() - startDate.getTime()) / (7 * 24 * 60 * 60 * 1000)
            );

            // Check if this day matches and we're on the right interval week
            if (
              config.daysOfWeek?.includes(dayOfWeek) &&
              weeksSinceStart % config.interval === 0
            ) {
              nextDate = new Date(currentDate);
              break;
            }
          }
          break;

        case 'monthly':
          currentDate.setMonth(currentDate.getMonth() + config.interval);
          if (config.dayOfMonth) {
            currentDate.setDate(Math.min(config.dayOfMonth, new Date(currentDate.getFullYear(), currentDate.getMonth() + 1, 0).getDate()));
          }
          nextDate = new Date(currentDate);
          break;

        case 'yearly':
          currentDate.setFullYear(currentDate.getFullYear() + config.interval);
          if (config.monthOfYear) {
            currentDate.setMonth(config.monthOfYear - 1);
          }
          if (config.dayOfMonth) {
            currentDate.setDate(Math.min(config.dayOfMonth, new Date(currentDate.getFullYear(), currentDate.getMonth() + 1, 0).getDate()));
          }
          nextDate = new Date(currentDate);
          break;
      }

      if (!nextDate || nextDate > maxDate) break;

      const instanceEnd = new Date(nextDate.getTime() + duration);
      instances.push({
        starts_at: nextDate,
        ends_at: instanceEnd,
      });

      count++;
    }

    return instances;
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

  // Determine the date to filter events by
  const filterDate = initialDate || (event ? new Date(event.starts_at) : new Date());

  // Helper function to check if event is on the same day
  const isSameDay = (date1: Date, date2: Date) => {
    return (
      date1.getFullYear() === date2.getFullYear() &&
      date1.getMonth() === date2.getMonth() &&
      date1.getDate() === date2.getDate()
    );
  };

  // Filter events by selected date and then by status
  const eventsForDate = allEvents.filter((e) =>
    isSameDay(parseISO(e.starts_at), filterDate)
  );

  const pendingEvents = eventsForDate.filter((e) => e.status === "pending_review");
  const publishedEvents = eventsForDate.filter((e) => e.status === "published");
  const approvedEvents = eventsForDate.filter((e) => e.status === "approved");
  const draftEvents = eventsForDate.filter((e) => e.status === "draft");

  const getStatusColor = (status: string) => {
    const colors: Record<string, string> = {
      draft: "bg-gray-500",
      pending_review: "bg-amber-500",
      approved: "bg-green-500",
      rejected: "bg-red-500",
      published: "bg-blue-500",
    };
    return colors[status] || "bg-gray-500";
  };

  const getStatusLabel = (status: string) => {
    return status.replace("_", " ").replace(/\b\w/g, (l) => l.toUpperCase());
  };

  const EventItem = ({ event: evt }: { event: any }) => {
    const isOwnEvent = user?.id && evt.created_by === user.id;

    return (
      <div
        onClick={() => onEventSelect && onEventSelect(evt.id)}
        className={cn(
          "p-3 rounded-lg border-l-4 cursor-pointer hover:bg-accent transition-colors group",
          "bg-background shadow-sm hover:shadow-md"
        )}
        style={{
          borderLeftColor: evt.room?.color || "#888",
        }}
      >
        <div className="space-y-2">
          <div className="flex items-start justify-between gap-2">
            <h4 className="font-semibold text-sm line-clamp-2 group-hover:text-primary transition-colors">
              {evt.title}
            </h4>
            <Badge
              className={cn(
                "text-[9px] h-auto py-0.5 px-1.5 text-white shrink-0",
                getStatusColor(evt.status)
              )}
            >
              {getStatusLabel(evt.status)}
            </Badge>
          </div>

          <div className="space-y-1 text-xs text-muted-foreground">
            <div className="flex items-center gap-1.5">
              <Clock className="h-3 w-3" />
              <span>
                {format(parseISO(evt.starts_at), "MMM d, h:mm a")} -{" "}
                {format(parseISO(evt.ends_at), "h:mm a")}
              </span>
            </div>

            <div className="flex items-center gap-1.5">
              <MapPin className="h-3 w-3" />
              <span
                className="font-medium"
                style={{ color: evt.room?.color }}
              >
                {evt.room?.name}
              </span>
            </div>

            {evt.creator && (
              <div className="flex items-center gap-1.5">
                <User className="h-3 w-3" />
                <span className={cn(isOwnEvent && "font-medium text-foreground")}>
                  {isOwnEvent ? "You" : evt.creator.full_name}
                  {evt.creator.ministry_name &&
                    ` (${evt.creator.ministry_name})`}
                </span>
              </div>
            )}

            {evt.is_recurring && (
              <div className="flex items-center gap-1.5">
                <Repeat className="h-3 w-3 text-primary" />
                <span className="text-primary font-medium">Recurring event</span>
              </div>
            )}
          </div>
        </div>
      </div>
    );
  };

  const EventList = ({
    events: evts,
    emptyMessage,
  }: {
    events: any[];
    emptyMessage: string;
  }) => (
    <ScrollArea className="h-[400px]">
      {evts.length > 0 ? (
        <div className="space-y-2 pr-4">
          {evts.map((evt) => (
            <EventItem key={evt.id} event={evt} />
          ))}
        </div>
      ) : (
        <div className="flex items-center justify-center h-32 text-sm text-muted-foreground">
          {emptyMessage}
        </div>
      )}
    </ScrollArea>
  );

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="max-w-6xl max-h-[90vh]" aria-describedby="event-dialog-description">
        <div className="grid grid-cols-1 lg:grid-cols-[1fr_350px] gap-6">
          {/* Left side - Event Form */}
          <div className="flex flex-col h-full max-h-[calc(90vh-2rem)]">
            <DialogHeader>
              <DialogTitle>{eventId ? "Edit Event" : "Create Event"}</DialogTitle>
            </DialogHeader>
            <p id="event-dialog-description" className="sr-only">
              {eventId ? "Edit event details including title, description, room, and timing" : "Create a new event by filling in the details below"}
            </p>

            <ScrollArea className="flex-1 pr-4 -mr-4">
            <form onSubmit={handleSubmit} className="space-y-4 pb-4">
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
                This room is already booked for "{roomConflict.conflictingEvent?.title}"
                {roomConflict.creatorName && ` by ${roomConflict.creatorName}`}
                {roomConflict.conflictingEvent?.status === 'pending_review' && ' (pending review)'}
                {roomConflict.conflictingEvent?.status === 'approved' && ' (approved)'}
                {roomConflict.conflictingEvent?.status === 'published' && ' (published)'} during this time. Please choose a different time or room.
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
              className="border-2 border-gray-300"
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
              className="border-2 border-gray-300"
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

          {/* Recurrence Selector */}
          <RecurrenceSelector
            value={recurrence}
            onChange={setRecurrence}
            startDate={formData.starts_at}
          />

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
              {eventId && event && (isAdmin || event.created_by === user?.id) && (
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
            </ScrollArea>
          </div>

          {/* Right side - Event Sidebar */}
          <div className="hidden lg:block border-l pl-6">
            <div className="space-y-3">
              <div>
                <h3 className="text-lg font-semibold">Events</h3>
                <p className="text-sm text-muted-foreground mt-1">
                  {format(filterDate, "EEEE, MMMM d, yyyy")}
                </p>
              </div>
              <Tabs defaultValue="pending" className="w-full">
                <TabsList className="grid w-full grid-cols-4">
                  <TabsTrigger value="pending" className="text-xs relative">
                    Pending
                    {pendingEvents.length > 0 && (
                      <Badge
                        variant="destructive"
                        className="ml-1 h-4 w-4 p-0 flex items-center justify-center text-[9px]"
                      >
                        {pendingEvents.length}
                      </Badge>
                    )}
                  </TabsTrigger>
                  <TabsTrigger value="approved" className="text-xs">
                    Approved
                    {approvedEvents.length > 0 && (
                      <Badge
                        variant="secondary"
                        className="ml-1 h-4 w-4 p-0 flex items-center justify-center text-[9px]"
                      >
                        {approvedEvents.length}
                      </Badge>
                    )}
                  </TabsTrigger>
                  <TabsTrigger value="published" className="text-xs">
                    Published
                    {publishedEvents.length > 0 && (
                      <Badge
                        variant="secondary"
                        className="ml-1 h-4 w-4 p-0 flex items-center justify-center text-[9px]"
                      >
                        {publishedEvents.length}
                      </Badge>
                    )}
                  </TabsTrigger>
                  <TabsTrigger value="draft" className="text-xs">
                    Draft
                    {draftEvents.length > 0 && (
                      <Badge
                        variant="secondary"
                        className="ml-1 h-4 w-4 p-0 flex items-center justify-center text-[9px]"
                      >
                        {draftEvents.length}
                      </Badge>
                    )}
                  </TabsTrigger>
                </TabsList>

                <div className="mt-4">
                  <TabsContent value="pending" className="m-0">
                    <EventList
                      events={pendingEvents}
                      emptyMessage="No pending events"
                    />
                  </TabsContent>

                  <TabsContent value="approved" className="m-0">
                    <EventList
                      events={approvedEvents}
                      emptyMessage="No approved events"
                    />
                  </TabsContent>

                  <TabsContent value="published" className="m-0">
                    <EventList
                      events={publishedEvents}
                      emptyMessage="No published events"
                    />
                  </TabsContent>

                  <TabsContent value="draft" className="m-0">
                    <EventList events={draftEvents} emptyMessage="No draft events" />
                  </TabsContent>
                </div>
              </Tabs>
            </div>
          </div>
        </div>
      </DialogContent>
    </Dialog>
  );
};

export default EventDialog;
