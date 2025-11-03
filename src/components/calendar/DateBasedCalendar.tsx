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
} from "date-fns";
import { Clock, Plus } from "lucide-react";
import { cn } from "@/lib/utils";

interface Event {
  id: string;
  title: string;
  starts_at: string;
  ends_at: string;
  status: string;
  room: { id: string; name: string; color: string };
  creator: { full_name: string; ministry_name?: string } | null;
}

interface PositionedEvent extends Event {
  top: number;
  height: number;
  column: number;
  totalColumns: number;
}

interface DateBasedCalendarProps {
  events: Event[];
  currentWeek: Date;
  onEventClick: (eventId: string) => void;
  onDateClick?: (date: Date) => void;
  hideStatus?: boolean;
}

const DateBasedCalendar = ({
  events,
  currentWeek,
  onEventClick,
  onDateClick,
  hideStatus = false,
}: DateBasedCalendarProps) => {
  const weekStart = startOfWeek(currentWeek, { weekStartsOn: 0 });
  const weekDays = Array.from({ length: 7 }, (_, i) => addDays(weekStart, i));
  const today = new Date();

  const getEventsForDay = (day: Date) => {
    return events.filter((event) =>
      isSameDay(parseISO(event.starts_at), day)
    ).sort((a, b) => parseISO(a.starts_at).getTime() - parseISO(b.starts_at).getTime());
  };

  // Calculate positions for events in a time-grid layout
  const calculateEventPositions = (dayEvents: Event[], day: Date): PositionedEvent[] => {
    if (dayEvents.length === 0) return [];

    const dayStart = startOfDay(day);
    const PIXELS_PER_MINUTE = 1; // 1px per minute (60px per hour)

    // Calculate top position and height for each event
    const eventsWithBasicPosition = dayEvents.map((event) => {
      const eventStart = parseISO(event.starts_at);
      const eventEnd = parseISO(event.ends_at);

      const minutesFromStart = differenceInMinutes(eventStart, dayStart);
      const duration = differenceInMinutes(eventEnd, eventStart);

      return {
        ...event,
        top: minutesFromStart * PIXELS_PER_MINUTE,
        height: Math.max(duration * PIXELS_PER_MINUTE, 40), // Minimum 40px height
        start: eventStart,
        end: eventEnd,
      };
    });

    // Group overlapping events and assign columns
    const positionedEvents: PositionedEvent[] = [];
    const groups: typeof eventsWithBasicPosition[] = [];

    eventsWithBasicPosition.forEach((event) => {
      // Find all events that overlap with this event
      let overlappingGroup: typeof eventsWithBasicPosition | null = null;

      for (const group of groups) {
        const overlaps = group.some((groupEvent) =>
          areIntervalsOverlapping(
            { start: event.start, end: event.end },
            { start: groupEvent.start, end: groupEvent.end },
            { inclusive: true }
          )
        );

        if (overlaps) {
          overlappingGroup = group;
          break;
        }
      }

      if (overlappingGroup) {
        overlappingGroup.push(event);
      } else {
        groups.push([event]);
      }
    });

    // Assign columns within each group
    groups.forEach((group) => {
      const totalColumns = group.length;

      // Sort by start time, then by duration (longer events first for better layout)
      group.sort((a, b) => {
        const timeDiff = a.start.getTime() - b.start.getTime();
        if (timeDiff !== 0) return timeDiff;
        return (b.end.getTime() - b.start.getTime()) - (a.end.getTime() - a.start.getTime());
      });

      // Assign column to each event
      const columns: { start: Date; end: Date }[] = [];

      group.forEach((event) => {
        // Find the first available column
        let column = 0;
        for (let i = 0; i < columns.length; i++) {
          const columnEvent = columns[i];
          const overlaps = areIntervalsOverlapping(
            { start: event.start, end: event.end },
            { start: columnEvent.start, end: columnEvent.end },
            { inclusive: true }
          );

          if (!overlaps) {
            column = i;
            columns[i] = { start: event.start, end: event.end };
            break;
          }
        }

        // If no available column found, create a new one
        if (column === columns.length || columns[column] === undefined) {
          columns.push({ start: event.start, end: event.end });
        } else {
          // Update the column's end time
          if (event.end > columns[column].end) {
            columns[column].end = event.end;
          }
        }

        positionedEvents.push({
          ...event,
          column,
          totalColumns: Math.max(totalColumns, columns.length),
        });
      });
    });

    return positionedEvents;
  };

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

  return (
    <div className="space-y-4">
      {/* Calendar Grid */}
      <div className="grid grid-cols-7 gap-2">
        {weekDays.map((day) => {
          const dayEvents = getEventsForDay(day);
          const isCurrentDay = isToday(day);
          const isPastDay = isPast(day);

          return (
            <Card
              key={day.toString()}
              className={cn(
                "border-2 transition-all hover:shadow-md",
                isCurrentDay && "ring-2 ring-blue-500 border-blue-500",
                isPastDay && "opacity-60"
              )}
            >
              <CardContent className="p-3">
                {/* Date Header */}
                <div className="text-center mb-3 pb-2 border-b relative group/header">
                  <div
                    className={cn(
                      "font-bold text-sm uppercase tracking-wide",
                      isCurrentDay ? "text-blue-600" : "text-muted-foreground"
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
                    <div className="mt-1">
                      <Badge
                        variant="default"
                        className="text-xs bg-blue-600"
                      >
                        Today
                      </Badge>
                    </div>
                  )}
                  {/* Add Event Button */}
                  {onDateClick && !isPastDay && (
                    <Button
                      variant="ghost"
                      size="sm"
                      className="absolute top-0 right-0 h-6 w-6 p-0 opacity-0 group-hover/header:opacity-100 transition-opacity"
                      onClick={() => onDateClick(day)}
                      title="Add event"
                    >
                      <Plus className="h-3 w-3" />
                    </Button>
                  )}
                </div>

                {/* Events List - Time Grid Layout */}
                <div className="relative min-h-[200px] max-h-[600px] overflow-y-auto">
                  {dayEvents.length > 0 ? (
                    <div className="relative" style={{ height: `${24 * 60}px` }}>
                      {/* Hour markers */}
                      {Array.from({ length: 24 }, (_, hour) => (
                        <div
                          key={hour}
                          className="absolute left-0 right-0 border-t border-border/30"
                          style={{ top: `${hour * 60}px` }}
                        >
                          <span className="text-[10px] text-muted-foreground/60 pl-1">
                            {format(new Date().setHours(hour, 0), "ha")}
                          </span>
                        </div>
                      ))}

                      {/* Events positioned in time grid */}
                      {calculateEventPositions(dayEvents, day).map((event) => {
                        const widthPercentage = 100 / event.totalColumns;
                        const leftPercentage = widthPercentage * event.column;

                        return (
                          <div
                            key={event.id}
                            onClick={() => onEventClick(event.id)}
                            className="absolute p-2 rounded-md bg-background border-l-2 cursor-pointer hover:bg-accent/50 transition-colors shadow-sm overflow-hidden"
                            style={{
                              top: `${event.top}px`,
                              height: `${event.height}px`,
                              left: `${leftPercentage}%`,
                              width: `calc(${widthPercentage}% - 4px)`,
                              borderLeftColor: event.room?.color || "#888",
                              minHeight: "40px",
                            }}
                          >
                            <div className="font-medium text-xs mb-0.5 line-clamp-1 text-foreground">
                              {event.title}
                            </div>
                            <div className="flex items-center gap-1 text-[9px] text-muted-foreground mb-0.5">
                              <Clock className="h-2.5 w-2.5" />
                              <span>
                                {format(parseISO(event.starts_at), "h:mm a")}
                              </span>
                            </div>
                            {event.room && (
                              <Badge
                                variant="outline"
                                className="text-[9px] h-auto py-0 px-1 font-normal"
                                style={{
                                  borderColor: event.room.color,
                                  backgroundColor: `${event.room.color}15`,
                                  color: event.room.color,
                                }}
                              >
                                {event.room.name}
                              </Badge>
                            )}
                            {!hideStatus && event.height > 60 && (
                              <Badge
                                variant="secondary"
                                className={cn(
                                  "text-[9px] h-auto py-0 px-1 font-normal text-white mt-0.5",
                                  getStatusColor(event.status)
                                )}
                              >
                                {getStatusLabel(event.status)}
                              </Badge>
                            )}
                          </div>
                        );
                      })}
                    </div>
                  ) : (
                    <div
                      className={cn(
                        "text-center py-8 text-sm text-muted-foreground",
                        onDateClick && !isPastDay && "cursor-pointer hover:bg-accent/30 rounded-lg transition-colors"
                      )}
                      onClick={() => onDateClick && !isPastDay && onDateClick(day)}
                    >
                      <p>
                        {onDateClick && !isPastDay ? "Click to add event" : "No events"}
                      </p>
                    </div>
                  )}
                </div>

                {/* Event Count */}
                {dayEvents.length > 0 && (
                  <div className="mt-2 pt-2 border-t text-center">
                    <span className="text-xs text-muted-foreground">
                      {dayEvents.length} {dayEvents.length === 1 ? "event" : "events"}
                    </span>
                  </div>
                )}
              </CardContent>
            </Card>
          );
        })}
      </div>
    </div>
  );
};

export default DateBasedCalendar;
