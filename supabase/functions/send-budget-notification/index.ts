import { serve } from "https://deno.land/std@0.168.0/http/server.ts";

const RESEND_API_KEY = Deno.env.get("RESEND_API");
const RESEND_FROM_EMAIL =
  Deno.env.get("RESEND_FROM_EMAIL") || "ALIC Finance <finance@addislidet.info>";
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

type NotificationType =
  | "expense_submitted"
  | "expense_leader_approved"
  | "expense_leader_denied"
  | "expense_treasury_approved"
  | "expense_treasury_denied"
  | "expense_completed"
  | "expense_cancelled"
  | "allocation_submitted"
  | "allocation_approved"
  | "allocation_denied"
  | "budget_alert";

interface BudgetNotificationRequest {
  to: string;
  recipientName: string;
  notificationType: NotificationType;
  expenseTitle?: string;
  expenseAmount?: number;
  ministryName?: string;
  requesterName?: string;
  reviewerName?: string;
  reviewerNotes?: string;
  paymentReference?: string;
  alertMessage?: string;
  actionUrl?: string;
}

const formatCurrency = (amount: number): string => {
  return new Intl.NumberFormat("en-US", {
    style: "currency",
    currency: "USD",
  }).format(amount);
};

const getNotificationContent = (
  request: BudgetNotificationRequest
): {
  subject: string;
  heading: string;
  message: string;
  statusColor: string;
  statusBadge: string;
  showActionButton: boolean;
  actionButtonText: string;
} => {
  const {
    notificationType,
    expenseTitle,
    expenseAmount,
    ministryName,
    requesterName,
    reviewerName,
    paymentReference,
    alertMessage,
  } = request;

  const amountStr = expenseAmount ? formatCurrency(expenseAmount) : "";

  switch (notificationType) {
    case "expense_submitted":
      return {
        subject: `New Expense Request: ${expenseTitle}`,
        heading: "New Expense Request Pending Your Review",
        message: `${requesterName} from ${ministryName} has submitted an expense request for "${expenseTitle}" (${amountStr}). This request requires your review and approval.`,
        statusColor: "#f59e0b",
        statusBadge: "PENDING REVIEW",
        showActionButton: true,
        actionButtonText: "Review Request",
      };

    case "expense_leader_approved":
      return {
        subject: `Expense Approved: ${expenseTitle}`,
        heading: "Your Expense Request Has Been Approved",
        message: `Great news! Your expense request for "${expenseTitle}" (${amountStr}) has been approved by ${reviewerName}. It will now proceed to treasury for payment approval.`,
        statusColor: "#22c55e",
        statusBadge: "LEADER APPROVED",
        showActionButton: false,
        actionButtonText: "",
      };

    case "expense_leader_denied":
      return {
        subject: `Expense Denied: ${expenseTitle}`,
        heading: "Expense Request Update",
        message: `Your expense request for "${expenseTitle}" (${amountStr}) was not approved by ${reviewerName}. Please review the notes below for more information.`,
        statusColor: "#ef4444",
        statusBadge: "DENIED",
        showActionButton: false,
        actionButtonText: "",
      };

    case "expense_treasury_approved":
      return {
        subject: `Payment Approved: ${expenseTitle}`,
        heading: "Payment Has Been Approved",
        message: `The payment for "${expenseTitle}" (${amountStr}) has been approved by treasury. The finance team will process your payment shortly.`,
        statusColor: "#3b82f6",
        statusBadge: "PAYMENT APPROVED",
        showActionButton: false,
        actionButtonText: "",
      };

    case "expense_treasury_denied":
      return {
        subject: `Payment Denied: ${expenseTitle}`,
        heading: "Payment Request Update",
        message: `The payment for "${expenseTitle}" (${amountStr}) was not approved by treasury. Please review the notes below.`,
        statusColor: "#ef4444",
        statusBadge: "PAYMENT DENIED",
        showActionButton: false,
        actionButtonText: "",
      };

    case "expense_completed":
      return {
        subject: `Payment Complete: ${expenseTitle}`,
        heading: "Your Payment Has Been Processed",
        message: `Your expense request for "${expenseTitle}" (${amountStr}) has been fully processed. Payment reference: ${
          paymentReference || "N/A"
        }.`,
        statusColor: "#22c55e",
        statusBadge: "COMPLETED",
        showActionButton: false,
        actionButtonText: "",
      };

    case "expense_cancelled":
      return {
        subject: `Expense Cancelled: ${expenseTitle}`,
        heading: "Expense Request Cancelled",
        message: `The expense request for "${expenseTitle}" (${amountStr}) has been cancelled.`,
        statusColor: "#6b7280",
        statusBadge: "CANCELLED",
        showActionButton: false,
        actionButtonText: "",
      };

    case "allocation_submitted":
      return {
        subject: `New Budget Request: ${ministryName}`,
        heading: "New Budget Request",
        message: `${requesterName} from ${ministryName} has submitted a budget request for ${amountStr}. This request requires your review.`,
        statusColor: "#8b5cf6",
        statusBadge: "PENDING REVIEW",
        showActionButton: true,
        actionButtonText: "Review Request",
      };

    case "allocation_approved":
      return {
        subject: `Budget Allocation Approved: ${ministryName}`,
        heading: "Budget Allocation Approved",
        message: `Your budget allocation request for ${ministryName} (${amountStr}) has been approved.`,
        statusColor: "#22c55e",
        statusBadge: "APPROVED",
        showActionButton: false,
        actionButtonText: "",
      };

    case "allocation_denied":
      return {
        subject: `Budget Allocation Denied: ${ministryName}`,
        heading: "Budget Allocation Update",
        message: `Your budget allocation request for ${ministryName} (${amountStr}) was not approved. Please review the notes below.`,
        statusColor: "#ef4444",
        statusBadge: "DENIED",
        showActionButton: false,
        actionButtonText: "",
      };

    case "budget_alert":
      return {
        subject: `Budget Alert: ${ministryName}`,
        heading: "Budget Alert",
        message:
          alertMessage ||
          `There is an important update regarding the budget for ${ministryName}.`,
        statusColor: "#f59e0b",
        statusBadge: "ALERT",
        showActionButton: true,
        actionButtonText: "View Budget",
      };

    default:
      return {
        subject: `Budget Update`,
        heading: "Budget System Update",
        message: "There is an update in the budget system.",
        statusColor: "#3b82f6",
        statusBadge: "UPDATE",
        showActionButton: false,
        actionButtonText: "",
      };
  }
};

