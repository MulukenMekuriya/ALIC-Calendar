import { useState } from "react";
import { useQuery } from "@tanstack/react-query";
import { supabase } from "@/integrations/supabase/client";
import DashboardLayout from "@/components/layout/DashboardLayout";
import { Button } from "@/components/ui/button";
import { Plus } from "lucide-react";
import GoogleCalendarView from "@/components/calendar/GoogleCalendarView";
import CalendarViewSwitcher, { CalendarView } from "@/components/calendar/CalendarViewSwitcher";
import EventDialog from "@/components/calendar/EventDialog";
import { useAuth } from "@/contexts/AuthContext";
import { useOrganization } from "@/contexts/OrganizationContext";
import { addWeeks, subWeeks, addDays, addMonths, subMonths, format } from "date-fns";
import { ChevronLeft, ChevronRight } from "lucide-react";

const Dashboard = () => {
  const { user } = useAuth();
  const { currentOrganization } = useOrganization();
  const [isEventDialogOpen, setIsEventDialogOpen] = useState(false);
  const [selectedEventId, setSelectedEventId] = useState<string | null>(null);
  const [currentWeek, setCurrentWeek] = useState(new Date());
  const [selectedDate, setSelectedDate] = useState<Date | null>(null);
  const [calendarView, setCalendarView] = useState<CalendarView>("week");
  const [dayViewDate, setDayViewDate] = useState(new Date());

  const { data: events, refetch } = useQuery({
    queryKey: ["events", currentOrganization?.id],
    queryFn: async () => {
      if (!currentOrganization?.id) return [];

      const { data, error } = await supabase
        .from("events")
        .select(
          `
          *,
          rooms(id, name, color)
        `
        )
        .eq("organization_id", currentOrganization.id)
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
    // If in month view, switch to day view for the clicked date
    if (calendarView === "month") {
      setDayViewDate(date);
      setCurrentWeek(date);
      setCalendarView("day");
    } else {
      // For week and day views, open event dialog
      setSelectedEventId(null);
      setSelectedDate(date);
      setIsEventDialogOpen(true);
    }
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

        <div className="flex justify-between items-center">
          <CalendarViewSwitcher
            currentView={calendarView}
            onViewChange={(view) => {
              setCalendarView(view);
              if (view === "day") {
                setDayViewDate(currentWeek);
              }
            }}
          />
          <div className="flex items-center gap-2">
            <Button
              variant="outline"
              size="icon"
              onClick={() => {
                if (calendarView === "day") {
                  setDayViewDate(addDays(dayViewDate, -1));
                } else if (calendarView === "month") {
                  setCurrentWeek(subMonths(currentWeek, 1));
                } else {
                  setCurrentWeek(subWeeks(currentWeek, 1));
                }
              }}
            >
              <ChevronLeft className="h-4 w-4" />
            </Button>
            <div className="px-4 py-2 bg-muted rounded-lg min-w-[200px] text-center">
              <span className="font-medium text-sm">
                {calendarView === "day"
                  ? format(dayViewDate, "EEEE, MMM d, yyyy")
                  : calendarView === "month"
                  ? format(currentWeek, "MMMM yyyy")
                  : format(currentWeek, "MMM d, yyyy")}
              </span>
            </div>
            <Button
              variant="outline"
              size="icon"
              onClick={() => {
                if (calendarView === "day") {
                  setDayViewDate(addDays(dayViewDate, 1));
                } else if (calendarView === "month") {
                  setCurrentWeek(addMonths(currentWeek, 1));
                } else {
                  setCurrentWeek(addWeeks(currentWeek, 1));
                }
              }}
            >
              <ChevronRight className="h-4 w-4" />
            </Button>
            <Button
              variant="outline"
              onClick={() => {
                const today = new Date();
                setCurrentWeek(today);
                setDayViewDate(today);
              }}
            >
              Today
            </Button>
          </div>
        </div>

        <div>
          <GoogleCalendarView
            events={events || []}
            currentWeek={currentWeek}
            onEventClick={handleEventClick}
            onDateClick={handleDateClick}
            currentUserId={user?.id}
            view={calendarView}
            selectedDate={dayViewDate}
            startHour={0}
            endHour={23}
            scrollToHour={9}
            visibleHours={10}
          />
        </div>

        <EventDialog
          open={isEventDialogOpen}
          onOpenChange={setIsEventDialogOpen}
          eventId={selectedEventId}
          initialDate={selectedDate}
          onSuccess={() => {
            refetch();
            setIsEventDialogOpen(false);
          }}
          allEvents={events || []}
          onEventSelect={(eventId) => {
            setSelectedEventId(eventId);
            setSelectedDate(null);
          }}
        />
      </div>
    </DashboardLayout>
  );
};

export default Dashboard;
