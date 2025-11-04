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

  // Group overlapping events into rows
  const groupOverlappingEvents = (dayEvents: Event[]) => {
    if (dayEvents.length === 0) return [];

    const rows: Event[][] = [];

    dayEvents.forEach((event) => {
      const eventStart = parseISO(event.starts_at);
      const eventEnd = parseISO(event.ends_at);

      // Find if this event overlaps with any event in existing rows
      let addedToRow = false;

      for (const row of rows) {
        const overlaps = row.some((rowEvent) => {
          const rowStart = parseISO(rowEvent.starts_at);
          const rowEnd = parseISO(rowEvent.ends_at);

          return areIntervalsOverlapping(
            { start: eventStart, end: eventEnd },
            { start: rowStart, end: rowEnd },
            { inclusive: true }
          );
        });

        if (overlaps) {
          row.push(event);
          addedToRow = true;
          break;
        }
      }

      if (!addedToRow) {
        rows.push([event]);
      }
    });

    return rows;
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

                {/* Events List - Simple row-based layout */}
                <div className="space-y-2 min-h-[200px] max-h-[400px] overflow-y-auto">
                  {dayEvents.length > 0 ? (
                    groupOverlappingEvents(dayEvents).map((row, rowIndex) => (
                      <div
                        key={`row-${rowIndex}`}
                        className={cn(
                          "grid gap-2",
                          row.length === 1 ? "grid-cols-1" :
                          row.length === 2 ? "grid-cols-2" :
                          row.length === 3 ? "grid-cols-3" :
                          "grid-cols-2"
                        )}
                      >
                        {row.map((event) => (
                          <div
                            key={event.id}
                            onClick={() => onEventClick(event.id)}
                            className="p-2 rounded-md bg-background border-l-4 cursor-pointer hover:bg-accent/50 transition-colors shadow-sm"
                            style={{
                              borderLeftColor: event.room?.color || "#888",
                            }}
                          >
                            <div className="font-medium text-sm mb-1 line-clamp-1 text-foreground">
                              {event.title}
                            </div>
                            <div className="flex items-center gap-1 text-[10px] text-muted-foreground mb-1">
                              <Clock className="h-3 w-3" />
                              <span>
                                {format(parseISO(event.starts_at), "h:mm a")} - {format(parseISO(event.ends_at), "h:mm a")}
                              </span>
                            </div>
                            <div className="flex flex-wrap items-center gap-1">
                              {event.room && (
                                <Badge
                                  variant="outline"
                                  className="text-[9px] h-auto py-0.5 px-1 font-normal"
                                  style={{
                                    borderColor: event.room.color,
                                    backgroundColor: `${event.room.color}15`,
                                    color: event.room.color,
                                  }}
                                >
                                  {event.room.name}
                                </Badge>
                              )}
                              {!hideStatus && (
                                <Badge
                                  variant="secondary"
                                  className={cn(
                                    "text-[9px] h-auto py-0.5 px-1 font-normal text-white",
                                    getStatusColor(event.status)
                                  )}
                                >
                                  {getStatusLabel(event.status)}
                                </Badge>
                              )}
                            </div>
                            {event.creator && !hideStatus && (
                              <div className="text-[9px] text-muted-foreground mt-1 truncate">
                                By: {event.creator.full_name}
                              </div>
                            )}
                          </div>
                        ))}
                      </div>
                    ))
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
