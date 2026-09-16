/**
 * Handle Ministry Flag Notification
 *
 * Triggered by PostgreSQL trigger on ministry_flags INSERT.
 * Sends email to the requester of the linked expense request notifying them
 * that their ministry has been flagged.
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
  flag_id: string;
  ministry_id: string;
  organization_id: string;
  flag_type: string;
  expense_request_id: string;
  created_by_name: string;
  notes: string;
}

// ─── Helpers ─────────────────────────────────────────────────────────────────

const FLAG_TYPE_LABELS: Record<string, string> = {
  missing_receipts: "Missing Receipts",
  unreturned_funds: "Unreturned Funds",
};

function createAdminClient() {
  return createClient(
    Deno.env.get("SUPABASE_URL")!,
    Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!
  );
}

function buildEmailHtml(
  recipientName: string,
  ministryName: string,
  flagTypeLabel: string,
  flaggedByName: string,
  notes: string,
  expenseTitle: string | null,
  expenseAmount: number | null
): string {
  const expenseInfo = expenseTitle
    ? `<tr>
        <td style="padding: 0 30px 30px;">
          <table role="presentation" cellspacing="0" cellpadding="0" border="0" width="100%" style="background-color: #fef3c7; border-radius: 8px; border-left: 4px solid #f59e0b;">
            <tr>
              <td style="padding: 20px;">
                <h4 style="margin: 0 0 10px; color: #92400e; font-size: 14px; font-weight: 700; text-transform: uppercase; letter-spacing: 0.5px;">
                  Related Expense
                </h4>
                <p style="margin: 0; color: #78350f; font-size: 14px; line-height: 1.5;">
                  ${expenseTitle}${expenseAmount ? ` — $${expenseAmount.toLocaleString()}` : ""}
                </p>
              </td>
            </tr>
          </table>
        </td>
      </tr>`
    : "";

  const notesSection = notes
    ? `<tr>
        <td style="padding: 0 30px 30px;">
          <table role="presentation" cellspacing="0" cellpadding="0" border="0" width="100%" style="background-color: #f3f4f6; border-radius: 8px; border-left: 4px solid #6b7280;">
            <tr>
              <td style="padding: 20px;">
                <h4 style="margin: 0 0 10px; color: #374151; font-size: 14px; font-weight: 700; text-transform: uppercase; letter-spacing: 0.5px;">
                  Notes
                </h4>
                <p style="margin: 0; color: #4b5563; font-size: 14px; line-height: 1.5;">
                  ${notes}
                </p>
              </td>
            </tr>
          </table>
        </td>
      </tr>`
    : "";

  return `
<!DOCTYPE html>
<html lang="en">
<head>
  <meta charset="UTF-8">
  <meta name="viewport" content="width=device-width, initial-scale=1.0">
  <title>Ministry Flagged: ${ministryName}</title>
</head>
<body style="margin: 0; padding: 0; font-family: -apple-system, BlinkMacSystemFont, 'Segoe UI', Roboto, 'Helvetica Neue', Arial, sans-serif; background-color: #f3f4f6;">
  <table role="presentation" cellspacing="0" cellpadding="0" border="0" width="100%" style="background-color: #f3f4f6; padding: 40px 20px;">
    <tr>
      <td align="center">
        <table role="presentation" cellspacing="0" cellpadding="0" border="0" width="600" style="max-width: 600px; background-color: #ffffff; border-radius: 16px; overflow: hidden; box-shadow: 0 10px 40px rgba(0, 0, 0, 0.1);">

          <!-- Header -->
          <tr>
            <td style="background: linear-gradient(135deg, #b22222 0%, #8b0000 100%); padding: 48px 40px; text-align: center;">
              <table role="presentation" cellspacing="0" cellpadding="0" border="0" width="100%">
                <tr>
                  <td align="center">
                    <div style="background: rgba(255, 255, 255, 0.15); width: 96px; height: 96px; border-radius: 24px; margin: 0 auto 20px; display: inline-flex; align-items: center; justify-content: center;">
                      <img src="${CHURCH_LOGO_URL}" alt="${CHURCH_NAME}" style="width: 80px; height: 80px; border-radius: 16px; display: block;" />
                    </div>
                  </td>
                </tr>
                <tr>
                  <td align="center">
                    <h1 style="margin: 0; color: #ffffff; font-size: 28px; font-weight: 700;">
                      Ministry Flagged
                    </h1>
                  </td>
                </tr>
                <tr>
                  <td align="center">
                    <p style="margin: 12px 0 0; color: rgba(255, 255, 255, 0.9); font-size: 14px; font-weight: 500;">
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
              <div style="display: inline-block; background-color: #ef4444; color: #ffffff; padding: 8px 20px; border-radius: 20px; font-size: 12px; font-weight: 700; letter-spacing: 0.5px;">
                ${flagTypeLabel.toUpperCase()}
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
                Your ministry <strong>${ministryName}</strong> has been flagged for <strong>${flagTypeLabel.toLowerCase()}</strong> by ${flaggedByName}.
              </p>
              <p style="margin: 0 0 20px; color: #ef4444; font-size: 14px; font-weight: 600; line-height: 1.6;">
                New expense submissions are blocked until this flag is resolved. Please submit the required documents as soon as possible.
              </p>
            </td>
          </tr>

          ${expenseInfo}
          ${notesSection}

          <!-- Action Button -->
          <tr>
            <td style="padding: 0 30px 30px; text-align: center;">
              <a href="${APP_URL}/budget" style="display: inline-block; background-color: #10b981; color: #ffffff; padding: 14px 32px; border-radius: 8px; font-size: 16px; font-weight: 600; text-decoration: none;">
                View Budget Dashboard
              </a>
            </td>
          </tr>

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
                    <p style="margin: 0 0 8px; color: #1f2937; font-size: 14px; font-weight: 600;">${CHURCH_NAME}</p>
                  </td>
                </tr>
                <tr>
                  <td align="center">
                    <p style="margin: 0 0 16px; color: #6b7280; font-size: 12px;">Budget Management System</p>
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

// ─── Main Handler ────────────────────────────────────────────────────────────

serve(async (req) => {
  if (req.method === "OPTIONS") {
    return new Response("ok", { headers: corsHeaders });
  }

  try {
    const payload: TriggerPayload = await req.json();
    console.log("Ministry flag notification triggered:", JSON.stringify(payload));

    const {
      flag_id,
      ministry_id,
      organization_id,
      flag_type,
      expense_request_id,
      created_by_name,
      notes,
    } = payload;

    if (!flag_id || !ministry_id) {
      return new Response(
        JSON.stringify({ error: "Missing required fields" }),
        { status: 400, headers: { ...corsHeaders, "Content-Type": "application/json" } }
      );
    }

    const supabase = createAdminClient();

    // Get ministry name
    const { data: ministry } = await supabase
      .schema("budget")
      .from("ministries")
      .select("name")
      .eq("id", ministry_id)
      .single();

    const ministryName = ministry?.name || "Unknown Ministry";
    const flagTypeLabel = FLAG_TYPE_LABELS[flag_type] || flag_type;

    // Collect recipients: requester of the linked expense (if any) + all ministry members
    const recipientEmails: Map<string, string> = new Map(); // email -> name

    // If there's a linked expense request, get the requester
    if (expense_request_id) {
      const { data: expense } = await supabase
        .schema("budget")
        .from("expense_requests")
        .select("requester_id, requester_name, title, amount")
        .eq("id", expense_request_id)
        .single();

      if (expense) {
        const { data: requesterProfile } = await supabase
          .from("profiles")
          .select("email, full_name")
          .eq("id", expense.requester_id)
          .single();

        if (requesterProfile?.email) {
          recipientEmails.set(
            requesterProfile.email,
            requesterProfile.full_name || expense.requester_name || "Team Member"
          );
        }

        // Send email to requester
        const emails = Array.from(recipientEmails.entries()).map(
          ([email, name]) => ({
            from: RESEND_FROM_EMAIL,
            to: [email],
            subject: `Ministry Flagged: ${ministryName} — ${flagTypeLabel}`,
            html: buildEmailHtml(
              name,
              ministryName,
              flagTypeLabel,
              created_by_name,
              notes,
              expense.title,
              expense.amount ? Number(expense.amount) : null
            ),
          })
        );

        if (emails.length > 0 && RESEND_API_KEY) {
          const res = await fetch("https://api.resend.com/emails/batch", {
            method: "POST",
            headers: {
              "Content-Type": "application/json",
              Authorization: `Bearer ${RESEND_API_KEY}`,
            },
            body: JSON.stringify(emails),
          });

          const data = await res.json();
          if (res.ok) {
            console.log(`Sent ${emails.length} ministry flag notification(s)`);
          } else {
            console.error("Failed to send ministry flag emails:", data);
          }
        }

        return new Response(
          JSON.stringify({ success: true, sent: emails.length }),
          { status: 200, headers: { ...corsHeaders, "Content-Type": "application/json" } }
        );
      }
    }

    // No linked expense — no requester to notify
    console.log("No linked expense request, no requester to notify");
    return new Response(
      JSON.stringify({ success: true, sent: 0, message: "No linked expense requester to notify" }),
      { status: 200, headers: { ...corsHeaders, "Content-Type": "application/json" } }
    );
  } catch (error) {
    console.error("Error in handle-ministry-flag-notification:", error);
    return new Response(
      JSON.stringify({ error: error instanceof Error ? error.message : "Unknown error" }),
      { status: 500, headers: { ...corsHeaders, "Content-Type": "application/json" } }
    );
  }
});
