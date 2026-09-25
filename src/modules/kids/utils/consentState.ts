/**
 * Turning six consent states into sentences.
 *
 * SIX STATES AND NOT A BOOLEAN, because collapsing them is what produces a
 * screen that tells a family who signed last month that they have never
 * signed. Each state has a different remedy, so each needs a different
 * sentence.
 *
 * TWO AUDIENCES, AND THEY ARE NOT TOLD THE SAME THING.
 *
 * A parent is told the truth about their own family, including that their
 * child's consent is held by a household they cannot see — because without
 * that they would sit looking at a form that says "not signed" for a child
 * they signed for, with no way to make sense of it.
 *
 * A volunteer at a check-in desk is told only whether the child may be
 * checked in. `covered_elsewhere` reads as plain "on file" to them. That is
 * deliberate: a child whose consent lives with a different household is
 * usually a child whose parents have separated, and a volunteer must not
 * learn a custody history from a check-in screen. The server enforces the
 * same rule — the desk calls child_consent_state with no household and is
 * given 'covered' — so this is defence in depth rather than the only guard.
 */

export type ConsentState =
  | "covered"
  | "covered_elsewhere"
  | "consent_out_of_date"
  | "child_not_on_signature"
  | "revoked"
  | "no_signature"
  | "no_household";

export const CONSENT_STATES: ConsentState[] = [
  "covered",
  "covered_elsewhere",
  "consent_out_of_date",
  "child_not_on_signature",
  "revoked",
  "no_signature",
  "no_household",
];

/** Does this state permit check-in when the policy is enforcing? */
export function isCovered(state: ConsentState): boolean {
  return state === "covered" || state === "covered_elsewhere";
}

/**
 * Whether the signed form still matches the medical record.
 *
 * `resignDueBy` is set from the moment a parent changes a child's medical
 * information, and the child stays COVERED until the date passes. That is
 * deliberate and it is the important part: a parent who reports a new allergy
 * on a Saturday evening must not find their child refused on Sunday morning,
 * or they learn not to tell us. The classroom tag already carries the change.
 */
export function resignStatus(
  resignDueBy: string | null | undefined,
  today: Date,
): { stale: boolean; daysLeft: number | null; overdue: boolean } {
  if (!resignDueBy) return { stale: false, daysLeft: null, overdue: false };
  const due = new Date(`${resignDueBy}T00:00:00`);
  if (Number.isNaN(due.getTime())) return { stale: false, daysLeft: null, overdue: false };
  const start = new Date(today.getFullYear(), today.getMonth(), today.getDate());
  const daysLeft = Math.round((due.getTime() - start.getTime()) / 86_400_000);
  return { stale: true, daysLeft, overdue: daysLeft < 0 };
}

export interface FamilyMessage {
  /** Drives the badge colour. Never the only carrier of meaning. */
  tone: "ok" | "attention" | "blocked";
  headline: string;
  body: string;
  /** The button, when there is something the family can do about it. */
  action: string | null;
}

/**
 * What a parent is told, in the church's voice: plain, warm, no exclamation
 * marks, nothing that reads like a penalty notice.
 */
export function familyMessage(state: ConsentState, childName: string): FamilyMessage {
  switch (state) {
    case "covered":
      return {
        tone: "ok",
        headline: "Signed and on file",
        body: `We have your consent form for ${childName}. It stays in effect until you tell us otherwise.`,
        action: null,
      };

    case "covered_elsewhere":
      return {
        tone: "ok",
        headline: "Signed and on file",
        body:
          `We have a consent form covering ${childName}, signed with another household. ` +
          `It is still in effect and nothing is needed today. If you would like a copy in your own ` +
          `name, you are welcome to fill the form in again here.`,
        action: "Fill in the form again",
      };

    case "consent_out_of_date":
      // They DID sign, and they DID tell us about the change. What is left is
      // paperwork, and the copy should sound like paperwork rather than like
      // a family who did something wrong.
      return {
        tone: "attention",
        headline: "The form needs filling in again",
        body:
          `You told us about a change to ${childName}'s medical information, and the consent ` +
          `form we hold was signed before that, so the two no longer match. Filling it in once ` +
          `more puts them back together — everything you told us before is already there. ` +
          `Until it is done, one of our team will ask you to do it at the desk before ` +
          `${childName} goes to a classroom.`,
        action: "Fill in the form",
      };

    case "child_not_on_signature":
      // The family HAS signed. Saying "you have not signed" here is the exact
      // mistake the six states exist to prevent.
      return {
        tone: "attention",
        headline: "One more name to add",
        body:
          `Your family has filled in the consent form, but ${childName} was not named on it — ` +
          `usually because they joined us after it was signed. Filling it in once more, with all ` +
          `of your children on it, is all that is needed.`,
        action: "Fill in the form",
      };

    case "revoked":
      return {
        tone: "attention",
        headline: "Consent withdrawn",
        body:
          `The consent form covering ${childName} has been withdrawn. If that was not what you ` +
          `meant to happen, or if you would like to give it again, the form is here whenever you ` +
          `are ready.`,
        action: "Fill in the form",
      };

    case "no_signature":
      return {
        tone: "attention",
        headline: "Consent form not yet filled in",
        body:
          `We do not have a consent and medical release form for ${childName} yet. It takes a ` +
          `couple of minutes, and it is how our volunteers know who to call and what to do if ` +
          `${childName} needs anything on a Sunday morning.`,
        action: "Fill in the form",
      };

    case "no_household":
      // Refusing without naming the remedy is how a family ends up standing
      // at a desk with nothing to do next.
      return {
        tone: "blocked",
        headline: "We need a parent or guardian on file first",
        body:
          `We do not have a parent or guardian recorded for ${childName}, and a consent form ` +
          `without one is not a consent. Please come and find any of the Kids Ministry team and ` +
          `we will put that right in a moment.`,
        action: null,
      };
  }
}

export interface DeskMessage {
  tone: "ok" | "attention" | "blocked";
  /** Short enough for a row on a tablet. */
  label: string;
  /** What the volunteer should do. Never why. */
  hint: string | null;
}

/**
 * What a volunteer at the desk is told.
 *
 * Note what is absent from every branch: any mention of another household,
 * another signer, or a withdrawal. A volunteer needs to know whether to check
 * a child in, not a family's history.
 */
export function deskMessage(state: ConsentState): DeskMessage {
  switch (state) {
    case "covered":
    case "covered_elsewhere":
      // Deliberately identical. See the module comment.
      return { tone: "ok", label: "Consent on file", hint: null };

    case "consent_out_of_date":
    case "child_not_on_signature":
    case "revoked":
    case "no_signature":
      // One label for all four. A volunteer needs to know that a form is
      // wanted, not which of four reasons produced it — and three of the four
      // would tell them something about the family that is none of their
      // business.
      return {
        tone: "attention",
        label: "Consent form needed",
        hint: "The family can fill it in here, or in My Church at home.",
      };

    case "no_household":
      return {
        tone: "blocked",
        label: "No parent or guardian on file",
        hint: "Please see a Kids Ministry leader.",
      };
  }
}
