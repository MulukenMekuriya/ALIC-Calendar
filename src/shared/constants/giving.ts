/**
 * Where online giving actually happens.
 *
 * ALIC takes card and bank gifts through a Stripe payment link. That link is a
 * public URL — it is printed on the giving page and meant to be shared — so it
 * lives in the source rather than behind an environment variable, with an env
 * override for the case where the church rotates it and wants to change it in
 * one place without a deploy.
 *
 * IMPORTANT: this is the payment rail only. It records nothing in
 * church.donations by itself. A gift becomes a ledger entry either through the
 * `stripe-giving-webhook` edge function (if it has been deployed and the
 * webhook configured in the Stripe dashboard) or through the Giving → Import
 * screen, which reads a Stripe payments export and skips anything already in
 * the ledger. Both paths write the same external_reference, so running both is
 * safe.
 */

export const STRIPE_GIVING_URL =
  import.meta.env.VITE_STRIPE_GIVING_URL ??
  "https://buy.stripe.com/3cIdR8fXp3D5g6u33M4Rq00";

/** The other ways ALIC accepts a gift, in the order the giving page lists them. */
export const GIVING_METHODS_SUMMARY =
  "Card and bank transfer through Stripe, or PayPal, Zelle, Venmo, text, cheque and the offering box.";
