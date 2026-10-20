/**
 * Handle Ministry Flag Notification
 *
 * Triggered by PostgreSQL trigger on ministry_flags INSERT.
 * Sends email to the requester of the linked expense request notifying them
 * that their ministry has been flagged.
 *
 * What it says is in content.ts, and how it looks in _shared/financeEmail.ts.
 */

import { serve } from "https://deno.land/std@0.168.0/http/server.ts";
import { createClient } from "https://esm.sh/@supabase/supabase-js@2";
import {
  DEFAULT_LOGO_URL,
  renderChurchEmail,
  renderChurchText,
} from "../_shared/churchEmail.ts";
import { FINANCE_FROM_EMAIL, financeEmail } from "../_shared/financeEmail.ts";
import { flagMessage } from "./content.ts";

// ─── Configuration ───────────────────────────────────────────────────────────

const RESEND_API_KEY = Deno.env.get("RESEND_API");
/** Its own variable: RESEND_FROM_EMAIL belongs to the event calendar. */
const RESEND_FROM_EMAIL = Deno.env.get("RESEND_FINANCE_FROM_EMAIL") || FINANCE_FROM_EMAIL;
const CHURCH_LOGO_URL = Deno.env.get("CHURCH_LOGO_URL") || DEFAULT_LOGO_URL;

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

function createAdminClient() {
  return createClient(
    Deno.env.get("SUPABASE_URL")!,
    Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!
  );
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
        const message = flagMessage({
          ministryName,
          flagType: flag_type,
          flaggedByName: created_by_name,
          notes,
          expenseTitle: expense.title,
          expenseAmount: expense.amount ? Number(expense.amount) : null,
        });
        const emails = Array.from(recipientEmails.entries()).map(
          ([email, name]) => {
            const body = financeEmail(name, message);
            return {
              from: RESEND_FROM_EMAIL,
              to: [email],
              subject: message.subject,
              html: renderChurchEmail(body, CHURCH_LOGO_URL),
              text: renderChurchText(body),
            };
          }
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
