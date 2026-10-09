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
/**
 * The church, not "Kids Ministry". A parent's inbox shows this name before
 * anything else, and "Kids Ministry" read like nobody in particular. Not
 * RESEND_FROM_EMAIL: that is the event calendar's sender.
 *
 * no-reply@alic.org, the ministry's choice (9 October 2026). It was
 * team@addislidet.info, which is no mailbox at all: a parent who replied got
 * "address not found". alic.org is verified in Resend and is the app's own
 * domain. Replies are not read, so every email says so in its footer and
 * points to the team on Sunday instead.
 */
const RESEND_FROM_EMAIL =
  Deno.env.get("RESEND_KIDS_FROM_EMAIL") ||
  "Addis Lidet International Church <no-reply@alic.org>";
const CHURCH_NAME =
  Deno.env.get("CHURCH_NAME") || "Addis Lidet International Church";
const CHURCH_LOGO_URL =
  Deno.env.get("CHURCH_LOGO_URL") || "https://alic.org/alic-logo.png";
const CHURCH_WEBSITE = Deno.env.get("CHURCH_WEBSITE") || "alic.org";

/** Per invocation. Keeps one run inside the edge function time limit. */
const BATCH_SIZE = 50;

/**
 * Resend accepts 10 emails a second. Fifty at this pace is ten seconds, well
 * inside the time limit, and claim_queued_notifications runs one sender at a
 * time, so this is the whole rate.
 */
const PACE_MS = 200;

/**
 * How long to hold an email the service refused for now. The daily limit lifts
 * within the day; a check-in or pickup notice still waiting three hours on is
 * skipped by claim_queued_notifications rather than sent late.
 */
const QUOTA_WAIT = "30 minutes";
const RATE_WAIT = "1 minute";

/**
 * The emails a parent receives. They open with a greeting and close with a
 * blessing and a verse; the staff notes keep to the facts. An urgent classroom
 * message is a parent's too, but it stays short: see renderEmail.
 */
const PARENT_KINDS = new Set([
  "check_in",
  "check_out",
  "volunteer_message",
  "kids_late_pickup",
  "kids_check_in_held",
  "kids_incident_to_parent",
  "kids_consent_signed",
  "kids_consent_resign_needed",
  "kids_consent_resign_reminder",
  "kids_consent_resign_overdue",
  "kids_consent_requested",
]);

const MINISTRY = "Children's Ministry";
const MINISTRY_AM = "የልጆች አገልግሎት";
const BLESSING_AM = "ተባረኩ";
const VERSE =
  "“Let the little children come to me, and do not hinder them, for the kingdom of heaven belongs to such as these.” Matthew 19:14";
const CAMPUSES = "Silver Spring, MD · Alexandria, VA";
/** The sender takes no replies; say so, and say where to go instead. */
const NO_REPLY =
  "Replies to this email are not read. For anything about your children, please speak to the Children's Ministry team on Sunday.";

const sleep = (ms: number) => new Promise((resolve) => setTimeout(resolve, ms));

const corsHeaders = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers":
    "authorization, x-client-info, apikey, content-type",
};

interface QueuedNotification {
  id: string;
  /**
   * Every kind the database may queue. This list had drifted: it was missing
   * kids_access_granted, added by 20260322150000, and nothing broke because
   * it is only a type annotation — which is exactly why it drifted. Keep it
   * in step with chk_notification_kind.
   */
  kind:
    | "check_in"
    | "check_out"
    | "volunteer_message"
    | "kids_auto_expired"
    | "kids_access_granted"
    | "kids_late_pickup"
    | "kids_check_in_held"
    | "kids_hold_presented"
    | "kids_incident_raised"
    | "kids_incident_to_parent"
    | "kids_medical_updated"
    | "kids_consent_resign_needed"
    | "kids_consent_resign_reminder"
    | "kids_consent_resign_overdue"
    | "kids_consent_signed"
    | "kids_consent_filed"
    | "kids_consent_requested";
  channel: "email" | "sms";
  recipient_name: string | null;
  recipient_email: string | null;
  recipient_phone: string | null;
  subject: string | null;
  body: string;
  sent_by_name: string | null;

