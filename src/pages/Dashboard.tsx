import { useState } from "react";
import { useQuery } from "@tanstack/react-query";
import { supabase } from "@/integrations/supabase/client";
import DashboardLayout from "@/components/layout/DashboardLayout";
import { Button } from "@/components/ui/button";
import { Plus } from "lucide-react";
import DateBasedCalendar from "@/components/calendar/DateBasedCalendar";
import EventDialog from "@/components/calendar/EventDialog";
import { useAuth } from "@/contexts/AuthContext";
import { addWeeks, subWeeks } from "date-fns";
import { ChevronLeft, ChevronRight } from "lucide-react";

const Dashboard = () => {
  const { user } = useAuth();
  const [isEventDialogOpen, setIsEventDialogOpen] = useState(false);
  const [selectedEventId, setSelectedEventId] = useState<string | null>(null);
  const [currentWeek, setCurrentWeek] = useState(new Date());
  const [selectedDate, setSelectedDate] = useState<Date | null>(null);

  const { data: events, refetch } = useQuery({
    queryKey: ["events"],
    queryFn: async () => {
      const { data, error } = await supabase
        .from("events")
        .select(
          `
          *,
          rooms(id, name, color)
        `
        )
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
  });


  const handleEventClick = (eventId: string) => {
    setSelectedEventId(eventId);
    setSelectedDate(null);
    setIsEventDialogOpen(true);
  };

  const handleCreateEvent = () => {
    setSelectedEventId(null);
    setSelectedDate(null);
    setIsEventDialogOpen(true);
  };

  const handleDateClick = (date: Date) => {
    setSelectedEventId(null);
    setSelectedDate(date);
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
          <div className="flex items-center gap-3">
            <div className="flex items-center gap-2">
              <Button
                variant="outline"
                size="icon"
                onClick={() => setCurrentWeek(subWeeks(currentWeek, 1))}
              >
                <ChevronLeft className="h-4 w-4" />
              </Button>
              <Button
                variant="outline"
                onClick={() => setCurrentWeek(new Date())}
              >
                Today
              </Button>
              <Button
                variant="outline"
                size="icon"
                onClick={() => setCurrentWeek(addWeeks(currentWeek, 1))}
              >
                <ChevronRight className="h-4 w-4" />
              </Button>
            </div>
            <Button onClick={handleCreateEvent} size="lg" className="gap-2">
              <Plus className="h-5 w-5" />
              Create Event
            </Button>
          </div>
        </div>

        <DateBasedCalendar
          events={events || []}
          currentWeek={currentWeek}
          onEventClick={handleEventClick}
          onDateClick={handleDateClick}
        />

        <EventDialog
          open={isEventDialogOpen}
          onOpenChange={setIsEventDialogOpen}
          eventId={selectedEventId}
          initialDate={selectedDate}
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
