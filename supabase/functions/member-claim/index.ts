/**
 * The QR code at the back of the room.
 *
 * One public endpoint behind /welcome, where somebody who has just scanned a
 * code on the screen finds out whether the church has them on file and gets a
 * link to set a password. Three actions, and the browser is never trusted with
 * anything between them:
 *
 *   lookup    "are we on the books"      -> yes / no / ambiguous / no email
 *   claim     "send me the link"         -> re-runs the lookup server-side
 *   register  "put me on the books"      -> creates the person and the login
 *
 * WHY `claim` DOES THE LOOKUP AGAIN. The obvious design hands the browser a
 * person_id from the lookup and takes it back on the next call, which means a
 * stranger can post any id they like and have a link sent for somebody else's
 * record. So no identifier ever leaves this function: the browser re-sends the
 * email address or telephone number it already had, and the match is made
 * fresh. The only thing the caller learns is yes/no and a masked address.
 *
 * AND WHY THE LINK ONLY EVER GOES TO THE ADDRESS ON FILE. Not to the address
 * typed into the form. They are usually the same — matching by email is the
 * common path — but on the telephone path they are not, and an endpoint that
 * mails an account link to whatever address a stranger supplies is an account
 * takeover with extra steps.
 *
 * VERIFY_JWT IS OFF for this function. It has to be: the caller has no account
 * yet, which is the entire point. Everything it can do is bounded by the four
 * SECURITY DEFINER functions in 20260322100000, all of them granted to
 * service_role alone, plus the rate limit recorded on every call.
 *
 * EMAIL GOES OUT THROUGH RESEND DIRECTLY rather than through
 * supabase.auth.resetPasswordForEmail. That call would reuse the branded
 * template in send-auth-email, which is nicer, and it is also governed by the
 * project's auth email rate limit — a number that defaults low and, on a
 * Sunday when three hundred people scan a code in ten minutes, would start
 * refusing silently. admin.generateLink mints the same link without sending
 * anything, so the throughput question becomes Resend's rather than Supabase
 * Auth's, and a failure to send is something this function can see and report.
 */

import { createClient } from "https://esm.sh/@supabase/supabase-js@2";
import { Resend } from "https://esm.sh/resend@2.0.0";

const corsHeaders = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers":
    "authorization, x-client-info, apikey, content-type",
};

const resend = new Resend(Deno.env.get("RESEND_API"));

const CHURCH_NAME =
  Deno.env.get("CHURCH_NAME") || "Addis Lidet International Church";
// alic.org serves this same React app, and it is where the QR code sends
// people — so the link they get by email keeps them on the host they are
// already standing on. app.addislidet.info, the old default here and in
// send-auth-email, does not resolve at all.
const APP_URL = Deno.env.get("APP_URL") || "https://alic.org";
const FROM = `${CHURCH_NAME} <team@addislidet.info>`;

/** Branch ids, so the QR code can carry a short letter instead of a UUID. */
const BRANCHES: Record<string, string> = {
  md: "a0eebc99-9c0b-4ef8-bb6d-6bb9bd380a11",
  va: "b1eebc99-9c0b-4ef8-bb6d-6bb9bd380a22",
};

interface ClaimRequest {
  action: "lookup" | "claim" | "register" | "signup";
  branch?: string;
  email?: string;
  phone?: string;
  first_name?: string;
  last_name?: string;
  password?: string;
}

const json = (body: unknown, status = 200) =>
  new Response(JSON.stringify(body), {
    headers: { ...corsHeaders, "Content-Type": "application/json" },
    status,
  });

/**
 * The nearest thing to a caller we get. On a Sunday the whole congregation is
 * behind one church wifi and shares this, which is why the per-IP ceiling is
 * set where it is — see the migration header.
 */
function callerIp(req: Request): string | null {
  const forwarded = req.headers.get("x-forwarded-for");
  return forwarded ? forwarded.split(",")[0].trim() : null;
}

/** What the rate limiter counts. Never the raw input. */
function rateKey(email?: string, phone?: string): string {
  const cleaned = (phone ?? "").replace(/\D/g, "");
  if (email && email.trim()) return email.trim().toLowerCase();
  return cleaned.slice(-10);
}

