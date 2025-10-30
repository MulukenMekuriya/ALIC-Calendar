import { useState } from "react";
import { useQuery } from "@tanstack/react-query";
import { supabase } from "@/integrations/supabase/client";
import DashboardLayout from "@/components/layout/DashboardLayout";
import { Button } from "@/components/ui/button";
import { Plus } from "lucide-react";
import EventCalendar from "@/components/calendar/EventCalendar";
import EventDialog from "@/components/calendar/EventDialog";
import { useAuth } from "@/contexts/AuthContext";

const Dashboard = () => {
  const { user } = useAuth();
  const [isEventDialogOpen, setIsEventDialogOpen] = useState(false);
  const [selectedEventId, setSelectedEventId] = useState<string | null>(null);

  const { data: events, refetch } = useQuery({
    queryKey: ["events"],
    queryFn: async () => {
      const { data, error } = await supabase
        .from("events")
        .select(`
          *,
          rooms(id, name, color)
        `)
        .order("starts_at", { ascending: true });

      if (error) throw error;
      return data?.map(event => ({
        ...event,
        room: event.rooms,
        creator: { full_name: "User" }
      })) || [];
    },
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

  const handleEventClick = (eventId: string) => {
    setSelectedEventId(eventId);
    setIsEventDialogOpen(true);
  };

  const handleCreateEvent = () => {
    setSelectedEventId(null);
    setIsEventDialogOpen(true);
  };

  return (
    <DashboardLayout>
      <div className="space-y-6">
        <div className="flex justify-between items-center">
          <div>
            <h1 className="text-3xl font-bold">Event Calendar</h1>
            <p className="text-muted-foreground mt-1">
              Manage and schedule events across multiple rooms
            </p>
          </div>
          <Button onClick={handleCreateEvent} size="lg" className="gap-2">
            <Plus className="h-5 w-5" />
            Create Event
          </Button>
        </div>

        <EventCalendar
          events={events || []}
          rooms={rooms || []}
          onEventClick={handleEventClick}
        />

        <EventDialog
          open={isEventDialogOpen}
          onOpenChange={setIsEventDialogOpen}
          eventId={selectedEventId}
          onSuccess={() => {
            refetch();
            setIsEventDialogOpen(false);
          }}
        />
      </div>
    </DashboardLayout>
  );
};

export default Dashboard;
