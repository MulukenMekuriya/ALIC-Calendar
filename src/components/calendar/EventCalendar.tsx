import { useState, useEffect } from "react";
import { Card, CardHeader, CardContent } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import {
  Tooltip,
  TooltipContent,
  TooltipTrigger,
} from "@/components/ui/tooltip";
import {
  format,
  startOfWeek,
  addDays,
  isSameDay,
  parseISO,
  addWeeks,
  subWeeks,
  startOfDay,
  endOfDay,
  isBefore,
  isAfter,
} from "date-fns";
import {
  ChevronLeft,
  ChevronRight,
  Clock,
  MapPin,
  User,
  Plus,
  DoorOpen,
} from "lucide-react";
import { cn } from "@/lib/utils";

interface Event {
  id: string;
  title: string;
  starts_at: string;
  ends_at: string;
  status: string;
  room: { id: string; name: string; color: string };
  creator: { full_name: string } | null;
}

interface Room {
  id: string;
  name: string;
  color: string;
}

interface EventCalendarProps {
  events: Event[];
  rooms: Room[];
  onEventClick: (eventId: string) => void;
  onCreateEvent?: (date?: Date, roomId?: string) => void;
}

const statusColors = {
  draft: "bg-muted text-muted-foreground border-muted",
  pending_review: "bg-warning/10 text-warning border-warning/20",
  approved: "bg-success/10 text-success border-success/20",
  rejected: "bg-destructive/10 text-destructive border-destructive/20",
  published: "bg-primary/10 text-primary border-primary/20",
};

const statusLabels = {
  draft: "Draft",
  pending_review: "Pending",
  approved: "Approved",
  rejected: "Rejected",
  published: "Published",
};

