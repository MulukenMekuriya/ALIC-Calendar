/**
 * Handle Workflow Notification
 *
 * Server-side edge function triggered by PostgreSQL triggers on status changes.
 * Determines who to notify (requester + next reviewer) and sends emails via Resend.
 *
 * NOTE: The notification logic is duplicated in notification-logic.test.ts for unit testing.
 * If you change the logic here, update the test file to match.
 */

import { serve } from "https://deno.land/std@0.168.0/http/server.ts";
import { createClient } from "https://esm.sh/@supabase/supabase-js@2";

// ─── Configuration ───────────────────────────────────────────────────────────

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

// ─── Types ───────────────────────────────────────────────────────────────────

interface TriggerPayload {
  table: "expense_requests" | "allocation_requests";
  record_id: string;
  old_status: string;
  new_status: string;
}

interface EmailRecipient {
  email: string;
  name: string;
}

interface EmailContent {
  subject: string;
  heading: string;
  message: string;
  statusColor: string;
  statusBadge: string;
  amount?: number;
  reviewerNotes?: string;
  showActionButton: boolean;
  actionButtonText: string;
  actionUrl?: string;
}

// ─── Helpers ─────────────────────────────────────────────────────────────────

const formatCurrency = (amount: number): string =>
  new Intl.NumberFormat("en-US", { style: "currency", currency: "USD" }).format(
    amount
  );

function createAdminClient() {
  return createClient(
    Deno.env.get("SUPABASE_URL")!,
    Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!
  );
}

// ─── DB Queries ──────────────────────────────────────────────────────────────

async function getExpenseRecord(supabase: ReturnType<typeof createClient>, recordId: string) {
  // Get expense with ministry name
  const { data: expense, error: expError } = await supabase
    .schema("budget")
    .from("expense_requests")
    .select("*, ministries(name)")
    .eq("id", recordId)
    .single();

  if (expError || !expense) {
    console.error("Failed to fetch expense record:", expError);
    return null;
  }

  // Get requester profile (for email)
  const { data: requesterProfile } = await supabase
    .from("profiles")
    .select("email, full_name")
    .eq("id", expense.requester_id)
    .single();

  // Get reviewer profile if applicable
  let reviewerName: string | null = null;
  let reviewerNotes: string | null = null;

  if (expense.leader_reviewer_id) {
    const { data: reviewerProfile } = await supabase
      .from("profiles")
      .select("full_name")
      .eq("id", expense.leader_reviewer_id)
      .single();
    reviewerName = reviewerProfile?.full_name || null;
    reviewerNotes = expense.leader_notes;
  }

  if (expense.treasury_reviewer_id) {
    const { data: treasuryProfile } = await supabase
      .from("profiles")
      .select("full_name")
      .eq("id", expense.treasury_reviewer_id)
      .single();
    // Use treasury reviewer info for treasury-stage transitions
    if (
      expense.status === "treasury_approved" ||
      expense.status === "treasury_denied"
    ) {
      reviewerName = treasuryProfile?.full_name || null;
      reviewerNotes = expense.treasury_notes;
    }
  }

  if (expense.finance_processor_id && expense.status === "completed") {
    const { data: financeProfile } = await supabase
      .from("profiles")
      .select("full_name")
      .eq("id", expense.finance_processor_id)
      .single();
    reviewerName = financeProfile?.full_name || null;
    reviewerNotes = expense.finance_notes;
  }

  return {
    id: expense.id,
    title: expense.title,
    amount: Number(expense.amount),
    ministryName: expense.ministries?.name || "Unknown Ministry",
    organizationId: expense.organization_id,
    requesterName: expense.requester_name,
    requesterEmail: requesterProfile?.email || expense.requester_email || null,
    reviewerName,
    reviewerNotes,
    paymentReference: expense.payment_reference,
  };
}

