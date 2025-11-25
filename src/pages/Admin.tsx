import { useState } from "react";
import { useQuery } from "@tanstack/react-query";
import { supabase } from "@/integrations/supabase/client";
import DashboardLayout from "@/components/layout/DashboardLayout";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
import { Check, X, Eye, User } from "lucide-react";
import { useToast } from "@/hooks/use-toast";
import EventDialog from "@/components/calendar/EventDialog";
import { formatDistance, format } from "date-fns";
import { useOrganization } from "@/contexts/OrganizationContext";

const Admin = () => {
  const { toast } = useToast();
  const { currentOrganization } = useOrganization();
  const [selectedEventId, setSelectedEventId] = useState<string | null>(null);
  const [isEventDialogOpen, setIsEventDialogOpen] = useState(false);

  const { data: pendingEvents, refetch: refetchPending } = useQuery({
    queryKey: ["pending-events", currentOrganization?.id],
    queryFn: async () => {
      if (!currentOrganization?.id) return [];

      const { data, error } = await supabase
        .from("events")
        .select(`
          *,
          rooms(name, color)
        `)
        .eq("organization_id", currentOrganization.id)
        .eq("status", "pending_review")
        .order("created_at", { ascending: false });

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
    queryKey: ["approved-events", currentOrganization?.id],
    queryFn: async () => {
      if (!currentOrganization?.id) return [];

      const { data, error } = await supabase
        .from("events")
        .select(`
          *,
          rooms(name, color)
        `)
        .eq("organization_id", currentOrganization.id)
        .eq("status", "approved")
        .order("starts_at", { ascending: true });

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
    queryKey: ["published-events", currentOrganization?.id],
    queryFn: async () => {
      if (!currentOrganization?.id) return [];

      const { data, error } = await supabase
        .from("events")
        .select(`
          *,
          rooms(name, color)
        `)
        .eq("organization_id", currentOrganization.id)
        .eq("status", "published")
        .order("starts_at", { ascending: true });

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
    queryKey: ["rejected-events", currentOrganization?.id],
    queryFn: async () => {
      if (!currentOrganization?.id) return [];

      const { data, error } = await supabase
        .from("events")
        .select(`
          *,
          rooms(name, color)
        `)
        .eq("organization_id", currentOrganization.id)
        .eq("status", "rejected")
        .order("created_at", { ascending: false });

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

  const handleStatusChange = async (eventId: string, status: "approved" | "rejected" | "published" | "pending_review", isUnpublishing?: boolean) => {
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
      <div className="space-y-6">
        <div>
          <h1 className="text-3xl font-bold">Admin Panel</h1>
          <p className="text-muted-foreground mt-1">Review and manage event submissions</p>
        </div>

        <Tabs defaultValue="pending" className="space-y-4">
          <TabsList>
            <TabsTrigger value="pending">
              Pending Review ({pendingEvents?.length || 0})
            </TabsTrigger>
            <TabsTrigger value="approved">
              Approved ({approvedEvents?.length || 0})
            </TabsTrigger>
            <TabsTrigger value="published">
              Published ({publishedEvents?.length || 0})
            </TabsTrigger>
            <TabsTrigger value="rejected">
              Rejected ({rejectedEvents?.length || 0})
            </TabsTrigger>
          </TabsList>

          <TabsContent value="pending" className="space-y-4">
            {pendingEvents && pendingEvents.length === 0 ? (
              <Card>
                <CardContent className="py-8">
                  <p className="text-center text-muted-foreground">No events pending review</p>
                </CardContent>
              </Card>
            ) : (
              pendingEvents?.map((event) => (
                <Card key={event.id}>
                  <CardHeader>
                    <div className="flex items-start justify-between">
                      <div className="flex-1">
                        <CardTitle className="text-xl">{event.title}</CardTitle>
                        <CardDescription className="mt-2">
                          <div className="flex items-center gap-2 flex-wrap">
                            <Badge variant="secondary" className={statusColors[event.status]}>
                              {event.status.replace("_", " ")}
                            </Badge>
                            <span className="text-sm">
                              {event.room?.name} • {format(new Date(event.starts_at), "MMM d, yyyy h:mm a")} - {format(new Date(event.ends_at), "h:mm a")}
                            </span>
                          </div>
                          {event.description && (
                            <p className="mt-2 text-sm">{event.description}</p>
                          )}
                          <div className="flex items-center gap-4 mt-2 text-xs">
                            {event.creator && (
                              <div className="flex flex-col gap-0.5 text-muted-foreground">
                                <div className="flex items-center gap-1">
                                  <User className="h-3 w-3" />
                                  <span>Requested by: <span className="font-medium text-foreground">{event.creator.full_name}</span></span>
                                </div>
                                {event.creator.ministry_name && (
                                  <span className="text-xs ml-4">{event.creator.ministry_name}</span>
                                )}
                              </div>
                            )}
                            <span className="text-muted-foreground">
                              Submitted {formatDistance(new Date(event.created_at), new Date(), { addSuffix: true })}
                            </span>
                          </div>
                        </CardDescription>
                      </div>
                    </div>
                  </CardHeader>
                  <CardContent>
                    <div className="flex gap-2">
                      <Button
                        variant="default"
                        size="sm"
                        onClick={() => handleStatusChange(event.id, "approved")}
                      >
                        <Check className="h-4 w-4 mr-1" />
                        Approve
                      </Button>
                      <Button
                        variant="destructive"
                        size="sm"
                        onClick={() => handleStatusChange(event.id, "rejected")}
                      >
                        <X className="h-4 w-4 mr-1" />
                        Reject
                      </Button>
                      <Button variant="outline" size="sm" onClick={() => handleViewEvent(event.id)}>
                        <Eye className="h-4 w-4 mr-1" />
                        View Details
                      </Button>
                    </div>
                  </CardContent>
                </Card>
              ))
            )}
          </TabsContent>

          <TabsContent value="approved" className="space-y-4">
            {approvedEvents && approvedEvents.length === 0 ? (
              <Card>
                <CardContent className="py-8">
                  <p className="text-center text-muted-foreground">No approved events</p>
                </CardContent>
              </Card>
            ) : (
              approvedEvents?.map((event) => (
                <Card key={event.id}>
                  <CardHeader>
                    <div className="flex items-start justify-between">
                      <div className="flex-1">
                        <CardTitle className="text-xl">{event.title}</CardTitle>
                        <CardDescription className="mt-2">
                          <div className="flex items-center gap-2 flex-wrap">
                            <Badge variant="secondary" className={statusColors[event.status]}>
                              {event.status.replace("_", " ")}
                            </Badge>
                            <span className="text-sm">
                              {event.room?.name} • {format(new Date(event.starts_at), "MMM d, yyyy h:mm a")} - {format(new Date(event.ends_at), "h:mm a")}
                            </span>
                          </div>
                          {event.description && (
                            <p className="mt-2 text-sm">{event.description}</p>
                          )}
                          {event.creator && (
                            <div className="flex flex-col gap-0.5 mt-2 text-xs text-muted-foreground">
                              <div className="flex items-center gap-1">
                                <User className="h-3 w-3" />
                                <span>Requested by: <span className="font-medium text-foreground">{event.creator.full_name}</span></span>
                              </div>
                              {event.creator.ministry_name && (
                                <span className="text-xs ml-4">{event.creator.ministry_name}</span>
                              )}
                            </div>
                          )}
                        </CardDescription>
                      </div>
                    </div>
                  </CardHeader>
                  <CardContent>
                    <div className="flex gap-2">
                      <Button
                        onClick={() => handleStatusChange(event.id, "published")}
                      >
                        Publish Event
                      </Button>
                      <Button
                        variant="secondary"
                        size="sm"
                        onClick={() => handleUnapprove(event.id)}
                      >
                        Unapprove
                      </Button>
                      <Button variant="outline" size="sm" onClick={() => handleViewEvent(event.id)}>
                        <Eye className="h-4 w-4 mr-1" />
                        View Details
                      </Button>
                    </div>
                  </CardContent>
                </Card>
              ))
            )}
          </TabsContent>

          <TabsContent value="published" className="space-y-4">
            {publishedEvents && publishedEvents.length === 0 ? (
              <Card>
                <CardContent className="py-8">
                  <p className="text-center text-muted-foreground">No published events</p>
                </CardContent>
              </Card>
            ) : (
              publishedEvents?.map((event) => (
                <Card key={event.id}>
                  <CardHeader>
                    <div className="flex items-start justify-between">
                      <div className="flex-1">
                        <CardTitle className="text-xl">{event.title}</CardTitle>
                        <CardDescription className="mt-2">
                          <div className="flex items-center gap-2 flex-wrap">
                            <Badge variant="secondary" className={statusColors[event.status]}>
                              {event.status.replace("_", " ")}
                            </Badge>
                            <span className="text-sm">
                              {event.room?.name} • {format(new Date(event.starts_at), "MMM d, yyyy h:mm a")} - {format(new Date(event.ends_at), "h:mm a")}
                            </span>
                          </div>
                          {event.description && (
                            <p className="mt-2 text-sm">{event.description}</p>
                          )}
                          {event.creator && (
                            <div className="flex flex-col gap-0.5 mt-2 text-xs text-muted-foreground">
                              <div className="flex items-center gap-1">
                                <User className="h-3 w-3" />
                                <span>Requested by: <span className="font-medium text-foreground">{event.creator.full_name}</span></span>
                              </div>
                              {event.creator.ministry_name && (
                                <span className="text-xs ml-4">{event.creator.ministry_name}</span>
                              )}
                            </div>
                          )}
                        </CardDescription>
                      </div>
                    </div>
                  </CardHeader>
                  <CardContent>
                    <div className="flex gap-2">
                      <Button
                        variant="outline"
                        onClick={() => handleStatusChange(event.id, "approved", true)}
                      >
                        Unpublish Event
                      </Button>
                      <Button
                        variant="secondary"
                        size="sm"
                        onClick={() => handleUnapprove(event.id)}
                      >
                        Unapprove
                      </Button>
                      <Button variant="outline" size="sm" onClick={() => handleViewEvent(event.id)}>
                        <Eye className="h-4 w-4 mr-1" />
                        View Details
                      </Button>
                    </div>
                  </CardContent>
                </Card>
              ))
            )}
          </TabsContent>

          <TabsContent value="rejected" className="space-y-4">
            {rejectedEvents && rejectedEvents.length === 0 ? (
              <Card>
                <CardContent className="py-8">
                  <p className="text-center text-muted-foreground">No rejected events</p>
                </CardContent>
              </Card>
            ) : (
              rejectedEvents?.map((event) => (
                <Card key={event.id}>
                  <CardHeader>
                    <div className="flex items-start justify-between">
                      <div className="flex-1">
                        <CardTitle className="text-xl">{event.title}</CardTitle>
                        <CardDescription className="mt-2">
                          <div className="flex items-center gap-2 flex-wrap">
                            <Badge variant="secondary" className={statusColors[event.status]}>
                              {event.status.replace("_", " ")}
                            </Badge>
                            <span className="text-sm">
                              {event.room?.name} • {format(new Date(event.starts_at), "MMM d, yyyy h:mm a")} - {format(new Date(event.ends_at), "h:mm a")}
                            </span>
                          </div>
                          {event.description && (
                            <p className="mt-2 text-sm">{event.description}</p>
                          )}
                          <div className="flex items-center gap-4 mt-2 text-xs">
                            {event.creator && (
                              <div className="flex flex-col gap-0.5 text-muted-foreground">
                                <div className="flex items-center gap-1">
                                  <User className="h-3 w-3" />
                                  <span>Requested by: <span className="font-medium text-foreground">{event.creator.full_name}</span></span>
                                </div>
                                {event.creator.ministry_name && (
                                  <span className="text-xs ml-4">{event.creator.ministry_name}</span>
                                )}
                              </div>
                            )}
                            <span className="text-muted-foreground">
                              Submitted {formatDistance(new Date(event.created_at), new Date(), { addSuffix: true })}
                            </span>
                          </div>
                        </CardDescription>
                      </div>
                    </div>
                  </CardHeader>
                  <CardContent>
                    <div className="flex gap-2">
                      <Button
                        variant="default"
                        size="sm"
                        onClick={() => handleStatusChange(event.id, "pending_review")}
                      >
                        Move to Pending
                      </Button>
                      <Button variant="outline" size="sm" onClick={() => handleViewEvent(event.id)}>
                        <Eye className="h-4 w-4 mr-1" />
                        View Details
                      </Button>
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
      </div>
    </DashboardLayout>
  );
};

export default Admin;
