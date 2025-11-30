/**
 * Export service - handles calendar export to iCal, Google Calendar, and PDF formats
 */

import { jsPDF } from "jspdf";
import autoTable from "jspdf-autotable";
import { format, parseISO } from "date-fns";
import type { EventStatus } from "../types";

// Flexible event type for export that works with both full and partial room data
export interface ExportableEvent {
  id: string;
  title: string;
  description?: string | null;
  starts_at: string;
  ends_at: string;
  status: EventStatus;
  created_by: string;
  is_recurring?: boolean | null;
  recurrence_rule?: string | null;
  room?: {
    id?: string;
    name?: string;
    color?: string;
  } | null;
  creator?: {
    full_name?: string;
    email?: string;
    ministry_name?: string | null;
  } | null;
}

// Export format types
export type ExportFormat = "ics" | "google" | "pdf";
export type ExportScope = "approved" | "published" | "both" | "all";

// Export options
export interface ExportOptions {
  format: ExportFormat;
  scope: ExportScope;
  dateRange?: {
    start: Date;
    end: Date;
  };
  organizationName: string;
  organizationSlug?: string;
  timezone?: string;
  includeDescription?: boolean;
  includeLocation?: boolean;
  includeOrganizer?: boolean;
  separateByStatus?: boolean; // For PDF: create separate sections for approved/published
}

// Result of export operation
export interface ExportResult {
  success: boolean;
  filename?: string;
  url?: string; // For Google Calendar URL
  error?: string;
  eventCount: number;
}

/**
 * Helper function to escape special characters in iCalendar format
 */
const escapeICalText = (text: string): string => {
  if (!text) return "";
  return text
    .replace(/\\/g, "\\\\")
    .replace(/;/g, "\\;")
    .replace(/,/g, "\\,")
    .replace(/\n/g, "\\n")
    .replace(/\r/g, "");
};

/**
 * Helper function to fold long lines in iCalendar format (RFC 5545 requires lines <= 75 octets)
 */
const foldLine = (line: string): string => {
  const maxLength = 75;
  if (line.length <= maxLength) return line;

  let result = "";
  let remaining = line;
  while (remaining.length > maxLength) {
    result += remaining.substring(0, maxLength) + "\r\n ";
    remaining = remaining.substring(maxLength);
  }
  result += remaining;
  return result;
};

/**
 * Filter events based on export scope and user permissions
 */
const filterEventsByScope = (
  events: ExportableEvent[],
  scope: ExportScope,
  userId?: string,
  isAdmin?: boolean
): ExportableEvent[] => {
  return events.filter((event) => {
    // For non-admin users, only show their own events
    if (!isAdmin && userId && event.created_by !== userId) {
      return false;
    }

    switch (scope) {
      case "approved":
        return event.status === "approved";
      case "published":
        return event.status === "published";
      case "both":
        return event.status === "approved" || event.status === "published";
      case "all":
        // For admin: all statuses; for contributor: their own events only
        return true;
      default:
        return event.status === "published";
    }
  });
};

/**
 * Get status label for display
 */
const getStatusLabel = (status: EventStatus): string => {
  const labels: Record<EventStatus, string> = {
    draft: "Draft",
    pending_review: "Pending Review",
    approved: "Approved",
    rejected: "Rejected",
    published: "Published",
  };
  return labels[status] || status;
};

/**
 * Get status color for PDF
 */
const getStatusColor = (status: EventStatus): [number, number, number] => {
  const colors: Record<EventStatus, [number, number, number]> = {
    draft: [156, 163, 175], // gray
    pending_review: [251, 191, 36], // amber
    approved: [34, 197, 94], // green
    rejected: [239, 68, 68], // red
    published: [59, 130, 246], // blue
  };
  return colors[status] || [156, 163, 175];
};

