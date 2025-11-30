/**
 * ExportDialog - Enterprise-grade calendar export dialog with role-based access control
 */

import { useState } from "react";
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogHeader,
  DialogTitle,
  DialogFooter,
} from "@/shared/components/ui/dialog";
import { Button } from "@/shared/components/ui/button";
import { Label } from "@/shared/components/ui/label";
import { RadioGroup, RadioGroupItem } from "@/shared/components/ui/radio-group";
import { Checkbox } from "@/shared/components/ui/checkbox";
import { Separator } from "@/shared/components/ui/separator";
import { Badge } from "@/shared/components/ui/badge";
import {
  Download,
  Calendar,
  FileText,
  ExternalLink,
  Loader2,
  CheckCircle2,
  AlertCircle,
} from "lucide-react";
import { useToast } from "@/shared/hooks/use-toast";
import { exportService, type ExportFormat, type ExportScope, type ExportOptions, type ExportableEvent } from "../services";

interface ExportDialogProps {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  events: ExportableEvent[];
  organizationName: string;
  organizationSlug?: string;
  timezone?: string;
  userId?: string;
  isAdmin?: boolean;
  dateRange?: {
    start: Date;
    end: Date;
  };
}

const ExportDialog = ({
  open,
  onOpenChange,
  events,
  organizationName,
  organizationSlug,
  timezone,
  userId,
  isAdmin = false,
  dateRange,
}: ExportDialogProps) => {
  const { toast } = useToast();
  const [format, setFormat] = useState<ExportFormat>("ics");
  const [scope, setScope] = useState<ExportScope>(isAdmin ? "both" : "published");
  const [separateByStatus, setSeparateByStatus] = useState(true);
  const [includeDescription, setIncludeDescription] = useState(true);
  const [includeLocation, setIncludeLocation] = useState(true);
  const [includeOrganizer, setIncludeOrganizer] = useState(false);
  const [isExporting, setIsExporting] = useState(false);

  // Filter events for preview counts
  const getFilteredEventCount = (filterScope: ExportScope): number => {
    return events.filter((event) => {
      // For non-admin users, only show their own events
      if (!isAdmin && userId && event.created_by !== userId) {
        return false;
      }

      switch (filterScope) {
        case "approved":
          return event.status === "approved";
        case "published":
          return event.status === "published";
        case "both":
          return event.status === "approved" || event.status === "published";
        case "all":
          return true;
        default:
          return event.status === "published";
      }
    }).length;
  };

  const handleExport = async () => {
    setIsExporting(true);

    try {
      const options: ExportOptions = {
        format,
        scope,
        organizationName,
        organizationSlug,
        timezone,
        dateRange,
        includeDescription,
        includeLocation,
        includeOrganizer,
        separateByStatus: format === "pdf" ? separateByStatus : false,
      };

      const result = exportService.export(events, options, userId, isAdmin);

      if (result.success) {
        toast({
          title: "Export successful",
          description: (
            <div className="flex items-center gap-2">
              <CheckCircle2 className="h-4 w-4 text-green-500" />
              <span>
                Exported {result.eventCount} event{result.eventCount !== 1 ? "s" : ""} to{" "}
                {format === "ics" ? "iCalendar" : format === "pdf" ? "PDF" : "Google Calendar"} format.
              </span>
            </div>
          ),
        });
        onOpenChange(false);
      } else {
        toast({
          title: "Export failed",
          description: result.error || "An error occurred during export.",
          variant: "destructive",
        });
      }
    } catch (error) {
      toast({
        title: "Export failed",
        description: error instanceof Error ? error.message : "An unexpected error occurred.",
        variant: "destructive",
      });
    } finally {
      setIsExporting(false);
    }
  };

  const handleGoogleCalendarAdd = (event: ExportableEvent) => {
    const url = exportService.toGoogleCalendarUrl(event);
    window.open(url, "_blank");
  };

  // Get events available for Google Calendar export
  const googleCalendarEvents = events.filter((event) => {
    // For non-admin users, only show their own events
    if (!isAdmin && userId && event.created_by !== userId) {
      return false;
    }
    return event.status === "approved" || event.status === "published";
  });

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="sm:max-w-[500px]">
        <DialogHeader>
          <DialogTitle className="flex items-center gap-2">
            <Download className="h-5 w-5" />
            Export Calendar
          </DialogTitle>
          <DialogDescription>
            Export events to your preferred format. {isAdmin ? "As an admin, you can export all events." : "You can export your own events and published events."}
          </DialogDescription>
        </DialogHeader>

        <div className="space-y-6 py-4">
          {/* Format Selection */}
          <div className="space-y-3">
            <Label className="text-sm font-medium">Export Format</Label>
            <RadioGroup
              value={format}
              onValueChange={(value) => setFormat(value as ExportFormat)}
              className="grid grid-cols-3 gap-3"
            >
              <div>
                <RadioGroupItem
                  value="ics"
                  id="format-ics"
                  className="peer sr-only"
                />
                <Label
                  htmlFor="format-ics"
                  className="flex flex-col items-center justify-between rounded-md border-2 border-muted bg-popover p-4 hover:bg-accent hover:text-accent-foreground peer-data-[state=checked]:border-primary [&:has([data-state=checked])]:border-primary cursor-pointer"
                >
                  <Calendar className="mb-2 h-6 w-6" />
                  <span className="text-sm font-medium">iCalendar</span>
                  <span className="text-xs text-muted-foreground">.ics file</span>
                </Label>
              </div>

              <div>
                <RadioGroupItem
                  value="google"
                  id="format-google"
                  className="peer sr-only"
                />
                <Label
                  htmlFor="format-google"
                  className="flex flex-col items-center justify-between rounded-md border-2 border-muted bg-popover p-4 hover:bg-accent hover:text-accent-foreground peer-data-[state=checked]:border-primary [&:has([data-state=checked])]:border-primary cursor-pointer"
                >
                  <ExternalLink className="mb-2 h-6 w-6" />
                  <span className="text-sm font-medium">Google</span>
                  <span className="text-xs text-muted-foreground">Add to Calendar</span>
                </Label>
              </div>

              <div>
                <RadioGroupItem
                  value="pdf"
                  id="format-pdf"
                  className="peer sr-only"
                />
                <Label
                  htmlFor="format-pdf"
                  className="flex flex-col items-center justify-between rounded-md border-2 border-muted bg-popover p-4 hover:bg-accent hover:text-accent-foreground peer-data-[state=checked]:border-primary [&:has([data-state=checked])]:border-primary cursor-pointer"
                >
                  <FileText className="mb-2 h-6 w-6" />
                  <span className="text-sm font-medium">PDF</span>
                  <span className="text-xs text-muted-foreground">Print-ready</span>
                </Label>
              </div>
            </RadioGroup>
          </div>

          <Separator />

          {/* Google Calendar - Event Selection */}
          {format === "google" && (
            <div className="space-y-3">
              <Label className="text-sm font-medium">Select Event to Add</Label>
              <div className="max-h-48 overflow-y-auto space-y-2 border rounded-md p-2">
                {googleCalendarEvents.length === 0 ? (
                  <p className="text-sm text-muted-foreground text-center py-4">
                    No events available to add to Google Calendar.
                  </p>
                ) : (
                  googleCalendarEvents.map((event) => (
                    <div
                      key={event.id}
                      className="flex items-center justify-between p-2 rounded-md border hover:bg-accent cursor-pointer"
                      onClick={() => handleGoogleCalendarAdd(event)}
                    >
                      <div className="flex-1 min-w-0">
                        <p className="text-sm font-medium truncate">{event.title}</p>
                        <p className="text-xs text-muted-foreground">
                          {event.room?.name} &bull;{" "}
                          {new Date(event.starts_at).toLocaleDateString()}
                        </p>
                      </div>
                      <div className="flex items-center gap-2">
                        <Badge
                          variant={event.status === "published" ? "default" : "secondary"}
                          className="text-xs"
                        >
                          {event.status === "published" ? "Published" : "Approved"}
                        </Badge>
                        <ExternalLink className="h-4 w-4 text-muted-foreground" />
                      </div>
                    </div>
                  ))
                )}
              </div>
              <p className="text-xs text-muted-foreground">
                Click an event to open Google Calendar and add it directly.
              </p>
            </div>
          )}

          {/* Scope Selection (for ICS and PDF) */}
          {format !== "google" && (
            <div className="space-y-3">
              <Label className="text-sm font-medium">Event Selection</Label>
              <RadioGroup
                value={scope}
                onValueChange={(value) => setScope(value as ExportScope)}
                className="space-y-2"
              >
                {/* Both approved & published - available to all authenticated users */}
                {userId && (
                  <div className="flex items-center space-x-3">
                    <RadioGroupItem value="both" id="scope-both" />
                    <Label htmlFor="scope-both" className="flex items-center gap-2 cursor-pointer">
                      {isAdmin ? "Approved & Published" : "My Approved & Published"}
                      <Badge variant="outline" className="text-xs">
                        {getFilteredEventCount("both")} events
                      </Badge>
                    </Label>
                  </div>
                )}
                {/* Approved only - available to all authenticated users (contributors see only their own) */}
                {userId && (
                  <div className="flex items-center space-x-3">
                    <RadioGroupItem value="approved" id="scope-approved" />
                    <Label htmlFor="scope-approved" className="flex items-center gap-2 cursor-pointer">
                      {isAdmin ? "Approved Only" : "My Approved Only"}
                      <Badge variant="outline" className="text-xs">
                        {getFilteredEventCount("approved")} events
                      </Badge>
                    </Label>
                  </div>
                )}
                {userId && (
                  <div className="flex items-center space-x-3">
                    <RadioGroupItem value="published" id="scope-published" />
                    <Label htmlFor="scope-published" className="flex items-center gap-2 cursor-pointer">
                      {isAdmin ? "Published Only" : "My Published Only"}
                      <Badge variant="outline" className="text-xs">
                        {getFilteredEventCount("published")} events
                      </Badge>
                    </Label>
                  </div>
                )}
                {!userId && (
                  <div className="flex items-center space-x-3">
                    <RadioGroupItem value="published" id="scope-published" />
                    <Label htmlFor="scope-published" className="flex items-center gap-2 cursor-pointer">
                      Published Only
                      <Badge variant="outline" className="text-xs">
                        {getFilteredEventCount("published")} events
                      </Badge>
                    </Label>
                  </div>
                )}
                {isAdmin && (
                  <div className="flex items-center space-x-3">
                    <RadioGroupItem value="all" id="scope-all" />
                    <Label htmlFor="scope-all" className="flex items-center gap-2 cursor-pointer">
                      All Events (including drafts)
                      <Badge variant="outline" className="text-xs">
                        {getFilteredEventCount("all")} events
                      </Badge>
                    </Label>
                  </div>
                )}
              </RadioGroup>
            </div>
          )}

          {/* PDF-specific options */}
          {format === "pdf" && (scope === "both" || scope === "all") && (
            <div className="space-y-3">
              <Label className="text-sm font-medium">PDF Layout</Label>
              <div className="flex items-center space-x-2">
                <Checkbox
                  id="separate-status"
                  checked={separateByStatus}
                  onCheckedChange={(checked) => setSeparateByStatus(checked as boolean)}
                />
                <Label htmlFor="separate-status" className="text-sm cursor-pointer">
                  Separate sections by status (Approved / Published)
                </Label>
              </div>
            </div>
          )}

          {/* Additional Options (for ICS) */}
          {format === "ics" && (
            <div className="space-y-3">
              <Label className="text-sm font-medium">Include in Export</Label>
              <div className="space-y-2">
                <div className="flex items-center space-x-2">
                  <Checkbox
                    id="include-description"
                    checked={includeDescription}
                    onCheckedChange={(checked) => setIncludeDescription(checked as boolean)}
                  />
                  <Label htmlFor="include-description" className="text-sm cursor-pointer">
                    Event descriptions
                  </Label>
                </div>
                <div className="flex items-center space-x-2">
                  <Checkbox
                    id="include-location"
                    checked={includeLocation}
                    onCheckedChange={(checked) => setIncludeLocation(checked as boolean)}
                  />
                  <Label htmlFor="include-location" className="text-sm cursor-pointer">
                    Room/location information
                  </Label>
                </div>
                <div className="flex items-center space-x-2">
                  <Checkbox
                    id="include-organizer"
                    checked={includeOrganizer}
                    onCheckedChange={(checked) => setIncludeOrganizer(checked as boolean)}
                  />
                  <Label htmlFor="include-organizer" className="text-sm cursor-pointer">
                    Organizer details
                  </Label>
                </div>
              </div>
            </div>
          )}

          {/* Event count preview */}
          {format !== "google" && (
            <div className="bg-muted/50 rounded-lg p-3">
              <div className="flex items-center gap-2">
                {getFilteredEventCount(scope) > 0 ? (
                  <>
                    <CheckCircle2 className="h-4 w-4 text-green-500" />
                    <span className="text-sm">
                      Ready to export <strong>{getFilteredEventCount(scope)}</strong> event
                      {getFilteredEventCount(scope) !== 1 ? "s" : ""}
                    </span>
                  </>
                ) : (
                  <>
                    <AlertCircle className="h-4 w-4 text-amber-500" />
                    <span className="text-sm text-muted-foreground">
                      No events match the selected criteria
                    </span>
                  </>
                )}
              </div>
            </div>
          )}
        </div>

        <DialogFooter>
          <Button variant="outline" onClick={() => onOpenChange(false)}>
            Cancel
          </Button>
          {format !== "google" && (
            <Button
              onClick={handleExport}
              disabled={isExporting || getFilteredEventCount(scope) === 0}
            >
              {isExporting ? (
                <>
                  <Loader2 className="mr-2 h-4 w-4 animate-spin" />
                  Exporting...
                </>
              ) : (
                <>
                  <Download className="mr-2 h-4 w-4" />
                  Export {format === "pdf" ? "PDF" : "iCalendar"}
                </>
              )}
            </Button>
          )}
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
};

export default ExportDialog;
