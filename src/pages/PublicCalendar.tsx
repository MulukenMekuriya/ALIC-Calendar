import { useState } from "react";
import { useQuery } from "@tanstack/react-query";
import { useNavigate, useParams } from "react-router-dom";
import { supabase } from "@/integrations/supabase/client";
import GoogleCalendarView from "@/components/calendar/GoogleCalendarView";
import CalendarViewSwitcher, { CalendarView } from "@/components/calendar/CalendarViewSwitcher";
import {
  Calendar,
  Church,
  MapPin,
  Phone,
  Mail,
  Globe,
  Download,
  ChevronLeft,
  ChevronRight,
  LogIn,
  Building2,
} from "lucide-react";
import {
  Card,
  CardContent,
  CardDescription,
  CardHeader,
  CardTitle,
} from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import {
  Dialog,
  DialogContent,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog";
import {
  format,
  parseISO,
  addWeeks,
  subWeeks,
  startOfWeek,
  endOfWeek,
  addDays,
  addMonths,
  subMonths,
} from "date-fns";
import { useToast } from "@/hooks/use-toast";
import { PageLoader } from "@/components/ui/loading";

const PublicCalendar = () => {
  const navigate = useNavigate();
  const { slug } = useParams<{ slug?: string }>();
  const { toast } = useToast();
  const [currentWeek, setCurrentWeek] = useState(new Date());
  const [selectedEvent, setSelectedEvent] = useState<any>(null);
  const [calendarView, setCalendarView] = useState<CalendarView>("week");
  const [selectedDate, setSelectedDate] = useState(new Date());
  const weekStart = startOfWeek(currentWeek, { weekStartsOn: 0 });
  const weekEnd = endOfWeek(currentWeek, { weekStartsOn: 0 });

  // Fetch organization by slug or get the default one
  const { data: organization, isLoading: orgLoading, error: orgError } = useQuery({
    queryKey: ["public-organization", slug],
    queryFn: async () => {
      let query = supabase
        .from("organizations")
        .select("*")
        .eq("is_active", true);

      if (slug) {
        query = query.eq("slug", slug);
      }

      const { data, error } = await query.limit(1).single();

      if (error) throw error;
      return data;
    },
  });

  const { data: events } = useQuery({
    queryKey: ["public-events", organization?.id, weekStart.toISOString()],
    queryFn: async () => {
      if (!organization?.id) return [];

      const { data, error } = await supabase
        .from("events")
        .select(
          `
          *,
          rooms(id, name, color)
        `
        )
        .eq("organization_id", organization.id)
        .eq("status", "published")
        .gte("starts_at", weekStart.toISOString())
        .lte("starts_at", weekEnd.toISOString())
        .order("starts_at", { ascending: true });

      if (error) throw error;
      return (
        data?.map((event) => ({
          ...event,
          room: event.rooms,
          creator: { full_name: "User" },
        })) || []
      );
    },
    enabled: !!organization?.id,
  });

  const handleEventClick = (eventId: string) => {
    const event = events?.find((e) => e.id === eventId);
    if (event) setSelectedEvent(event);
  };

  const handleDateClick = (date: Date) => {
    // If in month view, switch to day view for the clicked date
    if (calendarView === "month") {
      setSelectedDate(date);
      setCurrentWeek(date);
      setCalendarView("day");
    }
  };

  // Helper function to escape special characters in iCalendar format
  const escapeICalText = (text: string): string => {
    if (!text) return "";
    return text
      .replace(/\\/g, "\\\\")  // Backslash
      .replace(/;/g, "\\;")    // Semicolon
      .replace(/,/g, "\\,")    // Comma
      .replace(/\n/g, "\\n")   // Newline
      .replace(/\r/g, "");     // Remove carriage return
  };

  const exportToICS = () => {
    try {
      if (!events || events.length === 0) {
        toast({
          title: "No events to export",
          description: "There are no events available for export.",
          variant: "destructive",
        });
        return;
      }

      const orgTimezone = organization?.timezone || "America/New_York";
      const orgName = organization?.name || "Church Events";

      let icsContent = [
        "BEGIN:VCALENDAR",
        "VERSION:2.0",
        `PRODID:-//${orgName}//Events Calendar//EN`,
        "CALSCALE:GREGORIAN",
        "METHOD:PUBLISH",
        `X-WR-CALNAME:${orgName} Events`,
        `X-WR-TIMEZONE:${orgTimezone}`,
        // Add VTIMEZONE component for proper timezone handling
        "BEGIN:VTIMEZONE",
        `TZID:${orgTimezone}`,
        "BEGIN:DAYLIGHT",
        "TZOFFSETFROM:-0500",
        "TZOFFSETTO:-0400",
        "TZNAME:EDT",
        "DTSTART:19700308T020000",
        "RRULE:FREQ=YEARLY;BYMONTH=3;BYDAY=2SU",
        "END:DAYLIGHT",
        "BEGIN:STANDARD",
        "TZOFFSETFROM:-0400",
        "TZOFFSETTO:-0500",
        "TZNAME:EST",
        "DTSTART:19701101T020000",
        "RRULE:FREQ=YEARLY;BYMONTH=11;BYDAY=1SU",
        "END:STANDARD",
        "END:VTIMEZONE",
      ];

      events.forEach((event: any) => {
        const start = parseISO(event.starts_at);
        const end = parseISO(event.ends_at);

        icsContent.push(
          "BEGIN:VEVENT",
          `UID:${event.id}@${organization?.slug || "calendar"}.events`,
          `DTSTAMP:${format(new Date(), "yyyyMMdd'T'HHmmss'Z'")}`,
          `DTSTART;TZID=${orgTimezone}:${format(start, "yyyyMMdd'T'HHmmss")}`,
          `DTEND;TZID=${orgTimezone}:${format(end, "yyyyMMdd'T'HHmmss")}`,
          `SUMMARY:${escapeICalText(event.title)}`,
          `DESCRIPTION:${escapeICalText(event.description || "")}`,
          `LOCATION:${escapeICalText(event.room?.name || "")}`,
          "STATUS:CONFIRMED",
          "END:VEVENT"
        );
      });

      icsContent.push("END:VCALENDAR");

      const blob = new Blob([icsContent.join("\r\n")], { type: "text/calendar;charset=utf-8" });
      const url = URL.createObjectURL(blob);
      const link = document.createElement("a");
      link.href = url;
      link.download = `${organization?.slug || "events"}-${format(currentWeek, "yyyy-MM-dd")}.ics`;
      document.body.appendChild(link);
      link.click();
      document.body.removeChild(link);
      URL.revokeObjectURL(url);

      toast({
        title: "Calendar exported successfully",
        description: `Exported ${events.length} event${events.length !== 1 ? 's' : ''} to iCalendar format.`,
      });
    } catch (error) {
      console.error("Error exporting calendar:", error);
      toast({
        title: "Export failed",
        description: error instanceof Error ? error.message : "An error occurred while exporting the calendar.",
        variant: "destructive",
      });
    }
  };

  if (orgLoading) {
    return <PageLoader message="Loading calendar..." />;
  }

  if (orgError || !organization) {
    return (
      <div className="min-h-screen bg-gradient-to-br from-slate-50 via-blue-50 to-indigo-50 dark:from-slate-950 dark:via-slate-900 dark:to-slate-950 flex items-center justify-center">
        <Card className="max-w-md">
          <CardHeader>
            <CardTitle className="flex items-center gap-2">
              <Building2 className="h-5 w-5 text-red-500" />
              Organization Not Found
            </CardTitle>
          </CardHeader>
          <CardContent>
            <p className="text-muted-foreground mb-4">
              The organization you're looking for doesn't exist or is not active.
            </p>
            <Button onClick={() => navigate("/auth")}>
              Sign In
            </Button>
          </CardContent>
        </Card>
      </div>
    );
  }

  return (
    <div className="min-h-screen bg-gradient-to-br from-slate-50 via-blue-50 to-indigo-50 dark:from-slate-950 dark:via-slate-900 dark:to-slate-950">
      {/* Hero Header */}
      <header className="bg-gradient-to-r from-blue-600 to-indigo-700 text-white shadow-lg">
        <div className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8 py-8">
          <div className="flex flex-col md:flex-row items-center justify-between gap-4">
            <div className="flex items-center gap-4">
              <div className="bg-white/20 backdrop-blur-sm p-2 rounded-xl">
                {organization.logo_url ? (
                  <img
                    src={organization.logo_url}
                    alt={`${organization.name} Logo`}
                    className="h-16 w-16 object-contain"
                  />
                ) : (
                  <Church className="h-16 w-16 text-white" />
                )}
              </div>
              <div>
                <h1 className="text-3xl md:text-4xl font-bold">
                  {organization.name}
                </h1>
                <p className="text-blue-100 mt-1">
                  {organization.city && organization.state
                    ? `${organization.city}, ${organization.state}`
                    : organization.city || organization.state || ""}
                </p>
              </div>
            </div>
            <div className="flex items-center gap-3">
              <Button
                variant="secondary"
                onClick={exportToICS}
                className="gap-2"
              >
                <Download className="h-4 w-4" />
                Export Calendar
              </Button>
              <Button
                variant="outline"
                onClick={() => navigate("/auth")}
                className="gap-2 bg-white/10 hover:bg-white/20 text-white border-white/30"
              >
                <LogIn className="h-4 w-4" />
                Sign In
              </Button>
            </div>
          </div>
        </div>
      </header>

      {/* Church Info Section */}
      <section className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8 py-8">
        <div className="grid grid-cols-1 md:grid-cols-3 gap-6">
          {organization.address && (
            <Card className="border-2 hover:shadow-lg transition-shadow">
              <CardHeader>
                <CardTitle className="flex items-center gap-2">
                  <MapPin className="h-5 w-5 text-blue-600" />
                  Location
                </CardTitle>
              </CardHeader>
              <CardContent>
                <p className="text-sm text-muted-foreground">{organization.address}</p>
                {(organization.city || organization.state) && (
                  <p className="text-sm text-muted-foreground mt-1">
                    {[organization.city, organization.state].filter(Boolean).join(", ")}
                    {organization.country && organization.country !== "United States" && `, ${organization.country}`}
                  </p>
                )}
              </CardContent>
            </Card>
          )}

          {(organization.contact_email || organization.contact_phone) && (
            <Card className="border-2 hover:shadow-lg transition-shadow">
              <CardHeader>
                <CardTitle className="flex items-center gap-2">
                  <Phone className="h-5 w-5 text-green-600" />
                  Contact
                </CardTitle>
              </CardHeader>
              <CardContent>
                <div className="space-y-2 text-sm">
                  {organization.contact_email && (
                    <div className="flex items-center gap-2">
                      <Mail className="h-4 w-4 text-muted-foreground" />
                      <a href={`mailto:${organization.contact_email}`} className="hover:underline">
                        {organization.contact_email}
                      </a>
                    </div>
                  )}
                  {organization.contact_phone && (
                    <div className="flex items-center gap-2">
                      <Phone className="h-4 w-4 text-muted-foreground" />
                      <a href={`tel:${organization.contact_phone}`} className="hover:underline">
                        {organization.contact_phone}
                      </a>
                    </div>
                  )}
                </div>
              </CardContent>
            </Card>
          )}

          {organization.website && (
            <Card className="border-2 hover:shadow-lg transition-shadow">
              <CardHeader>
                <CardTitle className="flex items-center gap-2">
                  <Globe className="h-5 w-5 text-purple-600" />
                  Visit Website
                </CardTitle>
              </CardHeader>
              <CardContent>
                <a
                  href={organization.website}
                  target="_blank"
                  rel="noopener noreferrer"
                  className="text-sm text-blue-600 hover:underline"
                >
                  {organization.website.replace(/^https?:\/\//, "")}
                </a>
              </CardContent>
            </Card>
          )}
        </div>
      </section>

      {/* Calendar Section */}
      <main className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8 pb-12">
        <Card className="border-2 shadow-xl">
          <CardHeader>
            <div className="flex flex-col sm:flex-row items-start sm:items-center justify-between gap-4">
              <div>
                <CardTitle className="text-2xl flex items-center gap-2">
                  <Calendar className="h-6 w-6 text-blue-600" />
                  Events Calendar
                </CardTitle>
                <CardDescription className="mt-2">
                  View all published events and activities
                </CardDescription>
              </div>
              <div className="flex flex-col sm:flex-row items-start sm:items-center gap-3">
                <CalendarViewSwitcher
                  currentView={calendarView}
                  onViewChange={(view) => {
                    setCalendarView(view);
                    if (view === "day") {
                      setSelectedDate(currentWeek);
                    }
                  }}
                />
                <div className="flex items-center gap-2">
                  <Button
                    variant="outline"
                    size="icon"
                    onClick={() => {
                      if (calendarView === "day") {
                        setSelectedDate(addDays(selectedDate, -1));
                      } else if (calendarView === "month") {
                        setCurrentWeek(subMonths(currentWeek, 1));
                      } else {
                        setCurrentWeek(subWeeks(currentWeek, 1));
                      }
                    }}
                  >
                    <ChevronLeft className="h-4 w-4" />
                  </Button>
                  <div className="px-4 py-2 bg-blue-50 dark:bg-blue-950 rounded-lg">
                    <span className="font-medium text-sm">
                      {calendarView === "day"
                        ? format(selectedDate, "EEEE, MMM d, yyyy")
                        : calendarView === "month"
                        ? format(currentWeek, "MMMM yyyy")
                        : `${format(weekStart, "MMM d")} - ${format(
                            weekEnd,
                            "MMM d, yyyy"
                          )}`}
                    </span>
                  </div>
                  <Button
                    variant="outline"
                    size="icon"
                    onClick={() => {
                      if (calendarView === "day") {
                        setSelectedDate(addDays(selectedDate, 1));
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
                      setSelectedDate(today);
                    }}
                  >
                    Today
                  </Button>
                </div>
              </div>
            </div>
          </CardHeader>
          <CardContent className="pt-6">
            {events && events.length === 0 ? (
              <div className="text-center py-12">
                <Calendar className="h-12 w-12 text-muted-foreground mx-auto mb-4" />
                <p className="text-muted-foreground">
                  No events scheduled for this week
                </p>
              </div>
            ) : (
              <GoogleCalendarView
                events={events || []}
                currentWeek={currentWeek}
                onEventClick={handleEventClick}
                onDateClick={handleDateClick}
                hideStatus={true}
                view={calendarView}
                selectedDate={selectedDate}
                startHour={0}
                endHour={23}
                scrollToHour={9}
                visibleHours={5}
                readOnly={true}
              />
            )}
          </CardContent>
        </Card>

        {/* Upcoming Events List */}
        <Card className="mt-6 border-2">
          <CardHeader>
            <CardTitle>Upcoming Events</CardTitle>
            <CardDescription>Quick view of scheduled events</CardDescription>
          </CardHeader>
          <CardContent>
            <div className="space-y-3">
              {events && events.length > 0 ? (
                events.slice(0, 5).map((event: any) => (
                  <div
                    key={event.id}
                    className="flex items-center justify-between p-3 rounded-lg border hover:bg-accent cursor-pointer transition-colors"
                    onClick={() => setSelectedEvent(event)}
                  >
                    <div className="flex items-center gap-3">
                      <div
                        className="w-3 h-3 rounded-full"
                        style={{ backgroundColor: event.room?.color }}
                      />
                      <div>
                        <p className="font-medium">{event.title}</p>
                        <p className="text-sm text-muted-foreground">
                          {format(
                            parseISO(event.starts_at),
                            "EEEE, MMMM d 'at' h:mm a"
                          )}
                        </p>
                      </div>
                    </div>
                    <Badge variant="secondary">{event.room?.name}</Badge>
                  </div>
                ))
              ) : (
                <p className="text-center text-muted-foreground py-4">
                  No upcoming events
                </p>
              )}
            </div>
          </CardContent>
        </Card>
      </main>

      {/* Event Details Dialog */}
      <Dialog
        open={!!selectedEvent}
        onOpenChange={() => setSelectedEvent(null)}
      >
        <DialogContent>
          <DialogHeader>
            <DialogTitle>{selectedEvent?.title}</DialogTitle>
          </DialogHeader>
          <div className="space-y-4">
            <div>
              <p className="text-sm font-medium text-muted-foreground">
                Date & Time
              </p>
              <p className="text-base">
                {selectedEvent &&
                  format(
                    parseISO(selectedEvent.starts_at),
                    "EEEE, MMMM d, yyyy"
                  )}
              </p>
              <p className="text-sm text-muted-foreground">
                {selectedEvent &&
                  format(parseISO(selectedEvent.starts_at), "h:mm a")}{" "}
                -{" "}
                {selectedEvent &&
                  format(parseISO(selectedEvent.ends_at), "h:mm a")}
              </p>
            </div>
            {selectedEvent?.description && (
              <div>
                <p className="text-sm font-medium text-muted-foreground">
                  Description
                </p>
                <p className="text-base">{selectedEvent.description}</p>
              </div>
            )}
            <div>
              <p className="text-sm font-medium text-muted-foreground">Room</p>
              <Badge variant="secondary">{selectedEvent?.room?.name}</Badge>
            </div>
          </div>
        </DialogContent>
      </Dialog>

      {/* Footer */}
      <footer className="bg-slate-900 text-white mt-12">
        <div className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8 py-8">
          <div className="text-center">
            <div className="flex justify-center mb-4">
              {organization.logo_url ? (
                <img
                  src={organization.logo_url}
                  alt={`${organization.name} Logo`}
                  className="h-12 w-12 object-contain"
                />
              ) : (
                <Church className="h-12 w-12 text-slate-400" />
              )}
            </div>
            <p className="text-sm text-slate-400">
              © {new Date().getFullYear()} {organization.name}. All rights reserved.
            </p>
            {organization.website && (
              <div className="mt-4 flex items-center justify-center gap-4">
                <a
                  href={organization.website}
                  target="_blank"
                  rel="noopener noreferrer"
                  className="text-sm text-slate-400 hover:text-white transition-colors"
                >
                  Website
                </a>
                {organization.contact_email && (
                  <>
                    <span className="text-slate-600">•</span>
                    <a
                      href={`mailto:${organization.contact_email}`}
                      className="text-sm text-slate-400 hover:text-white transition-colors"
                    >
                      Contact
                    </a>
                  </>
                )}
              </div>
            )}
          </div>
        </div>
      </footer>
    </div>
  );
};

export default PublicCalendar;
