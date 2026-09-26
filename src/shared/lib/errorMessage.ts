/**
 * The reason, in the words of whoever refused.
 *
 * `error instanceof Error ? error.message : "An error occurred"` is written in
 * about ninety places in this app, and for the errors that matter most it is
 * wrong: supabase-js rejects with a PostgrestError, which is a plain object
 * carrying { message, details, hint, code } and is NOT an instance of Error.
 * So every database refusal — a row-level policy, a unique constraint, a
 * RAISE EXCEPTION written specifically to be read by a person — arrived on
 * screen as "An error occurred".
 *
 * The one that prompted this: the guard that stops a branch losing its last
 * admin says "This is the last admin of this branch. Make somebody else an
 * admin first." An admin who tripped it was shown five words of nothing.
 */

/** A plausible message off anything that was thrown. */
export const errorMessage = (
  error: unknown,
  fallback = "An error occurred",
): string => {
  if (typeof error === "string" && error.trim()) return error;

  if (error instanceof Error && error.message.trim()) return error.message;

  if (error && typeof error === "object") {
    const { message, hint } = error as { message?: unknown; hint?: unknown };

    if (typeof message === "string" && message.trim()) {
      // Postgres hints are written for the person reading them, so keep them.
      return typeof hint === "string" && hint.trim()
        ? `${message.trim()} ${hint.trim()}`
        : message.trim();
    }
  }

  return fallback;
};
