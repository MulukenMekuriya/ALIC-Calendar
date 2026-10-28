/**
 * Handle Workflow Notification
 *
 * Server-side edge function triggered by PostgreSQL triggers on status changes.
 * Determines who to notify (requester + next reviewer) and sends emails via Resend.
 *
 * What each notice says is in content.ts, and how it looks in
 * _shared/financeEmail.ts: the church's email, as the Children's Ministry
 * and the budget request reminder send it.
 */

import { serve } from "https://deno.land/std@0.168.0/http/server.ts";
import { createClient } from "https://esm.sh/@supabase/supabase-js@2";
import {
  DEFAULT_LOGO_URL,
  renderChurchEmail,
  renderChurchText,
} from "../_shared/churchEmail.ts";
import {
  FINANCE_FROM_EMAIL,
  type FinanceMessage,
  financeEmail,
} from "../_shared/financeEmail.ts";
import {
  type AllocationRecord,
  type ExpenseRecord,
  getAllocationNotificationContent,
  getBoardDigestContent,
  getBoardDecisionDigestContent,
  getExpenseNotificationContent,
} from "./content.ts";

// ─── Configuration ───────────────────────────────────────────────────────────

const RESEND_API_KEY = Deno.env.get("RESEND_API");
/**
 * Its own variable: RESEND_FROM_EMAIL belongs to the event calendar, and
 * reading it here is how these went out as finance@addislidet.info.
 */
const RESEND_FROM_EMAIL = Deno.env.get("RESEND_FINANCE_FROM_EMAIL") || FINANCE_FROM_EMAIL;
const CHURCH_LOGO_URL = Deno.env.get("CHURCH_LOGO_URL") || DEFAULT_LOGO_URL;
/** Where "Sent for Board Review" goes: the Board's shared inbox. */
const BOARD_EMAIL = Deno.env.get("BOARD_EMAIL") || "board@alic.org";

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
  /** budget.send_to_board: one notice for a whole batch. */
  kind?: "sent_to_board" | "board_returned" | "board_approved";
  record_ids?: string[];
  /** The Board's note when it sends a batch back. */
  note?: string | null;
}

interface EmailRecipient {
  email: string;
  name: string;
}

// ─── Helpers ─────────────────────────────────────────────────────────────────

function createAdminClient() {
  return createClient(
    Deno.env.get("SUPABASE_URL")!,
    Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!
  );
}

/**
 * The client as createAdminClient makes it. AdminClient
 * is the generic's default, whose schema is `never`, so every query typed
 * against it was an error.
 */
type AdminClient = ReturnType<typeof createAdminClient>;

// ─── DB Queries ──────────────────────────────────────────────────────────────

