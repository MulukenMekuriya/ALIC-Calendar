/**
 * The database's refusals, said to the person who tripped them.
 *
 * Every write the portal makes goes through a SECURITY DEFINER function that
 * raises a bare code — `child_not_in_your_household`, `not_your_assignment` —
 * because a database error is a thing programmers read. A member reading
 * "ask_the_office_to_end_a_leadership_role" in a red box learns that the
 * software is annoyed with them and nothing else.
 *
 * Two rules for what is written here.
 *
 *  - SAY WHAT TO DO NEXT. Nearly every refusal below has a human remedy —
 *    ring the office, ask at the desk — and the sentence is not finished until
 *    it names one.
 *  - NEVER BLAME THE MEMBER for a boundary they could not have known about.
 *    "You may not edit that" reads as an accusation; "that one is kept by the
 *    church office" reads as how the church works, which is what it is.
 *
 * Matched on substrings rather than parsed, because PostgREST hands the
 * browser the message with its own framing around it, and the shape of that
 * framing is not a contract.
 */

const EXPLANATIONS: [RegExp, string][] = [
  [
    /ask_the_office_to_end_a_leadership_role/,
    "You are recorded as leading this one, and a leader stepping down is not a change this form makes on its own. The church office can do it.",
  ],
  [
    /already_recorded_in_this_(ministry|group)_today/,
    "Today is already covered by an earlier record. Try again tomorrow, or ask the office to sort it out now.",
  ],
  [
    /child_not_in_your_household/,
    "That child is not in your household, so their record is not yours to change. The check-in desk can put it right.",
  ],
  [
    /members_may_only_edit_their_children/,
    "Only a child's record can be changed here. An adult edits their own details from My details.",
  ],
  [
    /not_your_household/,
    "That household is not one you live in. Speak to the church office if that is wrong.",
  ],
  [
    /not_your_(assignment|membership)/,
    "That record belongs to somebody else, so it cannot be changed from here.",
  ],
  [
    /no_member_record_for_this_login|not_your_branch|not_permitted/,
    "Your login is not connected to a member record in this branch yet. An administrator can link it.",
  ],
  [
    /ministry_not_open_for_serving/,
    "That ministry is not taking sign-ups here. The church office can add you to it.",
  ],
  [
    /grade_belongs_to_another_branch/,
    "That school grade belongs to another branch. Pick one from the list.",
  ],
  [/first_name_required/, "A first name is needed."],
  [/last_name_required/, "A last name is needed."],
  [/household_name_required/, "The household needs a name."],
  [
    /uq_households_org_name/,
    "Another family is already recorded under that name. Try adding a street or a first name to tell them apart.",
  ],
  [
    /chk_people_month_needs_year/,
    "A birth month needs a birth year as well, otherwise it cannot be turned into an age.",
  ],
  [
    /no_serving_role_configured/,
    "This branch has no ordinary serving role set up yet, so nobody can be added. The church office can fix that in the settings.",
  ],
  [
    /unknown_field/,
    "Something on this form is not a field the church keeps. Nothing was saved.",
  ],
  [
    /not_authenticated/,
    "You have been signed out. Sign in again and the change will save.",
  ],
];

export function sayWhyNot(error: unknown): string {
  const message = error instanceof Error ? error.message : String(error);

  for (const [pattern, sentence] of EXPLANATIONS) {
    if (pattern.test(message)) return sentence;
  }

  // Unmapped. The raw message is shown rather than a soothing generic one: a
  // member who can quote it to the office is better off than one who can only
  // say "it did not work".
  return message;
}
