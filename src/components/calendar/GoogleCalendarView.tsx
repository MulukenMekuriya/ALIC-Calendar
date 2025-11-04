import { Card, CardContent } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import {
  format,
  startOfWeek,
  addDays,
  isSameDay,
  parseISO,
  startOfDay,
  endOfDay,
  isBefore,
  areIntervalsOverlapping,
  differenceInMinutes,
  setHours,
  setMinutes,
  addMinutes,
  getHours,
  getMinutes,
  startOfMonth,
  endOfMonth,
  eachDayOfInterval,
  isSameMonth,
} from "date-fns";
import { Clock, Plus } from "lucide-react";
import { cn } from "@/lib/utils";
import { useMemo } from "react";

interface Event {
  id: string;
  title: string;
  starts_at: string;
  ends_at: string;
  status: string;
  created_by: string;
  room: { id: string; name: string; color: string };
  creator: { full_name: string; ministry_name?: string } | null;
}

interface GoogleCalendarViewProps {
  events: Event[];
  currentWeek: Date;
  onEventClick: (eventId: string) => void;
  onDateClick?: (date: Date) => void;
  onTimeSlotClick?: (date: Date, hour: number) => void;
  hideStatus?: boolean;
  currentUserId?: string;
  startHour?: number; // Default: 9am
  endHour?: number; // Default: 9pm (21)
  view?: "week" | "day" | "month";
  selectedDate?: Date; // For day view
}

interface PositionedEvent extends Event {
  top: number;
  height: number;
  left: number;
  width: number;
  column: number;
  totalColumns: number;
}

