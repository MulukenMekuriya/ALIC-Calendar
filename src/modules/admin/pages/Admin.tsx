import { useState, useMemo } from "react";
import { useQuery } from "@tanstack/react-query";
import { supabase } from "@/integrations/supabase/client";
import DashboardLayout from "@/shared/components/layout/DashboardLayout";
import { Button } from "@/shared/components/ui/button";
import { Badge } from "@/shared/components/ui/badge";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/shared/components/ui/card";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/shared/components/ui/tabs";
import { Check, X, Eye, User, Download, Trash2, CalendarDays } from "lucide-react";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/shared/components/ui/select";
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
import { useToast } from "@/shared/hooks/use-toast";
import EventDialog from "@/modules/calendar/components/EventDialog";
import { ExportDialog } from "@/modules/calendar/components";
import { RejectionReasonDialog } from "@/shared/components/RejectionReasonDialog";
import { RecurringEventActionDialog, RecurringActionScope } from "@/shared/components/RecurringEventActionDialog";
import { formatDistance, format } from "date-fns";
import { useOrganization } from "@/shared/contexts/OrganizationContext";
import { useSearch } from "@/shared/contexts/SearchContext";
import { useAuth } from "@/shared/contexts/AuthContext";
import { eventService } from "@/modules/calendar/services";
import { ALL_YEARS, filterEventsByYear, yearsInEvents } from "../utils/eventYear";

// Helper function to filter events based on search query
const filterEvents = <T extends {
  title: string;
  description?: string | null;
  room?: { name: string } | null;
  creator?: { full_name?: string | null; ministry_name?: string | null } | null;
}>(events: T[] | undefined, query: string): T[] => {
  if (!events) return [];
  if (!query.trim()) return events;

  const lowerQuery = query.toLowerCase();
  return events.filter((event) => {
    const title = event.title?.toLowerCase() || "";
    const description = event.description?.toLowerCase() || "";
    const roomName = event.room?.name?.toLowerCase() || "";
    const creatorName = event.creator?.full_name?.toLowerCase() || "";
    const ministryName = event.creator?.ministry_name?.toLowerCase() || "";

    return (
      title.includes(lowerQuery) ||
      description.includes(lowerQuery) ||
      roomName.includes(lowerQuery) ||
      creatorName.includes(lowerQuery) ||
      ministryName.includes(lowerQuery)
    );
  });
};

const DeleteEventButton = ({ onClick }: { onClick: () => void }) => (
  <Button
    variant="outline"
    size="sm"
    className="text-xs sm:text-sm text-destructive hover:text-destructive hover:bg-destructive/10"
    onClick={onClick}
  >
    <Trash2 className="h-3 w-3 sm:h-4 sm:w-4 mr-1" />
    Delete
  </Button>
);

