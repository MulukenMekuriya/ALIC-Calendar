/**
 * Drains church.notification_log and sends the parent notifications.
 *
 * Three kinds of message reach a parent, all queued by the database and all
 * sent from here:
 *
 *   check_in          — "Noah has been checked into Blossom A"
 *   check_out         — "Noah was collected at 11:42"
 *   volunteer_message — "Please report to Children's Ministry Room 4"
 *
 * The first two are written by triggers on church.kids_check_ins; the third by
 * church.send_parent_message when a volunteer taps the button. This function
 * does not decide who to notify or what to say — that is settled in the
 * database, where consent and household membership live. It only delivers.
 *
 * Invoke it on a schedule (pg_cron -> pg_net, every minute during service
 * hours) and after a check-in for immediacy. It is safe to run concurrently:
 * rows are claimed with FOR UPDATE SKIP LOCKED, so an overlapping run picks up
 * different rows rather than sending the same message twice.
 */

import { serve } from "https://deno.land/std@0.168.0/http/server.ts";
import { createClient } from "https://esm.sh/@supabase/supabase-js@2";

const RESEND_API_KEY = Deno.env.get("RESEND_API");

/**
 * SMS. Absent until the church buys a number, and that is a supported state:
 * with these unset every sms row is released with "no provider configured",
 * exactly as before, and the printed slip remains the credential.
 */
const TWILIO_ACCOUNT_SID = Deno.env.get("TWILIO_ACCOUNT_SID");
const TWILIO_AUTH_TOKEN = Deno.env.get("TWILIO_AUTH_TOKEN");
const TWILIO_FROM_NUMBER = Deno.env.get("TWILIO_FROM_NUMBER");
const SMS_CONFIGURED = !!(TWILIO_ACCOUNT_SID && TWILIO_AUTH_TOKEN && TWILIO_FROM_NUMBER);
const RESEND_FROM_EMAIL =
  Deno.env.get("RESEND_KIDS_FROM_EMAIL") ||
  Deno.env.get("RESEND_FROM_EMAIL") ||
  "Kids Ministry <team@addislidet.info>";
const CHURCH_NAME =
  Deno.env.get("CHURCH_NAME") || "Addis Lidet International Church";

/** Per invocation. Keeps one run inside the edge function time limit. */
const BATCH_SIZE = 50;

const corsHeaders = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers":
    "authorization, x-client-info, apikey, content-type",
};

interface QueuedNotification {
  id: string;
  kind: "check_in" | "check_out" | "volunteer_message";
  channel: "email" | "sms";
  recipient_name: string | null;
  recipient_email: string | null;
  recipient_phone: string | null;
  subject: string | null;
  body: string;
  sent_by_name: string | null;
}

