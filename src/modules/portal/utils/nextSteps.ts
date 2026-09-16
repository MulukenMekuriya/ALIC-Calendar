/**
 * "Is there anything waiting on me?"
 *
 * The portal's front page could answer six questions about the past and none
 * about the present. This works out the short list of things a member could
 * usefully do right now, from data the page has already fetched — there is no
 * extra round trip behind any of it.
 *
 * Pure on purpose: no React, no Supabase, and the date is an argument rather
 * than a call to `new Date()`, so the "is last year's statement ready" rule
 * can be tested without waiting for January.
 *
 * TWO RULES THIS FOLLOWS, AND THEY ARE THE WHOLE DESIGN
 * ----------------------------------------------------
 *
 * 1. AN ITEM EARNS ITS PLACE BY BEING ACTIONABLE. Every step below names
 *    something the member can actually do — a tab to open, a form to fill, a
 *    statement to print. "Your household has no address on file" is a fact
 *    about the office's records, not a task for the member, and is not here.
 *
 * 2. AT MOST ONE INVITATION AT A TIME. Three of these — serve somewhere, join
 *    a group, add your family — are invitations rather than tasks. A page that
 *    lists all three at once stops reading as "here is what is waiting on you"
 *    and starts reading as a list of ways the member is falling short of what
 *    the church wants. So `offer` items are capped at one, the first that
 *    applies, and the order below is the order of how easy each is to say yes
 *    to. Nobody is nagged about three things on a Sunday afternoon.
 */

export type NextStepTone =
  /** Someone else is waiting. Overdue, and shown in the destructive colour. */
  | "attention"
  /** A task with a clear end: fill this in, print that. */
  | "todo"
  /** An invitation. Capped at one — see rule 2. */
  | "offer";

export interface NextStep {
  /** Stable across renders; used as the React key and in tests. */
  id: string;
  tone: NextStepTone;
  title: string;
  detail: string;
  /** Which portal tab answers it. `undefined` when the card acts in place. */
  tab?: string;
  actionLabel: string;
}

export interface NextStepInputs {
  linked: boolean;
  phone: string | null | undefined;
  email: string | null | undefined;
  householdSize: number | null | undefined;
  servingCount: number | null | undefined;
  groupCount: number | null | undefined;
  /** church.my_children, for the grade check. */
  children: { display_name: string; grade_name: string | null }[];
  /** church.my_giving_years — used only for "last year's statement is ready". */
  givingYears: { tax_year: number }[];
  /** church.my_workflow_cards. Empty for the great majority of members. */
  cards: { is_overdue: boolean }[];
  /** Injected so the January rule is testable in July. */
  today: Date;
}

/** English for a count of things, without a bare "1 people". */
function plural(count: number, one: string, many: string): string {
  return count === 1 ? `${count} ${one}` : `${count} ${many}`;
}

/** "Selam", "Selam and Dawit", "Selam, Dawit and Hana". */
export function joinNames(names: string[]): string {
  if (names.length === 0) return "";
  if (names.length === 1) return names[0];
  return `${names.slice(0, -1).join(", ")} and ${names[names.length - 1]}`;
}

