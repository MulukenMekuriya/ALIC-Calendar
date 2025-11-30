import { useState } from "react";
import DashboardLayout from "@/shared/components/layout/DashboardLayout";
import { Button } from "@/shared/components/ui/button";
import { Plus, ChevronLeft, ChevronRight, Download } from "lucide-react";
import { GoogleCalendarView, CalendarViewSwitcher, EventDialog, ExportDialog } from "../components";
import type { CalendarView } from "../components";
import { useEvents } from "../hooks";
import { useAuth } from "@/shared/contexts";
import { useOrganization } from "@/shared/contexts";
import { addWeeks, subWeeks, addDays, addMonths, subMonths, format, startOfWeek, endOfWeek, startOfMonth, endOfMonth } from "date-fns";

const Dashboard = () => {
  const { user, isAdmin } = useAuth();
  const { currentOrganization, isOrgAdmin } = useOrganization();
  const [isEventDialogOpen, setIsEventDialogOpen] = useState(false);
  const [isExportDialogOpen, setIsExportDialogOpen] = useState(false);
  const [selectedEventId, setSelectedEventId] = useState<string | null>(null);
  const [currentWeek, setCurrentWeek] = useState(new Date());
  const [selectedDate, setSelectedDate] = useState<Date | null>(null);
  const [calendarView, setCalendarView] = useState<CalendarView>("week");
  const [dayViewDate, setDayViewDate] = useState(new Date());

  const { data: events, refetch } = useEvents(currentOrganization?.id);

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
          <div className="flex items-center gap-2">
            <Button
              variant="outline"
              onClick={() => setIsExportDialogOpen(true)}
              className="gap-2"
            >
              <Download className="h-4 w-4" />
              Export
            </Button>
            <Button onClick={handleCreateEvent} size="lg" className="gap-2">
              <Plus className="h-5 w-5" />
              Create Event
            </Button>
          </div>
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

        <ExportDialog
          open={isExportDialogOpen}
          onOpenChange={setIsExportDialogOpen}
          events={events || []}
          organizationName={currentOrganization?.name || "Calendar"}
          organizationSlug={currentOrganization?.slug}
          timezone={currentOrganization?.timezone}
          userId={user?.id}
          isAdmin={isAdmin || isOrgAdmin}
          dateRange={
            calendarView === "month"
              ? {
                  start: startOfMonth(currentWeek),
                  end: endOfMonth(currentWeek),
                }
              : calendarView === "week"
              ? {
                  start: startOfWeek(currentWeek, { weekStartsOn: 0 }),
                  end: endOfWeek(currentWeek, { weekStartsOn: 0 }),
                }
              : undefined
          }
        />
      </div>
    </DashboardLayout>
  );
};

export default Dashboard;
