/**
 * How many Sundays are left to collect signatures in.
 *
 * Its own module because the off-by-one here is the kind that quietly costs a
 * church a Sunday: the enforcement date is the FIRST ENFORCED service, not
 * another chance to collect. A family arriving on that morning without a form
 * is a family being turned away, so the target Sunday must not be counted as
 * one of the Sundays still available.
 *
 * `today` is a parameter rather than a call to `new Date()` inside, so the
 * arithmetic is testable without freezing a clock.
 */

const DAY_MS = 86_400_000;

/**
 * Sundays strictly between `today` and `enforceFrom`, inclusive of a Sunday
 * that falls today and exclusive of the enforcement date itself.
 *
 * Returns 0 for a date in the past, for today, and for an unparseable one —
 * a card that cannot work out the date should say "none left", which is the
 * conservative direction. Claiming Sundays the church does not have is the
 * expensive way to be wrong.
 */
export function sundaysBefore(enforceFrom: string, today: Date): number {
  const target = new Date(`${enforceFrom}T00:00:00`);
  if (Number.isNaN(target.getTime())) return 0;

  const start = new Date(today.getFullYear(), today.getMonth(), today.getDate());
  const end = new Date(target.getFullYear(), target.getMonth(), target.getDate());
  if (end <= start) return 0;

  let count = 0;
  for (let t = start.getTime(); t < end.getTime(); t += DAY_MS) {
    if (new Date(t).getDay() === 0) count++;
  }
  return count;
}

/**
 * Signatures per Sunday needed to finish in time.
 *
 * Returns null when there is no meaningful answer — nothing left to collect,
 * or no Sundays left to collect it in. A null is rendered as an absent line
 * rather than as "Infinity a Sunday", which is true and useless.
 */
export function signaturesPerSunday(
  householdsLeft: number,
  sundaysLeft: number,
): number | null {
  if (householdsLeft <= 0) return null;
  if (sundaysLeft <= 0) return null;
  return Math.ceil(householdsLeft / sundaysLeft);
}
