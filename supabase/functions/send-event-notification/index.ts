import { serve } from "https://deno.land/std@0.168.0/http/server.ts";

const RESEND_API_KEY = Deno.env.get("RESEND_API");

interface EventNotificationRequest {
  to: string;
  eventTitle: string;
  eventStartTime: string;
  eventEndTime: string;
  roomName: string;
  status: "approved" | "rejected" | "published" | "unapproved";
  requesterName: string;
  reviewerNotes?: string;
}

serve(async (req) => {
  try {
    const {
      to,
      eventTitle,
      eventStartTime,
      eventEndTime,
      roomName,
      status,
      requesterName,
      reviewerNotes,
    }: EventNotificationRequest = await req.json();

    if (!to || !eventTitle || !status) {
      return new Response(
        JSON.stringify({ error: "Missing required fields" }),
        {
          status: 400,
          headers: { "Content-Type": "application/json" },
        }
      );
    }

    // Generate email content based on status
    let subject = "";
    let heading = "";
    let message = "";
    let statusColor = "";
    let statusBadge = "";

    switch (status) {
      case "approved":
      case "published":
        subject = `Event Approved: ${eventTitle}`;
        heading = "Your Event Has Been Approved! 🎉";
        message = `Great news! Your event request for "${eventTitle}" has been approved and published to the calendar.`;
        statusColor = "#22c55e";
        statusBadge = "APPROVED & PUBLISHED";
        break;
      case "rejected":
        subject = `Event Update: ${eventTitle}`;
        heading = "Event Status Update";
        message = `Thank you for submitting your event request for "${eventTitle}". After review, we are unable to approve this event at this time.`;
        statusColor = "#ef4444";
        statusBadge = "REJECTED";
        break;
      case "unapproved":
        subject = `Event Status Changed: ${eventTitle}`;
        heading = "Event Moved to Pending Review";
        message = `Your event "${eventTitle}" has been moved back to pending review status. You may be contacted for additional information.`;
        statusColor = "#f59e0b";
        statusBadge = "PENDING REVIEW";
        break;
      default:
        subject = `Event Update: ${eventTitle}`;
        heading = "Event Status Update";
        message = `Your event "${eventTitle}" status has been updated.`;
        statusColor = "#3b82f6";
        statusBadge = "UPDATED";
    }

    const htmlBody = `
<!DOCTYPE html>
<html lang="en">
<head>
  <meta charset="UTF-8">
  <meta name="viewport" content="width=device-width, initial-scale=1.0">
  <title>${subject}</title>
</head>
<body style="margin: 0; padding: 0; font-family: -apple-system, BlinkMacSystemFont, 'Segoe UI', Roboto, 'Helvetica Neue', Arial, sans-serif; background-color: #f3f4f6;">
  <table role="presentation" cellspacing="0" cellpadding="0" border="0" width="100%" style="background-color: #f3f4f6; padding: 40px 0;">
    <tr>
      <td align="center">
        <table role="presentation" cellspacing="0" cellpadding="0" border="0" width="600" style="max-width: 600px; background-color: #ffffff; border-radius: 12px; overflow: hidden; box-shadow: 0 4px 6px rgba(0, 0, 0, 0.1);">

          <!-- Header with Gradient -->
          <tr>
            <td style="background: linear-gradient(135deg, #667eea 0%, #764ba2 100%); padding: 40px 30px; text-align: center;">
              <h1 style="margin: 0; color: #ffffff; font-size: 28px; font-weight: 700; letter-spacing: -0.5px;">
                ${heading}
              </h1>
            </td>
          </tr>

          <!-- Status Badge -->
          <tr>
            <td style="padding: 30px 30px 20px; text-align: center;">
              <div style="display: inline-block; background-color: ${statusColor}; color: #ffffff; padding: 8px 20px; border-radius: 20px; font-size: 12px; font-weight: 700; letter-spacing: 0.5px;">
                ${statusBadge}
              </div>
            </td>
          </tr>

          <!-- Main Message -->
          <tr>
            <td style="padding: 0 30px 30px;">
              <p style="margin: 0 0 20px; color: #374151; font-size: 16px; line-height: 1.6;">
                Hello ${requesterName},
              </p>
              <p style="margin: 0 0 20px; color: #374151; font-size: 16px; line-height: 1.6;">
                ${message}
              </p>
            </td>
          </tr>

          <!-- Event Details Card -->
          <tr>
            <td style="padding: 0 30px 30px;">
              <table role="presentation" cellspacing="0" cellpadding="0" border="0" width="100%" style="background-color: #f9fafb; border-radius: 8px; border: 1px solid #e5e7eb;">
                <tr>
                  <td style="padding: 20px;">
                    <h3 style="margin: 0 0 15px; color: #1f2937; font-size: 18px; font-weight: 600;">
                      Event Details
                    </h3>
                    <table role="presentation" cellspacing="0" cellpadding="0" border="0" width="100%">
                      <tr>
                        <td style="padding: 8px 0; color: #6b7280; font-size: 14px; font-weight: 600;">
                          Event:
                        </td>
                        <td style="padding: 8px 0; color: #1f2937; font-size: 14px; text-align: right;">
                          ${eventTitle}
                        </td>
                      </tr>
                      <tr>
                        <td style="padding: 8px 0; color: #6b7280; font-size: 14px; font-weight: 600;">
                          Room:
                        </td>
                        <td style="padding: 8px 0; color: #1f2937; font-size: 14px; text-align: right;">
                          ${roomName}
                        </td>
                      </tr>
                      <tr>
                        <td style="padding: 8px 0; color: #6b7280; font-size: 14px; font-weight: 600;">
                          Start Time:
                        </td>
                        <td style="padding: 8px 0; color: #1f2937; font-size: 14px; text-align: right;">
                          ${eventStartTime}
                        </td>
                      </tr>
                      <tr>
                        <td style="padding: 8px 0; color: #6b7280; font-size: 14px; font-weight: 600;">
                          End Time:
                        </td>
                        <td style="padding: 8px 0; color: #1f2937; font-size: 14px; text-align: right;">
                          ${eventEndTime}
                        </td>
                      </tr>
                    </table>
                  </td>
                </tr>
              </table>
            </td>
          </tr>

          ${
            reviewerNotes
              ? `
          <!-- Reviewer Notes -->
          <tr>
            <td style="padding: 0 30px 30px;">
              <table role="presentation" cellspacing="0" cellpadding="0" border="0" width="100%" style="background-color: #fef3c7; border-radius: 8px; border-left: 4px solid #f59e0b;">
                <tr>
                  <td style="padding: 20px;">
                    <h4 style="margin: 0 0 10px; color: #92400e; font-size: 14px; font-weight: 700; text-transform: uppercase; letter-spacing: 0.5px;">
                      Reviewer Notes
                    </h4>
                    <p style="margin: 0; color: #78350f; font-size: 14px; line-height: 1.5;">
                      ${reviewerNotes}
                    </p>
                  </td>
                </tr>
              </table>
            </td>
          </tr>
          `
              : ""
          }

          <!-- Call to Action -->
          ${
            status === "approved" || status === "published"
              ? `
          <tr>
            <td style="padding: 0 30px 30px; text-align: center;">
              <p style="margin: 0 0 15px; color: #6b7280; font-size: 14px;">
                Your event is now visible on the calendar
              </p>
            </td>
          </tr>
          `
              : ""
          }

          ${
            status === "rejected" && reviewerNotes
              ? `
          <tr>
            <td style="padding: 0 30px 30px;">
              <p style="margin: 0; color: #6b7280; font-size: 14px; line-height: 1.6;">
                If you have questions about this decision or would like to resubmit with modifications, please contact the calendar administrator.
              </p>
            </td>
          </tr>
          `
              : ""
          }

          <!-- Footer -->
          <tr>
            <td style="padding: 30px; background-color: #f9fafb; border-top: 1px solid #e5e7eb; text-align: center;">
              <p style="margin: 0 0 10px; color: #6b7280; font-size: 12px;">
                This is an automated notification from ALIC Event Approval System
              </p>
              <p style="margin: 0; color: #9ca3af; font-size: 12px;">
                Please do not reply to this email
              </p>
            </td>
          </tr>
        </table>
      </td>
    </tr>
  </table>
</body>
</html>
    `;

    // Send email using Resend
    const res = await fetch("https://api.resend.com/emails", {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
        Authorization: `Bearer ${RESEND_API_KEY}`,
      },
      body: JSON.stringify({
        from: "Event Calendar <onboarding@resend.dev>",
        to: [to],
        subject: subject,
        html: htmlBody,
      }),
    });

    const data = await res.json();

    if (res.ok) {
      return new Response(JSON.stringify({ success: true, data }), {
        status: 200,
        headers: { "Content-Type": "application/json" },
      });
    } else {
      return new Response(
        JSON.stringify({ error: "Failed to send email", details: data }),
        {
          status: res.status,
          headers: { "Content-Type": "application/json" },
        }
      );
    }
  } catch (error) {
    return new Response(JSON.stringify({ error: error.message }), {
      status: 500,
      headers: { "Content-Type": "application/json" },
    });
  }
});