function setPasswordEmail(link: string, isNew: boolean): string {
  const heading = isNew ? "Welcome to " + CHURCH_NAME : "Set your password";
  const line = isNew
    ? "Thank you for registering. Choose a password and your church account is ready."
    : "Somebody asked to set the password on your church account. If that was not you, ignore this email and nothing changes.";

  return `<!doctype html>
<html><body style="margin:0;padding:0;background:#f5f7fa;font-family:-apple-system,BlinkMacSystemFont,'Segoe UI',Roboto,Arial,sans-serif;">
  <table role="presentation" width="100%" cellpadding="0" cellspacing="0" style="background:#f5f7fa;padding:24px 12px;">
    <tr><td align="center">
      <table role="presentation" width="100%" cellpadding="0" cellspacing="0" style="max-width:520px;background:#ffffff;border-radius:12px;padding:32px;">
        <tr><td>
          <h1 style="margin:0 0 8px;font-size:20px;color:#111;">${heading}</h1>
          <p style="margin:0 0 20px;font-size:15px;line-height:1.5;color:#444;">${line}</p>
          <a href="${link}" style="display:inline-block;background:#4f46e5;color:#ffffff;text-decoration:none;padding:13px 26px;border-radius:8px;font-size:16px;font-weight:600;">Set my password</a>
          <p style="margin:22px 0 0;font-size:13px;line-height:1.5;color:#666;">
            The link works once and expires in 24 hours. After that, scan the code at church again or ask at the welcome desk.
          </p>
          <p style="margin:18px 0 0;font-size:12px;color:#999;word-break:break-all;">${link}</p>
        </td></tr>
      </table>
      <p style="margin:16px 0 0;font-size:12px;color:#999;">${CHURCH_NAME}</p>
    </td></tr>
  </table>
</body></html>`;
}

