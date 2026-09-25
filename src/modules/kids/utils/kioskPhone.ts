/**
 * The kiosk's phone entry, as pure functions.
 *
 * Its own module because the ten-digit rule is a CHILD-SAFETY rule, not a
 * formatting preference. The staffed desk searches on three characters across
 * name and phone; on an unattended lobby device that would be a browsable
 * directory of the congregation's children. Ten digits or nothing is what
 * stops it, and a rule that matters that much is worth testing away from the
 * component that happens to render it.
 *
 * The server enforces the same thing and is the authority. This is here so a
 * parent is told before they tap, not after.
 */

/** Digits only, capped at ten, for keypad entry. */
export function appendDigit(current: string, digit: string): string {
  if (!/^[0-9]$/.test(digit)) return current;
  return (current + digit).slice(0, 10);
}

export function removeDigit(current: string): string {
  return current.slice(0, -1);
}

/** Can this be searched on? Exactly ten digits, never fewer. */
export function isSearchable(digits: string): boolean {
  return /^[0-9]{10}$/.test(digits);
}

/**
 * (301) 555-0123 as it is typed, so a parent can check their own number
 * against the one in their head.
 */
export function formatPhone(digits: string): string {
  if (digits.length === 0) return "";
  if (digits.length <= 3) return `(${digits}`;
  if (digits.length <= 6) return `(${digits.slice(0, 3)}) ${digits.slice(3)}`;
  return `(${digits.slice(0, 3)}) ${digits.slice(3, 6)}-${digits.slice(6)}`;
}

/**
 * The last ten digits of anything a parent might paste or a record might
 * hold: +1, dashes, brackets, spaces, a leading country code.
 *
 * Matches church.kiosk_find_household_by_phone exactly. If these two ever
 * disagree, a parent whose number the server would find is told it does not
 * exist — which reads as "the church has lost my record".
 */
export function normalisePhone(raw: string): string {
  return raw.replace(/\D/g, "").slice(-10);
}
