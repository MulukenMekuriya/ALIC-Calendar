/**
 * What a form actually changed, in the shape the portal's RPCs expect.
 *
 * church.update_my_household and church.update_my_child both read a patch the
 * same way church.update_person_details does: an ABSENT key means "leave this
 * alone", and a key set to null means "clear it". Posting the whole form would
 * therefore overwrite every field the form does not render — the household
 * form shows no `notes`, and sending one would be refused, but the child form
 * shows no membership status and quietly blanking one would not be.
 *
 * So the rule is: send the difference, never the document.
 *
 * Pulled out of the two dialogs rather than written twice, because the two
 * halves that are easy to get wrong — "" means null, and a numeric column must
 * not arrive as a string — are exactly the halves that would drift.
 */

import type { PortalPatch } from "../types";

/** Every value a string, so the inputs stay controlled. */
export type Draft = Record<string, string>;

export function changedFields(
  original: Draft,
  draft: Draft,
  numericKeys: readonly string[] = []
): PortalPatch {
  const patch: PortalPatch = {};

  for (const key of Object.keys(draft)) {
    if (draft[key] === original[key]) continue;

    const value = draft[key].trim();
    if (value === "") {
      // An emptied field clears the column. This is the branch that makes the
      // diff worth doing: without it, "" would be stored as an empty string
      // for some columns and refused by NOT NULL on others.
      patch[key] = null;
      continue;
    }

    patch[key] = numericKeys.includes(key) ? Number(value) : value;
  }

  return patch;
}

/** Nothing to save — the dialogs close rather than make a pointless round trip. */
export function isEmptyPatch(patch: PortalPatch): boolean {
  return Object.keys(patch).length === 0;
}
