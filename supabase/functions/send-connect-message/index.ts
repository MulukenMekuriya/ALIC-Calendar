import { serve } from "https://deno.land/std@0.168.0/http/server.ts";

const RESEND_API_KEY = Deno.env.get("RESEND_API");
const RESEND_FROM_EMAIL =
  Deno.env.get("RESEND_FROM_EMAIL") ||
  "Addis Lidet Connect <team@addislidet.info>";
const CHURCH_NAME =
  Deno.env.get("CHURCH_NAME") || "Addis Lidet International Church";
const CHURCH_LOGO_URL =
  Deno.env.get("CHURCH_LOGO_URL") || "https://addislidet.info/logo.png";

const CONNECT_RECIPIENTS = [
  "Info@addislidetchurch.com",
  "IT@ALIC.ORG",
];

const corsHeaders = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers":
    "authorization, x-client-info, apikey, content-type",
};

interface ConnectMessageRequest {
  role: string;
  roleLabel: string;
  name: string;
  email: string;
  phone?: string;
  campus?: string;
  campusLabel?: string;
  note?: string;
}

function escapeHtml(value: string): string {
  return value
    .replace(/&/g, "&amp;")
    .replace(/</g, "&lt;")
    .replace(/>/g, "&gt;")
    .replace(/"/g, "&quot;")
    .replace(/'/g, "&#039;");
}

serve(async (req) => {
  if (req.method === "OPTIONS") {
    return new Response("ok", { headers: corsHeaders });
  }

  try {
    const body = (await req.json()) as ConnectMessageRequest;

    const name = (body.name || "").trim();
    const email = (body.email || "").trim();
    const roleLabel = (body.roleLabel || body.role || "").trim();

    if (!name || !email || !roleLabel) {
      return new Response(
        JSON.stringify({ error: "Missing required fields" }),
        {
          status: 400,
          headers: { ...corsHeaders, "Content-Type": "application/json" },
        }
      );
    }

    if (!RESEND_API_KEY) {
      console.error("RESEND_API is not configured");
      return new Response(
        JSON.stringify({ error: "Email service not configured" }),
        {
          status: 500,
          headers: { ...corsHeaders, "Content-Type": "application/json" },
        }
      );
    }

    const phone = (body.phone || "").trim();
    const campusLabel = (body.campusLabel || body.campus || "").trim();
    const note = (body.note || "").trim();

    const subject = `New Connect message — ${roleLabel} (${name})`;

    const detailRow = (label: string, value: string) => `
      <tr>
        <td style="padding:8px 0;color:#6b7280;font-size:14px;font-weight:600;width:140px;">${escapeHtml(label)}</td>
        <td style="padding:8px 0;color:#1f2937;font-size:14px;">${escapeHtml(value)}</td>
      </tr>`;

    const htmlBody = `
<!DOCTYPE html>
<html lang="en">
<head><meta charset="UTF-8"><title>${escapeHtml(subject)}</title></head>
<body style="margin:0;padding:0;font-family:-apple-system,BlinkMacSystemFont,'Segoe UI',Roboto,'Helvetica Neue',Arial,sans-serif;background-color:#f3f4f6;">
  <table role="presentation" cellspacing="0" cellpadding="0" border="0" width="100%" style="background-color:#f3f4f6;padding:40px 20px;">
    <tr>
      <td align="center">
        <table role="presentation" cellspacing="0" cellpadding="0" border="0" width="600" style="max-width:600px;background-color:#ffffff;border-radius:16px;overflow:hidden;box-shadow:0 10px 40px rgba(0,0,0,0.08);">
          <tr>
            <td style="background:linear-gradient(135deg,#b22222 0%,#8b0000 100%);padding:36px 32px;text-align:center;">
              <img src="${CHURCH_LOGO_URL}" alt="${escapeHtml(CHURCH_NAME)}" style="width:64px;height:64px;border-radius:12px;margin-bottom:16px;display:block;margin-left:auto;margin-right:auto;" />
              <h1 style="margin:0;color:#ffffff;font-size:22px;font-weight:700;letter-spacing:-0.3px;">New Connect message</h1>
              <p style="margin:8px 0 0;color:rgba(255,255,255,0.85);font-size:13px;">${escapeHtml(CHURCH_NAME)}</p>
            </td>
          </tr>
          <tr>
            <td style="padding:28px 32px 8px;">
              <p style="margin:0 0 16px;color:#374151;font-size:15px;line-height:1.6;">
                Someone just submitted the Connect form on the website.
              </p>
              <table role="presentation" cellspacing="0" cellpadding="0" border="0" width="100%" style="background-color:#f9fafb;border:1px solid #e5e7eb;border-radius:8px;">
                <tr><td style="padding:16px 20px;">
                  <table role="presentation" cellspacing="0" cellpadding="0" border="0" width="100%">
                    ${detailRow("I'd like to", roleLabel)}
                    ${detailRow("Name", name)}
                    ${detailRow("Email", email)}
                    ${phone ? detailRow("Phone", phone) : ""}
                    ${campusLabel ? detailRow("Campus", campusLabel) : ""}
                  </table>
                </td></tr>
              </table>
            </td>
          </tr>
          ${
            note
              ? `
          <tr>
            <td style="padding:8px 32px 28px;">
              <h4 style="margin:0 0 10px;color:#1f2937;font-size:13px;font-weight:700;text-transform:uppercase;letter-spacing:0.5px;">Message</h4>
              <div style="background-color:#fffbeb;border-left:4px solid #f59e0b;border-radius:8px;padding:16px 18px;color:#78350f;font-size:14px;line-height:1.6;white-space:pre-wrap;">${escapeHtml(note)}</div>
            </td>
          </tr>`
              : ""
          }
          <tr>
            <td style="padding:24px 32px;background:#f9fafb;border-top:1px solid #e5e7eb;text-align:center;">
              <p style="margin:0;color:#9ca3af;font-size:11px;">Reply directly to this email to respond to ${escapeHtml(name)}.</p>
            </td>
          </tr>
        </table>
      </td>
    </tr>
  </table>
</body>
</html>`;

    const textBody = [
      `New Connect message`,
      ``,
      `I'd like to: ${roleLabel}`,
      `Name: ${name}`,
      `Email: ${email}`,
      phone ? `Phone: ${phone}` : null,
      campusLabel ? `Campus: ${campusLabel}` : null,
      note ? `\nMessage:\n${note}` : null,
    ]
      .filter(Boolean)
      .join("\n");

    const res = await fetch("https://api.resend.com/emails", {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
        Authorization: `Bearer ${RESEND_API_KEY}`,
      },
      body: JSON.stringify({
        from: RESEND_FROM_EMAIL,
        to: CONNECT_RECIPIENTS,
        reply_to: email,
        subject,
        html: htmlBody,
        text: textBody,
      }),
    });

    const data = await res.json();

    if (!res.ok) {
      console.error("Resend error:", data);
      return new Response(
        JSON.stringify({ error: "Failed to send email", details: data }),
        {
          status: res.status,
          headers: { ...corsHeaders, "Content-Type": "application/json" },
        }
      );
    }

    return new Response(JSON.stringify({ success: true, data }), {
      status: 200,
      headers: { ...corsHeaders, "Content-Type": "application/json" },
    });
  } catch (error) {
    console.error("send-connect-message error:", error);
    const message =
      error instanceof Error ? error.message : "Unknown error occurred";
    return new Response(JSON.stringify({ error: message }), {
      status: 500,
      headers: { ...corsHeaders, "Content-Type": "application/json" },
    });
  }
});