const Admin = () => {
  const { toast } = useToast();
  const { currentOrganization } = useOrganization();
  const { searchQuery } = useSearch();
  const { user, isAdmin } = useAuth();
  const [selectedEventId, setSelectedEventId] = useState<string | null>(null);
  const [isEventDialogOpen, setIsEventDialogOpen] = useState(false);
  const [isExportDialogOpen, setIsExportDialogOpen] = useState(false);
  const [rejectionDialogOpen, setRejectionDialogOpen] = useState(false);
  const [eventToReject, setEventToReject] = useState<{ id: string; title: string; is_recurring?: boolean; parent_event_id?: string | null } | null>(null);
  const [rejectionLoading, setRejectionLoading] = useState(false);
  const [recurringRejectDialogOpen, setRecurringRejectDialogOpen] = useState(false);
  const [pendingRejectionReason, setPendingRejectionReason] = useState<string>("");
  const [yearFilter, setYearFilter] = useState<string>(ALL_YEARS);
  const [eventToDelete, setEventToDelete] = useState<{ id: string; title: string; is_recurring?: boolean; parent_event_id?: string | null } | null>(null);
  const [deleteDialogOpen, setDeleteDialogOpen] = useState(false);
  const [recurringDeleteDialogOpen, setRecurringDeleteDialogOpen] = useState(false);
  const [deleteLoading, setDeleteLoading] = useState(false);

  const { data: pendingEvents, refetch: refetchPending } = useQuery({
    queryKey: ["pending-events", currentOrganization?.id, user?.id, isAdmin],
    queryFn: async () => {
      if (!currentOrganization?.id) return [];

      let query = supabase
        .from("events")
        .select(`
          *,
          rooms(name, color)
        `)
        .eq("organization_id", currentOrganization.id)
        .eq("status", "pending_review");

      // Contributors can only see their own events
      if (!isAdmin && user?.id) {
        query = query.eq("created_by", user.id);
      }

      const { data, error } = await query.order("created_at", { ascending: false });

      if (error) throw error;

      // Fetch creator profiles separately
      const eventsWithCreators = await Promise.all(
        (data || []).map(async (event) => {
          const { data: profile } = await supabase
            .from("profiles")
            .select("full_name, email, ministry_name")
            .eq("id", event.created_by)
            .single();

          return {
            ...event,
            room: event.rooms,
            creator: profile || null,
          };
        })
      );

      return eventsWithCreators;
    },
    enabled: !!currentOrganization?.id,
  });

  const { data: approvedEvents, refetch: refetchApproved } = useQuery({
    queryKey: ["approved-events", currentOrganization?.id, user?.id, isAdmin],
    queryFn: async () => {
      if (!currentOrganization?.id) return [];

      let query = supabase
        .from("events")
        .select(`
          *,
          rooms(name, color)
        `)
        .eq("organization_id", currentOrganization.id)
        .eq("status", "approved");

      // Contributors can only see their own events
      if (!isAdmin && user?.id) {
        query = query.eq("created_by", user.id);
      }

      const { data, error } = await query.order("starts_at", { ascending: true });

      if (error) throw error;

      // Fetch creator profiles separately
      const eventsWithCreators = await Promise.all(
        (data || []).map(async (event) => {
          const { data: profile } = await supabase
            .from("profiles")
            .select("full_name, email, ministry_name")
            .eq("id", event.created_by)
            .single();

          return {
            ...event,
            room: event.rooms,
            creator: profile || null,
          };
        })
      );

      return eventsWithCreators;
    },
    enabled: !!currentOrganization?.id,
  });

  const { data: publishedEvents, refetch: refetchPublished } = useQuery({
    queryKey: ["published-events", currentOrganization?.id, user?.id, isAdmin],
    queryFn: async () => {
      if (!currentOrganization?.id) return [];

      let query = supabase
        .from("events")
        .select(`
          *,
          rooms(name, color)
        `)
        .eq("organization_id", currentOrganization.id)
        .eq("status", "published");

      // Contributors can only see their own events
      if (!isAdmin && user?.id) {
        query = query.eq("created_by", user.id);
      }

      const { data, error } = await query.order("starts_at", { ascending: true });

      if (error) throw error;

      // Fetch creator profiles separately
      const eventsWithCreators = await Promise.all(
        (data || []).map(async (event) => {
          const { data: profile } = await supabase
            .from("profiles")
            .select("full_name, email, ministry_name")
            .eq("id", event.created_by)
            .single();

          return {
            ...event,
            room: event.rooms,
            creator: profile || null,
          };
        })
      );

      return eventsWithCreators;
    },
    enabled: !!currentOrganization?.id,
  });

  const { data: rejectedEvents, refetch: refetchRejected } = useQuery({
    queryKey: ["rejected-events", currentOrganization?.id, user?.id, isAdmin],
    queryFn: async () => {
      if (!currentOrganization?.id) return [];

      let query = supabase
        .from("events")
        .select(`
          *,
          rooms(name, color)
        `)
        .eq("organization_id", currentOrganization.id)
        .eq("status", "rejected");

      // Contributors can only see their own events
      if (!isAdmin && user?.id) {
        query = query.eq("created_by", user.id);
      }

      const { data, error } = await query.order("created_at", { ascending: false });

      if (error) throw error;

      // Fetch creator profiles separately
      const eventsWithCreators = await Promise.all(
        (data || []).map(async (event) => {
          const { data: profile } = await supabase
            .from("profiles")
            .select("full_name, email, ministry_name")
            .eq("id", event.created_by)
            .single();

          return {
            ...event,
            room: event.rooms,
            creator: profile || null,
          };
        })
      );

      return eventsWithCreators;
    },
    enabled: !!currentOrganization?.id,
  });

  // The years the picker offers, drawn from the board itself.
  const availableYears = useMemo(
    () => yearsInEvents([pendingEvents, approvedEvents, publishedEvents, rejectedEvents]),
    [pendingEvents, approvedEvents, publishedEvents, rejectedEvents]
  );

  // Filter events based on search query and the selected year
  const filteredPendingEvents = useMemo(
    () => filterEventsByYear(filterEvents(pendingEvents, searchQuery), yearFilter),
    [pendingEvents, searchQuery, yearFilter]
  );

  const filteredApprovedEvents = useMemo(
    () => filterEventsByYear(filterEvents(approvedEvents, searchQuery), yearFilter),
    [approvedEvents, searchQuery, yearFilter]
  );

  const filteredPublishedEvents = useMemo(
    () => filterEventsByYear(filterEvents(publishedEvents, searchQuery), yearFilter),
    [publishedEvents, searchQuery, yearFilter]
  );

  const filteredRejectedEvents = useMemo(
    () => filterEventsByYear(filterEvents(rejectedEvents, searchQuery), yearFilter),
    [rejectedEvents, searchQuery, yearFilter]
  );

  // Exports follow the year on screen, so a 2027 review exports the 2027 calendar.
  const exportableEvents = useMemo(
    () => filterEventsByYear([...(approvedEvents || []), ...(publishedEvents || [])], yearFilter),
    [approvedEvents, publishedEvents, yearFilter]
  );

  const handleStatusChange = async (eventId: string, status: "approved" | "published" | "pending_review", isUnpublishing?: boolean) => {
    try {
      // Use the status as provided - don't automatically publish
      const finalStatus = status;

      // Get event details before updating
      const { data: event } = await supabase
        .from("events")
        .select(`
          *,
          rooms(name, color)
        `)
        .eq("id", eventId)
        .single();

      if (!event) throw new Error("Event not found");

      // Get creator profile separately
      const { data: creator } = await supabase
        .from("profiles")
        .select("full_name, email")
        .eq("id", event.created_by)
        .single();

      const { error } = await supabase
        .from("events")
        .update({ status: finalStatus, reviewer_id: (await supabase.auth.getUser()).data.user?.id })
        .eq("id", eventId);

      if (error) throw error;

      let statusMessage = "";
      if (isUnpublishing) {
        statusMessage = "Event unpublished";
      } else if (status === "approved") {
        statusMessage = "Event approved";
      } else if (status === "published") {
        statusMessage = "Event published";
      } else {
        statusMessage = `Event ${finalStatus.replace("_", " ")}`;
      }

      toast({ title: statusMessage });

      // Send email notification to event creator
      if (creator?.email) {
        const emailStatus = finalStatus;

        try {
          console.log("Invoking send-event-notification function for:", creator.email);

          const response = await supabase.functions.invoke("send-event-notification", {
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
              roomName: event.rooms?.name || "Unknown Room",
              status: emailStatus,
              requesterName: creator.full_name || "User",
              reviewerNotes: event.reviewer_notes || undefined,
            },
          });

          console.log("Email notification response:", response);

          if (response.error) {
            console.error("Email notification error:", response.error);
            toast({
              title: "Warning",
              description: "Event status updated but email notification failed",
              variant: "default",
            });
          } else {
            console.log("Email notification sent successfully");
          }
        } catch (emailError) {
          console.error("Failed to send email notification:", emailError);
          toast({
            title: "Warning",
            description: "Event status updated but email notification failed",
            variant: "default",
          });
        }
      } else {
        console.warn("No email found for creator, skipping notification");
      }

      refetchPending();
      refetchApproved();
      refetchPublished();
      refetchRejected();
    } catch (error) {
      toast({
        title: "Error",
        description: error instanceof Error ? error.message : "An error occurred",
        variant: "destructive",
      });
    }
  };

  const handleOpenRejectionDialog = (eventId: string, eventTitle: string, isRecurring?: boolean, parentEventId?: string | null) => {
    setEventToReject({ id: eventId, title: eventTitle, is_recurring: isRecurring, parent_event_id: parentEventId });
    setRejectionDialogOpen(true);
  };

  const handleRejectWithReason = async (reason: string) => {
    if (!eventToReject) return;

    // Check if this is a recurring event
    if (eventToReject.is_recurring) {
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
    if (!eventToReject) return;

    setRejectionLoading(true);
    try {
      // Get event details before updating
      const { data: event } = await supabase
        .from("events")
        .select(`
          *,
          rooms(name, color)
        `)
        .eq("id", eventToReject.id)
        .single();

      if (!event) throw new Error("Event not found");

      // Get creator profile separately
      const { data: creator } = await supabase
        .from("profiles")
        .select("full_name, email")
        .eq("id", event.created_by)
        .single();

      const reviewerId = (await supabase.auth.getUser()).data.user?.id;

      if (scope === "all") {
        // Reject all events in the series
        const parentId = eventToReject.parent_event_id || eventToReject.id;

        // Update the parent event
        await supabase
          .from("events")
          .update({
            status: "rejected",
            reviewer_id: reviewerId,
            reviewer_notes: reason,
          })
          .eq("id", parentId);

        // Update all child events
        await supabase
          .from("events")
          .update({
            status: "rejected",
            reviewer_id: reviewerId,
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
            reviewer_id: reviewerId,
            reviewer_notes: reason,
          })
          .eq("id", eventToReject.id);

        if (error) throw error;

        toast({ title: "Event rejected" });
      }

      // Send email notification to event creator with rejection reason
      if (creator?.email) {
        try {
          console.log("Invoking send-event-notification function for rejection:", creator.email);

          const response = await supabase.functions.invoke("send-event-notification", {
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
              roomName: event.rooms?.name || "Unknown Room",
              status: "rejected",
              requesterName: creator.full_name || "User",
              reviewerNotes: reason,
            },
          });

          console.log("Email notification response:", response);

          if (response.error) {
            console.error("Email notification error:", response.error);
            toast({
              title: "Warning",
              description: "Event rejected but email notification failed",
              variant: "default",
            });
          } else {
            console.log("Email notification sent successfully");
          }
        } catch (emailError) {
          console.error("Failed to send email notification:", emailError);
          toast({
            title: "Warning",
            description: "Event rejected but email notification failed",
            variant: "default",
          });
        }
      } else {
        console.warn("No email found for creator, skipping notification");
      }

      setRejectionDialogOpen(false);
      setEventToReject(null);
      refetchPending();
      refetchApproved();
      refetchPublished();
      refetchRejected();
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

  const handleUnapprove = async (eventId: string) => {
    try {
      // Get event details before updating
      const { data: event } = await supabase
        .from("events")
        .select(`
          *,
          rooms(name, color)
        `)
        .eq("id", eventId)
        .single();

      if (!event) throw new Error("Event not found");

      // Get creator profile separately
      const { data: creator } = await supabase
        .from("profiles")
        .select("full_name, email")
        .eq("id", event.created_by)
        .single();

      const { error } = await supabase
        .from("events")
        .update({ status: "pending_review" })
        .eq("id", eventId);

      if (error) throw error;

      toast({ title: "Event moved to pending review" });

      // Send email notification to event creator
      if (creator?.email) {
        try {
          console.log("Invoking send-event-notification (unapprove) for:", creator.email);

          const response = await supabase.functions.invoke("send-event-notification", {
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
              roomName: event.rooms?.name || "Unknown Room",
              status: "unapproved",
              requesterName: creator.full_name || "User",
              reviewerNotes: event.reviewer_notes || undefined,
            },
          });

          console.log("Email notification response (unapprove):", response);

          if (response.error) {
            console.error("Email notification error:", response.error);
            toast({
              title: "Warning",
              description: "Event status updated but email notification failed",
              variant: "default",
            });
          } else {
            console.log("Email notification sent successfully");
          }
        } catch (emailError) {
          console.error("Failed to send email notification:", emailError);
          toast({
            title: "Warning",
            description: "Event status updated but email notification failed",
            variant: "default",
          });
        }
      } else {
        console.warn("No email found for creator, skipping notification");
      }

      refetchPending();
      refetchApproved();
      refetchPublished();
      refetchRejected();
    } catch (error) {
      toast({
        title: "Error",
        description: error instanceof Error ? error.message : "An error occurred",
        variant: "destructive",
      });
    }
  };

  // A cancelled event has no status left to move it to, so it is removed from
  // the board outright. Admins may remove any event; a requester may remove
  // their own, which is what the row-level policies already allow.
  const canDelete = (event: { created_by?: string | null }) =>
    isAdmin || (!!user?.id && event.created_by === user.id);

  const handleOpenDeleteDialog = (event: { id: string; title: string; is_recurring?: boolean; parent_event_id?: string | null }) => {
    setEventToDelete({
      id: event.id,
      title: event.title,
      is_recurring: event.is_recurring,
      parent_event_id: event.parent_event_id,
    });

    // A recurring event asks first whether this one or the whole series goes.
    if (event.is_recurring) {
      setRecurringDeleteDialogOpen(true);
    } else {
      setDeleteDialogOpen(true);
    }
  };

  const executeDelete = async (scope: RecurringActionScope) => {
    if (!eventToDelete) return;

    setDeleteLoading(true);
    try {
      const removed = await eventService.deleteScoped(eventToDelete, scope);

      // The policies refuse by matching nothing rather than by erroring, so a
      // count of zero is the only sign that the event is still there.
      if (removed === 0) {
        throw new Error(
          scope === "all"
            ? "This series could not be deleted. You may not have permission to remove it."
            : "This event could not be deleted. You may not have permission to remove it."
        );
      }

      toast({
        title: scope === "all" ? `All ${removed} events in series deleted` : "Event deleted",
      });

      setDeleteDialogOpen(false);
      setRecurringDeleteDialogOpen(false);
      setEventToDelete(null);

      refetchPending();
      refetchApproved();
      refetchPublished();
      refetchRejected();
    } catch (error) {
      toast({
        title: "Error",
        description: error instanceof Error ? error.message : "An error occurred",
        variant: "destructive",
      });
    } finally {
      setDeleteLoading(false);
    }
  };

  const handleViewEvent = (eventId: string) => {
    setSelectedEventId(eventId);
    setIsEventDialogOpen(true);
  };

  const statusColors: Record<string, string> = {
    draft: "bg-gray-500",
    pending_review: "bg-amber-500",
    approved: "bg-green-500",
    rejected: "bg-red-500",
    published: "bg-blue-500",
  };

  return (
    <DashboardLayout>
      <div className="space-y-4 sm:space-y-6">
        <div className="flex flex-col sm:flex-row sm:justify-between sm:items-start gap-3">
          <div>
            <h1 className="text-2xl sm:text-3xl font-bold">{isAdmin ? "Event Review" : "My Requests"}</h1>
            <p className="text-sm sm:text-base text-muted-foreground mt-1">
              {isAdmin ? "Review and manage event submissions" : "Track the status of your event requests"}
            </p>
          </div>
          <div className="flex items-center gap-2 self-start">
            <Select value={yearFilter} onValueChange={setYearFilter}>
              <SelectTrigger
                className="h-9 w-[150px] [&>span]:flex-1 [&>span]:text-left"
                aria-label="Filter by year"
              >
                <CalendarDays className="h-4 w-4 mr-2 flex-shrink-0 text-muted-foreground" />
                <SelectValue />
              </SelectTrigger>
              <SelectContent>
                <SelectItem value={ALL_YEARS}>All years</SelectItem>
                {availableYears.map((year) => (
                  <SelectItem key={year} value={year.toString()}>
                    {year}
                  </SelectItem>
                ))}
              </SelectContent>
            </Select>
            <Button
              variant="outline"
              size="sm"
              onClick={() => setIsExportDialogOpen(true)}
              className="gap-2"
            >
              <Download className="h-4 w-4" />
              Export
            </Button>
          </div>
        </div>

        <Tabs defaultValue="pending" className="space-y-4">
          <TabsList className="grid grid-cols-2 sm:grid-cols-4 w-full sm:w-auto h-auto gap-1 p-1">
            <TabsTrigger value="pending" className="text-xs sm:text-sm px-2 sm:px-4 py-1.5 sm:py-2">
              <span className="hidden sm:inline">Pending Review</span>
              <span className="sm:hidden">Pending</span>
              <span className="ml-1">({filteredPendingEvents.length})</span>
            </TabsTrigger>
            <TabsTrigger value="approved" className="text-xs sm:text-sm px-2 sm:px-4 py-1.5 sm:py-2">
              Approved ({filteredApprovedEvents.length})
            </TabsTrigger>
            <TabsTrigger value="published" className="text-xs sm:text-sm px-2 sm:px-4 py-1.5 sm:py-2">
              Published ({filteredPublishedEvents.length})
            </TabsTrigger>
            <TabsTrigger value="rejected" className="text-xs sm:text-sm px-2 sm:px-4 py-1.5 sm:py-2">
              Rejected ({filteredRejectedEvents.length})
            </TabsTrigger>
          </TabsList>

          <TabsContent value="pending" className="space-y-4">
            {filteredPendingEvents.length === 0 ? (
              <Card>
                <CardContent className="py-8">
                  <p className="text-center text-muted-foreground">
                    {searchQuery ? "No events match your search" : "No events pending review"}
                  </p>
                </CardContent>
              </Card>
            ) : (
              filteredPendingEvents.map((event) => (
                <Card key={event.id}>
                  <CardHeader className="pb-3 sm:pb-6">
                    <div className="flex items-start justify-between gap-2">
                      <div className="flex-1 min-w-0">
                        <CardTitle className="text-base sm:text-xl line-clamp-2">{event.title}</CardTitle>
                        <CardDescription className="mt-2 space-y-2">
                          <div className="flex flex-col sm:flex-row sm:items-center gap-1 sm:gap-2 flex-wrap">
                            <Badge variant="secondary" className={`${statusColors[event.status]} text-[10px] sm:text-xs`}>
                              {event.status.replace("_", " ")}
                            </Badge>
                            <span className="text-xs sm:text-sm">
                              {event.room?.name} • {format(new Date(event.starts_at), "MMM d, yyyy")}
                            </span>
                            <span className="text-xs sm:text-sm text-muted-foreground">
                              {format(new Date(event.starts_at), "h:mm a")} - {format(new Date(event.ends_at), "h:mm a")}
                            </span>
                          </div>
                          {event.description && (
                            <p className="text-xs sm:text-sm line-clamp-2">{event.description}</p>
                          )}
                          <div className="flex flex-col sm:flex-row sm:items-center gap-1 sm:gap-4 text-xs">
                            {event.creator && (
                              <div className="flex flex-col gap-0.5 text-muted-foreground">
                                <div className="flex items-center gap-1">
                                  <User className="h-3 w-3 flex-shrink-0" />
                                  <span className="truncate">Requested by: <span className="font-medium text-foreground">{event.creator.full_name}</span></span>
                                </div>
                                {event.creator.ministry_name && (
                                  <span className="text-xs ml-4 truncate">{event.creator.ministry_name}</span>
                                )}
                              </div>
                            )}
                            <span className="text-muted-foreground text-[10px] sm:text-xs">
                              Submitted {formatDistance(new Date(event.created_at), new Date(), { addSuffix: true })}
                            </span>
                          </div>
                        </CardDescription>
                      </div>
                    </div>
                  </CardHeader>
                  <CardContent className="pt-0">
                    <div className="flex flex-wrap gap-2">
                      {isAdmin && (
                        <>
                          <Button
                            variant="default"
                            size="sm"
                            className="text-xs sm:text-sm"
                            onClick={() => handleStatusChange(event.id, "approved")}
                          >
                            <Check className="h-3 w-3 sm:h-4 sm:w-4 mr-1" />
                            Approve
                          </Button>
                          <Button
                            variant="destructive"
                            size="sm"
                            className="text-xs sm:text-sm"
                            onClick={() => handleOpenRejectionDialog(event.id, event.title, event.is_recurring, event.parent_event_id)}
                          >
                            <X className="h-3 w-3 sm:h-4 sm:w-4 mr-1" />
                            Reject
                          </Button>
                        </>
                      )}
                      <Button variant="outline" size="sm" className="text-xs sm:text-sm" onClick={() => handleViewEvent(event.id)}>
                        <Eye className="h-3 w-3 sm:h-4 sm:w-4 mr-1" />
                        <span className="hidden xs:inline">View </span>Details
                      </Button>
                      {canDelete(event) && (
                        <DeleteEventButton onClick={() => handleOpenDeleteDialog(event)} />
                      )}
                    </div>
                  </CardContent>
                </Card>
              ))
            )}
          </TabsContent>

          <TabsContent value="approved" className="space-y-4">
            {filteredApprovedEvents.length === 0 ? (
              <Card>
                <CardContent className="py-8">
                  <p className="text-center text-muted-foreground">
                    {searchQuery ? "No events match your search" : "No approved events"}
                  </p>
                </CardContent>
              </Card>
            ) : (
              filteredApprovedEvents.map((event) => (
                <Card key={event.id}>
                  <CardHeader className="pb-3 sm:pb-6">
                    <div className="flex items-start justify-between gap-2">
                      <div className="flex-1 min-w-0">
                        <CardTitle className="text-base sm:text-xl line-clamp-2">{event.title}</CardTitle>
                        <CardDescription className="mt-2 space-y-2">
                          <div className="flex flex-col sm:flex-row sm:items-center gap-1 sm:gap-2 flex-wrap">
                            <Badge variant="secondary" className={`${statusColors[event.status]} text-[10px] sm:text-xs`}>
                              {event.status.replace("_", " ")}
                            </Badge>
                            <span className="text-xs sm:text-sm">
                              {event.room?.name} • {format(new Date(event.starts_at), "MMM d, yyyy")}
                            </span>
                            <span className="text-xs sm:text-sm text-muted-foreground">
                              {format(new Date(event.starts_at), "h:mm a")} - {format(new Date(event.ends_at), "h:mm a")}
                            </span>
                          </div>
                          {event.description && (
                            <p className="text-xs sm:text-sm line-clamp-2">{event.description}</p>
                          )}
                          {event.creator && (
                            <div className="flex flex-col gap-0.5 text-xs text-muted-foreground">
                              <div className="flex items-center gap-1">
                                <User className="h-3 w-3 flex-shrink-0" />
                                <span className="truncate">Requested by: <span className="font-medium text-foreground">{event.creator.full_name}</span></span>
                              </div>
                              {event.creator.ministry_name && (
                                <span className="text-xs ml-4 truncate">{event.creator.ministry_name}</span>
                              )}
                            </div>
                          )}
                        </CardDescription>
                      </div>
                    </div>
                  </CardHeader>
                  <CardContent className="pt-0">
                    <div className="flex flex-wrap gap-2">
                      {isAdmin && (
                        <>
                          <Button
                            size="sm"
                            className="text-xs sm:text-sm"
                            onClick={() => handleStatusChange(event.id, "published")}
                          >
                            Publish
                          </Button>
                          <Button
                            variant="secondary"
                            size="sm"
                            className="text-xs sm:text-sm"
                            onClick={() => handleUnapprove(event.id)}
                          >
                            Unapprove
                          </Button>
                        </>
                      )}
                      <Button variant="outline" size="sm" className="text-xs sm:text-sm" onClick={() => handleViewEvent(event.id)}>
                        <Eye className="h-3 w-3 sm:h-4 sm:w-4 mr-1" />
                        <span className="hidden xs:inline">View </span>Details
                      </Button>
                      {canDelete(event) && (
                        <DeleteEventButton onClick={() => handleOpenDeleteDialog(event)} />
                      )}
                    </div>
                  </CardContent>
                </Card>
              ))
            )}
          </TabsContent>

          <TabsContent value="published" className="space-y-4">
            {filteredPublishedEvents.length === 0 ? (
              <Card>
                <CardContent className="py-8">
                  <p className="text-center text-muted-foreground">
                    {searchQuery ? "No events match your search" : "No published events"}
                  </p>
                </CardContent>
              </Card>
            ) : (
              filteredPublishedEvents.map((event) => (
                <Card key={event.id}>
                  <CardHeader className="pb-3 sm:pb-6">
                    <div className="flex items-start justify-between gap-2">
                      <div className="flex-1 min-w-0">
                        <CardTitle className="text-base sm:text-xl line-clamp-2">{event.title}</CardTitle>
                        <CardDescription className="mt-2 space-y-2">
                          <div className="flex flex-col sm:flex-row sm:items-center gap-1 sm:gap-2 flex-wrap">
                            <Badge variant="secondary" className={`${statusColors[event.status]} text-[10px] sm:text-xs`}>
                              {event.status.replace("_", " ")}
                            </Badge>
                            <span className="text-xs sm:text-sm">
                              {event.room?.name} • {format(new Date(event.starts_at), "MMM d, yyyy")}
                            </span>
                            <span className="text-xs sm:text-sm text-muted-foreground">
                              {format(new Date(event.starts_at), "h:mm a")} - {format(new Date(event.ends_at), "h:mm a")}
                            </span>
                          </div>
                          {event.description && (
                            <p className="text-xs sm:text-sm line-clamp-2">{event.description}</p>
                          )}
                          {event.creator && (
                            <div className="flex flex-col gap-0.5 text-xs text-muted-foreground">
                              <div className="flex items-center gap-1">
                                <User className="h-3 w-3 flex-shrink-0" />
                                <span className="truncate">Requested by: <span className="font-medium text-foreground">{event.creator.full_name}</span></span>
                              </div>
                              {event.creator.ministry_name && (
                                <span className="text-xs ml-4 truncate">{event.creator.ministry_name}</span>
                              )}
                            </div>
                          )}
                        </CardDescription>
                      </div>
                    </div>
                  </CardHeader>
                  <CardContent className="pt-0">
                    <div className="flex flex-wrap gap-2">
                      {isAdmin && (
                        <>
                          <Button
                            variant="outline"
                            size="sm"
                            className="text-xs sm:text-sm"
                            onClick={() => handleStatusChange(event.id, "approved", true)}
                          >
                            Unpublish
                          </Button>
                          <Button
                            variant="secondary"
                            size="sm"
                            className="text-xs sm:text-sm"
                            onClick={() => handleUnapprove(event.id)}
                          >
                            Unapprove
                          </Button>
                        </>
                      )}
                      <Button variant="outline" size="sm" className="text-xs sm:text-sm" onClick={() => handleViewEvent(event.id)}>
                        <Eye className="h-3 w-3 sm:h-4 sm:w-4 mr-1" />
                        <span className="hidden xs:inline">View </span>Details
                      </Button>
                      {canDelete(event) && (
                        <DeleteEventButton onClick={() => handleOpenDeleteDialog(event)} />
                      )}
                    </div>
                  </CardContent>
                </Card>
              ))
            )}
          </TabsContent>

          <TabsContent value="rejected" className="space-y-4">
            {filteredRejectedEvents.length === 0 ? (
              <Card>
                <CardContent className="py-8">
                  <p className="text-center text-muted-foreground">
                    {searchQuery ? "No events match your search" : "No rejected events"}
                  </p>
                </CardContent>
              </Card>
            ) : (
              filteredRejectedEvents.map((event) => (
                <Card key={event.id}>
                  <CardHeader className="pb-3 sm:pb-6">
                    <div className="flex items-start justify-between gap-2">
                      <div className="flex-1 min-w-0">
                        <CardTitle className="text-base sm:text-xl line-clamp-2">{event.title}</CardTitle>
                        <CardDescription className="mt-2 space-y-2">
                          <div className="flex flex-col sm:flex-row sm:items-center gap-1 sm:gap-2 flex-wrap">
                            <Badge variant="secondary" className={`${statusColors[event.status]} text-[10px] sm:text-xs`}>
                              {event.status.replace("_", " ")}
                            </Badge>
                            <span className="text-xs sm:text-sm">
                              {event.room?.name} • {format(new Date(event.starts_at), "MMM d, yyyy")}
                            </span>
                            <span className="text-xs sm:text-sm text-muted-foreground">
                              {format(new Date(event.starts_at), "h:mm a")} - {format(new Date(event.ends_at), "h:mm a")}
                            </span>
                          </div>
                          {event.description && (
                            <p className="text-xs sm:text-sm line-clamp-2">{event.description}</p>
                          )}
                          <div className="flex flex-col sm:flex-row sm:items-center gap-1 sm:gap-4 text-xs">
                            {event.creator && (
                              <div className="flex flex-col gap-0.5 text-muted-foreground">
                                <div className="flex items-center gap-1">
                                  <User className="h-3 w-3 flex-shrink-0" />
                                  <span className="truncate">Requested by: <span className="font-medium text-foreground">{event.creator.full_name}</span></span>
                                </div>
                                {event.creator.ministry_name && (
                                  <span className="text-xs ml-4 truncate">{event.creator.ministry_name}</span>
                                )}
                              </div>
                            )}
                            <span className="text-muted-foreground text-[10px] sm:text-xs">
                              Submitted {formatDistance(new Date(event.created_at), new Date(), { addSuffix: true })}
                            </span>
                          </div>
                          {event.reviewer_notes && (
                            <div className="mt-2 sm:mt-3 p-2 sm:p-3 bg-red-50 dark:bg-red-950 border border-red-200 dark:border-red-800 rounded-md">
                              <p className="text-xs sm:text-sm font-medium text-red-800 dark:text-red-200">Rejection Reason:</p>
                              <p className="text-xs sm:text-sm text-red-700 dark:text-red-300 mt-1">{event.reviewer_notes}</p>
                            </div>
                          )}
                        </CardDescription>
                      </div>
                    </div>
                  </CardHeader>
                  <CardContent className="pt-0">
                    <div className="flex flex-wrap gap-2">
                      {isAdmin && (
                        <Button
                          variant="default"
                          size="sm"
                          className="text-xs sm:text-sm"
                          onClick={() => handleStatusChange(event.id, "pending_review")}
                        >
                          Move to Pending
                        </Button>
                      )}
                      <Button variant="outline" size="sm" className="text-xs sm:text-sm" onClick={() => handleViewEvent(event.id)}>
                        <Eye className="h-3 w-3 sm:h-4 sm:w-4 mr-1" />
                        <span className="hidden xs:inline">View </span>Details
                      </Button>
                      {canDelete(event) && (
                        <DeleteEventButton onClick={() => handleOpenDeleteDialog(event)} />
                      )}
                    </div>
                  </CardContent>
                </Card>
              ))
            )}
          </TabsContent>
        </Tabs>

        <EventDialog
          open={isEventDialogOpen}
          onOpenChange={setIsEventDialogOpen}
          eventId={selectedEventId}
          onSuccess={() => {
            refetchPending();
            refetchApproved();
            refetchPublished();
            refetchRejected();
            setIsEventDialogOpen(false);
          }}
        />

        <RejectionReasonDialog
          open={rejectionDialogOpen}
          onOpenChange={setRejectionDialogOpen}
          onConfirm={handleRejectWithReason}
          eventTitle={eventToReject?.title || ""}
          loading={rejectionLoading}
        />

        <AlertDialog
          open={deleteDialogOpen}
          onOpenChange={(open) => {
            setDeleteDialogOpen(open);
            if (!open) setEventToDelete(null);
          }}
        >
          <AlertDialogContent>
            <AlertDialogHeader>
              <AlertDialogTitle>Delete this event?</AlertDialogTitle>
              <AlertDialogDescription>
                "{eventToDelete?.title}" will be removed from the calendar and from this
                board. This cannot be undone.
              </AlertDialogDescription>
            </AlertDialogHeader>
            <AlertDialogFooter>
              <AlertDialogCancel disabled={deleteLoading}>Cancel</AlertDialogCancel>
              <AlertDialogAction
                onClick={(e) => {
                  e.preventDefault();
                  executeDelete("single");
                }}
                disabled={deleteLoading}
                className="bg-destructive text-destructive-foreground hover:bg-destructive/90"
              >
                {deleteLoading ? "Deleting..." : "Delete"}
              </AlertDialogAction>
            </AlertDialogFooter>
          </AlertDialogContent>
        </AlertDialog>

        <RecurringEventActionDialog
          open={recurringDeleteDialogOpen}
          onOpenChange={(open) => {
            setRecurringDeleteDialogOpen(open);
            if (!open) setEventToDelete(null);
          }}
          onConfirm={executeDelete}
          actionType="delete"
          eventTitle={eventToDelete?.title || ""}
          loading={deleteLoading}
        />

        <RecurringEventActionDialog
          open={recurringRejectDialogOpen}
          onOpenChange={setRecurringRejectDialogOpen}
          onConfirm={handleRecurringRejectConfirm}
          actionType="reject"
          eventTitle={eventToReject?.title || ""}
          loading={rejectionLoading}
        />

        <ExportDialog
          open={isExportDialogOpen}
          onOpenChange={setIsExportDialogOpen}
          events={exportableEvents}
          organizationName={currentOrganization?.name || "Calendar"}
          organizationSlug={currentOrganization?.slug}
          timezone={currentOrganization?.timezone}
          userId={user?.id}
          isAdmin={isAdmin}
          dateRange={
            yearFilter === ALL_YEARS
              ? undefined
              : {
                  start: new Date(Number(yearFilter), 0, 1),
                  end: new Date(Number(yearFilter), 11, 31),
                }
          }
        />
      </div>
    </DashboardLayout>
  );
};

export default Admin;