async function getExpenseRecord(
  supabase: AdminClient,
  recordId: string
): Promise<ExpenseRecord | null> {
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

async function getAllocationRecord(
  supabase: AdminClient,
  recordId: string
): Promise<AllocationRecord | null> {
  const { data: allocation, error } = await supabase
    .schema("budget")
    .from("allocation_requests")
    .select("*, ministries(name), fiscal_years(year)")
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

  // Who reviewed it, so their notes can say whose they are.
  let reviewerName: string | null = null;
  if (allocation.reviewed_by) {
    const { data: reviewerProfile } = await supabase
      .from("profiles")
      .select("full_name")
      .eq("id", allocation.reviewed_by)
      .single();
    reviewerName = reviewerProfile?.full_name || null;
  }

  return {
    id: allocation.id,
    ministryName: allocation.ministries?.name || "Unknown Ministry",
    organizationId: allocation.organization_id,
    requesterName: allocation.requester_name || requesterProfile?.full_name || "Unknown",
    requesterEmail: requesterProfile?.email || null,
    requestedAmount: Number(allocation.requested_amount),
    approvedAmount: allocation.approved_amount ? Number(allocation.approved_amount) : null,
    adminNotes: allocation.admin_notes,
    fiscalYear: allocation.fiscal_years?.year ?? null,
    reviewerName,
  };
}

async function getUsersByRole(
  supabase: AdminClient,
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

  const userIds = orgUsers.map((row: { user_id: string }) => row.user_id);
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

  type Profile = { id: string; email: string | null; full_name: string | null };
  const recipients = (profiles as Profile[])
    .filter((p): p is Profile & { email: string } => !!p.email)
    .map((p) => ({
      email: p.email,
      name: p.full_name || "Team Member",
    }));

  console.log(`Resolved ${recipients.length} ${role} recipient(s):`, recipients.map(r => r.email));
  return recipients;
}

// ─── Email Sending ───────────────────────────────────────────────────────────

interface PendingEmail {
  to: string;
  subject: string;
  html: string;
  text: string;
}

/** A notice addressed to one person, as HTML and as plain text. */
function addressed(to: string, name: string | null, content: FinanceMessage): PendingEmail {
  const email = financeEmail(name, content);
  return {
    to,
    subject: content.subject,
    html: renderChurchEmail(email, CHURCH_LOGO_URL),
    text: renderChurchText(email),
  };
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
          text: e.text,
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

    // A batch sent to the Board: one email to the Board's inbox.
    if (payload.kind === "sent_to_board" && table === "allocation_requests") {
      const supabase = createAdminClient();
      const records = (
        await Promise.all((payload.record_ids || []).map((id) => getAllocationRecord(supabase, id)))
      ).filter((r): r is AllocationRecord => r !== null);
      const content = getBoardDigestContent(records);
      const result = content
        ? await sendAllEmails([addressed(BOARD_EMAIL, "Board", content)])
        : { sent: [], failed: [] };

      return new Response(
        JSON.stringify({ success: true, sent: result.sent.length, failed: result.failed.length }),
        { status: 200, headers: { ...corsHeaders, "Content-Type": "application/json" } }
      );
    }

    // The Board decided a batch: one digest per branch, to that branch's admins.
    if (
      (payload.kind === "board_returned" || payload.kind === "board_approved") &&
      table === "allocation_requests"
    ) {
      const supabase = createAdminClient();
      const records = (
        await Promise.all((payload.record_ids || []).map((id) => getAllocationRecord(supabase, id)))
      ).filter((r): r is AllocationRecord => r !== null);

      const byOrg = new Map<string, AllocationRecord[]>();
      for (const r of records) byOrg.set(r.organizationId, [...(byOrg.get(r.organizationId) ?? []), r]);

      const pending: PendingEmail[] = [];
      for (const [orgId, group] of byOrg) {
        const content = getBoardDecisionDigestContent(payload.kind, group, payload.note ?? null);
        if (!content) continue;
        for (const admin of await getUsersByRole(supabase, orgId, "admin")) {
          pending.push(addressed(admin.email, admin.name, content));
        }
      }
      const result = await sendAllEmails(pending);

      return new Response(
        JSON.stringify({ success: true, sent: result.sent.length, failed: result.failed.length }),
        { status: 200, headers: { ...corsHeaders, "Content-Type": "application/json" } }
      );
    }

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
        pendingEmails.push(addressed(record.requesterEmail, record.requesterName, requesterContent));
      }

      // Queue reviewer emails
      if (reviewerContent && reviewerRole) {
        const reviewers = await getUsersByRole(supabase, record.organizationId, reviewerRole);
        for (const reviewer of reviewers) {
          if (reviewer.email === record.requesterEmail) continue;
          pendingEmails.push(addressed(reviewer.email, reviewer.name, reviewerContent));
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
        pendingEmails.push(addressed(record.requesterEmail, record.requesterName, requesterContent));
      }

      // Queue reviewer emails
      if (reviewerContent && reviewerRole) {
        const reviewers = await getUsersByRole(supabase, record.organizationId, reviewerRole);
        for (const reviewer of reviewers) {
          if (reviewer.email === record.requesterEmail) continue;
          pendingEmails.push(addressed(reviewer.email, reviewer.name, reviewerContent));
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
