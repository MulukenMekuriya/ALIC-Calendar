import { serve } from "https://deno.land/std@0.168.0/http/server.ts";

const RESEND_API_KEY = Deno.env.get("RESEND_API");
const RESEND_FROM_EMAIL =
  Deno.env.get("RESEND_FROM_EMAIL") || "Event Calendar <team@addislidet.info>";
const CHURCH_NAME =
  Deno.env.get("CHURCH_NAME") || "Addis Lidet International Church";
const CHURCH_LOGO_URL =
  Deno.env.get("CHURCH_LOGO_URL") || "https://addislidet.info/logo.png";
const APP_URL = Deno.env.get("APP_URL") || "https://app.addislidet.info";

const corsHeaders = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers":
    "authorization, x-client-info, apikey, content-type",
};

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
  // Handle CORS preflight requests
  if (req.method === "OPTIONS") {
    return new Response("ok", { headers: corsHeaders });
  }

  try {
    const requestBody = await req.json();
    console.log(
      "Email notification request received:",
      JSON.stringify(requestBody, null, 2)
    );

    const {
      to,
      eventTitle,
      eventStartTime,
      eventEndTime,
      roomName,
      status,
      requesterName,
      reviewerNotes,
    }: EventNotificationRequest = requestBody;

    if (!to || !eventTitle || !status) {
      console.error("Missing required fields:", {
        to: !!to,
        eventTitle: !!eventTitle,
        status: !!status,
      });
      return new Response(
        JSON.stringify({ error: "Missing required fields" }),
        {
          status: 400,
          headers: { ...corsHeaders, "Content-Type": "application/json" },
        }
      );
    }

    console.log(
      `Preparing to send ${status} notification to ${to} for event: ${eventTitle}`
    );

    // Generate email content based on status
    let subject = "";
    let heading = "";
    let message = "";
    let statusColor = "";
    let statusBadge = "";

    switch (status) {
      case "approved":
        subject = `Event Approved: ${eventTitle}`;
        heading = "Your Event Has Been Approved! 🎉";
        message = `Great news! Your event request for "${eventTitle}" has been approved. It will be published to the calendar soon.`;
        statusColor = "#22c55e";
        statusBadge = "APPROVED";
        break;
      case "published":
        subject = `Event Published: ${eventTitle}`;
        heading = "Your Event Has Been Published! 🎉";
        message = `Your event "${eventTitle}" has been published to the calendar and is now visible to everyone.`;
        statusColor = "#3b82f6";
        statusBadge = "PUBLISHED";
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
  <!--[if mso]>
  <noscript>
    <xml>
      <o:OfficeDocumentSettings>
        <o:PixelsPerInch>96</o:PixelsPerInch>
      </o:OfficeDocumentSettings>
    </xml>
  </noscript>
  <![endif]-->
</head>
<body style="margin: 0; padding: 0; font-family: -apple-system, BlinkMacSystemFont, 'Segoe UI', Roboto, 'Helvetica Neue', Arial, sans-serif; background-color: #f3f4f6; -webkit-font-smoothing: antialiased; -moz-osx-font-smoothing: grayscale;">
  <table role="presentation" cellspacing="0" cellpadding="0" border="0" width="100%" style="background-color: #f3f4f6; padding: 40px 20px;">
    <tr>
      <td align="center">
        <table role="presentation" cellspacing="0" cellpadding="0" border="0" width="600" style="max-width: 600px; background-color: #ffffff; border-radius: 16px; overflow: hidden; box-shadow: 0 10px 40px rgba(0, 0, 0, 0.1);">

          <!-- Church Branding Header -->
          <tr>
            <td style="background: linear-gradient(135deg, #b22222 0%, #8b0000 100%); padding: 48px 40px; text-align: center; position: relative;">
              <table role="presentation" cellspacing="0" cellpadding="0" border="0" width="100%">
                <tr>
                  <td align="center">
                    <!-- Logo Container -->
                    <div style="background: rgba(255, 255, 255, 0.15); backdrop-filter: blur(10px); width: 96px; height: 96px; border-radius: 24px; margin: 0 auto 20px; display: inline-flex; align-items: center; justify-content: center; box-shadow: 0 8px 32px rgba(0,0,0,0.1);">
                      <img src="${CHURCH_LOGO_URL}" alt="${CHURCH_NAME}" style="width: 80px; height: 80px; border-radius: 16px; display: block;" />
                    </div>
                  </td>
                </tr>
                <tr>
                  <td align="center">
                    <h1 style="margin: 0; color: #ffffff; font-size: 28px; font-weight: 700; letter-spacing: -0.5px; text-shadow: 0 2px 4px rgba(0,0,0,0.1);">
                      ${heading}
                    </h1>
                  </td>
                </tr>
                <tr>
                  <td align="center">
                    <p style="margin: 12px 0 0; color: rgba(255, 255, 255, 0.9); font-size: 14px; font-weight: 500; letter-spacing: 0.5px;">
                      ${CHURCH_NAME}
                    </p>
                  </td>
                </tr>
              </table>
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
            status === "published"
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
            <td style="padding: 40px 30px; background: linear-gradient(180deg, #f9fafb 0%, #f3f4f6 100%); border-top: 1px solid #e5e7eb; text-align: center;">
              <table role="presentation" cellspacing="0" cellpadding="0" border="0" width="100%">
                <tr>
                  <td align="center">
                    <img src="${CHURCH_LOGO_URL}" alt="${CHURCH_NAME}" style="width: 48px; height: 48px; border-radius: 12px; margin-bottom: 16px; display: block; margin-left: auto; margin-right: auto;" />
                  </td>
                </tr>
                <tr>
                  <td align="center">
                    <p style="margin: 0 0 8px; color: #1f2937; font-size: 14px; font-weight: 600;">
                      ${CHURCH_NAME}
                    </p>
                  </td>
                </tr>
                <tr>
                  <td align="center">
                    <p style="margin: 0 0 16px; color: #6b7280; font-size: 12px; line-height: 1.5;">
                      Event Calendar & Room Booking System
                    </p>
                  </td>
                </tr>
                <tr>
                  <td align="center" style="padding-top: 16px; border-top: 1px solid #e5e7eb;">
                    <p style="margin: 0 0 8px; color: #9ca3af; font-size: 11px;">
                      This is an automated notification. Please do not reply to this email.
                    </p>
                    <p style="margin: 0; color: #9ca3af; font-size: 11px;">
                      © ${new Date().getFullYear()} ${CHURCH_NAME}. All rights reserved.
                    </p>
                  </td>
                </tr>
              </table>
            </td>
          </tr>
        </table>
      </td>
    </tr>
  </table>
</body>
</html>
    `;

    // Check if RESEND_API_KEY is configured
    if (!RESEND_API_KEY) {
      console.error("RESEND_API_KEY is not configured");
      return new Response(
        JSON.stringify({ error: "Email service not configured" }),
        {
          status: 500,
          headers: { ...corsHeaders, "Content-Type": "application/json" },
        }
      );
    }

    console.log("Sending email via Resend API...");

    // Send email using Resend
    const emailPayload = {
      from: RESEND_FROM_EMAIL,
      to: [to],
      subject: subject,
      html: htmlBody,
    };

    console.log(
      "Email payload:",
      JSON.stringify({ ...emailPayload, html: "[HTML CONTENT]" })
    );

    const res = await fetch("https://api.resend.com/emails", {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
        Authorization: `Bearer ${RESEND_API_KEY}`,
      },
      body: JSON.stringify(emailPayload),
    });

    const data = await res.json();

    console.log("Resend API response status:", res.status);
    console.log("Resend API response:", JSON.stringify(data));

    if (res.ok) {
      console.log("Email sent successfully to:", to);
      return new Response(JSON.stringify({ success: true, data }), {
        status: 200,
        headers: { ...corsHeaders, "Content-Type": "application/json" },
      });
    } else {
      console.error("Failed to send email:", data);
      return new Response(
        JSON.stringify({ error: "Failed to send email", details: data }),
        {
          status: res.status,
          headers: { ...corsHeaders, "Content-Type": "application/json" },
        }
      );
    }
  } catch (error) {
    console.error("Error in send-event-notification function:", error);
    const errorMessage =
      error instanceof Error ? error.message : "Unknown error occurred";
    return new Response(JSON.stringify({ error: errorMessage }), {
      status: 500,
      headers: { ...corsHeaders, "Content-Type": "application/json" },
    });
  }
});