export function buildNextSteps(input: NextStepInputs): NextStep[] {
  // An unlinked login has no member record to have anything waiting on it.
  // The page shows its own "not linked yet" panel instead.
  if (!input.linked) return [];

  const tasks: NextStep[] = [];
  const offers: NextStep[] = [];

  /* ------------------------------------------------------------------ *
   * Someone else is waiting                                            *
   * ------------------------------------------------------------------ */
  const overdue = input.cards.filter((c) => c.is_overdue).length;
  if (overdue > 0) {
    tasks.push({
      id: "followups-overdue",
      tone: "attention",
      title: `${plural(overdue, "follow-up is", "follow-ups are")} past due`,
      detail:
        "These are people the church asked you to call, and the date has gone by.",
      tab: "followups",
      actionLabel: "Open follow-ups",
    });
  } else if (input.cards.length > 0) {
    tasks.push({
      id: "followups-open",
      tone: "todo",
      title: `${plural(input.cards.length, "person is", "people are")} on your follow-up list`,
      detail: "Nothing overdue. A note or a phone call moves a card on.",
      tab: "followups",
      actionLabel: "Open follow-ups",
    });
  }

  /* ------------------------------------------------------------------ *
   * Things only the member can fix                                     *
   * ------------------------------------------------------------------ */
  //
  // Phone before email, and only one of the two even when both are missing.
  // The office reaches people by telephone; a member who has just been asked
  // for two things does the first and leaves the second, so ask for the one
  // that matters.
  if (!input.phone?.trim()) {
    tasks.push({
      id: "no-phone",
      tone: "todo",
      title: "We have no phone number for you",
      detail:
        "It is how the office reaches you, and how the check-in desk reaches a parent mid-service.",
      tab: "details",
      actionLabel: "Add your number",
    });
  } else if (!input.email?.trim()) {
    tasks.push({
      id: "no-email",
      tone: "todo",
      title: "We have no email address on your member record",
      detail: "Your year-end giving statement is sent to it.",
      tab: "details",
      actionLabel: "Add your email",
    });
  }

  /* ------------------------------------------------------------------ *
   * Last year's statement                                              *
   * ------------------------------------------------------------------ */
  //
  // Only once the year is actually over. A statement for a year still running
  // is not a statement, it is a running total, and the giving tab already
  // shows that. The most common telephone call the office takes in January is
  // "can you send me my statement again"; this is the answer to it.
  const lastClosedYear = input.givingYears
    .map((y) => y.tax_year)
    .filter((year) => year < input.today.getFullYear())
    .sort((a, b) => b - a)[0];

  if (lastClosedYear !== undefined) {
    tasks.push({
      id: `statement-${lastClosedYear}`,
      tone: "todo",
      title: `Your ${lastClosedYear} giving statement is ready`,
      detail: "Print it or save it as a PDF, without telephoning the office.",
      tab: "giving",
      actionLabel: "Get the statement",
    });
  }

  /* ------------------------------------------------------------------ *
   * Children the desk knows by name but not by grade                   *
   * ------------------------------------------------------------------ */
  //
  // A missing grade is the thing that slows a queue on Sunday morning: the
  // desk cannot pick a room without one, so it asks, and the family behind
  // waits. The member cannot set it themselves — school_grade_id is not in
  // the member edit path — so this names the desk rather than pretending
  // there is a form.
  const noGrade = input.children.filter((c) => !c.grade_name).map((c) => c.display_name);
  if (noGrade.length > 0) {
    tasks.push({
      id: "children-no-grade",
      tone: "todo",
      title: `We do not have a grade for ${joinNames(noGrade)}`,
      detail:
        "The check-in desk needs it to pick a room. Mention it next Sunday and it is a ten-second fix.",
      tab: "children",
      actionLabel: "See my children",
    });
  }

  /* ------------------------------------------------------------------ *
   * Invitations — at most one reaches the page                         *
   * ------------------------------------------------------------------ */
  if ((input.servingCount ?? 0) === 0) {
    offers.push({
      id: "not-serving",
      tone: "offer",
      title: "You are not recorded as serving anywhere",
      detail:
        "If you already help with something, the office can record it — it is how rotas and thank-yous find you.",
      tab: "details",
      actionLabel: "My details",
    });
  }

  if ((input.groupCount ?? 0) === 0) {
    offers.push({
      id: "no-group",
      tone: "offer",
      title: "You are not in a home cell or study",
      detail: "There is one most evenings of the week, and they are how a big church gets small.",
      tab: "overview",
      actionLabel: "What is on",
    });
  }

  if ((input.householdSize ?? 0) <= 1) {
    offers.push({
      id: "household-of-one",
      tone: "offer",
      title: "Only you are recorded in your household",
      detail:
        "If your family worships here too, the office can put you on one record — and their check-ins appear here.",
      tab: "household",
      actionLabel: "See my household",
    });
  }

  return [...tasks, ...offers.slice(0, 1)];
}
