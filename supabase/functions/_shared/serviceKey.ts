/**
 * The key an edge function uses to act as the service role.
 *
 * WHY THIS EXISTS. Every function here used to read
 * `SUPABASE_SERVICE_ROLE_KEY` directly. That is the LEGACY key: a JWT signed
 * with the project's JWT secret, which cannot be revoked on its own. Revoking
 * it means rotating the JWT secret, which also invalidates the anon key and
 * signs every user out - 34 volunteers, on a Sunday, at a check-in desk.
 *
 * Supabase's newer secret keys (`sb_secret_...`) are independently revocable:
 * one can be burned without touching the anon key and without logging anybody
 * out. That is what you want after a leak.
 *
 * THE NAME IS NOT SUPABASE_SECRET_KEY, and cannot be. Supabase reserves the
 * whole `SUPABASE_` prefix for the variables it injects itself, and
 * `supabase secrets set` silently skips anything starting with it:
 *
 *     Env name cannot start with SUPABASE_, skipping: SUPABASE_SECRET_KEY
 *
 * Silently - it exits without an error, so a deploy would look fine and the
 * functions would quietly keep using the legacy key. Hence ALIC_SERVICE_KEY.
 *
 * READ THE NEW ONE, FALL BACK TO THE OLD. The fallback is the whole point -
 * it makes the migration safe in both directions and in any order:
 *
 *   - today, with no ALIC_SERVICE_KEY set, every function behaves exactly
 *     as it does now;
 *   - once the secret is set, functions pick it up on their next deploy;
 *   - after "Disable JWT-based API keys" in the dashboard, the legacy key
 *     stops working and these functions keep running.
 *
 * Without the fallback, disabling legacy keys would take down all seven
 * functions at once: parent emails, check-in notifications, the Stripe giving
 * webhook and user provisioning.
 */
export function serviceKey(): string {
  const key =
    Deno.env.get("ALIC_SERVICE_KEY") ??
    Deno.env.get("SUPABASE_SERVICE_ROLE_KEY");

  if (!key) {
    // Loud, and named. A function that silently builds a client with an empty
    // string fails later with an opaque permission error somewhere else.
    throw new Error(
      "No service key available: set ALIC_SERVICE_KEY (preferred) or " +
        "SUPABASE_SERVICE_ROLE_KEY for this project."
    );
  }
  return key;
}