export const exportService = {
  /**
   * Export events to iCalendar (.ics) format
   */
  toICS(
    events: ExportableEvent[],
    options: ExportOptions,
    userId?: string,
    isAdmin?: boolean
  ): ExportResult {
    try {
      const filteredEvents = filterEventsByScope(events, options.scope, userId, isAdmin);

      if (filteredEvents.length === 0) {
        return {
          success: false,
          error: "No events available for export with the selected criteria.",
          eventCount: 0,
        };
      }

      const timezone = options.timezone || "America/New_York";
      const orgName = options.organizationName;

      const icsContent: string[] = [
        "BEGIN:VCALENDAR",
        "VERSION:2.0",
        `PRODID:-//${orgName}//Events Calendar//EN`,
        "CALSCALE:GREGORIAN",
        "METHOD:PUBLISH",
        foldLine(`X-WR-CALNAME:${orgName} Events`),
        `X-WR-TIMEZONE:${timezone}`,
        // VTIMEZONE component for proper timezone handling
        "BEGIN:VTIMEZONE",
        `TZID:${timezone}`,
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

      filteredEvents.forEach((event) => {
        const start = parseISO(event.starts_at);
        const end = parseISO(event.ends_at);
        const uid = `${event.id}@${options.organizationSlug || "calendar"}.events`;

        const eventLines: string[] = [
          "BEGIN:VEVENT",
          foldLine(`UID:${uid}`),
          `DTSTAMP:${format(new Date(), "yyyyMMdd'T'HHmmss'Z'")}`,
          `DTSTART;TZID=${timezone}:${format(start, "yyyyMMdd'T'HHmmss")}`,
          `DTEND;TZID=${timezone}:${format(end, "yyyyMMdd'T'HHmmss")}`,
          foldLine(`SUMMARY:${escapeICalText(event.title)}`),
        ];

        if (options.includeDescription !== false && event.description) {
          eventLines.push(foldLine(`DESCRIPTION:${escapeICalText(event.description)}`));
        }

        if (options.includeLocation !== false && event.room?.name) {
          eventLines.push(foldLine(`LOCATION:${escapeICalText(event.room.name)}`));
        }

        if (options.includeOrganizer && event.creator?.full_name) {
          eventLines.push(foldLine(`ORGANIZER;CN=${escapeICalText(event.creator.full_name)}:mailto:${event.creator.email || "noreply@example.com"}`));
        }

        // Add recurrence rule if present
        if (event.is_recurring && event.recurrence_rule) {
          eventLines.push(foldLine(`RRULE:${event.recurrence_rule}`));
        }

        eventLines.push(
          `STATUS:${event.status === "published" ? "CONFIRMED" : "TENTATIVE"}`,
          "END:VEVENT"
        );

        icsContent.push(...eventLines);
      });

      icsContent.push("END:VCALENDAR");

      // Create and download file
      const blob = new Blob([icsContent.join("\r\n")], {
        type: "text/calendar;charset=utf-8",
      });
      const url = URL.createObjectURL(blob);
      const link = document.createElement("a");
      const filename = `${options.organizationSlug || "events"}-${options.scope}-${format(new Date(), "yyyy-MM-dd")}.ics`;
      link.href = url;
      link.download = filename;
      document.body.appendChild(link);
      link.click();
      document.body.removeChild(link);
      URL.revokeObjectURL(url);

      return {
        success: true,
        filename,
        eventCount: filteredEvents.length,
      };
    } catch (error) {
      console.error("Error exporting to ICS:", error);
      return {
        success: false,
        error: error instanceof Error ? error.message : "Failed to export calendar",
        eventCount: 0,
      };
    }
  },

  /**
   * Generate Google Calendar URL for adding a single event
   */
  toGoogleCalendarUrl(event: ExportableEvent, _options?: Partial<ExportOptions>): string {
    const start = parseISO(event.starts_at);
    const end = parseISO(event.ends_at);

    const params = new URLSearchParams({
      action: "TEMPLATE",
      text: event.title,
      dates: `${format(start, "yyyyMMdd'T'HHmmss")}/${format(end, "yyyyMMdd'T'HHmmss")}`,
    });

    if (event.description) {
      params.set("details", event.description);
    }

    if (event.room?.name) {
      params.set("location", event.room.name);
    }

    // Add recurrence if present
    if (event.is_recurring && event.recurrence_rule) {
      params.set("recur", `RRULE:${event.recurrence_rule}`);
    }

    return `https://calendar.google.com/calendar/render?${params.toString()}`;
  },

  /**
   * Generate Google Calendar subscribe URL (for public calendars)
   */
  toGoogleCalendarSubscribeUrl(icsUrl: string): string {
    return `https://calendar.google.com/calendar/r?cid=${encodeURIComponent(icsUrl)}`;
  },

  /**
   * Export events to PDF format with enterprise-grade formatting
   */
  toPDF(
    events: ExportableEvent[],
    options: ExportOptions,
    userId?: string,
    isAdmin?: boolean
  ): ExportResult {
    try {
      const filteredEvents = filterEventsByScope(events, options.scope, userId, isAdmin);

      if (filteredEvents.length === 0) {
        return {
          success: false,
          error: "No events available for export with the selected criteria.",
          eventCount: 0,
        };
      }

      // Create PDF document (A4 size)
      const doc = new jsPDF({
        orientation: "portrait",
        unit: "mm",
        format: "a4",
      });

      const pageWidth = doc.internal.pageSize.getWidth();
      const pageHeight = doc.internal.pageSize.getHeight();
      const margin = 15;
      let currentY = margin;

      // Helper function to add header
      const addHeader = () => {
        // Organization name
        doc.setFontSize(20);
        doc.setFont("helvetica", "bold");
        doc.setTextColor(30, 64, 175); // Blue color
        doc.text(options.organizationName, pageWidth / 2, currentY, { align: "center" });
        currentY += 10;

        // Report title
        doc.setFontSize(14);
        doc.setFont("helvetica", "normal");
        doc.setTextColor(100, 100, 100);
        const scopeLabel = options.scope === "both" ? "Approved & Published" :
                          options.scope === "all" ? "All Events" :
                          options.scope.charAt(0).toUpperCase() + options.scope.slice(1);
        doc.text(`${scopeLabel} Events Calendar`, pageWidth / 2, currentY, { align: "center" });
        currentY += 6;

        // Date range or generation date
        doc.setFontSize(10);
        if (options.dateRange) {
          doc.text(
            `${format(options.dateRange.start, "MMMM d, yyyy")} - ${format(options.dateRange.end, "MMMM d, yyyy")}`,
            pageWidth / 2,
            currentY,
            { align: "center" }
          );
        } else {
          doc.text(`Generated on ${format(new Date(), "MMMM d, yyyy 'at' h:mm a")}`, pageWidth / 2, currentY, { align: "center" });
        }
        currentY += 10;

        // Horizontal line
        doc.setDrawColor(200, 200, 200);
        doc.setLineWidth(0.5);
        doc.line(margin, currentY, pageWidth - margin, currentY);
        currentY += 8;
      };

      // Helper function to add footer
      const addFooter = (pageNum: number, totalPages: number) => {
        const footerY = pageHeight - 10;
        doc.setFontSize(8);
        doc.setTextColor(150, 150, 150);
        doc.text(`Page ${pageNum} of ${totalPages}`, pageWidth / 2, footerY, { align: "center" });
        doc.text(options.organizationName, margin, footerY);
        doc.text(format(new Date(), "MM/dd/yyyy"), pageWidth - margin, footerY, { align: "right" });
      };

      // Add header
      addHeader();

      // Sort events by date
      const sortedEvents = [...filteredEvents].sort(
        (a, b) => new Date(a.starts_at).getTime() - new Date(b.starts_at).getTime()
      );

      if (options.separateByStatus) {
        // Separate approved and published events
        const approvedEvents = sortedEvents.filter((e) => e.status === "approved");
        const publishedEvents = sortedEvents.filter((e) => e.status === "published");

        if (approvedEvents.length > 0) {
          // Approved Events Section
          doc.setFontSize(12);
          doc.setFont("helvetica", "bold");
          doc.setTextColor(34, 197, 94); // Green
          doc.text("APPROVED EVENTS", margin, currentY);
          currentY += 6;

          const approvedTableData = approvedEvents.map((event) => [
            format(parseISO(event.starts_at), "MMM d, yyyy"),
            `${format(parseISO(event.starts_at), "h:mm a")} - ${format(parseISO(event.ends_at), "h:mm a")}`,
            event.title,
            event.room?.name || "-",
            event.creator?.full_name || event.creator?.ministry_name || "-",
          ]);

          autoTable(doc, {
            startY: currentY,
            head: [["Date", "Time", "Event", "Room", "Organizer"]],
            body: approvedTableData,
            headStyles: {
              fillColor: [34, 197, 94],
              textColor: [255, 255, 255],
              fontStyle: "bold",
              fontSize: 9,
            },
            bodyStyles: {
              fontSize: 8,
              textColor: [50, 50, 50],
            },
            alternateRowStyles: {
              fillColor: [240, 253, 244],
            },
            columnStyles: {
              0: { cellWidth: 25 },
              1: { cellWidth: 35 },
              2: { cellWidth: 55 },
              3: { cellWidth: 30 },
              4: { cellWidth: 35 },
            },
            margin: { left: margin, right: margin },
            didDrawPage: () => {
              // This will be handled after all tables
            },
          });

          currentY = (doc as any).lastAutoTable.finalY + 12;
        }

        if (publishedEvents.length > 0) {
          // Check if we need a new page
          if (currentY > pageHeight - 60) {
            doc.addPage();
            currentY = margin;
          }

          // Published Events Section
          doc.setFontSize(12);
          doc.setFont("helvetica", "bold");
          doc.setTextColor(59, 130, 246); // Blue
          doc.text("PUBLISHED EVENTS", margin, currentY);
          currentY += 6;

          const publishedTableData = publishedEvents.map((event) => [
            format(parseISO(event.starts_at), "MMM d, yyyy"),
            `${format(parseISO(event.starts_at), "h:mm a")} - ${format(parseISO(event.ends_at), "h:mm a")}`,
            event.title,
            event.room?.name || "-",
            event.creator?.full_name || event.creator?.ministry_name || "-",
          ]);

          autoTable(doc, {
            startY: currentY,
            head: [["Date", "Time", "Event", "Room", "Organizer"]],
            body: publishedTableData,
            headStyles: {
              fillColor: [59, 130, 246],
              textColor: [255, 255, 255],
              fontStyle: "bold",
              fontSize: 9,
            },
            bodyStyles: {
              fontSize: 8,
              textColor: [50, 50, 50],
            },
            alternateRowStyles: {
              fillColor: [239, 246, 255],
            },
            columnStyles: {
              0: { cellWidth: 25 },
              1: { cellWidth: 35 },
              2: { cellWidth: 55 },
              3: { cellWidth: 30 },
              4: { cellWidth: 35 },
            },
            margin: { left: margin, right: margin },
          });
        }
      } else {
        // Combined view with status indicator
        const tableData = sortedEvents.map((event) => [
          format(parseISO(event.starts_at), "MMM d, yyyy"),
          `${format(parseISO(event.starts_at), "h:mm a")} - ${format(parseISO(event.ends_at), "h:mm a")}`,
          event.title,
          event.room?.name || "-",
          getStatusLabel(event.status),
          event.creator?.full_name || event.creator?.ministry_name || "-",
        ]);

        autoTable(doc, {
          startY: currentY,
          head: [["Date", "Time", "Event", "Room", "Status", "Organizer"]],
          body: tableData,
          headStyles: {
            fillColor: [30, 64, 175],
            textColor: [255, 255, 255],
            fontStyle: "bold",
            fontSize: 9,
          },
          bodyStyles: {
            fontSize: 8,
            textColor: [50, 50, 50],
          },
          alternateRowStyles: {
            fillColor: [248, 250, 252],
          },
          columnStyles: {
            0: { cellWidth: 22 },
            1: { cellWidth: 32 },
            2: { cellWidth: 45 },
            3: { cellWidth: 25 },
            4: { cellWidth: 22 },
            5: { cellWidth: 32 },
          },
          margin: { left: margin, right: margin },
          didParseCell: (data) => {
            // Color code status column
            if (data.section === "body" && data.column.index === 4) {
              const status = sortedEvents[data.row.index]?.status;
              if (status) {
                const color = getStatusColor(status);
                data.cell.styles.textColor = color;
                data.cell.styles.fontStyle = "bold";
              }
            }
          },
        });
      }

      // Add page numbers
      const totalPages = doc.getNumberOfPages();
      for (let i = 1; i <= totalPages; i++) {
        doc.setPage(i);
        addFooter(i, totalPages);
      }

      // Summary section on last page
      doc.setPage(totalPages);
      const summaryY = (doc as any).lastAutoTable?.finalY + 15 || pageHeight - 50;

      if (summaryY < pageHeight - 30) {
        doc.setFontSize(10);
        doc.setFont("helvetica", "bold");
        doc.setTextColor(100, 100, 100);
        doc.text("Summary", margin, summaryY);

        doc.setFont("helvetica", "normal");
        doc.setFontSize(9);
        doc.text(`Total Events: ${filteredEvents.length}`, margin, summaryY + 5);

        if (options.scope === "both" || options.scope === "all") {
          const approvedCount = filteredEvents.filter((e) => e.status === "approved").length;
          const publishedCount = filteredEvents.filter((e) => e.status === "published").length;
          doc.text(`Approved: ${approvedCount} | Published: ${publishedCount}`, margin, summaryY + 10);
        }
      }

      // Save PDF
      const filename = `${options.organizationSlug || "events"}-${options.scope}-${format(new Date(), "yyyy-MM-dd")}.pdf`;
      doc.save(filename);

      return {
        success: true,
        filename,
        eventCount: filteredEvents.length,
      };
    } catch (error) {
      console.error("Error exporting to PDF:", error);
      return {
        success: false,
        error: error instanceof Error ? error.message : "Failed to generate PDF",
        eventCount: 0,
      };
    }
  },

  /**
   * Export events based on format selection
   */
  export(
    events: ExportableEvent[],
    options: ExportOptions,
    userId?: string,
    isAdmin?: boolean
  ): ExportResult {
    switch (options.format) {
      case "ics":
        return this.toICS(events, options, userId, isAdmin);
      case "pdf":
        return this.toPDF(events, options, userId, isAdmin);
      case "google":
        // For Google, we generate URLs for individual events
        // This returns the URL for the first event as an example
        if (events.length > 0) {
          const filteredEvents = filterEventsByScope(events, options.scope, userId, isAdmin);
          if (filteredEvents.length === 0) {
            return {
              success: false,
              error: "No events available for export.",
              eventCount: 0,
            };
          }
          return {
            success: true,
            url: this.toGoogleCalendarUrl(filteredEvents[0], options),
            eventCount: filteredEvents.length,
          };
        }
        return {
          success: false,
          error: "No events to export.",
          eventCount: 0,
        };
      default:
        return {
          success: false,
          error: "Unsupported export format.",
          eventCount: 0,
        };
    }
  },
};
