/**
 * Who the check-out screen offers first.
 *
 * The person who dropped the children off this morning is overwhelmingly the
 * person collecting them, and the database has recorded it since check-in
 * shipped without anything ever reading it back. Offering them first saves a
 * volunteer hunting through a list in which two people can have the same
 * name.
 *
 * THREE RULES, and the last two are why this is its own tested function
 * rather than a line in a component.
 *
 * 1. ONLY SOMEBODY ALREADY ON THE LIST. The candidates are the intersection
 *    of who may collect every selected child; a default is chosen from that
 *    set and can never widen it.
 *
 * 2. ALL THE CHILDREN, OR NOBODY. If a mother brought one child and a father
 *    the other, there is no single right answer and guessing one would put a
 *    name in front of a volunteer that is wrong for half the family. Two
 *    droppers means no default.
 *
 * 3. NEVER WHEN A CHILD HAS A PICKUP RESTRICTION. Those are custody records.
 *    A screen that pre-fills a name in that situation is inviting somebody to
 *    tap through the one case that most needs a person to stop and read.
 */

import type { PickupCandidate } from "./checkInMachine";

/**
 * @param lists one candidate list per selected child, as returned per check-in
 * @param candidates the intersection already computed for the whole selection
 * @returns the person_id to pre-select, or null to leave it blank
 */
export function defaultCollector(
  lists: PickupCandidate[][],
  candidates: PickupCandidate[],
): string | null {
  if (lists.length === 0 || candidates.length === 0) return null;

  // Rule 3: a restriction anywhere in the family means no default at all.
  if (candidates.some((c) => c.child_has_restriction)) return null;
  if (lists.some((l) => l.some((c) => c.child_has_restriction))) return null;

  // Rule 2: the same person must have brought every one of them.
  const perChild = lists.map((l) => l.find((c) => c.dropped_off)?.person_id ?? null);
  if (perChild.some((id) => id === null)) return null;

  const first = perChild[0];
  if (!perChild.every((id) => id === first)) return null;

  // Rule 1: and they must still be someone who may collect all of them.
  return candidates.some((c) => c.person_id === first) ? first : null;
}