function escapeHtml(value: string): string {
  return value
    .replace(/&/g, "&amp;")
    .replace(/</g, "&lt;")
    .replace(/>/g, "&gt;")
    .replace(/"/g, "&quot;")
    .replace(/'/g, "&#39;");
}

/**
 * A volunteer_message is an interruption during a service — the parent is
 * being asked to get up and walk to a classroom. It gets the loud treatment;
 * the routine check-in and check-out confirmations do not.
 */
function renderEmail(notification: QueuedNotification): string {
  const urgent = notification.kind === "volunteer_message";
  const accent = urgent ? "#b91c1c" : "#1d4ed8";
  const heading = urgent
    ? "Please come to the Children's Ministry"
    : notification.subject || "Children's Ministry";

  return `<!DOCTYPE html>
<html>
  <body style="margin:0;padding:24px;background:#f4f4f5;font-family:-apple-system,BlinkMacSystemFont,'Segoe UI',Roboto,sans-serif;">
    <div style="max-width:520px;margin:0 auto;background:#ffffff;border-radius:12px;overflow:hidden;border:1px solid #e4e4e7;">
      <div style="background:${accent};padding:20px 24px;">
        <p style="margin:0;color:#ffffff;font-size:18px;font-weight:600;">
          ${escapeHtml(heading)}
        </p>
      </div>
      <div style="padding:24px;">
        <p style="margin:0 0 16px;font-size:16px;line-height:1.6;color:#18181b;">
          ${escapeHtml(notification.body)}
        </p>
        ${
          notification.sent_by_name
            ? `<p style="margin:0;font-size:13px;color:#71717a;">Sent by ${escapeHtml(
                notification.sent_by_name
              )}</p>`
            : ""
        }
      </div>
      <div style="padding:16px 24px;background:#fafafa;border-top:1px solid #e4e4e7;">
        <p style="margin:0;font-size:12px;color:#71717a;">
          ${escapeHtml(CHURCH_NAME)} · Children's Ministry
        </p>
      </div>
    </div>
  </body>
</html>`;
}

async function sendEmail(
  notification: QueuedNotification
): Promise<{ ok: true; id: string } | { ok: false; error: string }> {
  const response = await fetch("https://api.resend.com/emails", {
    method: "POST",
    headers: {
      Authorization: `Bearer ${RESEND_API_KEY}`,
      "Content-Type": "application/json",
    },
    body: JSON.stringify({
      from: RESEND_FROM_EMAIL,
      to: [notification.recipient_email],
      subject:
        notification.subject ||
        (notification.kind === "volunteer_message"
          ? "Please come to the Children's Ministry"
          : "Children's Ministry"),
      html: renderEmail(notification),
    }),
  });

  const payload = await response.json().catch(() => ({}));
  if (!response.ok) {
    return {
      ok: false,
      error: payload?.message || `Resend returned ${response.status}`,
    };
  }
  return { ok: true, id: payload?.id ?? "sent" };
}

serve(async (req) => {
  if (req.method === "OPTIONS") {
    return new Response("ok", { headers: corsHeaders });
  }

  if (!RESEND_API_KEY) {
    console.error("RESEND_API is not set; cannot send parent notifications");
    return new Response(
      JSON.stringify({ error: "RESEND_API is not configured" }),
      { status: 500, headers: { ...corsHeaders, "Content-Type": "application/json" } }
    );
  }

  const supabase = createClient(
    Deno.env.get("SUPABASE_URL")!,
    Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!,
    { db: { schema: "church" } }
  );

  const { data: claimed, error: claimError } = await supabase.rpc(
    "claim_queued_notifications",
    { _limit: BATCH_SIZE }
  );

  if (claimError) {
    console.error("Could not claim notifications:", claimError.message);
    return new Response(JSON.stringify({ error: claimError.message }), {
      status: 500,
      headers: { ...corsHeaders, "Content-Type": "application/json" },
    });
  }

  const notifications = (claimed ?? []) as QueuedNotification[];
/**
 * Send one text through Twilio.
 *
 * E.164 or nothing: Twilio rejects "301-555-0102", and ALIC's numbers are
 * stored as people type them. A 10-digit US number is prefixed with +1; a
 * number that is already +… is passed through; anything else is refused here
 * rather than burning a Twilio request to be told the same thing.
 */
function toE164(raw: string): string | null {
  const trimmed = raw.trim();
  if (trimmed.startsWith("+")) return trimmed.replace(/[^\d+]/g, "");
  const digits = trimmed.replace(/\D/g, "");
  if (digits.length === 10) return `+1${digits}`;
  if (digits.length === 11 && digits.startsWith("1")) return `+${digits}`;
  return null;
}

async function sendSms(
  notification: QueuedNotification,
): Promise<{ ok: true; id: string } | { ok: false; error: string }> {
  const to = toE164(notification.recipient_phone ?? "");
  if (!to) {
    return { ok: false, error: `unusable phone number for SMS` };
  }

  const body = new URLSearchParams({
    To: to,
    From: TWILIO_FROM_NUMBER!,
    Body: notification.body,
  });

  const res = await fetch(
    `https://api.twilio.com/2010-04-01/Accounts/${TWILIO_ACCOUNT_SID}/Messages.json`,
    {
      method: "POST",
      headers: {
        Authorization:
          "Basic " + btoa(`${TWILIO_ACCOUNT_SID}:${TWILIO_AUTH_TOKEN}`),
        "Content-Type": "application/x-www-form-urlencoded",
      },
      body,
    },
  );

  const json = await res.json().catch(() => ({}));
  if (!res.ok) {
    return { ok: false, error: json?.message ?? `Twilio HTTP ${res.status}` };
  }
  return { ok: true, id: json?.sid ?? "sent" };
}

  let sent = 0;
  let failed = 0;
  let skipped = 0;

  for (const notification of notifications) {
    try {
      if (notification.channel === "sms") {
        // Unconfigured is a release, not a failure: the row is not wrong, the
        // church simply has no number yet, and the slip still carries the code.
        if (!SMS_CONFIGURED) {
          await supabase.rpc("complete_notification", {
            _id: notification.id,
            _ok: false,
            _error: "channel 'sms' has no provider configured",
          });
          skipped++;
          continue;
        }
        const smsResult = await sendSms(notification);
        await supabase.rpc("complete_notification", {
          _id: notification.id,
          _ok: smsResult.ok,
          _provider_message_id: smsResult.ok ? smsResult.id : null,
          _error: smsResult.ok ? null : smsResult.error,
        });
        smsResult.ok ? sent++ : failed++;
        continue;
      }

      if (notification.channel !== "email") {
        await supabase.rpc("complete_notification", {
          _id: notification.id,
          _ok: false,
          _error: `channel '${notification.channel}' has no provider configured`,
        });
        skipped++;
        continue;
      }

      if (!notification.recipient_email) {
        await supabase.rpc("complete_notification", {
          _id: notification.id,
          _ok: false,
          _error: "no email address on file",
        });
        failed++;
        continue;
      }

      const result = await sendEmail(notification);
      await supabase.rpc("complete_notification", {
        _id: notification.id,
        _ok: result.ok,
        _provider_message_id: result.ok ? result.id : null,
        _error: result.ok ? null : result.error,
      });
      result.ok ? sent++ : failed++;
    } catch (error) {
      // Never let one bad row abandon the rest of the batch: an unreleased
      // claim would sit in 'sending' until the reclaim window expires.
      const message = error instanceof Error ? error.message : String(error);
      console.error(`Notification ${notification.id} threw:`, message);
      await supabase.rpc("complete_notification", {
        _id: notification.id,
        _ok: false,
        _error: message,
      });
      failed++;
    }
  }

  console.log(
    `Kids notifications: claimed ${notifications.length}, sent ${sent}, failed ${failed}, skipped ${skipped}`
  );

  return new Response(
    JSON.stringify({ claimed: notifications.length, sent, failed, skipped }),
    { headers: { ...corsHeaders, "Content-Type": "application/json" } }
  );
});
