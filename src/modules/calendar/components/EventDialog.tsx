import { useEffect, useState } from "react";
import { useQuery } from "@tanstack/react-query";
import { supabase } from "@/integrations/supabase/client";
import { useAuth } from "@/shared/contexts/AuthContext";
import { useOrganization } from "@/shared/contexts/OrganizationContext";
import { Dialog, DialogContent, DialogHeader, DialogTitle } from "@/shared/components/ui/dialog";
import { Button } from "@/shared/components/ui/button";
import { Input } from "@/shared/components/ui/input";
import { Label } from "@/shared/components/ui/label";
import { Textarea } from "@/shared/components/ui/textarea";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/shared/components/ui/select";
import { useToast } from "@/shared/hooks/use-toast";
import { Alert, AlertDescription } from "@/shared/components/ui/alert";
import { AlertCircle, Info } from "lucide-react";
import { z } from "zod";
import { Badge } from "@/shared/components/ui/badge";
import { ScrollArea } from "@/shared/components/ui/scroll-area";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/shared/components/ui/tabs";
import { Clock, MapPin, User, Repeat, Calendar } from "lucide-react";
import { format, parseISO } from "date-fns";
import { cn } from "@/shared/lib/utils";
import { RecurrenceSelector, RecurrenceConfig, recurrenceConfigToRRule, rruleToRecurrenceConfig } from "@/modules/calendar/components/RecurrenceSelector";
import { RejectionReasonDialog } from "@/shared/components/RejectionReasonDialog";
import { RecurringEventActionDialog, RecurringActionScope } from "@/shared/components/RecurringEventActionDialog";

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
  const { currentOrganization } = useOrganization();
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
  const [rejectionDialogOpen, setRejectionDialogOpen] = useState(false);
  const [rejectionLoading, setRejectionLoading] = useState(false);
  const [recurringDeleteDialogOpen, setRecurringDeleteDialogOpen] = useState(false);
  const [recurringRejectDialogOpen, setRecurringRejectDialogOpen] = useState(false);
  const [recurringUpdateDialogOpen, setRecurringUpdateDialogOpen] = useState(false);
  const [pendingRejectionReason, setPendingRejectionReason] = useState<string>("");
  const [pendingUpdateData, setPendingUpdateData] = useState<any>(null);

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
    queryKey: ["rooms", currentOrganization?.id],
    queryFn: async () => {
      if (!currentOrganization?.id) return [];

      const { data, error } = await supabase
        .from("rooms")
        .select("*")
        .eq("organization_id", currentOrganization.id)
        .eq("is_active", true)
        .order("name");

      if (error) throw error;
      return data;
    },
    enabled: !!currentOrganization?.id,
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
      if (!currentOrganization?.id) {
        toast({
          title: "Error",
          description: "No organization selected",
          variant: "destructive",
        });
        setLoading(false);
        return;
      }

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
        organization_id: currentOrganization.id,
      };

      if (eventId) {
        // For updates, if user is not admin and event is draft/pending, auto-submit for review
        const shouldAutoSubmit = !isAdmin && event && (event.status === 'draft' || event.status === 'pending_review');

        const updatePayload = shouldAutoSubmit
          ? { ...eventData, status: 'pending_review' as const }
          : eventData;

        // Check if this is a recurring event
        if (event?.is_recurring) {
          setPendingUpdateData({ updatePayload, shouldAutoSubmit });
          setLoading(false);
          setRecurringUpdateDialogOpen(true);
          return;
        }

        // Not recurring, proceed with single event update
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
            organization_id: currentOrganization.id,
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

  // Helper function to get the nth weekday of a month (e.g., 1st Monday, last Saturday)
  // weekOfMonth: 1-4 for first through fourth, -1 for last
  const getNthWeekdayOfMonth = (
    year: number,
    month: number,
    dayOfWeek: number, // 0 = Sunday, 6 = Saturday
    weekOfMonth: number // 1-4 or -1 for last
  ): Date | null => {
    if (weekOfMonth === -1) {
      // Last occurrence of the weekday in the month
      const lastDay = new Date(year, month + 1, 0); // Last day of month
      const lastDayOfWeek = lastDay.getDay();
      let diff = lastDayOfWeek - dayOfWeek;
      if (diff < 0) diff += 7;
      const result = new Date(year, month, lastDay.getDate() - diff);
      return result;
    } else if (weekOfMonth >= 1 && weekOfMonth <= 4) {
      // First, second, third, or fourth occurrence
      const firstDay = new Date(year, month, 1);
      const firstDayOfWeek = firstDay.getDay();
      let diff = dayOfWeek - firstDayOfWeek;
      if (diff < 0) diff += 7;
      const firstOccurrence = 1 + diff;
      const nthOccurrence = firstOccurrence + (weekOfMonth - 1) * 7;

      // Verify it's still in the same month
      const result = new Date(year, month, nthOccurrence);
      if (result.getMonth() !== month) {
        return null; // This occurrence doesn't exist (e.g., 5th Monday)
      }
      return result;
    }
    return null;
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
          if (config.monthlyType === 'weekday' && config.weekOfMonth !== undefined && config.dayOfWeekForMonth !== undefined) {
            // Calculate the nth weekday of the month (e.g., first Monday, last Saturday)
            nextDate = getNthWeekdayOfMonth(
              currentDate.getFullYear(),
              currentDate.getMonth(),
              config.dayOfWeekForMonth,
              config.weekOfMonth
            );
            if (nextDate) {
              // Preserve the time from the original event
              nextDate.setHours(startDate.getHours(), startDate.getMinutes(), startDate.getSeconds());
              currentDate = new Date(nextDate);
            }
          } else if (config.dayOfMonth) {
            currentDate.setDate(Math.min(config.dayOfMonth, new Date(currentDate.getFullYear(), currentDate.getMonth() + 1, 0).getDate()));
            nextDate = new Date(currentDate);
          } else {
            nextDate = new Date(currentDate);
          }
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
    if (!eventId || !event) return;

    setLoading(true);
    try {
      const updateData: any = { status: newStatus };

      if (newStatus === "approved" || newStatus === "rejected") {
        updateData.reviewer_id = user!.id;
      }

      // Get creator profile for email notification
      const { data: creator } = await supabase
        .from("profiles")
        .select("full_name, email")
        .eq("id", event.created_by)
        .single();

      // Get room name
      const selectedRoom = rooms?.find(r => r.id === event.room_id);

      const { error } = await supabase
        .from("events")
        .update(updateData)
        .eq("id", eventId);

      if (error) throw error;

      toast({ title: `Event ${newStatus}` });

      // Send email notification to event creator
      if (creator?.email) {
        const emailStatus = newStatus === "published" ? "published" : newStatus === "rejected" ? "rejected" : "approved";

        try {
          await supabase.functions.invoke("send-event-notification", {
            body: {
              to: creator.email,
              eventTitle: event.title,
              eventStartTime: new Date(event.starts_at).toLocaleString("en-US", {
                dateStyle: "full",
                timeStyle: "short",
              }),
              eventEndTime: new Date(event.ends_at).toLocaleString("en-US", {
                timeStyle: "short",
              }),
              roomName: selectedRoom?.name || "Unknown Room",
              status: emailStatus,
              requesterName: creator.full_name || "User",
              reviewerNotes: event.reviewer_notes || undefined,
            },
          });
        } catch (emailError) {
          console.error("Failed to send email notification:", emailError);
          // Don't fail the status update if email fails
        }
      }

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

  const handleRejectWithReason = async (reason: string) => {
    if (!eventId || !event) return;

    // Check if this is a recurring event
    if (event.is_recurring) {
      setPendingRejectionReason(reason);
      setRejectionDialogOpen(false);
      setRecurringRejectDialogOpen(true);
      return;
    }

    // Not recurring, proceed with single event rejection
    await executeRejection(reason, "single");
  };

  const handleRecurringRejectConfirm = async (scope: RecurringActionScope) => {
    await executeRejection(pendingRejectionReason, scope);
    setRecurringRejectDialogOpen(false);
    setPendingRejectionReason("");
  };

  const executeRejection = async (reason: string, scope: RecurringActionScope) => {
    if (!eventId || !event) return;

    setRejectionLoading(true);
    try {
      // Get creator profile for email notification
      const { data: creator } = await supabase
        .from("profiles")
        .select("full_name, email")
        .eq("id", event.created_by)
        .single();

      // Get room name
      const selectedRoom = rooms?.find(r => r.id === event.room_id);

      if (scope === "all") {
        // Reject all events in the series
        const parentId = event.parent_event_id || eventId;

        // Update the parent event
        await supabase
          .from("events")
          .update({
            status: "rejected",
            reviewer_id: user!.id,
            reviewer_notes: reason,
          })
          .eq("id", parentId);

        // Update all child events
        await supabase
          .from("events")
          .update({
            status: "rejected",
            reviewer_id: user!.id,
            reviewer_notes: reason,
          })
          .eq("parent_event_id", parentId);

        toast({ title: "All events in series rejected" });
      } else {
        // Reject only this event
        const { error } = await supabase
          .from("events")
          .update({
            status: "rejected",
            reviewer_id: user!.id,
            reviewer_notes: reason,
          })
          .eq("id", eventId);

        if (error) throw error;

        toast({ title: "Event rejected" });
      }

      // Send email notification to event creator with rejection reason
      if (creator?.email) {
        try {
          await supabase.functions.invoke("send-event-notification", {
            body: {
              to: creator.email,
              eventTitle: event.title,
              eventStartTime: new Date(event.starts_at).toLocaleString("en-US", {
                dateStyle: "full",
                timeStyle: "short",
              }),
              eventEndTime: new Date(event.ends_at).toLocaleString("en-US", {
                timeStyle: "short",
              }),
              roomName: selectedRoom?.name || "Unknown Room",
              status: "rejected",
              requesterName: creator.full_name || "User",
              reviewerNotes: reason,
            },
          });
        } catch (emailError) {
          console.error("Failed to send email notification:", emailError);
          // Don't fail the status update if email fails
        }
      }

      onSuccess();
    } catch (error) {
      toast({
        title: "Error",
        description: error instanceof Error ? error.message : "An error occurred",
        variant: "destructive",
      });
    } finally {
      setRejectionLoading(false);
    }
  };

  const handleDelete = async () => {
    if (!eventId || !event) return;

    // Check if this is a recurring event
    if (event.is_recurring) {
      setRecurringDeleteDialogOpen(true);
      return;
    }

    // Not recurring, confirm and delete single event
    if (!window.confirm("Are you sure you want to delete this event? This action cannot be undone.")) {
      return;
    }

    await executeDelete("single");
  };

  const handleRecurringDeleteConfirm = async (scope: RecurringActionScope) => {
    await executeDelete(scope);
    setRecurringDeleteDialogOpen(false);
  };

  const executeDelete = async (scope: RecurringActionScope) => {
    if (!eventId || !event) return;

    setLoading(true);
    try {
      if (scope === "all") {
        // Delete all events in the series
        const parentId = event.parent_event_id || eventId;

        // Delete all child events first
        await supabase
          .from("events")
          .delete()
          .eq("parent_event_id", parentId);

        // Delete the parent event
        await supabase
          .from("events")
          .delete()
          .eq("id", parentId);

        toast({ title: "All events in series deleted" });
      } else {
        // Delete only this event
        const { error } = await supabase
          .from("events")
          .delete()
          .eq("id", eventId);

        if (error) throw error;

        toast({ title: "Event deleted successfully" });
      }

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

  const handleRecurringUpdateConfirm = async (scope: RecurringActionScope) => {
    if (!eventId || !event || !pendingUpdateData) return;

    setLoading(true);
    try {
      const { updatePayload, shouldAutoSubmit } = pendingUpdateData;

      if (scope === "all") {
        // Update all events in the series
        const parentId = event.parent_event_id || eventId;

        // Update the parent event
        await supabase
          .from("events")
          .update(updatePayload)
          .eq("id", parentId);

        // Update all child events
        await supabase
          .from("events")
          .update(updatePayload)
          .eq("parent_event_id", parentId);

        toast({
          title: shouldAutoSubmit ? "All events updated and submitted for review" : "All events in series updated",
          description: shouldAutoSubmit ? "Your changes have been sent to admins for approval" : undefined
        });
      } else {
        // Update only this event
        const { error } = await supabase
          .from("events")
          .update(updatePayload)
          .eq("id", eventId);

        if (error) throw error;

        toast({
          title: shouldAutoSubmit ? "Event updated and submitted for review" : "Event updated successfully",
          description: shouldAutoSubmit ? "Your changes have been sent to admins for approval" : undefined
        });
      }

      setRecurringUpdateDialogOpen(false);
      setPendingUpdateData(null);
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
      <DialogContent className="max-w-6xl max-h-[90vh] p-0 overflow-hidden" aria-describedby="event-dialog-description">
        <div className="grid grid-cols-1 lg:grid-cols-[1fr_350px]">
          {/* Left side - Event Form */}
          <div className="flex flex-col h-full max-h-[calc(90vh-2rem)]">
            {/* Header */}
            <div className="bg-gradient-to-r from-blue-600 to-indigo-600 px-6 py-5 text-white">
              <DialogTitle className="text-xl font-semibold">
                {eventId ? "Edit Event" : "Create Event"}
              </DialogTitle>
              <div className="flex items-center gap-2 mt-2 text-blue-100 text-sm">
                <Calendar className="h-4 w-4" />
                <span>{filterDate ? format(filterDate, "EEEE, MMMM d, yyyy") : "Select a date"}</span>
              </div>
            </div>
            <p id="event-dialog-description" className="sr-only">
              {eventId ? "Edit event details including title, description, room, and timing" : "Create a new event by filling in the details below"}
            </p>

            <form onSubmit={handleSubmit} className="flex flex-col flex-1 overflow-hidden">
              <ScrollArea className="flex-1">
                <div className="p-6 space-y-5">
                {validationError && (
                  <Alert variant="destructive" className="rounded-xl">
                    <AlertCircle className="h-4 w-4" />
                    <AlertDescription>{validationError}</AlertDescription>
                  </Alert>
                )}

                {roomConflict.hasConflict && (
                  <Alert variant="destructive" className="rounded-xl">
                    <AlertCircle className="h-4 w-4" />
                    <AlertDescription>
                      This room is already booked for "{roomConflict.conflictingEvent?.title}"
                      {roomConflict.creatorName && ` by ${roomConflict.creatorName}`}
                      {roomConflict.conflictingEvent?.status === 'pending_review' && ' (pending review)'}
                      {roomConflict.conflictingEvent?.status === 'approved' && ' (approved)'}
                      {roomConflict.conflictingEvent?.status === 'published' && ' (published)'} during this time.
                    </AlertDescription>
                  </Alert>
                )}

                {!isAdmin && !eventId && (
                  <Alert className="rounded-xl bg-blue-50 border-blue-200">
                    <Info className="h-4 w-4 text-blue-600" />
                    <AlertDescription className="text-blue-800">
                      Your event will be automatically submitted for admin review after creation.
                    </AlertDescription>
                  </Alert>
                )}

                {!isAdmin && event && (event.status === 'draft' || event.status === 'pending_review') && (
                  <Alert className="rounded-xl bg-blue-50 border-blue-200">
                    <Info className="h-4 w-4 text-blue-600" />
                    <AlertDescription className="text-blue-800">
                      Any changes will be automatically submitted for admin review.
                    </AlertDescription>
                  </Alert>
                )}

                {/* Title */}
                <div className="space-y-2">
                  <Label htmlFor="title" className="text-sm font-medium text-slate-700">Title</Label>
                  <Input
                    id="title"
                    value={formData.title}
                    onChange={(e) => setFormData({ ...formData, title: e.target.value })}
                    disabled={!canEdit || loading}
                    maxLength={200}
                    required
                    placeholder="Enter event title..."
                    className="h-11 border-slate-200 focus:ring-2 focus:ring-blue-500/20 focus:border-blue-400 rounded-xl"
                  />
                </div>

                {/* Description */}
                <div className="space-y-2">
                  <Label htmlFor="description" className="text-sm font-medium text-slate-700">Description</Label>
                  <Textarea
                    id="description"
                    value={formData.description}
                    onChange={(e) => setFormData({ ...formData, description: e.target.value })}
                    disabled={!canEdit || loading}
                    maxLength={1000}
                    placeholder="Add a description..."
                    className="min-h-[80px] resize-none border-slate-200 focus:ring-2 focus:ring-blue-500/20 focus:border-blue-400 rounded-xl"
                  />
                </div>

                {/* Room Selection */}
                <div className="space-y-2">
                  <Label htmlFor="room" className="text-sm font-medium text-slate-700">Room</Label>
                  <Select
                    value={formData.room_id}
                    onValueChange={(value) => setFormData({ ...formData, room_id: value })}
                    disabled={!canEdit || loading}
                  >
                    <SelectTrigger className="h-11 border-slate-200 rounded-xl focus:ring-2 focus:ring-blue-500/20 focus:border-blue-400">
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

                {/* Time Section */}
                <div className="bg-gradient-to-br from-slate-50 to-gray-100 rounded-2xl p-5 border border-slate-200/60">
                  <div className="grid grid-cols-2 gap-4">
                    <div className="space-y-2">
                      <Label htmlFor="starts_at" className="text-sm font-medium text-slate-600">Start Time</Label>
                      <Input
                        id="starts_at"
                        type="datetime-local"
                        value={formData.starts_at}
                        onChange={(e) => handleStartTimeChange(e.target.value)}
                        disabled={!canEdit || loading}
                        required
                        className="h-11 bg-white border-slate-200 rounded-xl shadow-sm focus:ring-2 focus:ring-blue-500/20 focus:border-blue-400"
                      />
                    </div>

                    <div className="space-y-2">
                      <Label htmlFor="ends_at" className={cn("text-sm font-medium", validationError ? "text-destructive" : "text-slate-600")}>
                        End Time
                      </Label>
                      <Input
                        id="ends_at"
                        type="datetime-local"
                        value={formData.ends_at}
                        onChange={(e) => setFormData({ ...formData, ends_at: e.target.value })}
                        disabled={!canEdit || loading}
                        className={cn(
                          "h-11 bg-white border-slate-200 rounded-xl shadow-sm focus:ring-2 focus:ring-blue-500/20 focus:border-blue-400",
                          validationError && "border-destructive"
                        )}
                        required
                      />
                    </div>
                  </div>
                </div>

                {/* Recurrence Selector */}
                <RecurrenceSelector
                  value={recurrence}
                  onChange={setRecurrence}
                  startDate={formData.starts_at}
                />
                </div>
              </ScrollArea>

              {/* Fixed Action Buttons Footer */}
              <div className="flex-shrink-0 border-t bg-slate-50 px-6 py-4 space-y-3">
                {canEdit && (
                  <div className="flex items-center gap-3">
                    <Button
                      type="button"
                      variant="outline"
                      className="flex-1"
                      onClick={() => onOpenChange(false)}
                      disabled={loading}
                    >
                      Cancel
                    </Button>
                    {eventId && event && (isAdmin || event.created_by === user?.id) && (
                      <Button
                        type="button"
                        variant="destructive"
                        className="flex-1"
                        onClick={handleDelete}
                        disabled={loading}
                      >
                        Delete
                      </Button>
                    )}
                    <Button
                      type="submit"
                      className="flex-1 bg-blue-600 hover:bg-blue-700"
                      disabled={loading || !!validationError || roomConflict.hasConflict}
                    >
                      {eventId
                        ? (!isAdmin && event && (event.status === 'draft' || event.status === 'pending_review')
                            ? "Update & Submit"
                            : "Update")
                        : (!isAdmin ? "Create & Submit" : "Create")
                      }
                    </Button>
                  </div>
                )}

                {isAdmin && event && event.status === "pending_review" && (
                  <div className="flex gap-3">
                    <Button
                      type="button"
                      className="flex-1 bg-green-600 hover:bg-green-700"
                      onClick={() => handleStatusChange("approved")}
                      disabled={loading}
                    >
                      Approve
                    </Button>
                    <Button
                      type="button"
                      variant="destructive"
                      className="flex-1"
                      onClick={() => setRejectionDialogOpen(true)}
                      disabled={loading}
                    >
                      Reject
                    </Button>
                  </div>
                )}

                {isAdmin && event && event.status === "approved" && (
                  <Button
                    type="button"
                    className="w-full bg-blue-600 hover:bg-blue-700"
                    onClick={() => handleStatusChange("published")}
                    disabled={loading}
                  >
                    Publish Event
                  </Button>
                )}
              </div>
            </form>
          </div>

          {/* Right side - Event Sidebar */}
          <div className="hidden lg:flex lg:flex-col border-l bg-slate-50/50">
            <div className="p-5 border-b bg-white">
              <h3 className="text-lg font-semibold text-slate-800">Events</h3>
              <p className="text-sm text-slate-500 mt-1">
                {format(filterDate, "MMMM d, yyyy")}
              </p>
            </div>
            <div className="p-4 flex-1 overflow-auto">
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

      <RejectionReasonDialog
        open={rejectionDialogOpen}
        onOpenChange={setRejectionDialogOpen}
        onConfirm={handleRejectWithReason}
        eventTitle={event?.title || ""}
        loading={rejectionLoading}
      />

      <RecurringEventActionDialog
        open={recurringDeleteDialogOpen}
        onOpenChange={setRecurringDeleteDialogOpen}
        onConfirm={handleRecurringDeleteConfirm}
        actionType="delete"
        eventTitle={event?.title || ""}
        loading={loading}
      />

      <RecurringEventActionDialog
        open={recurringRejectDialogOpen}
        onOpenChange={setRecurringRejectDialogOpen}
        onConfirm={handleRecurringRejectConfirm}
        actionType="reject"
        eventTitle={event?.title || ""}
        loading={rejectionLoading}
      />

      <RecurringEventActionDialog
        open={recurringUpdateDialogOpen}
        onOpenChange={(open) => {
          setRecurringUpdateDialogOpen(open);
          if (!open) setPendingUpdateData(null);
        }}
        onConfirm={handleRecurringUpdateConfirm}
        actionType="update"
        eventTitle={event?.title || ""}
        loading={loading}
      />
    </Dialog>
  );
};

export default EventDialog;
