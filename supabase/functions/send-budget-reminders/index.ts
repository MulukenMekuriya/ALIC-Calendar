/**
 * Sends today's budget request reminders.
 *
 * budget.request_reminder_sweep decides who is written to and when, and
 * queues one row per person per day in budget.request_reminders; this only
 * delivers them. It is woken by that sweep through pg_net, with the
 * service-role key, and claims rows with FOR UPDATE SKIP LOCKED, so two runs
 * at once send different rows rather than the same one twice.
 *
 * The words and the look are in email.ts.
 */

import { serve } from "https://deno.land/std@0.168.0/http/server.ts";
import { createClient } from "https://esm.sh/@supabase/supabase-js@2";
import {
  compose,
  DEFAULT_LOGO_URL,
  renderEmail,
  renderText,
  type ReminderRow,
} from "./email.ts";

const RESEND_API_KEY = Deno.env.get("RESEND_API");

/**
 * no-reply@alic.org, as the Children's Ministry emails: alic.org is verified
 * in Resend and is the app's own domain, which the button links to. The
 * budget notifications' finance@addislidet.info is not used here; that
 * function is left as it is.
 */
const RESEND_FROM_EMAIL =
  Deno.env.get("RESEND_BUDGET_REMINDER_FROM_EMAIL") ||
  "Addis Lidet International Church <no-reply@alic.org>";
const CHURCH_LOGO_URL = Deno.env.get("CHURCH_LOGO_URL") || DEFAULT_LOGO_URL;

const BATCH_SIZE = 50;
/** Resend accepts 10 a second. */
const PACE_MS = 200;

const sleep = (ms: number) => new Promise((resolve) => setTimeout(resolve, ms));

const corsHeaders = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers":
    "authorization, x-client-info, apikey, content-type",
};

async function sendEmail(
  row: ReminderRow,
): Promise<{ ok: true; id: string } | { ok: false; error: string; rate?: boolean }> {
  const response = await fetch("https://api.resend.com/emails", {
    method: "POST",
    headers: {
      Authorization: `Bearer ${RESEND_API_KEY}`,
      "Content-Type": "application/json",
    },
    body: JSON.stringify({
      from: RESEND_FROM_EMAIL,
      to: [row.recipient_email],
      subject: compose(row).subject,
      html: renderEmail(row, CHURCH_LOGO_URL),
      text: renderText(row),
    }),
  });
  const payload = await response.json().catch(() => ({}));
  if (!response.ok) {
    return {
      ok: false,
      error: payload?.message || `Resend returned ${response.status}`,
      rate: response.status === 429,
    };
  }
  return { ok: true, id: payload?.id ?? "sent" };
}

serve(async (req) => {
  if (req.method === "OPTIONS") {
    return new Response("ok", { headers: corsHeaders });
  }

  if (!RESEND_API_KEY) {
    console.error("RESEND_API is not set; cannot send budget reminders");
    return new Response(
      JSON.stringify({ error: "RESEND_API is not configured" }),
      { status: 500, headers: { ...corsHeaders, "Content-Type": "application/json" } },
    );
  }

  const supabase = createClient(
    Deno.env.get("SUPABASE_URL")!,
    Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!,
    { db: { schema: "budget" } },
  );

  let sent = 0;
  let failed = 0;
  let claimed = 0;

  // Batch after batch until today's are all claimed: one run sends the lot.
  for (;;) {
    const { data, error } = await supabase.rpc("claim_request_reminders", {
      _limit: BATCH_SIZE,
    });
    if (error) {
      console.error("Could not claim budget reminders:", error.message);
      return new Response(JSON.stringify({ error: error.message }), {
        status: 500,
        headers: { ...corsHeaders, "Content-Type": "application/json" },
      });
    }
    const rows = (data ?? []) as ReminderRow[];
    if (rows.length === 0) break;
    claimed += rows.length;

    for (const row of rows) {
      try {
        let result = await sendEmail(row);
        if (!result.ok && result.rate) {
          await sleep(1000);
          result = await sendEmail(row);
        }
        await supabase.rpc("complete_request_reminder", {
          _id: row.id,
          _ok: result.ok,
          _provider_message_id: result.ok ? result.id : null,
          _error: result.ok ? null : result.error,
        });
        if (result.ok) sent++;
        else failed++;
      } catch (error) {
        // One bad row must not strand the rest in 'sending'.
        const message = error instanceof Error ? error.message : String(error);
        console.error(`Budget reminder ${row.id} threw:`, message);
        await supabase.rpc("complete_request_reminder", {
          _id: row.id,
          _ok: false,
          _error: message,
        });
        failed++;
      }
      await sleep(PACE_MS);
    }

    // A failed row is claimable again at once; leave it for the next sweep
    // rather than spinning on it here.
    if (failed > 0) break;
  }

  console.log(`Budget reminders: claimed ${claimed}, sent ${sent}, failed ${failed}`);
  return new Response(JSON.stringify({ claimed, sent, failed }), {
    headers: { ...corsHeaders, "Content-Type": "application/json" },
  });
});