async function getAllocationRecord(supabase: ReturnType<typeof createClient>, recordId: string) {
  const { data: allocation, error } = await supabase
    .schema("budget")
    .from("allocation_requests")
    .select("*, ministries(name)")
    .eq("id", recordId)
    .single();

  if (error || !allocation) {
    console.error("Failed to fetch allocation record:", error);
    return null;
  }

  // Get requester profile
  const { data: requesterProfile } = await supabase
    .from("profiles")
    .select("email, full_name")
    .eq("id", allocation.requester_id)
    .single();

  return {
    id: allocation.id,
    ministryName: allocation.ministries?.name || "Unknown Ministry",
    organizationId: allocation.organization_id,
    requesterName: allocation.requester_name || requesterProfile?.full_name || "Unknown",
    requesterEmail: requesterProfile?.email || null,
    requestedAmount: Number(allocation.requested_amount),
    approvedAmount: allocation.approved_amount ? Number(allocation.approved_amount) : null,
    adminNotes: allocation.admin_notes,
  };
}

async function getUsersByRole(
  supabase: ReturnType<typeof createClient>,
  organizationId: string,
  role: string
): Promise<EmailRecipient[]> {
  // Step 1: Get user IDs with the target role in this organization
  const { data: orgUsers, error: orgError } = await supabase
    .from("user_organizations")
    .select("user_id")
    .eq("organization_id", organizationId)
    .eq("role", role);

  if (orgError || !orgUsers || orgUsers.length === 0) {
    if (orgError) console.error(`Failed to fetch ${role} users:`, orgError);
    else console.log(`No ${role} users found in org ${organizationId}`);
    return [];
  }

  const userIds = orgUsers.map((row: any) => row.user_id);
  console.log(`Found ${userIds.length} ${role} user(s) in org ${organizationId}:`, userIds);

  // Step 2: Get profiles for those users
  const { data: profiles, error: profileError } = await supabase
    .from("profiles")
    .select("id, email, full_name")
    .in("id", userIds);

  if (profileError || !profiles) {
    console.error(`Failed to fetch profiles for ${role} users:`, profileError);
    return [];
  }

  const recipients = profiles
    .filter((p: any) => p.email)
    .map((p: any) => ({
      email: p.email,
      name: p.full_name || "Team Member",
    }));

  console.log(`Resolved ${recipients.length} ${role} recipient(s):`, recipients.map(r => r.email));
  return recipients;
}

// ─── Notification Content ────────────────────────────────────────────────────