Deno.serve(async (req) => {
  if (req.method === "OPTIONS") {
    return new Response("ok", { headers: corsHeaders });
  }

  const admin = createClient(
    Deno.env.get("SUPABASE_URL") ?? "",
    Deno.env.get("SUPABASE_SERVICE_ROLE_KEY") ?? "",
    { auth: { autoRefreshToken: false, persistSession: false } }
  );

  try {
    const body: ClaimRequest = await req.json();
    const branchId = BRANCHES[(body.branch ?? "md").toLowerCase()];
    if (!branchId) return json({ error: "unknown_branch" }, 400);

    const email = (body.email ?? "").trim();
    const phone = (body.phone ?? "").trim();
    const key = rateKey(email, phone);
    if (!key) return json({ error: "nothing_to_look_up" }, 400);

    const ip = callerIp(req);
    const action = body.action;

    const { data: allowed } = await admin.schema("church").rpc("claim_note_attempt", {
      _ip: ip,
      _identifier: key,
      _action:
        action === "register" || action === "signup"
          ? "register"
          : action === "claim"
            ? "send"
            : "lookup",
    });
    if (allowed === false) {
      return json(
        {
          error: "too_many_attempts",
          message:
            "That is a few tries in a short time. Wait an hour, or ask at the welcome desk and somebody will sort it out now.",
        },
        429
      );
    }

    // ----------------------------------------------------------------- look
    const { data: verdict, error: lookupError } = await admin
      .schema("church")
      .rpc("claim_lookup", {
        _organization_id: branchId,
        _email: email || null,
        _phone: phone || null,
        _first_name: body.first_name ?? null,
        _last_name: body.last_name ?? null,
      });
    if (lookupError) throw lookupError;

    const found = verdict as {
      outcome: string;
      person_id: string | null;
      auth_user_id: string | null;
      masked_email: string | null;
    };

    if (action === "lookup") {
      // person_id and auth_user_id are deliberately NOT returned. See the
      // header: nothing the next call needs may pass through the browser.
      return json({ outcome: found.outcome, masked_email: found.masked_email });
    }

    // ---------------------------------------------------------------- claim
    if (action === "claim") {
      if (found.outcome !== "claimable") {
        return json({ outcome: found.outcome });
      }

      // The address ON FILE, never the one typed in. The lookup masked it for
      // the browser; here we need the real one, and only the service role can
      // read it.
      const { data: person, error: personError } = await admin
        .schema("church")
        .from("people")
        .select("id, email, first_name, profile_id")
        .eq("id", found.person_id!)
        .single();
      if (personError) throw personError;

      let userId = person.profile_id as string | null;
      let isNew = false;

      if (!userId) {
        // On the books with no account at all, or with one nobody ever joined
        // to their record — there were 27 of the latter before this page
        // existed, and every one of them could reset a password and still be
        // told their login was not linked to anything.
        const account = await findOrCreateUser(admin, person.email, person.first_name);
        userId = account.id;
        // Only a genuinely new account gets the "welcome" wording. Somebody
        // whose account existed but was never joined to their record is not
        // new to the church, and telling them so would be odd.
        isNew = account.created;
      }

      // The step that stops "your login is not linked to a member record yet".
      const { error: linkError } = await admin
        .schema("church")
        .rpc("claim_attach_login", { _person_id: person.id, _auth_user_id: userId });
      if (linkError) throw linkError;

      const sent = await sendSetPasswordLink(admin, person.email, isNew);
      if (!sent.ok) return json({ error: "could_not_send", message: sent.message }, 502);

      return json({ outcome: "sent", masked_email: found.masked_email });
    }

    // --------------------------------------------------------------- signup
    /*
     * Somebody the church does not have, choosing a password.
     *
     * The account is made HERE with the service key rather than by
     * supabase.auth.signUp in the browser, for two reasons. Public signup is
     * deliberately switched off for this project — see the note in Auth.tsx —
     * and turning it back on would open the door for the whole internet, not
     * just for the person standing in the building. And creating it here means
     * no confirmation email has to arrive for them to get in: they set a
     * password and are signed in on the spot, which on a Sunday morning is the
     * difference between finishing and giving up. It also sidesteps the spam
     * folder entirely, since nothing is sent.
     *
     * The address is NOT verified by this route. That is the trade, and it is
     * bounded: this path only runs for an address that matches nobody in the
     * directory, so the worst case is a new record with an email that is not
     * theirs — not access to somebody else's. Anyone whose address DOES match
     * is sent down the claim path instead, where the link goes to the address
     * on file and proves itself.
     */
    if (action === "signup") {
      if (!email) return json({ error: "email_required" }, 400);
      if ((body.password ?? "").length < 8) {
        return json({ error: "password_too_short" }, 400);
      }

      /*
       * Checked again on the server, and checked WITHOUT the names.
       *
       * `found` above was narrowed by whatever first and last name came in the
       * request, which is right for the claim flow — it is how a couple
       * sharing one address says which of them is signing in. It is exactly
       * wrong here: a request naming a real member's email address and a
       * made-up name narrows to nobody, reads as not_found, and would create a
       * second account squatting that member's address. The member could then
       * never claim their own record, because the claim path would find the
       * squatter's account and link it.
       *
       * So the question this asks is the one that matters: does this ADDRESS
       * belong to somebody on the books, whatever anyone claims to be called.
       */
      const { data: byAddress, error: addressError } = await admin
        .schema("church")
        .rpc("claim_lookup", {
          _organization_id: branchId,
          _email: email || null,
          _phone: phone || null,
          _first_name: null,
          _last_name: null,
        });
      if (addressError) throw addressError;

      const onTheBooks = byAddress as { outcome: string; masked_email: string | null };
      if (
        onTheBooks.outcome === "claimable" ||
        onTheBooks.outcome === "ambiguous" ||
        onTheBooks.outcome === "no_email"
      ) {
        return json({
          outcome: onTheBooks.outcome,
          masked_email: onTheBooks.masked_email,
        });
      }

      const { data: existingId } = await admin
        .schema("church")
        .rpc("auth_user_id_for_email", { _email: email });
      if (existingId) {
        // An account with no member record behind it — they started this once
        // before, or they have an old login. Nothing to create; the page sends
        // them to sign in.
        return json({ outcome: "account_exists" });
      }

      if (!body.first_name?.trim() || !body.last_name?.trim()) {
        return json({ error: "name_required" }, 400);
      }

      const created = await admin.auth.admin.createUser({
        email,
        password: body.password,
        email_confirm: true,
      });
      if (created.error) throw created.error;

      /*
       * The record, made now rather than left for a form they may never come
       * back to. Without it they are signed in to a My Church that says their
       * login is not linked to anything — which is the failure this whole
       * feature exists to prevent, delivered to the people it was built for.
       *
       * church.register_new_member also gives them a household, which is what
       * makes the address, the telephone number and the children editable from
       * the portal the moment they land.
       */
      const { error: personError } = await admin
        .schema("church")
        .rpc("register_new_member", {
          _organization_id: branchId,
          _first_name: body.first_name.trim(),
          _last_name: body.last_name.trim(),
          _email: email,
          _phone: phone || null,
          _auth_user_id: created.data.user!.id,
        });
      if (personError) throw personError;

      return json({ outcome: "signed_up" });
    }

    // ------------------------------------------------------------- register
    if (action === "register") {
      if (found.outcome === "claimable" || found.outcome === "ambiguous") {
        // Somebody registering who is in fact already on file. Do not make a
        // second row for them — send the link to the address on record.
        return json({ outcome: found.outcome, masked_email: found.masked_email });
      }
      if (!email) return json({ error: "email_required" }, 400);
      if (!body.first_name?.trim() || !body.last_name?.trim()) {
        return json({ error: "name_required" }, 400);
      }

      const account = await findOrCreateUser(
        admin,
        email,
        `${body.first_name.trim()} ${body.last_name.trim()}`
      );

      const { error: registerError } = await admin
        .schema("church")
        .rpc("register_new_member", {
          _organization_id: branchId,
          _first_name: body.first_name.trim(),
          _last_name: body.last_name.trim(),
          _email: email,
          _phone: phone || null,
          _auth_user_id: account.id,
        });
      if (registerError) throw registerError;

      const sent = await sendSetPasswordLink(admin, email, true);
      if (!sent.ok) return json({ error: "could_not_send", message: sent.message }, 502);

      return json({ outcome: "registered" });
    }

    return json({ error: "unknown_action" }, 400);
  } catch (error) {
    console.error("member-claim failed:", error);
    return json(
      {
        error: "something_went_wrong",
        message:
          "Something went wrong at our end. Ask at the welcome desk and somebody will sort it out.",
      },
      500
    );
  }
});

