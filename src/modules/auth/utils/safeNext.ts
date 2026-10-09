/**
 * Where to go after signing in.
 *
 * A link in an email (the consent reminder's, alic.org/my?tab=children&
 * consent=1) reaches a parent who is not signed in; the app sends them to
 * /auth?next=… and, once they are in, back to the page they were opening.
 *
 * Only a path inside this app is honoured. "/my?tab=children" is; "//evil.com"
 * and "https://evil.com" are not: a sign-in page that sends people to any
 * address in its query string is a phishing tool with the church's name on
 * it. Anything else lands on /dashboard, as every sign-in did before.
 */
export const AFTER_SIGN_IN = "/dashboard";

export function safeNext(raw: string | null | undefined): string {
  if (!raw) return AFTER_SIGN_IN;
  if (!raw.startsWith("/") || raw.startsWith("//") || raw.startsWith("/\\")) {
    return AFTER_SIGN_IN;
  }
  // Signing in to land back on the sign-in page helps nobody.
  if (raw === "/auth" || raw.startsWith("/auth?")) return AFTER_SIGN_IN;
  return raw;
}

/** The address of the sign-in page for someone who was opening `path`. */
export function signInFor(path: string): string {
  return path === "/" || path === AFTER_SIGN_IN
    ? "/auth"
    : `/auth?next=${encodeURIComponent(path)}`;
}