function getExpenseNotificationContent(
  oldStatus: string,
  newStatus: string,
  record: NonNullable<Awaited<ReturnType<typeof getExpenseRecord>>>
): { requesterContent: EmailContent | null; reviewerContent: EmailContent | null; reviewerRole: string | null } {
  const { title, amount, ministryName, reviewerName, reviewerNotes, paymentReference } = record;
  const amountStr = formatCurrency(amount);

  // Determine transition
  const isRecall = oldStatus === "leader_approved" && newStatus === "pending_leader";

  if (isRecall) {
    return {
      requesterContent: {
        subject: `Expense Update: ${title}`,
        heading: "Expense Approval Recalled",
        message: `The approval for your expense request "${title}" (${amountStr}) has been recalled. It has been reverted to pending review.`,
        statusColor: "#f59e0b",
        statusBadge: "APPROVAL RECALLED",
        amount,
        reviewerNotes: reviewerNotes ?? undefined,
        showActionButton: false,
        actionButtonText: "",
      },
      reviewerContent: null,
      reviewerRole: null,
    };
  }

  switch (newStatus) {
    case "pending_leader":
      return {
        requesterContent: {
          subject: `Expense Submitted: ${title}`,
          heading: "Your Expense Request Has Been Submitted",
          message: `Your expense request for "${title}" (${amountStr}) has been submitted for review. You will be notified once it is reviewed.`,
          statusColor: "#3b82f6",
          statusBadge: "SUBMITTED",
          amount,
          showActionButton: false,
          actionButtonText: "",
        },
        reviewerContent: {
          subject: `New Expense Request: ${title}`,
          heading: "New Expense Request Pending Your Review",
          message: `${record.requesterName} from ${ministryName} has submitted an expense request for "${title}" (${amountStr}). This request requires your review and approval.`,
          statusColor: "#f59e0b",
          statusBadge: "PENDING REVIEW",
          amount,
          showActionButton: true,
          actionButtonText: "Review Request",
          actionUrl: `${APP_URL}/budget`,
        },
        reviewerRole: "admin",
      };

    case "leader_approved":
      return {
        requesterContent: {
          subject: `Expense Approved: ${title}`,
          heading: "Your Expense Request Has Been Approved",
          message: `Great news! Your expense request for "${title}" (${amountStr}) has been approved by ${reviewerName || "the reviewer"}. It will now proceed to treasury for payment approval.`,
          statusColor: "#22c55e",
          statusBadge: "LEADER APPROVED",
          amount,
          reviewerNotes: reviewerNotes ?? undefined,
          showActionButton: false,
          actionButtonText: "",
        },
        reviewerContent: {
          subject: `Expense Awaiting Payment Approval: ${title}`,
          heading: "New Expense Awaiting Payment Approval",
          message: `An expense request for "${title}" (${amountStr}) from ${ministryName} has been approved by the leader and requires your payment approval.`,
          statusColor: "#8b5cf6",
          statusBadge: "AWAITING TREASURY",
          amount,
          showActionButton: true,
          actionButtonText: "Review Payment",
          actionUrl: `${APP_URL}/budget`,
        },
        reviewerRole: "treasury",
      };

    case "leader_denied":
      return {
        requesterContent: {
          subject: `Expense Denied: ${title}`,
          heading: "Expense Request Update",
          message: `Your expense request for "${title}" (${amountStr}) was not approved by ${reviewerName || "the reviewer"}. Please review the notes below for more information.`,
          statusColor: "#ef4444",
          statusBadge: "DENIED",
          amount,
          reviewerNotes: reviewerNotes ?? undefined,
          showActionButton: false,
          actionButtonText: "",
        },
        reviewerContent: null,
        reviewerRole: null,
      };

    case "treasury_approved":
      return {
        requesterContent: {
          subject: `Payment Approved: ${title}`,
          heading: "Payment Has Been Approved",
          message: `The payment for "${title}" (${amountStr}) has been approved by treasury. The finance team will process your payment shortly.`,
          statusColor: "#3b82f6",
          statusBadge: "PAYMENT APPROVED",
          amount,
          reviewerNotes: reviewerNotes ?? undefined,
          showActionButton: false,
          actionButtonText: "",
        },
        reviewerContent: {
          subject: `Payment Ready to Process: ${title}`,
          heading: "New Payment Ready to Process",
          message: `The payment for "${title}" (${amountStr}) from ${ministryName} has been approved by treasury and is ready for processing.`,
          statusColor: "#8b5cf6",
          statusBadge: "AWAITING FINANCE",
          amount,
          showActionButton: true,
          actionButtonText: "Process Payment",
          actionUrl: `${APP_URL}/budget`,
        },
        reviewerRole: "finance",
      };

    case "treasury_denied":
      return {
        requesterContent: {
          subject: `Payment Denied: ${title}`,
          heading: "Payment Request Update",
          message: `The payment for "${title}" (${amountStr}) was not approved by treasury. Please review the notes below.`,
          statusColor: "#ef4444",
          statusBadge: "PAYMENT DENIED",
          amount,
          reviewerNotes: reviewerNotes ?? undefined,
          showActionButton: false,
          actionButtonText: "",
        },
        reviewerContent: null,
        reviewerRole: null,
      };

    case "completed":
      return {
        requesterContent: {
          subject: `Payment Complete: ${title}`,
          heading: "Your Payment Has Been Processed",
          message: `Your expense request for "${title}" (${amountStr}) has been fully processed. Payment reference: ${paymentReference || "N/A"}.`,
          statusColor: "#22c55e",
          statusBadge: "COMPLETED",
          amount,
          reviewerNotes: reviewerNotes ?? undefined,
          showActionButton: false,
          actionButtonText: "",
        },
        reviewerContent: null,
        reviewerRole: null,
      };

    case "cancelled":
      return {
        requesterContent: {
          subject: `Expense Cancelled: ${title}`,
          heading: "Expense Request Cancelled",
          message: `The expense request for "${title}" (${amountStr}) has been cancelled.`,
          statusColor: "#6b7280",
          statusBadge: "CANCELLED",
          amount,
          showActionButton: false,
          actionButtonText: "",
        },
        reviewerContent: null,
        reviewerRole: null,
      };

    default:
      return { requesterContent: null, reviewerContent: null, reviewerRole: null };
  }
}

