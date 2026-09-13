/**
 * Records a Stripe payment-link gift in church.donations.
 *
 * ALIC takes card and bank gifts through a Stripe payment link. Without this
 * function those gifts exist only in Stripe, and the only way into the ledger
 * is the Giving → Import screen with a downloaded CSV. This closes that gap so
 * a gift given on Sunday morning is on the donor's statement by Sunday
 * afternoon.
 *
 * BOTH PATHS ARE SAFE TO RUN AT ONCE. Every row written here carries the
 * Stripe payment-intent id in `external_reference`, and both
 * church.giving_import_commit and the partial unique index
 * uq_donations_external_reference check that column regardless of `source`. So
 * importing January's CSV in February adds nothing this function already
 * recorded, and vice versa. That redundancy is deliberate: if this function is
 * never deployed, or the webhook secret is rotated and nobody notices, the
 * import is the backstop and nothing is lost.
 *
 * DEPLOYING IT
 * ------------
 *   supabase functions deploy stripe-giving-webhook --no-verify-jwt
 *   supabase secrets set STRIPE_WEBHOOK_SECRET=whsec_...
 *   supabase secrets set STRIPE_GIVING_ORGANIZATION_ID=<the branch's uuid>
 *
 * Then in the Stripe dashboard add an endpoint pointing at this function and
 * subscribe it to `checkout.session.completed`. Until all of that is done the
 * function is simply never called, and the import continues to be the way
 * gifts arrive — which is why none of this is a prerequisite for the module.
 *
 * WHICH BRANCH A GIFT BELONGS TO
 * ------------------------------
 * A payment link does not know about Silver Spring and Springfield. The
 * organization comes from the session's metadata `organization_id` when the
 * link sets one, and otherwise from STRIPE_GIVING_ORGANIZATION_ID. To let
 * donors choose, create one payment link per branch with the metadata set.
 */

import { serve } from "https://deno.land/std@0.168.0/http/server.ts";
import { createClient } from "https://esm.sh/@supabase/supabase-js@2";

const STRIPE_WEBHOOK_SECRET = Deno.env.get("STRIPE_WEBHOOK_SECRET");
const DEFAULT_ORGANIZATION_ID = Deno.env.get("STRIPE_GIVING_ORGANIZATION_ID");
const SUPABASE_URL = Deno.env.get("SUPABASE_URL")!;
const SERVICE_ROLE_KEY = Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!;

/** Stripe's default tolerance. Older timestamps are replays. */
const TOLERANCE_SECONDS = 300;

const corsHeaders = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers":
    "authorization, x-client-info, apikey, content-type, stripe-signature",
};

/**
 * Verify the Stripe-Signature header.
 *
 * Written out rather than pulled from the Stripe SDK because the SDK's own
 * verifier wants Node crypto, and this is thirty lines of Web Crypto. The
 * comparison is constant-time; a fast string compare here would leak the
 * signature a byte at a time.
 */
async function verifyStripeSignature(
  payload: string,
  header: string | null,
  secret: string
): Promise<{ ok: true } | { ok: false; reason: string }> {
  if (!header) return { ok: false, reason: "missing signature header" };

  const parts = Object.fromEntries(
    header.split(",").map((part) => {
      const [key, ...rest] = part.split("=");
      return [key.trim(), rest.join("=")];
    })
  ) as Record<string, string>;

  const timestamp = parts["t"];
  const signature = parts["v1"];
  if (!timestamp || !signature) return { ok: false, reason: "malformed signature header" };

  const age = Math.abs(Math.floor(Date.now() / 1000) - Number(timestamp));
  if (!Number.isFinite(age) || age > TOLERANCE_SECONDS) {
    return { ok: false, reason: "timestamp outside tolerance" };
  }

  const key = await crypto.subtle.importKey(
    "raw",
    new TextEncoder().encode(secret),
    { name: "HMAC", hash: "SHA-256" },
    false,
    ["sign"]
  );
  const mac = await crypto.subtle.sign(
    "HMAC",
    key,
    new TextEncoder().encode(`${timestamp}.${payload}`)
  );
  const expected = Array.from(new Uint8Array(mac))
    .map((byte) => byte.toString(16).padStart(2, "0"))
    .join("");

  if (expected.length !== signature.length) {
    return { ok: false, reason: "signature mismatch" };
  }
  let diff = 0;
  for (let i = 0; i < expected.length; i++) {
    diff |= expected.charCodeAt(i) ^ signature.charCodeAt(i);
  }
  return diff === 0 ? { ok: true } : { ok: false, reason: "signature mismatch" };
}