  /**
   * WHERE the attachment is, never the bytes. claim_queued_notifications
   * returns SETOF notification_log, so a base64 column would be pulled on
   * every drain of fifty rows whether or not any of them had one.
   */
  attachment_bucket: string | null;
  attachment_path: string | null;
  attachment_filename: string | null;
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
 * How each email is framed, decided once so the HTML and the plain text agree.
 *
 * A parent's email opens "Selam Meseret," and closes with a blessing and a
 * verse: the voice of the church that sent it, approved by the ministry. An
 * urgent classroom message keeps none of that — the parent is being asked to
 * get up and walk to a classroom, and a greeting only delays the instruction —
 * but it does keep who sent it. Staff notes keep to the facts.
 */
function framing(notification: QueuedNotification) {
  const urgent = notification.kind === "volunteer_message";
  const warm = PARENT_KINDS.has(notification.kind) && !urgent;
  const firstName = (notification.recipient_name ?? "").trim().split(/\s+/)[0];
  return {
    urgent,
    warm,
    title: notification.subject || MINISTRY,
    greeting: warm ? (firstName ? `Selam ${firstName},` : "Selam,") : null,
    // Only the urgent message names its sender. On every other parent email
    // the sender is the ministry, signed below; a leader's account name there
    // read like a stranger had written.
    sentBy: urgent || !warm ? notification.sent_by_name : null,
  };
}

/**
 * The pickup code line, exactly as church.kids_family_notice writes it on a
 * check-in email: "Your pickup code is YTRA." on a line of its own. Change one
 * and the other must change with it, or the code goes back to being a
 * sentence.
 */
const PICKUP_CODE_LINE = /^Your pickup code is ([A-Z0-9-]+)\.$/m;

/** The body split around the pickup code, so the code can stand on its own. */
function splitAtCode(notification: QueuedNotification) {
  const m = notification.kind === "check_in"
    ? notification.body.match(PICKUP_CODE_LINE)
    : null;
  if (!m || m.index === undefined) {
    return { before: notification.body, code: null, after: "" };
  }
  return {
    before: notification.body.slice(0, m.index).trimEnd(),
    code: m[1],
    after: notification.body.slice(m.index + m[0].length).trimStart(),
  };
}

/**
 * A line holding only a link to the church's own app becomes a button. The
 * consent reminder puts the form's address on a line of its own for exactly
 * this; in the plain-text copy it stays the address, which every mail app
 * makes clickable. The app is at alic.org; addislidet.info is another site.
 */
const APP_LINK_LINE = /^(https:\/\/(?:www\.)?alic\.org\/\S+)$/;

const BUTTON_LABEL: Partial<Record<QueuedNotification["kind"], string>> = {
  kids_consent_requested: "Fill in the consent form",
};

function linkButton(url: string, label: string): string {
  return `<table role="presentation" cellpadding="0" cellspacing="0" style="margin:0 0 16px;">
          <tr><td style="border-radius:8px;background:#b22222;">
            <a href="${escapeHtml(url)}" style="display:inline-block;padding:12px 22px;font-size:16px;font-weight:600;color:#ffffff;text-decoration:none;">${escapeHtml(label)}</a>
          </td></tr>
        </table>`;
}

/**
 * The pickup code, set the way the printed slip sets it: large, bold and
 * spaced, in a red-bordered box, so a parent finds it at a glance at the
 * classroom door.
 */
function codeBlock(code: string): string {
  return `<table role="presentation" width="100%" cellpadding="0" cellspacing="0" style="margin:0 0 16px;border:2px solid #b22222;border-radius:10px;background:#fdf2f2;">
          <tr><td style="padding:14px 18px;text-align:center;">
            <div style="font-size:12px;font-weight:600;letter-spacing:0.12em;text-transform:uppercase;color:#8b0000;">Your pickup code</div>
            <div style="font-size:36px;font-weight:800;letter-spacing:0.25em;line-height:1.2;color:#18181b;font-family:'SF Mono',Menlo,Consolas,'Courier New',monospace;">${escapeHtml(code)}</div>
          </td></tr>
        </table>`;
}

/**
 * The email in the church's colours, with its logo and name.
 *
 * Tables for the header and inline styles throughout, because that is what
 * Outlook and Gmail both render. The body is escaped and its newlines become
 * <br>: HTML collapses newlines, and a list of children's names or a set of
 * credentials is unreadable as one paragraph. <br> rather than
 * white-space:pre-wrap because Outlook's Word engine ignores the latter.
 */
function renderEmail(notification: QueuedNotification): string {
  const f = framing(notification);
  const red = f.urgent ? "#8b0000" : "#b22222";
  const ink = "#18181b";
  const muted = "#71717a";
  const para = `margin:0 0 16px;font-size:16px;line-height:1.65;color:${ink};`;
  // Paragraph by paragraph, so a link standing alone can become a button.
  const prose = (text: string) =>
    text
      .split(/\n{2,}/)
      .filter((block) => block.trim())
      .map((block) => {
        const link = block.trim().match(APP_LINK_LINE);
        return link
          ? linkButton(link[1], BUTTON_LABEL[notification.kind] ?? "Open")
          : `<p style="${para}">${escapeHtml(block).replace(/\n/g, "<br>")}</p>`;
      })
      .join("\n        ");
  const body = splitAtCode(notification);

  return `<!DOCTYPE html>
<html>
  <body style="margin:0;padding:24px;background:#f4f4f5;font-family:-apple-system,BlinkMacSystemFont,'Segoe UI',Roboto,'Noto Sans Ethiopic',sans-serif;">
    <div style="max-width:520px;margin:0 auto;background:#ffffff;border-radius:12px;overflow:hidden;border:1px solid #e4e4e7;">
      <table role="presentation" width="100%" cellpadding="0" cellspacing="0" style="background:${red};">
        <tr>
          <td style="padding:16px 0 16px 22px;width:44px;vertical-align:middle;">
            <img src="${CHURCH_LOGO_URL}" width="44" height="44" alt="" style="display:block;border-radius:50%;background:#ffffff;">
          </td>
          <td style="padding:16px 22px 16px 14px;vertical-align:middle;color:#ffffff;">
            <div style="font-size:15px;font-weight:600;line-height:1.25;">${escapeHtml(CHURCH_NAME)}</div>
            <div style="font-size:12.5px;opacity:0.9;">${MINISTRY} · ${MINISTRY_AM}</div>
          </td>
        </tr>
      </table>
      <div style="padding:22px 22px 4px;">
        <p style="margin:0 0 14px;font-size:19px;font-weight:600;line-height:1.3;color:${ink};">${escapeHtml(f.title)}</p>
        ${f.greeting ? `<p style="${para}">${escapeHtml(f.greeting)}</p>` : ""}
        ${prose(body.before)}
        ${body.code ? codeBlock(body.code) : ""}
        ${prose(body.after)}
        ${f.sentBy ? `<p style="margin:0 0 16px;font-size:13px;color:${muted};">Sent by ${escapeHtml(f.sentBy)}</p>` : ""}
        ${
          f.warm
            ? `<p style="${para}">Be blessed · <span style="color:#b22222;">${BLESSING_AM}</span><br>Addis Lidet ${MINISTRY}</p>
        <p style="margin:0 0 16px;padding-top:14px;border-top:1px solid #f0e4e4;font-size:13px;font-style:italic;line-height:1.5;color:${muted};">${escapeHtml(VERSE)}</p>`
            : ""
        }
      </div>
      <div style="padding:12px 22px;background:#fafafa;border-top:1px solid #e4e4e7;font-size:12px;line-height:1.5;color:${muted};">
        ${NO_REPLY}<br>
        ${escapeHtml(CHURCH_NAME)} · ${CAMPUSES}<br>
        <a href="https://${CHURCH_WEBSITE}" style="color:${muted};">${CHURCH_WEBSITE}</a>
      </div>
    </div>
  </body>
</html>`;
}

/**
 * The same email as plain text. Sent alongside the HTML: a mail client that
 * shows no HTML still gets the whole message, and spam filters trust an email
 * that carries both more than one that carries HTML alone.
 */
function renderText(notification: QueuedNotification): string {
  const f = framing(notification);
  const body = splitAtCode(notification);
  return [
    f.greeting,
    body.before,
    // Plain text has no bold; capitals and a line of its own do the same job.
    body.code ? `YOUR PICKUP CODE:  ${body.code}` : null,
    body.after,
    f.sentBy ? `Sent by ${f.sentBy}` : null,
    f.warm ? `Be blessed · ${BLESSING_AM}\nAddis Lidet ${MINISTRY}` : null,
    f.warm ? VERSE : null,
    `${NO_REPLY}\n${CHURCH_NAME} · ${CAMPUSES}\n${CHURCH_WEBSITE}`,
  ]
    .filter(Boolean)
    .join("\n\n");
}

/**
 * Base64, in chunks.
 *
 * `String.fromCharCode(...bytes)` spreads every byte into the argument list
 * and blows the call-stack limit somewhere past ~100 KB — which a consent PDF
 * with a large family on it can reach. It fails as a RangeError deep inside
 * the send, which reads as "the email is broken" rather than "the file was
 * too big", so it is worth never finding out.
 */
function toBase64(bytes: Uint8Array): string {
  const CHUNK = 0x8000;
  let binary = "";
  for (let i = 0; i < bytes.length; i += CHUNK) {
    binary += String.fromCharCode(...bytes.subarray(i, i + CHUNK));
  }
  return btoa(binary);
}

/**
 * Fetch the attachment, if this row has one.
 *
 * Downloaded with the service role, which is the only thing that can read
 * these buckets — there is no INSERT, UPDATE or DELETE policy for
 * `authenticated` on either, and SELECT is gated on being the family or the
 * office. Returns null when there is nothing to attach; THROWS when there was
 * something and it could not be fetched, so the row fails and retries rather
 * than going out claiming a document it does not carry.
 */
async function loadAttachment(
  // Typed to the one thing it uses rather than to the client, because the
  // client here is bound to the `church` schema and its generic does not
  // match the default one. Naming the capability is also honest: this
  // function reads storage and nothing else.
  storage: {
    from(bucket: string): {
      download(path: string): Promise<{
        data: Blob | null;
        error: { message: string } | null;
      }>;
    };
  },
  notification: QueuedNotification,
): Promise<{ filename: string; content: string } | null> {
  if (!notification.attachment_path || !notification.attachment_bucket) return null;

  const { data, error } = await storage
    .from(notification.attachment_bucket)
    .download(notification.attachment_path);

  if (error || !data) {
    throw new Error(
      `attachment ${notification.attachment_path} could not be read: ${
        error?.message ?? "no data"
      }`,
    );
  }

  const bytes = new Uint8Array(await data.arrayBuffer());
  return {
    filename: notification.attachment_filename ?? "document.pdf",
    content: toBase64(bytes),
  };
}

/**
 * What the service said, when it said no.
 *
 * "quota": the account's daily limit is spent. Nothing else will go today
 * either, so the run stops and every email it holds waits.
 * "rate": more than 10 a second. A moment's pause and it goes.
 * Anything else is a real failure and counts towards the five attempts.
 */
type SendResult =
  | { ok: true; id: string }
  | { ok: false; error: string; wait?: "quota" | "rate" };

async function sendEmail(
  notification: QueuedNotification,
  attachment: { filename: string; content: string } | null,
): Promise<SendResult> {
  const payloadBody: Record<string, unknown> = {
    from: RESEND_FROM_EMAIL,
    to: [notification.recipient_email],
    subject:
      notification.subject ||
      (notification.kind === "volunteer_message"
        ? "Please come to the Children's Ministry"
        : MINISTRY),
    html: renderEmail(notification),
    text: renderText(notification),
  };

  // One `if`. A row without an attachment produces a payload byte-identical
  // to today's, which is what keeps the 748 existing rows behaving exactly as
  // they do now.
  if (attachment) {
    payloadBody.attachments = [attachment];
  }

  const response = await fetch("https://api.resend.com/emails", {
    method: "POST",
    headers: {
      Authorization: `Bearer ${RESEND_API_KEY}`,
      "Content-Type": "application/json",
    },
    body: JSON.stringify(payloadBody),
  });

  const payload = await response.json().catch(() => ({}));
  if (!response.ok) {
    const error: string = payload?.message || `Resend returned ${response.status}`;
    // Matched on the message as well as the name: the message is what every
    // refused row on 27 September and 4 October recorded.
    const wait =
      payload?.name === "daily_quota_exceeded" || /sending quota/i.test(error)
        ? "quota"
        : response.status === 429
          ? "rate"
          : undefined;
    return { ok: false, error, wait };
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
  let waiting = 0;
  // Set when the daily limit is spent. Nothing else goes today either, so the
  // rest of the batch waits instead of being sent and refused one by one.
  let quotaSpent = false;

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

      if (quotaSpent) {
        await supabase.rpc("complete_notification", {
          _id: notification.id,
          _ok: false,
          _error: "waiting: the daily sending limit is reached",
          _retry_after: QUOTA_WAIT,
        });
        waiting++;
        continue;
      }

      // Inside the existing try, on purpose: a failure to read the
      // attachment throws, the row is marked failed with the reason, and it
      // retries. It must NOT send an email whose copy says a record is
      // attached when nothing is.
      const attachment = await loadAttachment(supabase.storage, notification);
      let result = await sendEmail(notification, attachment);
      if (!result.ok && result.wait === "rate") {
        await sleep(1000);
        result = await sendEmail(notification, attachment);
      }
      const wait = result.ok || !result.wait
        ? null
        : result.wait === "quota" ? QUOTA_WAIT : RATE_WAIT;
      if (!result.ok && result.wait === "quota") quotaSpent = true;

      await supabase.rpc("complete_notification", {
        _id: notification.id,
        _ok: result.ok,
        _provider_message_id: result.ok ? result.id : null,
        _error: result.ok ? null : result.error,
        // A wait is not a failed attempt; complete_notification holds the row
        // until then without counting it.
        _retry_after: wait,
      });
      if (result.ok) sent++;
      else if (wait) waiting++;
      else failed++;

      await sleep(PACE_MS);
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
    `Kids notifications: claimed ${notifications.length}, sent ${sent}, failed ${failed}, skipped ${skipped}, waiting ${waiting}`
  );

  return new Response(
    JSON.stringify({ claimed: notifications.length, sent, failed, skipped, waiting }),
    { headers: { ...corsHeaders, "Content-Type": "application/json" } }
  );
});