function getAllocationNotificationContent(
  oldStatus: string,
  newStatus: string,
  record: NonNullable<Awaited<ReturnType<typeof getAllocationRecord>>>
): { requesterContent: EmailContent | null; reviewerContent: EmailContent | null; reviewerRole: string | null } {
  const { ministryName, requestedAmount, approvedAmount, adminNotes } = record;
  const amountStr = formatCurrency(approvedAmount || requestedAmount);

  const isRecall = oldStatus === "approved" && newStatus === "pending";

  if (isRecall) {
    return {
      requesterContent: {
        subject: `Budget Allocation Update: ${ministryName}`,
        heading: "Budget Allocation Approval Recalled",
        message: `The approval for your budget allocation request for ${ministryName} (${amountStr}) has been recalled. It has been reverted to pending review.`,
        statusColor: "#f59e0b",
        statusBadge: "APPROVAL RECALLED",
        amount: approvedAmount || requestedAmount,
        reviewerNotes: adminNotes || undefined,
        showActionButton: false,
        actionButtonText: "",
      },
      reviewerContent: null,
      reviewerRole: null,
    };
  }

  switch (newStatus) {
    case "pending":
      return {
        requesterContent: null,
        reviewerContent: {
          subject: `New Budget Request: ${ministryName}`,
          heading: "New Budget Request",
          message: `${record.requesterName} from ${ministryName} has submitted a budget request for ${formatCurrency(requestedAmount)}. This request requires your review.`,
          statusColor: "#8b5cf6",
          statusBadge: "PENDING REVIEW",
          amount: requestedAmount,
          showActionButton: true,
          actionButtonText: "Review Request",
          actionUrl: `${APP_URL}/budget`,
        },
        reviewerRole: "admin",
      };

    case "approved":
    case "partially_approved":
      return {
        requesterContent: {
          subject: `Budget Allocation Approved: ${ministryName}`,
          heading: "Budget Allocation Approved",
          message: `Your budget allocation request for ${ministryName} (${amountStr}) has been approved.`,
          statusColor: "#22c55e",
          statusBadge: "APPROVED",
          amount: approvedAmount || requestedAmount,
          reviewerNotes: adminNotes || undefined,
          showActionButton: false,
          actionButtonText: "",
        },
        reviewerContent: null,
        reviewerRole: null,
      };

    case "denied":
      return {
        requesterContent: {
          subject: `Budget Allocation Denied: ${ministryName}`,
          heading: "Budget Allocation Update",
          message: `Your budget allocation request for ${ministryName} (${formatCurrency(requestedAmount)}) was not approved. Please review the notes below.`,
          statusColor: "#ef4444",
          statusBadge: "DENIED",
          amount: requestedAmount,
          reviewerNotes: adminNotes || undefined,
          showActionButton: false,
          actionButtonText: "",
        },
        reviewerContent: null,
        reviewerRole: null,
      };

    case "cancelled":
      return {
        requesterContent: {
          subject: `Budget Allocation Cancelled: ${ministryName}`,
          heading: "Budget Allocation Cancelled",
          message: `The budget allocation request for ${ministryName} (${formatCurrency(requestedAmount)}) has been cancelled.`,
          statusColor: "#6b7280",
          statusBadge: "CANCELLED",
          amount: requestedAmount,
          showActionButton: false,
          actionButtonText: "",
        },
        reviewerContent: null,
        reviewerRole: null,
      };

    default:
      return { requesterContent: null, reviewerContent: null, reviewerRole: null };
  }
}

