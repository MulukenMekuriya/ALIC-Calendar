/**
 * Why the sign-in did not work, said to the person who tried it.
 *
 * GoTrue answers a failed sign-in with a bare 400 and "Invalid login
 * credentials". That sentence is true of a mistyped password, an address the
 * member no longer uses, and an account an administrator never created — three
 * different problems with three different remedies, and the member is told
 * nothing that separates them. Worse, it was shown in a toast, which slides
 * away after a few seconds while the person is still looking at the password
 * field wondering what happened.
 *
 * So each failure gets a title, a sentence that names what to do next, and
 * optionally a `link` the form turns into a button. The rules are the ones
 * sayWhyNot already follows in the portal:
 *
 *  - SAY WHAT TO DO NEXT. Every entry below ends somewhere the member can go —
 *    the reset link, the church office, "try again in a minute".
 *  - DO NOT LEAK WHO HAS AN ACCOUNT. `invalid_credentials` deliberately covers
 *    both a wrong password and an address with no account behind it, and the
 *    sentence here keeps them covered. Telling a stranger which addresses are
 *    real is how a member list leaks.
 *
 * Matched on `code` first, which is what a current GoTrue sends, then on the
 * message text, because the error a self-hosted or older instance returns may
 * carry only that.
 */

export type SignInProblem = {
  title: string;
  description: string;
  /** Where the member goes next, rendered as a button under the message. */
  link?: { label: string; to: string };
};

/** Shape of what supabase-js hands back; `code` is absent on older instances. */
type MaybeAuthError = {
  code?: string;
  status?: number;
  message?: string;
  name?: string;
};

const FORGOT = { label: "Reset your password", to: "/forgot-password" };

export function whySignInFailed(error: unknown): SignInProblem {
  const e = (error ?? {}) as MaybeAuthError;
  const code = typeof e.code === "string" ? e.code : "";
  const message = typeof e.message === "string" ? e.message : String(error ?? "");
  const status = typeof e.status === "number" ? e.status : 0;
  const text = `${code} ${message}`.toLowerCase();

  // The browser never reached Supabase at all: a dropped wifi, a blocked
  // request, a project that is paused. Nothing about the credentials is known,
  // so the message must not suggest they were wrong.
  if (
    e.name === "AuthRetryableFetchError" ||
    /failed to fetch|networkerror|network request failed|load failed/.test(text)
  ) {
    return {
      title: "Could not reach the sign-in service",
      description:
        "Your details were not sent. Check your internet connection and try again — if other sites work, the server may be down for a moment.",
    };
  }

  if (/email_not_confirmed|email not confirmed/.test(text)) {
    return {
      title: "This email has not been confirmed yet",
      description:
        "Open the confirmation link in the email we sent when the account was set up. If you cannot find it, check your spam folder or ask the church office to send it again.",
    };
  }

  if (/user_banned|user_disabled|banned/.test(text)) {
    return {
      title: "This account is not active",
      description:
        "Its access has been turned off. The church office can tell you why and turn it back on.",
    };
  }

  if (status === 429 || /over_request_rate_limit|rate limit|too many requests/.test(text)) {
    return {
      title: "Too many attempts",
      description:
        "For safety, sign-in is paused for a short while after several failed tries. Wait about a minute and try again.",
      link: FORGOT,
    };
  }

  if (/signup_disabled|email_provider_disabled|provider is not enabled/.test(text)) {
    return {
      title: "Sign-in by password is turned off",
      description:
        "This is a setting on the account, not something you did wrong. Ask an administrator to look at it.",
    };
  }

  // The ordinary one, and the reason this file exists. Wrong password, wrong
  // address, or no account — kept together on purpose (see the docblock).
  if (/invalid_credentials|invalid login credentials|invalid grant/.test(text) || status === 400) {
    return {
      title: "Wrong email or password",
      description:
        "We could not sign you in with those details. Check the address for a typo and re-type the password — if it was copied from an email, copy it again without any spaces around it. Accounts are created by the church office, so if you have never been given a password, ask them for one.",
      link: FORGOT,
    };
  }

  // Unmapped. The raw message goes on the screen rather than a soothing
  // generic: a member who can quote it to the office is better off than one who
  // can only say "it did not work".
  return {
    title: "Sign in failed",
    description:
      message.trim() ||
      "Something went wrong and no reason was given. Try again, and tell the church office if it keeps happening.",
  };
}