/**
 * The account for an address: the one that exists, or a new one.
 *
 * Asked in SQL rather than through listUsers, which pages through every
 * account in the project and cannot filter by email — see
 * church.auth_user_id_for_email. The account is created already confirmed and
 * with no password: the recovery link is what sets one, so there is never a
 * generated password in flight that somebody would have to be told.
 */
async function findOrCreateUser(
  admin: ReturnType<typeof createClient>,
  email: string,
  fullName: string | null
): Promise<{ id: string; created: boolean }> {
  const { data: existingId, error } = await admin
    .schema("church")
    .rpc("auth_user_id_for_email", { _email: email });
  if (error) throw error;
  if (existingId) return { id: existingId as string, created: false };

  const created = await admin.auth.admin.createUser({
    email,
    email_confirm: true,
    user_metadata: fullName ? { full_name: fullName } : undefined,
  });
  if (created.error) throw created.error;
  return { id: created.data.user!.id, created: true };
}

/**
 * Mint a one-time link and post it. generateLink does not send anything
 * itself, which is the point — see the header.
 */
async function sendSetPasswordLink(
  admin: ReturnType<typeof createClient>,
  email: string,
  isNew: boolean
): Promise<{ ok: boolean; message?: string }> {
  const { data, error } = await admin.auth.admin.generateLink({
    type: "recovery",
    email,
    options: {
      // welcome=1 lands them in My Church rather than on the staff dashboard
      // they are not allowed to see.
      redirectTo: `${APP_URL}/reset-password?welcome=1`,
    },
  });

  if (error || !data?.properties?.action_link) {
    console.error("generateLink failed:", error);
    return { ok: false, message: "We could not build your link. Ask at the welcome desk." };
  }

  const sent = await resend.emails.send({
    from: FROM,
    to: [email],
    subject: isNew
      ? `Welcome to ${CHURCH_NAME} — set your password`
      : `Set your password | ${CHURCH_NAME}`,
    html: setPasswordEmail(data.properties.action_link, isNew),
  });

  if (sent.error) {
    console.error("resend failed:", sent.error);
    return { ok: false, message: "We could not send the email just now. Ask at the welcome desk." };
  }
  return { ok: true };
}