const EventCalendar = ({
  events,
  rooms,
  onEventClick,
  onCreateEvent,
}: EventCalendarProps) => {
  const [currentWeek, setCurrentWeek] = useState(new Date());
  const [columnWidths, setColumnWidths] = useState<number[]>(Array(7).fill(150));
  const [resizingColumn, setResizingColumn] = useState<number | null>(null);
  const [startX, setStartX] = useState(0);
  const [startWidth, setStartWidth] = useState(0);
  const weekStart = startOfWeek(currentWeek, { weekStartsOn: 0 });
  const weekDays = Array.from({ length: 7 }, (_, i) => addDays(weekStart, i));
  const today = new Date();

  const getEventsForDayAndRoom = (day: Date, roomId: string) => {
    return events.filter(
      (event) =>
        event.room.id === roomId && isSameDay(parseISO(event.starts_at), day)
    );
  };

  const navigateWeek = (direction: "prev" | "next") => {
    setCurrentWeek(
      direction === "prev" ? subWeeks(currentWeek, 1) : addWeeks(currentWeek, 1)
    );
  };

  const goToToday = () => {
    setCurrentWeek(new Date());
  };

  const handleMouseDown = (e: React.MouseEvent, columnIndex: number) => {
    e.preventDefault();
    setResizingColumn(columnIndex);
    setStartX(e.clientX);
    setStartWidth(columnWidths[columnIndex]);
  };

  const handleMouseMove = (e: MouseEvent) => {
    if (resizingColumn === null) return;

    const diff = e.clientX - startX;
    const newWidth = Math.max(80, startWidth + diff); // Minimum width of 80px

    setColumnWidths((prev) => {
      const newWidths = [...prev];
      newWidths[resizingColumn] = newWidth;
      return newWidths;
    });
  };

  const handleMouseUp = () => {
    setResizingColumn(null);
  };

  // Add and remove event listeners for mouse move and up
  useEffect(() => {
    if (resizingColumn !== null) {
      document.addEventListener("mousemove", handleMouseMove);
      document.addEventListener("mouseup", handleMouseUp);
      return () => {
        document.removeEventListener("mousemove", handleMouseMove);
        document.removeEventListener("mouseup", handleMouseUp);
      };
    }
  }, [resizingColumn, startX, startWidth]);

  const isToday = (date: Date) => isSameDay(date, today);
  const isPast = (date: Date) => isBefore(endOfDay(date), startOfDay(today));

  return (
    <div className="space-y-6">
      {/* Calendar Header */}
      <Card className="border-0 shadow-sm">
        <CardHeader className="pb-4">
          <div className="flex items-center justify-between">
            <div className="space-y-1">
              <h2 className="text-2xl font-bold">
                {format(weekStart, "MMMM yyyy")}
              </h2>
              <p className="text-sm text-muted-foreground">
                Week of {format(weekStart, "MMM d")} -{" "}
                {format(addDays(weekStart, 6), "MMM d")}
              </p>
            </div>
            <div className="flex items-center gap-2">
              <Button variant="outline" size="sm" onClick={goToToday}>
                Today
              </Button>
              <div className="flex items-center">
                <Button
                  variant="ghost"
                  size="sm"
                  onClick={() => navigateWeek("prev")}
                  className="h-8 w-8 p-0"
                >
                  <ChevronLeft className="h-4 w-4" />
                </Button>
                <Button
                  variant="ghost"
                  size="sm"
                  onClick={() => navigateWeek("next")}
                  className="h-8 w-8 p-0"
                >
                  <ChevronRight className="h-4 w-4" />
                </Button>
              </div>
            </div>
          </div>
        </CardHeader>
      </Card>

      {/* Calendar Grid */}
      <Card className="border-0 shadow-sm overflow-x-auto">
        <CardContent className="p-0">
          {/* Days Header */}
          <div className="grid border-b bg-muted/30" style={{
            gridTemplateColumns: `200px ${columnWidths.map(w => `${w}px`).join(' ')}`
          }}>
            <div className="p-4 font-medium text-sm text-muted-foreground border-r">
              Rooms
            </div>
            {weekDays.map((day, dayIndex) => (
              <div
                key={day.toString()}
                className={cn(
                  "p-4 border-r last:border-r-0 relative",
                  isToday(day) && "bg-primary/5"
                )}
              >
                <div className="text-center">
                  <div
                    className={cn(
                      "font-semibold text-sm",
                      isToday(day) ? "text-primary" : "text-foreground"
                    )}
                  >
                    {format(day, "EEE")}
                  </div>
                  <div
                    className={cn(
                      "text-xs mt-1",
                      isToday(day)
                        ? "text-primary font-medium"
                        : isPast(day)
                        ? "text-muted-foreground"
                        : "text-muted-foreground"
                    )}
                  >
                    {format(day, "MMM d")}
                  </div>
                  {isToday(day) && (
                    <div className="w-2 h-2 bg-primary rounded-full mx-auto mt-1" />
                  )}
                </div>
                {/* Resize Handle */}
                {dayIndex < weekDays.length - 1 && (
                  <div
                    className={cn(
                      "absolute top-0 right-0 w-1 h-full cursor-col-resize hover:bg-primary/50 transition-colors",
                      resizingColumn === dayIndex && "bg-primary"
                    )}
                    onMouseDown={(e) => handleMouseDown(e, dayIndex)}
                  />
                )}
              </div>
            ))}
          </div>

          {/* Rooms and Events */}
          {rooms.map((room) => (
            <div
              key={room.id}
              className="grid border-b last:border-b-0 hover:bg-muted/20 transition-colors"
              style={{
                gridTemplateColumns: `200px ${columnWidths.map(w => `${w}px`).join(' ')}`
              }}
            >
              {/* Room Header */}
              <div className="p-4 border-r flex items-center gap-3 bg-card">
                <div
                  className="w-4 h-4 rounded-full flex-shrink-0"
                  style={{ backgroundColor: room.color }}
                />
                <div className="min-w-0 flex-1">
                  <div className="font-medium text-sm truncate">
                    {room.name}
                  </div>
                  <div className="text-xs text-muted-foreground truncate">
                    {getEventsForDayAndRoom(weekStart, room.id).length +
                      getEventsForDayAndRoom(addDays(weekStart, 1), room.id)
                        .length +
                      getEventsForDayAndRoom(addDays(weekStart, 2), room.id)
                        .length +
                      getEventsForDayAndRoom(addDays(weekStart, 3), room.id)
                        .length +
                      getEventsForDayAndRoom(addDays(weekStart, 4), room.id)
                        .length +
                      getEventsForDayAndRoom(addDays(weekStart, 5), room.id)
                        .length +
                      getEventsForDayAndRoom(addDays(weekStart, 6), room.id)
                        .length}{" "}
                    events
                  </div>
                </div>
              </div>

              {/* Event Cells */}
              {weekDays.map((day, dayIndex) => {
                const dayEvents = getEventsForDayAndRoom(day, room.id);
                const columnWidth = columnWidths[dayIndex];
                const isWide = columnWidth > 200;
                return (
                  <div
                    key={day.toString()}
                    className={cn(
                      "p-2 border-r last:border-r-0 min-h-[120px] relative group",
                      isPast(day) && "bg-muted/10",
                      isToday(day) && "bg-primary/5"
                    )}
                  >
                    {/* Add Event Button (shows on hover) */}
                    {onCreateEvent && !isPast(day) && (
                      <Button
                        variant="ghost"
                        size="sm"
                        className="absolute top-1 right-1 h-6 w-6 p-0 opacity-0 group-hover:opacity-100 transition-opacity"
                        onClick={() => onCreateEvent(day, room.id)}
                      >
                        <Plus className="h-3 w-3" />
                      </Button>
                    )}

                    {/* Events */}
                    <div className="space-y-1">
                      {dayEvents.map((event) => (
                        <Tooltip key={event.id}>
                          <TooltipTrigger asChild>
                            <div
                              onClick={() => onEventClick(event.id)}
                              className={cn(
                                "p-2 rounded-md border cursor-pointer hover:shadow-sm transition-all group/event text-xs",
                                statusColors[
                                  event.status as keyof typeof statusColors
                                ],
                                isPast(day) && "opacity-60"
                              )}
                            >
                              <div className={cn(
                                "font-medium mb-1",
                                isWide ? "" : "truncate"
                              )}>
                                {event.title}
                              </div>
                              <div className="flex items-center gap-1 text-xs opacity-80">
                                <Clock className="h-3 w-3 flex-shrink-0" />
                                <span>
                                  {format(parseISO(event.starts_at), "HH:mm")}
                                  {isWide && (
                                    <> - {format(parseISO(event.ends_at), "HH:mm")}</>
                                  )}
                                </span>
                              </div>
                              {isWide && event.creator && (
                                <div className="flex items-center gap-1 text-xs opacity-80 mt-1">
                                  <User className="h-3 w-3 flex-shrink-0" />
                                  <span className="truncate">{event.creator.full_name}</span>
                                </div>
                              )}
                              <Badge
                                variant="outline"
                                className={cn(
                                  "mt-1 text-xs border-0 h-auto py-0.5 px-1.5",
                                  statusColors[
                                    event.status as keyof typeof statusColors
                                  ]
                                )}
                              >
                                {
                                  statusLabels[
                                    event.status as keyof typeof statusLabels
                                  ]
                                }
                              </Badge>
                            </div>
                          </TooltipTrigger>
                          <TooltipContent side="top" className="max-w-xs">
                            <div className="space-y-2">
                              <div className="font-medium">{event.title}</div>
                              <div className="flex items-center gap-2 text-xs">
                                <Clock className="h-3 w-3" />
                                {format(
                                  parseISO(event.starts_at),
                                  "HH:mm"
                                )} - {format(parseISO(event.ends_at), "HH:mm")}
                              </div>
                              <div className="flex items-center gap-2 text-xs">
                                <MapPin className="h-3 w-3" />
                                {room.name}
                              </div>
                              {event.creator && (
                                <div className="flex items-center gap-2 text-xs">
                                  <User className="h-3 w-3" />
                                  {event.creator.full_name}
                                </div>
                              )}
                            </div>
                          </TooltipContent>
                        </Tooltip>
                      ))}
                    </div>
                  </div>
                );
              })}
            </div>
          ))}

          {/* Empty State */}
          {rooms.length === 0 && (
            <div className="p-8 text-center">
              <DoorOpen className="h-12 w-12 text-muted-foreground mx-auto mb-4" />
              <h3 className="text-lg font-medium mb-2">No rooms available</h3>
              <p className="text-sm text-muted-foreground mb-4">
                Create rooms to start organizing events
              </p>
              {onCreateEvent && (
                <Button variant="outline" onClick={() => onCreateEvent()}>
                  Create Room
                </Button>
              )}
            </div>
          )}
        </CardContent>
      </Card>
    </div>
  );
};

export default EventCalendar;
