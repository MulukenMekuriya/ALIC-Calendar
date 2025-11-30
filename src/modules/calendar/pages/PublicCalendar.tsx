import { useState, useEffect } from "react";
import { useQuery } from "@tanstack/react-query";
import { useNavigate, useParams } from "react-router-dom";
import { supabase } from "@/integrations/supabase/client";
import GoogleCalendarView from "@/modules/calendar/components/GoogleCalendarView";
import CalendarViewSwitcher, { CalendarView } from "@/modules/calendar/components/CalendarViewSwitcher";
import ExportDialog from "@/modules/calendar/components/ExportDialog";
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
} from "@/shared/components/ui/card";
import { Button } from "@/shared/components/ui/button";
import { Badge } from "@/shared/components/ui/badge";
import {
  Dialog,
  DialogContent,
  DialogHeader,
  DialogTitle,
} from "@/shared/components/ui/dialog";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/shared/components/ui/select";
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
  startOfMonth,
  endOfMonth,
  startOfDay,
  endOfDay,
} from "date-fns";
import { PageLoader } from "@/shared/components/ui/loading";

const PublicCalendar = () => {
  const navigate = useNavigate();
  const { slug } = useParams<{ slug?: string }>();
  const [currentWeek, setCurrentWeek] = useState(new Date());
  const [selectedEvent, setSelectedEvent] = useState<any>(null);
  const [calendarView, setCalendarView] = useState<CalendarView>("week");
  const [selectedDate, setSelectedDate] = useState(new Date());
  const [selectedOrgId, setSelectedOrgId] = useState<string | null>(null);
  const [isExportDialogOpen, setIsExportDialogOpen] = useState(false);
  const weekStart = startOfWeek(currentWeek, { weekStartsOn: 0 });
  const weekEnd = endOfWeek(currentWeek, { weekStartsOn: 0 });

  // Calculate date range based on current view
  const getDateRange = () => {
    if (calendarView === "day") {
      return {
        start: startOfDay(selectedDate),
        end: endOfDay(selectedDate),
      };
    } else if (calendarView === "month") {
      const monthStart = startOfMonth(currentWeek);
      const monthEnd = endOfMonth(currentWeek);
      // Include days from previous/next month that appear in the calendar grid
      return {
        start: startOfWeek(monthStart, { weekStartsOn: 0 }),
        end: endOfWeek(monthEnd, { weekStartsOn: 0 }),
      };
    } else {
      // week view
      return {
        start: weekStart,
        end: weekEnd,
      };
    }
  };

  const dateRange = getDateRange();

  // Fetch all active organizations (branches)
  const { data: allOrganizations } = useQuery({
    queryKey: ["public-organizations"],
    queryFn: async () => {
      const { data, error } = await supabase
        .from("organizations")
        .select("id, name, slug, city, state, logo_url")
        .eq("is_active", true)
        .order("name", { ascending: true });

      if (error) throw error;
      return data || [];
    },
  });

  // Fetch organization by slug or get the default one
  const { data: organization, isLoading: orgLoading, error: orgError } = useQuery({
    queryKey: ["public-organization", slug, selectedOrgId],
    queryFn: async () => {
      let query = supabase
        .from("organizations")
        .select("*")
        .eq("is_active", true);

      if (selectedOrgId) {
        query = query.eq("id", selectedOrgId);
      } else if (slug) {
        query = query.eq("slug", slug);
      }

      const { data, error } = await query.limit(1).single();

      if (error) throw error;
      return data;
    },
  });

  // Set initial selected org when organization loads
  useEffect(() => {
    if (organization?.id && !selectedOrgId) {
      setSelectedOrgId(organization.id);
    }
  }, [organization?.id, selectedOrgId]);

  const { data: events } = useQuery({
    queryKey: ["public-events", organization?.id, calendarView, dateRange.start.toISOString(), dateRange.end.toISOString()],
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
        .gte("starts_at", dateRange.start.toISOString())
        .lte("starts_at", dateRange.end.toISOString())
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
            <div className="flex flex-col sm:flex-row items-center gap-3">
              {/* Branch Selector */}
              {allOrganizations && allOrganizations.length > 1 && (
                <Select
                  value={selectedOrgId || organization?.id || ""}
                  onValueChange={(value) => {
                    setSelectedOrgId(value);
                    const selectedOrg = allOrganizations.find(org => org.id === value);
                    if (selectedOrg) {
                      navigate(`/public/${selectedOrg.slug}`);
                    }
                  }}
                >
                  <SelectTrigger className="w-[220px] bg-white/10 border-white/30 text-white hover:bg-white/20">
                    <Building2 className="h-4 w-4 mr-2" />
                    <SelectValue placeholder="Select Branch" />
                  </SelectTrigger>
                  <SelectContent>
                    {allOrganizations.map((org) => (
                      <SelectItem key={org.id} value={org.id}>
                        <div className="flex items-center gap-2">
                          <span>{org.name}</span>
                          {org.city && org.state && (
                            <span className="text-xs text-muted-foreground">
                              ({org.city}, {org.state})
                            </span>
                          )}
                        </div>
                      </SelectItem>
                    ))}
                  </SelectContent>
                </Select>
              )}
              <Button
                variant="secondary"
                onClick={() => setIsExportDialogOpen(true)}
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

      {/* Export Dialog */}
      <ExportDialog
        open={isExportDialogOpen}
        onOpenChange={setIsExportDialogOpen}
        events={events || []}
        organizationName={organization.name}
        organizationSlug={organization.slug}
        timezone={organization.timezone}
        isAdmin={false}
        dateRange={{
          start: dateRange.start,
          end: dateRange.end,
        }}
      />
    </div>
  );
};

export default PublicCalendar;