// ─── Email Template ──────────────────────────────────────────────────────────

function buildEmailHtml(
  recipientName: string,
  content: EmailContent
): string {
  return `
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
              <div style="display: inline-block; background-color: ${content.statusColor}; color: #ffffff; padding: 8px 20px; border-radius: 20px; font-size: 12px; font-weight: 700; letter-spacing: 0.5px;">
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

          ${content.amount ? `
          <!-- Amount Display -->
          <tr>
            <td style="padding: 0 30px 30px;">
              <table role="presentation" cellspacing="0" cellpadding="0" border="0" width="100%" style="background-color: #f0fdf4; border-radius: 8px; border: 1px solid #86efac;">
                <tr>
                  <td style="padding: 20px; text-align: center;">
                    <p style="margin: 0 0 5px; color: #15803d; font-size: 14px; font-weight: 600;">Amount</p>
                    <p style="margin: 0; color: #166534; font-size: 28px; font-weight: 700;">${formatCurrency(content.amount)}</p>
                  </td>
                </tr>
              </table>
            </td>
          </tr>
          ` : ""}

          ${content.reviewerNotes ? `
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
                      ${content.reviewerNotes}
                    </p>
                  </td>
                </tr>
              </table>
            </td>
          </tr>
          ` : ""}

          ${content.showActionButton && content.actionUrl ? `
          <!-- Action Button -->
          <tr>
            <td style="padding: 0 30px 30px; text-align: center;">
              <a href="${content.actionUrl}" style="display: inline-block; background-color: #10b981; color: #ffffff; padding: 14px 32px; border-radius: 8px; font-size: 16px; font-weight: 600; text-decoration: none;">
                ${content.actionButtonText}
              </a>
            </td>
          </tr>
          ` : ""}

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
                      &copy; ${new Date().getFullYear()} ${CHURCH_NAME}. All rights reserved.
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
</html>`;
}

// ─── Email Sending ───────────────────────────────────────────────────────────

interface PendingEmail {
  to: string;
  subject: string;
  html: string;
}

async function sendAllEmails(
  emails: PendingEmail[]
): Promise<{ sent: string[]; failed: string[] }> {
  const sent: string[] = [];
  const failed: string[] = [];

  if (!RESEND_API_KEY) {
    console.error("RESEND_API_KEY is not configured");
    emails.forEach(e => failed.push(e.to));
    return { sent, failed };
  }

  if (emails.length === 0) return { sent, failed };

  // Use Resend Batch API — single request, no rate limit issues
  try {
    const res = await fetch("https://api.resend.com/emails/batch", {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
        Authorization: `Bearer ${RESEND_API_KEY}`,
      },
      body: JSON.stringify(
        emails.map(e => ({
          from: RESEND_FROM_EMAIL,
          to: [e.to],
          subject: e.subject,
          html: e.html,
        }))
      ),
    });

    const data = await res.json();

    if (res.ok) {
      console.log(`Batch sent ${emails.length} email(s) successfully`);
      emails.forEach(e => sent.push(e.to));
    } else {
      console.error("Batch send failed:", data);
      emails.forEach(e => failed.push(e.to));
    }
  } catch (error) {
    console.error("Error sending batch emails:", error);
    emails.forEach(e => failed.push(e.to));
  }

  return { sent, failed };
}

// ─── Main Handler ────────────────────────────────────────────────────────────