serve(async (req) => {
  if (req.method === "OPTIONS") {
    return new Response("ok", { headers: corsHeaders });
  }

  try {
    const requestBody: BudgetNotificationRequest = await req.json();
    console.log(
      "Budget notification request received:",
      JSON.stringify(requestBody, null, 2)
    );

    const { to, recipientName, reviewerNotes, actionUrl } = requestBody;

    if (!to || !recipientName) {
      console.error("Missing required fields");
      return new Response(
        JSON.stringify({ error: "Missing required fields: to, recipientName" }),
        {
          status: 400,
          headers: { ...corsHeaders, "Content-Type": "application/json" },
        }
      );
    }

    const content = getNotificationContent(requestBody);

    const htmlBody = `
<!DOCTYPE html>
<html lang="en">
<head>
  <meta charset="UTF-8">
  <meta name="viewport" content="width=device-width, initial-scale=1.0">
  <title>${content.subject}</title>
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
                      ${content.heading}
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
              <div style="display: inline-block; background-color: ${
                content.statusColor
              }; color: #ffffff; padding: 8px 20px; border-radius: 20px; font-size: 12px; font-weight: 700; letter-spacing: 0.5px;">
                ${content.statusBadge}
              </div>
            </td>
          </tr>

          <!-- Main Message -->
          <tr>
            <td style="padding: 0 30px 30px;">
              <p style="margin: 0 0 20px; color: #374151; font-size: 16px; line-height: 1.6;">
                Hello ${recipientName},
              </p>
              <p style="margin: 0 0 20px; color: #374151; font-size: 16px; line-height: 1.6;">
                ${content.message}
              </p>
            </td>
          </tr>

          ${
            requestBody.expenseAmount
              ? `
          <!-- Amount Display -->
          <tr>
            <td style="padding: 0 30px 30px;">
              <table role="presentation" cellspacing="0" cellpadding="0" border="0" width="100%" style="background-color: #f0fdf4; border-radius: 8px; border: 1px solid #86efac;">
                <tr>
                  <td style="padding: 20px; text-align: center;">
                    <p style="margin: 0 0 5px; color: #15803d; font-size: 14px; font-weight: 600;">Amount</p>
                    <p style="margin: 0; color: #166534; font-size: 28px; font-weight: 700;">${formatCurrency(
                      requestBody.expenseAmount
                    )}</p>
                  </td>
                </tr>
              </table>
            </td>
          </tr>
          `
              : ""
          }

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
                      Notes from Reviewer
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

          ${
            content.showActionButton && actionUrl
              ? `
          <!-- Action Button -->
          <tr>
            <td style="padding: 0 30px 30px; text-align: center;">
              <a href="${actionUrl}" style="display: inline-block; background-color: #10b981; color: #ffffff; padding: 14px 32px; border-radius: 8px; font-size: 16px; font-weight: 600; text-decoration: none;">
                ${content.actionButtonText}
              </a>
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
                      Budget Management System
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

    console.log("Sending budget notification email via Resend API...");

    const res = await fetch("https://api.resend.com/emails", {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
        Authorization: `Bearer ${RESEND_API_KEY}`,
      },
      body: JSON.stringify({
        from: RESEND_FROM_EMAIL,
        to: [to],
        subject: content.subject,
        html: htmlBody,
      }),
    });

    const data = await res.json();

    console.log("Resend API response status:", res.status);
    console.log("Resend API response:", JSON.stringify(data));

    if (res.ok) {
      console.log("Budget notification email sent successfully to:", to);
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
    console.error("Error in send-budget-notification function:", error);
    const errorMessage =
      error instanceof Error ? error.message : "Unknown error occurred";
    return new Response(JSON.stringify({ error: errorMessage }), {
      status: 500,
      headers: { ...corsHeaders, "Content-Type": "application/json" },
    });
  }
});