interface StripeSession {
  id: string;
  object: string;
  payment_intent?: string | null;
  amount_total?: number | null;
  currency?: string | null;
  created?: number | null;
  payment_status?: string | null;
  customer_details?: {
    name?: string | null;
    email?: string | null;
    phone?: string | null;
  } | null;
  metadata?: Record<string, string> | null;
}

/** Stripe seconds → an ISO date in UTC. */
function isoDate(seconds: number | null | undefined): string {
  const ms = seconds ? seconds * 1000 : Date.now();
  return new Date(ms).toISOString().slice(0, 10);
}

serve(async (req) => {
  if (req.method === "OPTIONS") {
    return new Response("ok", { headers: corsHeaders });
  }

  // A misconfigured function fails loudly. Stripe surfaces non-2xx responses
  // in its dashboard, which is the only place anyone would notice; a cheerful
  // 200 here would mean gifts quietly never arriving.
  if (!STRIPE_WEBHOOK_SECRET) {
    console.error("STRIPE_WEBHOOK_SECRET is not set");
    return new Response(
      JSON.stringify({ error: "webhook secret not configured" }),
      { status: 500, headers: { ...corsHeaders, "Content-Type": "application/json" } }
    );
  }

  const payload = await req.text();
  const verified = await verifyStripeSignature(
    payload,
    req.headers.get("stripe-signature"),
    STRIPE_WEBHOOK_SECRET
  );

  if (!verified.ok) {
    // 400, not 500: a bad signature is not something to retry.
    console.error("Rejected webhook:", verified.reason);
    return new Response(JSON.stringify({ error: verified.reason }), {
      status: 400,
      headers: { ...corsHeaders, "Content-Type": "application/json" },
    });
  }

  let event: { type?: string; data?: { object?: StripeSession } };
  try {
    event = JSON.parse(payload);
  } catch {
    return new Response(JSON.stringify({ error: "unparseable body" }), {
      status: 400,
      headers: { ...corsHeaders, "Content-Type": "application/json" },
    });
  }

  // Everything else Stripe might send is acknowledged and dropped. Returning
  // 200 for these stops Stripe retrying events we will never care about.
  if (event.type !== "checkout.session.completed") {
    return new Response(JSON.stringify({ ignored: event.type }), {
      status: 200,
      headers: { ...corsHeaders, "Content-Type": "application/json" },
    });
  }

  const session = event.data?.object;
  if (!session || session.payment_status !== "paid" || !session.amount_total) {
    return new Response(JSON.stringify({ ignored: "not a completed payment" }), {
      status: 200,
      headers: { ...corsHeaders, "Content-Type": "application/json" },
    });
  }

  const organizationId = session.metadata?.organization_id ?? DEFAULT_ORGANIZATION_ID;
  if (!organizationId) {
    console.error(
      "No organization for session", session.id,
      "— set STRIPE_GIVING_ORGANIZATION_ID or put organization_id in the payment link's metadata"
    );
    return new Response(
      JSON.stringify({ error: "no organization configured" }),
      { status: 500, headers: { ...corsHeaders, "Content-Type": "application/json" } }
    );
  }

  const supabase = createClient(SUPABASE_URL, SERVICE_ROLE_KEY);
  const church = supabase.schema("church");

  // The reference is the payment intent where there is one, falling back to
  // the session id. Whichever it is, it is what makes a re-delivered webhook
  // and a later CSV import both no-ops.
  const reference = session.payment_intent ?? session.id;

  const alreadyThere = await church
    .from("donations")
    .select("id")
    .eq("organization_id", organizationId)
    .eq("external_reference", reference)
    .maybeSingle();

  if (alreadyThere.data) {
    return new Response(
      JSON.stringify({ ok: true, duplicate: true, donation_id: alreadyThere.data.id }),
      { status: 200, headers: { ...corsHeaders, "Content-Type": "application/json" } }
    );
  }

  // Fund from the link's metadata, falling back to the general fund.
  const fundCode = (session.metadata?.fund ?? "general").toLowerCase();
  const fund = await church
    .from("giving_funds")
    .select("id, is_tax_deductible")
    .eq("organization_id", organizationId)
    .eq("code", fundCode)
    .maybeSingle();

  if (!fund.data) {
    console.error(`Unknown fund "${fundCode}" for organization ${organizationId}`);
    return new Response(JSON.stringify({ error: `unknown fund ${fundCode}` }), {
      status: 500,
      headers: { ...corsHeaders, "Content-Type": "application/json" },
    });
  }

  /**
   * Donor matching, on email and only on email.
   *
   * church.giving_match_donor is not reachable from here — it checks
   * has_permission_in_org, which is written in terms of auth.uid(), and the
   * service role has none. So this does the one match that cannot be wrong:
   * an exact email, and only when exactly one person has it. Two people
   * sharing an address means unmatched, because crediting the wrong one puts
   * the gift on the wrong household's tax statement.
   *
   * Everything unmatched lands on the Unmatched list in the Giving screen,
   * which is a worklist a human clears — not a failure.
   */
  let personId: string | null = null;
  const email = session.customer_details?.email?.trim().toLowerCase();
  if (email) {
    const matches = await church
      .from("people")
      .select("id")
      .eq("organization_id", organizationId)
      .ilike("email", email)
      .is("merged_into_person_id", null)
      .limit(2);
    if (matches.data?.length === 1) {
      personId = matches.data[0].id;
    }
  }

  /**
   * The Stripe fee is not recorded here.
   *
   * It lives on the balance transaction, which is another API call and another
   * secret to hold, and the statement never uses it — the donor gave the gross
   * amount and that is what they are receipted for. The CSV import carries the
   * fee for anyone reconciling the payout, and its rows are skipped as
   * duplicates, so the trade is: fees are visible in Stripe, gifts are visible
   * here, immediately.
   */
  const insert = await church.from("donations").insert({
    organization_id: organizationId,
    fund_id: fund.data.id,
    person_id: personId,
    amount_cents: session.amount_total,
    fee_cents: 0,
    received_on: isoDate(session.created),
    method: "card",
    source: "stripe_webhook",
    external_reference: reference,
    donor_name_raw: session.customer_details?.name ?? null,
    donor_email_raw: session.customer_details?.email ?? null,
    donor_phone_raw: session.customer_details?.phone ?? null,
    is_tax_deductible: fund.data.is_tax_deductible,
    created_by_name: "Stripe",
  });

  if (insert.error) {
    // 23505 is the partial unique index on external_reference doing its job
    // in a race with a redelivery. That is success, not failure.
    if (insert.error.code === "23505") {
      return new Response(JSON.stringify({ ok: true, duplicate: true }), {
        status: 200,
        headers: { ...corsHeaders, "Content-Type": "application/json" },
      });
    }
    console.error("Could not record donation:", insert.error);
    return new Response(JSON.stringify({ error: insert.error.message }), {
      status: 500,
      headers: { ...corsHeaders, "Content-Type": "application/json" },
    });
  }

  return new Response(
    JSON.stringify({
      ok: true,
      amount_cents: session.amount_total,
      matched: personId !== null,
      fund: fundCode,
    }),
    { status: 200, headers: { ...corsHeaders, "Content-Type": "application/json" } }
  );
});