const GoogleCalendarView = ({
  events,
  currentWeek,
  onEventClick,
  onDateClick,
  onTimeSlotClick,
  hideStatus = false,
  currentUserId,
  startHour = 9,
  endHour = 21,
  view = "week",
  selectedDate,
}: GoogleCalendarViewProps) => {
  const weekStart = startOfWeek(currentWeek, { weekStartsOn: 0 });
  const weekDays = view === "day" && selectedDate
    ? [selectedDate]
    : Array.from({ length: 7 }, (_, i) => addDays(weekStart, i));
  const today = new Date();

  const hours = Array.from(
    { length: endHour - startHour + 1 },
    (_, i) => startHour + i
  );
  const HOUR_HEIGHT = 60; // pixels per hour
  const MINUTE_HEIGHT = HOUR_HEIGHT / 60;

  const getEventsForDay = (day: Date) => {
    return events.filter((event) => {
      const eventDate = parseISO(event.starts_at);
      return isSameDay(eventDate, day);
    });
  };

  // Calculate event positions with overlapping support
  const getPositionedEvents = (dayEvents: Event[]): PositionedEvent[] => {
    if (dayEvents.length === 0) return [];

    // Sort by start time, then by duration (longer first)
    const sorted = [...dayEvents].sort((a, b) => {
      const aStart = parseISO(a.starts_at);
      const bStart = parseISO(b.starts_at);
      if (aStart.getTime() !== bStart.getTime()) {
        return aStart.getTime() - bStart.getTime();
      }
      const aDuration = differenceInMinutes(parseISO(a.ends_at), aStart);
      const bDuration = differenceInMinutes(parseISO(b.ends_at), bStart);
      return bDuration - aDuration;
    });

    const positioned: PositionedEvent[] = [];
    const columns: { start: Date; end: Date; events: PositionedEvent[] }[] = [];

    sorted.forEach((event) => {
      const eventStart = parseISO(event.starts_at);
      const eventEnd = parseISO(event.ends_at);

      // Calculate top position (minutes from start hour)
      const startMinutes =
        (getHours(eventStart) - startHour) * 60 + getMinutes(eventStart);
      const endMinutes =
        (getHours(eventEnd) - startHour) * 60 + getMinutes(eventEnd);
      const top = startMinutes * MINUTE_HEIGHT;
      const height = Math.max((endMinutes - startMinutes) * MINUTE_HEIGHT, 20);

      // Find which column this event should go in
      let columnIndex = columns.findIndex((col) =>
        col.events.every(
          (e) =>
            !areIntervalsOverlapping(
              { start: eventStart, end: eventEnd },
              { start: parseISO(e.starts_at), end: parseISO(e.ends_at) },
              { inclusive: false }
            )
        )
      );

      if (columnIndex === -1) {
        columnIndex = columns.length;
        columns.push({ start: eventStart, end: eventEnd, events: [] });
      }

      const positionedEvent: PositionedEvent = {
        ...event,
        top,
        height,
        left: 0,
        width: 100,
        column: columnIndex,
        totalColumns: columns.length,
      };

      columns[columnIndex].events.push(positionedEvent);
      positioned.push(positionedEvent);
    });

    // Calculate widths and left positions based on overlaps
    positioned.forEach((event) => {
      const eventStart = parseISO(event.starts_at);
      const eventEnd = parseISO(event.ends_at);

      // Find all columns that overlap with this event's time range
      const overlappingColumns = columns.filter((col) =>
        areIntervalsOverlapping(
          { start: eventStart, end: eventEnd },
          { start: col.start, end: col.end },
          { inclusive: true }
        )
      );

      const totalOverlapping = overlappingColumns.length;
      event.totalColumns = totalOverlapping;
      event.width = 100 / totalOverlapping;
      event.left = event.column * event.width;
    });

    return positioned;
  };

  const positionedEventsByDay = useMemo(() => {
    const map = new Map<string, PositionedEvent[]>();
    weekDays.forEach((day) => {
      const dayEvents = getEventsForDay(day);
      map.set(day.toISOString(), getPositionedEvents(dayEvents));
    });
    return map;
  }, [weekDays, events]);

  const isToday = (date: Date) => isSameDay(date, today);
  const isPast = (date: Date) => isBefore(endOfDay(date), startOfDay(today));

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

  const handleTimeSlotClick = (day: Date, hour: number) => {
    if (isPast(day)) return;

    const clickedDateTime = setMinutes(setHours(day, hour), 0);

    if (onTimeSlotClick) {
      onTimeSlotClick(day, hour);
    } else if (onDateClick) {
      onDateClick(clickedDateTime);
    }
  };

  if (view === "week" || view === "day") {
    return (
      <div className="space-y-2">
        {/* Time Grid */}
        <div className="border rounded-lg bg-background overflow-x-auto">
          <div className="relative">
            {/* Grid structure */}
            <div className="grid" style={{ gridTemplateColumns: `60px repeat(${weekDays.length}, 1fr)`, minWidth: view === "week" ? "800px" : "400px" }}>
              {/* Header Row */}
              <div className="sticky top-0 z-20 bg-background border-b border-r"></div>
              {weekDays.map((day) => {
                const isCurrentDay = isToday(day);
                const isPastDay = isPast(day);

                return (
                  <div
                    key={day.toString()}
                    className={cn(
                      "sticky top-0 z-20 bg-background border-b text-center py-3 px-2",
                      isCurrentDay && "bg-blue-50 dark:bg-blue-950"
                    )}
                  >
                    <div
                      className={cn(
                        "text-xs font-medium uppercase tracking-wide",
                        isCurrentDay
                          ? "text-blue-600"
                          : isPastDay
                          ? "text-muted-foreground"
                          : "text-foreground"
                      )}
                    >
                      {format(day, "EEE")}
                    </div>
                    <div
                      className={cn(
                        "text-2xl font-bold mt-1",
                        isCurrentDay
                          ? "text-blue-600"
                          : isPastDay
                          ? "text-muted-foreground"
                          : "text-foreground"
                      )}
                    >
                      {format(day, "d")}
                    </div>
                    {isCurrentDay && (
                      <Badge className="mt-1 text-xs bg-blue-600">Today</Badge>
                    )}
                  </div>
                );
              })}

              {/* Time Slots */}
              {hours.map((hour) => (
                <>
                  {/* Hour Label */}
                  <div
                    key={`label-${hour}`}
                    className="border-r border-b py-2 px-2 text-xs text-muted-foreground text-right"
                    style={{ height: `${HOUR_HEIGHT}px` }}
                  >
                    {format(setHours(new Date(), hour), "h a")}
                  </div>

                  {/* Day Columns */}
                  {weekDays.map((day, dayIndex) => {
                    const isCurrentDay = isToday(day);
                    const isPastDay = isPast(day);

                    return (
                      <div
                        key={`${day}-${hour}`}
                        className={cn(
                          "border-b relative group/timeslot",
                          isCurrentDay && "bg-blue-50/30 dark:bg-blue-950/30",
                          isPastDay && "bg-muted/20"
                        )}
                        style={{ height: `${HOUR_HEIGHT}px` }}
                        onClick={() => handleTimeSlotClick(day, hour)}
                      >
                        {/* Hover overlay for adding events */}
                        {!isPastDay && (
                          <div className="absolute inset-0 opacity-0 group-hover/timeslot:opacity-100 bg-blue-100/20 dark:bg-blue-900/20 cursor-pointer transition-opacity flex items-center justify-center z-0">
                            <Plus className="h-4 w-4 text-blue-600" />
                          </div>
                        )}

                        {/* Render events that start in this hour */}
                        {hour === startHour && (
                          <>
                            {positionedEventsByDay.get(day.toISOString())?.map((event) => {
                              const isOwnEvent =
                                currentUserId && event.created_by === currentUserId;
                              const isPendingFromOther =
                                event.status === "pending_review" && !isOwnEvent;

                              return (
                                <div
                                  key={event.id}
                                  className={cn(
                                    "absolute overflow-hidden rounded-md shadow-md border-l-4 cursor-pointer hover:shadow-lg hover:z-30 transition-all",
                                    isPendingFromOther && "border-dashed opacity-80"
                                  )}
                                  style={{
                                    top: `${event.top}px`,
                                    height: `${event.height}px`,
                                    left: `${event.left}%`,
                                    width: `${event.width}%`,
                                    borderLeftColor: event.room?.color || "#888",
                                    backgroundColor: `${event.room?.color}15`,
                                    zIndex: 15,
                                  }}
                                  onClick={(e) => {
                                    e.stopPropagation();
                                    onEventClick(event.id);
                                  }}
                                >
                                  <div className="p-1.5 text-xs h-full flex flex-col">
                                    <div className="font-semibold text-foreground line-clamp-2">
                                      {event.title}
                                    </div>
                                    <div className="flex items-center gap-1 text-[10px] text-muted-foreground mt-0.5">
                                      <Clock className="h-2.5 w-2.5" />
                                      <span>
                                        {format(parseISO(event.starts_at), "h:mm a")}
                                      </span>
                                    </div>
                                    {event.room && (
                                      <div className="text-[9px] mt-1 font-medium" style={{ color: event.room.color }}>
                                        {event.room.name}
                                      </div>
                                    )}
                                    {!hideStatus && event.height > 50 && (
                                      <div className="mt-auto pt-1">
                                        <Badge
                                          className={cn(
                                            "text-[8px] h-auto py-0.5 px-1 text-white",
                                            getStatusColor(event.status)
                                          )}
                                        >
                                          {getStatusLabel(event.status)}
                                        </Badge>
                                      </div>
                                    )}
                                  </div>
                                </div>
                              );
                            })}
                          </>
                        )}
                      </div>
                    );
                  })}
                </>
              ))}
            </div>
          </div>
        </div>
      </div>
    );
  }

  // Month view
  if (view === "month") {
    const monthStart = startOfMonth(currentWeek);
    const monthEnd = endOfMonth(currentWeek);
    const calendarStart = startOfWeek(monthStart, { weekStartsOn: 0 });
    const calendarEnd = startOfWeek(addDays(monthEnd, 6), { weekStartsOn: 0 });

    const allDays = eachDayOfInterval({ start: calendarStart, end: calendarEnd });
    const weeks = [];
    for (let i = 0; i < allDays.length; i += 7) {
      weeks.push(allDays.slice(i, i + 7));
    }

    const getEventsForDay = (day: Date) => {
      return events
        .filter((event) => isSameDay(parseISO(event.starts_at), day))
        .sort((a, b) => parseISO(a.starts_at).getTime() - parseISO(b.starts_at).getTime());
    };

    return (
      <div className="space-y-2">
        <div className="border rounded-lg bg-background overflow-hidden">
          {/* Month Grid */}
          <div className="grid grid-cols-7">
            {/* Day headers */}
            {["Sun", "Mon", "Tue", "Wed", "Thu", "Fri", "Sat"].map((day) => (
              <div
                key={day}
                className="border-b bg-muted/30 py-3 text-center text-sm font-semibold"
              >
                {day}
              </div>
            ))}

            {/* Calendar days */}
            {weeks.map((week, weekIndex) =>
              week.map((day, dayIndex) => {
                const dayEvents = getEventsForDay(day);
                const isCurrentDay = isToday(day);
                const isPastDay = isPast(day);
                const isCurrentMonth = isSameMonth(day, currentWeek);

                return (
                  <div
                    key={`${weekIndex}-${dayIndex}`}
                    className={cn(
                      "min-h-[120px] border-b border-r p-2 relative group/day cursor-pointer hover:bg-accent/20 transition-colors",
                      !isCurrentMonth && "bg-muted/20",
                      isCurrentDay && "bg-blue-50/50 dark:bg-blue-950/30"
                    )}
                    onClick={() => onDateClick && !isPastDay && onDateClick(day)}
                  >
                    {/* Date number */}
                    <div className="flex items-center justify-between mb-2">
                      <div
                        className={cn(
                          "flex items-center justify-center w-7 h-7 rounded-full text-sm font-semibold",
                          isCurrentDay &&
                            "bg-blue-600 text-white",
                          !isCurrentDay && isCurrentMonth && "text-foreground",
                          !isCurrentDay && !isCurrentMonth && "text-muted-foreground"
                        )}
                      >
                        {format(day, "d")}
                      </div>

                      {/* Add event button on hover */}
                      {onDateClick && !isPastDay && (
                        <Button
                          variant="ghost"
                          size="sm"
                          className="h-6 w-6 p-0 opacity-0 group-hover/day:opacity-100 transition-opacity"
                          onClick={(e) => {
                            e.stopPropagation();
                            onDateClick(day);
                          }}
                        >
                          <Plus className="h-3 w-3" />
                        </Button>
                      )}
                    </div>

                    {/* Events list */}
                    <div className="space-y-1">
                      {dayEvents.slice(0, 3).map((event) => {
                        const isOwnEvent =
                          currentUserId && event.created_by === currentUserId;
                        const isPendingFromOther =
                          event.status === "pending_review" && !isOwnEvent;

                        return (
                          <div
                            key={event.id}
                            className={cn(
                              "text-xs px-1.5 py-0.5 rounded truncate border-l-2 cursor-pointer hover:shadow-sm transition-shadow",
                              isPendingFromOther && "border-dashed opacity-80"
                            )}
                            style={{
                              borderLeftColor: event.room?.color || "#888",
                              backgroundColor: `${event.room?.color}20`,
                            }}
                            onClick={(e) => {
                              e.stopPropagation();
                              onEventClick(event.id);
                            }}
                          >
                            <div className="flex items-center gap-1">
                              <span className="font-medium truncate">
                                {format(parseISO(event.starts_at), "h:mm a")}
                              </span>
                              <span className="truncate">{event.title}</span>
                            </div>
                          </div>
                        );
                      })}

                      {/* More events indicator */}
                      {dayEvents.length > 3 && (
                        <div className="text-xs text-muted-foreground font-medium px-1.5">
                          +{dayEvents.length - 3} more
                        </div>
                      )}
                    </div>

                    {/* Event count dots for days with few events */}
                    {dayEvents.length > 0 && dayEvents.length <= 3 && (
                      <div className="absolute bottom-1 right-1 flex gap-0.5">
                        {dayEvents.slice(0, 3).map((event, idx) => (
                          <div
                            key={idx}
                            className="w-1.5 h-1.5 rounded-full"
                            style={{ backgroundColor: event.room?.color || "#888" }}
                          />
                        ))}
                      </div>
                    )}
                  </div>
                );
              })
            )}
          </div>
        </div>

        {/* Legend */}
        {!hideStatus && (
          <Card className="p-3">
            <div className="flex flex-wrap items-center gap-4 text-xs">
              <div className="flex items-center gap-2">
                <div className="w-3 h-3 rounded-full bg-gray-500" />
                <span>Draft</span>
              </div>
              <div className="flex items-center gap-2">
                <div className="w-3 h-3 rounded-full bg-amber-500" />
                <span>Pending Review</span>
              </div>
              <div className="flex items-center gap-2">
                <div className="w-3 h-3 rounded-full bg-green-500" />
                <span>Approved</span>
              </div>
              <div className="flex items-center gap-2">
                <div className="w-3 h-3 rounded-full bg-red-500" />
                <span>Rejected</span>
              </div>
              <div className="flex items-center gap-2">
                <div className="w-3 h-3 rounded-full bg-blue-500" />
                <span>Published</span>
              </div>
            </div>
          </Card>
        )}
      </div>
    );
  }

  return null;
};

export default GoogleCalendarView;