serve(async (req) => {
  if (req.method === "OPTIONS") {
    return new Response("ok", { headers: corsHeaders });
  }

  try {
    const payload: TriggerPayload = await req.json();
    console.log("Workflow notification triggered:", JSON.stringify(payload));

    const { table, record_id, old_status, new_status } = payload;

    if (!table || !record_id || !new_status) {
      return new Response(
        JSON.stringify({ error: "Missing required fields" }),
        { status: 400, headers: { ...corsHeaders, "Content-Type": "application/json" } }
      );
    }

    // Skip if status didn't actually change
    if (old_status === new_status) {
      return new Response(
        JSON.stringify({ message: "No status change, skipping" }),
        { status: 200, headers: { ...corsHeaders, "Content-Type": "application/json" } }
      );
    }

    const supabase = createAdminClient();
    const pendingEmails: PendingEmail[] = [];

    if (table === "expense_requests") {
      const record = await getExpenseRecord(supabase, record_id);
      if (!record) {
        return new Response(
          JSON.stringify({ error: "Expense record not found" }),
          { status: 404, headers: { ...corsHeaders, "Content-Type": "application/json" } }
        );
      }

      const { requesterContent, reviewerContent, reviewerRole } =
        getExpenseNotificationContent(old_status, new_status, record);

      // Queue requester email
      if (requesterContent && record.requesterEmail) {
        pendingEmails.push({
          to: record.requesterEmail,
          subject: requesterContent.subject,
          html: buildEmailHtml(record.requesterName, requesterContent),
        });
      }

      // Queue reviewer emails
      if (reviewerContent && reviewerRole) {
        const reviewers = await getUsersByRole(supabase, record.organizationId, reviewerRole);
        for (const reviewer of reviewers) {
          if (reviewer.email === record.requesterEmail) continue;
          pendingEmails.push({
            to: reviewer.email,
            subject: reviewerContent.subject,
            html: buildEmailHtml(reviewer.name, reviewerContent),
          });
        }
      }
    } else if (table === "allocation_requests") {
      const record = await getAllocationRecord(supabase, record_id);
      if (!record) {
        return new Response(
          JSON.stringify({ error: "Allocation record not found" }),
          { status: 404, headers: { ...corsHeaders, "Content-Type": "application/json" } }
        );
      }

      const { requesterContent, reviewerContent, reviewerRole } =
        getAllocationNotificationContent(old_status, new_status, record);

      // Queue requester email
      if (requesterContent && record.requesterEmail) {
        pendingEmails.push({
          to: record.requesterEmail,
          subject: requesterContent.subject,
          html: buildEmailHtml(record.requesterName, requesterContent),
        });
      }

      // Queue reviewer emails
      if (reviewerContent && reviewerRole) {
        const reviewers = await getUsersByRole(supabase, record.organizationId, reviewerRole);
        for (const reviewer of reviewers) {
          if (reviewer.email === record.requesterEmail) continue;
          pendingEmails.push({
            to: reviewer.email,
            subject: reviewerContent.subject,
            html: buildEmailHtml(reviewer.name, reviewerContent),
          });
        }
      }
    }

    // Send all emails in a single batch request
    const { sent: emailsSent, failed: emailsFailed } = await sendAllEmails(pendingEmails);

    console.log(`Notification complete: ${emailsSent.length} sent, ${emailsFailed.length} failed`);

    return new Response(
      JSON.stringify({
        success: true,
        sent: emailsSent.length,
        failed: emailsFailed.length,
        details: { sent: emailsSent, failed: emailsFailed },
      }),
      { status: 200, headers: { ...corsHeaders, "Content-Type": "application/json" } }
    );
  } catch (error) {
    console.error("Error in handle-workflow-notification:", error);
    return new Response(
      JSON.stringify({ error: error instanceof Error ? error.message : "Unknown error" }),
      { status: 500, headers: { ...corsHeaders, "Content-Type": "application/json" } }
    );
  }
});
